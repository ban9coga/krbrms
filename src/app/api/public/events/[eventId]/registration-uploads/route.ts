import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { isPdfFile, prepareImageUpload, preparePassthroughUpload } from '../../../../../../lib/imageUpload'
import { rateLimit } from '../../../../../../lib/rateLimit'

const BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'
const RIDER_PHOTO_MAX_BYTES = Math.round(1.5 * 1024 * 1024)
const SUPPORTING_IMAGE_MAX_BYTES = 2 * 1024 * 1024
const SUPPORTING_PDF_MAX_BYTES = 3 * 1024 * 1024
const ALLOWED_KINDS = new Set(['rider-photo', 'document', 'payment'])
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

const getPendingPrefix = (eventId: string) => `events/${eventId}/pending/`

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limited = rateLimit(req, PENDING_UPLOAD_LIMIT)
  if (!limited.ok) return limited.response

  const { eventId } = await params
  const form = await req.formData()
  const file = form.get('file')
  const kind = String(form.get('kind') ?? '').trim()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File wajib dipilih.' }, { status: 400 })
  }
  if (!ALLOWED_KINDS.has(kind)) {
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

  const isImage = file.type.startsWith('image/')
  const isPdf = isPdfFile(file)
  if (kind === 'rider-photo' && !isImage) {
    return NextResponse.json({ error: 'Foto rider harus berupa gambar.' }, { status: 400 })
  }
  if (kind !== 'rider-photo' && !isImage && !isPdf) {
    return NextResponse.json({ error: 'File harus berupa gambar atau PDF.' }, { status: 400 })
  }

  let upload
  try {
    upload =
      kind !== 'rider-photo' && isPdf
        ? await preparePassthroughUpload(file, {
            maxBytes: SUPPORTING_PDF_MAX_BYTES,
            contentType: 'application/pdf',
            extension: 'pdf',
            label: kind === 'payment' ? 'Bukti pembayaran' : 'Dokumen rider',
          })
        : await prepareImageUpload(file, {
            maxBytes: kind === 'rider-photo' ? RIDER_PHOTO_MAX_BYTES : SUPPORTING_IMAGE_MAX_BYTES,
            maxDimension: kind === 'rider-photo' ? 500 : 1200,
            quality: 78,
            label: kind === 'rider-photo' ? 'Foto rider' : kind === 'payment' ? 'Bukti pembayaran' : 'Dokumen rider',
          })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'File gagal diproses.' },
      { status: 400 }
    )
  }

  const path = `${getPendingPrefix(eventId)}${kind}-${randomUUID()}.${upload.extension}`
  const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(path, upload.buffer, {
    contentType: upload.contentType,
    cacheControl: '31536000',
    upsert: false,
  })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 })
  }

  return NextResponse.json({
    data: {
      path,
      name: file.name,
    },
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limited = rateLimit(req, PENDING_UPLOAD_DELETE_LIMIT)
  if (!limited.ok) return limited.response

  const { eventId } = await params
  const body = await req.json().catch(() => null)
  const path = typeof body?.path === 'string' ? body.path.trim() : ''

  if (!path.startsWith(getPendingPrefix(eventId))) {
    return NextResponse.json({ error: 'Path upload tidak valid.' }, { status: 400 })
  }

  const { error } = await adminClient.storage.from(BUCKET).remove([path])
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
