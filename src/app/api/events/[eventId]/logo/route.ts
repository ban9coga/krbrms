import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import { prepareImageUpload } from '../../../../../lib/imageUpload'
import { toPublicMediaUrl } from '../../../../../lib/publicMedia'

const BUCKET = 'event-logos'
const EVENT_LOGO_MAX_BYTES = 2 * 1024 * 1024

const ensureBucket = async () => {
  const { data } = await adminClient.storage.getBucket(BUCKET)
  if (data) return
  await adminClient.storage.createBucket(BUCKET, { public: true })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 })
  }
  let upload
  try {
    upload = await prepareImageUpload(file, {
      maxBytes: EVENT_LOGO_MAX_BYTES,
      maxDimension: 1200,
      quality: 82,
      label: 'Logo event',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Logo event gagal diproses.' }, { status: 400 })
  }

  await ensureBucket()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const baseName = safeName.replace(/\.[^.]+$/, '') || 'logo'
  const path = `events/${eventId}/logo-${Date.now()}-${baseName}.${upload.extension}`
  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(path, upload.buffer, { contentType: upload.contentType, upsert: true, cacheControl: '31536000' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const publicUrl = adminClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const mediaUrl = toPublicMediaUrl(publicUrl) ?? publicUrl
  const { data: existingSettings, error: settingsLookupError } = await adminClient
    .from('event_settings')
    .select('registration_open')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (settingsLookupError) return NextResponse.json({ error: settingsLookupError.message }, { status: 400 })

  const registrationOpen = typeof existingSettings?.registration_open === 'boolean' ? existingSettings.registration_open : true
  const { error: upsertError } = await adminClient
    .from('event_settings')
    .upsert({ event_id: eventId, event_logo_url: mediaUrl, registration_open: registrationOpen }, { onConflict: 'event_id' })
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 })

  return NextResponse.json({ url: mediaUrl })
}
