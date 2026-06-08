'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import PublicTopbar from '../../../../components/PublicTopbar'
import {
  getExactPrimaryCategoryCandidates,
  getFallbackPrimaryCategoryCandidates,
} from '../../../../lib/categoryAssignment'
import type { BusinessSettings } from '../../../../lib/eventService'

type CategoryItem = {
  id: string
  year: number
  year_min?: number
  year_max?: number
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
  requestedPlateNumber: string
  requestedPlateSuffix: string
  usePlateSuffix: boolean
  photo?: File | null
  docType: 'KK' | 'AKTE' | 'KIA'
  docKk?: File | null
}

type PlateCheckState = {
  state: 'idle' | 'checking' | 'available' | 'needs_suffix' | 'suffix_taken' | 'error'
  message: string
  suggestedSuffix: string | null
}

type RegistrationSuccess = {
  riderNames: string[]
  totalAmount: number
  hasContactEmail: boolean
}

const DEFAULT_BASE_PRICE = 250000
const DEFAULT_EXTRA_PRICE = 150000
const RIDER_PHOTO_MAX_BYTES = Math.round(1.5 * 1024 * 1024)
const SUPPORTING_IMAGE_MAX_BYTES = 2 * 1024 * 1024
const SUPPORTING_PDF_MAX_BYTES = 3 * 1024 * 1024
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

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

const normalizePhoneDigits = (value: string) => value.replace(/[^\d]/g, '').slice(0, 15)

