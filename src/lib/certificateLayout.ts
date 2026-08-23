export type CertificateTextElement = 'name' | 'eventName' | 'category' | 'plate' | 'achievement' | 'eventDate' | 'location' | 'certificateCode'
export type CertificateImageElement = 'qr' | 'eventLogo' | 'organizerLogo' | 'raceDirectorSignature' | 'organizerSignature'

export type CertificateTextPosition = {
  x: number
  top: number
  width: number
  fontSize: number
}

export type CertificateImagePosition = {
  x: number
  top: number
  width: number
}

export type CertificateLayout = {
  text: Record<CertificateTextElement, CertificateTextPosition>
  image: Record<CertificateImageElement, CertificateImagePosition>
}

export const CERTIFICATE_TEXT_ELEMENT_LABELS: Record<CertificateTextElement, string> = {
  name: 'Nama rider',
  eventName: 'Nama event',
  category: 'Kategori',
  plate: 'Nomor rider',
  achievement: 'Prestasi',
  eventDate: 'Tanggal',
  location: 'Lokasi',
  certificateCode: 'Certificate ID',
}

export const CERTIFICATE_IMAGE_ELEMENT_LABELS: Record<CertificateImageElement, string> = {
  qr: 'QR verifikasi',
  eventLogo: 'Logo event',
  organizerLogo: 'Logo penyelenggara',
  raceDirectorSignature: 'Tanda tangan Race Director',
  organizerSignature: 'Tanda tangan penyelenggara',
}

export const DEFAULT_CERTIFICATE_LAYOUT: CertificateLayout = {
  text: {
    name: { x: 50, top: 44.5, width: 66, fontSize: 44 },
    eventName: { x: 50, top: 60.5, width: 50, fontSize: 28 },
    category: { x: 20.5, top: 77, width: 12, fontSize: 13 },
    plate: { x: 34.5, top: 77, width: 12, fontSize: 13 },
    achievement: { x: 49, top: 77, width: 12, fontSize: 13 },
    eventDate: { x: 63, top: 77, width: 12, fontSize: 11 },
    location: { x: 76.5, top: 77, width: 12, fontSize: 11 },
    certificateCode: { x: 50, top: 88.2, width: 24, fontSize: 14 },
  },
  image: {
    qr: { x: 89, top: 83, width: 10.5 },
    eventLogo: { x: 11, top: 8, width: 10 },
    organizerLogo: { x: 89, top: 8, width: 10 },
    raceDirectorSignature: { x: 20.5, top: 82.2, width: 12 },
    organizerSignature: { x: 73.5, top: 82.2, width: 12 },
  },
}

const bounded = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

export const normalizeCertificateLayout = (value: unknown): CertificateLayout => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<CertificateLayout>) : {}
  const textInput = input.text && typeof input.text === 'object' ? (input.text as Partial<CertificateLayout['text']>) : {}
  const imageInput = input.image && typeof input.image === 'object' ? (input.image as Partial<CertificateLayout['image']>) : {}

  const text = Object.fromEntries(
    (Object.keys(DEFAULT_CERTIFICATE_LAYOUT.text) as CertificateTextElement[]).map((key) => {
      const fallback = DEFAULT_CERTIFICATE_LAYOUT.text[key]
      const candidate = (textInput[key] ?? {}) as Partial<CertificateTextPosition>
      return [
        key,
        {
          x: bounded(candidate.x, fallback.x, 0, 100),
          top: bounded(candidate.top, fallback.top, 0, 100),
          width: bounded(candidate.width, fallback.width, 4, 100),
          fontSize: bounded(candidate.fontSize, fallback.fontSize, 6, 96),
        },
      ]
    })
  ) as CertificateLayout['text']

  const image = Object.fromEntries(
    (Object.keys(DEFAULT_CERTIFICATE_LAYOUT.image) as CertificateImageElement[]).map((key) => {
      const fallback = DEFAULT_CERTIFICATE_LAYOUT.image[key]
      const candidate = (imageInput[key] ?? {}) as Partial<CertificateImagePosition>
      return [
        key,
        {
          x: bounded(candidate.x, fallback.x, 0, 100),
          top: bounded(candidate.top, fallback.top, 0, 100),
          width: bounded(candidate.width, fallback.width, 2, 50),
        },
      ]
    })
  ) as CertificateLayout['image']

  return { text, image }
}
