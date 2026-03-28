'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { formatAppRoleLabel, normalizeAppRole } from '../lib/roles'
import { supabase } from '../lib/supabaseClient'

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

export default function CheckerTopbar({ title = 'Checker Control' }: CheckerTopbarProps) {
  const router = useRouter()
  const [name, setName] = useState('User')
  const [roleKey, setRoleKey] = useState('')

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) return
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
      const rawRole =
        (typeof meta.role === 'string' ? meta.role : '') ||
        (typeof appMeta.role === 'string' ? appMeta.role : '') ||
        ''
      setName(displayName(user))
      setRoleKey(rawRole)
    }
    loadUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="w-full px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href={roleHomeHref(roleKey)} className="flex min-w-0 items-center gap-3">
            <img
              src="/platform-logo.png"
              alt="Platform Logo"
              className="h-10 w-10 object-contain"
            />
            <div className="min-w-0">
              <div className="truncate text-base font-black tracking-tight text-slate-900">{title}</div>
              <div className="truncate text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Pushbike Race Management Platform
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-right">
              <div className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">{formatAppRoleLabel(roleKey)}</div>
              <div className="max-w-[140px] truncate text-sm font-bold text-slate-900 sm:max-w-[220px]">{name}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-300"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
