import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../lib/auth'
import {
  removeRegistrationStorageObjects,
  requireRegistrationUploadToken,
} from '../../../../../../../lib/registrationUploads'

export const runtime = 'nodejs'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireRegistrationUploadToken(req, eventId, registrationId)
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
    const { error: removeError } = (await removeRegistrationStorageObjects(uploadedPaths)) ?? {}
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
