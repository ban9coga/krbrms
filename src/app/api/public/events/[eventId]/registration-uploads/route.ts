import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { rateLimit } from '../../../../../../lib/rateLimit'
import {
  getPendingRegistrationUploadPrefix,
  getRegistrationFileKind,
  isRegistrationUploadKind,
  prepareRegistrationUploadFile,
  removeRegistrationStorageObjects,
  uploadRegistrationStorageObject,
} from '../../../../../../lib/registrationUploads'

const PENDING_UPLOAD_LIMIT = {
  key: 'public-registration-upload',
  limit: 20,
  windowMs: 5 * 60 * 1000,
}
const PENDING_UPLOAD_DELETE_LIMIT = {
  key: 'public-registration-upload-delete',
  limit: 30,
  windowMs: 5 * 60 * 1000,
}

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limited = await rateLimit(req, PENDING_UPLOAD_LIMIT)
  if (!limited.ok) return limited.response

  const { eventId } = await params
  const form = await req.formData()
  const file = form.get('file')
  const kind = String(form.get('kind') ?? '').trim()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File wajib dipilih.' }, { status: 400 })
  }
  if (!isRegistrationUploadKind(kind)) {
    return NextResponse.json({ error: 'Jenis upload tidak valid.' }, { status: 400 })
  }

  const { data: settings, error: settingsError } = await adminClient
    .from('event_settings')
    .select('registration_open')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 400 })
  }
  if (settings?.registration_open === false) {
    return NextResponse.json({ error: 'Pendaftaran event sedang ditutup.' }, { status: 409 })
  }

  const { isImage, isPdf } = getRegistrationFileKind(file)
  if (kind === 'rider-photo' && !isImage) {
    return NextResponse.json({ error: 'Foto rider harus berupa gambar.' }, { status: 400 })
  }
  if (kind !== 'rider-photo' && !isImage && !isPdf) {
    return NextResponse.json({ error: 'File harus berupa gambar atau PDF.' }, { status: 400 })
  }

  let upload
  try {
    upload = await prepareRegistrationUploadFile(file, {
      kind,
      label: kind === 'rider-photo' ? 'Foto rider' : kind === 'payment' ? 'Bukti pembayaran' : 'Dokumen rider',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'File gagal diproses.' },
      { status: 400 }
    )
  }

  const path = `${getPendingRegistrationUploadPrefix(eventId)}${kind}-${randomUUID()}.${upload.extension}`
  try {
    await uploadRegistrationStorageObject(path, upload, { upsert: false })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload gagal.' }, { status: 400 })
  }

  return NextResponse.json({
    data: {
      path,
      name: file.name,
    },
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limited = await rateLimit(req, PENDING_UPLOAD_DELETE_LIMIT)
  if (!limited.ok) return limited.response

  const { eventId } = await params
  const body = await req.json().catch(() => null)
  const path = typeof body?.path === 'string' ? body.path.trim() : ''

  if (!path.startsWith(getPendingRegistrationUploadPrefix(eventId))) {
    return NextResponse.json({ error: 'Path upload tidak valid.' }, { status: 400 })
  }

  const { error } = (await removeRegistrationStorageObjects([path])) ?? {}
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
