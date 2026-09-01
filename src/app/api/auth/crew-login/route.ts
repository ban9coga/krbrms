import { NextResponse } from 'next/server'
import { adminClient, authClient } from '../../../../lib/auth'
import { rateLimit } from '../../../../lib/rateLimit'

export const runtime = 'nodejs'

const CREW_LOGIN_LIMIT = { key: 'crew-login', limit: 8, windowMs: 15 * 60 * 1000 }

const normalizeCrewCode = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

export async function POST(req: Request) {
  const limited = await rateLimit(req, CREW_LOGIN_LIMIT)
  if (!limited.ok) return limited.response

  const body = (await req.json().catch(() => null)) as { crewCode?: unknown; pin?: unknown } | null
  const crewCode = normalizeCrewCode(body?.crewCode)
  const pin = String(body?.pin ?? '')

  if (!/^[A-Z0-9-]{3,32}$/.test(crewCode) || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'Kode crew atau PIN tidak valid.' }, { status: 400 })
  }

  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) return NextResponse.json({ error: 'Login belum dapat diproses.' }, { status: 500 })

  const matchedUser = data.users.find((user) => {
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
    return normalizeCrewCode(metadata.crew_code) === crewCode
  })

  if (!matchedUser?.email) {
    return NextResponse.json({ error: 'Kode crew atau PIN salah.' }, { status: 401, headers: limited.headers })
  }

  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email: matchedUser.email,
    password: pin,
  })

  if (authError || !authData.session) {
    return NextResponse.json({ error: 'Kode crew atau PIN salah.' }, { status: 401, headers: limited.headers })
  }

  return NextResponse.json(
    { data: { session: authData.session } },
    { headers: { ...limited.headers, 'Cache-Control': 'no-store' } }
  )
}
