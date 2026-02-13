import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const adminClient = createClient(supabaseUrl, supabaseServiceKey)
const authClient = createClient(supabaseUrl, supabaseAnonKey)

export const requireAdmin = async (authHeader?: string | null) => {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const }
  const token = authHeader.replace('Bearer ', '')
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return { ok: false as const }
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (data.user.app_metadata ?? {}) as Record<string, unknown>
  const role =
    (typeof meta.role === 'string' ? meta.role : null) ||
    (typeof appMeta.role === 'string' ? appMeta.role : null)
  if (role !== 'admin' && role !== 'super_admin') return { ok: false as const }
  return { ok: true as const, user: data.user }
}
