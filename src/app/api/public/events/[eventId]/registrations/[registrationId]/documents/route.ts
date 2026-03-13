import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../../lib/auth'

const BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'

export const runtime = 'nodejs'

type RegRow = { id: string; event_id: string; upload_token: string | null }

const requireUploadToken = async (req: Request, eventId: string, registrationId: string) => {
  const token = req.headers.get('x-upload-token') ?? new URL(req.url).searchParams.get('upload_token')
  if (!token) {
    return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: reg, error } = await adminClient
    .from('registrations')
    .select('id, event_id, upload_token')
    .eq('id', registrationId)
    .maybeSingle()

  if (error) {
    return { ok: false as const, res: NextResponse.json({ error: error.message }, { status: 400 }) }
  }
  if (!reg || reg.event_id !== eventId) {
    return { ok: false as const, res: NextResponse.json({ error: 'Registration not found' }, { status: 404 }) }
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
  const documentType = String(form.get('document_type') || '').toUpperCase()
  const itemId = form.get('registration_item_id')?.toString() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }
  if (documentType !== 'KK' && documentType !== 'AKTE') {
    return NextResponse.json({ error: 'Invalid document_type' }, { status: 400 })
  }

  if (itemId) {
    const { data: itemRow, error: itemErr } = await adminClient
      .from('registration_items')
      .select('id')
      .eq('id', itemId)
      .eq('registration_id', registrationId)
      .maybeSingle()
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 })
    if (!itemRow) return NextResponse.json({ error: 'registration_item_id not found' }, { status: 404 })
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
