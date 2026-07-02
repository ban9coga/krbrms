export type RegistrationUploadKind = 'rider-photo' | 'document' | 'payment'

export const REGISTRATION_UPLOAD_BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'
export const REGISTRATION_UPLOAD_CACHE_CONTROL_SECONDS = '31536000'
export const RIDER_PHOTO_MAX_BYTES = Math.round(1.5 * 1024 * 1024)
export const SUPPORTING_IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const SUPPORTING_PDF_MAX_BYTES = 3 * 1024 * 1024
export const REGISTRATION_UPLOAD_KINDS = ['rider-photo', 'document', 'payment'] as const

export const isRegistrationUploadKind = (value: string): value is RegistrationUploadKind =>
  (REGISTRATION_UPLOAD_KINDS as readonly string[]).includes(value)

export const getPendingRegistrationUploadPrefix = (eventId: string) => `events/${eventId}/pending/`
