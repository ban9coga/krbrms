import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../lib/auth'

const REGISTRATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
const PAYMENT_FILTERS = ['ALL', 'NO_PAYMENT', 'PENDING', 'APPROVED', 'REJECTED'] as const
const ATTENDANCE_FILTERS = [
  'ALL',
  'ATTENDING',
  'NOT_ATTENDING',
  'UNCONFIRMED',
  'CHECKED_IN',
  'NOT_CHECKED_IN',
  'GOODIE_BAG_COLLECTED',
  'GOODIE_BAG_NOT_COLLECTED',
] as const

const REGISTRATION_LIST_SELECT = `
  id,
  registration_code,
  community_name,
  contact_name,
  contact_phone,
  contact_email,
  status,
  total_amount,
  notes,
  created_at,
  attendance_status,
  attendance_confirmed_at,
  checked_in_at,
  goodie_bag_collected_at,
  registration_items(
    id,
    rider_name,
    rider_nickname,
    jersey_size,
    date_of_birth,
    gender,
    club,
    primary_category_id,
    extra_category_id,
    requested_plate_number,
    requested_plate_suffix,
    photo_url,
    price,
    status
  ),
  registration_documents(
    id,
    registration_item_id,
    document_type,
    file_url
  ),
  registration_payments(
    id,
    proof_url,
    amount,
    bank_name,
    account_name,
    account_number,
    status
  )
`

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

const normalizeAttendanceFilter = (value: string | null) => {
  const normalized = String(value ?? 'ALL').trim().toUpperCase()
  return ATTENDANCE_FILTERS.includes(normalized as (typeof ATTENDANCE_FILTERS)[number])
    ? (normalized as (typeof ATTENDANCE_FILTERS)[number])
    : 'ALL'
}

const searchRegistrationIds = async (eventId: string, rawQuery: string) => {
  const query = sanitizeSearchTerm(rawQuery)
  if (!query) return null

  const topLevelFilters = [
    `registration_code.ilike.%${query.toUpperCase()}%`,
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

  if (paymentFilter !== 'NO_PAYMENT') {
    const paymentRes = await adminClient
      .from('registration_payments')
      .select('registration_id, registrations!inner(event_id)')
      .eq('registrations.event_id', eventId)
      .eq('status', paymentFilter)

    if (paymentRes.error) throw new Error(paymentRes.error.message)

    return Array.from(
      new Set(
        (paymentRes.data ?? [])
          .map((row) => (typeof row.registration_id === 'string' ? row.registration_id : null))
          .filter((id): id is string => id !== null)
      )
    )
  }

  const [allRegsRes, paymentRes] = await Promise.all([
    adminClient.from('registrations').select('id').eq('event_id', eventId),
    adminClient
      .from('registration_payments')
      .select('registration_id, registrations!inner(event_id)')
      .eq('registrations.event_id', eventId),
  ])

  if (allRegsRes.error) throw new Error(allRegsRes.error.message)
  if (paymentRes.error) throw new Error(paymentRes.error.message)

  const paidIds = new Set(
    (paymentRes.data ?? [])
      .map((row) => (typeof row.registration_id === 'string' ? row.registration_id : null))
      .filter((id): id is string => id !== null)
  )
  const registrationIds = (allRegsRes.data ?? [])
    .map((row) => (typeof row.id === 'string' ? row.id : null))
    .filter((id): id is string => id !== null)

  return registrationIds.filter((id) => !paidIds.has(id))
}

const countApprovedRegistrations = async (
  eventId: string,
  options: { attendanceStatus?: string; notNullColumn?: 'checked_in_at' | 'goodie_bag_collected_at' } = {}
) => {
  let query = adminClient
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'APPROVED')

  if (options.attendanceStatus) query = query.eq('attendance_status', options.attendanceStatus)
  if (options.notNullColumn) query = query.not(options.notNullColumn, 'is', null)

  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const getAttendanceSummary = async (eventId: string) => {
  const [
    approved,
    confirmedAttending,
    confirmedNotAttending,
    unconfirmed,
    checkedIn,
    goodieBagCollected,
  ] = await Promise.all([
    countApprovedRegistrations(eventId),
    countApprovedRegistrations(eventId, { attendanceStatus: 'ATTENDING' }),
    countApprovedRegistrations(eventId, { attendanceStatus: 'NOT_ATTENDING' }),
    countApprovedRegistrations(eventId, { attendanceStatus: 'UNCONFIRMED' }),
    countApprovedRegistrations(eventId, { notNullColumn: 'checked_in_at' }),
    countApprovedRegistrations(eventId, { notNullColumn: 'goodie_bag_collected_at' }),
  ])

  return {
    approved,
    confirmed_attending: confirmedAttending,
    confirmed_not_attending: confirmedNotAttending,
    unconfirmed,
    checked_in: checkedIn,
    goodie_bag_collected: goodieBagCollected,
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const summary = String(searchParams.get('summary') ?? '').trim().toLowerCase()
  const status = normalizeRegistrationStatus(searchParams.get('status'))
  const paymentFilter = normalizePaymentFilter(searchParams.get('payment_status'))
  const attendanceFilter = normalizeAttendanceFilter(searchParams.get('attendance'))
  const q = String(searchParams.get('q') ?? '').trim()
  const page = parsePositiveInt(searchParams.get('page'), 1)
  const pageSize = Math.min(50, Math.max(5, parsePositiveInt(searchParams.get('page_size'), 10)))

  try {
    if (summary === 'attendance') {
      return NextResponse.json({ data: await getAttendanceSummary(eventId) })
    }

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
      .select(REGISTRATION_LIST_SELECT, { count: 'exact' })
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (attendanceFilter !== 'ALL') {
      query = query.eq('status', 'APPROVED')
      if (attendanceFilter === 'ATTENDING') query = query.eq('attendance_status', 'ATTENDING')
      if (attendanceFilter === 'NOT_ATTENDING') query = query.eq('attendance_status', 'NOT_ATTENDING')
      if (attendanceFilter === 'UNCONFIRMED') query = query.eq('attendance_status', 'UNCONFIRMED')
      if (attendanceFilter === 'CHECKED_IN') query = query.not('checked_in_at', 'is', null)
      if (attendanceFilter === 'NOT_CHECKED_IN') query = query.is('checked_in_at', null)
      if (attendanceFilter === 'GOODIE_BAG_COLLECTED') query = query.not('goodie_bag_collected_at', 'is', null)
      if (attendanceFilter === 'GOODIE_BAG_NOT_COLLECTED') query = query.is('goodie_bag_collected_at', null)
    } else if (status !== 'ALL') {
      query = query.eq('status', status)
    }
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

