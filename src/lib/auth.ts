import { createClient } from '@supabase/supabase-js'
import { isEventAdminRole, normalizeAppRole } from './roles'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const adminClient = createClient(supabaseUrl, supabaseServiceKey)
const authClient = createClient(supabaseUrl, supabaseAnonKey)

type AuthSuccess = {
  ok: true
  user: Awaited<ReturnType<typeof authClient.auth.getUser>>['data']['user']
  role: string
  eventRole: string | null
}

type AuthFailure = { ok: false }

const getAuthenticatedUser = async (authHeader?: string | null) => {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

const getGlobalRole = (user: NonNullable<Awaited<ReturnType<typeof authClient.auth.getUser>>['data']['user']>) => {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
  const role =
    (typeof meta.role === 'string' ? meta.role : null) ||
    (typeof appMeta.role === 'string' ? appMeta.role : null)
  return normalizeAppRole(role)
}

const getEventRole = async (userId: string, eventId?: string | null) => {
  if (!eventId) return null
  const { data, error } = await adminClient
    .from('user_event_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('is_active', true)

  if (error || !data?.length) return null

  const prioritized = data
    .map((row) => normalizeAppRole(typeof row.role === 'string' ? row.role : ''))
    .filter(Boolean)
    .sort((a, b) => {
      const weight = (role: string) => {
        if (role === 'SUPER_ADMIN') return 0
        if (role === 'ADMIN') return 1
        if (role === 'RACE_DIRECTOR') return 2
        if (role === 'RACE_CONTROL') return 3
        if (role === 'CHECKER') return 4
        if (role === 'FINISHER') return 5
        if (role === 'MC') return 6
        return 99
      }
      return weight(a) - weight(b)
    })

  return prioritized[0] ?? null
}

export const requireAdmin = async (authHeader?: string | null, eventId?: string | null): Promise<AuthSuccess | AuthFailure> => {
  const user = await getAuthenticatedUser(authHeader)
  if (!user) return { ok: false }
  const globalRole = getGlobalRole(user)
  const eventRole = await getEventRole(user.id, eventId)
  const effectiveRole = eventRole || globalRole
  if (!isEventAdminRole(effectiveRole)) return { ok: false }
  return { ok: true, user, role: effectiveRole, eventRole }
}

export const requireEventRole = async (
  authHeader: string | null | undefined,
  eventId: string,
  allowedRoles: string[]
): Promise<AuthSuccess | AuthFailure> => {
  const user = await getAuthenticatedUser(authHeader)
  if (!user) return { ok: false }
  const globalRole = getGlobalRole(user)
  const eventRole = await getEventRole(user.id, eventId)
  const effectiveRole = eventRole || globalRole
  const allowed = allowedRoles.map((role) => normalizeAppRole(role))
  if (!allowed.includes(effectiveRole)) return { ok: false }
  return { ok: true, user, role: effectiveRole, eventRole }
}
