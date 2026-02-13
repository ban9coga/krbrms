'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)

    if (error) {
      alert('Login gagal: ' + error.message)
      return
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

    if (normalized === 'RACE_DIRECTOR') {
      router.push('/race-director/approval')
    } else if (normalized === 'FINISHER') {
      router.push('/jury/finish')
    } else if (normalized === 'CHECKER') {
      router.push('/jury/start')
    } else if (normalized === 'super_admin') {
      router.push('/admin')
    } else if (normalized === 'admin') {
      router.push('/admin')
    } else if (normalized === 'race_control') {
      router.push('/race-control')
    } else {
      router.push('/admin')
    }
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
            width: '36px',
            height: '36px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            border: '2px solid #111',
            borderRadius: '999px',
            cursor: 'pointer',
          }}
          aria-label="Kembali ke landing"
        >
          ←
        </button>
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
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: '2px solid #111',
              background: '#fff',
              color: '#111',
            }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: '2px solid #111',
              background: '#fff',
              color: '#111',
            }}
            required
          />
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


