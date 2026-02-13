import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../../lib/auth'

const BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const form = await req.formData()
  const file = form.get('file')
  const itemId = form.get('registration_item_id')?.toString() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Photo is required' }, { status: 400 })
  }
  if (!itemId) {
    return NextResponse.json({ error: 'registration_item_id required' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
  const path = `${eventId}/${registrationId}/${itemId}-photo-${Date.now()}.${ext}`

  const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const { error } = await adminClient
    .from('registration_items')
    .update({ photo_url: path })
    .eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { photo_url: path } })
}
