'use client'

import { appAlert } from '@/src/lib/appDialog'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import PublicTopbar from '../../../../components/PublicTopbar'
import PublicBackLink from '../../../../components/PublicBackLink'
import PublicEventFacts from '../../../../components/PublicEventFacts'
import {
  calculateAgeOnDate,
  getExactPrimaryCategoryCandidates,
  getFallbackPrimaryCategoryCandidates,
} from '../../../../lib/categoryAssignment'
import type { BusinessSettings } from '../../../../lib/eventService'
import { buildQrCodeUrl } from '../../../../lib/publicLinks'
import {
  RIDER_PHOTO_MAX_BYTES,
  SUPPORTING_IMAGE_MAX_BYTES,
  SUPPORTING_PDF_MAX_BYTES,
} from '../../../../lib/registrationUploadConfig'

type CategoryItem = {
  id: string
  year: number
  year_min?: number
  year_max?: number
  category_basis?: 'BIRTH_YEAR' | 'AGE'
  age_min?: number | null
  age_max?: number | null
  capacity?: number | null
  filled?: number
  remaining?: number | null
  is_full?: boolean
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled?: boolean
}

type RiderForm = {
  name: string
  nickname: string
  jerseySize: string
  dateOfBirth: string
  gender: 'BOY' | 'GIRL'
  club: string
  primaryCategoryId: string
  extraCategoryId: string
  bundleId: string
  pairedEventSelected: boolean
  pairedPrimaryCategoryId: string
  pairedExtraCategoryId: string
  pairedBundleId: string
  requestedPlateNumber: string
  requestedPlateSuffix: string
  usePlateSuffix: boolean
  photo?: File | null
  docKk?: File | null
  photoUrl?: string | null
  photoUploadStatus?: UploadStatus
  photoUploadError?: string
  docKkUrl?: string | null
  docKkPreviewUrl?: string | null
  docKkPreviewType?: 'image' | 'pdf' | null
  docKkUploadStatus?: UploadStatus
  docKkUploadError?: string
}

type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error'

type PlateCheckState = {
  state: 'idle' | 'checking' | 'available' | 'needs_suffix' | 'suffix_taken' | 'error'
  message: string
  suggestedSuffix: string | null
}

type RegistrationSuccess = {
  registrationCode: string
  pairedRegistrationCode?: string | null
  pairedEventName?: string | null
  riderNames: string[]
  totalAmount: number
  hasContactEmail: boolean
}

const REGISTRATION_STEPS = ['Kontak', 'Rider', 'Pembayaran', 'Review & Kirim'] as const

const DEFAULT_BASE_PRICE = 250000
const DEFAULT_EXTRA_PRICE = 150000
const JERSEY_SIZE_GUIDE_ROWS = [
  ['XS', '37-38', '25-26'],
  ['S', '39-40', '27-28'],
  ['M', '41-42', '29-30'],
  ['L', '43-44', '31-32'],
  ['XL', '45-46', '33-34'],
  ['2XL', '47-48', '35-36'],
  ['3XL', '49-50', '37-38'],
] as const
const DEFAULT_JERSEY_SIZE_OPTIONS = JERSEY_SIZE_GUIDE_ROWS.map(([size]) => size)

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

const buildRegistrationStatusUrl = (registrationCode: string) =>
  `https://racepushbike.com/registration-status?code=${encodeURIComponent(registrationCode)}`

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

const normalizePhoneDigits = (value: string) => {
  const trimmed = value.trim()
  const digits = trimmed.replace(/[^\d]/g, '').slice(0, 15)
  if (!digits) return ''
  if (trimmed.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  return digits
}

const normalizeWhatsappDigits = (value: string) => {
  const digits = normalizePhoneDigits(value)
  if (!digits) return ''
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

const isValidWhatsappNumber = (value: string) => {
  const digits = normalizeWhatsappDigits(value)
  if (digits.length < 10 || digits.length > 15) return false
  return /^[1-9]\d{9,14}$/.test(digits)
}

const getCompleteBirthYear = (dateOfBirth: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null
  const date = new Date(dateOfBirth)
  if (Number.isNaN(date.getTime())) return null
  return date.getUTCFullYear()
}

const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

const getFileKind = (file: File) => {
  const lowerName = file.name.toLowerCase()
  const isImage = file.type.startsWith('image/')
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
  return { isImage, isPdf }
}

const getUploadLimitBytes = (file: File, uploadType: 'rider-photo' | 'document' | 'payment') => {
  const { isImage, isPdf } = getFileKind(file)
  if (uploadType === 'rider-photo') return isImage ? RIDER_PHOTO_MAX_BYTES : null
  if (isPdf) return SUPPORTING_PDF_MAX_BYTES
  if (isImage) return SUPPORTING_IMAGE_MAX_BYTES
  return null
}

const getUploadHint = (uploadType: 'rider-photo' | 'document' | 'payment') => {
  if (uploadType === 'rider-photo') {
    return `Format gambar. Maks ${formatFileSize(RIDER_PHOTO_MAX_BYTES)}.`
  }
  return `Format gambar maks ${formatFileSize(SUPPORTING_IMAGE_MAX_BYTES)} atau PDF maks ${formatFileSize(
    SUPPORTING_PDF_MAX_BYTES
  )}.`
}

const validateUploadFile = (
  file: File | null | undefined,
  label: string,
  uploadType: 'rider-photo' | 'document' | 'payment'
) => {
  if (!(file instanceof File)) {
    return `${label} wajib diupload.`
  }

  const { isImage, isPdf } = getFileKind(file)
  if (uploadType === 'rider-photo' && !isImage) {
    return `${label} harus berupa gambar.`
  }
  if (uploadType !== 'rider-photo' && !isImage && !isPdf) {
    return `${label} harus berupa gambar atau PDF.`
  }

  const limit = getUploadLimitBytes(file, uploadType)
  if (!limit) {
    return `${label} tidak didukung.`
  }

  if (file.size > limit) {
    const kindLabel = isPdf ? 'PDF' : 'gambar'
    return `${label} terlalu besar (${formatFileSize(file.size)}). Maksimal ${formatFileSize(limit)} untuk file ${kindLabel}.`
  }

  return null
}

const getUploadTypeError = (label: string, uploadType: 'rider-photo' | 'document' | 'payment') => {
  if (uploadType === 'rider-photo') {
    return `${label} harus berupa gambar.`
  }
  return `${label} harus berupa gambar atau PDF.`
}

const parseJsonResponse = async (res: Response) => {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text }
  }
}

const buildNetworkStepError = (stepLabel: string) =>
  `${stepLabel} gagal karena koneksi terputus atau server tidak merespons. Coba cek internet lalu ulangi submit.`

const initialRider = (): RiderForm => ({
  name: '',
  nickname: '',
  jerseySize: '',
  dateOfBirth: '',
  gender: 'BOY',
  club: '',
  primaryCategoryId: '',
  extraCategoryId: '',
  bundleId: '',
  pairedEventSelected: false,
  pairedPrimaryCategoryId: '',
  pairedExtraCategoryId: '',
  pairedBundleId: '',
  requestedPlateNumber: '',
  requestedPlateSuffix: '',
  usePlateSuffix: false,
  photo: null,
  docKk: null,
  photoUrl: null,
  photoUploadStatus: 'idle',
  photoUploadError: '',
  docKkUrl: null,
  docKkPreviewUrl: null,
  docKkPreviewType: null,
  docKkUploadStatus: 'idle',
  docKkUploadError: '',
})

const initialPlateCheck = (): PlateCheckState => ({
  state: 'idle',
  message: '',
  suggestedSuffix: null,
})

const formatPlateDisplay = (plateNumber: string, plateSuffix: string, usePlateSuffix: boolean) => {
  const normalizedNumber = plateNumber.trim()
  if (!normalizedNumber) return '-'
  const normalizedSuffix = usePlateSuffix ? plateSuffix.trim().toUpperCase().slice(0, 1) : ''
  return `${normalizedNumber}${normalizedSuffix}`
}

function JerseySizeChartGraphic() {
  return (
    <svg viewBox="0 0 1180 820" className="w-full" role="img" aria-label="Sleeveless baselayer size chart">
      <rect x="0" y="0" width="1180" height="820" rx="32" fill="#ffffff" />
      <text x="590" y="92" textAnchor="middle" fontSize="58" fontWeight="900" fontStyle="italic" fill="#111111">
        SLEEVELESS BASELAYER
      </text>
      <text x="590" y="150" textAnchor="middle" fontSize="50" fontWeight="500" fill="#111111">
        SIZECHART
      </text>

      <g transform="translate(110,245)">
        <rect x="0" y="0" width="340" height="430" fill="#ffffff" stroke="#111111" strokeWidth="2" />
        <line x1="96" y1="0" x2="96" y2="430" stroke="#111111" strokeWidth="1.5" />
        <line x1="214" y1="0" x2="214" y2="430" stroke="#111111" strokeWidth="1.5" />
        <line x1="0" y1="74" x2="340" y2="74" stroke="#111111" strokeWidth="1.5" />
        {JERSEY_SIZE_GUIDE_ROWS.map((row, index) => {
          const y = 74 + (index + 1) * 50
          return <line key={`row-line-${row[0]}`} x1="0" y1={y} x2="340" y2={y} stroke="#111111" strokeWidth="1.2" />
        })}
        <text x="48" y="48" textAnchor="middle" fontSize="18" fontWeight="700" fill="#111111">
          SIZE
        </text>
        <text x="155" y="48" textAnchor="middle" fontSize="18" fontWeight="700" fill="#111111">
          PANJANG
        </text>
        <text x="277" y="48" textAnchor="middle" fontSize="18" fontWeight="700" fill="#111111">
          LEBAR
        </text>
        {JERSEY_SIZE_GUIDE_ROWS.map((row, index) => {
          const textY = 108 + index * 50
          return (
            <g key={row[0]}>
              <text x="48" y={textY} textAnchor="middle" fontSize="18" fontWeight="500" fill="#111111">
                {row[0]}
              </text>
              <text x="155" y={textY} textAnchor="middle" fontSize="18" fontWeight="500" fill="#111111">
                {row[1]}
              </text>
              <text x="277" y={textY} textAnchor="middle" fontSize="18" fontWeight="500" fill="#111111">
                {row[2]}
              </text>
            </g>
          )
        })}
      </g>

      <g transform="translate(650,200)">
        <path
          d="M84 58 134 46c16 38 72 60 138 60s122-22 138-60l50 12-8 168c-1 28 12 82 12 208l-8 176c-44 20-282 20-326 0l-8-176c0-126 13-180 12-208Z"
          fill="none"
          stroke="#111111"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M144 50c8 52 36 88 128 88s120-36 128-88"
          fill="none"
          stroke="#111111"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M120 610c38-22 270-22 308 0"
          fill="none"
          stroke="#111111"
          strokeWidth="2"
          opacity="0.5"
        />
        <line x1="88" y1="266" x2="460" y2="266" stroke="#c73d3d" strokeWidth="3" strokeDasharray="10 10" />
        <line x1="308" y1="46" x2="308" y2="648" stroke="#c73d3d" strokeWidth="3" strokeDasharray="10 10" />
        <text x="207" y="294" textAnchor="middle" fontSize="20" fontWeight="500" fill="#111111">
          LEBAR
        </text>
        <text
          x="296"
          y="426"
          textAnchor="middle"
          fontSize="20"
          fontWeight="500"
          fill="#111111"
          transform="rotate(-90 296 426)"
        >
          PANJANG
        </text>
      </g>
    </svg>
  )
}

