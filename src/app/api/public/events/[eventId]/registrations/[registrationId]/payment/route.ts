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
  const bankName = form.get('bank_name')?.toString() || null
  const accountName = form.get('account_name')?.toString() || null
  const accountNumber = form.get('account_number')?.toString() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Payment proof is required' }, { status: 400 })
  }

  const { data: reg, error: regError } = await adminClient
    .from('registrations')
    .select('total_amount')
    .eq('id', registrationId)
    .single()
  if (regError) return NextResponse.json({ error: regError.message }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${eventId}/${registrationId}/payment-${Date.now()}.${ext}`

  const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const { data, error } = await adminClient
    .from('registration_payments')
    .insert({
      registration_id: registrationId,
      amount: reg.total_amount,
      bank_name: bankName,
      account_name: accountName,
      account_number: accountNumber,
      proof_url: path,
      status: 'PENDING',
      payment_method: 'MANUAL_TRANSFER',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
