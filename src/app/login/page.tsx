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
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const reason = new URLSearchParams(window.location.search).get('error')
    if (reason === 'backoffice_access') {
      return 'Akun ini belum punya akses menu yang diminta. Pastikan role dan assignment event sudah aktif.'
    }
    if (reason === 'session_expired') return 'Session habis. Silakan login ulang.'
    return null
  })

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
    if (role === 'REGISTRATION_APPROVER') return '/admin/events'
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
    const refreshToken = data.session?.refresh_token
    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
    }
    if (accessToken) {
      const maxAge = data.session?.expires_in ?? 3600
      const secureCookie = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `sb-access-token=${encodeURIComponent(accessToken)}; Path=/; Max-Age=${maxAge}${secureCookie}; SameSite=Lax`
    }

    if (accessToken) {
      try {
        const accessRes = await fetch('/api/auth/backoffice-access', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        const accessJson = await accessRes.json().catch(() => ({}))
        if (accessRes.ok) {
          const backofficeHome = typeof accessJson?.data?.home === 'string' ? accessJson.data.home : '/admin'
          window.location.href = backofficeHome
          return
        }
        if (accessRes.status !== 403) {
          const message =
            typeof accessJson?.error === 'string'
              ? accessJson.error
              : 'Login berhasil, tapi akses panel gagal dimuat. Coba refresh atau login ulang.'
          setErrorMessage(`Login berhasil, tapi akses panel gagal: ${message}`)
          return
        }
      } catch {
        // Fall back to metadata-based routing below.
      }
    }

    const user = data.user
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
    const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
    const role = (typeof meta.role === 'string' ? meta.role : '') || (typeof appMeta.role === 'string' ? appMeta.role : '') || ''
    const target = roleHome(normalizeRole(role))

    window.location.href = target
  }

  return (
    <div className="public-page homepage-editorial-page login-editorial-page">
      <MarketingTopbar showNav={false} variant="editorial" />
      <main className="login-editorial-main">
        <section className="login-editorial-shell">
          <div className="login-editorial-story">
            <p className="login-editorial-kicker">Race operations portal</p>
            <h1>
              Satu akses untuk
              <mark> race day.</mark>
            </h1>
            <p>
              Kelola event, alur jury, race control, scoring, dan hasil pertandingan dari dashboard
              RacePushbike.
            </p>
            <div className="login-editorial-role-list" aria-label="Akses pengguna">
              <span>Admin</span>
              <span>Checker</span>
              <span>Finisher</span>
              <span>Race Director</span>
            </div>
          </div>

          <div className="login-editorial-card">
            <div className="login-editorial-card-head">
              <div className="flex items-center gap-3">
                <img src="/platform-logo.png" alt="Platform Logo" className="h-12 w-12 object-contain" />
                <div>
                  <p className="login-editorial-card-kicker">Staff access</p>
                  <h2>Login Dashboard</h2>
                </div>
              </div>
              <Link href="/" className="login-editorial-back">
                Kembali
              </Link>
            </div>

            <p className="login-editorial-intro">
              Masukkan akun yang telah terdaftar untuk melanjutkan ke panel operasional.
            </p>

            <form onSubmit={handleLogin} className="login-editorial-form">
              <label htmlFor="login-email">Email</label>
              <input
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                name="email"
                id="login-email"
                autoComplete="username"
                className="login-editorial-input"
                required
              />

              <label htmlFor="login-password">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  name="password"
                  id="login-password"
                  autoComplete="current-password"
                  className="login-editorial-input w-full pr-20"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="login-editorial-password-toggle"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {errorMessage && <div className="login-editorial-error">{errorMessage}</div>}

              <button type="submit" disabled={loading} className="login-editorial-submit">
                {loading ? 'Memproses...' : 'Login'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}
