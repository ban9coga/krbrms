import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export const runtime = 'nodejs'

const BUCKET = 'rider-photos'

const ensureBucket = async () => {
  const { data, error } = await adminClient.storage.getBucket(BUCKET)
  if (data && !error) return
  // If bucket doesn't exist, create it as public for viewer pages.
  await adminClient.storage.createBucket(BUCKET, { public: true })
}

const pickExt = (file: File) => {
  if (file.type.includes('webp')) return 'webp'
  if (file.type.includes('png')) return 'png'
  return 'jpg'
}

export async function POST(req: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { riderId } = await params
  const formData = await req.formData()
  const full = formData.get('full')
  const thumb = formData.get('thumb')

  if (!(full instanceof File) || !(thumb instanceof File)) {
    return NextResponse.json({ error: 'full and thumb files required' }, { status: 400 })
  }

  const { data: rider, error: riderError } = await adminClient
    .from('riders')
    .select('id, event_id')
    .eq('id', riderId)
    .single()

  if (riderError || !rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

  await ensureBucket()
  const storage = adminClient.storage.from(BUCKET)

  const fullExt = pickExt(full)
  const thumbExt = pickExt(thumb)
  const fullPath = `events/${rider.event_id}/riders/${rider.id}/full.${fullExt}`
  const thumbPath = `events/${rider.event_id}/riders/${rider.id}/thumb.${thumbExt}`

  const fullBuf = Buffer.from(await full.arrayBuffer())
  const thumbBuf = Buffer.from(await thumb.arrayBuffer())

  const { error: fullError } = await storage.upload(fullPath, fullBuf, {
    contentType: full.type || 'image/jpeg',
    upsert: true,
  })
  if (fullError) return NextResponse.json({ error: fullError.message }, { status: 400 })

  const { error: thumbError } = await storage.upload(thumbPath, thumbBuf, {
    contentType: thumb.type || 'image/jpeg',
    upsert: true,
  })
  if (thumbError) return NextResponse.json({ error: thumbError.message }, { status: 400 })

  const version = Date.now()
  const photoUrl = `${storage.getPublicUrl(fullPath).data.publicUrl}?v=${version}`
  const thumbUrl = `${storage.getPublicUrl(thumbPath).data.publicUrl}?v=${version}`

  const { error: updateError } = await adminClient
    .from('riders')
    .update({ photo_url: photoUrl, photo_thumbnail_url: thumbUrl })
    .eq('id', riderId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  return NextResponse.json({
    data: { photo_url: photoUrl, photo_thumbnail_url: thumbUrl },
  })
}