export default function RegisterClient({ eventId }: { eventId: string }) {
  const [activeStep, setActiveStep] = useState(1)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [eventName, setEventName] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState<string | null>(null)
  const [eventLocation, setEventLocation] = useState<string | null>(null)
  const [eventPosterUrl, setEventPosterUrl] = useState<string | null>(null)
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null)
  const [pairedEvent, setPairedEvent] = useState<{ id: string; name: string; eventDate: string | null; registrationOpen: boolean } | null>(null)
  const [pairedCategories, setPairedCategories] = useState<CategoryItem[]>([])
  const [pairedBusinessSettings, setPairedBusinessSettings] = useState<BusinessSettings | null>(null)
  const [pairedExtraPrice, setPairedExtraPrice] = useState(DEFAULT_EXTRA_PRICE)
  const [pairedRequireJerseySize, setPairedRequireJerseySize] = useState(false)
  const [businessSettingsLoaded, setBusinessSettingsLoaded] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [prefillMessage, setPrefillMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [prefillCandidates, setPrefillCandidates] = useState<Array<{ id: string; masked_name: string }>>([])
  const [prefillModalOpen, setPrefillModalOpen] = useState(false)
  const [selectedPrefillRiderIds, setSelectedPrefillRiderIds] = useState<string[]>([])
  const [prefillDateOfBirths, setPrefillDateOfBirths] = useState<Record<string, string>>({})
  const [loadedPrefillIds, setLoadedPrefillIds] = useState<string[]>([])
  const [contactEmail, setContactEmail] = useState('')
  const [riders, setRiders] = useState<RiderForm[]>([initialRider()])
  const eventBundleSelected = riders.some((rider) => rider.pairedEventSelected)
  const [basePrice, setBasePrice] = useState(DEFAULT_BASE_PRICE)
  const [extraPrice, setExtraPrice] = useState(DEFAULT_EXTRA_PRICE)
  const [requireJerseySize, setRequireJerseySize] = useState(false)
  const [jerseySizeChartFailed, setJerseySizeChartFailed] = useState(false)
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [paymentProof, setPaymentProof] = useState<File | null>(null)
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null)
  const [paymentUploadStatus, setPaymentUploadStatus] = useState<UploadStatus>('idle')
  const [paymentUploadError, setPaymentUploadError] = useState('')
  const paymentProofSelectionRef = useRef<File | null>(null)
  const [dragActiveKey, setDragActiveKey] = useState<string | null>(null)
  const [plateChecks, setPlateChecks] = useState<PlateCheckState[]>([initialPlateCheck()])
  const [birthDateTouched, setBirthDateTouched] = useState<boolean[]>([false])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false)
  const [slotFullModal, setSlotFullModal] = useState<{ title: string; message: string } | null>(null)
  const [duplicateRegistrationModal, setDuplicateRegistrationModal] = useState<{ message: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      setBusinessSettingsLoaded(false)
      try {
        const res = await fetch(`/api/events/${eventId}`)
        const json = await res.json()
        setEventName(json?.data?.name ?? null)
        setEventDate(typeof json?.data?.event_date === 'string' ? json.data.event_date : null)
        setEventLocation(typeof json?.data?.location === 'string' ? json.data.location : null)
        setEventPosterUrl(typeof json?.data?.event_poster_url === 'string' ? json.data.event_poster_url : null)
        setBusinessSettings((json?.data?.business_settings ?? null) as BusinessSettings | null)
        setRegistrationOpen(json?.data?.registration_open !== false)
      } catch {
        setEventName(null)
        setEventDate(null)
        setEventLocation(null)
        setEventPosterUrl(null)
        setBusinessSettings(null)
        setRegistrationOpen(true)
      } finally {
        setBusinessSettingsLoaded(true)
      }
    }
    const loadCategories = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/categories`)
        const json = await res.json()
        const list = (json?.data ?? []) as CategoryItem[]
        setCategories(list.filter((item) => item.enabled !== false))
      } catch {
        setCategories([])
      }
    }
    const loadSettings = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/settings`)
        const json = await res.json()
        const data = json?.data ?? null
        const base = Number(data?.base_price)
        const extra = Number(data?.extra_price)
        setRequireJerseySize(Boolean(data?.require_jersey_size))
        setRegistrationOpen(data?.registration_open !== false)
        setBasePrice(Number.isFinite(base) && base > 0 ? base : DEFAULT_BASE_PRICE)
        setExtraPrice(Number.isFinite(extra) && extra >= 0 ? extra : DEFAULT_EXTRA_PRICE)
      } catch {
        setBasePrice(DEFAULT_BASE_PRICE)
        setExtraPrice(DEFAULT_EXTRA_PRICE)
        setRequireJerseySize(false)
        setRegistrationOpen(true)
      }
    }
    load()
    loadCategories()
    loadSettings()
  }, [eventId])

  useEffect(() => {
    const offer = businessSettings?.event_bundle_offer
    if (!offer?.enabled || !offer.paired_event_id || offer.paired_event_id === eventId) {
      setPairedEvent(null)
      setPairedCategories([])
      setPairedBusinessSettings(null)
      setRiders((current) => current.map((rider) => ({
        ...rider,
        pairedEventSelected: false,
        pairedPrimaryCategoryId: '',
        pairedExtraCategoryId: '',
        pairedBundleId: '',
      })))
      return
    }

    let cancelled = false
    const loadPairedEvent = async () => {
      try {
        const [eventResponse, categoriesResponse, settingsResponse] = await Promise.all([
          fetch(`/api/events/${offer.paired_event_id}`),
          fetch(`/api/events/${offer.paired_event_id}/categories`),
          fetch(`/api/events/${offer.paired_event_id}/settings`),
        ])
        const [eventJson, categoriesJson, settingsJson] = await Promise.all([
          eventResponse.json(), categoriesResponse.json(), settingsResponse.json(),
        ])
        if (!eventResponse.ok || !categoriesResponse.ok || !settingsResponse.ok) throw new Error('Data event pasangan belum tersedia.')
        if (cancelled) return
        const event = eventJson?.data
        const settings = settingsJson?.data
        setPairedEvent({
          id: offer.paired_event_id,
          name: typeof event?.name === 'string' ? event.name : offer.name,
          eventDate: typeof event?.event_date === 'string' ? event.event_date : null,
          registrationOpen: event?.registration_open !== false && settings?.registration_open !== false && event?.status !== 'FINISHED',
        })
        setPairedCategories(((categoriesJson?.data ?? []) as CategoryItem[]).filter((category) => category.enabled !== false))
        setPairedBusinessSettings((event?.business_settings ?? settings?.business_settings ?? null) as BusinessSettings | null)
        setPairedRequireJerseySize(Boolean(settings?.require_jersey_size))
        const extra = Number(settings?.extra_price)
        setPairedExtraPrice(Number.isFinite(extra) && extra >= 0 ? extra : DEFAULT_EXTRA_PRICE)
      } catch {
        if (!cancelled) {
          setPairedEvent(null)
          setPairedCategories([])
          setPairedBusinessSettings(null)
          setPairedRequireJerseySize(false)
        }
      }
    }
    void loadPairedEvent()
    return () => { cancelled = true }
  }, [businessSettings?.event_bundle_offer, eventId])

  const deletePendingUpload = async (path: string | null | undefined) => {
    if (!path) return
    try {
      await fetch(`/api/public/events/${eventId}/registration-uploads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
    } catch {}
  }

  const uploadRegistrationFile = async (
    file: File,
    kind: 'rider-photo' | 'document' | 'payment',
    label: string
  ) => {
    const body = new FormData()
    body.append('file', file)
    body.append('kind', kind)

    let response: Response
    try {
      response = await fetch(`/api/public/events/${eventId}/registration-uploads`, {
        method: 'POST',
        body,
      })
    } catch {
      throw new Error(buildNetworkStepError(`Upload ${label}`))
    }

    const json = await parseJsonResponse(response)
    if (!response.ok) {
      throw new Error(json?.error || json?._raw || `${label} gagal diupload.`)
    }

    const path = typeof json?.data?.path === 'string' ? json.data.path : ''
    if (!path) throw new Error(`${label} berhasil diproses, tetapi URL file tidak ditemukan.`)
    return path
  }

  const uploadRiderFile = async (
    index: number,
    file: File | null,
    kind: 'rider-photo' | 'document',
    label: string
  ) => {
    if (!file) return
    const currentRider = riders[index]
    const previousPath = kind === 'rider-photo' ? currentRider?.photoUrl : currentRider?.docKkUrl
    const fileField = kind === 'rider-photo' ? 'photo' : 'docKk'
    const urlField = kind === 'rider-photo' ? 'photoUrl' : 'docKkUrl'
    const statusField = kind === 'rider-photo' ? 'photoUploadStatus' : 'docKkUploadStatus'
    const errorField = kind === 'rider-photo' ? 'photoUploadError' : 'docKkUploadError'

    setRiders((prev) =>
      prev.map((rider, idx) =>
        idx === index
          ? {
              ...rider,
              [fileField]: file,
              [urlField]: null,
              ...(kind === 'document' ? { docKkPreviewUrl: null, docKkPreviewType: null } : {}),
              [statusField]: 'uploading',
              [errorField]: '',
            }
          : rider
      )
    )

    try {
      const path = await uploadRegistrationFile(file, kind, label)
      setRiders((prev) =>
        prev.map((rider, idx) =>
          idx === index && rider[fileField] === file
            ? {
                ...rider,
                [urlField]: path,
                [statusField]: 'uploaded',
                [errorField]: '',
              }
            : rider
        )
      )
      if (previousPath && previousPath !== path) void deletePendingUpload(previousPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : `${label} gagal diupload.`
      setRiders((prev) =>
        prev.map((rider, idx) =>
          idx === index && rider[fileField] === file
            ? {
                ...rider,
                [urlField]: null,
                [statusField]: 'error',
                [errorField]: message,
              }
            : rider
        )
      )
    }
  }

  const uploadPaymentProof = async (file: File | null) => {
    if (!file) return
    const previousPath = paymentProofUrl
    paymentProofSelectionRef.current = file
    setPaymentProof(file)
    setPaymentProofUrl(null)
    setPaymentUploadStatus('uploading')
    setPaymentUploadError('')

    try {
      const path = await uploadRegistrationFile(file, 'payment', 'bukti pembayaran')
      if (paymentProofSelectionRef.current !== file) {
        void deletePendingUpload(path)
        return
      }
      setPaymentProofUrl(path)
      setPaymentUploadStatus('uploaded')
      setPaymentUploadError('')
      if (previousPath && previousPath !== path) void deletePendingUpload(previousPath)
    } catch (error) {
      if (paymentProofSelectionRef.current !== file) return
      setPaymentProofUrl(null)
      setPaymentUploadStatus('error')
      setPaymentUploadError(error instanceof Error ? error.message : 'Bukti pembayaran gagal diupload.')
    }
  }

  const addRider = () => {
    setRiders((prev) => [...prev, initialRider()])
    setPlateChecks((prev) => [...prev, initialPlateCheck()])
    setBirthDateTouched((prev) => [...prev, false])
  }

  const removeRider = (index: number) => {
    const removedRider = riders[index]
    if (removedRider?.photoUrl) void deletePendingUpload(removedRider.photoUrl)
    if (removedRider?.docKkUrl) void deletePendingUpload(removedRider.docKkUrl)
    setRiders((prev) => prev.filter((_, idx) => idx !== index).map((item) => ({ ...item })))
    setPlateChecks((prev) => prev.filter((_, idx) => idx !== index))
    setBirthDateTouched((prev) => prev.filter((_, idx) => idx !== index))
  }

  const updateRider = (index: number, updates: Partial<RiderForm>) => {
    const normalizedUpdates = { ...updates }

    if (
      Object.prototype.hasOwnProperty.call(normalizedUpdates, 'dateOfBirth') ||
      Object.prototype.hasOwnProperty.call(normalizedUpdates, 'gender')
    ) {
      normalizedUpdates.primaryCategoryId = ''
      normalizedUpdates.extraCategoryId = ''
      normalizedUpdates.pairedPrimaryCategoryId = ''
      normalizedUpdates.pairedExtraCategoryId = ''
    }

    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'dateOfBirth')) {
      setBirthDateTouched((prev) => prev.map((item, idx) => (idx === index ? false : item)))
    }

    if (typeof normalizedUpdates.requestedPlateNumber === 'string') {
      normalizedUpdates.requestedPlateNumber = normalizedUpdates.requestedPlateNumber.replace(/[^\d]/g, '').slice(0, 3)
    }

    if (typeof normalizedUpdates.requestedPlateNumber === 'string' && normalizedUpdates.requestedPlateNumber.trim() === '') {
      normalizedUpdates.requestedPlateSuffix = ''
      normalizedUpdates.usePlateSuffix = false
    }

    if (typeof normalizedUpdates.requestedPlateSuffix === 'string') {
      normalizedUpdates.requestedPlateSuffix = normalizedUpdates.requestedPlateSuffix.toUpperCase().slice(0, 1)
      if (normalizedUpdates.requestedPlateSuffix) {
        normalizedUpdates.usePlateSuffix = true
      }
    }

    if (normalizedUpdates.usePlateSuffix === false) {
      normalizedUpdates.requestedPlateSuffix = ''
    }

    setRiders((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...normalizedUpdates } : item)))

    if (
      Object.prototype.hasOwnProperty.call(normalizedUpdates, 'requestedPlateNumber') ||
      Object.prototype.hasOwnProperty.call(normalizedUpdates, 'requestedPlateSuffix') ||
      Object.prototype.hasOwnProperty.call(normalizedUpdates, 'usePlateSuffix')
    ) {
      setPlateChecks((prev) => prev.map((item, idx) => (idx === index ? initialPlateCheck() : item)))
    }
  }

  const clearPrefillLookup = () => {
    setPrefillCandidates([])
    setPrefillModalOpen(false)
    setSelectedPrefillRiderIds([])
    setPrefillDateOfBirths({})
    setPrefillMessage(null)
  }

  const lookupPreviousRiders = async () => {
    if (!isValidWhatsappNumber(contactPhone)) {
      setPrefillMessage({ type: 'error', text: 'Isi nomor WhatsApp wali yang sama seperti pendaftaran sebelumnya.' })
      return
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setPrefillMessage({ type: 'error', text: 'Format email wali belum benar.' })
      return
    }

    setPrefillLoading(true)
    setPrefillMessage(null)
    try {
      const response = await fetch(`/api/public/events/${eventId}/registration-prefill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lookup', contact_phone: normalizeWhatsappDigits(contactPhone), contact_email: contactEmail.trim().toLowerCase() }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(json?.error || 'Data rider sebelumnya gagal dimuat.')
      const candidates = Array.isArray(json?.data?.riders) ? json.data.riders : []
      if (candidates.length === 0) throw new Error('Tidak ditemukan rider pada pendaftaran dengan nomor WhatsApp dan email tersebut.')
      setPrefillCandidates(candidates)
      setPrefillModalOpen(true)
      setSelectedPrefillRiderIds([])
      setPrefillDateOfBirths({})
      setPrefillMessage({ type: 'success', text: `Ditemukan ${candidates.length} rider. Pilih nama yang cocok untuk melanjutkan verifikasi.` })
      return true
    } catch (error) {
      setPrefillCandidates([])
      setPrefillMessage({ type: 'error', text: error instanceof Error ? error.message : 'Data rider sebelumnya gagal dimuat.' })
      return false
    } finally {
      setPrefillLoading(false)
    }
  }

  const loadPreviousRiders = async () => {
    if (selectedPrefillRiderIds.length === 0 || selectedPrefillRiderIds.some((id) => !prefillDateOfBirths[id])) {
      setPrefillMessage({ type: 'error', text: 'Pilih satu atau beberapa rider, lalu isi tanggal lahir masing-masing.' })
      return
    }
    setPrefillLoading(true)
    setPrefillMessage(null)
    try {
      const response = await fetch(`/api/public/events/${eventId}/registration-prefill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'load_many',
          contact_phone: normalizeWhatsappDigits(contactPhone),
          contact_email: contactEmail.trim().toLowerCase(),
          riders: selectedPrefillRiderIds.map((id) => ({ id, date_of_birth: prefillDateOfBirths[id] })),
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(json?.error || 'Verifikasi data rider gagal.')
      const sourceRiders = Array.isArray(json?.data?.riders) ? json.data.riders : []
      if (sourceRiders.length !== selectedPrefillRiderIds.length || sourceRiders.some((rider: { name?: unknown }) => typeof rider?.name !== 'string')) {
        throw new Error('Data rider tidak lengkap. Coba verifikasi lagi.')
      }

      const duplicateRider = sourceRiders.find((sourceRider: { name: string; date_of_birth: string }) =>
        riders.some((rider) => rider.name.trim().toLowerCase() === sourceRider.name.trim().toLowerCase() && rider.dateOfBirth === sourceRider.date_of_birth)
      )
      if (duplicateRider) throw new Error(`Rider ${duplicateRider.name} sudah ada di formulir.`)

      const nextRiders = [...riders]
      const nextPlateChecks = [...plateChecks]
      const nextBirthDateTouched = [...birthDateTouched]
      for (const sourceRider of sourceRiders) {
        const nextRider: RiderForm = {
          ...initialRider(),
          name: sourceRider.name,
          nickname: sourceRider.nickname ?? '',
          jerseySize: sourceRider.jersey_size ?? '',
          dateOfBirth: sourceRider.date_of_birth,
          gender: sourceRider.gender,
          club: sourceRider.club ?? '',
          requestedPlateNumber: sourceRider.requested_plate_number ?? '',
          requestedPlateSuffix: sourceRider.requested_plate_suffix ?? '',
          usePlateSuffix: Boolean(sourceRider.requested_plate_suffix),
          docKkUrl: sourceRider.document_upload_path ?? null,
          docKkPreviewUrl: sourceRider.document_preview_url ?? null,
          docKkPreviewType: sourceRider.document_preview_type ?? null,
          docKkUploadStatus: sourceRider.document_upload_path ? 'uploaded' : 'idle',
        }
        const emptyIndex = nextRiders.findIndex((rider) => !rider.name.trim() && !rider.dateOfBirth && !rider.photoUrl && !rider.docKkUrl)
        if (emptyIndex >= 0) {
          nextRiders[emptyIndex] = nextRider
          nextPlateChecks[emptyIndex] = initialPlateCheck()
          nextBirthDateTouched[emptyIndex] = false
        } else {
          nextRiders.push(nextRider)
          nextPlateChecks.push(initialPlateCheck())
          nextBirthDateTouched.push(false)
        }
      }
      setRiders(nextRiders)
      setPlateChecks(nextPlateChecks)
      setBirthDateTouched(nextBirthDateTouched)
      setLoadedPrefillIds((current) => [...new Set([...current, ...selectedPrefillRiderIds])])
      setPrefillMessage({ type: 'success', text: `${sourceRiders.length} data rider berhasil ditambahkan ke formulir.` })
      setSelectedPrefillRiderIds([])
      setPrefillDateOfBirths({})
      setPrefillModalOpen(false)
    } catch (error) {
      setPrefillMessage({ type: 'error', text: error instanceof Error ? error.message : 'Verifikasi data rider gagal.' })
    } finally {
      setPrefillLoading(false)
    }
  }

  const isCategoryFull = (category: CategoryItem) => {
    if (category.is_full === true) return true
    if (typeof category.capacity !== 'number') return false
    if (typeof category.remaining !== 'number') return false
    return category.remaining <= 0
  }

  const getExactPrimaryCategories = useCallback((birthYear: number | null, gender: 'BOY' | 'GIRL', dateOfBirth?: string) => {
    if (!birthYear) return []
    return getExactPrimaryCategoryCandidates(categories, birthYear, gender, dateOfBirth, eventDate)
  }, [categories, eventDate])

  const getAvailableExactPrimaryCategory = useCallback((birthYear: number | null, gender: 'BOY' | 'GIRL', dateOfBirth?: string) => {
    return getExactPrimaryCategories(birthYear, gender, dateOfBirth).find((category) => !isCategoryFull(category)) ?? null
  }, [getExactPrimaryCategories])

  const getFallbackPrimaryCategories = useCallback((birthYear: number | null, gender: 'BOY' | 'GIRL', dateOfBirth?: string) => {
    if (!birthYear) return []
    return getFallbackPrimaryCategoryCandidates(categories, birthYear, gender, dateOfBirth, eventDate)
  }, [categories, eventDate])

  const getAvailableBirthYearRange = useCallback((gender: 'BOY' | 'GIRL') => {
    const compatibleCategories = categories.filter((category) => category.category_basis !== 'AGE' && (category.gender === gender || category.gender === 'MIX'))
    if (compatibleCategories.length === 0) return null
    const years = compatibleCategories.flatMap((category) => [
      category.year_min ?? category.year,
      category.year_max ?? category.year,
    ])
    return {
      min: Math.min(...years),
      max: Math.max(...years),
    }
  }, [categories])

  const getSelectedFallbackPrimaryCategory = useCallback((
    birthYear: number | null,
    gender: 'BOY' | 'GIRL',
    primaryCategoryId: string,
    dateOfBirth?: string
  ) => getFallbackPrimaryCategories(birthYear, gender, dateOfBirth).find((category) => category.id === primaryCategoryId) ?? null, [
    getFallbackPrimaryCategories,
  ])

  const computePrimaryCategory = useCallback((
    birthYear: number | null,
    gender: 'BOY' | 'GIRL',
    primaryCategoryId: string,
    dateOfBirth?: string
  ) => {
    const exactCandidates = getExactPrimaryCategories(birthYear, gender, dateOfBirth)
    if (birthYear && exactCandidates.length === 0) return null
    const exact = getAvailableExactPrimaryCategory(birthYear, gender, dateOfBirth)
    if (exact) return exact
    const fallback = getSelectedFallbackPrimaryCategory(birthYear, gender, primaryCategoryId, dateOfBirth)
    if (!fallback || isCategoryFull(fallback)) return null
    return fallback
  }, [getAvailableExactPrimaryCategory, getExactPrimaryCategories, getSelectedFallbackPrimaryCategory])

  const getPrimaryCategoryIssue = useCallback((
    birthYear: number | null,
    gender: 'BOY' | 'GIRL',
    primaryCategoryId: string,
    dateOfBirth?: string
  ) => {
    if (!birthYear) return null
    const exactCandidates = getExactPrimaryCategories(birthYear, gender, dateOfBirth)
    if (exactCandidates.length === 0) return 'invalid'
    const exactAvailable = exactCandidates.find((category) => !isCategoryFull(category))
    if (exactAvailable) return null
    const fallbackOptions = getFallbackPrimaryCategories(birthYear, gender, dateOfBirth).filter((category) => !isCategoryFull(category))
    if (fallbackOptions.length === 0) return 'full'
    const selectedFallback = fallbackOptions.find((category) => category.id === primaryCategoryId)
    return selectedFallback ? null : 'fallback_required'
  }, [getExactPrimaryCategories, getFallbackPrimaryCategories])

  const extraCategoryOptions = (
    birthYear: number | null,
    gender: 'BOY' | 'GIRL',
    primaryCategory: CategoryItem | null,
    dateOfBirth?: string
  ) => {
    const options: CategoryItem[] = []
    if (!birthYear || !primaryCategory) return options
    return categories.filter((c) => {
      if (c.id === primaryCategory.id) return false
      if (c.category_basis === 'AGE') {
        const age = calculateAgeOnDate(dateOfBirth, eventDate)
        if (age == null || c.age_min == null || c.age_min <= age) return false
      } else {
        const max = c.year_max ?? c.year
        if (max >= birthYear) return false
      }
      if (c.gender === 'MIX') return true
      return c.gender === gender
    })
  }

  const getPairedPrimaryOptions = (rider: RiderForm) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    if (!birthYear || !pairedEvent) return []
    const exact = getExactPrimaryCategoryCandidates(pairedCategories, birthYear, rider.gender, rider.dateOfBirth, pairedEvent.eventDate)
    const availableExact = exact.filter((category) => !isCategoryFull(category))
    return availableExact.length > 0
      ? [availableExact[0]]
      : getFallbackPrimaryCategoryCandidates(pairedCategories, birthYear, rider.gender, rider.dateOfBirth, pairedEvent.eventDate)
          .filter((category) => !isCategoryFull(category))
  }

  const getPairedPrimaryCategory = (rider: RiderForm) => {
    const options = getPairedPrimaryOptions(rider)
    return options.find((category) => category.id === rider.pairedPrimaryCategoryId) ?? options[0] ?? null
  }

  const getPairedExtraOptions = (rider: RiderForm) => {
    const primary = getPairedPrimaryCategory(rider)
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    if (!primary || !birthYear || !pairedEvent) return []
    const age = calculateAgeOnDate(rider.dateOfBirth, pairedEvent.eventDate)
    return pairedCategories.filter((category) => {
      if (category.id === primary.id || isCategoryFull(category)) return false
      if (category.category_basis === 'AGE') {
        if (age == null || category.age_min == null || category.age_min <= age) return false
      } else if ((category.year_max ?? category.year) >= birthYear) return false
      return category.gender === 'MIX' || category.gender === rider.gender
    })
  }

  const totalAmount = useMemo(() => {
    const bundles = businessSettings?.registration_bundles ?? []
    const pairedBundles = pairedBusinessSettings?.registration_bundles ?? []
    const offer = businessSettings?.event_bundle_offer
    const packageBase = offer?.enabled ? Number(offer.bundle_base_price_per_rider) || 0 : 0
    return riders.reduce((sum, rider) => sum
      + (rider.pairedEventSelected ? packageBase : basePrice)
      + (rider.extraCategoryId ? extraPrice : 0)
      + (bundles.find((bundle) => bundle.id === rider.bundleId && bundle.enabled)?.price ?? 0)
      + (rider.pairedEventSelected && pairedEvent ? (rider.pairedExtraCategoryId ? pairedExtraPrice : 0) + (pairedBundles.find((bundle) => bundle.id === rider.pairedBundleId && bundle.enabled)?.price ?? 0) : 0), 0)
  }, [riders, basePrice, extraPrice, businessSettings?.registration_bundles, businessSettings?.event_bundle_offer, pairedEvent, pairedExtraPrice, pairedBusinessSettings?.registration_bundles])
  const riderCount = riders.length
  const extraCategoryCount = riders.filter((rider) => Boolean(rider.extraCategoryId)).length
  const pairedRiderCount = riders.filter((rider) => rider.pairedEventSelected).length
  const bundleBaseAmount = pairedRiderCount * Number(businessSettings?.event_bundle_offer?.bundle_base_price_per_rider ?? 0)
  const baseRiderCount = riderCount - pairedRiderCount
  const baseAmount = baseRiderCount * basePrice
  const extraAmount = extraCategoryCount * extraPrice
  const enabledBundles = (businessSettings?.registration_bundles ?? []).filter((bundle) => bundle.enabled)
  const bundleSelections = riders.filter((rider) => enabledBundles.some((bundle) => bundle.id === rider.bundleId))
  const bundleAmount = bundleSelections.reduce((sum, rider) => sum + (enabledBundles.find((bundle) => bundle.id === rider.bundleId)?.price ?? 0), 0)
  const pairedEnabledBundles = (pairedBusinessSettings?.registration_bundles ?? []).filter((bundle) => bundle.enabled)
  const pairedBundleAmount = riders.reduce((sum, rider) => sum + (rider.pairedEventSelected ? (pairedEnabledBundles.find((bundle) => bundle.id === rider.pairedBundleId)?.price ?? 0) : 0), 0)

  const hasContact = contactName.trim() && contactPhone.trim()
  const riderPhotoUploadEnabled =
    typeof businessSettings?.registration_rider_photo_enabled === 'boolean'
      ? businessSettings.registration_rider_photo_enabled
      : true
  const pairedRiderPhotoRequired = typeof pairedBusinessSettings?.registration_rider_photo_enabled === 'boolean'
    ? pairedBusinessSettings.registration_rider_photo_enabled
    : true
  const ridersComplete = riders.every(
    (r) =>
      r.name &&
      r.nickname &&
      r.club.trim() &&
      (!(requireJerseySize || (r.pairedEventSelected && pairedRequireJerseySize)) || r.jerseySize) &&
      r.dateOfBirth &&
      r.requestedPlateNumber &&
      (!(riderPhotoUploadEnabled || (r.pairedEventSelected && pairedRiderPhotoRequired)) || (r.photoUrl && r.photoUploadStatus === 'uploaded')) &&
      r.docKkUrl &&
      r.docKkUploadStatus === 'uploaded'
  )
  const unresolvedPlateIndex = riders.findIndex((rider, index) => {
    if (!rider.requestedPlateNumber.trim()) return false
    const plateCheck = plateChecks[index] ?? initialPlateCheck()
    return plateCheck.state !== 'available'
  })
  const showTotal = Boolean(hasContact && ridersComplete)
  const hasMissingPrimaryCategory = riders.some((rider) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth)
    return issue === 'invalid'
  })
  const hasPrimaryCategoryAndFallbackFull = riders.some((rider) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth)
    return issue === 'full'
  })
  const hasPrimaryCategoryNeedsFallbackChoice = riders.some((rider) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth)
    return issue === 'fallback_required'
  })
  const hasPrimaryCategorySlotFull = riders.some((rider) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth)
    return issue === 'full' || issue === 'fallback_required'
  })
  const hasFullExtraCategory = riders.some((rider) => {
    if (!rider.extraCategoryId) return false
    const category = categories.find((c) => c.id === rider.extraCategoryId)
    if (!category) return true
    return isCategoryFull(category)
  })
  const publicEventTitle = businessSettings?.public_event_title?.trim() || eventName || 'Pendaftaran Event'
  const publicTagline = businessSettings?.public_tagline?.trim() || ''
  const paymentBankName = businessSettings?.payment_bank_name?.trim() || ''
  const paymentAccountName = businessSettings?.payment_account_name?.trim() || ''
  const paymentAccountNumber = businessSettings?.payment_account_number?.trim() || ''
  const paymentQrisImageUrl = businessSettings?.registration_qris_image_url?.trim() || ''
  const jerseySizeChartImageUrl = businessSettings?.registration_jersey_size_chart_url?.trim() || ''
  const normalizeSizeOptions = (options: unknown) => Array.isArray(options)
    ? options.map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : ''))
        .map((item) => (item === 'XXL' ? '2XL' : item))
        .filter((item): item is string => ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].includes(item))
    : []
  const sourceJerseyOptions = normalizeSizeOptions(businessSettings?.jersey_size_options)
  const pairedJerseyOptions = eventBundleSelected ? normalizeSizeOptions(pairedBusinessSettings?.jersey_size_options) : []
  const combinedJerseyOptions = [...new Set([...sourceJerseyOptions, ...pairedJerseyOptions])]
  const jerseySizeOptions = combinedJerseyOptions.length > 0 ? combinedJerseyOptions : DEFAULT_JERSEY_SIZE_OPTIONS
  const contactEmailValue = contactEmail.trim()
  const contactEmailInvalid = contactEmailValue.length > 0 && !isValidEmail(contactEmailValue)
  const contactPhoneValue = contactPhone.trim()
  const contactPhoneInvalid = contactPhoneValue.length > 0 && !isValidWhatsappNumber(contactPhoneValue)

  const continueFromContact = async () => {
    if (!contactName.trim()) {
      appAlert('Nama penanggung jawab wajib diisi.')
      return
    }
    if (!contactPhone.trim() || contactPhoneInvalid) {
      appAlert('Masukkan nomor WhatsApp yang valid.')
      return
    }
    if (contactEmailInvalid) {
      appAlert('Format email konfirmasi belum valid.')
      return
    }

    clearPrefillLookup()
    setContactPhone(normalizeWhatsappDigits(contactPhone))
      await lookupPreviousRiders()
    setActiveStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToStep = (step: number) => {
    setActiveStep(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const continueFromRider = () => {
    if (!ridersComplete) {
      appAlert('Lengkapi seluruh data, kategori, plate, dan dokumen rider sebelum lanjut.')
      return
    }
    if (hasPrimaryCategorySlotFull || hasMissingPrimaryCategory || hasFullExtraCategory) {
      appAlert('Masih ada kategori rider yang belum valid atau kuotanya penuh.')
      return
    }
    if (eventBundleSelected) {
      if (!pairedEvent?.registrationOpen) {
        appAlert('Pendaftaran event pasangan sedang ditutup atau datanya belum tersedia.')
        return
      }
      const invalidPairedRider = riders.findIndex((rider) => {
        if (!rider.pairedEventSelected) return false
        const primary = getPairedPrimaryCategory(rider)
        return !primary || (rider.pairedExtraCategoryId && !getPairedExtraOptions(rider).some((category) => category.id === rider.pairedExtraCategoryId))
      })
      if (invalidPairedRider >= 0) {
        appAlert(`Pilih kategori yang tersedia untuk rider #${invalidPairedRider + 1} di event pasangan.`)
        return
      }
    }
    if (unresolvedPlateIndex >= 0) {
      const plateCheck = plateChecks[unresolvedPlateIndex] ?? initialPlateCheck()
      appAlert(
        plateCheck.message ||
          `Nomor plate rider #${unresolvedPlateIndex + 1} belum tersedia. Jika nomor utama sudah dipakai, tambahkan suffix/huruf sebelum lanjut.`
      )
      return
    }
    goToStep(3)
  }

  const continueFromPayment = () => {
    if (!bankName.trim() || !accountName.trim() || !accountNumber.trim()) {
      appAlert('Lengkapi data rekening pengirim.')
      return
    }
    if (!paymentProof || !paymentProofUrl || paymentUploadStatus !== 'uploaded') {
      appAlert(
        paymentUploadStatus === 'uploading'
          ? 'Bukti pembayaran masih diupload. Tunggu sampai selesai.'
          : paymentUploadError || 'Upload bukti pembayaran sebelum lanjut.'
      )
      return
    }
    const paymentError = validateUploadFile(paymentProof, 'Bukti pembayaran', 'payment')
    if (paymentError) {
      appAlert(paymentError)
      return
    }
    goToStep(4)
  }
  const showPaymentDestination = Boolean(paymentBankName || paymentAccountName || paymentAccountNumber || paymentQrisImageUrl)
  const showEventOwner = Boolean(businessSettings?.show_event_owner_publicly && businessSettings?.event_owner_name?.trim())
  const showOperatingCommittee = Boolean(
    businessSettings?.show_operating_committee_publicly &&
      (businessSettings?.operating_committee_label?.trim() || businessSettings?.operating_committee_name?.trim())
  )
  const publicOrganizer = [
    showEventOwner ? businessSettings?.event_owner_name?.trim() : '',
    showOperatingCommittee
      ? businessSettings?.operating_committee_label?.trim() || businessSettings?.operating_committee_name?.trim()
      : '',
  ].filter((name): name is string => Boolean(name)).join(' Ãƒâ€šÃ‚Â· ')
  const showRaceDirector = Boolean(businessSettings?.show_race_director_publicly && businessSettings?.race_director_name?.trim())
  const showMc = Boolean(businessSettings?.show_mc_publicly && businessSettings?.mc_name?.trim())
  const publicContactName =
    businessSettings?.public_contact_name?.trim() ||
    businessSettings?.event_owner_contact_name?.trim() ||
    businessSettings?.operating_committee_contact_name?.trim() ||
    businessSettings?.event_owner_name?.trim() ||
    'panitia'
  const publicContactPhone =
    businessSettings?.public_contact_phone?.trim() ||
    businessSettings?.event_owner_contact_phone?.trim() ||
    businessSettings?.operating_committee_contact_phone?.trim() ||
    ''
  const publicContactWhatsapp = publicContactPhone
    ? `https://wa.me/${normalizeWhatsappDigits(publicContactPhone)}`
    : ''
  const supportInstagram = '@pushbike.kotaarang'
  const lastAutoCategoryModalKeyRef = useRef('')

  useEffect(() => {
    setJerseySizeChartFailed(false)
  }, [jerseySizeChartImageUrl])
  const openSlotFullModal = useCallback((message: string) => {
    setSlotFullModal({
      title: 'Slot Pendaftaran Penuh',
      message,
    })
  }, [])

  const openDuplicateRegistrationModal = useCallback((message: string) => {
    setDuplicateRegistrationModal({ message })
  }, [])

  const getPrimaryIssueModalMessage = useCallback((
    issue: 'invalid' | 'full' | 'fallback_required',
    riderIndex: number,
    birthYear: number | null,
    gender: 'BOY' | 'GIRL'
  ) => {
    if (issue === 'invalid') {
      const range = getAvailableBirthYearRange(gender)
      if (range && birthYear) {
        const genderLabel = gender === 'BOY' ? 'boys' : 'girls'
        if (birthYear < range.min) {
          return `Rider #${riderIndex + 1}: tahun lahir ${birthYear} belum masuk kategori aktif untuk ${genderLabel}. Tahun kelahiran paling awal yang tersedia adalah ${range.min}.`
        }
        if (birthYear > range.max) {
          return `Rider #${riderIndex + 1}: tahun lahir ${birthYear} melewati batas kategori aktif untuk ${genderLabel}. Tahun kelahiran paling akhir yang tersedia adalah ${range.max}.`
        }
        return `Rider #${riderIndex + 1}: tahun lahir ${birthYear} tidak cocok dengan kategori aktif untuk ${genderLabel}. Kategori event ini menerima tahun lahir ${range.min} sampai ${range.max}.`
      }
      return `Rider #${riderIndex + 1}: tanggal lahir/umur pada tanggal event atau gender rider tidak cocok dengan kategori aktif. Cek tanggal lahir dan hubungi panitia jika kategori belum dibuat.`
    }
    if (issue === 'full') {
      return `Rider #${riderIndex + 1}: kategori sesuai umur penuh, dan semua kategori di atas umur rider juga penuh.`
    }
    return `Rider #${riderIndex + 1}: kategori sesuai umur penuh. Pilih kategori pengganti yang tersedia.`
  }, [getAvailableBirthYearRange])

  useEffect(() => {
    const issueEntry = riders.findIndex((rider, index) => {
      if (!birthDateTouched[index]) return false
      const birthYear = getCompleteBirthYear(rider.dateOfBirth)
      const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth)
      return issue === 'invalid' || issue === 'full' || issue === 'fallback_required'
    })

    if (issueEntry < 0) {
      lastAutoCategoryModalKeyRef.current = ''
      return
    }

    const rider = riders[issueEntry]
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth)
    if (issue !== 'invalid' && issue !== 'full' && issue !== 'fallback_required') return

    const issueKey = `${issueEntry}-${rider.dateOfBirth}-${rider.gender}-${issue}`
    if (lastAutoCategoryModalKeyRef.current === issueKey) return

    lastAutoCategoryModalKeyRef.current = issueKey
    setSlotFullModal({
      title: issue === 'invalid' ? 'Kategori Tidak Tersedia' : 'Slot Pendaftaran Penuh',
      message: getPrimaryIssueModalMessage(issue, issueEntry, birthYear, rider.gender),
    })
  }, [birthDateTouched, getPrimaryCategoryIssue, getPrimaryIssueModalMessage, openSlotFullModal, riders])

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const controllers: AbortController[] = []

    riders.forEach((rider, index) => {
      const plateNumber = rider.requestedPlateNumber.trim()
      const plateSuffix = rider.usePlateSuffix ? rider.requestedPlateSuffix.trim().toUpperCase().slice(0, 1) : ''

      if (!plateNumber) {
        setPlateChecks((prev) => prev.map((item, idx) => (idx === index ? initialPlateCheck() : item)))
        return
      }

      setPlateChecks((prev) =>
        prev.map((item, idx) =>
          idx === index ? { state: 'checking', message: 'Mengecek nomor plate...', suggestedSuffix: null } : item
        )
      )

      const controller = new AbortController()
      controllers.push(controller)

      const timer = setTimeout(async () => {
        try {
          const params = new URLSearchParams({ plate_number: plateNumber })
          if (plateSuffix) params.set('plate_suffix', plateSuffix)

          const res = await fetch(`/api/public/events/${eventId}/plate-check?${params.toString()}`, {
            signal: controller.signal,
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(json?.error || 'Gagal mengecek nomor plate')
          }

          const data = json?.data ?? {}
          const nextState: PlateCheckState = {
            state:
              data?.status === 'available' ||
              data?.status === 'needs_suffix' ||
              data?.status === 'suffix_taken'
                ? data.status
                : 'error',
            message: typeof data?.message === 'string' ? data.message : 'Gagal membaca hasil cek nomor plate.',
            suggestedSuffix: typeof data?.suggested_suffix === 'string' ? data.suggested_suffix : null,
          }

          setPlateChecks((prev) => prev.map((item, idx) => (idx === index ? nextState : item)))
        } catch (error) {
          if (controller.signal.aborted) return
          setPlateChecks((prev) =>
            prev.map((item, idx) =>
              idx === index
                ? {
                    state: 'error',
                    message: error instanceof Error ? error.message : 'Gagal mengecek nomor plate.',
                    suggestedSuffix: null,
                  }
                : item
            )
          )
        }
      }, 350)

      timers.push(timer)
    })

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      controllers.forEach((controller) => controller.abort())
    }
  }, [eventId, riders])

  const handleSubmit = async () => {
    setSuccess(null)
    setSlotFullModal(null)
    setDuplicateRegistrationModal(null)
    const normalizedContactPhone = normalizeWhatsappDigits(contactPhone)
    if (!registrationOpen) {
      appAlert('Pendaftaran untuk event ini sedang ditutup oleh panitia.')
      return
    }
    if (!contactName || !contactPhone) {
      appAlert('Nama dan nomor kontak wajib diisi')
      return
    }
    if (!isValidWhatsappNumber(contactPhone)) {
      appAlert('Nomor WhatsApp belum valid. Gunakan format Indonesia 08.../62... atau internasional +60..., minimal 10 digit.')
      return
    }
    if (contactEmailInvalid) {
      appAlert('Format email tidak valid. Contoh: nama@email.com')
      return
    }
    if (!bankName.trim()) {
      appAlert('Bank pengirim wajib diisi')
      return
    }
    if (!accountName.trim()) {
      appAlert('Nama pengirim wajib diisi')
      return
    }
    if (!accountNumber.trim()) {
      appAlert('Nomor rekening pengirim wajib diisi')
      return
    }
    if (!paymentProof || !paymentProofUrl || paymentUploadStatus !== 'uploaded') {
      appAlert(
        paymentUploadStatus === 'uploading'
          ? 'Bukti pembayaran masih diupload. Tunggu sampai selesai.'
          : paymentUploadError || 'Bukti pembayaran wajib diupload.'
      )
      return
    }
    const hasInvalid = riders.some(
      (r) =>
        !r.name ||
        !r.nickname ||
        !r.club.trim() ||
        ((requireJerseySize || (r.pairedEventSelected && pairedRequireJerseySize)) && !r.jerseySize) ||
        !r.dateOfBirth ||
        !r.requestedPlateNumber ||
        ((riderPhotoUploadEnabled || (r.pairedEventSelected && pairedRiderPhotoRequired)) && (!r.photoUrl || r.photoUploadStatus !== 'uploaded')) ||
        !r.docKkUrl ||
        r.docKkUploadStatus !== 'uploaded'
    )
    if (hasInvalid) {
      appAlert(
        riders.some((rider) => riderPhotoUploadEnabled || (rider.pairedEventSelected && pairedRiderPhotoRequired))
          ? 'Lengkapi data rider. Wajib: nama lengkap, panggilan, club/komunitas, nomor plate, foto rider, KK/Akte/KIA, dan ukuran jersey (jika diwajibkan).'
          : 'Lengkapi data rider. Wajib: nama lengkap, panggilan, club/komunitas, nomor plate, KK/Akte/KIA, dan ukuran jersey (jika diwajibkan).'
      )
      return
    }
    const invalidPlateIndex = riders.findIndex((rider) => !/^\d{1,3}$/.test(rider.requestedPlateNumber.trim()))
    if (invalidPlateIndex >= 0) {
      appAlert(`Nomor plate rider #${invalidPlateIndex + 1} wajib angka dan maksimal 3 digit.`)
      return
    }
    const unresolvedPlateIndex = riders.findIndex((rider, index) => {
      const plateCheck = plateChecks[index] ?? initialPlateCheck()
      if (!rider.requestedPlateNumber.trim()) return false
      if (plateCheck.state === 'idle') return true
      if (plateCheck.state === 'checking' || plateCheck.state === 'error') return true
      if (plateCheck.state === 'needs_suffix' || plateCheck.state === 'suffix_taken') return true
      return plateCheck.state !== 'available'
    })
    if (unresolvedPlateIndex >= 0) {
      const plateCheck = plateChecks[unresolvedPlateIndex] ?? initialPlateCheck()
      appAlert(
        plateCheck.message ||
          `Nomor plate rider #${unresolvedPlateIndex + 1} belum tersedia. Jika disarankan suffix, klik/pilih suffix dulu sebelum lanjut.`
      )
      return
    }
    if (hasPrimaryCategorySlotFull) {
      openSlotFullModal(
        hasPrimaryCategoryAndFallbackFull
          ? 'Kategori sesuai umur penuh, dan semua kategori di atas umur rider juga penuh, silahkan Hubungi panitia'
          : hasPrimaryCategoryNeedsFallbackChoice
          ? 'Kategori sesuai umur penuh. Pilih kategori pengganti yang tersedia.'
          : 'Salah satu kategori utama rider penuh.'
      )
      return
    }
    if (hasMissingPrimaryCategory) {
      const invalidIndex = riders.findIndex((rider) => {
        const birthYear = getCompleteBirthYear(rider.dateOfBirth)
        return getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth) === 'invalid'
      })
      const invalidRider = invalidIndex >= 0 ? riders[invalidIndex] : null
      const invalidBirthYear = invalidRider ? getCompleteBirthYear(invalidRider.dateOfBirth) : null
      setSlotFullModal({
        title: 'Kategori Tidak Tersedia',
        message: invalidRider
          ? getPrimaryIssueModalMessage('invalid', invalidIndex, invalidBirthYear, invalidRider.gender)
          : 'Ada rider dengan tahun lahir/gender yang tidak masuk kategori aktif event ini. Cek ulang tanggal lahir/gender, atau hubungi panitia jika kategori belum dibuat.',
      })
      return
    }
    if (hasFullExtraCategory) {
      openSlotFullModal('Ada kategori tambahan yang kuotanya sudah penuh. Pilih kategori tambahan lain yang masih tersedia.')
      return
    }

    setSubmitConfirmationOpen(false)
    setSubmitting(true)
    try {
      riders.forEach((rider, idx) => {
        if (riderPhotoUploadEnabled || (rider.pairedEventSelected && pairedRiderPhotoRequired)) {
          const photoError = validateUploadFile(rider.photo, `Foto rider #${idx + 1}`, 'rider-photo')
          if (photoError) throw new Error(photoError)
          if (!rider.photoUrl || rider.photoUploadStatus !== 'uploaded') {
            throw new Error(`Foto rider #${idx + 1} belum selesai diupload.`)
          }
        }

        const documentError = validateUploadFile(rider.docKk, `Dokumen KK/Akte/KIA rider #${idx + 1}`, 'document')
        if (documentError) throw new Error(documentError)
        if (!rider.docKkUrl || rider.docKkUploadStatus !== 'uploaded') {
          throw new Error(`Dokumen rider #${idx + 1} belum selesai diupload.`)
        }
      })
      const paymentError = validateUploadFile(paymentProof, 'Bukti pembayaran', 'payment')
      if (paymentError) throw new Error(paymentError)
      if (!paymentProofUrl || paymentUploadStatus !== 'uploaded') {
        throw new Error('Bukti pembayaran belum selesai diupload.')
      }

      const shouldSendEmail = contactEmail.trim().length > 0
      const items = riders.map((r, idx) => {
        const birthYear = getCompleteBirthYear(r.dateOfBirth)
        const primaryCategory = computePrimaryCategory(birthYear, r.gender, r.primaryCategoryId, r.dateOfBirth)
        if (!birthYear || !primaryCategory) {
          const issue = getPrimaryCategoryIssue(birthYear, r.gender, r.primaryCategoryId, r.dateOfBirth)
          if (issue === 'invalid' || issue === 'full' || issue === 'fallback_required') {
            throw new Error(getPrimaryIssueModalMessage(issue, idx, birthYear, r.gender))
          }
          throw new Error(`Kategori utama rider ${r.name || ''} belum terdeteksi. Cek ulang tanggal lahir dan gender rider.`)
        }
        return {
          rider_name: r.name,
          rider_nickname: r.nickname || null,
          jersey_size: r.jerseySize || null,
          date_of_birth: r.dateOfBirth,
          gender: r.gender,
          club: r.club.trim(),
          primary_category_id: primaryCategory.id,
          extra_category_id: r.extraCategoryId || null,
          requested_plate_number: r.requestedPlateNumber.trim() || null,
          requested_plate_suffix: r.requestedPlateSuffix.trim().toUpperCase().slice(0, 1) || null,
          photo_url: (riderPhotoUploadEnabled || (r.pairedEventSelected && pairedRiderPhotoRequired)) ? r.photoUrl : null,
          document_url: r.docKkUrl,
          bundle_id: r.bundleId || null,
        }
      })
      const pairedItems = eventBundleSelected ? riders
        .map((rider, index) => ({ rider, index }))
        .filter(({ rider }) => rider.pairedEventSelected)
        .map(({ rider, index }) => {
        const primary = getPairedPrimaryCategory(rider)
        if (!pairedEvent || !primary) throw new Error(`Pilih kategori event pasangan untuk rider ${rider.name || index + 1}.`)
        if (rider.pairedExtraCategoryId && !getPairedExtraOptions(rider).some((category) => category.id === rider.pairedExtraCategoryId)) {
          throw new Error(`Kategori tambahan event pasangan untuk rider ${rider.name || index + 1} sudah tidak tersedia.`)
        }
        return {
          rider_name: rider.name,
          rider_nickname: rider.nickname || null,
          jersey_size: rider.jerseySize || null,
          date_of_birth: rider.dateOfBirth,
          gender: rider.gender,
          club: rider.club.trim(),
          primary_category_id: primary.id,
          extra_category_id: rider.pairedExtraCategoryId || null,
          requested_plate_number: rider.requestedPlateNumber.trim() || null,
          requested_plate_suffix: rider.requestedPlateSuffix.trim().toUpperCase().slice(0, 1) || null,
          photo_url: pairedRiderPhotoRequired ? rider.photoUrl : null,
          document_url: rider.docKkUrl,
          bundle_id: rider.pairedBundleId || null,
          source_item_index: index,
        }
      }) : null

      let createRes: Response
      try {
        createRes = await fetch(`/api/public/events/${eventId}/registrations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            community_name: null,
            contact_name: contactName,
            contact_phone: normalizedContactPhone,
            contact_email: contactEmail || null,
            items,
            payment: {
              bank_name: bankName,
              account_name: accountName,
              account_number: accountNumber,
              proof_url: paymentProofUrl,
            },
            ...(pairedItems && businessSettings?.event_bundle_offer ? {
              event_bundle: {
                offer_id: businessSettings.event_bundle_offer.id,
                paired_event_id: businessSettings.event_bundle_offer.paired_event_id,
                items: pairedItems,
              },
            } : {}),
          }),
        })
      } catch {
        throw new Error(buildNetworkStepError('Menyimpan data pendaftaran awal'))
      }
      const createJson = await parseJsonResponse(createRes)
      if (!createRes.ok) throw new Error(createJson?.error || createJson?._raw || 'Gagal membuat pendaftaran')

      const sourcePackageRegistration = createJson?.data?.registrations?.find((entry: { event_id?: string }) => entry.event_id === eventId)?.registration
      const pairedPackageRegistration = createJson?.data?.registrations?.find((entry: { event_id?: string }) => entry.event_id !== eventId)
      const createdRegistration = sourcePackageRegistration ?? createJson?.data?.registration
      const createdRegistrationId = createdRegistration?.id ?? null
      const createdRegistrationCode = createdRegistration?.registration_code ?? null
      if (!createdRegistrationId) {
        throw new Error('Registrasi berhasil dibuat, tetapi ID registrasi tidak ditemukan.')
      }
      if (!createdRegistrationCode) {
        throw new Error('Registrasi berhasil dibuat, tetapi kode registrasi tidak ditemukan.')
      }

      setSuccess({
        registrationCode: createdRegistrationCode,
        pairedRegistrationCode: pairedPackageRegistration?.registration?.registration_code ?? null,
        pairedEventName: pairedPackageRegistration?.event_name ?? null,
        riderNames: riders.map((rider) => rider.name.trim()).filter(Boolean),
        totalAmount,
        hasContactEmail: shouldSendEmail,
      })
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan pendaftaran'
      if (
        message.includes('Kuota kategori') ||
        message.toLowerCase().includes('slot penuh') ||
        (message.toLowerCase().includes('kuota') && message.toLowerCase().includes('penuh'))
      ) {
        openSlotFullModal(message)
      } else if (
        message.toLowerCase().includes('sudah pernah didaftarkan') ||
        message.toLowerCase().includes('terisi lebih dari satu kali')
      ) {
        openDuplicateRegistrationModal(message)
      } else {
        appAlert(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const resetRegistrationForm = () => {
    setActiveStep(1)
    setRiders([initialRider()])
    setPlateChecks([initialPlateCheck()])
    setBirthDateTouched([false])
    setContactName('')
    setContactPhone('')
    setContactEmail('')
    setBankName('')
    setAccountName('')
    setAccountNumber('')
    setPaymentProof(null)
    paymentProofSelectionRef.current = null
    setPaymentProofUrl(null)
    setPaymentUploadStatus('idle')
    setPaymentUploadError('')
    setDragActiveKey(null)
    setSubmitConfirmationOpen(false)
  }

  const handleSuccessClose = () => {
    setSuccess(null)
    setCodeCopied(false)
    resetRegistrationForm()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyRegistrationCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = code
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      textArea.remove()
    }
    setCodeCopied(true)
    window.setTimeout(() => setCodeCopied(false), 2200)
  }

  const panelClass =
    'registration-editorial-panel rounded-[1.5rem] border border-[#dfd1b8] bg-[#fff8e8] p-4 text-[#1d0d07] shadow-[0_18px_44px_rgba(55,23,9,0.1)] sm:p-5'
  const fieldClass =
    'w-full rounded-2xl border border-[#d9c9ae] bg-white px-4 py-3.5 text-sm font-semibold text-[#1d0d07] shadow-inner shadow-[#e9dcc4] placeholder:text-[#9a8774] transition-colors focus:border-[#e84b16] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#e84b16]/20'
  const filePickerClass =
    'registration-editorial-file flex min-h-[76px] cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-[#c8b699] bg-[#f8eedb] px-4 py-3 transition-colors hover:border-[#e84b16] hover:bg-[#fff3dc]'
  const labelClass = 'text-xs font-black uppercase text-[#5f4638]'
  const requiredLabel = (label: string) => (
    <span>
      {label} <span className="text-rose-400">*</span>
    </span>
  )
  const helperClass = 'text-[11px] font-semibold leading-5 text-[#796657]'
  const sectionHeaderClass = 'text-xs font-black uppercase text-[#e84b16]'

  const pickAcceptedFile = (files: FileList | null | undefined, allowPdf: boolean) => {
    if (!files) return null
    for (const file of Array.from(files)) {
      const lowerName = file.name.toLowerCase()
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
      if (isImage || (allowPdf && isPdf)) return file
    }
    return null
  }

  const setValidatedUploadFile = (
    file: File | null,
    label: string,
    uploadType: 'rider-photo' | 'document' | 'payment',
    onFile: (file: File | null) => void
  ) => {
    if (!file) {
      onFile(null)
      return
    }

    const error = validateUploadFile(file, label, uploadType)
    if (error) {
      appAlert(error)
      return
    }

    onFile(file)
  }

  const onDropZoneOver = (key: string, e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActiveKey(key)
  }

  const onDropZoneLeave = (key: string, e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragActiveKey === key) setDragActiveKey(null)
  }

  const onDropZoneDrop = (
    key: string,
    e: DragEvent<HTMLElement>,
    onFile: (file: File | null) => void,
    label: string,
    uploadType: 'rider-photo' | 'document' | 'payment',
    allowPdf = false
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActiveKey(null)
    const file = pickAcceptedFile(e.dataTransfer?.files, allowPdf)
    if (!file) {
      if (e.dataTransfer?.files?.length) {
        appAlert(getUploadTypeError(label, uploadType))
      }
      return
    }
    setValidatedUploadFile(file, label, uploadType, onFile)
  }

  const onDropZonePaste = (
    e: ClipboardEvent<HTMLElement>,
    onFile: (file: File | null) => void,
    label: string,
    uploadType: 'rider-photo' | 'document' | 'payment',
    allowPdf = false
  ) => {
    const file = pickAcceptedFile(e.clipboardData?.files, allowPdf)
    if (!file) {
      if (e.clipboardData?.files?.length) {
        appAlert(getUploadTypeError(label, uploadType))
      }
      return
    }
    e.preventDefault()
    setValidatedUploadFile(file, label, uploadType, onFile)
  }

  const dropZoneClass = (key: string) =>
    `${filePickerClass} ${dragActiveKey === key ? 'border-amber-400 bg-amber-400/10' : ''}`

  return (
    <div className="public-page public-editorial-page public-editorial-registration min-h-screen bg-[#f5ecd7] text-[#1d0d07]">
      <PublicTopbar />
      <main className="mx-auto grid w-full max-w-[1120px] gap-4 px-4 pb-36 pt-5 sm:px-6 md:gap-5 md:pt-7">
        <PublicBackLink href={`/event/${eventId}`}>Kembali ke detail event</PublicBackLink>
        {!registrationOpen && (
          <section className="rounded-2xl border border-rose-300/45 bg-rose-500/15 p-4 shadow-[0_16px_36px_rgba(244,63,94,0.14)]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-rose-200">Registrasi Ditutup</div>
            <div className="mt-2 text-sm font-semibold text-rose-50">
              Pendaftaran untuk event ini sedang ditutup oleh panitia. Pengiriman data baru sementara dinonaktifkan.
            </div>
          </section>
        )}
        <section
          className="registration-editorial-hero relative overflow-hidden rounded-[2rem] border border-[#4f372b] bg-[#1d0d07] bg-cover bg-center px-5 py-6 text-[#fff8e8] shadow-[0_28px_70px_rgba(55,23,9,0.24)] sm:px-7 md:py-8"
          style={eventPosterUrl ? { backgroundImage: `url("${eventPosterUrl.replace(/["\\\r\n]/g, '')}")` } : undefined}
        >
          {eventPosterUrl && (
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#1d0d07]/90 via-[#1d0d07]/75 to-[#1d0d07]/45" />
          )}
          <div className="relative z-10 grid gap-5 md:grid-cols-[minmax(0,1fr)_240px] md:items-center">
            <div className="grid gap-3">
              <h1 className="max-w-4xl text-2xl font-black leading-tight text-[#fff8e8] md:text-4xl">{publicEventTitle}</h1>
              {publicTagline && (
                <p className="max-w-3xl text-sm font-semibold leading-6 text-[#c9b7a5] md:text-base">{publicTagline}</p>
              )}
              {(eventDate || eventLocation) && (
                <div className="flex flex-wrap gap-2 text-xs font-bold text-[#fff8e8] sm:text-sm">
                  {eventDate && (
                    <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1.5">
                      {new Date(eventDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                  {eventLocation && <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1.5">{eventLocation}</span>}
                </div>
              )}
            </div>
          </div>
        </section>

        <PublicEventFacts
          organizer={publicOrganizer || null}
          raceDirector={showRaceDirector ? businessSettings?.race_director_name?.trim() : null}
          mc={showMc ? businessSettings?.mc_name?.trim() : null}
          contactName={publicContactName}
          contactPhone={publicContactPhone}
          basePrice={basePrice}
          upclassPrice={extraPrice}
          bundleInfoEnabled={businessSettings?.public_bundle_info_enabled === true}
          bundleInfo={businessSettings?.public_bundle_info}
          racepackInfoEnabled={businessSettings?.public_racepack_info_enabled === true}
          racepackInfo={businessSettings?.public_racepack_info}
          registrationBundles={businessSettings?.registration_bundles}
          racepackItems={businessSettings?.public_racepack_items}
        />

        <Link
          href={`/event/${eventId}/regulations`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#bca990] bg-[#fff8e8] px-4 py-3 text-sm font-extrabold text-[#4f372b] transition-colors hover:border-[#a83b16] hover:text-[#a83b16]"
        >
          Baca aturan & regulasi event
        </Link>

        <section className="registration-stepper rounded-[1.5rem] border border-[#d9c9ae] bg-[#fff8e8] p-4 shadow-[0_14px_34px_rgba(55,23,9,0.1)] sm:p-5">
          <div className="grid grid-cols-4 gap-2">
            {REGISTRATION_STEPS.map((step, index) => {
              const stepNumber = index + 1
              const isActive = activeStep === stepNumber
              const isComplete = activeStep > stepNumber
              return (
                <div key={step} className="grid min-w-0 justify-items-center gap-2 text-center">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black ${
                      isActive
                        ? 'border-[#1d0d07] bg-[#1d0d07] text-[#fff8e8]'
                        : isComplete
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-[#c8b699] bg-[#efe2c7] text-[#796657]'
                    }`}
                  >
                    {isComplete ? (
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m3 8 3 3 7-7" />
                      </svg>
                    ) : stepNumber}
                  </div>
                  <span
                    className={`truncate text-[10px] font-black uppercase sm:text-xs ${
                      isActive ? 'text-[#1d0d07]' : isComplete ? 'text-emerald-800' : 'text-[#796657]'
                    }`}
                  >
                    {step}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e2d5bd]">
            <div
              className="h-full rounded-full bg-[#e84b16] transition-[width] duration-300"
              style={{ width: `${(activeStep / REGISTRATION_STEPS.length) * 100}%` }}
            />
          </div>
          <p className="mt-3 text-center text-xs font-bold text-[#796657]">
            Langkah {activeStep} dari {REGISTRATION_STEPS.length}: {REGISTRATION_STEPS[activeStep - 1]}
          </p>
        </section>

        {activeStep === 1 ? (
        <section className={panelClass}>
          <div className="mb-4 grid gap-1">
            <div className={sectionHeaderClass}>Kontak Wali / Penanggung Jawab</div>
            <p className={helperClass}>Data ini dipakai panitia untuk konfirmasi pendaftaran dan pembayaran.</p>
          </div>
          <div className="grid items-start gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <label className={labelClass}>{requiredLabel('Nama Penanggung Jawab')}</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contoh: Andi Saputra"
                className={fieldClass}
              />
            </div>
            <div className="grid gap-1.5">
              <label className={labelClass}>{requiredLabel('Nomor WhatsApp')}</label>
              <input
                value={contactPhone}
                onChange={(e) => {
                  setContactPhone(e.target.value.replace(/[^\d+\s()-]/g, '').slice(0, 24))
                  clearPrefillLookup()
                }}
                onBlur={() => setContactPhone((current) => normalizeWhatsappDigits(current))}
                placeholder="Contoh: 0812... / +60..."
                type="tel"
                inputMode="tel"
                maxLength={24}
                className={`${fieldClass} ${contactPhoneInvalid ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/30' : ''}`}
              />
              <div className={`text-[11px] font-semibold ${contactPhoneInvalid ? 'text-rose-300' : 'text-slate-400'}`}>
                {contactPhoneInvalid
                  ? 'Nomor WhatsApp belum valid. Bisa pakai 08..., 62..., atau format internasional +60...'
                  : 'Nomor ini dipakai panitia untuk konfirmasi cepat lewat WhatsApp. Peserta luar negeri bisa pakai kode negara, misalnya +60.'}
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className={labelClass}>Email Konfirmasi</label>
              <input
                value={contactEmail}
                onChange={(e) => {
                  setContactEmail(e.target.value)
                  clearPrefillLookup()
                }}
                placeholder="Email aktif untuk konfirmasi pendaftaran"
                type="email"
                inputMode="email"
                className={`${fieldClass} ${contactEmailInvalid ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/30' : ''}`}
              />
              <div className={`text-[11px] font-semibold ${contactEmailInvalid ? 'text-rose-300' : 'text-slate-400'}`}>
                {contactEmailInvalid
                  ? 'Format email belum benar. Contoh: nama@email.com'
                  : 'Pastikan email aktif karena konfirmasi pendaftaran akan dikirim ke email ini.'}
              </div>
            </div>
          </div>
        </section>
        ) : activeStep === 2 ? (
        <>

        {prefillCandidates.length === 0 && prefillMessage?.type === 'error' && (
          <p role="alert" className="mb-4 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-3 text-sm font-bold text-amber-100">
            {prefillMessage.text} Kamu tetap bisa mengisi data rider secara manual.
          </p>
        )}

        {prefillCandidates.some((candidate) => !loadedPrefillIds.includes(candidate.id)) && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-amber-100">Punya rider lain dengan wali yang sama?</p>
              <p className="mt-1 text-xs font-medium text-slate-300">
                {prefillMessage?.type === 'success' ? prefillMessage.text : 'Muat data rider berikutnya satu per satu.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setPrefillMessage(null); setPrefillModalOpen(true) }}
              className="min-h-11 shrink-0 rounded-xl border border-amber-300/40 px-4 py-2 text-sm font-black text-amber-100 transition-colors hover:bg-amber-300/10"
            >
              Tambah Data Rider Lain
            </button>
          </div>
        )}

        {businessSettings?.event_bundle_offer?.enabled && !pairedEvent && (
          <div role="status" className="mb-4 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-bold">Paket event pasangan belum bisa dimuat.</p>
            <p className="mt-1 text-xs">Muat ulang halaman. Jika pesan ini tetap muncul, hubungi panitia.</p>
          </div>
        )}
        {riders.map((rider, idx) => {
          const birthYear = getCompleteBirthYear(rider.dateOfBirth)
          const primaryIssue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth)
          const primaryCategory = computePrimaryCategory(birthYear, rider.gender, rider.primaryCategoryId, rider.dateOfBirth)
          const fallbackPrimaryOptions = getFallbackPrimaryCategories(birthYear, rider.gender, rider.dateOfBirth)
          const availableFallbackPrimaryOptions = fallbackPrimaryOptions.filter((category) => !isCategoryFull(category))
          const showFallbackPrimarySelector = primaryIssue === 'fallback_required' && availableFallbackPrimaryOptions.length > 0
          const extras = extraCategoryOptions(birthYear, rider.gender, primaryCategory, rider.dateOfBirth)
          const hasMatchedFullCategory = primaryIssue === 'full' || primaryIssue === 'fallback_required'
          const extrasAvailable = extras.some((cat) => !isCategoryFull(cat))
          const selectedExtraCategory = extras.find((cat) => cat.id === rider.extraCategoryId) ?? null
          const selectedFallbackPrimaryCategory =
            fallbackPrimaryOptions.find((category) => category.id === rider.primaryCategoryId) ?? null
          const pairedPrimaryOptions = getPairedPrimaryOptions(rider)
          const pairedPrimaryCategory = getPairedPrimaryCategory(rider)
          const pairedExtraOptions = getPairedExtraOptions(rider)
          const pairedBundles = (pairedBusinessSettings?.registration_bundles ?? []).filter((bundle) => bundle.enabled)
          const riderJerseySizeRequired = requireJerseySize || (rider.pairedEventSelected && pairedRequireJerseySize)
          const riderPhotoIsRequired = riderPhotoUploadEnabled || (rider.pairedEventSelected && pairedRiderPhotoRequired)
          const plateCheck = plateChecks[idx] ?? initialPlateCheck()
          const showPlateSuffixField =
            rider.usePlateSuffix ||
            Boolean(rider.requestedPlateSuffix) ||
            plateCheck.state === 'needs_suffix' ||
            plateCheck.state === 'suffix_taken'
          const platePreview = formatPlateDisplay(rider.requestedPlateNumber, rider.requestedPlateSuffix, showPlateSuffixField)
          const extraCategoryMessage =
            !birthYear
              ? 'Isi tanggal lahir dulu agar sistem bisa menghitung kategori tambahan yang mungkin diikuti rider.'
              : !primaryCategory
              ? primaryIssue === 'full'
                ? 'Kategori utama dan semua kategori di atas umur rider sedang penuh.'
                : hasMatchedFullCategory
                ? 'Pilih kategori utama pengganti dulu.'
                : 'Kategori tambahan baru akan muncul setelah kategori utama rider berhasil terdeteksi.'
              : extras.length === 0
              ? 'Tidak ada kategori tambahan yang cocok untuk rider ini.'
              : !extrasAvailable
              ? 'Semua opsi kategori tambahan saat ini penuh.'
              : 'Opsional: rider bisa ikut satu kategori tambahan jika ingin naik kategori.'
          const plateStatusClass =
            plateCheck.state === 'available'
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : plateCheck.state === 'needs_suffix' || plateCheck.state === 'suffix_taken'
              ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
              : plateCheck.state === 'error'
              ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
              : 'border-slate-700 bg-slate-950/60 text-slate-300'
          return (
            <section key={`rider-${idx}`} className={panelClass}>
              <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1 grid gap-1">
                  <div className={sectionHeaderClass}>Data Rider #{idx + 1}</div>
                  <p className={helperClass}>Isi identitas rider sesuai dokumen.</p>
                </div>
                {riders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRider(idx)}
                    className="shrink-0 rounded-full border border-[#ef9a9a] bg-[#ffe1e1] px-3.5 py-2 text-xs font-black uppercase tracking-wide text-[#a61919] shadow-sm transition-colors hover:border-[#d94b4b] hover:bg-[#ffcaca]"
                  >
                    Hapus
                  </button>
                )}
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label className={labelClass}>{requiredLabel('Nama Lengkap Rider')}</label>
                    <input
                      value={rider.name}
                      onChange={(e) => updateRider(idx, { name: e.target.value })}
                      placeholder="Sesuai dokumen"
                      className={fieldClass}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className={labelClass}>{requiredLabel('Nama Panggilan')}</label>
                    <input
                      value={rider.nickname}
                      onChange={(e) => updateRider(idx, { nickname: e.target.value })}
                      placeholder="Nama yang dipanggil panitia"
                      className={fieldClass}
                    />
                  </div>
                </div>
                {riderJerseySizeRequired && (
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                    <div className="grid gap-2">
                      <label className={labelClass}>{requiredLabel('Ukuran Jersey')}</label>
                      <select
                        value={rider.jerseySize}
                        onChange={(e) => updateRider(idx, { jerseySize: e.target.value })}
                        className={fieldClass}
                      >
                        <option value="">Pilih ukuran jersey</option>
                        {jerseySizeOptions.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-700 bg-white shadow-[0_12px_30px_rgba(2,6,23,0.18)]">
                      <div className="border-b border-slate-200 px-3 py-2">
                        <div className="text-sm font-black uppercase tracking-[0.12em] text-slate-800">Size Chart</div>
                        <div className="text-[11px] font-semibold text-slate-500">
                          Pilihan ukuran yang aktif di form saat ini: {jerseySizeOptions.join(', ')}.
                        </div>
                      </div>
                      <div className="bg-slate-100 p-2">
                        {!businessSettingsLoaded ? (
                          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs font-bold text-slate-500">
                            Memuat size chart...
                          </div>
                        ) : jerseySizeChartImageUrl && !jerseySizeChartFailed ? (
                          <Image
                            src={jerseySizeChartImageUrl}
                            alt="Jersey size chart"
                            width={900}
                            height={600}
                            sizes="(min-width: 768px) 50vw, 100vw"
                            className="block w-full h-auto"
                            onError={() => setJerseySizeChartFailed(true)}
                          />
                        ) : jerseySizeChartImageUrl && jerseySizeChartFailed ? (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                            Gambar size chart gagal dimuat. Cek URL gambar di Event Settings atau upload ulang.
                          </div>
                        ) : (
                          <JerseySizeChartGraphic />
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className={labelClass}>{requiredLabel('Tanggal Lahir Rider')}</label>
                    <input
                      type="date"
                      value={rider.dateOfBirth}
                      onChange={(e) => updateRider(idx, { dateOfBirth: e.target.value })}
                      onBlur={() => setBirthDateTouched((prev) => prev.map((item, index) => (index === idx ? true : item)))}
                      className={fieldClass}
                    />
                    <div className="text-[11px] font-semibold text-slate-400">
                      Pastikan ini tanggal lahir rider, bukan tanggal pendaftaran.
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className={labelClass}>{requiredLabel('Gender Kategori')}</label>
                    <select
                      value={rider.gender}
                      onChange={(e) => updateRider(idx, { gender: e.target.value as 'BOY' | 'GIRL' })}
                      className={fieldClass}
                    >
                      <option value="BOY">BOY</option>
                      <option value="GIRL">GIRL</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className={labelClass}>{requiredLabel('Club / Komunitas Rider')}</label>
                  <input
                    value={rider.club}
                    onChange={(e) => updateRider(idx, { club: e.target.value })}
                    placeholder="Contoh: Pekanbaru Pushbike"
                    className={fieldClass}
                  />
                </div>

                <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] p-4">
                  <div className="text-sm font-black text-slate-100">
                    Kategori Otomatis: <span className="text-amber-300">{primaryCategory ? primaryCategory.label : 'Belum ditemukan'}</span>
                  </div>
                  {showFallbackPrimarySelector && (
                    <div className="mt-3 grid gap-2">
                      <select
                        value={rider.primaryCategoryId}
                        onChange={(e) =>
                          updateRider(idx, {
                            primaryCategoryId: e.target.value,
                            extraCategoryId: e.target.value === rider.extraCategoryId ? '' : rider.extraCategoryId,
                          })
                        }
                        className={fieldClass}
                      >
                        <option value="">Pilih kategori pengganti</option>
                        {fallbackPrimaryOptions.map((cat) => (
                          <option key={cat.id} value={cat.id} disabled={isCategoryFull(cat)}>
                            {cat.label}{isCategoryFull(cat) ? ' (Kuota Penuh)' : ''}
                          </option>
                        ))}
                      </select>
                      {selectedFallbackPrimaryCategory && !isCategoryFull(selectedFallbackPrimaryCategory) && (
                        <div className="text-xs font-semibold text-emerald-200">
                          Rider akan masuk ke kategori utama: {selectedFallbackPrimaryCategory.label}
                        </div>
                      )}
                    </div>
                  )}
                  {!primaryCategory && (
                    <div className="mt-2 text-xs font-semibold text-amber-300">
                      {primaryIssue === 'full'
                        ? 'Kategori sesuai umur penuh, dan semua kategori di atas umur rider juga penuh.'
                        : primaryIssue === 'fallback_required'
                        ? 'Kategori sesuai umur penuh. Pilih kategori di atas umur rider.'
                        : hasMatchedFullCategory
                        ? 'Kategori untuk rider ini tersedia, tetapi kuotanya sudah penuh.'
                        : 'Tanggal lahir tidak masuk range kategori aktif event ini.'}
                    </div>
                  )}
                </div>

                {pairedEvent && businessSettings?.event_bundle_offer?.enabled && (
                  <label className={`flex items-start gap-3 rounded-2xl border p-4 ${pairedEvent.registrationOpen ? 'cursor-pointer border-[#e6bd38]/35 bg-[#f3c63d]/[0.06]' : 'cursor-not-allowed border-white/10 bg-slate-950/30 opacity-70'}`}>
                    <input
                      type="checkbox"
                      checked={rider.pairedEventSelected}
                      disabled={!pairedEvent.registrationOpen}
                      onChange={(event) => updateRider(idx, {
                        pairedEventSelected: event.target.checked,
                        ...(!event.target.checked ? { pairedPrimaryCategoryId: '', pairedExtraCategoryId: '', pairedBundleId: '' } : {}),
                      })}
                      className="mt-1 h-5 w-5 shrink-0 accent-[#f3c63d]"
                    />
                    <span className="grid gap-1">
                      <span className="text-sm font-black text-slate-100">Daftarkan rider ini juga ke {pairedEvent.name}</span>
                      <span className="text-xs font-semibold text-slate-300">Biaya dasar paket {formatRupiah(Number(businessSettings.event_bundle_offer.bundle_base_price_per_rider))}; kategori dan biaya tambahan dihitung untuk rider ini saja.</span>
                    </span>
                  </label>
                )}

                {rider.pairedEventSelected && pairedEvent && (
                  <div className="rounded-2xl border border-sky-300/20 bg-sky-500/[0.06] p-4">
                    <div className="text-sm font-black text-slate-100">Kategori {pairedEvent.name}</div>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Kategori dihitung dari tanggal lahir rider dan tanggal event pasangan.</p>
                    {!rider.dateOfBirth ? (
                      <p className="mt-3 text-xs font-bold text-amber-200">Isi tanggal lahir untuk memilih kategori event pasangan.</p>
                    ) : pairedPrimaryOptions.length === 0 ? (
                      <p className="mt-3 text-xs font-bold text-rose-200">Tidak ada kategori yang cocok atau slot kategori event pasangan sudah penuh.</p>
                    ) : (
                      <>
                        <label className="mt-3 grid gap-2">
                          <span className={labelClass}>Kategori utama</span>
                          <select
                            value={pairedPrimaryCategory?.id ?? ''}
                            onChange={(event) => updateRider(idx, { pairedPrimaryCategoryId: event.target.value, pairedExtraCategoryId: '' })}
                            className={fieldClass}
                          >
                            {pairedPrimaryOptions.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                          </select>
                        </label>
                        <label className="mt-3 grid gap-2">
                          <span className={labelClass}>Kategori tambahan / upclass Ãƒâ€šÃ‚Â· {formatRupiah(pairedExtraPrice)}</span>
                          <select
                            value={rider.pairedExtraCategoryId}
                            onChange={(event) => updateRider(idx, { pairedExtraCategoryId: event.target.value })}
                            className={fieldClass}
                          >
                            <option value="">Tidak ikut kategori tambahan</option>
                            {pairedExtraOptions.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                          </select>
                        </label>
                        {pairedBundles.length > 0 && (
                          <label className="mt-3 grid gap-2">
                            <span className={labelClass}>Bundling tambahan event pasangan</span>
                            <select value={rider.pairedBundleId} onChange={(event) => updateRider(idx, { pairedBundleId: event.target.value })} className={fieldClass}>
                              <option value="">Tanpa bundling</option>
                              {pairedBundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.name} Ãƒâ€šÃ‚Â· {bundle.price === 0 ? 'tanpa biaya tambahan' : `+ ${formatRupiah(bundle.price)}`}</option>)}
                            </select>
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/[0.06] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-black text-slate-100">Kategori Tambahan / Up Category</div>
                    <div className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-200">
                      + {formatRupiah(extraPrice)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">{extraCategoryMessage}</div>
                  {extras.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      <select
                        value={rider.extraCategoryId}
                        onChange={(e) => updateRider(idx, { extraCategoryId: e.target.value })}
                        className={fieldClass}
                      >
                        <option value="">Tidak ikut kategori tambahan</option>
                        {extras.map((cat) => (
                          <option key={cat.id} value={cat.id} disabled={isCategoryFull(cat)}>
                            {cat.label}{isCategoryFull(cat) ? ' (Kuota Penuh)' : ''}
                          </option>
                        ))}
                      </select>
                      {selectedExtraCategory && (
                        <div className="text-xs font-semibold text-emerald-200">
                          Rider akan didaftarkan juga ke kategori tambahan: {selectedExtraCategory.label}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {enabledBundles.length > 0 && (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-black text-slate-100">Bundling tambahan</div>
                      <div className="text-xs font-bold text-amber-200">Opsional Ãƒâ€šÃ‚Â· per rider</div>
                    </div>
                    <select value={rider.bundleId} onChange={(event) => updateRider(idx, { bundleId: event.target.value })} className={`${fieldClass} mt-3`}>
                      <option value="">Tanpa bundling</option>
                      {enabledBundles.map((bundle) => (
                        <option key={bundle.id} value={bundle.id}>{bundle.name} Ãƒâ€šÃ‚Â· {bundle.price === 0 ? 'tanpa biaya tambahan' : `+ ${formatRupiah(bundle.price)}`}</option>
                      ))}
                    </select>
                    {rider.bundleId && enabledBundles.find((bundle) => bundle.id === rider.bundleId)?.description && (
                      <p className="mt-2 text-xs font-semibold text-slate-300">{enabledBundles.find((bundle) => bundle.id === rider.bundleId)?.description}</p>
                    )}
                  </div>
                )}

                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-black text-slate-100">{requiredLabel('Nomor Plate yang Diajukan')}</div>
                    <div className="rounded-full border border-slate-600 bg-slate-900/80 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-amber-200">
                      Preview: {platePreview}
                    </div>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">
                    Isi angka saja. Huruf tambahan hanya dipakai jika nomor utama sudah digunakan rider lain.
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      value={rider.requestedPlateNumber}
                      onChange={(e) =>
                        updateRider(idx, {
                          requestedPlateNumber: e.target.value.replace(/\D/g, '').slice(0, 3),
                        })
                      }
                      placeholder="Nomor Plate (angka saja)"
                      inputMode="numeric"
                      maxLength={3}
                      className={fieldClass}
                    />
                    {!showPlateSuffixField && (
                      <button
                        type="button"
                        onClick={() => updateRider(idx, { usePlateSuffix: true })}
                        disabled={!rider.requestedPlateNumber}
                        className="rounded-xl border border-slate-500 bg-slate-900/70 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-slate-100 transition-colors hover:border-amber-400/60 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Tambah Huruf
                      </button>
                    )}
                  </div>

                  {showPlateSuffixField && (
                    <div className="mt-3 grid gap-2">
                      <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                        <input
                          value={rider.requestedPlateSuffix}
                          onChange={(e) =>
                            updateRider(idx, {
                              requestedPlateSuffix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1),
                            })
                          }
                          placeholder="Huruf Tambahan"
                          maxLength={1}
                          className={fieldClass}
                        />
                        <div className="flex flex-wrap gap-2">
                          {plateCheck.suggestedSuffix && plateCheck.suggestedSuffix !== rider.requestedPlateSuffix && (
                            <button
                              type="button"
                              onClick={() =>
                                updateRider(idx, {
                                  usePlateSuffix: true,
                                  requestedPlateSuffix: plateCheck.suggestedSuffix ?? '',
                                })
                              }
                              className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-amber-100 transition-colors hover:bg-amber-400/20"
                            >
                              Pakai {plateCheck.suggestedSuffix}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] font-semibold text-slate-400">
                        Contoh: jika nomor 12 sudah dipakai, Anda bisa ajukan 12A.
                      </div>
                    </div>
                  )}

                  {plateCheck.state !== 'idle' && (
                    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${plateStatusClass}`}>
                      {plateCheck.message}
                    </div>
                  )}
                </div>

                <div className={`grid gap-3 ${riderPhotoIsRequired ? 'md:grid-cols-2' : ''}`}>
                  {riderPhotoIsRequired && (
                    <div className="grid gap-2">
                    <label className={labelClass}>{requiredLabel('Upload Foto Rider')}</label>
                      <label
                        className={dropZoneClass(`photo-${idx}`)}
                        tabIndex={0}
                        onDragEnter={(e) => onDropZoneOver(`photo-${idx}`, e)}
                        onDragOver={(e) => onDropZoneOver(`photo-${idx}`, e)}
                        onDragLeave={(e) => onDropZoneLeave(`photo-${idx}`, e)}
                        onDrop={(e) =>
                          onDropZoneDrop(`photo-${idx}`, e, (file) => void uploadRiderFile(idx, file, 'rider-photo', `Foto rider #${idx + 1}`), `Foto rider #${idx + 1}`, 'rider-photo', false)
                        }
                        onPaste={(e) =>
                          onDropZonePaste(e, (file) => void uploadRiderFile(idx, file, 'rider-photo', `Foto rider #${idx + 1}`), `Foto rider #${idx + 1}`, 'rider-photo', false)
                        }
                      >
                        <span className="truncate text-sm font-bold text-slate-100">
                          {rider.photo ? rider.photo.name : 'Pilih file foto'}
                        </span>
                        <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-100">
                          Browse
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null
                            setValidatedUploadFile(file, `Foto rider #${idx + 1}`, 'rider-photo', (nextFile) =>
                              void uploadRiderFile(idx, nextFile, 'rider-photo', `Foto rider #${idx + 1}`)
                            )
                            e.currentTarget.value = ''
                          }}
                          className="hidden"
                        />
                      </label>
                      <div className="text-[11px] font-semibold text-slate-400">
                        {getUploadHint('rider-photo')} Bisa drag & drop atau paste (Ctrl+V).
                      </div>
                      {rider.photoUploadStatus === 'uploading' && (
                        <div className="text-[11px] font-black text-[#9a4b08]">Mengupload foto...</div>
                      )}
                      {rider.photoUploadStatus === 'uploaded' && (
                        <div className="text-[11px] font-black text-[#087443]">Foto berhasil diupload.</div>
                      )}
                      {rider.photoUploadStatus === 'error' && (
                        <div className="text-[11px] font-black text-[#b93612]">{rider.photoUploadError}</div>
                      )}
                    </div>
                  )}
                  <div className="grid gap-2">
                    <label className={labelClass}>{requiredLabel('Upload KK / Akte / KIA')}</label>
                    <label
                      className={dropZoneClass(`doc-${idx}`)}
                      tabIndex={0}
                      onDragEnter={(e) => onDropZoneOver(`doc-${idx}`, e)}
                      onDragOver={(e) => onDropZoneOver(`doc-${idx}`, e)}
                      onDragLeave={(e) => onDropZoneLeave(`doc-${idx}`, e)}
                      onDrop={(e) =>
                        onDropZoneDrop(`doc-${idx}`, e, (file) => void uploadRiderFile(idx, file, 'document', `Dokumen rider #${idx + 1}`), `Dokumen KK/Akte/KIA rider #${idx + 1}`, 'document', true)
                      }
                      onPaste={(e) =>
                        onDropZonePaste(e, (file) => void uploadRiderFile(idx, file, 'document', `Dokumen rider #${idx + 1}`), `Dokumen KK/Akte/KIA rider #${idx + 1}`, 'document', true)
                      }
                    >
                        <span className="truncate text-sm font-bold text-slate-100">
                          {rider.docKk ? rider.docKk.name : rider.docKkPreviewUrl ? 'Dokumen lama siap digunakan' : 'Pilih dokumen KK/Akte/KIA'}
                        </span>
                      <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-100">
                        Browse
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          setValidatedUploadFile(file, `Dokumen KK/Akte/KIA rider #${idx + 1}`, 'document', (nextFile) =>
                            void uploadRiderFile(idx, nextFile, 'document', `Dokumen rider #${idx + 1}`)
                          )
                          e.currentTarget.value = ''
                        }}
                        className="hidden"
                      />
                    </label>
                    <div className="text-[11px] font-semibold text-slate-400">
                      {getUploadHint('document')} Bisa drag & drop atau paste (Ctrl+V).
                    </div>
                    {rider.docKkUploadStatus === 'uploading' && (
                      <div className="text-[11px] font-black text-[#9a4b08]">Mengupload dokumen...</div>
                    )}
                    {rider.docKkUploadStatus === 'uploaded' && (
                      <div className="text-[11px] font-black text-[#087443]">{rider.docKkPreviewUrl ? 'Dokumen lama siap digunakan. Periksa pratinjau sebelum lanjut.' : 'Dokumen berhasil diupload.'}</div>
                    )}
                    {rider.docKkUploadStatus === 'error' && (
                      <div className="text-[11px] font-black text-[#b93612]">{rider.docKkUploadError}</div>
                    )}
                    {rider.docKkPreviewUrl && (
                      <div className="grid gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/[0.05] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-black text-emerald-200">Pratinjau dokumen sebelumnya</span>
                          <a href={rider.docKkPreviewUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-amber-200 underline">Buka</a>
                        </div>
                        {rider.docKkPreviewType === 'pdf' ? (
                          <iframe title={`Pratinjau dokumen rider ${idx + 1}`} src={rider.docKkPreviewUrl} className="h-64 w-full rounded-lg border border-white/10 bg-white" />
                        ) : (
                          <a href={rider.docKkPreviewUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buka pratinjau dokumen rider ${idx + 1}`}>
                            <img src={rider.docKkPreviewUrl} alt={`Pratinjau dokumen rider ${idx + 1}`} className="max-h-72 w-full rounded-lg bg-white object-contain" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )
        })}

        <button
          type="button"
          onClick={addRider}
          className="rounded-2xl border border-[#1d0d07] bg-[#1d0d07] px-4 py-3.5 text-sm font-black uppercase text-[#fff8e8] shadow-[0_14px_30px_rgba(55,23,9,0.16)] transition-colors hover:bg-[#e84b16]"
        >
          + Tambah Rider
        </button>
        </>
        ) : activeStep === 3 ? (
        <>

        <section className={panelClass}>
          <div className={sectionHeaderClass}>Pembayaran Manual</div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
            Silakan transfer total biaya dan upload bukti pembayaran.
          </p>
          <div className="mt-4 grid gap-3">
            {showPaymentDestination && (
              <div className={`grid gap-3 ${paymentQrisImageUrl ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
                <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-amber-200">
                    Rekening Tujuan Transfer
                  </div>
                  <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-100">
                    {paymentBankName && (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                        <span className="text-slate-300">Bank</span>
                        <span>{paymentBankName}</span>
                      </div>
                    )}
                    {paymentAccountName && (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                        <span className="text-slate-300">Atas Nama</span>
                        <span>{paymentAccountName}</span>
                      </div>
                    )}
                    {paymentAccountNumber && (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-slate-950/45 px-3 py-3">
                        <span className="text-slate-300">No. Rekening</span>
                        <span className="font-black tracking-[0.08em] text-amber-100">{paymentAccountNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
                {paymentQrisImageUrl && (
                  <div className="rounded-2xl border border-white/10 bg-white p-3 shadow-[0_18px_45px_rgba(2,6,23,0.18)]">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-700">
                        QRIS Pembayaran
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-500">Scan untuk pembayaran</div>
                    </div>
                    <Image
                      src={paymentQrisImageUrl}
                      alt="QRIS pembayaran"
                      width={240}
                      height={320}
                      sizes="240px"
                      className="mx-auto mt-3 block aspect-[3/4] w-full max-w-[240px] rounded-xl object-contain"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <label className={labelClass}>{requiredLabel('Bank Pengirim')}</label>
                <input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Contoh: BCA"
                  className={fieldClass}
                />
              </div>
              <div className="grid gap-2">
                <label className={labelClass}>{requiredLabel('Atas Nama Pengirim')}</label>
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Nama pemilik rekening"
                  className={fieldClass}
                />
              </div>
              <div className="grid gap-2">
                <label className={labelClass}>{requiredLabel('Nomor Rekening Pengirim')}</label>
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Nomor rekening"
                  className={fieldClass}
                />
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
              <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-200">Ringkasan Biaya</div>
              <div className="mt-2 grid gap-2 text-sm font-semibold text-slate-200">
                {baseRiderCount > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span>{baseRiderCount} rider x {formatRupiah(basePrice)}</span>
                    <span>{formatRupiah(baseAmount)}</span>
                  </div>
                )}
                {pairedRiderCount > 0 && pairedEvent && (
                  <div className="flex items-center justify-between gap-3">
                    <span>{pairedRiderCount} rider x paket {pairedEvent.name}</span>
                    <span>{formatRupiah(bundleBaseAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span>{extraCategoryCount} up category x {formatRupiah(extraPrice)}</span>
                  <span>{formatRupiah(extraAmount)}</span>
                </div>
                {enabledBundles.length > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span>{bundleSelections.length} bundling pilihan</span>
                    <span>{formatRupiah(bundleAmount)}</span>
                  </div>
                )}
                {eventBundleSelected && pairedEvent && (riders.some((rider) => rider.pairedExtraCategoryId || rider.pairedBundleId)) && (
                  <div className="flex items-center justify-between gap-3">
                    <span>Upclass & bundling tambahan {pairedEvent.name}</span>
                    <span>{formatRupiah(riders.filter((rider) => rider.pairedEventSelected && rider.pairedExtraCategoryId).length * pairedExtraPrice + pairedBundleAmount)}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-emerald-300/15 pt-3 text-sm font-black text-emerald-100">
                <span>Total Bayar</span>
                <span>{formatRupiah(totalAmount)}</span>
              </div>
            </div>
            <label className={labelClass}>{requiredLabel('Upload Bukti Pembayaran')}</label>
            <label
              className={dropZoneClass('payment-proof')}
              tabIndex={0}
              onDragEnter={(e) => onDropZoneOver('payment-proof', e)}
              onDragOver={(e) => onDropZoneOver('payment-proof', e)}
              onDragLeave={(e) => onDropZoneLeave('payment-proof', e)}
              onDrop={(e) => onDropZoneDrop('payment-proof', e, (file) => void uploadPaymentProof(file), 'Bukti pembayaran', 'payment', true)}
              onPaste={(e) => onDropZonePaste(e, (file) => void uploadPaymentProof(file), 'Bukti pembayaran', 'payment', true)}
            >
              <span className="truncate text-sm font-bold text-slate-100">
                {paymentProof ? paymentProof.name : 'Upload bukti pembayaran'}
              </span>
              <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-100">
                Browse
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setValidatedUploadFile(file, 'Bukti pembayaran', 'payment', (nextFile) => void uploadPaymentProof(nextFile))
                  e.currentTarget.value = ''
                }}
                className="hidden"
              />
            </label>
            <div className="text-[11px] font-semibold text-slate-400">
              {getUploadHint('payment')} Bisa drag & drop atau paste (Ctrl+V).
            </div>
            {paymentUploadStatus === 'uploading' && (
              <div className="text-[11px] font-black text-[#9a4b08]">Mengupload bukti pembayaran...</div>
            )}
            {paymentUploadStatus === 'uploaded' && (
              <div className="text-[11px] font-black text-[#087443]">Bukti pembayaran berhasil diupload.</div>
            )}
            {paymentUploadStatus === 'error' && (
              <div className="text-[11px] font-black text-[#b93612]">{paymentUploadError}</div>
            )}
          </div>
        </section>
        </>
        ) : (
        <section className={panelClass}>
          <div className="mb-5 grid gap-1">
            <div className={sectionHeaderClass}>Review Pendaftaran</div>
            <p className={helperClass}>Periksa kembali seluruh data sebelum dikirim ke panitia.</p>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-[#d9c9ae] bg-[#f8eedb] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black uppercase text-[#1d0d07]">Kontak Wali</div>
                <button type="button" onClick={() => goToStep(1)} className="text-xs font-black uppercase text-[#b93612]">
                  Ubah
                </button>
              </div>
              <div className="mt-3 grid gap-1 text-sm font-semibold text-[#58493d]">
                <div>{contactName}</div>
                <div>{contactPhone}</div>
                <div>{contactEmail || 'Email tidak diisi'}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d9c9ae] bg-[#f8eedb] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black uppercase text-[#1d0d07]">Data Rider</div>
                <button type="button" onClick={() => goToStep(2)} className="text-xs font-black uppercase text-[#b93612]">
                  Ubah
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {riders.map((rider, index) => {
                  const birthYear = getCompleteBirthYear(rider.dateOfBirth)
                  const primaryCategory = computePrimaryCategory(
                    birthYear,
                    rider.gender,
                    rider.primaryCategoryId,
                    rider.dateOfBirth
                  )
                  const extraCategory = categories.find((category) => category.id === rider.extraCategoryId) ?? null
                  const selectedBundle = enabledBundles.find((bundle) => bundle.id === rider.bundleId) ?? null
                  const plate = formatPlateDisplay(
                    rider.requestedPlateNumber,
                    rider.requestedPlateSuffix,
                    Boolean(rider.requestedPlateSuffix)
                  )

                  return (
                    <div key={`review-${index}`} className="rounded-xl border border-[#e2d5bd] bg-[#fff8e8] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-black text-[#1d0d07]">Rider {index + 1}: {rider.name}</div>
                          <div className="mt-1 text-xs font-semibold text-[#796657]">
                            Nama panggilan: {rider.nickname}
                          </div>
                        </div>
                        <span className="rounded-full border border-[#d9c9ae] bg-[#efe2c7] px-3 py-1 text-xs font-black uppercase text-[#58493d]">
                          Plate {plate}
                        </span>
                      </div>

                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Tanggal Lahir</dt>
                          <dd className="mt-1 font-bold text-[#3f2b20]">{rider.dateOfBirth}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Gender</dt>
                          <dd className="mt-1 font-bold text-[#3f2b20]">{rider.gender}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Club / Komunitas</dt>
                          <dd className="mt-1 font-bold text-[#3f2b20]">{rider.club}</dd>
                        </div>
                        {(requireJerseySize || (rider.pairedEventSelected && pairedRequireJerseySize)) && (
                          <div>
                            <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Ukuran Jersey</dt>
                            <dd className="mt-1 font-bold text-[#3f2b20]">{rider.jerseySize}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Kategori Utama</dt>
                          <dd className="mt-1 font-bold text-[#3f2b20]">{primaryCategory?.label ?? '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Kategori Tambahan</dt>
                          <dd className="mt-1 font-bold text-[#3f2b20]">{extraCategory?.label ?? 'Tidak ikut'}</dd>
                        </div>
                        {rider.pairedEventSelected && pairedEvent && (
                          <div>
                            <dt className="text-[10px] font-black uppercase text-[#9a4b08]">{pairedEvent.name}</dt>
                            <dd className="mt-1 font-bold text-[#3f2b20]">
                              {getPairedPrimaryCategory(rider)?.label ?? 'Kategori belum dipilih'}
                              {rider.pairedExtraCategoryId ? ` + ${pairedCategories.find((category) => category.id === rider.pairedExtraCategoryId)?.label ?? 'Upclass'}` : ''}
                            </dd>
                          </div>
                        )}
                        {enabledBundles.length > 0 && (
                          <div>
                            <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Bundling</dt>
                            <dd className="mt-1 font-bold text-[#3f2b20]">
                              {selectedBundle ? `${selectedBundle.name}${selectedBundle.price > 0 ? ` (+${formatRupiah(selectedBundle.price)})` : ''}` : 'Tidak memilih'}
                            </dd>
                          </div>
                        )}
                        {(riderPhotoUploadEnabled || (rider.pairedEventSelected && pairedRiderPhotoRequired)) && (
                          <div>
                            <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Foto Rider</dt>
                            <dd className="mt-1 break-all font-bold text-[#3f2b20]">{rider.photo?.name ?? '-'}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-[10px] font-black uppercase text-[#9a4b08]">Dokumen Rider</dt>
                          <dd className="mt-1 break-all font-bold text-[#3f2b20]">{rider.docKk?.name ?? '-'}</dd>
                        </div>
                      </dl>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-[#d9c9ae] bg-[#f8eedb] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black uppercase text-[#1d0d07]">Pembayaran</div>
                <button type="button" onClick={() => goToStep(3)} className="text-xs font-black uppercase text-[#b93612]">
                  Ubah
                </button>
              </div>
              <div className="mt-3 grid gap-1 text-sm font-semibold text-[#58493d]">
                <div>{bankName} Ãƒâ€šÃ‚Â· {accountName}</div>
                <div>{accountNumber}</div>
                <div>Bukti: {paymentProof?.name}</div>
                <div className="mt-2 text-lg font-black text-[#087443]">Total {formatRupiah(totalAmount)}</div>
              </div>
            </div>
          </div>
        </section>
        )}

      </main>

      {submitConfirmationOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1d0d07]/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-[#d9c9ae] bg-[#fff8e8] p-6 text-[#1d0d07] shadow-[0_30px_90px_rgba(55,23,9,0.45)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#d8a916] bg-[#f3c63d] text-3xl font-black">
              !
            </div>
            <div className="mt-4 text-center text-xs font-black uppercase tracking-[0.18em] text-[#e84b16]">
              Konfirmasi Pendaftaran
            </div>
            <h3 className="mt-2 text-center text-2xl font-black">Kirim data pendaftaran?</h3>
            <p className="mt-3 text-center text-sm font-semibold leading-6 text-[#58493d]">
              Pastikan data kontak, rider, kategori, nomor plate, dan pembayaran sudah benar. Data akan dikirim ke panitia untuk diverifikasi.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSubmitConfirmationOpen(false)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#705547] px-5 py-3 text-sm font-black uppercase text-[#58493d] hover:border-[#e84b16] hover:text-[#e84b16]"
              >
                Cek Lagi
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#f3c63d] px-5 py-3 text-sm font-black uppercase text-[#1d0d07] hover:bg-[#ffda5a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Mengirim...' : 'Ya, Kirim'}
              </button>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1d0d07]/75 px-4 backdrop-blur-sm">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[1.75rem] border border-[#d9c9ae] bg-[#fff8e8] p-6 text-[#1d0d07] shadow-[0_30px_90px_rgba(55,23,9,0.45)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#d8a916] bg-[#f3c63d] text-4xl font-black text-[#1d0d07] shadow-[0_10px_24px_rgba(243,198,61,0.28)]">
              ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“
            </div>
            <div className="mt-4 text-center text-xs font-black uppercase tracking-[0.18em] text-[#e84b16]">
              Pendaftaran Berhasil Dikirim
            </div>
            <h3 className="mt-3 text-center text-2xl font-black text-[#1d0d07]">Menunggu Verifikasi Panitia</h3>
            <div className="mt-5 rounded-2xl border border-[#efd289] bg-[#fff2c9] p-4 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a5700]">Kode Registrasi</div>
              <div className="mt-1 break-all text-2xl font-black tracking-wide text-[#1d0d07]">
                {success.registrationCode}
              </div>
              <p className="mt-1 text-xs font-semibold text-[#796657]">
                Simpan kode ini untuk mengecek status pendaftaran.
              </p>
              <div className="mx-auto mt-4 w-fit rounded-2xl border border-[#d9c9ae] bg-white p-3 shadow-sm">
                <Image
                  src={buildQrCodeUrl(buildRegistrationStatusUrl(success.registrationCode), 180)}
                  alt={`QR status pendaftaran ${success.registrationCode}`}
                  width={180}
                  height={180}
                  className="h-[150px] w-[150px] sm:h-[180px] sm:w-[180px]"
                />
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[#796657]">
                Scan QR untuk membuka halaman cek status.
              </p>
              {success.pairedRegistrationCode && (
                <div className="mt-3 rounded-xl border border-[#d9c9ae] bg-[#fff8e8] p-3 text-left">
                  <div className="text-xs font-black uppercase text-[#796657]">Event pasangan Ãƒâ€šÃ‚Â· {success.pairedEventName}</div>
                  <div className="mt-1 font-mono text-lg font-black tracking-wide text-[#1d0d07]">{success.pairedRegistrationCode}</div>
                  <p className="mt-1 text-xs font-semibold text-[#796657]">Simpan kedua kode pendaftaran untuk memeriksa status masing-masing event.</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => void copyRegistrationCode(success.registrationCode)}
                className="mt-3 rounded-full border border-[#d8a916] bg-[#fff8e8] px-4 py-2 text-xs font-black uppercase text-[#68420a] hover:bg-white"
              >
                {codeCopied ? 'Tersalin' : 'Salin Kode'}
              </button>
              {codeCopied && (
                <div
                  role="status"
                  className="mx-auto mt-3 w-fit rounded-full border border-[#9bc9ae] bg-[#e3f3e6] px-3 py-1.5 text-xs font-black text-[#087443] shadow-sm"
                >
                  ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ Kode telah disalin
                </div>
              )}
            </div>
            <div className="mt-5 rounded-2xl border border-[#d9c9ae] bg-[#f8eedb] p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#796657]">Total Pembayaran</div>
              <div className="mt-1 text-2xl font-black text-[#087443]">{formatRupiah(success.totalAmount)}</div>
              <div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#796657]">Rider Terdaftar</div>
              <div className="mt-2 grid gap-2">
                {success.riderNames.map((name, index) => (
                  <div key={`${name}-${index}`} className="rounded-xl border border-[#e2d5bd] bg-[#fff8e8] px-3 py-2 text-sm font-extrabold text-[#1d0d07]">
                    {index + 1}. {name}
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-center text-sm font-semibold leading-6 text-[#58493d]">
              Pendaftaran rider sedang menunggu verifikasi panitia. Email konfirmasi akan dikirim setelah pembayaran dan data rider disetujui panitia.
            </p>
            {!success.hasContactEmail && (
              <p className="mt-2 rounded-xl border border-[#efd289] bg-[#fff2c9] px-3 py-2 text-center text-xs font-semibold leading-5 text-[#8a5700]">
                Email tidak diisi, jadi konfirmasi email tidak dikirim untuk pendaftaran ini.
              </p>
            )}
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleSuccessClose}
                className="inline-flex items-center justify-center rounded-full bg-[#f3c63d] px-6 py-3 text-sm font-black uppercase tracking-wide text-[#1d0d07] shadow-[0_12px_28px_rgba(243,198,61,0.25)] transition-colors hover:bg-[#ffda5a]"
              >
                Oke, Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {prefillModalOpen && prefillCandidates.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="prefill-rider-title" className="grid max-h-[90dvh] w-full max-w-lg gap-4 overflow-y-auto rounded-[1.75rem] border border-amber-300/30 bg-slate-900 p-5 text-slate-100 shadow-[0_30px_90px_rgba(2,6,23,0.65)] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">Data pendaftaran sebelumnya</p>
                <h2 id="prefill-rider-title" className="mt-1 text-xl font-black">Gunakan data rider ini?</h2>
              </div>
              <button type="button" onClick={() => setPrefillModalOpen(false)} aria-label="Tutup konfirmasi rider" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-300 transition hover:border-amber-300 hover:text-amber-200">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            </div>
            <p className="text-sm font-medium leading-5 text-slate-300">
              Ditemukan {prefillCandidates.length} rider dengan nomor WhatsApp ini. Pilih satu atau beberapa nama, lalu masukkan tanggal lahir masing-masing untuk verifikasi sebelum memuat data.
            </p>
            <div className="grid gap-2">
              {prefillCandidates.map((candidate) => {
                const loaded = loadedPrefillIds.includes(candidate.id)
                const selected = selectedPrefillRiderIds.includes(candidate.id)
                return (
                  <div key={candidate.id} className={`rounded-xl border p-3 transition-colors ${loaded ? 'border-emerald-300/20 bg-emerald-300/[0.03]' : selected ? 'border-[#f3c63d]/50 bg-[#f3c63d]/[0.06]' : 'border-white/10 bg-slate-950/35'}`}>
                    <label className={`flex min-h-8 items-center gap-3 text-sm font-bold ${loaded ? 'text-slate-500' : 'cursor-pointer text-slate-100'}`}>
                      <input
                        type="checkbox"
                        name="previous-rider-candidate-modal"
                        value={candidate.id}
                        checked={selected}
                        disabled={loaded || prefillLoading}
                        className="sr-only"
                        onChange={() => {
                          setSelectedPrefillRiderIds((current) => selected ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])
                          setPrefillDateOfBirths((current) => {
                            if (selected) {
                              const next = { ...current }
                              delete next[candidate.id]
                              return next
                            }
                            return current
                          })
                          setPrefillMessage(null)
                        }}
                      />
                      <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${selected ? 'border-[#f3c63d] bg-[#f3c63d]' : loaded ? 'border-emerald-300/40' : 'border-slate-500'}`}>
                        {selected && <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-[#1d0d07]" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3 3 7-7" /></svg>}
                        {loaded && <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 text-emerald-300" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 3 3 7-7" /></svg>}
                      </span>
                      <span className="flex-1">{candidate.masked_name}</span>
                      {loaded && <span className="text-[10px] font-black uppercase text-emerald-300">Sudah dimuat</span>}
                    </label>
                    {selected && (
                      <div className="mt-3 grid gap-1.5 border-t border-white/10 pt-3">
                        <label htmlFor={`prefill-rider-dob-${candidate.id}`} className={labelClass}>Tanggal lahir {candidate.masked_name}</label>
                        <input
                          id={`prefill-rider-dob-${candidate.id}`}
                          type="date"
                          value={prefillDateOfBirths[candidate.id] ?? ''}
                          onChange={(event) => setPrefillDateOfBirths((current) => ({ ...current, [candidate.id]: event.target.value }))}
                          className={fieldClass}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {selectedPrefillRiderIds.length > 0 && (
              <button
                type="button"
                disabled={prefillLoading || selectedPrefillRiderIds.some((id) => !prefillDateOfBirths[id])}
                onClick={() => void loadPreviousRiders()}
                className="min-h-11 rounded-xl bg-[#f3c63d] px-4 py-2 text-sm font-black text-[#1d0d07] disabled:opacity-60"
              >
                {prefillLoading ? 'Memverifikasi semua rider...' : `Gunakan ${selectedPrefillRiderIds.length} Data Rider`}
              </button>
            )}
            {prefillMessage && (
              <p role={prefillMessage.type === 'error' ? 'alert' : 'status'} className={`text-sm font-bold ${prefillMessage.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>
                {prefillMessage.text}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPrefillModalOpen(false)} className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/5">
                Isi Manual / Selesai
              </button>
            </div>
          </section>
        </div>
      )}

      {slotFullModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-amber-300/30 bg-slate-900 p-6 shadow-[0_30px_90px_rgba(2,6,23,0.55)]">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">{slotFullModal.title}</div>
            <h3 className="mt-3 text-2xl font-black text-white">Pendaftaran belum bisa dilanjutkan</h3>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-300">{slotFullModal.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSlotFullModal(null)}
                className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-amber-300"
              >
                Oke, Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateRegistrationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-rose-300/30 bg-slate-900 p-6 shadow-[0_30px_90px_rgba(2,6,23,0.55)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-rose-300/45 bg-rose-400/12 text-2xl font-black text-rose-200">
              !
            </div>
            <div className="mt-4 text-center text-xs font-black uppercase tracking-[0.18em] text-rose-200">
              Data Rider Sudah Terdaftar
            </div>
            <h3 className="mt-3 text-center text-2xl font-black text-white">Pendaftaran belum bisa dilanjutkan</h3>
            <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-400/[0.08] p-4">
              <p className="text-sm font-semibold leading-6 text-rose-50">{duplicateRegistrationModal.message}</p>
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">
              Jika ada perubahan atau kesalahan data, hubungi {publicContactName}
              {publicContactPhone ? ` di ${publicContactPhone}` : ''}, atau DM IG {supportInstagram}.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              {publicContactWhatsapp && (
                <a
                  href={publicContactWhatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-emerald-300"
                >
                  Hubungi Panitia
                </a>
              )}
              <button
                type="button"
                onClick={() => setDuplicateRegistrationModal(null)}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-slate-800 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-slate-700"
              >
                Oke, Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="registration-editorial-submit fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-[1120px] -translate-x-1/2 flex-col gap-3 rounded-[1.35rem] border border-[#5a4032] bg-[#1d0d07]/96 px-4 py-3 text-[#fff8e8] shadow-[0_22px_70px_rgba(55,23,9,0.36)] backdrop-blur md:flex-row md:items-center md:justify-between">
        {activeStep === 1 ? (
          <>
            <div className="grid gap-1">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#f3c63d]">
                Langkah 1 dari 4
              </div>
              <div className="text-lg font-black text-[#fff8e8]">Kontak Wali</div>
              <div className="text-xs font-bold text-[#c9b7a5]">
                Lengkapi data kontak sebelum mengisi data rider.
              </div>
            </div>
            <button
              type="button"
              disabled={!registrationOpen || prefillLoading}
              onClick={continueFromContact}
              className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-[#f3c63d] px-7 py-3 text-sm font-black uppercase text-[#1d0d07] shadow-[0_16px_35px_rgba(243,198,61,0.24)] transition-transform hover:-translate-y-0.5 hover:bg-[#ffda5a] disabled:cursor-not-allowed disabled:bg-[#705547] disabled:text-[#c9b7a5] md:min-w-[260px]"
            >
              {!registrationOpen ? 'Registrasi Ditutup' : prefillLoading ? 'Mencari data rider...' : 'Lanjut ke Data Rider'}
            </button>
          </>
        ) : activeStep === 2 ? (
          <>
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#705547] px-6 py-3 text-sm font-black uppercase text-[#fff8e8] hover:border-[#f3c63d] hover:text-[#f3c63d]"
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={continueFromRider}
              className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-[#f3c63d] px-7 py-3 text-sm font-black uppercase text-[#1d0d07] hover:bg-[#ffda5a] md:min-w-[260px]"
            >
              Lanjut ke Pembayaran
            </button>
          </>
        ) : activeStep === 3 ? (
          <>
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#705547] px-6 py-3 text-sm font-black uppercase text-[#fff8e8] hover:border-[#f3c63d] hover:text-[#f3c63d]"
            >
              Kembali
            </button>
            <div className="grid gap-1 md:ml-auto">
              <div className="text-[11px] font-black uppercase text-[#c9b7a5]">Total Pembayaran</div>
              <div className="text-xl font-black text-[#f3c63d]">{formatRupiah(totalAmount)}</div>
            </div>
            <button
              type="button"
              onClick={continueFromPayment}
              className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-[#f3c63d] px-7 py-3 text-sm font-black uppercase text-[#1d0d07] hover:bg-[#ffda5a] md:min-w-[260px]"
            >
              Review Pendaftaran
            </button>
          </>
        ) : (
        <>
          <button
            type="button"
            onClick={() => goToStep(3)}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#705547] px-6 py-3 text-sm font-black uppercase text-[#fff8e8] hover:border-[#f3c63d] hover:text-[#f3c63d]"
          >
            Kembali
          </button>
          <div className="grid gap-1">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Total Pembayaran</div>
          <div className="text-xl font-black text-amber-300 md:text-2xl">{formatRupiah(totalAmount)}</div>
          <div className="text-xs font-bold text-slate-400">
            {showTotal
              ? `${riderCount} rider siap diajukan`
              : `Lengkapi kontak & data rider. Saat ini: ${riderCount} rider, ${extraCategoryCount} up category`}
          </div>
        </div>
        <button
          type="button"
          disabled={submitting || !registrationOpen}
          onClick={() => setSubmitConfirmationOpen(true)}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-[#f3c63d] px-7 py-3 text-sm font-black uppercase text-[#1d0d07] shadow-[0_16px_35px_rgba(243,198,61,0.24)] transition-transform hover:-translate-y-0.5 hover:bg-[#ffda5a] disabled:cursor-not-allowed disabled:bg-[#705547] disabled:text-[#c9b7a5] md:min-w-[260px]"
        >
          {!registrationOpen ? 'Registrasi Ditutup' : submitting ? 'Menyimpan...' : 'Kirim Pendaftaran'}
        </button>
        </>
        )}
      </div>
    </div>
  )
}
