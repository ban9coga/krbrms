import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import { prepareImageUpload } from '../../../../../lib/imageUpload'
import { toPublicMediaUrl } from '../../../../../lib/publicMedia'

const BUCKET = 'event-logos'
const COMMUNITY_LOGO_MAX_BYTES = 2 * 1024 * 1024

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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }
  let upload
  try {
    upload = await prepareImageUpload(file, {
      maxBytes: COMMUNITY_LOGO_MAX_BYTES,
      maxDimension: 1200,
      quality: 82,
      label: 'Logo komunitas',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Logo komunitas gagal diproses.' }, { status: 400 })
  }

  await ensureBucket()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const baseName = safeName.replace(/\.[^.]+$/, '') || 'community'
  const path = `events/${eventId}/community-logos/community-${Date.now()}-${baseName}.${upload.extension}`
  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(path, upload.buffer, { contentType: upload.contentType, upsert: true, cacheControl: '31536000' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const publicUrl = adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ url: toPublicMediaUrl(publicUrl) ?? publicUrl })
}
