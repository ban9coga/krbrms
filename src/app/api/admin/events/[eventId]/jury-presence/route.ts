import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '@/src/lib/auth'
import { getJuryPresencesForEvent, isPresenceOnline } from '@/src/lib/juryPresenceStore'
import { formatAppRoleLabel, normalizeAppRole } from '@/src/lib/roles'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch user accounts from Supabase Auth
  const { data: userData, error: userError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (userError) {
    return NextResponse.json({ error: 'Gagal membaca data user.' }, { status: 500 })
  }

  // 2. Fetch live heartbeats for this event
  const livePresences = getJuryPresencesForEvent(eventId)
  const presenceByUser = new Map(livePresences.map((p) => [p.userId, p]))

  // 3. Query latest moto operations in this event for proof-of-work
  const [checkerMotoRes, finisherMotoRes] = await Promise.all([
    adminClient
      .from('motos')
      .select('id, moto_name, checker_prep_ready_at')
      .eq('event_id', eventId)
      .not('checker_prep_ready_at', 'is', null)
      .order('checker_prep_ready_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminClient
      .from('motos')
      .select('id, moto_name, provisional_at')
      .eq('event_id', eventId)
      .not('provisional_at', 'is', null)
      .order('provisional_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const latestCheckerMoto = checkerMotoRes.data ?? null
  const latestFinisherMoto = finisherMotoRes.data ?? null

  const targetRoles = ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'MC']
  const now = Date.now()
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

  const juryUsers = userData.users
    .map((user) => {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
      const rawRole =
        (typeof meta.role === 'string' ? meta.role : '') ||
        (typeof appMeta.role === 'string' ? appMeta.role : '')
      const role = normalizeAppRole(rawRole)

      if (!targetRoles.includes(role)) return null

      const name =
        (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta.name === 'string' && meta.name.trim()) ||
        user.email?.split('@')[0] ||
        'Petugas'

      const crewCode = typeof meta.crew_code === 'string' ? meta.crew_code : null
      const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null
      const isLoggedInToday = Boolean(lastSignIn && now - lastSignIn.getTime() < TWENTY_FOUR_HOURS_MS)

      const live = presenceByUser.get(user.id)
      const isOnline = isPresenceOnline(live?.lastPingAt)

      let onlineStatus: 'ONLINE' | 'IDLE' | 'OFFLINE' = 'OFFLINE'
      if (isOnline) {
        onlineStatus = 'ONLINE'
      } else if (isLoggedInToday) {
        onlineStatus = 'IDLE'
      }

      // Operational proof
      let latestOperation: string | null = null
      if (role === 'CHECKER' && latestCheckerMoto?.checker_prep_ready_at) {
        latestOperation = `Menandai ${latestCheckerMoto.moto_name} siap`
      } else if (role === 'FINISHER' && latestFinisherMoto?.provisional_at) {
        latestOperation = `Submit hasil ${latestFinisherMoto.moto_name}`
      }

      return {
        id: user.id,
        email: user.email ?? '',
        name,
        role,
        role_label: formatAppRoleLabel(role),
        crew_code: crewCode,
        online_status: onlineStatus,
        is_logged_in_today: isLoggedInToday,
        last_sign_in_at: user.last_sign_in_at,
        last_ping_at: live?.lastPingAt ? new Date(live.lastPingAt).toISOString() : null,
        current_moto_id: live?.motoId ?? null,
        current_moto_name: live?.motoName ?? null,
        page_url: live?.pageUrl ?? null,
        user_agent: live?.userAgent ?? null,
        latest_operation: latestOperation,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    // Order: CHECKER, FINISHER, then RACE_DIRECTOR, MC
    .sort((a, b) => {
      const orderMap: Record<string, number> = { CHECKER: 1, FINISHER: 2, RACE_DIRECTOR: 3, MC: 4 }
      return (orderMap[a.role] ?? 99) - (orderMap[b.role] ?? 99)
    })

  const checkerOnline = juryUsers.some((u) => u.role === 'CHECKER' && u.online_status === 'ONLINE')
  const checkerLoggedIn = juryUsers.some((u) => u.role === 'CHECKER' && u.is_logged_in_today)
  const finisherOnline = juryUsers.some((u) => u.role === 'FINISHER' && u.online_status === 'ONLINE')
  const finisherLoggedIn = juryUsers.some((u) => u.role === 'FINISHER' && u.is_logged_in_today)

  return NextResponse.json({
    data: {
      summary: {
        checker_online: checkerOnline,
        checker_logged_in: checkerLoggedIn,
        finisher_online: finisherOnline,
        finisher_logged_in: finisherLoggedIn,
        all_online: checkerOnline && finisherOnline,
        all_logged_in: checkerLoggedIn && finisherLoggedIn,
      },
      juries: juryUsers,
      latest_checker_moto: latestCheckerMoto,
      latest_finisher_moto: latestFinisherMoto,
      refreshed_at: new Date().toISOString(),
    },
  })
}

