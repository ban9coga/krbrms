import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../lib/auth'

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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireUploadToken(req, eventId, registrationId)
  if (!auth.ok) return auth.res

  const [itemsRes, docsRes, paymentRes] = await Promise.all([
    adminClient.from('registration_items').select('photo_url').eq('registration_id', registrationId),
    adminClient.from('registration_documents').select('file_url').eq('registration_id', registrationId),
    adminClient.from('registration_payments').select('proof_url').eq('registration_id', registrationId),
  ])

  const queryError = itemsRes.error || docsRes.error || paymentRes.error
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 400 })
  }

  const uploadedPaths = [
    ...(itemsRes.data ?? []).map((row) => row.photo_url).filter((value): value is string => typeof value === 'string' && value.length > 0),
    ...(docsRes.data ?? []).map((row) => row.file_url).filter((value): value is string => typeof value === 'string' && value.length > 0),
    ...(paymentRes.data ?? []).map((row) => row.proof_url).filter((value): value is string => typeof value === 'string' && value.length > 0),
  ]

  if (uploadedPaths.length > 0) {
    const { error: removeError } = await adminClient.storage.from(BUCKET).remove(uploadedPaths)
    if (removeError) {
      return NextResponse.json({ error: removeError.message }, { status: 400 })
    }
  }

  const { error: deleteError } = await adminClient.from('registrations').delete().eq('id', registrationId)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  return NextResponse.json({ data: { deleted: true } })
}
