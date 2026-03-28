'use client'

import Link from 'next/link'
import { useState } from 'react'
import MarketingTopbar from '../../components/MarketingTopbar'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const normalizeRole = (value: string) => {
    const upper = value.toUpperCase()
    if (upper === 'JURY_START') return 'CHECKER'
    if (upper === 'JURY_FINISH') return 'FINISHER'
    return upper
  }

  const roleHome = (role: string) => {
    if (role === 'RACE_DIRECTOR') return '/race-director/approval'
    if (role === 'FINISHER') return '/jury/finish'
    if (role === 'CHECKER') return '/jc'
    if (role === 'RACE_CONTROL') return '/race-control'
    if (role === 'MC') return '/mc'
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return '/admin'
    return '/dashboard'
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setErrorMessage('Login gagal: ' + error.message)
      return
    }

    const accessToken = data.session?.access_token
    if (accessToken) {
      const maxAge = data.session?.expires_in ?? 3600
      document.cookie = `sb-access-token=${encodeURIComponent(accessToken)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`
    }

    const user = data.user
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
    const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
    const role = (typeof meta.role === 'string' ? meta.role : '') || (typeof appMeta.role === 'string' ? appMeta.role : '') || ''
    const target = roleHome(normalizeRole(role))

    window.location.href = target
  }

  return (
    <div className="public-page">
      <MarketingTopbar showNav={false} />
      <main className="mx-auto flex min-h-[calc(100vh-86px)] w-full max-w-[1200px] items-center justify-center px-4 py-8 sm:px-6">
        <section className="w-full max-w-[460px] rounded-[1.6rem] border border-slate-200 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.12)] sm:p-6">
          <div className="mb-5 grid gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-500">Staff Access</p>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Login Dashboard</h1>
            <p className="text-sm font-semibold text-slate-600">
              Masuk untuk admin, jury, race director, dan race control.
            </p>
          </div>

          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/platform-logo.png"
                alt="Platform Logo"
                className="h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain p-1"
              />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">PRM Platform</p>
                <p className="text-lg font-black tracking-tight text-slate-900">Secure Login</p>
              </div>
            </div>
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-600 transition-colors hover:bg-slate-100"
            >
              Back
            </Link>
          </div>

          <form onSubmit={handleLogin} className="grid gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              name="email"
              id="login-email"
              autoComplete="username"
              className="public-filter"
              required
            />
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                name="password"
                id="login-password"
                autoComplete="current-password"
                className="public-filter pr-20"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-600 transition-colors hover:bg-slate-100"
                aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200"
            >
              {loading ? 'Memproses...' : 'Login'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
