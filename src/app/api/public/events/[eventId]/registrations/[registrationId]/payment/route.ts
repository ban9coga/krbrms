import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../../lib/auth'
import {
  getRegistrationFileKind,
  prepareRegistrationUploadFile,
  requireRegistrationUploadToken,
  uploadRegistrationStorageObject,
} from '../../../../../../../../lib/registrationUploads'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireRegistrationUploadToken(req, eventId, registrationId)
  if (!auth.ok) return auth.res

  const form = await req.formData()
  const file = form.get('file')
  const bankName = form.get('bank_name')?.toString().trim() || null
  const accountName = form.get('account_name')?.toString().trim() || null
  const accountNumber = form.get('account_number')?.toString().trim() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Bukti pembayaran wajib diupload.' }, { status: 400 })
  }
  if (!bankName) {
    return NextResponse.json({ error: 'Bank pengirim wajib diisi.' }, { status: 400 })
  }
  if (!accountName) {
    return NextResponse.json({ error: 'Nama pengirim wajib diisi.' }, { status: 400 })
  }
  if (!accountNumber) {
    return NextResponse.json({ error: 'Nomor rekening pengirim wajib diisi.' }, { status: 400 })
  }

  const { isImage, isPdf } = getRegistrationFileKind(file)
  if (!isImage && !isPdf) {
    return NextResponse.json({ error: 'Bukti pembayaran harus berupa gambar atau PDF.' }, { status: 400 })
  }

  const { data: reg, error: regError } = await adminClient
    .from('registrations')
    .select('total_amount, event_id')
    .eq('id', registrationId)
    .maybeSingle()
  if (regError) return NextResponse.json({ error: regError.message }, { status: 400 })
  if (!reg || reg.event_id !== eventId) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
  }

  let upload
  try {
    upload = await prepareRegistrationUploadFile(file, {
      kind: 'payment',
      label: 'Bukti pembayaran',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Bukti pembayaran gagal diproses.' }, { status: 400 })
  }
  const path = `${eventId}/${registrationId}/payment-${Date.now()}.${upload.extension}`

  const storagePath = `events/${path}`
  try {
    await uploadRegistrationStorageObject(storagePath, upload)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bukti pembayaran gagal diupload.' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('registration_payments')
    .insert({
      registration_id: registrationId,
      amount: reg.total_amount,
      bank_name: bankName,
      account_name: accountName,
      account_number: accountNumber,
      proof_url: storagePath,
      status: 'PENDING',
      payment_method: 'MANUAL_TRANSFER',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data })
}
