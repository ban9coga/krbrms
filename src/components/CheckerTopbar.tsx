'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { formatAppRoleLabel, normalizeAppRole } from '../lib/roles'
import { supabase } from '@/src/lib/supabaseClient'
import LogoutButton from './LogoutButton'

type CheckerTopbarProps = {
  title?: string
}

const roleHomeHref = (value: string) => {
  const role = normalizeAppRole(value)
  if (role === 'FINISHER') return '/jury/finish'
  if (role === 'RACE_DIRECTOR') return '/race-director/approval'
  if (role === 'RACE_CONTROL') return '/race-control'
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return '/admin'
  return '/jc'
}

const displayName = (user: {
  email?: string | null
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
}) => {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
  const explicitName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (typeof appMeta.name === 'string' && appMeta.name.trim())
  if (explicitName) return explicitName
  if (typeof user.email === 'string' && user.email.includes('@')) return user.email.split('@')[0]
  return 'User'
}

const readAccessTokenCookie = () => {
  const entry = document.cookie.split('; ').find((item) => item.startsWith('sb-access-token='))
  return entry ? decodeURIComponent(entry.slice('sb-access-token='.length)) : null
}

export default function CheckerTopbar({ title = 'Checker Control' }: CheckerTopbarProps) {
  const router = useRouter()
  const [name, setName] = useState('User')
  const [roleKey, setRoleKey] = useState('')

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token ?? readAccessTokenCookie()
      let user = data.session?.user ?? null
      if (!user && token) {
        const { data: tokenUserData } = await supabase.auth.getUser(token)
        user = tokenUserData.user
      }
      if (!user) return
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
      let rawRole =
        (typeof meta.role === 'string' ? meta.role : '') ||
        (typeof appMeta.role === 'string' ? appMeta.role : '') ||
        ''

      if (token) {
        try {
          const accessResponse = await fetch('/api/auth/backoffice-access', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          })
          const accessJson = await accessResponse.json().catch(() => ({}))
          if (accessResponse.ok && typeof accessJson?.data?.role === 'string') {
            rawRole = accessJson.data.role
          }
        } catch {
          // Keep the metadata role when the access lookup is temporarily offline.
        }
      }

      setName(displayName(user))
      setRoleKey(rawRole)
    }
    void loadUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="w-full px-4 py-3 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href={roleHomeHref(roleKey)} className="flex min-w-0 items-center gap-3">
            <Image
              src="/platform-logo.png"
              alt="Platform Logo"
              width={40}
              height={40}
              className="h-9 w-9 flex-shrink-0 object-contain sm:h-10 sm:w-10"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-black tracking-tight text-slate-900 sm:text-base">{title}</div>
              <div className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Pushbike Race Management Platform
              </div>
            </div>
          </Link>

          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-end sm:gap-3">
            <div className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left sm:max-w-[260px] sm:flex-none sm:text-right">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500">{formatAppRoleLabel(roleKey)}</div>
              <div className="truncate text-sm font-bold text-slate-900">{name}</div>
            </div>
            <LogoutButton onClick={handleLogout} />
          </div>
        </div>
      </div>
    </header>
  )
}
