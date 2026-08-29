'use server'

import { adminClient, authClient } from '../lib/auth'
import { normalizeAppRole } from '../lib/roles'
import { LRUCache } from 'lru-cache'
import type { User } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const userCache = new LRUCache<string, User>({ max: 500, ttl: 60000 })
const rolesCache = new LRUCache<string, string[]>({ max: 500, ttl: 60000 })

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

const roleWeight = (role: string) => {
  if (role === 'SUPER_ADMIN') return 0
  if (role === 'ADMIN') return 1
  if (role === 'RACE_DIRECTOR') return 2
  if (role === 'RACE_CONTROL') return 3
  if (role === 'CHECKER') return 4
  if (role === 'FINISHER') return 5
  if (role === 'MC') return 6
  return 99
}

const normalizeAllowedRoles = (allowed: string[]) =>
  allowed.map((role) => normalizeAppRole(legacyMap(role) ?? '')).filter(Boolean)

const getScopedRoles = async (userId: string, eventId: string) => {
  const cacheKey = `${userId}:${eventId}`
  const cached = rolesCache.get(cacheKey)
  if (cached) return cached

  const { data, error } = await adminClient
    .from('user_event_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('is_active', true)

  if (error || !data?.length) return []

  const roles = data
    .map((row) => normalizeAppRole(typeof row.role === 'string' ? row.role : ''))
    .filter(Boolean)
    .sort((a, b) => roleWeight(a) - roleWeight(b))
    
  rolesCache.set(cacheKey, roles)
  return roles
}

const getAnyScopedRole = async (userId: string, allowedRoles: string[]) => {
  const { data, error } = await adminClient
    .from('user_event_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error || !data?.length) return null

  return data
    .map((row) => normalizeAppRole(typeof row.role === 'string' ? row.role : ''))
    .filter((role) => Boolean(role) && allowedRoles.includes(role))
    .sort((a, b) => roleWeight(a) - roleWeight(b))[0] ?? null
}

export async function getAccessibleEventIds(userId: string, allowed: string[]) {
  const scopedRoles = normalizeAllowedRoles(allowed)
  const { data, error } = await adminClient
    .from('user_event_roles')
    .select('event_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error || !data?.length) return null

  const filtered = data.filter((row) => {
    const role = normalizeAppRole(typeof row.role === 'string' ? row.role : '')
    return scopedRoles.includes(role)
  })

  if (!filtered.length) return []
  return Array.from(new Set(filtered.map((row) => row.event_id)))
}

export async function requireJury(req: Request, allowed: string[], eventId?: string | null) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 500, error: 'Supabase env belum lengkap.' }
  }
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return { ok: false as const, status: 401, error: 'Unauthorized' }

  let user = userCache.get(token)
  if (!user) {
    const { data, error } = await authClient.auth.getUser(token)
    if (error || !data?.user) return { ok: false as const, status: 401, error: 'Unauthorized' }
    user = data.user
    userCache.set(token, user)
  }

  const allowedRoles = normalizeAllowedRoles(allowed)
  const globalRole = normalizeAppRole(legacyMap(getRole(user)) ?? '')
  let role: string | null = globalRole || null
  let eventRole: string | null = null

  if (eventId) {
    const scopedRoles = await getScopedRoles(user.id, eventId)
    const scopedRole = scopedRoles[0]
    if (scopedRole) {
      eventRole = scopedRole
      role = eventRole
    }
  } else if (!role) {
    // Crew accounts commonly receive their permission from an event assignment,
    // not from immutable user metadata. The event list is the first Jury request.
    role = await getAnyScopedRole(user.id, allowedRoles)
  }

  if (!role || !allowedRoles.includes(role)) return { ok: false as const, status: 403, error: 'Forbidden' }

  return { ok: true as const, user, role, eventRole }
}
