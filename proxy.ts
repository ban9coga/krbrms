import { NextRequest, NextResponse } from 'next/server'

const PROTECTED_PATHS = ['/admin', '/rc-admin', '/scoring', '/race-control', '/super-admin', '/jury', '/race-director', '/jc', '/mc', '/draw']

const ROLE_GUARDS: Record<string, string[]> = {
  '/admin/users': ['SUPER_ADMIN'],
  '/admin': ['ADMIN', 'SUPER_ADMIN', 'REGISTRATION_APPROVER'],
  '/rc-admin': ['RC_ADMIN'],
  '/jc': ['CHECKER', 'RACE_DIRECTOR', 'SUPER_ADMIN'],
  '/scoring': ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'SUPER_ADMIN'],
  '/jury/start': ['CHECKER', 'RACE_DIRECTOR', 'SUPER_ADMIN'],
  '/jury/finish': ['FINISHER', 'RACE_DIRECTOR', 'SUPER_ADMIN'],
  '/jury': ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'SUPER_ADMIN'],
  '/race-director': ['RACE_DIRECTOR', 'SUPER_ADMIN'],
  '/race-control': ['RACE_CONTROL', 'SUPER_ADMIN'],
  '/super-admin': ['SUPER_ADMIN'],
  '/mc': ['MC', 'RACE_DIRECTOR', 'SUPER_ADMIN'],
  '/draw': ['DRAW_MANAGER', 'ADMIN', 'SUPER_ADMIN'],
}

const normalizeRole = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/-/g, '_')

const hasActiveScopedRole = async (userId: string, allowedRoles: string[]) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey || !userId) return false

  try {
    const url = new URL('/rest/v1/user_event_roles', supabaseUrl)
    url.searchParams.set('select', 'role')
    url.searchParams.set('user_id', `eq.${userId}`)
    url.searchParams.set('is_active', 'eq.true')
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      cache: 'no-store',
    })
    if (!response.ok) return false

    const assignments = (await response.json()) as Array<{ role?: unknown }>
    return assignments.some((assignment) => allowedRoles.includes(normalizeRole(assignment.role)))
  } catch {
    return false
  }
}

const tryParseJson = (value: string) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const extractToken = (value: string) => {
  if (value.includes('.') && value.split('.').length >= 3) return value
  const parsed = tryParseJson(value)
  if (!parsed) return null
  if (typeof parsed === 'string' && parsed.includes('.')) return parsed
  if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
  if (parsed?.access_token && typeof parsed.access_token === 'string') return parsed.access_token
  return null
}

const getAuthToken = (req: NextRequest) => {
  const cookies = req.cookies.getAll()
  for (const cookie of cookies) {
    if (
      (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) ||
      cookie.name === 'sb-access-token' ||
      cookie.name === 'supabase-auth-token'
    ) {
      const token = extractToken(cookie.value)
      if (token) return token
    }
  }
  return null
}

const decodeJwt = (token: string) => {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = Buffer.from(payload, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const needsAuth = PROTECTED_PATHS.some((path) => pathname.startsWith(path))

  if (!needsAuth) return NextResponse.next()

  const token = getAuthToken(req)
  if (!token) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  const payload = decodeJwt(token)
  const appRole = payload?.app_metadata?.role || ''
  const rawRole =
    (String(appRole).toUpperCase() === 'RC_ADMIN' ? appRole : null) ||
    payload?.user_metadata?.role ||
    appRole ||
    payload?.role ||
    ''
  const normalizedRole = normalizeRole(rawRole)
  const role = normalizedRole === 'JURY_START' ? 'CHECKER' : normalizedRole === 'JURY_FINISH' ? 'FINISHER' : normalizedRole

  const guardPath = Object.keys(ROLE_GUARDS)
    .sort((a, b) => b.length - a.length)
    .find((path) => pathname.startsWith(path))
  const defaultRoute = (currentRole: string) => {
    if (currentRole === 'RACE_DIRECTOR') return '/race-director/approval'
    if (currentRole === 'FINISHER') return '/jury/finish'
    if (currentRole === 'CHECKER') return '/jc'
    if (currentRole === 'REGISTRATION_APPROVER') return '/admin/events'
    if (currentRole === 'RC_ADMIN') return '/rc-admin'
    if (currentRole === 'SUPER_ADMIN' || currentRole === 'ADMIN') return '/admin'
    if (currentRole === 'RACE_CONTROL') return '/race-control'
    if (currentRole === 'MC') return '/mc'
    if (currentRole === 'DRAW_MANAGER') return '/draw'
    return '/login'
  }

  if (guardPath) {
    const allowedRoles = ROLE_GUARDS[guardPath]
    const hasClaimRole = allowedRoles.includes(role)
    const hasScopedRole = !hasClaimRole && await hasActiveScopedRole(String(payload?.sub ?? ''), allowedRoles)
    if (!hasClaimRole && !hasScopedRole) {
      const redirectUrl = req.nextUrl.clone()
      redirectUrl.pathname = defaultRoute(role)
      return NextResponse.redirect(redirectUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/rc-admin/:path*',
    '/scoring/:path*',
    '/race-control/:path*',
    '/super-admin/:path*',
    '/jury/:path*',
    '/race-director/:path*',
    '/jc/:path*',
    '/mc/:path*',
    '/draw',
    '/draw/:path*',
  ],
}
