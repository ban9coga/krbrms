import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../../lib/auth'
import { prepareImageUpload } from '../../../../../../../../lib/imageUpload'

const BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'
const RIDER_PHOTO_MAX_BYTES = Math.round(1.5 * 1024 * 1024)

export const runtime = 'nodejs'

type RegRow = { id: string; event_id: string; status: string | null; upload_token: string | null }

const requireUploadToken = async (req: Request, eventId: string, registrationId: string) => {
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
  return { ok: true as const, reg: reg as RegRow }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireUploadToken(req, eventId, registrationId)
  if (!auth.ok) return auth.res

  const form = await req.formData()
  const file = form.get('file')
  const itemId = form.get('registration_item_id')?.toString() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Foto rider wajib diupload.' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Foto rider harus berupa gambar.' }, { status: 400 })
  }
  if (file.size > RIDER_PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: 'Foto rider terlalu besar. Maksimal 1.5 MB.' }, { status: 400 })
  }
  if (!itemId) {
    return NextResponse.json({ error: 'registration_item_id required' }, { status: 400 })
  }

  const { data: itemRow, error: itemErr } = await adminClient
    .from('registration_items')
    .select('id')
    .eq('id', itemId)
    .eq('registration_id', registrationId)
    .maybeSingle()
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 })
  if (!itemRow) return NextResponse.json({ error: 'registration_item_id not found' }, { status: 404 })

  let upload
  try {
    upload = await prepareImageUpload(file, {
      maxBytes: RIDER_PHOTO_MAX_BYTES,
      maxDimension: 500,
      quality: 78,
      label: 'Foto rider',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Foto rider gagal diproses.' }, { status: 400 })
  }
  const path = `${eventId}/${registrationId}/${itemId}-photo-${Date.now()}.${upload.extension}`

  const storagePath = `events/${path}`
  const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(storagePath, upload.buffer, {
    contentType: upload.contentType,
    cacheControl: '31536000',
    upsert: true,
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const { error } = await adminClient
    .from('registration_items')
    .update({ photo_url: storagePath })
    .eq('id', itemId)
    .eq('registration_id', registrationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { photo_url: storagePath } })
}
