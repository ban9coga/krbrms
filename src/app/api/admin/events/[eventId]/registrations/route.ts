import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

const REGISTRATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
const PAYMENT_FILTERS = ['ALL', 'NO_PAYMENT', 'PENDING', 'APPROVED', 'REJECTED'] as const

const sanitizeSearchTerm = (value: string) => value.replace(/[%(),]/g, ' ').trim()

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

const normalizeRegistrationStatus = (value: string | null) => {
  const normalized = String(value ?? 'ALL').trim().toUpperCase()
  if (normalized === 'ALL') return 'ALL' as const
  return REGISTRATION_STATUSES.includes(normalized as (typeof REGISTRATION_STATUSES)[number])
    ? (normalized as (typeof REGISTRATION_STATUSES)[number])
    : 'ALL'
}

const normalizePaymentFilter = (value: string | null) => {
  const normalized = String(value ?? 'ALL').trim().toUpperCase()
  return PAYMENT_FILTERS.includes(normalized as (typeof PAYMENT_FILTERS)[number])
    ? (normalized as (typeof PAYMENT_FILTERS)[number])
    : 'ALL'
}

const searchRegistrationIds = async (eventId: string, rawQuery: string) => {
  const query = sanitizeSearchTerm(rawQuery)
  if (!query) return null

  const topLevelFilters = [
    `contact_name.ilike.%${query}%`,
    `contact_phone.ilike.%${query}%`,
    `contact_email.ilike.%${query}%`,
    `community_name.ilike.%${query}%`,
  ]

  const digitsOnly = query.replace(/[^\d]/g, '')
  const suffixOnly = query.replace(/[^a-zA-Z]/g, '').toUpperCase()
  const itemFilters = [`rider_name.ilike.%${query}%`, `rider_nickname.ilike.%${query}%`]
  if (digitsOnly) itemFilters.push(`requested_plate_number.ilike.%${digitsOnly}%`)
  if (suffixOnly.length === 1) itemFilters.push(`requested_plate_suffix.eq.${suffixOnly}`)

  const [topLevelRes, itemRes] = await Promise.all([
    adminClient.from('registrations').select('id').eq('event_id', eventId).or(topLevelFilters.join(',')),
    adminClient
      .from('registration_items')
      .select('registration_id, registrations!inner(event_id)')
      .eq('registrations.event_id', eventId)
      .or(itemFilters.join(',')),
  ])

  if (topLevelRes.error) throw new Error(topLevelRes.error.message)
  if (itemRes.error) throw new Error(itemRes.error.message)

  const ids = new Set<string>()
  for (const row of topLevelRes.data ?? []) {
    if (typeof row.id === 'string' && row.id) ids.add(row.id)
  }
  for (const row of itemRes.data ?? []) {
    if (typeof row.registration_id === 'string' && row.registration_id) ids.add(row.registration_id)
  }
  return Array.from(ids)
}

const paymentRegistrationIds = async (eventId: string, paymentFilter: (typeof PAYMENT_FILTERS)[number]) => {
  if (paymentFilter === 'ALL') return null

  const paymentRes = await adminClient
    .from('registration_payments')
    .select('registration_id, status, registrations!inner(event_id)')
    .eq('registrations.event_id', eventId)

  if (paymentRes.error) throw new Error(paymentRes.error.message)

  const paidIds = new Set<string>()
  const matchingIds = new Set<string>()
  for (const row of paymentRes.data ?? []) {
    const registrationId = typeof row.registration_id === 'string' ? row.registration_id : null
    if (!registrationId) continue
    paidIds.add(registrationId)
    const status = typeof (row as { status?: string }).status === 'string' ? String((row as { status?: string }).status) : ''
    if (paymentFilter !== 'NO_PAYMENT' && status === paymentFilter) {
      matchingIds.add(registrationId)
    }
  }

  if (paymentFilter !== 'NO_PAYMENT') {
    return Array.from(matchingIds)
  }

  const allRegsRes = await adminClient.from('registrations').select('id').eq('event_id', eventId)
  if (allRegsRes.error) throw new Error(allRegsRes.error.message)

  return (allRegsRes.data ?? [])
    .map((row) => (typeof row.id === 'string' ? row.id : null))
    .filter((id): id is string => Boolean(id) && !paidIds.has(id))
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = normalizeRegistrationStatus(searchParams.get('status'))
  const paymentFilter = normalizePaymentFilter(searchParams.get('payment_status'))
  const q = String(searchParams.get('q') ?? '').trim()
  const page = parsePositiveInt(searchParams.get('page'), 1)
  const pageSize = Math.min(50, Math.max(5, parsePositiveInt(searchParams.get('page_size'), 10)))

  try {
    const [searchIds, paymentIds] = await Promise.all([
      searchRegistrationIds(eventId, q),
      paymentRegistrationIds(eventId, paymentFilter),
    ])

    if ((searchIds && searchIds.length === 0) || (paymentIds && paymentIds.length === 0)) {
      return NextResponse.json({
        data: [],
        meta: { page, page_size: pageSize, total: 0, total_pages: 1 },
      })
    }

    let query = adminClient
      .from('registrations')
      .select('*, registration_items(*), registration_documents(*), registration_payments(*)', { count: 'exact' })
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (status !== 'ALL') query = query.eq('status', status)
    if (searchIds) query = query.in('id', searchIds)
    if (paymentIds) query = query.in('id', paymentIds)

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const { data, error, count } = await query.range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const total = count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return NextResponse.json({
      data: data ?? [],
      meta: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat pendaftaran' },
      { status: 400 }
    )
  }
}
