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
  const documentType = String(form.get('document_type') || '').toUpperCase()
  const itemId = form.get('registration_item_id')?.toString() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }
  if (documentType !== 'KK' && documentType !== 'AKTE') {
    return NextResponse.json({ error: 'Invalid document_type' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${eventId}/${registrationId}/${itemId ?? 'general'}-${documentType}-${Date.now()}.${ext}`

  const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const { data, error } = await adminClient
    .from('registration_documents')
    .insert({
      registration_id: registrationId,
      registration_item_id: itemId,
      document_type: documentType,
      file_url: path,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
