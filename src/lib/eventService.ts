export type EventStatus = 'UPCOMING' | 'LIVE' | 'FINISHED'

export type EventItem = {
  id: string
  name: string
  location?: string | null
  event_date: string
  status: EventStatus
  created_at?: string | null
  updated_at?: string | null
}

export type YearCategory = {
  year: string
  label?: string
}

export type RiderCategory = {
  id: string
  year: number
  year_min?: number
  year_max?: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

export type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
}

export type LeaderboardRow = {
  rider_name: string
  bike_number: string
  team?: string | null
  position: number
  status?: string
  total_point?: number | null
  penalty_total?: number | null
}

export type RiderPublicItem = {
  id: string
  name: string
  no_plate_display: string
  date_of_birth: string
  birth_year?: number
  gender: 'BOY' | 'GIRL'
  club?: string | null
  photo_url?: string | null
  photo_thumbnail_url?: string | null
}

export type Paged<T> = {
  data: T[]
  page: number
  page_size: number
  total: number
}

export const getEvents = async (status?: EventStatus): Promise<EventItem[]> => {
  const url = status ? `/api/events?status=${status}` : '/api/events'
  const res = await fetch(url)
  const json = await res.json()
  return json.data ?? []
}

export const getEventById = async (id: string): Promise<EventItem | null> => {
  const res = await fetch(`/api/events/${id}`)
  const json = await res.json()
  return json.data ?? null
}

export const getYearCategories = async (eventId: string): Promise<YearCategory[]> => {
  const data = await getEventCategories(eventId)
  const years = Array.from(new Set(data.map((item) => item.year))).sort((a, b) => b - a)
  return years.map((year) => ({
    year: String(year),
    label: String(year),
  }))
}

export const getCategoriesByYear = async (
  eventId: string,
  year: string
): Promise<RiderCategory[]> => {
  const data = await getEventCategories(eventId)
  return data.filter((item) => String(item.year) === year && item.enabled)
}

export const getEventCategories = async (eventId: string): Promise<RiderCategory[]> => {
  const res = await fetch(`/api/events/${eventId}/categories`)
  const json = await res.json()
  return json.data ?? []
}

export const getMotosByCategory = async (categoryId: string): Promise<MotoItem[]> => {
  const res = await fetch(`/api/motos?category_id=${categoryId}`)
  const json = await res.json()
  return json.data ?? []
}

export const getRidersByEvent = async (
  eventId: string,
  page = 1,
  pageSize = 24
): Promise<Paged<RiderPublicItem>> => {
  const qs = new URLSearchParams({
    event_id: eventId,
    page: String(page),
    page_size: String(pageSize),
  })
  const res = await fetch(`/api/riders?${qs.toString()}`)
  const json = await res.json()
  return {
    data: json.data ?? [],
    page: json.page ?? page,
    page_size: json.page_size ?? pageSize,
    total: json.total ?? 0,
  }
}

export const getMotoResults = async (motoId: string): Promise<LeaderboardRow[]> => {
  const res = await fetch(`/api/motos/${motoId}/results`)
  const json = await res.json()
  const data = (json.data ?? []) as Array<{
    finish_order: number | null
    result_status: string
    total_point?: number | null
    penalty_total?: number | null
    riders: { name: string; no_plate_display: string } | null
  }>
  const normalized = data.map((row) => ({
    rider_name: row.riders?.name ?? '-',
    bike_number: row.riders?.no_plate_display ?? '-',
    team: null,
    finish_order: row.finish_order ?? null,
    total_point: row.total_point ?? (row.finish_order ?? null),
    penalty_total: row.penalty_total ?? 0,
    status: row.result_status,
  }))

  normalized.sort((a, b) => {
    const at = a.total_point
    const bt = b.total_point
    if (at == null && bt == null) return 0
    if (at == null) return 1
    if (bt == null) return -1
    if (at !== bt) return at - bt
    const af = a.finish_order ?? 9999
    const bf = b.finish_order ?? 9999
    return af - bf
  })

  return normalized.map((row, index) => ({
    rider_name: row.rider_name,
    bike_number: row.bike_number,
    team: row.team,
    position: index + 1,
    status: row.status,
    total_point: row.total_point,
    penalty_total: row.penalty_total,
  }))
}
