'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isRegistrationApproverRole, normalizeAppRole } from '../../../../../lib/roles'
import { supabase } from '@/src/lib/supabaseClient'

type CategoryItem = {
  id: string
  label: string
  year: number
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  capacity?: number | null
  approved_filled?: number
  pending_filled?: number
  filled?: number
  remaining?: number | null
  is_full?: boolean
  enabled?: boolean
}

type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type PaymentFilter = 'ALL' | 'NO_PAYMENT' | PaymentStatus
type AttendanceStatus = 'UNCONFIRMED' | 'ATTENDING' | 'NOT_ATTENDING'
type AttendanceFilter =
  | 'ALL'
  | 'ATTENDING'
  | 'NOT_ATTENDING'
  | 'UNCONFIRMED'
  | 'CHECKED_IN'
  | 'NOT_CHECKED_IN'
  | 'GOODIE_BAG_COLLECTED'
  | 'GOODIE_BAG_NOT_COLLECTED'

type RegistrationItem = {
  id: string
  official_rider_id?: string | null
  rider_name: string
  rider_nickname?: string | null
  jersey_size?: string | null
  date_of_birth: string
  gender: 'BOY' | 'GIRL'
  club: string | null
  primary_category_id: string | null
  extra_category_id: string | null
  extra_category_ids?: string[] | null
  requested_plate_number: string | null
  requested_plate_suffix: string | null
  photo_url?: string | null
  price: number
  status: string
}

type RegistrationPayment = {
  id: string
  proof_url: string
  amount: number
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  status: PaymentStatus
}

type RegistrationDocument = {
  id: string
  registration_item_id: string | null
  document_type: string
  file_url: string
}

type RegistrationRow = {
  id: string
  registration_code?: string | null
  community_name: string | null
  contact_name: string
  contact_phone: string
  contact_email: string | null
  status: RegistrationStatus
  total_amount: number
  notes: string | null
  created_at: string
  attendance_status?: AttendanceStatus | null
  attendance_confirmed_at?: string | null
  checked_in_at?: string | null
  goodie_bag_collected_at?: string | null
  registration_items: RegistrationItem[]
  registration_payments: RegistrationPayment[]
  registration_documents: RegistrationDocument[]
}

type RegistrationListResponse = {
  data: RegistrationRow[]
  meta?: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

type AttendanceSummary = {
  approved: number
  confirmed_attending: number
  confirmed_not_attending: number
  unconfirmed: number
  checked_in: number
  goodie_bag_collected: number
}

type AttendanceSummaryResponse = {
  data?: AttendanceSummary
}

type EventSettingsResponse = {
  data?: {
    event_logo_url?: string | null
    display_theme?: Record<string, unknown> | null
    business_settings?: {
      public_brand_name?: string | null
      registration_rider_photo_enabled?: boolean | null
      whatsapp_group_invite_url?: string | null
    } | null
  } | null
}

type EventBrandingState = {
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  headerBg: string
  cardBg: string
  brandName: string | null
}

type RiderExportItem = {
  id: string
  name: string
  rider_nickname?: string | null
  jersey_size?: string | null
  date_of_birth: string
  birth_year?: number | null
  gender: 'BOY' | 'GIRL'
  plate_number: string
  plate_suffix?: string | null
  no_plate_display: string
  club?: string | null
}

type ExportCategorySummary = {
  id: string
  label: string
  capacity: number | null
  filled: number
  remaining: number | null
  status: 'PENUH' | 'TERSEDIA' | 'TANPA BATAS'
}

type ExportCategoryGroup = {
  summary: ExportCategorySummary
  rows: RiderExportItem[]
}

type PlateCheckResponse = {
  data?: {
    available: boolean
    status: 'available' | 'needs_suffix' | 'suffix_taken'
    display_value: string
    suggested_suffix: string | null
    used_suffixes: string[]
    message: string
  }
}

type ApprovalResponse = {
  ok?: boolean
  alreadySent?: boolean
  message?: string
  email?: {
    status: 'sent' | 'skipped' | 'failed'
    id?: string
    reason?: string
  } | null
}

type PlateCheckState = {
  state: 'idle' | 'checking' | 'available' | 'needs_suffix' | 'suffix_taken' | 'duplicate' | 'invalid' | 'error'
  message: string
  suggestedSuffix: string | null
}

type ModalState =
  | { type: 'approve'; registration: RegistrationRow }
  | { type: 'reject'; registration: RegistrationRow }
  | { type: 'delete'; registration: RegistrationRow }
  | { type: 'contact'; registration: RegistrationRow }
  | { type: 'upclass'; registration: RegistrationRow; item: RegistrationItem }
  | null

type FeedbackState = { type: 'success' | 'error' | 'info'; message: ReactNode } | null
type InlineFeedbackState = { type: 'success' | 'error'; message: string }
type ContactFormState = {
  contact_name: string
  contact_phone: string
  contact_email: string
  community_name: string
}
type UpclassFormState = {
  category_ids: string[]
  notes: string
}

const STATUS_OPTIONS: Array<{ value: 'ALL' | RegistrationStatus; label: string }> = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

const PAYMENT_FILTER_OPTIONS: Array<{ value: PaymentFilter; label: string }> = [
  { value: 'ALL', label: 'Semua Pembayaran' },
  { value: 'NO_PAYMENT', label: 'Belum Upload Bukti' },
  { value: 'PENDING', label: 'Menunggu Review' },
  { value: 'APPROVED', label: 'Pembayaran Approved' },
  { value: 'REJECTED', label: 'Pembayaran Rejected' },
]

const ATTENDANCE_FILTER_OPTIONS: Array<{ value: AttendanceFilter; label: string }> = [
  { value: 'ALL', label: 'Semua Kehadiran' },
  { value: 'ATTENDING', label: 'Akan Hadir' },
  { value: 'NOT_ATTENDING', label: 'Tidak Hadir' },
  { value: 'UNCONFIRMED', label: 'Belum Konfirmasi' },
  { value: 'CHECKED_IN', label: 'Sudah Check-in' },
  { value: 'NOT_CHECKED_IN', label: 'Belum Check-in' },
  { value: 'GOODIE_BAG_COLLECTED', label: 'Goodie Bag Diambil' },
  { value: 'GOODIE_BAG_NOT_COLLECTED', label: 'Goodie Bag Belum Diambil' },
]

const PAGE_SIZE_OPTIONS = [5, 10, 20, 30]

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const getSessionToken = async () => {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) return data.session.access_token
  const refreshed = await supabase.auth.refreshSession()
  return refreshed.data.session?.access_token ?? null
}

const apiFetch = async <T = unknown>(url: string, options: RequestInit = {}, retryUnauthorized = true): Promise<T> => {
  const token = await getSessionToken()
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options.headers ?? {}) as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...options, headers })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && retryUnauthorized) {
      return apiFetch<T>(url, options, false)
    }
    if (res.status === 401) {
      throw new Error('Session login habis. Silakan login ulang.')
    }
    throw new Error(json?.error || 'Request failed')
  }
  return json as T
}

const buildPlateDisplay = (number: string | null | undefined, suffix: string | null | undefined) => {
  const safeNumber = String(number ?? '').replace(/[^\d]/g, '')
  const safeSuffix = String(suffix ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 1)
  return `${safeNumber}${safeSuffix}`
}

const aggregatePaymentStatus = (payments: RegistrationPayment[]) => {
  if (!payments.length) return 'NO_PAYMENT' as const
  if (payments.some((payment) => payment.status === 'APPROVED')) return 'APPROVED' as const
  if (payments.some((payment) => payment.status === 'PENDING')) return 'PENDING' as const
  if (payments.some((payment) => payment.status === 'REJECTED')) return 'REJECTED' as const
  return 'NO_PAYMENT' as const
}

const registrationStatusBadge = (status: RegistrationStatus) => {
  if (status === 'APPROVED') return 'border-emerald-300 bg-emerald-100 text-emerald-900'
  if (status === 'REJECTED') return 'border-rose-300 bg-rose-100 text-rose-900'
  return 'border-amber-300 bg-amber-100 text-amber-900'
}

const paymentStatusBadge = (status: PaymentFilter | 'NO_PAYMENT') => {
  if (status === 'APPROVED') return 'border-emerald-300 bg-emerald-100 text-emerald-900'
  if (status === 'REJECTED') return 'border-rose-300 bg-rose-100 text-rose-900'
  if (status === 'NO_PAYMENT') return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-amber-300 bg-amber-100 text-amber-900'
}

const plateMessageTone = (state: PlateCheckState['state']) => {
  if (state === 'available') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (state === 'checking') return 'border-sky-200 bg-sky-50 text-sky-900'
  if (state === 'needs_suffix' || state === 'suffix_taken') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (state === 'duplicate' || state === 'invalid' || state === 'error') return 'border-rose-200 bg-rose-50 text-rose-900'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

const isPlateReady = (state: PlateCheckState | undefined) => state?.state === 'available'

const normalizeWhatsAppPhone = (value: string | null | undefined) => {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  if (digits.startsWith('8')) return `62${digits}`
  return digits
}

const normalizeExternalUrl = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const attendanceStatusLabel: Record<AttendanceStatus, string> = {
  UNCONFIRMED: 'Belum Konfirmasi',
  ATTENDING: 'Akan Hadir',
  NOT_ATTENDING: 'Tidak Hadir',
}

const getRegistrationStatusUrl = (registrationCode: string | null | undefined) => {
  const code = String(registrationCode ?? '').trim()
  return code ? `https://racepushbike.com/registration-status?code=${encodeURIComponent(code)}` : ''
}

const getAttendanceLabel = (registration: RegistrationRow) =>
  attendanceStatusLabel[registration.attendance_status ?? 'UNCONFIRMED']

const getVenueStatusLabel = (value: string | null | undefined, completeLabel: string, pendingLabel: string) =>
  value ? `${completeLabel} - ${formatDateTime(value)}` : pendingLabel

const getItemUpclassCategoryIds = (item: RegistrationItem) => {
  const ids = Array.isArray(item.extra_category_ids) ? item.extra_category_ids : []
  const normalized = ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  if (normalized.length > 0) return Array.from(new Set(normalized))
  return item.extra_category_id ? [item.extra_category_id] : []
}

const formatUpclassCategories = (item: RegistrationItem, categoryMap?: Map<string, string>) => {
  const labels = getItemUpclassCategoryIds(item).map((id) => categoryMap?.get(id) ?? id)
  return labels.length > 0 ? labels.join(', ') : '-'
}

const safeCssColor = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed
  if (/^(rgb|rgba|hsl|hsla)\([0-9%.,\s-]+\)$/i.test(trimmed)) return trimmed
  return fallback
}

const withHexAlpha = (value: string, alpha: string, fallback: string) =>
  /^#[0-9a-fA-F]{6}$/.test(value) ? `${value}${alpha}` : fallback

const escapeCssString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const buildWhatsAppRiderLines = (registration: RegistrationRow, categoryMap?: Map<string, string>) => {
  if (registration.registration_items.length === 0) return ['Rider: -']

  return registration.registration_items.flatMap((item, index) => {
    const primaryCategory = item.primary_category_id
      ? categoryMap?.get(item.primary_category_id) ?? item.primary_category_id
      : '-'
    const extraCategory = formatUpclassCategories(item, categoryMap)
    const plate = buildPlateDisplay(item.requested_plate_number, item.requested_plate_suffix) || '-'
    return [
      `${index + 1}. ${item.rider_name || '-'}`,
      `   Panggilan: ${item.rider_nickname || '-'}`,
      `   Komunitas: ${item.club || registration.community_name || '-'}`,
      `   Kategori Terdaftar: ${primaryCategory}`,
      `   Kategori Upclass: ${extraCategory}`,
      `   Plate: ${plate}`,
      `   Jersey: ${item.jersey_size || '-'}`,
      `   Biaya: ${formatRupiah(item.price || 0)}`,
    ]
  })
}

const buildWhatsAppMessage = (
  registration: RegistrationRow,
  kind: 'APPROVED' | 'REJECTED' | 'PAYMENT_REJECTED' | 'STATUS_ACCESS',
  whatsappGroupInviteUrl?: string | null,
  categoryMap?: Map<string, string>
) => {
  const riderNames = registration.registration_items
    .map((item) => item.rider_name?.trim())
    .filter((name): name is string => Boolean(name))
  const riderText = riderNames.length > 0 ? riderNames.join(', ') : 'rider'
  const total = formatRupiah(registration.total_amount)
  const whatsappGroupUrl = normalizeExternalUrl(whatsappGroupInviteUrl)
  const registrationCode = registration.registration_code?.trim() || ''
  const statusUrl = getRegistrationStatusUrl(registrationCode)
  const statusLines = registrationCode
    ? [
        `Kode registrasi: ${registrationCode}`,
        `Cek status & QR: ${statusUrl}`,
        'Masukkan nomor WhatsApp yang digunakan saat mendaftar.',
      ]
    : ['Kode registrasi belum tersedia. Silakan hubungi panitia.']

  if (kind === 'STATUS_ACCESS') {
    return [
      `Halo ${registration.contact_name},`,
      '',
      `Berikut akses status dan QR pendaftaran ${riderText}:`,
      ...statusLines,
      '',
      `Status registrasi: ${registration.status}`,
      `Konfirmasi kehadiran: ${getAttendanceLabel(registration)}`,
      getVenueStatusLabel(registration.checked_in_at, 'Sudah check-in', 'Belum check-in'),
      getVenueStatusLabel(registration.goodie_bag_collected_at, 'Goodie bag sudah diambil', 'Goodie bag belum diambil'),
      '',
      'Simpan kode atau QR tersebut untuk proses check-in di venue.',
      'Terima kasih.',
    ].join('\n')
  }

  if (kind === 'APPROVED') {
    return [
      `Halo ${registration.contact_name},`,
      '',
      `Pendaftaran ${riderText} telah dikonfirmasi oleh panitia.`,
      `Total pembayaran: ${total}`,
      'Status: Pendaftaran telah dikonfirmasi',
      ...statusLines,
      '',
      'Data rider:',
      ...buildWhatsAppRiderLines(registration, categoryMap),
      '',
      whatsappGroupUrl
        ? `Silakan bergabung ke grup WhatsApp event melalui link berikut:\n${whatsappGroupUrl}`
        : 'Silakan cek email untuk detail pendaftaran dan informasi grup WhatsApp event.',
      'Terima kasih.',
    ].join('\n')
  }

  if (kind === 'PAYMENT_REJECTED') {
    return [
      `Halo ${registration.contact_name},`,
      '',
      `Bukti pembayaran untuk pendaftaran ${riderText} belum dapat dikonfirmasi.`,
      ...statusLines,
      'Silakan cek email/catatan panitia lalu upload ulang bukti pembayaran yang benar.',
      '',
      'Terima kasih.',
    ].join('\n')
  }

  return [
    `Halo ${registration.contact_name},`,
    '',
    `Pendaftaran ${riderText} belum dapat dikonfirmasi oleh panitia.`,
    ...statusLines,
    'Silakan cek email/catatan panitia untuk informasi perbaikan data.',
    '',
    'Terima kasih.',
  ].join('\n')
}