const isValidWhatsappNumber = (value: string) => {
  const digits = normalizePhoneDigits(value)
  if (digits.length < 10 || digits.length > 15) return false
  return digits.startsWith('08') || digits.startsWith('62')
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
  requestedPlateNumber: '',
  requestedPlateSuffix: '',
  usePlateSuffix: false,
  photo: null,
  docType: 'KK',
  docKk: null,
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
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [eventName, setEventName] = useState<string | null>(null)
  const [eventLogoUrl, setEventLogoUrl] = useState<string | null>(null)
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null)
  const [businessSettingsLoaded, setBusinessSettingsLoaded] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [communityName, setCommunityName] = useState('')
  const [riders, setRiders] = useState<RiderForm[]>([initialRider()])
  const [basePrice, setBasePrice] = useState(DEFAULT_BASE_PRICE)
  const [extraPrice, setExtraPrice] = useState(DEFAULT_EXTRA_PRICE)
  const [requireJerseySize, setRequireJerseySize] = useState(false)
  const [jerseySizeChartFailed, setJerseySizeChartFailed] = useState(false)
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [paymentProof, setPaymentProof] = useState<File | null>(null)
  const [dragActiveKey, setDragActiveKey] = useState<string | null>(null)
  const [plateChecks, setPlateChecks] = useState<PlateCheckState[]>([initialPlateCheck()])
  const [birthDateTouched, setBirthDateTouched] = useState<boolean[]>([false])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null)
  const [slotFullModal, setSlotFullModal] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      setBusinessSettingsLoaded(false)
      try {
        const res = await fetch(`/api/events/${eventId}`)
        const json = await res.json()
        setEventName(json?.data?.name ?? null)
        setEventLogoUrl(typeof json?.data?.event_logo_url === 'string' ? json.data.event_logo_url : null)
        setBusinessSettings((json?.data?.business_settings ?? null) as BusinessSettings | null)
        setRegistrationOpen(json?.data?.registration_open !== false)
      } catch {
        setEventName(null)
        setEventLogoUrl(null)
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

  const addRider = () => {
    setRiders((prev) => [...prev, initialRider()])
    setPlateChecks((prev) => [...prev, initialPlateCheck()])
    setBirthDateTouched((prev) => [...prev, false])
  }

  const removeRider = (index: number) => {
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

  const isCategoryFull = (category: CategoryItem) => {
    if (category.is_full === true) return true
    if (typeof category.capacity !== 'number') return false
    if (typeof category.remaining !== 'number') return false
    return category.remaining <= 0
  }

  const getExactPrimaryCategories = useCallback((birthYear: number | null, gender: 'BOY' | 'GIRL') => {
    if (!birthYear) return []
    return getExactPrimaryCategoryCandidates(categories, birthYear, gender)
  }, [categories])

  const getAvailableExactPrimaryCategory = useCallback((birthYear: number | null, gender: 'BOY' | 'GIRL') => {
    return getExactPrimaryCategories(birthYear, gender).find((category) => !isCategoryFull(category)) ?? null
  }, [getExactPrimaryCategories])

  const getFallbackPrimaryCategories = useCallback((birthYear: number | null, gender: 'BOY' | 'GIRL') => {
    if (!birthYear) return []
    return getFallbackPrimaryCategoryCandidates(categories, birthYear, gender)
  }, [categories])

  const getAvailableBirthYearRange = useCallback((gender: 'BOY' | 'GIRL') => {
    const compatibleCategories = categories.filter((category) => category.gender === gender || category.gender === 'MIX')
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
    primaryCategoryId: string
  ) => getFallbackPrimaryCategories(birthYear, gender).find((category) => category.id === primaryCategoryId) ?? null, [
    getFallbackPrimaryCategories,
  ])

  const computePrimaryCategory = useCallback((
    birthYear: number | null,
    gender: 'BOY' | 'GIRL',
    primaryCategoryId: string
  ) => {
    const exactCandidates = getExactPrimaryCategories(birthYear, gender)
    if (birthYear && exactCandidates.length === 0) return null
    const exact = getAvailableExactPrimaryCategory(birthYear, gender)
    if (exact) return exact
    const fallback = getSelectedFallbackPrimaryCategory(birthYear, gender, primaryCategoryId)
    if (!fallback || isCategoryFull(fallback)) return null
    return fallback
  }, [getAvailableExactPrimaryCategory, getExactPrimaryCategories, getSelectedFallbackPrimaryCategory])

  const getPrimaryCategoryIssue = useCallback((
    birthYear: number | null,
    gender: 'BOY' | 'GIRL',
    primaryCategoryId: string
  ) => {
    if (!birthYear) return null
    const exactCandidates = getExactPrimaryCategories(birthYear, gender)
    if (exactCandidates.length === 0) return 'invalid'
    const exactAvailable = exactCandidates.find((category) => !isCategoryFull(category))
    if (exactAvailable) return null
    const fallbackOptions = getFallbackPrimaryCategories(birthYear, gender).filter((category) => !isCategoryFull(category))
    if (fallbackOptions.length === 0) return 'full'
    const selectedFallback = fallbackOptions.find((category) => category.id === primaryCategoryId)
    return selectedFallback ? null : 'fallback_required'
  }, [getExactPrimaryCategories, getFallbackPrimaryCategories])

  const extraCategoryOptions = (
    birthYear: number | null,
    gender: 'BOY' | 'GIRL',
    primaryCategory: CategoryItem | null
  ) => {
    const options: CategoryItem[] = []
    if (!birthYear || !primaryCategory) return options
    return categories.filter((c) => {
      if (c.id === primaryCategory.id) return false
      const max = c.year_max ?? c.year
      if (max >= birthYear) return false
      if (c.gender === 'MIX') return true
      return c.gender === gender
    })
  }

  const totalAmount = useMemo(() => {
    return riders.reduce((sum, rider) => sum + basePrice + (rider.extraCategoryId ? extraPrice : 0), 0)
  }, [riders, basePrice, extraPrice])
  const riderCount = riders.length
  const extraCategoryCount = riders.filter((rider) => Boolean(rider.extraCategoryId)).length
  const baseAmount = riderCount * basePrice
  const extraAmount = extraCategoryCount * extraPrice

  const hasContact = contactName.trim() && contactPhone.trim()
  const riderPhotoUploadEnabled =
    typeof businessSettings?.registration_rider_photo_enabled === 'boolean'
      ? businessSettings.registration_rider_photo_enabled
      : true
  const ridersComplete = riders.every(
    (r) =>
      r.name &&
      r.nickname &&
      (!requireJerseySize || r.jerseySize) &&
      r.dateOfBirth &&
      r.requestedPlateNumber &&
      (!riderPhotoUploadEnabled || r.photo) &&
      r.docKk
  )
  const showTotal = Boolean(hasContact && ridersComplete)
  const hasMissingPrimaryCategory = riders.some((rider) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId)
    return issue === 'invalid'
  })
  const hasPrimaryCategoryAndFallbackFull = riders.some((rider) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId)
    return issue === 'full'
  })
  const hasPrimaryCategoryNeedsFallbackChoice = riders.some((rider) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId)
    return issue === 'fallback_required'
  })
  const hasPrimaryCategorySlotFull = riders.some((rider) => {
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId)
    return issue === 'full' || issue === 'fallback_required'
  })
  const hasFullExtraCategory = riders.some((rider) => {
    if (!rider.extraCategoryId) return false
    const category = categories.find((c) => c.id === rider.extraCategoryId)
    if (!category) return true
    return isCategoryFull(category)
  })
  const publicEventTitle = businessSettings?.public_event_title?.trim() || eventName || 'Pendaftaran Event'
  const publicBrandName = businessSettings?.public_brand_name?.trim() || ''
  const publicTagline = businessSettings?.public_tagline?.trim() || ''
  const paymentBankName = businessSettings?.payment_bank_name?.trim() || ''
  const paymentAccountName = businessSettings?.payment_account_name?.trim() || ''
  const paymentAccountNumber = businessSettings?.payment_account_number?.trim() || ''
  const paymentQrisImageUrl = businessSettings?.registration_qris_image_url?.trim() || ''
  const jerseySizeChartImageUrl = businessSettings?.registration_jersey_size_chart_url?.trim() || ''
  const jerseySizeOptions =
    Array.isArray(businessSettings?.jersey_size_options) && businessSettings.jersey_size_options.length > 0
      ? businessSettings.jersey_size_options.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : DEFAULT_JERSEY_SIZE_OPTIONS
  const contactEmailValue = contactEmail.trim()
  const contactEmailInvalid = contactEmailValue.length > 0 && !isValidEmail(contactEmailValue)
  const contactPhoneValue = contactPhone.trim()
  const contactPhoneInvalid = contactPhoneValue.length > 0 && !isValidWhatsappNumber(contactPhoneValue)
  const showPaymentDestination = Boolean(paymentBankName || paymentAccountName || paymentAccountNumber || paymentQrisImageUrl)
  const showEventOwner = Boolean(
    businessSettings?.show_event_owner_publicly && businessSettings?.event_owner_name?.trim()
  )
  const showOperatingCommittee = Boolean(
    businessSettings?.show_operating_committee_publicly &&
      (businessSettings?.operating_committee_label?.trim() || businessSettings?.operating_committee_name?.trim())
  )
  const showScoringSupport = Boolean(
    businessSettings?.show_scoring_support_publicly &&
      (businessSettings?.scoring_support_label?.trim() || businessSettings?.scoring_support_name?.trim())
  )
  const showMc = Boolean(businessSettings?.show_mc_publicly && businessSettings?.mc_name?.trim())
  const eventOwnerName = businessSettings?.event_owner_name?.trim() || ''
  const operatingCommitteeLabel =
    businessSettings?.operating_committee_label?.trim() ||
    businessSettings?.operating_committee_name?.trim() ||
    ''
  const scoringSupportLabel =
    businessSettings?.scoring_support_label?.trim() || businessSettings?.scoring_support_name?.trim() || ''
  const mcName = businessSettings?.mc_name?.trim() || ''
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
      return `Rider #${riderIndex + 1}: tahun lahir dan gender rider tidak masuk kategori aktif event ini. Cek ulang tanggal lahir/gender, atau hubungi panitia jika kategori belum dibuat.`
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
      const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId)
      return issue === 'invalid' || issue === 'full' || issue === 'fallback_required'
    })

    if (issueEntry < 0) {
      lastAutoCategoryModalKeyRef.current = ''
      return
    }

    const rider = riders[issueEntry]
    const birthYear = getCompleteBirthYear(rider.dateOfBirth)
    const issue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId)
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
    const normalizedContactPhone = normalizePhoneDigits(contactPhone)
    if (!registrationOpen) {
      alert('Pendaftaran untuk event ini sedang ditutup oleh panitia.')
      return
    }
    if (!contactName || !contactPhone) {
      alert('Nama dan nomor kontak wajib diisi')
      return
    }
    if (!isValidWhatsappNumber(contactPhone)) {
      alert('Nomor WhatsApp belum valid. Gunakan format 08... atau 62..., minimal 10 digit.')
      return
    }
    if (contactEmailInvalid) {
      alert('Format email tidak valid. Contoh: nama@email.com')
      return
    }
    if (!bankName.trim()) {
      alert('Bank pengirim wajib diisi')
      return
    }
    if (!accountName.trim()) {
      alert('Nama pengirim wajib diisi')
      return
    }
    if (!accountNumber.trim()) {
      alert('Nomor rekening pengirim wajib diisi')
      return
    }
    if (!paymentProof) {
      alert('Bukti pembayaran wajib diupload')
      return
    }
    const hasInvalid = riders.some(
      (r) =>
        !r.name ||
        !r.nickname ||
        (requireJerseySize && !r.jerseySize) ||
        !r.dateOfBirth ||
        !r.requestedPlateNumber ||
        (riderPhotoUploadEnabled && !r.photo) ||
        !r.docKk
    )
    if (hasInvalid) {
      alert(
        riderPhotoUploadEnabled
          ? 'Lengkapi data rider. Wajib: nama lengkap, panggilan, nomor plate, foto rider, KK/Akte/KIA, dan ukuran jersey (jika diwajibkan).'
          : 'Lengkapi data rider. Wajib: nama lengkap, panggilan, nomor plate, KK/Akte/KIA, dan ukuran jersey (jika diwajibkan).'
      )
      return
    }
    const invalidPlateIndex = riders.findIndex((rider) => !/^\d{1,3}$/.test(rider.requestedPlateNumber.trim()))
    if (invalidPlateIndex >= 0) {
      alert(`Nomor plate rider #${invalidPlateIndex + 1} wajib angka dan maksimal 3 digit.`)
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
      alert(
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
        return getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId) === 'invalid'
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

    setSubmitting(true)
    let createdRegistrationId: string | null = null
    let createdUploadToken: string | null = null
    try {
      const uploadStep = async (path: string, body: FormData, fallbackMessage: string, uploadToken: string) => {
        let res: Response
        try {
          res = await fetch(path, {
            method: 'POST',
            headers: { 'x-upload-token': uploadToken },
            body,
          })
        } catch {
          throw new Error(buildNetworkStepError(fallbackMessage))
        }
        const json = await parseJsonResponse(res)
        if (!res.ok) throw new Error(json?.error || json?._raw || fallbackMessage)
        return json
      }

      riders.forEach((rider, idx) => {
        if (riderPhotoUploadEnabled) {
          const photoError = validateUploadFile(rider.photo, `Foto rider #${idx + 1}`, 'rider-photo')
          if (photoError) throw new Error(photoError)
        }

        const documentError = validateUploadFile(rider.docKk, `Dokumen KK/Akte/KIA rider #${idx + 1}`, 'document')
        if (documentError) throw new Error(documentError)
      })
      const paymentError = validateUploadFile(paymentProof, 'Bukti pembayaran', 'payment')
      if (paymentError) throw new Error(paymentError)

      const shouldSendEmail = contactEmail.trim().length > 0
      const items = riders.map((r) => {
        const birthYear = getCompleteBirthYear(r.dateOfBirth)
        const exactPrimaryCategory = getAvailableExactPrimaryCategory(birthYear, r.gender)
        return {
          rider_name: r.name,
          rider_nickname: r.nickname || null,
          jersey_size: r.jerseySize || null,
          date_of_birth: r.dateOfBirth,
          gender: r.gender,
          club: r.club || null,
          primary_category_id: exactPrimaryCategory ? null : r.primaryCategoryId || null,
          extra_category_id: r.extraCategoryId || null,
          requested_plate_number: r.requestedPlateNumber.trim() || null,
          requested_plate_suffix: r.requestedPlateSuffix.trim().toUpperCase().slice(0, 1) || null,
        }
      })

      let createRes: Response
      try {
        createRes = await fetch(`/api/public/events/${eventId}/registrations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            community_name: communityName || null,
            contact_name: contactName,
            contact_phone: normalizedContactPhone,
            contact_email: contactEmail || null,
            items,
          }),
        })
      } catch {
        throw new Error(buildNetworkStepError('Menyimpan data pendaftaran awal'))
      }
      const createJson = await parseJsonResponse(createRes)
      if (!createRes.ok) throw new Error(createJson?.error || createJson?._raw || 'Gagal membuat pendaftaran')

      createdRegistrationId = createJson?.data?.registration?.id ?? null
      createdUploadToken = createJson?.data?.upload_token ?? null
      const createdItems = Array.isArray(createJson?.data?.items) ? createJson.data.items : []

      if (!createdRegistrationId) {
        throw new Error('Registrasi berhasil dibuat, tetapi ID registrasi tidak ditemukan.')
      }
      if (!createdUploadToken) {
        throw new Error(
          'Mode upload bertahap belum aktif di database. Jalankan migration 2026-03-14_registration_upload_token.sql lalu deploy ulang.'
        )
      }
      if (createdItems.length !== riders.length) {
        throw new Error('Jumlah item registrasi tidak sesuai dengan jumlah rider yang dikirim.')
      }

      for (const [idx, rider] of riders.entries()) {
        const itemId = createdItems[idx]?.id
        if (!itemId) {
          throw new Error(`Item registrasi untuk rider #${idx + 1} tidak ditemukan.`)
        }

        if (riderPhotoUploadEnabled) {
          const photoBody = new FormData()
          photoBody.append('registration_item_id', itemId)
          photoBody.append('file', rider.photo as File)
          await uploadStep(
            `/api/public/events/${eventId}/registrations/${createdRegistrationId}/photo`,
            photoBody,
            `Upload foto rider #${idx + 1}`,
            createdUploadToken
          )
        }

        const documentBody = new FormData()
        documentBody.append('registration_item_id', itemId)
        documentBody.append('document_type', rider.docType)
        documentBody.append('file', rider.docKk as File)
        await uploadStep(
          `/api/public/events/${eventId}/registrations/${createdRegistrationId}/documents`,
          documentBody,
          `Upload dokumen rider #${idx + 1}`,
          createdUploadToken
        )
      }

      const paymentBody = new FormData()
      paymentBody.append('file', paymentProof as File)
      paymentBody.append('bank_name', bankName)
      paymentBody.append('account_name', accountName)
      paymentBody.append('account_number', accountNumber)
      await uploadStep(
        `/api/public/events/${eventId}/registrations/${createdRegistrationId}/payment`,
        paymentBody,
        'Upload bukti pembayaran',
        createdUploadToken
      )

      setSuccess({
        riderNames: riders.map((rider) => rider.name.trim()).filter(Boolean),
        totalAmount,
        hasContactEmail: shouldSendEmail,
      })
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      setRiders([initialRider()])
      setPlateChecks([initialPlateCheck()])
      setBirthDateTouched([false])
      setContactName('')
      setContactPhone('')
      setContactEmail('')
      setCommunityName('')
      setBankName('')
      setAccountName('')
      setAccountNumber('')
      setPaymentProof(null)
    } catch (err: unknown) {
      if (createdRegistrationId && createdUploadToken) {
        try {
          await fetch(`/api/public/events/${eventId}/registrations/${createdRegistrationId}`, {
            method: 'DELETE',
            headers: { 'x-upload-token': createdUploadToken },
          })
        } catch {}
      }
      const message = err instanceof Error ? err.message : 'Gagal menyimpan pendaftaran'
      if (
        message.includes('Kuota kategori') ||
        message.toLowerCase().includes('slot penuh') ||
        (message.toLowerCase().includes('kuota') && message.toLowerCase().includes('penuh'))
      ) {
        openSlotFullModal(message)
      } else {
        alert(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const panelClass =
    'rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 shadow-[0_24px_70px_rgba(2,6,23,0.32)] ring-1 ring-white/5 backdrop-blur sm:p-5'
  const fieldClass =
    'w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3.5 text-sm font-semibold text-slate-50 shadow-inner shadow-black/20 placeholder:text-slate-500 transition-colors focus:border-amber-300 focus:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-300/25'
  const filePickerClass =
    'flex min-h-[76px] cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dashed border-white/15 bg-slate-950/70 px-4 py-3 transition-colors hover:border-amber-300/70 hover:bg-slate-900/80'
  const labelClass = 'text-xs font-black uppercase tracking-[0.14em] text-slate-300'
  const requiredLabel = (label: string) => (
    <span>
      {label} <span className="text-rose-400">*</span>
    </span>
  )
  const helperClass = 'text-[11px] font-semibold leading-5 text-slate-400'
  const sectionHeaderClass = 'text-xs font-black uppercase tracking-[0.18em] text-amber-300'

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
      alert(error)
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
        alert(getUploadTypeError(label, uploadType))
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
        alert(getUploadTypeError(label, uploadType))
      }
      return
    }
    e.preventDefault()
    setValidatedUploadFile(file, label, uploadType, onFile)
  }

  const dropZoneClass = (key: string) =>
    `${filePickerClass} ${dragActiveKey === key ? 'border-amber-400 bg-amber-400/10' : ''}`

  return (
    <div className="public-page min-h-screen bg-[linear-gradient(180deg,#111827_0%,#1f2937_42%,#111827_100%)] text-slate-100">
      <PublicTopbar />
      <main className="mx-auto grid w-full max-w-[1120px] gap-4 px-4 pb-36 pt-5 sm:px-6 md:gap-5 md:pt-7">
        {!registrationOpen && (
          <section className="rounded-2xl border border-rose-300/45 bg-rose-500/15 p-4 shadow-[0_16px_36px_rgba(244,63,94,0.14)]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-rose-200">Registrasi Ditutup</div>
            <div className="mt-2 text-sm font-semibold text-rose-50">
              Pendaftaran untuk event ini sedang ditutup oleh panitia. Pengiriman data baru sementara dinonaktifkan.
            </div>
          </section>
        )}
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(17,24,39,0.96)_0%,rgba(31,41,55,0.92)_58%,rgba(55,65,81,0.88)_100%)] px-5 py-6 shadow-[0_28px_90px_rgba(2,6,23,0.42)] ring-1 ring-white/5 sm:px-7 md:py-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
          <div className="relative z-10 grid gap-5 md:grid-cols-[minmax(0,1fr)_240px] md:items-center">
            <div className="grid gap-3">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Event Registration</p>
              {publicBrandName && (
                <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-amber-100/90">{publicBrandName}</p>
              )}
              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white md:text-5xl">{publicEventTitle}</h1>
              <p className="max-w-3xl text-base font-semibold leading-7 text-slate-200 md:text-lg">
                {publicTagline || eventName || 'Form registrasi event'}
              </p>
              {(showEventOwner || showOperatingCommittee || showScoringSupport || showMc) && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-100">
                  {showEventOwner && (
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Event Owner: {eventOwnerName}</span>
                  )}
                  {showOperatingCommittee && (
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                      Operating Committee: {operatingCommitteeLabel}
                    </span>
                  )}
                  {showScoringSupport && (
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                      Scoring Support: {scoringSupportLabel}
                    </span>
                  )}
                  {showMc && (
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">MC: {mcName}</span>
                  )}
                </div>
              )}
            </div>
            {eventLogoUrl && (
              <div className="mx-auto w-full max-w-[210px] rounded-[1.5rem] border border-white/15 bg-white/5 p-3 shadow-[0_22px_55px_rgba(2,6,23,0.18)] ring-1 ring-white/5 backdrop-blur md:max-w-none">
                <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-[1rem] bg-transparent">
                  <img
                    src={eventLogoUrl}
                    alt={`${publicEventTitle} logo`}
                    className="block h-full w-full object-contain"
                  />
                </div>
                <div className="mt-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                  Official Event
                </div>
              </div>
            )}
          </div>
        </section>

        <section className={panelClass}>
          <div className="mb-4 grid gap-1">
            <div className={sectionHeaderClass}>Kontak Wali / Penanggung Jawab</div>
            <p className={helperClass}>Data ini dipakai panitia untuk konfirmasi pendaftaran dan pembayaran.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
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
                onChange={(e) => setContactPhone(normalizePhoneDigits(e.target.value))}
                placeholder="Contoh: 0812..."
                type="tel"
                inputMode="tel"
                maxLength={15}
                className={`${fieldClass} ${contactPhoneInvalid ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/30' : ''}`}
              />
              <div className={`text-[11px] font-semibold ${contactPhoneInvalid ? 'text-rose-300' : 'text-slate-400'}`}>
                {contactPhoneInvalid
                  ? 'Nomor WhatsApp belum valid. Gunakan 08... atau 62..., minimal 10 digit.'
                  : 'Nomor ini dipakai panitia untuk konfirmasi cepat lewat WhatsApp.'}
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className={labelClass}>Email Konfirmasi</label>
              <input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
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

        {riders.map((rider, idx) => {
          const birthYear = getCompleteBirthYear(rider.dateOfBirth)
          const primaryIssue = getPrimaryCategoryIssue(birthYear, rider.gender, rider.primaryCategoryId)
          const primaryCategory = computePrimaryCategory(birthYear, rider.gender, rider.primaryCategoryId)
          const fallbackPrimaryOptions = getFallbackPrimaryCategories(birthYear, rider.gender)
          const availableFallbackPrimaryOptions = fallbackPrimaryOptions.filter((category) => !isCategoryFull(category))
          const showFallbackPrimarySelector = primaryIssue === 'fallback_required' && availableFallbackPrimaryOptions.length > 0
          const extras = extraCategoryOptions(birthYear, rider.gender, primaryCategory)
          const hasMatchedFullCategory = primaryIssue === 'full' || primaryIssue === 'fallback_required'
          const extrasAvailable = extras.some((cat) => !isCategoryFull(cat))
          const selectedExtraCategory = extras.find((cat) => cat.id === rider.extraCategoryId) ?? null
          const selectedFallbackPrimaryCategory =
            fallbackPrimaryOptions.find((category) => category.id === rider.primaryCategoryId) ?? null
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
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="grid gap-1">
                  <div className={sectionHeaderClass}>Data Rider #{idx + 1}</div>
                  <p className={helperClass}>Isi identitas rider sesuai dokumen.</p>
                </div>
                {riders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRider(idx)}
                    className="rounded-full border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-rose-100 transition-colors hover:bg-rose-500/20"
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
                {requireJerseySize && (
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
                          <img
                            src={jerseySizeChartImageUrl}
                            alt="Jersey size chart"
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
                  <label className={labelClass}>Club / Komunitas Rider</label>
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
                      onChange={(e) => updateRider(idx, { requestedPlateNumber: e.target.value })}
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
                          onChange={(e) => updateRider(idx, { requestedPlateSuffix: e.target.value })}
                          placeholder="Huruf Tambahan"
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
                          <button
                            type="button"
                            onClick={() => updateRider(idx, { usePlateSuffix: false, requestedPlateSuffix: '' })}
                            className="rounded-xl border border-slate-500 bg-slate-900/70 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-slate-100 transition-colors hover:border-slate-300"
                          >
                            Tanpa Huruf
                          </button>
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

                <div className={`grid gap-3 ${riderPhotoUploadEnabled ? 'md:grid-cols-2' : ''}`}>
                  {riderPhotoUploadEnabled && (
                    <div className="grid gap-2">
                    <label className={labelClass}>{requiredLabel('Upload Foto Rider')}</label>
                      <label
                        className={dropZoneClass(`photo-${idx}`)}
                        tabIndex={0}
                        onDragEnter={(e) => onDropZoneOver(`photo-${idx}`, e)}
                        onDragOver={(e) => onDropZoneOver(`photo-${idx}`, e)}
                        onDragLeave={(e) => onDropZoneLeave(`photo-${idx}`, e)}
                        onDrop={(e) =>
                          onDropZoneDrop(`photo-${idx}`, e, (file) => updateRider(idx, { photo: file }), `Foto rider #${idx + 1}`, 'rider-photo', false)
                        }
                        onPaste={(e) =>
                          onDropZonePaste(e, (file) => updateRider(idx, { photo: file }), `Foto rider #${idx + 1}`, 'rider-photo', false)
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
                              updateRider(idx, { photo: nextFile })
                            )
                            e.currentTarget.value = ''
                          }}
                          className="hidden"
                        />
                      </label>
                      <div className="text-[11px] font-semibold text-slate-400">
                        {getUploadHint('rider-photo')} Bisa drag & drop atau paste (Ctrl+V).
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2">
                    <label className={labelClass}>{requiredLabel('Upload KK / Akte / KIA')}</label>
                    <select
                      value={rider.docType}
                      onChange={(e) => updateRider(idx, { docType: e.target.value as RiderForm['docType'] })}
                      className={fieldClass}
                    >
                      <option value="KK">KK</option>
                      <option value="AKTE">Akte Kelahiran</option>
                      <option value="KIA">KIA - Kartu Identitas Anak</option>
                    </select>
                    <label
                      className={dropZoneClass(`doc-${idx}`)}
                      tabIndex={0}
                      onDragEnter={(e) => onDropZoneOver(`doc-${idx}`, e)}
                      onDragOver={(e) => onDropZoneOver(`doc-${idx}`, e)}
                      onDragLeave={(e) => onDropZoneLeave(`doc-${idx}`, e)}
                      onDrop={(e) =>
                        onDropZoneDrop(`doc-${idx}`, e, (file) => updateRider(idx, { docKk: file }), `Dokumen KK/Akte/KIA rider #${idx + 1}`, 'document', true)
                      }
                      onPaste={(e) =>
                        onDropZonePaste(e, (file) => updateRider(idx, { docKk: file }), `Dokumen KK/Akte/KIA rider #${idx + 1}`, 'document', true)
                      }
                    >
                        <span className="truncate text-sm font-bold text-slate-100">
                          {rider.docKk ? rider.docKk.name : 'Pilih dokumen KK/Akte/KIA'}
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
                            updateRider(idx, { docKk: nextFile })
                          )
                          e.currentTarget.value = ''
                        }}
                        className="hidden"
                      />
                    </label>
                    <div className="text-[11px] font-semibold text-slate-400">
                      {getUploadHint('document')} Bisa drag & drop atau paste (Ctrl+V).
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )
        })}

        <button
          type="button"
          onClick={addRider}
          className="rounded-2xl border border-emerald-300/35 bg-emerald-400 px-4 py-3.5 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_18px_40px_rgba(16,185,129,0.2)] transition-colors hover:bg-emerald-300"
        >
          + Tambah Rider
        </button>

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
                    <img
                      src={paymentQrisImageUrl}
                      alt="QRIS pembayaran"
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
                <div className="flex items-center justify-between gap-3">
                  <span>{riderCount} rider x {formatRupiah(basePrice)}</span>
                  <span>{formatRupiah(baseAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{extraCategoryCount} up category x {formatRupiah(extraPrice)}</span>
                  <span>{formatRupiah(extraAmount)}</span>
                </div>
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
              onDrop={(e) => onDropZoneDrop('payment-proof', e, setPaymentProof, 'Bukti pembayaran', 'payment', true)}
              onPaste={(e) => onDropZonePaste(e, setPaymentProof, 'Bukti pembayaran', 'payment', true)}
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
                  setValidatedUploadFile(file, 'Bukti pembayaran', 'payment', setPaymentProof)
                  e.currentTarget.value = ''
                }}
                className="hidden"
              />
            </label>
            <div className="text-[11px] font-semibold text-slate-400">
              {getUploadHint('payment')} Bisa drag & drop atau paste (Ctrl+V).
            </div>
          </div>
        </section>

      </main>

      {success && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[1.75rem] border border-emerald-300/40 bg-slate-900 p-6 shadow-[0_30px_90px_rgba(2,6,23,0.55)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-400/15 text-4xl font-black text-emerald-300">
              ✓
            </div>
            <div className="mt-4 text-center text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
              Pendaftaran Berhasil Dikirim
            </div>
            <h3 className="mt-3 text-center text-2xl font-black text-white">Menunggu Verifikasi Panitia</h3>
            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Total Pembayaran</div>
              <div className="mt-1 text-2xl font-black text-amber-300">{formatRupiah(success.totalAmount)}</div>
              <div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Rider Terdaftar</div>
              <div className="mt-2 grid gap-2">
                {success.riderNames.map((name, index) => (
                  <div key={`${name}-${index}`} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-extrabold text-white">
                    {index + 1}. {name}
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-center text-sm font-semibold leading-6 text-slate-300">
              Pendaftaran rider sedang menunggu verifikasi panitia. Email konfirmasi akan dikirim setelah pembayaran dan data rider disetujui panitia.
            </p>
            {!success.hasContactEmail && (
              <p className="mt-2 text-center text-xs font-semibold leading-5 text-amber-200">
                Email tidak diisi, jadi konfirmasi email tidak dikirim untuk pendaftaran ini.
              </p>
            )}
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-extrabold uppercase tracking-wide text-slate-950 transition-colors hover:bg-emerald-300"
              >
                Oke, Mengerti
              </button>
            </div>
          </div>
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

      <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-[1120px] -translate-x-1/2 flex-col gap-3 rounded-[1.35rem] border border-white/10 bg-slate-950/95 px-4 py-3 shadow-[0_22px_70px_rgba(2,6,23,0.58)] ring-1 ring-white/5 backdrop-blur md:flex-row md:items-center md:justify-between">
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
          onClick={handleSubmit}
          className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-amber-400 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_16px_35px_rgba(251,191,36,0.18)] transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 md:min-w-[240px]"
        >
          {!registrationOpen ? 'Registrasi Ditutup' : submitting ? 'Menyimpan...' : 'Kirim Pendaftaran'}
        </button>
      </div>
    </div>
  )
}

