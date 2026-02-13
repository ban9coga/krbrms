import { NextRequest, NextResponse } from 'next/server'

const PROTECTED_PATHS = ['/admin', '/scoring', '/race-control', '/super-admin', '/jury', '/race-director']

const ROLE_GUARDS: Record<string, string[]> = {
  '/admin/users': ['super_admin'],
  '/admin': ['admin', 'super_admin'],
  '/scoring': ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'],
  '/jury/start': ['CHECKER', 'RACE_DIRECTOR', 'super_admin'],
  '/jury/finish': ['FINISHER', 'RACE_DIRECTOR', 'super_admin'],
  '/jury': ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'],
  '/race-director': ['RACE_DIRECTOR', 'super_admin'],
  '/race-control': ['race_control', 'super_admin'],
  '/super-admin': ['super_admin'],
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

export function middleware(req: NextRequest) {
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
  const rawRole =
    payload?.user_metadata?.role ||
    payload?.app_metadata?.role ||
    payload?.role ||
    ''
  const role =
    rawRole === 'jury_start'
      ? 'CHECKER'
      : rawRole === 'jury_finish'
      ? 'FINISHER'
      : rawRole

  // Match the most specific guard first (longer path wins).
  const guardPath = Object.keys(ROLE_GUARDS)
    .sort((a, b) => b.length - a.length)
    .find((path) => pathname.startsWith(path))
  const defaultRoute = (r: string) => {
    if (r === 'RACE_DIRECTOR') return '/race-director/approval'
    if (r === 'FINISHER') return '/jury/finish'
    if (r === 'CHECKER') return '/jury/start'
    if (r === 'super_admin') return '/admin'
    if (r === 'admin') return '/admin'
    if (r === 'race_control') return '/race-control'
    return '/login'
  }

  if (guardPath) {
    const allowedRoles = ROLE_GUARDS[guardPath]
    if (!allowedRoles.includes(role)) {
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
    '/scoring/:path*',
    '/race-control/:path*',
    '/super-admin/:path*',
    '/jury/:path*',
    '/race-director/:path*',
  ],
}