const buildWhatsAppUrl = (
  registration: RegistrationRow,
  kind: 'APPROVED' | 'REJECTED' | 'PAYMENT_REJECTED' | 'STATUS_ACCESS',
  whatsappGroupInviteUrl?: string | null,
  categoryMap?: Map<string, string>
) => {
  const phone = normalizeWhatsAppPhone(registration.contact_phone)
  if (!phone || (kind === 'STATUS_ACCESS' && !registration.registration_code?.trim())) return ''
  return `https://wa.me/${phone}?text=${encodeURIComponent(
    buildWhatsAppMessage(registration, kind, whatsappGroupInviteUrl, categoryMap)
  )}`
}

function WhatsAppAction({
  registration,
  kind,
  className = '',
  label,
  whatsappGroupInviteUrl,
  categoryMap,
  onOpen,
}: {
  eventId: string
  registration: RegistrationRow
  kind: 'APPROVED' | 'REJECTED' | 'PAYMENT_REJECTED' | 'STATUS_ACCESS'
  className?: string
  label?: string
  whatsappGroupInviteUrl?: string | null
  categoryMap?: Map<string, string>
  onOpen?: () => void
}) {
  const href = buildWhatsAppUrl(registration, kind, whatsappGroupInviteUrl, categoryMap)
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className={`admin-success-button min-h-11 ${className}`}
    >
      {label ?? 'Kirim WA'}
    </a>
  )
}

function RegistrationListSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <section key={index} className="admin-card grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="admin-skeleton h-7 w-44" />
            <div className="admin-skeleton h-7 w-24 rounded-full" />
            <div className="admin-skeleton h-7 w-28 rounded-full" />
          </div>
          <div className="grid gap-2">
            <div className="admin-skeleton h-4 w-3/4" />
            <div className="admin-skeleton h-4 w-1/2" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="admin-skeleton h-16" />
            <div className="admin-skeleton h-16" />
            <div className="admin-skeleton h-16" />
          </div>
        </section>
      ))}
    </div>
  )
}

