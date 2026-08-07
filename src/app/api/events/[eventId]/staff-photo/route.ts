import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import { prepareImageUpload } from '../../../../../lib/imageUpload'
import { toPublicMediaUrl } from '../../../../../lib/publicMedia'

const BUCKET = 'event-staff'
const MAX_BYTES = 2 * 1024 * 1024

const ensureBucket = async () => {
  const { data } = await adminClient.storage.getBucket(BUCKET)
  if (data) return
  await adminClient.storage.createBucket(BUCKET, { public: true })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const role = String(form.get('role') ?? '').trim().toLowerCase()
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!['event-owner', 'operating-committee', 'scoring-support', 'race-director', 'mc'].includes(role)) {
    return NextResponse.json({ error: 'Role staff tidak valid.' }, { status: 400 })
  }

  let upload
  try {
    upload = await prepareImageUpload(file, {
      maxBytes: MAX_BYTES,
      maxDimension: 800,
      quality: 84,
      label: 'Foto staff',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Foto staff gagal diproses.' }, { status: 400 })
  }

  await ensureBucket()
  const path = `events/${eventId}/${role}-${Date.now()}.${upload.extension}`
  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(path, upload.buffer, { contentType: upload.contentType, upsert: true, cacheControl: '31536000' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const publicUrl = adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ url: toPublicMediaUrl(publicUrl) ?? publicUrl })
}
