'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type RoleType = 'admin' | 'jury' | 'race_control' | 'super_admin' | 'CHECKER' | 'FINISHER' | 'RACE_DIRECTOR'

type UserRow = {
  id: string
  email: string | null
  created_at: string | null
  last_sign_in_at: string | null
  user_metadata?: Record<string, unknown> | null
  app_metadata?: Record<string, unknown> | null
}

export default function AdminUsersPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<RoleType>('admin')
  const [loading, setLoading] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [page, setPage] = useState(1)
  const perPage = 25
  const [total, setTotal] = useState(0)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  useEffect(() => {
    const checkRole = async () => {
      const { data } = await supabase.auth.getUser()
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (data.user?.app_metadata ?? {}) as Record<string, unknown>
      const userRole =
        (typeof meta.role === 'string' ? meta.role : null) ||
        (typeof appMeta.role === 'string' ? appMeta.role : null)
      setIsSuperAdmin(userRole === 'super_admin')
    }
    checkRole()
  }, [])

  const loadUsers = async (nextPage = page) => {
    setListLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return
      const qs = new URLSearchParams({ page: String(nextPage), per_page: String(perPage) })
      const res = await fetch(`/api/super-admin/list-users?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Gagal memuat users')
      setUsers(json.data ?? [])
      setTotal(Number(json.total ?? 0))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memuat users')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) loadUsers(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, page])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setLoading(false)
      alert('Session tidak ditemukan. Silakan login ulang.')
      return
    }

    const res = await fetch('/api/super-admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email, password, role }),
    })

    const result = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      alert('Gagal membuat user: ' + (result?.error ?? 'Unknown error'))
      return
    }

    alert('Akun berhasil dibuat.')
    setEmail('')
    setPassword('')
    setRole('admin')
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ maxWidth: 680 }}>
        <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Users / Roles</h1>
        <p style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>Akses ditolak.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Users / Roles</h1>
      <p style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Buat akun untuk admin, juri, atau race control.
      </p>

      <div
        style={{
          marginTop: 16,
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: '2px solid #111',
              background: '#fff',
              color: '#111',
              fontWeight: 800,
            }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: '2px solid #111',
              background: '#fff',
              color: '#111',
              fontWeight: 800,
            }}
            required
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleType)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: '2px solid #111',
              background: '#fff',
              color: '#111',
              fontWeight: 900,
            }}
          >
            <option value="admin">Admin</option>
            <option value="race_control">Race Control</option>
            <option value="CHECKER">Checker (Jury Start)</option>
            <option value="FINISHER">Finisher (Jury Finish)</option>
            <option value="RACE_DIRECTOR">Race Director</option>
          </select>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: 14,
              borderRadius: 14,
              border: '2px solid #111',
              background: '#2ecc71',
              color: '#111',
              fontWeight: 950,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Membuat...' : 'BUAT AKUN'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 900 }}>User List</div>
        <button
          type="button"
          onClick={() => loadUsers(page)}
          disabled={listLoading}
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#fff',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          {listLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {users.length === 0 && !listLoading && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Belum ada user.
          </div>
        )}

        {users.map((u) => {
          const meta = (u.user_metadata ?? {}) as Record<string, unknown>
          const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>
          const role =
            (typeof meta.role === 'string' ? meta.role : null) ||
            (typeof appMeta.role === 'string' ? appMeta.role : null) ||
            'viewer'
          return (
            <div
              key={u.id}
              style={{
                padding: 12,
                borderRadius: 14,
                border: '2px solid #111',
                background: '#fff',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 900 }}>{u.email ?? u.id}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>Role</div>
                <select
                  value={role}
                  onChange={(e) => {
                    const next = e.target.value as RoleType
                    setUsers((prev) =>
                      prev.map((item) =>
                        item.id === u.id
                          ? {
                              ...item,
                              user_metadata: { ...(item.user_metadata ?? {}), role: next },
                            }
                          : item
                      )
                    )
                  }}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    fontWeight: 900,
                  }}
                >
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="race_control">Race Control</option>
                  <option value="CHECKER">Checker</option>
                  <option value="FINISHER">Finisher</option>
                  <option value="RACE_DIRECTOR">Race Director</option>
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    setSavingUserId(u.id)
                    try {
                      const { data: sessionData } = await supabase.auth.getSession()
                      const token = sessionData.session?.access_token
                      if (!token) throw new Error('Session tidak ditemukan')
                      const res = await fetch(`/api/super-admin/users/${u.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ role: (u.user_metadata as Record<string, unknown>)?.role ?? role }),
                      })
                      const json = await res.json().catch(() => ({}))
                      if (!res.ok) throw new Error(json?.error || 'Gagal update role')
                      await loadUsers(page)
                    } catch (err: unknown) {
                      alert(err instanceof Error ? err.message : 'Gagal update role')
                    } finally {
                      setSavingUserId(null)
                    }
                  }}
                  disabled={savingUserId === u.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#2ecc71',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {savingUserId === u.id ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Hapus user ini?')) return
                    setDeletingUserId(u.id)
                    try {
                      const { data: sessionData } = await supabase.auth.getSession()
                      const token = sessionData.session?.access_token
                      if (!token) throw new Error('Session tidak ditemukan')
                      const res = await fetch(`/api/super-admin/users/${u.id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` },
                      })
                      const json = await res.json().catch(() => ({}))
                      if (!res.ok) throw new Error(json?.error || 'Gagal hapus user')
                      await loadUsers(page)
                    } catch (err: unknown) {
                      alert(err instanceof Error ? err.message : 'Gagal hapus user')
                    } finally {
                      setDeletingUserId(null)
                    }
                  }}
                  disabled={deletingUserId === u.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '2px solid #b40000',
                    background: '#ffd7d7',
                    color: '#b40000',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                Created: {u.created_at ? new Date(u.created_at).toLocaleString() : '-'}
              </div>
              <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                Last Sign In: {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : '-'}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: page <= 1 ? '#eee' : '#fff',
            fontWeight: 900,
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          Prev
        </button>
        <div style={{ fontWeight: 900 }}>
          Page {page} / {Math.max(1, Math.ceil(total / perPage))}
        </div>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= Math.max(1, Math.ceil(total / perPage))}
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: page >= Math.max(1, Math.ceil(total / perPage)) ? '#eee' : '#fff',
            fontWeight: 900,
            cursor: page >= Math.max(1, Math.ceil(total / perPage)) ? 'not-allowed' : 'pointer',
          }}
        >
          Next
        </button>
      </div>
    </div>
  )
}