export default function RegistrationsClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [exportingRegistrationExcel, setExportingRegistrationExcel] = useState(false)
  const [exportingRiderExcel, setExportingRiderExcel] = useState(false)
  const [exportingRegistrationPdf, setExportingRegistrationPdf] = useState(false)
  const [exportingRiderPdf, setExportingRiderPdf] = useState(false)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [meta, setMeta] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 })
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [paymentFeedback, setPaymentFeedback] = useState<Record<string, InlineFeedbackState>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [plateInputs, setPlateInputs] = useState<Record<string, { number: string; suffix: string }>>({})
  const [plateChecks, setPlateChecks] = useState<Record<string, PlateCheckState>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [filterStatus, setFilterStatus] = useState<'ALL' | RegistrationStatus>('ALL')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('ALL')
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [refreshTick, setRefreshTick] = useState(0)
  const [modal, setModal] = useState<ModalState>(null)
  const [modalNotes, setModalNotes] = useState('')
  const [contactForm, setContactForm] = useState<ContactFormState>({
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    community_name: '',
  })
  const [upclassForm, setUpclassForm] = useState<UpclassFormState>({
    category_ids: [],
    notes: '',
  })
  const [showAttendanceSummary, setShowAttendanceSummary] = useState(false)
  const [showCategoryKpis, setShowCategoryKpis] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null)
  const [roleKey, setRoleKey] = useState<string | null>(null)
  const [riderPhotoUploadEnabled, setRiderPhotoUploadEnabled] = useState(true)
  const [whatsappGroupInviteUrl, setWhatsappGroupInviteUrl] = useState<string | null>(null)
  const [eventBranding, setEventBranding] = useState<EventBrandingState>({
    logoUrl: null,
    primaryColor: '#2ecc71',
    secondaryColor: '#111827',
    headerBg: '#eaf7ee',
    cardBg: '#ffffff',
    brandName: null,
  })

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.label])), [categories])
  const isRegistrationApprover = isRegistrationApproverRole(roleKey)
  const isCentralAdmin = roleKey === 'SUPER_ADMIN'
  const getValidUpclassCategories = useCallback(
    (item: RegistrationItem) => {
      const birthYear = Number(String(item.date_of_birth).slice(0, 4))
      if (!Number.isFinite(birthYear)) return []

      return categories
        .filter((category) => category.enabled !== false)
        .filter((category) => category.id !== item.primary_category_id)
        .filter((category) => category.gender === 'MIX' || category.gender === item.gender)
        .filter((category) => {
          const maxYear = category.year_max ?? category.year
          return typeof maxYear === 'number' && maxYear < birthYear
        })
    },
    [categories]
  )
  const categoryKpis = useMemo(
    () =>
      [...categories]
        .filter((category) => category.enabled !== false)
        .map((category) => {
          const capacity = typeof category.capacity === 'number' ? category.capacity : null
          const approvedFilled = typeof category.approved_filled === 'number' ? category.approved_filled : 0
          const pendingFilled = typeof category.pending_filled === 'number' ? category.pending_filled : 0
          const filled = typeof category.filled === 'number' ? category.filled : approvedFilled + pendingFilled
          const remaining =
            capacity == null ? null : typeof category.remaining === 'number' ? category.remaining : Math.max(0, capacity - filled)
          const isFull = Boolean(category.is_full) || (capacity != null && remaining === 0)
          const status = capacity == null ? 'Tanpa Batas' : isFull ? 'Penuh' : 'Tersedia'
          return {
            ...category,
            capacity,
            approvedFilled,
            pendingFilled,
            filled,
            remaining,
            isFull,
            status,
          }
        })
        .sort((a, b) => {
          if ((a.isFull ? 1 : 0) !== (b.isFull ? 1 : 0)) return (b.isFull ? 1 : 0) - (a.isFull ? 1 : 0)
          return (b.filled ?? 0) - (a.filled ?? 0)
        }),
    [categories]
  )
  const fullCategoryCount = useMemo(() => categoryKpis.filter((category) => category.isFull).length, [categoryKpis])
  const totalApprovedAcrossCategories = useMemo(
    () => categoryKpis.reduce((sum, category) => sum + (category.approvedFilled ?? 0), 0),
    [categoryKpis]
  )
  const totalPendingAcrossCategories = useMemo(
    () => categoryKpis.reduce((sum, category) => sum + (category.pendingFilled ?? 0), 0),
    [categoryKpis]
  )
  const exportBusy =
    loading ||
    exportingRegistrationExcel ||
    exportingRegistrationPdf ||
    exportingRiderExcel ||
    exportingRiderPdf
  const exportButtonLabel = exportingRegistrationExcel
    ? 'Menyiapkan Registrasi XLSX...'
    : exportingRegistrationPdf
    ? 'Menyiapkan Registrasi PDF...'
    : exportingRiderExcel
    ? 'Menyiapkan Rider XLSX...'
    : exportingRiderPdf
    ? 'Menyiapkan Rider PDF...'
    : 'Export Data'

  const applyAttendanceFilter = (value: AttendanceFilter) => {
    setAttendanceFilter(value)
    if (value !== 'ALL') setFilterStatus('APPROVED')
    setPage(1)
  }

  useEffect(() => {
    const loadRole = async () => {
      const { data } = await supabase.auth.getUser()
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (data.user?.app_metadata ?? {}) as Record<string, unknown>
      const role =
        (typeof meta.role === 'string' ? meta.role : null) ||
        (typeof appMeta.role === 'string' ? appMeta.role : null)
      setRoleKey(normalizeAppRole(role))
    }
    void loadRole()
  }, [])
  const totalFilledAcrossCategories = useMemo(
    () => categoryKpis.reduce((sum, category) => sum + (category.filled ?? 0), 0),
    [categoryKpis]
  )

  const resolveFileUrl = async (pathOrUrl: string) => {
    if (!pathOrUrl) return null
    if (pathOrUrl.startsWith('http')) return pathOrUrl
    const res = await apiFetch<{ data?: { signedUrl?: string | null } }>('/api/admin/storage/signed-url', {
      method: 'POST',
      body: JSON.stringify({ eventId, path: pathOrUrl }),
    })
    return res?.data?.signedUrl ?? null
  }

  const openFile = async (pathOrUrl: string) => {
    try {
      const url = await resolveFileUrl(pathOrUrl)
      if (!url) {
        setFeedback({ type: 'error', message: 'File tidak ditemukan.' })
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal membuka file.' })
    }
  }

  const getPlateDraft = useCallback((item: RegistrationItem) => ({
    number: (plateInputs[item.id]?.number ?? item.requested_plate_number ?? '').replace(/[^\d]/g, ''),
    suffix: (plateInputs[item.id]?.suffix ?? item.requested_plate_suffix ?? '').trim().toUpperCase().slice(0, 1),
  }), [plateInputs])

  const handlePlateChange = (itemId: string, field: 'number' | 'suffix', value: string) => {
    setPlateInputs((prev) => ({
      ...prev,
      [itemId]: {
        number: field === 'number' ? value.replace(/[^\d]/g, '') : prev[itemId]?.number ?? '',
        suffix: field === 'suffix' ? value.toUpperCase().slice(0, 1) : prev[itemId]?.suffix ?? '',
      },
    }))
  }

  const applySuggestedSuffix = (item: RegistrationItem, suggestedSuffix: string) => {
    const current = getPlateDraft(item)
    setPlateInputs((prev) => ({
      ...prev,
      [item.id]: {
        number: current.number,
        suffix: suggestedSuffix,
      },
    }))
  }

  const getDocsByItem = (registration: RegistrationRow) => {
    const docsByItem = new Map<string, RegistrationDocument[]>()
    for (const doc of registration.registration_documents ?? []) {
      if (!doc.registration_item_id) continue
      const existing = docsByItem.get(doc.registration_item_id) ?? []
      existing.push(doc)
      docsByItem.set(doc.registration_item_id, existing)
    }
    return docsByItem
  }

  const getApprovalReadiness = (registration: RegistrationRow) => {
    const docsByItem = getDocsByItem(registration)
    const hasApprovedPayment = (registration.registration_payments ?? []).some((payment) => payment.status === 'APPROVED')
    const allItemsHaveDocs =
      registration.registration_items.length > 0 &&
      registration.registration_items.every((item) => (docsByItem.get(item.id) ?? []).length > 0)
    const allItemsHavePhotos =
      !riderPhotoUploadEnabled ||
      (registration.registration_items.length > 0 && registration.registration_items.every((item) => Boolean(item.photo_url)))
    const allItemsHaveClub =
      registration.registration_items.length > 0 &&
      registration.registration_items.every((item) => Boolean(item.club?.trim()))

    const plateIssues = registration.registration_items
      .map((item) => ({ item, check: plateChecks[item.id] }))
      .filter(({ item, check }) => !getPlateDraft(item).number || !isPlateReady(check))

    const blockingReasons: string[] = []
    if (registration.status !== 'PENDING') blockingReasons.push('Pendaftaran ini sudah diproses.')
    if (!allItemsHaveClub) blockingReasons.push('Club/komunitas rider wajib diisi.')
    if (!hasApprovedPayment) blockingReasons.push('Minimal satu pembayaran harus berstatus APPROVED.')
    if (!allItemsHaveDocs) blockingReasons.push('Masih ada rider yang dokumennya belum lengkap.')
    if (!allItemsHavePhotos) blockingReasons.push('Masih ada rider yang foto profilnya belum lengkap.')
    if (plateIssues.some(({ check }) => check?.state === 'checking')) {
      blockingReasons.push('Validasi nomor plate masih berjalan.')
    } else if (plateIssues.length > 0) {
      blockingReasons.push('Masih ada nomor plate rider yang perlu diperbaiki.')
    }

    return {
      docsByItem,
      hasApprovedPayment,
      allItemsHaveDocs,
      allItemsHavePhotos,
      canApprove: blockingReasons.length === 0,
      blockingReasons,
    }
  }

  useEffect(() => {
    if (!eventId) return
    let cancelled = false

    ;(async () => {
      try {
        const [categoryRes, settingsRes] = await Promise.all([
          fetch(`/api/events/${eventId}/categories`),
          apiFetch<EventSettingsResponse>(`/api/events/${eventId}/settings`),
        ])
        const json = await categoryRes.json().catch(() => ({}))
        if (cancelled) return
        setCategories((json?.data ?? []) as CategoryItem[])
        const businessSettings = settingsRes.data?.business_settings
        const theme = settingsRes.data?.display_theme ?? {}
        const photoEnabled = businessSettings?.registration_rider_photo_enabled
        setRiderPhotoUploadEnabled(typeof photoEnabled === 'boolean' ? photoEnabled : true)
        setWhatsappGroupInviteUrl(businessSettings?.whatsapp_group_invite_url?.trim() || null)
        setEventBranding({
          logoUrl:
            (typeof theme.logo_url === 'string' && theme.logo_url.trim()) ||
            settingsRes.data?.event_logo_url?.trim() ||
            null,
          primaryColor: safeCssColor(theme.primary_color, '#2ecc71'),
          secondaryColor: safeCssColor(theme.secondary_color, '#111827'),
          headerBg: safeCssColor(theme.header_bg, '#eaf7ee'),
          cardBg: safeCssColor(theme.card_bg, '#ffffff'),
          brandName: businessSettings?.public_brand_name?.trim() || null,
        })
      } catch {
        if (!cancelled) {
          setRiderPhotoUploadEnabled(true)
          setWhatsappGroupInviteUrl(null)
          setEventBranding({
            logoUrl: null,
            primaryColor: '#2ecc71',
            secondaryColor: '#111827',
            headerBg: '#eaf7ee',
            cardBg: '#ffffff',
            brandName: null,
          })
          setFeedback({ type: 'error', message: 'Gagal memuat kategori event.' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [eventId, refreshTick])

  useEffect(() => {
    if (!eventId) return
    let cancelled = false

    ;(async () => {
      try {
        const res = await apiFetch<AttendanceSummaryResponse>(
          `/api/admin/events/${eventId}/registrations?summary=attendance`
        )
        if (!cancelled) {
          setAttendanceSummary(res.data ?? null)
        }
      } catch {
        if (!cancelled) setAttendanceSummary(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [eventId, refreshTick])

  useEffect(() => {
    if (!eventId) return
    let cancelled = false

    ;(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
          status: filterStatus,
          payment_status: paymentFilter,
          attendance: attendanceFilter,
        })
        if (query.trim()) params.set('q', query.trim())

        const res = await apiFetch<RegistrationListResponse>(`/api/admin/events/${eventId}/registrations?${params.toString()}`)
        if (cancelled) return

        const nextMeta = {
          page: res.meta?.page ?? page,
          pageSize: res.meta?.page_size ?? pageSize,
          total: res.meta?.total ?? 0,
          totalPages: res.meta?.total_pages ?? 1,
        }

        if (page > nextMeta.totalPages && nextMeta.total > 0) {
          setPage(nextMeta.totalPages)
          return
        }

        setRegistrations(res.data ?? [])
        setMeta(nextMeta)
        setPaymentFeedback({})
        setExpanded((prev) => {
          const next = { ...prev }
          for (const row of res.data ?? []) {
            if (typeof next[row.id] === 'undefined') {
              next[row.id] = row.status === 'PENDING'
            }
          }
          return next
        })
      } catch (err: unknown) {
        if (!cancelled) {
          setRegistrations([])
          setMeta({ page, pageSize, total: 0, totalPages: 1 })
          setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal memuat pendaftaran.' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [attendanceFilter, eventId, filterStatus, paymentFilter, page, pageSize, query, refreshTick])

  useEffect(() => {
    if (!eventId || registrations.length === 0) return
    let cancelled = false
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const currentItemIds = new Set<string>()
    const immediateStates: Record<string, PlateCheckState> = {}

    for (const registration of registrations) {
      if (registration.status !== 'PENDING') continue

      const duplicateCounts = new Map<string, number>()
      for (const item of registration.registration_items) {
        currentItemIds.add(item.id)
        const draft = getPlateDraft(item)
        const token = buildPlateDisplay(draft.number, draft.suffix)
        if (!token) continue
        duplicateCounts.set(token, (duplicateCounts.get(token) ?? 0) + 1)
      }

      for (const item of registration.registration_items) {
        const draft = getPlateDraft(item)
        const token = buildPlateDisplay(draft.number, draft.suffix)
        if (!draft.number) {
          immediateStates[item.id] = {
            state: 'invalid',
            message: 'Nomor plate wajib diisi sebelum approve.',
            suggestedSuffix: null,
          }
          continue
        }

        if ((duplicateCounts.get(token) ?? 0) > 1) {
          immediateStates[item.id] = {
            state: 'duplicate',
            message: 'Plate bentrok dengan rider lain di pendaftaran ini.',
            suggestedSuffix: null,
          }
          continue
        }

        immediateStates[item.id] = {
          state: 'checking',
          message: 'Memeriksa ketersediaan plate...',
          suggestedSuffix: null,
        }

        timers.push(
          setTimeout(async () => {
            try {
              const params = new URLSearchParams({ plate_number: draft.number })
              if (draft.suffix) params.set('plate_suffix', draft.suffix)
              const res = await apiFetch<PlateCheckResponse>(`/api/admin/events/${eventId}/plate-check?${params.toString()}`)
              if (cancelled) return
              setPlateChecks((prev) => ({
                ...prev,
                [item.id]: {
                  state: res.data?.status ?? 'error',
                  message: res.data?.message ?? 'Gagal memeriksa plate.',
                  suggestedSuffix: res.data?.suggested_suffix ?? null,
                },
              }))
            } catch (err: unknown) {
              if (cancelled) return
              setPlateChecks((prev) => ({
                ...prev,
                [item.id]: {
                  state: 'error',
                  message: err instanceof Error ? err.message : 'Gagal memeriksa plate.',
                  suggestedSuffix: null,
                },
              }))
            }
          }, 250)
        )
      }
    }

    setPlateChecks((prev) => {
      const next: Record<string, PlateCheckState> = {}
      for (const [itemId, value] of Object.entries(prev)) {
        if (currentItemIds.has(itemId)) next[itemId] = value
      }
      return { ...next, ...immediateStates }
    })

    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
    }
  }, [eventId, registrations, getPlateDraft])

  const openApproveModal = (registration: RegistrationRow) => {
    setModal({ type: 'approve', registration })
    setModalNotes(registration.notes ?? '')
    setFeedback(null)
  }

  const openRejectModal = (registration: RegistrationRow) => {
    setModal({ type: 'reject', registration })
    setModalNotes(registration.notes ?? '')
    setFeedback(null)
  }

  const openDeleteModal = (registration: RegistrationRow) => {
    setModal({ type: 'delete', registration })
    setModalNotes('')
    setFeedback(null)
  }

  const openContactModal = (registration: RegistrationRow) => {
    setModal({ type: 'contact', registration })
    setModalNotes('')
    setContactForm({
      contact_name: registration.contact_name ?? '',
      contact_phone: registration.contact_phone ?? '',
      contact_email: registration.contact_email ?? '',
      community_name: registration.community_name ?? '',
    })
    setFeedback(null)
  }

  const openUpclassModal = (registration: RegistrationRow, item: RegistrationItem) => {
    setModal({ type: 'upclass', registration, item })
    setModalNotes('')
    setUpclassForm({
      category_ids: getItemUpclassCategoryIds(item),
      notes: '',
    })
    setFeedback(null)
  }

  const closeModal = () => {
    if (savingKey) return
    setModal(null)
    setModalNotes('')
    setContactForm({
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      community_name: '',
    })
    setUpclassForm({
      category_ids: [],
      notes: '',
    })
  }

  const approveRegistration = async (registration: RegistrationRow, notes: string) => {
    const readiness = getApprovalReadiness(registration)
    if (!readiness.canApprove) {
      setFeedback({ type: 'error', message: readiness.blockingReasons[0] ?? 'Pendaftaran belum siap di-approve.' })
      return
    }

    setSavingKey(`registration:${registration.id}`)
    try {
      const items = registration.registration_items.map((item) => {
        const draft = getPlateDraft(item)
        return {
          id: item.id,
          plate_number: draft.number || item.requested_plate_number,
          plate_suffix: draft.suffix || item.requested_plate_suffix || null,
        }
      })

      const approvalResponse = await apiFetch<ApprovalResponse>(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'APPROVED',
          notes: notes.trim() || null,
          items,
        }),
      })

      const email = approvalResponse?.email
      const emailMessage =
        email?.status === 'sent'
          ? 'Email konfirmasi terkirim.'
          : email?.status === 'skipped'
          ? `Email tidak dikirim: ${email.reason ?? 'tidak ada alasan.'}`
          : email?.status === 'failed'
          ? `Email gagal dikirim: ${email.reason ?? 'cek konfigurasi Resend.'}`
          : 'Status email tidak tersedia.'
      setFeedback({
        type: email?.status === 'failed' ? 'error' : 'success',
        message: (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{`Pendaftaran ${registration.contact_name} berhasil di-approve. ${emailMessage}`}</span>
            <WhatsAppAction
              eventId={eventId}
              registration={registration}
              kind="APPROVED"
              className="w-full sm:w-auto"
              label="Kirim WA Konfirmasi"
              whatsappGroupInviteUrl={whatsappGroupInviteUrl}
              categoryMap={categoryMap}
            />
          </div>
        ),
      })
      setModal(null)
      setModalNotes('')
      setRefreshTick((prev) => prev + 1)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal approve pendaftaran.' })
    } finally {
      setSavingKey(null)
    }
  }

  const buildEmailFeedback = (email: ApprovalResponse['email']) => {
    if (email?.status === 'sent') return 'Email pemberitahuan terkirim.'
    if (email?.status === 'skipped') return `Email tidak dikirim: ${email.reason ?? 'tidak ada alasan.'}`
    if (email?.status === 'failed') return `Email gagal dikirim: ${email.reason ?? 'cek konfigurasi Resend.'}`
    return 'Status email tidak tersedia.'
  }

  const rejectRegistration = async (registration: RegistrationRow, notes: string) => {
    const trimmedNotes = notes.trim()
    if (!trimmedNotes) {
      setFeedback({ type: 'error', message: 'Alasan penolakan wajib diisi.' })
      return
    }

    setSavingKey(`registration:${registration.id}`)
    try {
      const rejectionResponse = await apiFetch<ApprovalResponse>(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'REJECTED', notes: trimmedNotes }),
      })
      const email = rejectionResponse?.email
      setFeedback({
        type: email?.status === 'failed' ? 'error' : 'success',
        message: (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{`Pendaftaran ${registration.contact_name} berhasil ditolak. ${buildEmailFeedback(email)}`}</span>
            <WhatsAppAction eventId={eventId} registration={registration} kind="REJECTED" className="w-full sm:w-auto" label="Kirim WA Penolakan" />
          </div>
        ),
      })
      setModal(null)
      setModalNotes('')
      setRefreshTick((prev) => prev + 1)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menolak pendaftaran.' })
    } finally {
      setSavingKey(null)
    }
  }

  const deleteRegistration = async (registration: RegistrationRow) => {
    setSavingKey(`registration:${registration.id}`)
    try {
      await apiFetch(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'DELETE',
      })
      setFeedback({ type: 'success', message: `Pendaftaran ${registration.contact_name} berhasil dihapus.` })
      setModal(null)
      setModalNotes('')
      setRefreshTick((prev) => prev + 1)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menghapus pendaftaran.' })
    } finally {
      setSavingKey(null)
    }
  }

  const updateRegistrationContact = async (registration: RegistrationRow) => {
    const payload = {
      contact_name: contactForm.contact_name.trim(),
      contact_phone: contactForm.contact_phone.trim(),
      contact_email: contactForm.contact_email.trim() || null,
      community_name: contactForm.community_name.trim() || null,
    }
    if (!payload.contact_name) {
      setFeedback({ type: 'error', message: 'Nama wali/penanggung jawab wajib diisi.' })
      return
    }
    if (!payload.contact_phone) {
      setFeedback({ type: 'error', message: 'Nomor WhatsApp wali wajib diisi.' })
      return
    }

    setSavingKey(`contact:${registration.id}`)
    try {
      const response = await apiFetch<{ changed?: boolean }>(
        `/api/admin/events/${eventId}/registrations/${registration.id}/contact`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      )
      setFeedback({
        type: response.changed === false ? 'info' : 'success',
        message:
          response.changed === false
            ? 'Kontak wali tidak berubah.'
            : `Kontak wali untuk ${payload.contact_name} berhasil diperbarui.`,
      })
      setModal(null)
      setRefreshTick((prev) => prev + 1)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal memperbarui kontak wali.' })
    } finally {
      setSavingKey(null)
    }
  }

  const updateApprovedUpclass = async (registration: RegistrationRow, item: RegistrationItem) => {
    const savingId = `upclass:${item.id}`
    setSavingKey(savingId)
    try {
      const response = await apiFetch<{ changed?: boolean }>(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'UPDATE_APPROVED_UPCLASS',
          item_id: item.id,
          rider_id: item.official_rider_id ?? null,
          category_ids: upclassForm.category_ids,
          notes: upclassForm.notes.trim() || null,
        }),
      })

      setFeedback({
        type: response.changed === false ? 'info' : 'success',
        message:
          response.changed === false
            ? `Upclass ${item.rider_name} tidak berubah.`
            : `Upclass ${item.rider_name} berhasil diperbarui.`,
      })
      setModal(null)
      setUpclassForm({ category_ids: [], notes: '' })
      setRefreshTick((prev) => prev + 1)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal memperbarui upclass rider.' })
    } finally {
      setSavingKey(null)
    }
  }

  const updatePaymentStatus = async (
    registration: RegistrationRow,
    payment: RegistrationPayment,
    nextStatus: 'APPROVED' | 'REJECTED'
  ) => {
    setSavingKey(`payment:${payment.id}`)
    setPaymentFeedback((prev) => {
      const next = { ...prev }
      delete next[payment.id]
      return next
    })
    try {
      const paymentResponse = await apiFetch<ApprovalResponse>(
        `/api/admin/events/${eventId}/registrations/${registration.id}/payments/${payment.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus }),
        }
      )
      const email = paymentResponse?.email
      const emailMessage = nextStatus === 'REJECTED' ? ` ${buildEmailFeedback(email)}` : ''
      setRegistrations((prev) =>
        prev.map((row) =>
          row.id !== registration.id
            ? row
            : {
                ...row,
                registration_payments: row.registration_payments.map((entry) =>
                  entry.id === payment.id ? { ...entry, status: nextStatus } : entry
                ),
              }
        )
      )
      setFeedback({
        type: email?.status === 'failed' ? 'error' : 'success',
        message:
          nextStatus === 'REJECTED' ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{`Pembayaran ${registration.contact_name} berhasil diubah ke ${nextStatus}.${emailMessage}`}</span>
              <WhatsAppAction
                eventId={eventId}
                registration={registration}
                kind="PAYMENT_REJECTED"
                className="w-full sm:w-auto"
                label="Kirim WA Pembayaran"
              />
            </div>
          ) : (
            `Pembayaran ${registration.contact_name} berhasil diubah ke ${nextStatus}.${emailMessage}`
          ),
      })
      setPaymentFeedback((prev) => ({
        ...prev,
        [payment.id]: {
          type: email?.status === 'failed' ? 'error' : 'success',
          message: `Status pembayaran langsung berubah ke ${nextStatus}.${emailMessage}`,
        },
      }))
      setRefreshTick((prev) => prev + 1)
    } catch (err: unknown) {
      setPaymentFeedback((prev) => ({
        ...prev,
        [payment.id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Gagal mengubah status pembayaran.',
        },
      }))
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal mengubah status pembayaran.' })
    } finally {
      setSavingKey(null)
    }
  }

  const handleModalConfirm = async () => {
    if (!modal) return
    if (modal.type === 'approve') {
      await approveRegistration(modal.registration, modalNotes)
      return
    }
    if (modal.type === 'reject') {
      await rejectRegistration(modal.registration, modalNotes)
      return
    }
    if (modal.type === 'contact') {
      await updateRegistrationContact(modal.registration)
      return
    }
    if (modal.type === 'upclass') {
      await updateApprovedUpclass(modal.registration, modal.item)
      return
    }
    await deleteRegistration(modal.registration)
  }

  const emptyMessage = useMemo(() => {
    if (loading) return 'Memuat pendaftaran...'
    if (query.trim()) {
      return `Tidak ada pendaftaran yang cocok dengan pencarian "${query}".`
    }
    if (filterStatus !== 'ALL' || paymentFilter !== 'ALL' || attendanceFilter !== 'ALL') {
      return 'Tidak ada pendaftaran yang cocok dengan filter saat ini.'
    }
    return 'Belum ada pendaftaran masuk untuk event ini.'
  }, [attendanceFilter, filterStatus, loading, paymentFilter, query])

  const fetchAllRegistrationsForExport = async () => {
    const exportRows: RegistrationRow[] = []
    const exportPageSize = 50
    let currentPage = 1
    let totalPages = 1

    while (currentPage <= totalPages) {
      const params = new URLSearchParams({
        page: String(currentPage),
        page_size: String(exportPageSize),
        status: filterStatus,
        payment_status: paymentFilter,
        attendance: attendanceFilter,
      })
      if (query.trim()) params.set('q', query.trim())

      const res = await apiFetch<RegistrationListResponse>(`/api/admin/events/${eventId}/registrations?${params.toString()}`)
      exportRows.push(...(res.data ?? []))
      totalPages = res.meta?.total_pages ?? 1
      currentPage += 1
    }

    return exportRows
  }

  const resendStatusEmail = async (registration: RegistrationRow, forceResend = false) => {
    if (!registration.contact_email?.trim()) {
      setFeedback({ type: 'error', message: 'Email wali rider belum diisi.' })
      return
    }
    if (!registration.registration_code?.trim()) {
      setFeedback({ type: 'error', message: 'Kode registrasi belum tersedia.' })
      return
    }

    setSavingKey(`email:${registration.id}`)
    try {
      const response = await apiFetch<ApprovalResponse>(
        `/api/admin/events/${eventId}/registrations/${registration.id}/email`,
        {
          method: 'POST',
          body: JSON.stringify({ force_resend: forceResend }),
        }
      )
      if (response.alreadySent) {
        const resend = window.confirm(
          response.message ?? 'Pendaftaran ini sudah pernah dikirim QR dan status pendaftaran via email. Kirim ulang?'
        )
        if (resend) {
          await resendStatusEmail(registration, true)
        } else {
          setFeedback({ type: 'info', message: 'Kirim ulang email dibatalkan.' })
        }
        return
      }
      const email = response.email
      const message =
        email?.status === 'sent'
          ? `Email QR dan status berhasil dikirim ulang ke ${registration.contact_email}.`
          : `Email tidak dikirim: ${email?.reason ?? 'konfigurasi email belum tersedia.'}`
      setFeedback({ type: email?.status === 'sent' ? 'success' : 'error', message })
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengirim ulang email QR dan status.',
      })
    } finally {
      setSavingKey(null)
    }
  }

  const fetchRiderExportRows = async (categoryId?: string | null) => {
    const exportRows: RiderExportItem[] = []
    const exportPageSize = 200
    let currentPage = 1
    let expectedTotal = 0

    while (true) {
      const qs = new URLSearchParams({
        event_id: eventId,
        page: String(currentPage),
        page_size: String(exportPageSize),
      })
      if (categoryId) qs.set('category_id', categoryId)

      const res = await fetch(`/api/riders?${qs.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Gagal mengambil data rider untuk export.')
      }

      const pageRows = (json.data ?? []) as RiderExportItem[]
      expectedTotal = Number(json.total ?? 0)
      exportRows.push(...pageRows)

      if (pageRows.length === 0 || exportRows.length >= expectedTotal) break
      currentPage += 1
    }

    return exportRows
  }

  const buildRiderCategoryExportData = async () => {
    const exportCategories = [...categories].filter((category) => category.enabled !== false)
    if (exportCategories.length === 0) {
      throw new Error('Belum ada kategori aktif untuk diexport.')
    }

    const allRegisteredRows = await fetchRiderExportRows()
    const totalRegistered = allRegisteredRows.length
    if (totalRegistered === 0) {
      throw new Error('Belum ada rider approved di menu Rider.')
    }

    const categoryGroups: ExportCategoryGroup[] = []
    let totalAcrossCategories = 0

    for (const category of exportCategories) {
      const rows = await fetchRiderExportRows(category.id)
      totalAcrossCategories += rows.length
      const capacity = typeof category.capacity === 'number' ? category.capacity : null
      const filled = rows.length
      const remaining = capacity == null ? null : Math.max(0, capacity - filled)
      const status = capacity == null ? 'TANPA BATAS' : filled >= capacity ? 'PENUH' : 'TERSEDIA'

      categoryGroups.push({
        summary: {
          id: category.id,
          label: category.label,
          capacity,
          filled,
          remaining,
          status,
        },
        rows,
      })
    }

    return {
      totalRegistered,
      upClassCount: Math.max(0, totalAcrossCategories - totalRegistered),
      categoryGroups,
    }
  }

  const escapeHtml = (value: string | number | null | undefined) => {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  const openPrintPreview = (html: string) => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.visibility = 'hidden'
    document.body.appendChild(iframe)

    const printWindow = iframe.contentWindow
    const printDoc = iframe.contentDocument || printWindow?.document
    if (!printWindow || !printDoc) {
      document.body.removeChild(iframe)
      throw new Error('Gagal membuka preview PDF.')
    }

    printDoc.open()
    printDoc.write(html)
    printDoc.close()

    const cleanup = () => {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe)
        } catch {
          // no-op
        }
      }, 600)
    }

    printWindow.onafterprint = cleanup
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
      cleanup()
    }, 350)
  }

  const buildFilterSummary = () => {
    const parts: string[] = []
    if (filterStatus !== 'ALL') parts.push(`Status Registrasi: ${filterStatus}`)
    if (paymentFilter !== 'ALL') parts.push(`Status Pembayaran: ${paymentFilter}`)
    if (attendanceFilter !== 'ALL') {
      const label = ATTENDANCE_FILTER_OPTIONS.find((option) => option.value === attendanceFilter)?.label
      parts.push(`Kehadiran: ${label ?? attendanceFilter}`)
    }
    if (query.trim()) parts.push(`Pencarian: ${query.trim()}`)
    return parts.length > 0 ? parts.join(' | ') : 'Semua data registrasi'
  }

  const buildThemedRegistrationPrintHtml = ({
    title,
    eyebrow,
    eventName,
    location,
    eventDate,
    generatedAt,
    totalLabel,
    totalValue,
    filterSummary,
    body,
  }: {
    title: string
    eyebrow: string
    eventName: string
    location: string
    eventDate: string
    generatedAt: string
    totalLabel: string
    totalValue: number
    filterSummary?: string
    body: string
  }) => {
    const primaryColor = safeCssColor(eventBranding.primaryColor, '#2ecc71')
    const secondaryColor = safeCssColor(eventBranding.secondaryColor, '#111827')
    const headerBg = safeCssColor(eventBranding.headerBg, '#eaf7ee')
    const cardBg = safeCssColor(eventBranding.cardBg, '#ffffff')
    const logoUrl = eventBranding.logoUrl?.trim()
    const brandName = eventBranding.brandName?.trim() || eventName

    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      html, body {
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        font-family: Arial, sans-serif;
        color: #0f172a;
        background: ${headerBg};
        padding: 16px;
      }
      .sheet {
        display: grid;
        gap: 14px;
      }
      .hero {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 18px;
        align-items: center;
        border: 2px solid ${secondaryColor};
        border-radius: 22px;
        padding: 18px 20px;
        background:
          linear-gradient(135deg, ${secondaryColor} 0%, #1f2937 58%, ${primaryColor} 150%);
        color: #ffffff;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
      }
      .brand-mark {
        display: grid;
        place-items: center;
        width: 112px;
        height: 112px;
        border-radius: 18px;
        background: rgba(255,255,255,0.94);
        border: 1px solid rgba(255,255,255,0.55);
        overflow: hidden;
      }
      .brand-mark img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
      }
      .brand-fallback {
        color: ${secondaryColor};
        font-size: 14px;
        font-weight: 900;
        text-align: center;
        padding: 10px;
      }
      .eyebrow {
        display: inline-flex;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.14);
        border: 1px solid rgba(255,255,255,0.24);
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.16em;
      }
      h1 {
        margin: 10px 0 6px;
        font-size: 26px;
        line-height: 1.08;
      }
      .subtitle {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 5px 9px;
        border-radius: 999px;
        background: rgba(255,255,255,0.14);
        border: 1px solid rgba(255,255,255,0.22);
        color: rgba(255,255,255,0.9);
        font-size: 11px;
        font-weight: 800;
      }
      .section-card {
        border: 1px solid #cbd5e1;
        border-radius: 18px;
        padding: 12px;
        background: ${cardBg};
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.07);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
      }
      th, td {
        padding: 6px 7px;
        border-bottom: 1px solid #dbeafe;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: color-mix(in srgb, ${primaryColor} 18%, #ffffff);
        color: #0f172a;
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      tbody tr:nth-child(even) td {
        background: rgba(248, 250, 252, 0.86);
      }
      .footer-note {
        font-size: 10px;
        font-weight: 700;
        color: #475569;
      }
      .empty {
        color: #64748b;
        font-style: italic;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <header class="hero">
        <div>
          <div class="eyebrow">${escapeHtml(eyebrow)}</div>
          <h1>${escapeHtml(eventName)}</h1>
          <div style="font-size:13px;font-weight:800;color:rgba(255,255,255,0.84);">${escapeHtml(brandName)}</div>
          <div class="subtitle">
            <span class="pill">Lokasi: ${escapeHtml(location)}</span>
            <span class="pill">Tanggal: ${escapeHtml(eventDate)}</span>
            <span class="pill">${escapeHtml(totalLabel)}: ${escapeHtml(totalValue)}</span>
            <span class="pill">Generated: ${escapeHtml(generatedAt)}</span>
            <span class="pill">${escapeHtml(filterSummary ?? buildFilterSummary())}</span>
          </div>
        </div>
        <div class="brand-mark">
          ${
            logoUrl
              ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" />`
              : `<div class="brand-fallback">${escapeHtml(brandName)}</div>`
          }
        </div>
      </header>
      ${body}
      <div class="footer-note">Dokumen export otomatis dari dashboard registrasi Race Pushbike.</div>
    </div>
  </body>
</html>
`
  }

  const buildAllRiderPrintHtml = ({
    eventName,
    location,
    eventDate,
    sections,
  }: {
    eventName: string
    location: string
    eventDate: string
    sections: string
  }) => {
    const primaryColor = safeCssColor(eventBranding.primaryColor, '#2ecc71')
    const secondaryColor = safeCssColor(eventBranding.secondaryColor, '#111111')
    const headerBg = safeCssColor(eventBranding.headerBg, '#eaf7ee')
    const cardBg = safeCssColor(eventBranding.cardBg, '#ffffff')
    const primarySoft = withHexAlpha(primaryColor, '2e', 'rgba(46, 204, 113, 0.18)')
    const primaryLine = withHexAlpha(primaryColor, '33', 'rgba(46, 204, 113, 0.20)')
    const primaryBorder = withHexAlpha(primaryColor, '80', 'rgba(46, 204, 113, 0.50)')
    const primaryBadge = withHexAlpha(primaryColor, '18', 'rgba(46, 204, 113, 0.10)')
    const logoUrl = eventBranding.logoUrl?.trim() || ''
    const watermarkCss = logoUrl ? `url("${escapeCssString(logoUrl)}")` : 'none'
    const logoMarkup = logoUrl
      ? `<div class="event-logo"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(eventName)} logo" /></div>`
      : ''
    const locationMarkup = location && location !== '-' ? `<span>${escapeHtml(location)}</span>` : ''

    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`Data Rider ${eventName}`)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      html, body {
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        font-family: Arial, sans-serif;
        color: #111827;
        background:
          radial-gradient(circle at 8% 4%, ${headerBg} 0, transparent 30%),
          radial-gradient(circle at 92% 0%, ${primarySoft} 0, transparent 26%),
          #f8fafc;
        padding: 16px;
      }
      .sheet {
        position: relative;
        display: grid;
        gap: 14px;
        isolation: isolate;
      }
      .sheet::before {
        content: "";
        position: fixed;
        inset: 8%;
        background-image: ${watermarkCss};
        background-repeat: no-repeat;
        background-position: center;
        background-size: min(56vw, 560px) auto;
        opacity: ${logoUrl ? '0.055' : '0'};
        z-index: -1;
        pointer-events: none;
      }
      .hero {
        position: relative;
        overflow: hidden;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 18px;
        align-items: center;
        border: 2px solid ${secondaryColor};
        border-radius: 24px;
        padding: 18px 22px;
        background:
          linear-gradient(135deg, ${secondaryColor} 0%, #1f2937 54%, ${primaryColor} 145%);
        color: #ffffff;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
      }
      .hero::after {
        content: "";
        position: absolute;
        inset: auto -10% -60% 44%;
        height: 180px;
        background: ${headerBg};
        opacity: 0.18;
        transform: rotate(-12deg);
      }
      .eyebrow {
        display: inline-flex;
        width: max-content;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.24);
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.16em;
      }
      h1 {
        margin: 10px 0 8px;
        font-size: 30px;
        line-height: 1.04;
      }
      .event-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .event-meta span {
        display: inline-flex;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.10);
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 850;
        color: rgba(255,255,255,0.88);
      }
      .event-logo {
        position: relative;
        z-index: 1;
        width: 92px;
        height: 92px;
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,0.35);
        background: rgba(255,255,255,0.96);
        display: grid;
        place-items: center;
        padding: 10px;
      }
      .event-logo img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .category-section {
        border: 1px solid rgba(15, 23, 42, 0.18);
        border-radius: 18px;
        padding: 12px;
        background: ${cardBg};
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .category-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: end;
        margin-bottom: 9px;
        border-bottom: 2px solid ${primaryLine};
        padding-bottom: 8px;
      }
      .category-header h2 {
        margin: 0;
        font-size: 17px;
        line-height: 1.1;
        font-weight: 950;
        color: #0f172a;
      }
      .category-count {
        border-radius: 999px;
        border: 1px solid ${primaryBorder};
        background: ${primaryBadge};
        color: #0f172a;
        padding: 5px 9px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        overflow: hidden;
        border: 1px solid #d1d5db;
        border-radius: 12px;
        background: #ffffff;
        font-size: 11px;
      }
      thead {
        display: table-header-group;
      }
      tfoot {
        display: table-footer-group;
      }
      tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      th, td {
        padding: 6px 8px;
        border-bottom: 1px solid #e5e7eb;
        text-align: left;
      }
      th {
        background: #f3f4f6;
        color: #111827;
        font-size: 10px;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      tbody tr:nth-child(even) td {
        background: #f9fafb;
      }
      tbody tr:last-child td {
        border-bottom: 0;
      }
      .empty {
        color: #64748b;
        font-style: italic;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <header class="hero">
        <div>
          <div class="eyebrow">Data Rider Event</div>
          <h1>${escapeHtml(`Data Rider ${eventName}`)}</h1>
          <div class="event-meta">
            <span>${escapeHtml(eventName)}</span>
            <span>${escapeHtml(eventDate)}</span>
            ${locationMarkup}
          </div>
        </div>
        ${logoMarkup}
      </header>
      ${sections}
    </div>
  </body>
</html>
`
  }

  const handleExportRegistrationPdf = async () => {
    if (!eventId) return
    setExportingRegistrationPdf(true)
    try {
      const [eventRes, exportRows] = await Promise.all([
        apiFetch<{ data?: { name?: string; location?: string | null; event_date?: string | null; status?: string | null } }>(
          `/api/events/${eventId}`
        ),
        fetchAllRegistrationsForExport(),
      ])

      if (exportRows.length === 0) {
        throw new Error('Tidak ada data registrasi untuk diexport dengan filter saat ini.')
      }

      const eventName = eventRes.data?.name?.trim() || 'Event'
      const eventLocation = eventRes.data?.location?.trim() || '-'
      const eventDate = eventRes.data?.event_date ? formatDateTime(eventRes.data.event_date) : '-'
      const generatedAt = new Date().toLocaleString('id-ID')
      const riderRows = exportRows.flatMap((registration) => {
        const paymentAggregate = aggregatePaymentStatus(registration.registration_payments)
        const docsByItem = getDocsByItem(registration)
        return registration.registration_items.map((item) => ({
          registration,
          item,
          paymentAggregate,
          documentCount: (docsByItem.get(item.id) ?? []).length,
        }))
      })

      const tableRows = riderRows
        .map(({ registration, item, paymentAggregate, documentCount }, index) => {
          const primaryCategory = item.primary_category_id ? categoryMap.get(item.primary_category_id) ?? item.primary_category_id : '-'
          const extraCategory = formatUpclassCategories(item, categoryMap)
          const plate = buildPlateDisplay(item.requested_plate_number, item.requested_plate_suffix) || '-'
          const registrationCode = registration.registration_code?.trim() || '-'
          const statusUrl = getRegistrationStatusUrl(registration.registration_code) || '-'
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(formatDateTime(registration.created_at))}</td>
              <td>${escapeHtml(registrationCode)}</td>
              <td>${escapeHtml(registration.status)}</td>
              <td>${escapeHtml(paymentAggregate)}</td>
              <td>${escapeHtml(getAttendanceLabel(registration))}</td>
              <td>${escapeHtml(registration.checked_in_at ? 'Sudah' : 'Belum')}</td>
              <td>${escapeHtml(registration.goodie_bag_collected_at ? 'Sudah' : 'Belum')}</td>
              <td>${escapeHtml(registration.contact_name)}</td>
              <td>${escapeHtml(registration.contact_phone)}</td>
              <td>${escapeHtml(item.rider_name)}</td>
              <td>${escapeHtml(item.rider_nickname ?? '-')}</td>
              <td>${escapeHtml(item.date_of_birth)}</td>
              <td>${escapeHtml(item.gender)}</td>
              <td>${escapeHtml(item.club ?? registration.community_name ?? '-')}</td>
              <td>${escapeHtml(primaryCategory)}</td>
              <td>${escapeHtml(extraCategory)}</td>
              <td>${escapeHtml(item.jersey_size ?? '-')}</td>
              <td>${escapeHtml(plate)}</td>
              <td>${escapeHtml(formatRupiah(item.price || 0))}</td>
              <td>${escapeHtml(item.status)}</td>
              <td>${escapeHtml(documentCount)}</td>
              <td style="word-break:break-all">${escapeHtml(statusUrl)}</td>
            </tr>
          `
        })
        .join('')

      const html = buildThemedRegistrationPrintHtml({
        title: `Data Registrasi - ${eventName}`,
        eyebrow: 'Data Registrasi',
        eventName,
        location: eventLocation,
        eventDate,
        generatedAt,
        totalLabel: 'Total Rider',
        totalValue: riderRows.length,
        body: `
          <section class="section-card">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Tanggal</th>
                  <th>Kode</th>
                  <th>Registrasi</th>
                  <th>Bayar</th>
                  <th>Kehadiran</th>
                  <th>Check-in</th>
                  <th>Goodie</th>
                  <th>Kontak</th>
                  <th>WhatsApp</th>
                  <th>Nama Rider</th>
                  <th>Panggilan</th>
                  <th>Lahir</th>
                  <th>Gender</th>
                  <th>Club</th>
                  <th>Kategori</th>
                  <th>Upclass</th>
                  <th>Jersey</th>
                  <th>Plate</th>
                  <th>Harga</th>
                  <th>Status Item</th>
                  <th>Dok</th>
                  <th>Link Status / QR</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </section>
        `,
      })

      openPrintPreview(html)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal export PDF data registrasi.' })
    } finally {
      setExportingRegistrationPdf(false)
    }
  }

  const handleExportRegistrationExcel = async () => {
    if (!eventId) return
    setExportingRegistrationExcel(true)
    try {
      const [eventRes, exportRows] = await Promise.all([
        apiFetch<{ data?: { name?: string; location?: string | null; event_date?: string | null; status?: string | null } }>(
          `/api/events/${eventId}`
        ),
        fetchAllRegistrationsForExport(),
      ])

      if (exportRows.length === 0) {
        throw new Error('Tidak ada data registrasi untuk diexport dengan filter saat ini.')
      }

      const eventName = eventRes.data?.name?.trim() || 'Event'
      const eventLocation = eventRes.data?.location?.trim() || '-'
      const eventDate = eventRes.data?.event_date ? formatDateTime(eventRes.data.event_date) : '-'
      const generatedAt = new Date()
      const totalRiders = exportRows.reduce((sum, row) => sum + row.registration_items.length, 0)
      const pendingCount = exportRows.filter((row) => row.status === 'PENDING').length
      const approvedCount = exportRows.filter((row) => row.status === 'APPROVED').length
      const rejectedCount = exportRows.filter((row) => row.status === 'REJECTED').length
      const paymentSummary = exportRows.reduce(
        (acc, row) => {
          const aggregate = aggregatePaymentStatus(row.registration_payments)
          acc[aggregate] += 1
          return acc
        },
        { NO_PAYMENT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<'NO_PAYMENT' | PaymentStatus, number>
      )

      const summarySheetData: Array<Array<string | number>> = [
        ['LAPORAN DATA REGISTRASI EVENT'],
        [eventName],
        [],
        ['Generated', generatedAt.toLocaleString('id-ID')],
        ['Event', eventName],
        ['Lokasi', eventLocation],
        ['Tanggal Event', eventDate],
        ['Filter Aktif', buildFilterSummary()],
        [],
        ['Jumlah Registrasi', exportRows.length],
        ['Jumlah Rider', totalRiders],
        ['Registrasi Pending', pendingCount],
        ['Registrasi Approved', approvedCount],
        ['Registrasi Rejected', rejectedCount],
        ['Belum Upload Bukti', paymentSummary.NO_PAYMENT],
        ['Pembayaran Pending', paymentSummary.PENDING],
        ['Pembayaran Approved', paymentSummary.APPROVED],
        ['Pembayaran Rejected', paymentSummary.REJECTED],
      ]

      const detailSheetData: Array<Array<string | number>> = [
        ['DATA REGISTRASI EVENT'],
        [eventName],
        [`Generated: ${generatedAt.toLocaleString('id-ID')}`],
        [],
        [
          'No',
          'Tanggal Registrasi',
          'Kode Registrasi',
          'Link Status / QR',
          'Status Registrasi',
          'Status Pembayaran',
          'Konfirmasi Kehadiran',
          'Waktu Konfirmasi',
          'Check-in Venue',
          'Goodie Bag',
          'Komunitas',
          'Nama Kontak',
          'No. WhatsApp',
          'Email',
          'Total Bayar',
          'Jumlah Rider',
          'Nama Rider',
          'Panggilan',
          'Tanggal Lahir',
          'Gender',
          'Club',
          'Kategori Utama',
          'Kategori Upclass',
          'Jersey',
          'Plate Request',
          'Harga Rider',
          'Status Item',
          'Foto',
          'Jumlah Dokumen',
          'Catatan Admin',
        ],
      ]

      let detailIndex = 1
      for (const registration of exportRows) {
        const paymentAggregate = aggregatePaymentStatus(registration.registration_payments)
        const docsByItem = getDocsByItem(registration)
        for (const item of registration.registration_items) {
          detailSheetData.push([
            detailIndex,
            formatDateTime(registration.created_at),
            registration.registration_code?.trim() || '-',
            getRegistrationStatusUrl(registration.registration_code) || '-',
            registration.status,
            paymentAggregate,
            getAttendanceLabel(registration),
            registration.attendance_confirmed_at ? formatDateTime(registration.attendance_confirmed_at) : '-',
            getVenueStatusLabel(registration.checked_in_at, 'Sudah check-in', 'Belum check-in'),
            getVenueStatusLabel(
              registration.goodie_bag_collected_at,
              'Sudah diambil',
              'Belum diambil'
            ),
            registration.community_name ?? '-',
            registration.contact_name,
            registration.contact_phone,
            registration.contact_email ?? '-',
            registration.total_amount,
            registration.registration_items.length,
            item.rider_name,
            item.rider_nickname ?? '-',
            item.date_of_birth,
            item.gender,
            item.club ?? '-',
            item.primary_category_id ? categoryMap.get(item.primary_category_id) ?? item.primary_category_id : '-',
            formatUpclassCategories(item, categoryMap),
            item.jersey_size ?? '-',
            buildPlateDisplay(item.requested_plate_number, item.requested_plate_suffix) || '-',
            item.price,
            item.status,
            item.photo_url ? 'Ada' : 'Belum',
            (docsByItem.get(item.id) ?? []).length,
            registration.notes ?? '-',
          ])
          detailIndex += 1
        }
      }

      const whatsappSheetData: Array<Array<string | number>> = [
        [
          'No',
          'Nama Kontak',
          'No. WhatsApp',
          'Kode Registrasi',
          'Status Registrasi',
          'Konfirmasi Kehadiran',
          'Link Status / QR',
          'Link Kirim WhatsApp',
          'Template WhatsApp QR & Status',
        ],
        ...exportRows.map((registration, index) => [
          index + 1,
          registration.contact_name,
          registration.contact_phone,
          registration.registration_code?.trim() || '-',
          registration.status,
          getAttendanceLabel(registration),
          getRegistrationStatusUrl(registration.registration_code) || '-',
          buildWhatsAppUrl(registration, 'STATUS_ACCESS') || '-',
          buildWhatsAppMessage(registration, 'STATUS_ACCESS', null, categoryMap),
        ]),
      ]

      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()
      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData)
      const detailSheet = XLSX.utils.aoa_to_sheet(detailSheetData)
      const whatsappSheet = XLSX.utils.aoa_to_sheet(whatsappSheetData)

      summarySheet['!cols'] = [{ wch: 24 }, { wch: 48 }]
      summarySheet['!views'] = [{ state: 'frozen', ySplit: 8 }]
      detailSheet['!cols'] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 22 },
        { wch: 55 },
        { wch: 18 },
        { wch: 18 },
        { wch: 22 },
        { wch: 22 },
        { wch: 24 },
        { wch: 24 },
        { wch: 22 },
        { wch: 22 },
        { wch: 18 },
        { wch: 28 },
        { wch: 14 },
        { wch: 12 },
        { wch: 26 },
        { wch: 18 },
        { wch: 14 },
        { wch: 10 },
        { wch: 22 },
        { wch: 22 },
        { wch: 22 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 14 },
        { wch: 28 },
      ]
      whatsappSheet['!cols'] = [
        { wch: 6 },
        { wch: 24 },
        { wch: 18 },
        { wch: 22 },
        { wch: 18 },
        { wch: 22 },
        { wch: 55 },
        { wch: 70 },
        { wch: 90 },
      ]
      summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }]
      detailSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 29 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 29 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 29 } }]
      detailSheet['!autofilter'] = { ref: `A5:AD${detailSheetData.length}` }
      detailSheet['!views'] = [{ state: 'frozen', ySplit: 5 }]
      whatsappSheet['!autofilter'] = { ref: `A1:I${whatsappSheetData.length}` }
      whatsappSheet['!views'] = [{ state: 'frozen', ySplit: 1 }]

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan Registrasi')
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detail Registrasi')
      XLSX.utils.book_append_sheet(workbook, whatsappSheet, 'WhatsApp Registrasi')

      const stamp = generatedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const safeEventName = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event'
      XLSX.writeFile(workbook, `data-registrasi_${safeEventName}_${stamp}.xlsx`)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal export Excel registrasi.' })
    } finally {
      setExportingRegistrationExcel(false)
    }
  }

  const handleExportRiderExcel = async () => {
    if (!eventId) return
    setExportingRiderExcel(true)
    try {
      const { totalRegistered, upClassCount, categoryGroups } = await buildRiderCategoryExportData()
      const generatedAt = new Date()
      const XLSX = await import('xlsx')
      const summarySheetData: Array<Array<string | number>> = [
        ['LAPORAN RIDER EVENT'],
        [`Generated: ${generatedAt.toLocaleString('id-ID')}`],
        [],
        ['Jumlah Rider Terdaftar', totalRegistered],
        ['Jumlah Rider Ambil Up Class', upClassCount],
        [],
        ['Kategori', 'Kapasitas', 'Terisi', 'Sisa Slot', 'Status'],
        ...categoryGroups.map(({ summary }) => [
          summary.label,
          summary.capacity == null ? 'Tanpa batas' : summary.capacity,
          summary.filled,
          summary.remaining == null ? 'Tanpa batas' : summary.remaining,
          summary.status,
        ]),
      ]

      const detailSheetData: Array<Array<string | number>> = [
        ['SEMUA RIDER PER KATEGORI'],
        [`Generated: ${generatedAt.toLocaleString('id-ID')}`],
        [],
      ]

      for (const { summary, rows } of categoryGroups) {
        detailSheetData.push([summary.label])
        detailSheetData.push([
          'Kapasitas',
          summary.capacity == null ? 'Tanpa batas' : summary.capacity,
          'Terisi',
          summary.filled,
          'Sisa Slot',
          summary.remaining == null ? 'Tanpa batas' : summary.remaining,
          'Status',
          summary.status,
        ])
        detailSheetData.push([
          'No Plate',
          'Plate Number',
          'Suffix',
          'Nama Rider',
          'Panggilan',
          'Gender',
          'Tanggal Lahir',
          'Tahun Lahir',
          'Jersey',
          'Club',
        ])

        if (rows.length === 0) {
          detailSheetData.push(['Tidak ada rider terdaftar di kategori ini'])
        } else {
          detailSheetData.push(
            ...rows.map((row) => [
              row.no_plate_display,
              row.plate_number,
              row.plate_suffix ?? '-',
              row.name,
              row.rider_nickname ?? '-',
              row.gender,
              row.date_of_birth,
              row.birth_year ?? '',
              row.jersey_size ?? '-',
              row.club ?? '-',
            ])
          )
        }

        detailSheetData.push([])
      }

      const workbook = XLSX.utils.book_new()
      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData)
      const detailSheet = XLSX.utils.aoa_to_sheet(detailSheetData)

      summarySheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
      summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]
      summarySheet['!autofilter'] = { ref: `A7:E${summarySheetData.length}` }
      summarySheet['!views'] = [{ state: 'frozen', ySplit: 7 }]

      detailSheet['!cols'] = [
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
        { wch: 30 },
        { wch: 22 },
        { wch: 10 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 32 },
      ]
      detailSheet['!views'] = [{ state: 'frozen', ySplit: 3 }]

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan Rider')
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Rider per Kategori')
      const stamp = generatedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')
      XLSX.writeFile(workbook, `data-rider_${stamp}.xlsx`)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal export Excel data rider.' })
    } finally {
      setExportingRiderExcel(false)
    }
  }

  const handleExportRiderPdf = async () => {
    if (!eventId) return
    setExportingRiderPdf(true)
    try {
      const [eventRes, riderExport] = await Promise.all([
        apiFetch<{ data?: { name?: string; location?: string | null; event_date?: string | null; status?: string | null } }>(
          `/api/events/${eventId}`
        ),
        buildRiderCategoryExportData(),
      ])
      const eventName = eventRes.data?.name?.trim() || 'Event'
      const eventLocation = eventRes.data?.location?.trim() || '-'
      const eventDate = eventRes.data?.event_date ? formatDateTime(eventRes.data.event_date) : '-'

      const sections = riderExport.categoryGroups
        .flatMap(({ summary, rows }) => {
          const rowsPerSection = 16
          const chunks =
            rows.length === 0
              ? [[] as RiderExportItem[]]
              : Array.from({ length: Math.ceil(rows.length / rowsPerSection) }, (_, index) =>
                  rows.slice(index * rowsPerSection, (index + 1) * rowsPerSection)
                )
          const totalChunks = chunks.length

          return chunks.map((chunkRows, chunkIndex) => {
            const startNumber = chunkIndex * rowsPerSection
            const isContinuation = chunkIndex > 0
            const title = `${summary.label}${isContinuation ? ` · Lanjutan ${chunkIndex + 1}` : ''}`
            const countLabel =
              totalChunks > 1
                ? `${escapeHtml(startNumber + 1)}-${escapeHtml(startNumber + chunkRows.length)} dari ${escapeHtml(rows.length)} rider`
                : `${escapeHtml(rows.length)} rider`
            const tableRows =
              chunkRows.length === 0
                ? '<tr><td colspan="8" class="empty">Tidak ada rider terdaftar di kategori ini</td></tr>'
                : chunkRows
                    .map(
                      (row, index) => `
                        <tr>
                          <td>${startNumber + index + 1}</td>
                          <td>${escapeHtml(row.no_plate_display)}</td>
                          <td>${escapeHtml(row.name)}</td>
                          <td>${escapeHtml(row.rider_nickname ?? '-')}</td>
                          <td>${escapeHtml(row.gender)}</td>
                          <td>${escapeHtml(row.date_of_birth)}</td>
                          <td>${escapeHtml(row.jersey_size ?? '-')}</td>
                          <td>${escapeHtml(row.club ?? '-')}</td>
                        </tr>
                      `
                    )
                    .join('')

            return `
              <section class="category-section">
                <div class="category-header">
                  <h2>${escapeHtml(title)}</h2>
                  <div class="category-count">${countLabel}</div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>No Plate</th>
                      <th>Nama Rider</th>
                      <th>Panggilan</th>
                      <th>Gender</th>
                      <th>Tanggal Lahir</th>
                      <th>Jersey</th>
                      <th>Club</th>
                    </tr>
                  </thead>
                  <tbody>${tableRows}</tbody>
                </table>
              </section>
            `
          })
        })
        .join('')

      const html = buildAllRiderPrintHtml({
        eventName,
        location: eventLocation,
        eventDate,
        sections,
      })

      openPrintPreview(html)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal export PDF data rider.' })
    } finally {
      setExportingRiderPdf(false)
    }
  }

  return (
    <div className="admin-compact-page grid gap-4 p-3 sm:gap-5 sm:p-4 md:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-2">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Admin Registrations</div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Review Pendaftaran Event</h1>
            <p className="max-w-3xl text-sm font-medium text-slate-600">
              Review bukti pembayaran, validasi dokumen, rapikan nomor plate, lalu approve rider saat semua persyaratan sudah aman.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/admin/events/${eventId}/check-in`}
              className="admin-primary-button"
            >
              Check-in & Goodie Bag
            </Link>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              Menampilkan <span className="font-black text-slate-950">{registrations.length}</span> dari{' '}
              <span className="font-black text-slate-950">{meta.total}</span> pendaftaran
            </div>
          </div>
        </div>

        <form
          className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQuery(searchInput.trim())
          }}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.7fr))_auto_auto]">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama kontak, WA, email, komunitas, nama rider, atau plate"
              className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none ring-0 transition focus:border-slate-950"
            />
            <select
              value={filterStatus}
              onChange={(e) => {
                const nextStatus = e.target.value as 'ALL' | RegistrationStatus
                setFilterStatus(nextStatus)
                if (nextStatus !== 'APPROVED') setAttendanceFilter('ALL')
                setPage(1)
              }}
              className="min-h-12 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-950"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value as PaymentFilter)
                setPage(1)
              }}
              className="min-h-12 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-950"
            >
              {PAYMENT_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={attendanceFilter}
              onChange={(e) => applyAttendanceFilter(e.target.value as AttendanceFilter)}
              className="min-h-12 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-950"
            >
              {ATTENDANCE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-950"
            >
              {PAGE_SIZE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} / halaman
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="admin-primary-button"
            >
              Cari
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchInput('')
                setQuery('')
                setFilterStatus('ALL')
                setPaymentFilter('ALL')
                setAttendanceFilter('ALL')
                setPage(1)
                setPageSize(10)
                setFeedback(null)
              }}
              className="admin-outline-button"
            >
              Reset
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-500">
            <div>
              Halaman <span className="font-black text-slate-900">{meta.page}</span> dari{' '}
              <span className="font-black text-slate-900">{meta.totalPages}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportMenuOpen((prev) => !prev)}
                  className="admin-export-button min-w-[140px] justify-between"
                  aria-expanded={exportMenuOpen}
                >
                  <span>{exportButtonLabel}</span>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {exportMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 grid w-[260px] gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false)
                        void handleExportRegistrationExcel()
                      }}
                      disabled={exportBusy}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-black text-emerald-900 transition hover:border-emerald-500 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Registrasi XLSX
                      <span className="mt-0.5 block text-[11px] font-semibold text-emerald-700">Data pendaftaran lengkap</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false)
                        void handleExportRegistrationPdf()
                      }}
                      disabled={exportBusy}
                      className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs font-black text-sky-900 transition hover:border-sky-500 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Registrasi PDF
                      <span className="mt-0.5 block text-[11px] font-semibold text-sky-700">Preview cetak pendaftaran</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false)
                        void handleExportRiderExcel()
                      }}
                      disabled={exportBusy}
                      className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-left text-xs font-black text-violet-900 transition hover:border-violet-500 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Rider XLSX
                      <span className="mt-0.5 block text-[11px] font-semibold text-violet-700">Data rider per kategori</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExportMenuOpen(false)
                        void handleExportRiderPdf()
                      }}
                      disabled={exportBusy}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-xs font-black text-indigo-900 transition hover:border-indigo-500 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Rider PDF
                      <span className="mt-0.5 block text-[11px] font-semibold text-indigo-700">Preview cetak data rider</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRefreshTick((prev) => prev + 1)}
                className="admin-export-button"
              >
                Refresh Data
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-2">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Rekap Kehadiran Venue</div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">Pantau Konfirmasi, Check-in, dan Goodie Bag</h2>
            <p className="max-w-3xl text-sm font-medium text-slate-600">
              Angka ini dihitung dari registrasi yang sudah APPROVED, jadi panitia bisa membandingkan rencana hadir dengan kehadiran aktual di venue.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowAttendanceSummary((prev) => !prev)}
              className="admin-outline-button w-fit"
            >
              {showAttendanceSummary ? 'Sembunyikan Rekap' : 'Tampilkan Rekap'}
            </button>
            <Link
              href={`/admin/events/${eventId}/check-in`}
              className="admin-outline-button w-fit"
            >
              Buka Check-in
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
            Approved {attendanceSummary?.approved ?? '-'}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">
            Hadir {attendanceSummary?.confirmed_attending ?? '-'}
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-rose-800">
            Tidak Hadir {attendanceSummary?.confirmed_not_attending ?? '-'}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
            Belum Konfirmasi {attendanceSummary?.unconfirmed ?? '-'}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-800">
            Check-in {attendanceSummary?.checked_in ?? '-'}
          </span>
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-800">
            Goodie Bag {attendanceSummary?.goodie_bag_collected ?? '-'}
          </span>
        </div>

        {showAttendanceSummary && <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <button
            type="button"
            onClick={() => {
              setFilterStatus('APPROVED')
              setAttendanceFilter('ALL')
              setPage(1)
            }}
            className={`rounded-2xl border bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-sm ${
              filterStatus === 'APPROVED' && attendanceFilter === 'ALL'
                ? 'border-slate-900 ring-2 ring-slate-900/10'
                : 'border-slate-200'
            }`}
          >
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Approved</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{attendanceSummary?.approved ?? '-'}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Registrasi valid</div>
          </button>
          <button
            type="button"
            onClick={() => applyAttendanceFilter('ATTENDING')}
            className={`rounded-2xl border bg-emerald-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-sm ${
              attendanceFilter === 'ATTENDING'
                ? 'border-emerald-700 ring-2 ring-emerald-600/15'
                : 'border-emerald-200'
            }`}
          >
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Akan Hadir</div>
            <div className="mt-2 text-3xl font-black text-emerald-900">
              {attendanceSummary?.confirmed_attending ?? '-'}
            </div>
            <div className="mt-1 text-xs font-semibold text-emerald-700">Konfirmasi wali</div>
          </button>
          <button
            type="button"
            onClick={() => applyAttendanceFilter('NOT_ATTENDING')}
            className={`rounded-2xl border bg-rose-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-rose-500 hover:shadow-sm ${
              attendanceFilter === 'NOT_ATTENDING' ? 'border-rose-700 ring-2 ring-rose-600/15' : 'border-rose-200'
            }`}
          >
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-700">Tidak Hadir</div>
            <div className="mt-2 text-3xl font-black text-rose-900">
              {attendanceSummary?.confirmed_not_attending ?? '-'}
            </div>
            <div className="mt-1 text-xs font-semibold text-rose-700">Konfirmasi wali</div>
          </button>
          <button
            type="button"
            onClick={() => applyAttendanceFilter('UNCONFIRMED')}
            className={`rounded-2xl border bg-amber-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-sm ${
              attendanceFilter === 'UNCONFIRMED'
                ? 'border-amber-700 ring-2 ring-amber-600/15'
                : 'border-amber-200'
            }`}
          >
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">Belum Konfirmasi</div>
            <div className="mt-2 text-3xl font-black text-amber-900">{attendanceSummary?.unconfirmed ?? '-'}</div>
            <div className="mt-1 text-xs font-semibold text-amber-700">Perlu follow-up</div>
          </button>
          <button
            type="button"
            onClick={() => applyAttendanceFilter('CHECKED_IN')}
            className={`rounded-2xl border bg-sky-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-500 hover:shadow-sm ${
              attendanceFilter === 'CHECKED_IN' ? 'border-sky-700 ring-2 ring-sky-600/15' : 'border-sky-200'
            }`}
          >
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">Check-in</div>
            <div className="mt-2 text-3xl font-black text-sky-900">{attendanceSummary?.checked_in ?? '-'}</div>
            <div className="mt-1 text-xs font-semibold text-sky-700">Hadir aktual</div>
          </button>
          <button
            type="button"
            onClick={() => applyAttendanceFilter('GOODIE_BAG_COLLECTED')}
            className={`rounded-2xl border bg-violet-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-500 hover:shadow-sm ${
              attendanceFilter === 'GOODIE_BAG_COLLECTED'
                ? 'border-violet-700 ring-2 ring-violet-600/15'
                : 'border-violet-200'
            }`}
          >
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">Goodie Bag</div>
            <div className="mt-2 text-3xl font-black text-violet-900">
              {attendanceSummary?.goodie_bag_collected ?? '-'}
            </div>
            <div className="mt-1 text-xs font-semibold text-violet-700">Sudah diambil</div>
          </button>
        </div>}
      </section>

      {categoryKpis.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-2">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">KPI Pendaftaran per Kategori</div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">Pantau Slot dan Jumlah Pendaftar</h2>
              <p className="max-w-3xl text-sm font-medium text-slate-600">
                Ringkasan ini memisahkan rider yang sudah approved dari pendaftaran yang masih pending, jadi admin bisa lihat kondisi final sekaligus slot yang sedang ditahan.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowCategoryKpis((prev) => !prev)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
              >
                {showCategoryKpis ? 'Sembunyikan KPI' : 'Tampilkan KPI'}
              </button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                Approved <span className="font-black text-slate-950">{totalApprovedAcrossCategories}</span>
                <span className="mx-2 text-slate-300">•</span>
                Pending <span className="font-black text-amber-900">{totalPendingAcrossCategories}</span>
                <span className="mx-2 text-slate-300">•</span>
                Full <span className="font-black text-rose-900">{fullCategoryCount}</span>
              </div>
            </div>
          </div>

          {showCategoryKpis && (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  Approved Riders <span className="font-black text-slate-950">{totalApprovedAcrossCategories}</span>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  Pending Registrasi <span className="font-black">{totalPendingAcrossCategories}</span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  Total Slot Terpakai <span className="font-black text-slate-950">{totalFilledAcrossCategories}</span>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
                  Kategori Full <span className="font-black">{fullCategoryCount}</span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categoryKpis.map((category) => (
              <article
                key={category.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  category.isFull ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="text-sm font-black text-slate-950">{category.label}</div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {category.gender} · {category.year}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${
                      category.isFull
                        ? 'border-rose-300 bg-rose-100 text-rose-900'
                        : category.capacity == null
                          ? 'border-slate-300 bg-white text-slate-700'
                          : 'border-emerald-300 bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {category.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Approved Rider</span>
                    <span className="font-black text-slate-950">{category.approvedFilled}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Pending Registrasi</span>
                    <span className="font-black text-amber-900">{category.pendingFilled}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Total Slot Terpakai</span>
                    <span className="font-black text-slate-950">{category.filled}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Kapasitas</span>
                    <span className="font-black text-slate-950">{category.capacity == null ? 'Tanpa batas' : category.capacity}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Sisa Slot</span>
                    <span className={`font-black ${category.isFull ? 'text-rose-900' : 'text-emerald-900'}`}>
                      {category.remaining == null ? 'Tanpa batas' : category.remaining}
                    </span>
                  </div>
                </div>
              </article>
            ))}
              </div>
            </>
          )}
        </section>
      )}

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : feedback.type === 'info'
              ? 'border-sky-200 bg-sky-50 text-sky-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {loading && registrations.length === 0 ? (
        <RegistrationListSkeleton />
      ) : registrations.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <div className="text-lg font-black text-slate-950">Belum ada hasil</div>
          <div className="mt-2 text-sm font-medium text-slate-600">{emptyMessage}</div>
        </div>
      ) : (
        <div className="grid gap-4">
          {registrations.map((registration) => {
            const paymentSummary = aggregatePaymentStatus(registration.registration_payments ?? [])
            const readiness = getApprovalReadiness(registration)
            const isExpanded = expanded[registration.id] ?? false
            const isActionMenuOpen = actionMenuOpen === registration.id
            const approveDisabled =
              savingKey === `registration:${registration.id}` ||
              registration.status !== 'PENDING' ||
              !readiness.canApprove
            const deleteDisabled =
              savingKey === `registration:${registration.id}` ||
              (!isCentralAdmin && registration.status !== 'REJECTED')

            return (
              <section key={registration.id} className="admin-card overflow-visible p-0">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="grid gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-black text-slate-950">{registration.contact_name}</div>
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${registrationStatusBadge(
                            registration.status
                          )}`}
                        >
                          {registration.status}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${paymentStatusBadge(
                            paymentSummary
                          )}`}
                        >
                          {paymentSummary === 'NO_PAYMENT' ? 'Belum Bayar' : `Payment ${paymentSummary}`}
                        </span>
                        <span className="admin-tone-badge admin-tone-neutral">
                          {registration.registration_items.length} Rider
                        </span>
                      </div>
                      <div className="grid gap-2 text-sm font-medium text-slate-600">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>WA: {registration.contact_phone}</span>
                          <span>Dikirim {formatDateTime(registration.created_at)}</span>
                          <span>Total {formatRupiah(registration.total_amount)}</span>
                        </div>
                        <details className="admin-card-muted px-4 py-3">
                          <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                            Kontak & kesiapan data
                          </summary>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            {registration.contact_email && <span>Email: {registration.contact_email}</span>}
                            {registration.community_name && <span>Komunitas: {registration.community_name}</span>}
                            {registration.registration_code && (
                              <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 font-black text-amber-900">
                                {registration.registration_code}
                              </span>
                            )}
                            <span>{readiness.allItemsHaveDocs ? 'Dokumen lengkap' : 'Dokumen belum lengkap'}</span>
                            <span>
                              {!riderPhotoUploadEnabled
                                ? 'Foto tidak diwajibkan'
                                : readiness.allItemsHavePhotos
                                ? 'Foto lengkap'
                                : 'Foto belum lengkap'}
                            </span>
                          </div>
                        </details>
                      </div>
                    </div>

                    <div className="grid gap-3 xl:min-w-[380px]">
                      <div className="admin-action-row xl:justify-end">
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [registration.id]: !isExpanded }))}
                          className="admin-outline-button min-h-11"
                        >
                          {isExpanded ? 'Sembunyikan Detail' : 'Lihat Detail'}
                        </button>
                        <button
                          type="button"
                          disabled={approveDisabled}
                          onClick={() => openApproveModal(registration)}
                          title={
                            registration.status !== 'PENDING'
                              ? 'Pendaftaran ini sudah diproses.'
                              : readiness.blockingReasons[0] ?? 'Approve dan buat rider permanen'
                          }
                          className={
                            approveDisabled
                              ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-black uppercase tracking-[0.12em] text-slate-400 disabled:cursor-not-allowed'
                              : 'admin-success-button min-h-11'
                          }
                        >
                          {registration.status === 'APPROVED' ? 'Riders Created' : 'Approve & Create Riders'}
                        </button>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setActionMenuOpen((prev) => (prev === registration.id ? null : registration.id))
                            }
                            className="admin-outline-button min-h-11 justify-between"
                            aria-expanded={isActionMenuOpen}
                          >
                            <span>More</span>
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                              <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>

                          {isActionMenuOpen && (
                            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 grid w-[280px] gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                              <div className="px-2 pb-1 pt-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                                Notifikasi wali
                              </div>
                              <WhatsAppAction
                                eventId={eventId}
                                registration={registration}
                                kind="STATUS_ACCESS"
                                className="justify-start"
                                label="Kirim QR & Status"
                                onOpen={() => setActionMenuOpen(null)}
                              />
                              <button
                                type="button"
                                disabled={
                                  savingKey === `email:${registration.id}` ||
                                  !registration.registration_code?.trim() ||
                                  !registration.contact_email?.trim()
                                }
                                onClick={() => {
                                  setActionMenuOpen(null)
                                  void resendStatusEmail(registration)
                                }}
                                title={
                                  !registration.contact_email?.trim()
                                    ? 'Email wali rider belum diisi'
                                    : !registration.registration_code?.trim()
                                    ? 'Kode registrasi belum tersedia'
                                    : 'Kirim ulang email berisi kode, QR, dan link status'
                                }
                                className="admin-outline-button min-h-11 justify-start"
                              >
                                {savingKey === `email:${registration.id}` ? 'Mengirim Email...' : 'Kirim Email QR & Status'}
                              </button>
                              {registration.status !== 'PENDING' && (
                                <WhatsAppAction
                                  eventId={eventId}
                                  registration={registration}
                                  kind={registration.status === 'REJECTED' ? 'REJECTED' : 'APPROVED'}
                                  className="justify-start"
                                  label={registration.status === 'REJECTED' ? 'Kirim WA Penolakan' : 'Kirim WA Konfirmasi'}
                                  whatsappGroupInviteUrl={registration.status === 'APPROVED' ? whatsappGroupInviteUrl : null}
                                  categoryMap={registration.status === 'APPROVED' ? categoryMap : undefined}
                                  onOpen={() => setActionMenuOpen(null)}
                                />
                              )}

                              <div className="my-1 h-px bg-slate-200" />
                              <div className="px-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                                Aksi pendaftaran
                              </div>
                              <button
                                type="button"
                                disabled={savingKey === `contact:${registration.id}`}
                                onClick={() => {
                                  setActionMenuOpen(null)
                                  openContactModal(registration)
                                }}
                                className="admin-outline-button min-h-11 justify-start"
                              >
                                Edit Kontak Wali
                              </button>
                              <button
                                type="button"
                                disabled={savingKey === `registration:${registration.id}` || registration.status !== 'PENDING'}
                                onClick={() => {
                                  setActionMenuOpen(null)
                                  openRejectModal(registration)
                                }}
                                className="admin-danger-button min-h-11 justify-start"
                              >
                                Reject
                              </button>
                              {!isRegistrationApprover && (
                                <button
                                  type="button"
                                  disabled={deleteDisabled}
                                  onClick={() => {
                                    setActionMenuOpen(null)
                                    openDeleteModal(registration)
                                  }}
                                  className="admin-danger-button min-h-11 justify-start"
                                >
                                  {isCentralAdmin ? 'Delete' : 'Delete Rejected'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {!readiness.canApprove && registration.status === 'PENDING' && (
                    <div className="admin-card-tone-accent mt-4 rounded-2xl border px-4 py-3">
                      <div className="admin-kicker">Checklist Approval</div>
                      <ul className="admin-muted mt-2 grid gap-1 text-sm font-semibold">
                        {readiness.blockingReasons.map((reason) => (
                          <li key={reason}>- {reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {registration.notes && (
                    <div className="admin-card-muted mt-4 px-4 py-3">
                      <div className="admin-kicker">Catatan Admin</div>
                      <div className="admin-muted mt-2 text-sm font-medium">{registration.notes}</div>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="grid gap-5 px-5 py-5">
                    <section className="admin-card-muted p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Review Pembayaran</div>
                          <div className="mt-1 text-sm font-medium text-slate-600">
                            Approve bukti transfer dulu sebelum rider dibuat permanen.
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3">
                        {registration.registration_payments.length === 0 ? (
                          <div className="admin-card-muted border-dashed px-4 py-4 text-sm font-semibold">
                            Belum ada bukti pembayaran yang diupload.
                          </div>
                        ) : (
                          registration.registration_payments.map((payment) => (
                            <div
                              key={payment.id}
                              className="admin-card grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                            >
                              <div className="grid gap-1 text-sm text-slate-700">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${paymentStatusBadge(
                                      payment.status
                                    )}`}
                                  >
                                    {payment.status}
                                  </span>
                                  <span className="text-sm font-black text-slate-950">{formatRupiah(payment.amount)}</span>
                                </div>
                                <div>
                                  {payment.bank_name || '-'} | {payment.account_number || '-'} | {payment.account_name || '-'}
                                </div>
                              </div>

                              <div className="admin-action-row lg:justify-end">
                                <button
                                  type="button"
                                  onClick={() => openFile(payment.proof_url)}
                                  className="admin-outline-button min-h-11"
                                >
                                  Lihat Bukti
                                </button>
                                <button
                                  type="button"
                                  disabled={savingKey === `payment:${payment.id}` || payment.status === 'APPROVED'}
                                  onClick={() => updatePaymentStatus(registration, payment, 'APPROVED')}
                                  className="admin-success-button min-h-11"
                                >
                                  {savingKey === `payment:${payment.id}` ? 'Menyimpan...' : 'Approve Payment'}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingKey === `payment:${payment.id}` || payment.status === 'REJECTED'}
                                  onClick={() => updatePaymentStatus(registration, payment, 'REJECTED')}
                                  className="admin-danger-button min-h-11"
                                >
                                  {savingKey === `payment:${payment.id}` ? 'Menyimpan...' : 'Reject Payment'}
                                </button>
                              </div>

                              {paymentFeedback[payment.id] && (
                                <div
                                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                                    paymentFeedback[payment.id].type === 'success'
                                      ? 'admin-card-tone-success'
                                      : 'admin-card-tone-danger'
                                  }`}
                                >
                                  {paymentFeedback[payment.id].message}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </section>

                    <section className="grid gap-4 xl:grid-cols-2">
                      {registration.registration_items.map((item) => {
                        const docs = (registration.registration_documents ?? []).filter(
                          (doc) => doc.registration_item_id === item.id
                        )
                        const plateDraft = getPlateDraft(item)
                        const plateCheck = plateChecks[item.id]

                        return (
                          <article key={item.id} className="admin-card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="grid gap-1">
                                <div className="text-lg font-black text-slate-950">{item.rider_name}</div>
                                {item.rider_nickname && (
                                  <div className="text-sm font-semibold text-slate-600">Panggilan: {item.rider_nickname}</div>
                                )}
                                <div className="text-sm font-medium text-slate-600">
                                  {item.gender} | {item.date_of_birth} | {item.club || 'Tanpa club'}
                                </div>
                              </div>
                              <div className="admin-card-muted px-3 py-2 text-sm font-black">
                                {formatRupiah(item.price)}
                              </div>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm font-medium text-slate-700">
                              {item.jersey_size && <div>Jersey: {item.jersey_size}</div>}
                              <div>
                                Kategori Utama: {item.primary_category_id ? categoryMap.get(item.primary_category_id) ?? '-' : '-'}
                              </div>
                              <div>
                                Kategori Upclass: {formatUpclassCategories(item, categoryMap)}
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {registration.status === 'APPROVED' && (
                                <button
                                  type="button"
                                  disabled={savingKey === `upclass:${item.id}`}
                                  onClick={() => openUpclassModal(registration, item)}
                                  className="admin-success-button"
                                >
                                  {savingKey === `upclass:${item.id}` ? 'Menyimpan...' : 'Edit Upclass'}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!item.photo_url}
                                onClick={() => item.photo_url && openFile(item.photo_url)}
                                className="admin-outline-button"
                              >
                                Lihat Foto
                              </button>
                              {docs.length === 0 ? (
                                <div className="admin-card-tone-danger rounded-xl border border-dashed px-3 py-2 text-sm font-bold">
                                  Dokumen belum ada
                                </div>
                              ) : (
                                docs.map((doc) => (
                                  <button
                                    key={doc.id}
                                    type="button"
                                    onClick={() => openFile(doc.file_url)}
                                    className="admin-outline-button"
                                  >
                                    Lihat {doc.document_type}
                                  </button>
                                ))
                              )}
                            </div>

                            <div className="admin-card-muted mt-4 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Final Plate</div>
                                  <div className="mt-1 text-lg font-black text-slate-950">
                                    {buildPlateDisplay(plateDraft.number, plateDraft.suffix) || '-'}
                                  </div>
                                </div>
                                {plateCheck?.suggestedSuffix && (plateCheck.state === 'needs_suffix' || plateCheck.state === 'suffix_taken') && (
                                  <button
                                    type="button"
                                    onClick={() => applySuggestedSuffix(item, plateCheck.suggestedSuffix ?? '')}
                                    className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-amber-950 transition hover:bg-amber-200"
                                  >
                                    Pakai {plateCheck.suggestedSuffix}
                                  </button>
                                )}
                              </div>

                              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
                                <input
                                  value={plateDraft.number}
                                  onChange={(e) => handlePlateChange(item.id, 'number', e.target.value)}
                                  inputMode="numeric"
                                  placeholder="Nomor plate"
                                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-950"
                                />
                                <input
                                  value={plateDraft.suffix}
                                  onChange={(e) => handlePlateChange(item.id, 'suffix', e.target.value)}
                                  placeholder="Suffix"
                                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold uppercase text-slate-900 outline-none focus:border-slate-950"
                                />
                              </div>

                              <div className={`mt-3 rounded-2xl border px-3 py-2 text-sm font-semibold ${plateMessageTone(plateCheck?.state ?? 'idle')}`}>
                                {plateCheck?.message ?? 'Nomor plate siap dicek.'}
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </section>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-600">
          Halaman <span className="font-black text-slate-950">{meta.page}</span> dari{' '}
          <span className="font-black text-slate-950">{meta.totalPages}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Sebelumnya
          </button>
          <button
            type="button"
            disabled={page >= meta.totalPages || loading}
            onClick={() => setPage((prev) => Math.min(meta.totalPages, prev + 1))}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            Berikutnya
          </button>
        </div>
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  {modal.type === 'approve'
                    ? 'Approve Registration'
                    : modal.type === 'reject'
                    ? 'Reject Registration'
                    : modal.type === 'contact'
                    ? 'Edit Kontak Wali'
                    : modal.type === 'upclass'
                    ? 'Edit Upclass Rider'
                    : 'Delete Registration'}
                </div>
                <h2 className="text-xl font-black text-slate-950">{modal.registration.contact_name}</h2>
                <div className="text-sm font-medium text-slate-600">
                  {modal.registration.contact_phone} | {modal.registration.registration_items.length} rider
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
              >
                Tutup
              </button>
            </div>

            {modal.type === 'approve' && (
              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-sm font-black text-emerald-950">Semua rider akan dibuat permanen setelah Anda approve.</div>
                  <div className="mt-2 text-sm font-medium text-emerald-900">
                    Pastikan pembayaran sudah approved, dokumen lengkap, dan semua nomor plate berstatus aman.
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-black text-slate-900">Catatan Admin (opsional)</label>
                  <textarea
                    rows={4}
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Tambahkan catatan approval jika perlu"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-slate-950"
                  />
                </div>
              </div>
            )}

            {modal.type === 'reject' && (
              <div className="mt-5 grid gap-2">
                <label className="text-sm font-black text-slate-900">Alasan Penolakan</label>
                <textarea
                  rows={5}
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  placeholder="Tulis alasan kenapa pendaftaran ini ditolak"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-slate-950"
                />
              </div>
            )}

            {modal.type === 'delete' && (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-900">
                Data pendaftaran ini akan dihapus permanen. {isCentralAdmin
                  ? 'Central admin bisa menghapus registrasi walaupun pembayaran/rider sudah approved.'
                  : 'Admin event hanya bisa menghapus registrasi yang sudah rejected.'}
              </div>
            )}

            {modal.type === 'contact' && (
              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-medium text-sky-900">
                  Perubahan kontak dipakai untuk cek status, QR, email, dan WhatsApp wali. Sistem akan mencatat audit log perubahan ini.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Nama Penanggung Jawab *</span>
                    <input
                      value={contactForm.contact_name}
                      onChange={(event) => setContactForm((prev) => ({ ...prev, contact_name: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-slate-950"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Nomor WhatsApp *</span>
                    <input
                      value={contactForm.contact_phone}
                      onChange={(event) => setContactForm((prev) => ({ ...prev, contact_phone: event.target.value }))}
                      placeholder="08... / +62..."
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-slate-950"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Email Konfirmasi</span>
                    <input
                      type="email"
                      value={contactForm.contact_email}
                      onChange={(event) => setContactForm((prev) => ({ ...prev, contact_email: event.target.value }))}
                      placeholder="email@domain.com"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-slate-950"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Komunitas / Club</span>
                    <input
                      value={contactForm.community_name}
                      onChange={(event) => setContactForm((prev) => ({ ...prev, community_name: event.target.value }))}
                      placeholder="Nama komunitas"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-slate-950"
                    />
                  </label>
                </div>
              </div>
            )}

            {modal.type === 'upclass' && (
              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-950">
                  Edit upclass approved rider akan mengubah data resmi race. Kalau ada tambahan biaya, pastikan pembayaran tambahan sudah diterima sebelum kirim ulang konfirmasi WA/QR.
                </div>
                <div className="admin-card-muted p-4">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Rider</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{modal.item.rider_name}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-600">
                    Kategori utama: {modal.item.primary_category_id ? categoryMap.get(modal.item.primary_category_id) ?? '-' : '-'}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-600">
                    Upclass saat ini: {formatUpclassCategories(modal.item, categoryMap)}
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="text-sm font-black text-slate-900">Kategori Upclass</div>
                  <div className="grid max-h-72 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    {getValidUpclassCategories(modal.item).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm font-bold text-slate-500">
                        Tidak ada kategori upclass yang cocok.
                      </div>
                    ) : (
                      getValidUpclassCategories(modal.item).map((category) => {
                        const checked = upclassForm.category_ids.includes(category.id)
                        return (
                          <label
                            key={category.id}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm font-black transition ${
                              checked
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                            }`}
                          >
                            <span>
                              {category.label}
                              {typeof category.remaining === 'number' ? (
                                <span className="ml-2 text-xs font-bold text-slate-500">sisa {category.remaining}</span>
                              ) : null}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setUpclassForm((prev) => ({
                                  ...prev,
                                  category_ids: event.target.checked
                                    ? Array.from(new Set([...prev.category_ids, category.id]))
                                    : prev.category_ids.filter((id) => id !== category.id),
                                }))
                              }
                              className="h-5 w-5 accent-emerald-500"
                            />
                          </label>
                        )
                      })
                    )}
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    Bisa pilih lebih dari satu upclass. Sistem hanya menampilkan kategori yang sesuai tahun lahir dan gender rider.
                  </span>
                </div>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-slate-900">Catatan Perubahan (opsional)</span>
                  <textarea
                    rows={3}
                    value={upclassForm.notes}
                    onChange={(event) => setUpclassForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Contoh: wali menambah upclass dan sudah transfer tambahan"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none focus:border-slate-950"
                  />
                </label>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="admin-outline-button"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={Boolean(savingKey)}
                onClick={handleModalConfirm}
                className={
                  modal.type === 'approve' || modal.type === 'contact' || modal.type === 'upclass'
                    ? 'admin-success-button'
                    : 'admin-danger-button'
                }
              >
                {modal.type === 'approve'
                  ? 'Approve Sekarang'
                  : modal.type === 'reject'
                  ? 'Reject Sekarang'
                  : modal.type === 'contact'
                  ? 'Simpan Kontak'
                  : modal.type === 'upclass'
                  ? 'Simpan Upclass'
                  : 'Delete Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


