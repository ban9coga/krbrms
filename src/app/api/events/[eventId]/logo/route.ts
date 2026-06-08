import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import { toPublicMediaUrl } from '../../../../../lib/publicMedia'

const BUCKET = 'event-logos'

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

  await ensureBucket()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `events/${eventId}/logo-${Date.now()}-${safeName}`
  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
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
