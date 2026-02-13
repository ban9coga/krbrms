'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
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
    const role =
      (typeof meta.role === 'string' ? meta.role : '') ||
      (typeof appMeta.role === 'string' ? appMeta.role : '') ||
      ''

    const normalized =
      role === 'jury_start' ? 'CHECKER' : role === 'jury_finish' ? 'FINISHER' : role

    const target =
      normalized === 'RACE_DIRECTOR'
        ? '/race-director/approval'
        : normalized === 'FINISHER'
        ? '/jury/finish'
        : normalized === 'CHECKER'
        ? '/jury/start'
        : normalized === 'race_control'
        ? '/race-control'
        : '/admin'

    window.location.href = target
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#eaf7ee',
        color: '#111',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: '#fff',
          border: '2px solid #111',
          borderRadius: '16px',
          padding: '24px',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/')}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            padding: '6px 10px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            border: '2px solid #111',
            borderRadius: '999px',
            cursor: 'pointer',
            fontWeight: 800,
          }}
          aria-label="Kembali ke landing"
        >
          Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: '2px solid #111',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              background: '#eaf7ee',
            }}
          >
            KRB
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>KRB Race Management</div>
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Login</h1>
        <p style={{ color: '#333', marginBottom: '18px' }}>
          Masuk untuk admin, juri, atau race control.
        </p>
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: '12px' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            name="email"
            id="login-email"
            autoComplete="username"
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: '2px solid #111',
              background: '#fff',
              color: '#111',
              boxSizing: 'border-box',
            }}
            required
          />
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              name="password"
              id="login-password"
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '12px 64px 12px 12px',
                borderRadius: '10px',
                border: '2px solid #111',
                background: '#fff',
                color: '#111',
                boxSizing: 'border-box',
              }}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                border: '2px solid #111',
                background: '#fff',
                borderRadius: 8,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
              aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {errorMessage && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '2px solid #e74c3c',
                background: '#fff5f5',
                color: '#c0392b',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {errorMessage}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: '#2ecc71',
              color: '#111',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Memproses...' : 'LOGIN'}
          </button>
        </form>
      </div>
    </div>
  )
}


