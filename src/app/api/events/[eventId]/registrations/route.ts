import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

type RegistrationItemInput = {
  name: string
  date_of_birth: string
  gender: 'BOY' | 'GIRL'
  plate_number: number
  plate_suffix?: string | null
  club?: string | null
  primary_category_id: string
  extra_category_ids?: string[]
  document_url: string
  document_type: 'KK' | 'AKTE'
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('registrations')
    .select('id, event_id, status, total_fee, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const items = (body?.items ?? []) as RegistrationItemInput[]
  const payment = body?.payment as { amount: number; proof_url: string; note?: string } | undefined

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items required' }, { status: 400 })
  }
  if (!payment?.amount || !payment?.proof_url) {
    return NextResponse.json({ error: 'payment proof required' }, { status: 400 })
  }

  const { data: regRow, error: regError } = await adminClient
    .from('registrations')
    .insert([{ event_id: eventId, status: 'PENDING_APPROVAL', total_fee: payment.amount }])
    .select('id')
    .single()
  if (regError || !regRow) return NextResponse.json({ error: regError?.message || 'Failed to create registration' }, { status: 400 })

  const itemPayload = items.map((item) => ({
    registration_id: regRow.id,
    event_id: eventId,
    name: item.name,
    date_of_birth: item.date_of_birth,
    gender: item.gender,
    plate_number: item.plate_number,
    plate_suffix: item.plate_suffix ?? null,
    club: item.club ?? null,
    primary_category_id: item.primary_category_id,
    extra_category_ids: item.extra_category_ids ?? [],
  }))

  const { data: itemRows, error: itemError } = await adminClient
    .from('registration_items')
    .insert(itemPayload)
    .select('id')
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 })

  const documents = items.map((item, idx) => ({
    registration_item_id: itemRows?.[idx]?.id,
    doc_type: item.document_type,
    doc_url: item.document_url,
  }))
  const { error: docError } = await adminClient.from('registration_documents').insert(documents)
  if (docError) return NextResponse.json({ error: docError.message }, { status: 400 })

  const { error: payError } = await adminClient.from('registration_payments').insert([
    {
      registration_id: regRow.id,
      event_id: eventId,
      amount: payment.amount,
      method: 'TRANSFER',
      proof_url: payment.proof_url,
      note: payment.note ?? null,
    },
  ])
  if (payError) return NextResponse.json({ error: payError.message }, { status: 400 })

  return NextResponse.json({ ok: true, registration_id: regRow.id })
}
