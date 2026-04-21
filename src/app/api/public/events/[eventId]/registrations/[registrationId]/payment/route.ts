import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../../lib/auth'

const BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'
const SUPPORTING_IMAGE_MAX_BYTES = 2 * 1024 * 1024
const SUPPORTING_PDF_MAX_BYTES = 3 * 1024 * 1024

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

  const lowerName = file.name.toLowerCase()
  const isImage = file.type.startsWith('image/')
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
  if (!isImage && !isPdf) {
    return NextResponse.json({ error: 'Bukti pembayaran harus berupa gambar atau PDF.' }, { status: 400 })
  }
  const limit = isPdf ? SUPPORTING_PDF_MAX_BYTES : SUPPORTING_IMAGE_MAX_BYTES
  if (file.size > limit) {
    return NextResponse.json(
      {
        error: `Bukti pembayaran terlalu besar. Maksimal ${isPdf ? '3.0 MB untuk PDF' : '2.0 MB untuk gambar'}.`,
      },
      { status: 400 }
    )
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
