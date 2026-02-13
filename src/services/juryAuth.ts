'use server'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const authClient = createClient(supabaseUrl, supabaseAnonKey)

const getRole = (user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) => {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
  return (typeof meta.role === 'string' ? meta.role : null) || (typeof appMeta.role === 'string' ? appMeta.role : null)
}

const legacyMap = (role: string | null) => {
  if (role === 'jury_start') return 'CHECKER'
  if (role === 'jury_finish') return 'FINISHER'
  return role
}

export async function requireJury(req: Request, allowed: string[]) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 500, error: 'Supabase env belum lengkap.' }
  }
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return { ok: false as const, status: 401, error: 'Unauthorized' }

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return { ok: false as const, status: 401, error: 'Unauthorized' }

  const roleRaw = getRole(data.user)
  const role = legacyMap(roleRaw)
  if (!role || !allowed.includes(role)) return { ok: false as const, status: 403, error: 'Forbidden' }

  return { ok: true as const, user: data.user, role }
}
