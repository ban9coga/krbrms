import { NextResponse } from 'next/server'
import { adminClient } from './auth'
import { isPdfFile, prepareImageUpload, preparePassthroughUpload, type PreparedUpload } from './imageUpload'
import {
  REGISTRATION_UPLOAD_BUCKET,
  REGISTRATION_UPLOAD_CACHE_CONTROL_SECONDS,
  RIDER_PHOTO_MAX_BYTES,
  SUPPORTING_IMAGE_MAX_BYTES,
  SUPPORTING_PDF_MAX_BYTES,
  type RegistrationUploadKind,
} from './registrationUploadConfig'

export {
  REGISTRATION_UPLOAD_BUCKET,
  REGISTRATION_UPLOAD_CACHE_CONTROL_SECONDS,
  RIDER_PHOTO_MAX_BYTES,
  SUPPORTING_IMAGE_MAX_BYTES,
  SUPPORTING_PDF_MAX_BYTES,
  getPendingRegistrationUploadPrefix,
  isRegistrationUploadKind,
  type RegistrationUploadKind,
} from './registrationUploadConfig'

type RegistrationUploadTokenRow = {
  id: string
  event_id: string
  status: string | null
  upload_token: string | null
}

export const requireRegistrationUploadToken = async (req: Request, eventId: string, registrationId: string) => {
  const token = req.headers.get('x-upload-token') ?? new URL(req.url).searchParams.get('upload_token')
  if (!token) {
    return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: reg, error } = await adminClient
    .from('registrations')
    .select('id, event_id, status, upload_token')
    .eq('id', registrationId)
    .maybeSingle()

  if (error) {
    return { ok: false as const, res: NextResponse.json({ error: error.message }, { status: 400 }) }
  }
  if (!reg || reg.event_id !== eventId) {
    return { ok: false as const, res: NextResponse.json({ error: 'Registration not found' }, { status: 404 }) }
  }
  if (reg.status !== 'PENDING') {
    return { ok: false as const, res: NextResponse.json({ error: 'Registration sudah diproses.' }, { status: 409 }) }
  }
  if (!reg.upload_token) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: 'Upload token not enabled for this registration' }, { status: 409 }),
    }
  }
  if (reg.upload_token !== token) {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, reg: reg as RegistrationUploadTokenRow }
}

export const getRegistrationFileKind = (file: File) => {
  const isImage = file.type.startsWith('image/')
  const isPdf = isPdfFile(file)
  return { isImage, isPdf }
}

export const prepareRegistrationUploadFile = async (
  file: File,
  {
    kind,
    label,
  }: {
    kind: RegistrationUploadKind
    label: string
  }
) => {
  const { isPdf } = getRegistrationFileKind(file)
  if (kind !== 'rider-photo' && isPdf) {
    return preparePassthroughUpload(file, {
      maxBytes: SUPPORTING_PDF_MAX_BYTES,
      contentType: 'application/pdf',
      extension: 'pdf',
      label,
    })
  }

  return prepareImageUpload(file, {
    maxBytes: kind === 'rider-photo' ? RIDER_PHOTO_MAX_BYTES : SUPPORTING_IMAGE_MAX_BYTES,
    maxDimension: kind === 'rider-photo' ? 500 : 1200,
    quality: 78,
    label,
  })
}

export const uploadRegistrationStorageObject = async (
  path: string,
  upload: PreparedUpload,
  { upsert = true }: { upsert?: boolean } = {}
) => {
  const { error } = await adminClient.storage.from(REGISTRATION_UPLOAD_BUCKET).upload(path, upload.buffer, {
    contentType: upload.contentType,
    cacheControl: REGISTRATION_UPLOAD_CACHE_CONTROL_SECONDS,
    upsert,
  })
  if (error) throw new Error(error.message)
}

export const removeRegistrationStorageObjects = async (paths: string[]) => {
  if (paths.length === 0) return null
  return adminClient.storage.from(REGISTRATION_UPLOAD_BUCKET).remove(paths)
}
