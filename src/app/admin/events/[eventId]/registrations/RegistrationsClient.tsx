'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  label: string
  year: number
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

type RegistrationItem = {
  id: string
  rider_name: string
  rider_nickname?: string | null
  jersey_size?: string | null
  date_of_birth: string
  gender: 'BOY' | 'GIRL'
  club: string | null
  primary_category_id: string | null
  extra_category_id: string | null
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
  community_name: string | null
  contact_name: string
  contact_phone: string
  contact_email: string | null
  status: RegistrationStatus
  total_amount: number
  notes: string | null
  created_at: string
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

type PlateCheckState = {
  state: 'idle' | 'checking' | 'available' | 'needs_suffix' | 'suffix_taken' | 'duplicate' | 'invalid' | 'error'
  message: string
  suggestedSuffix: string | null
}

type ModalState =
  | { type: 'approve'; registration: RegistrationRow }
  | { type: 'reject'; registration: RegistrationRow }
  | { type: 'delete'; registration: RegistrationRow }
  | null

type FeedbackState = { type: 'success' | 'error'; message: string } | null
type InlineFeedbackState = { type: 'success' | 'error'; message: string }

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

export default function RegistrationsClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [meta, setMeta] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 })
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [paymentFeedback, setPaymentFeedback] = useState<Record<string, InlineFeedbackState>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [plateInputs, setPlateInputs] = useState<Record<string, { number: string; suffix: string }>>({})
  const [plateChecks, setPlateChecks] = useState<Record<string, PlateCheckState>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [filterStatus, setFilterStatus] = useState<'ALL' | RegistrationStatus>('ALL')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [refreshTick, setRefreshTick] = useState(0)
  const [modal, setModal] = useState<ModalState>(null)
  const [modalNotes, setModalNotes] = useState('')

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.label])), [categories])
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
  const totalFilledAcrossCategories = useMemo(
    () => categoryKpis.reduce((sum, category) => sum + (category.filled ?? 0), 0),
    [categoryKpis]
  )

  const resolveFileUrl = async (pathOrUrl: string) => {
    if (!pathOrUrl) return null
    if (pathOrUrl.startsWith('http')) return pathOrUrl
    const res = await apiFetch<{ data?: { signedUrl?: string | null } }>('/api/admin/storage/signed-url', {
      method: 'POST',
      body: JSON.stringify({ path: pathOrUrl }),
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

  const getPlateDraft = (item: RegistrationItem) => ({
    number: (plateInputs[item.id]?.number ?? item.requested_plate_number ?? '').replace(/[^\d]/g, ''),
    suffix: (plateInputs[item.id]?.suffix ?? item.requested_plate_suffix ?? '').trim().toUpperCase().slice(0, 1),
  })

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
      registration.registration_items.length > 0 && registration.registration_items.every((item) => Boolean(item.photo_url))

    const plateIssues = registration.registration_items
      .map((item) => ({ item, check: plateChecks[item.id] }))
      .filter(({ item, check }) => !getPlateDraft(item).number || !isPlateReady(check))

    const blockingReasons: string[] = []
    if (registration.status !== 'PENDING') blockingReasons.push('Pendaftaran ini sudah diproses.')
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
        const res = await fetch(`/api/events/${eventId}/categories`)
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        setCategories((json?.data ?? []) as CategoryItem[])
      } catch {
        if (!cancelled) {
          setFeedback({ type: 'error', message: 'Gagal memuat kategori event.' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [eventId])

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
  }, [eventId, filterStatus, paymentFilter, page, pageSize, query, refreshTick])

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
  }, [eventId, registrations, plateInputs])

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

  const closeModal = () => {
    if (savingKey) return
    setModal(null)
    setModalNotes('')
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

      await apiFetch(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'APPROVED',
          notes: notes.trim() || null,
          items,
        }),
      })

      setFeedback({ type: 'success', message: `Pendaftaran ${registration.contact_name} berhasil di-approve.` })
      setModal(null)
      setModalNotes('')
      setRefreshTick((prev) => prev + 1)
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Gagal approve pendaftaran.' })
    } finally {
      setSavingKey(null)
    }
  }

  const rejectRegistration = async (registration: RegistrationRow, notes: string) => {
    const trimmedNotes = notes.trim()
    if (!trimmedNotes) {
      setFeedback({ type: 'error', message: 'Alasan penolakan wajib diisi.' })
      return
    }

    setSavingKey(`registration:${registration.id}`)
    try {
      await apiFetch(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'REJECTED', notes: trimmedNotes }),
      })
      setFeedback({ type: 'success', message: `Pendaftaran ${registration.contact_name} berhasil ditolak.` })
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
      await apiFetch(`/api/admin/events/${eventId}/registrations/${registration.id}/payments/${payment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
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
        type: 'success',
        message: `Pembayaran ${registration.contact_name} berhasil diubah ke ${nextStatus}.`,
      })
      setPaymentFeedback((prev) => ({
        ...prev,
        [payment.id]: {
          type: 'success',
          message: `Status pembayaran langsung berubah ke ${nextStatus}.`,
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
    await deleteRegistration(modal.registration)
  }

  const emptyMessage = useMemo(() => {
    if (loading) return 'Memuat pendaftaran...'
    if (query.trim()) {
      return `Tidak ada pendaftaran yang cocok dengan pencarian "${query}".`
    }
    if (filterStatus !== 'ALL' || paymentFilter !== 'ALL') {
      return 'Tidak ada pendaftaran yang cocok dengan filter saat ini.'
    }
    return 'Belum ada pendaftaran masuk untuk event ini.'
  }, [filterStatus, loading, paymentFilter, query])

  return (
    <div className="grid gap-5 p-4 md:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-2">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Admin Registrations</div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Review Pendaftaran Event</h1>
            <p className="max-w-3xl text-sm font-medium text-slate-600">
              Review bukti pembayaran, validasi dokumen, rapikan nomor plate, lalu approve rider saat semua persyaratan sudah aman.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            Menampilkan <span className="font-black text-slate-950">{registrations.length}</span> dari{' '}
            <span className="font-black text-slate-950">{meta.total}</span> pendaftaran
          </div>
        </div>

        <form
          className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQuery(searchInput.trim())
          }}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))_auto_auto]">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama kontak, WA, email, komunitas, nama rider, atau plate"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none ring-0 transition focus:border-slate-950"
            />
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as 'ALL' | RegistrationStatus)
                setPage(1)
              }}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-950"
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
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-950"
            >
              {PAYMENT_FILTER_OPTIONS.map((option) => (
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
              className="rounded-2xl border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
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
                setPage(1)
                setPageSize(10)
                setFeedback(null)
              }}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
            >
              Reset
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-500">
            <div>
              Halaman <span className="font-black text-slate-900">{meta.page}</span> dari{' '}
              <span className="font-black text-slate-900">{meta.totalPages}</span>
            </div>
            <button
              type="button"
              onClick={() => setRefreshTick((prev) => prev + 1)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
            >
              Refresh Data
            </button>
          </div>
        </form>
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
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categoryKpis.map((category) => (
              <article
                key={category.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  category.is_full ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'
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
        </section>
      )}

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {loading && registrations.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
          Memuat data pendaftaran...
        </div>
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

            return (
              <section key={registration.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
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
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                          {registration.registration_items.length} Rider
                        </span>
                      </div>
                      <div className="grid gap-1 text-sm font-medium text-slate-600">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>WA: {registration.contact_phone}</span>
                          {registration.contact_email && <span>Email: {registration.contact_email}</span>}
                          {registration.community_name && <span>Komunitas: {registration.community_name}</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          <span>Dikirim {formatDateTime(registration.created_at)}</span>
                          <span>Total {formatRupiah(registration.total_amount)}</span>
                          <span>{readiness.allItemsHaveDocs ? 'Dokumen lengkap' : 'Dokumen belum lengkap'}</span>
                          <span>{readiness.allItemsHavePhotos ? 'Foto lengkap' : 'Foto belum lengkap'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [registration.id]: !isExpanded }))}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                      >
                        {isExpanded ? 'Sembunyikan Detail' : 'Lihat Detail'}
                      </button>
                      <button
                        type="button"
                        disabled={savingKey === `registration:${registration.id}` || !readiness.canApprove}
                        onClick={() => openApproveModal(registration)}
                        className="rounded-2xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Approve & Create Riders
                      </button>
                      <button
                        type="button"
                        disabled={savingKey === `registration:${registration.id}` || registration.status !== 'PENDING'}
                        onClick={() => openRejectModal(registration)}
                        className="rounded-2xl border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-black text-rose-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={savingKey === `registration:${registration.id}` || registration.status !== 'REJECTED'}
                        onClick={() => openDeleteModal(registration)}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {!readiness.canApprove && registration.status === 'PENDING' && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-900">Checklist Approval</div>
                      <ul className="mt-2 grid gap-1 text-sm font-semibold text-amber-950">
                        {readiness.blockingReasons.map((reason) => (
                          <li key={reason}>- {reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {registration.notes && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Catatan Admin</div>
                      <div className="mt-2 text-sm font-medium text-slate-700">{registration.notes}</div>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="grid gap-5 px-5 py-5">
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-slate-500">
                            Belum ada bukti pembayaran yang diupload.
                          </div>
                        ) : (
                          registration.registration_payments.map((payment) => (
                            <div
                              key={payment.id}
                              className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
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

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openFile(payment.proof_url)}
                                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                                >
                                  Lihat Bukti
                                </button>
                                <button
                                  type="button"
                                  disabled={savingKey === `payment:${payment.id}` || payment.status === 'APPROVED'}
                                  onClick={() => updatePaymentStatus(registration, payment, 'APPROVED')}
                                  className="rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  {savingKey === `payment:${payment.id}` ? 'Menyimpan...' : 'Approve Payment'}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingKey === `payment:${payment.id}` || payment.status === 'REJECTED'}
                                  onClick={() => updatePaymentStatus(registration, payment, 'REJECTED')}
                                  className="rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-sm font-bold text-rose-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  {savingKey === `payment:${payment.id}` ? 'Menyimpan...' : 'Reject Payment'}
                                </button>
                              </div>

                              {paymentFeedback[payment.id] && (
                                <div
                                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                                    paymentFeedback[payment.id].type === 'success'
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                      : 'border-rose-200 bg-rose-50 text-rose-900'
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
                          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-950">
                                {formatRupiah(item.price)}
                              </div>
                            </div>

                            <div className="mt-4 grid gap-2 text-sm font-medium text-slate-700">
                              {item.jersey_size && <div>Jersey: {item.jersey_size}</div>}
                              <div>
                                Kategori Utama: {item.primary_category_id ? categoryMap.get(item.primary_category_id) ?? '-' : '-'}
                              </div>
                              {item.extra_category_id && (
                                <div>Kategori Tambahan: {categoryMap.get(item.extra_category_id) ?? '-'}</div>
                              )}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!item.photo_url}
                                onClick={() => item.photo_url && openFile(item.photo_url)}
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-950 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                Lihat Foto
                              </button>
                              {docs.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">
                                  Dokumen belum ada
                                </div>
                              ) : (
                                docs.map((doc) => (
                                  <button
                                    key={doc.id}
                                    type="button"
                                    onClick={() => openFile(doc.file_url)}
                                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                                  >
                                    Lihat {doc.document_type}
                                  </button>
                                ))
                              )}
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  {modal.type === 'approve' ? 'Approve Registration' : modal.type === 'reject' ? 'Reject Registration' : 'Delete Registration'}
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
                Data pendaftaran ini akan dihapus permanen. Gunakan aksi ini hanya jika pendaftaran memang sudah tidak diperlukan lagi.
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={Boolean(savingKey)}
                onClick={handleModalConfirm}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 ${
                  modal.type === 'approve'
                    ? 'border border-emerald-300 bg-emerald-100 text-emerald-950 hover:bg-emerald-200'
                    : modal.type === 'reject'
                      ? 'border border-rose-300 bg-rose-100 text-rose-950 hover:bg-rose-200'
                      : 'border border-slate-950 bg-slate-950 text-white hover:bg-slate-800'
                }`}
              >
                {modal.type === 'approve' ? 'Approve Sekarang' : modal.type === 'reject' ? 'Reject Sekarang' : 'Delete Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

