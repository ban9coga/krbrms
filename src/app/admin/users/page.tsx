'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatAppRoleLabel } from '../../../lib/roles'
import { supabase } from '../../../lib/supabaseClient'

type RoleType =
  | 'admin'
  | 'jury'
  | 'race_control'
  | 'super_admin'
  | 'CHECKER'
  | 'FINISHER'
  | 'RACE_DIRECTOR'
  | 'MC'

type UserRow = {
  id: string
  email: string | null
  created_at: string | null
  last_sign_in_at: string | null
  user_metadata?: Record<string, unknown> | null
  app_metadata?: Record<string, unknown> | null
}

const inputClass =
  'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-300/30'

const buttonClass =
  'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] transition-colors'

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
      setIsSuperAdmin(String(userRole).toLowerCase() === 'super_admin')
    }
    void checkRole()
  }, [])

  const loadUsers = useCallback(async (nextPage = page) => {
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
  }, [page])

  useEffect(() => {
    if (isSuperAdmin) void loadUsers(page)
  }, [isSuperAdmin, page, loadUsers])

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
    await loadUsers(1)
    setPage(1)
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [total, perPage])

  if (!isSuperAdmin) {
    return (
      <div className="grid w-full max-w-[760px] gap-4">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black tracking-tight text-slate-50">Users / Roles</h1>
          <p className="text-sm font-semibold text-slate-300">Akses halaman ini hanya untuk Central Admin.</p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-700 bg-slate-900/75 p-5 text-sm font-semibold text-slate-300 shadow-[0_20px_44px_rgba(2,6,23,0.26)]">
          Akses ditolak.
        </div>
      </div>
    )
  }

  return (
    <div className="grid w-full max-w-[1180px] gap-5">
      <div className="grid gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-50">Users / Roles</h1>
        <p className="max-w-3xl text-sm font-semibold text-slate-300">
          Kelola akun Central Admin, Operator Admin, dan field operator. Halaman ini sudah disusun supaya
          tetap nyaman dipakai dari tablet atau smartphone.
        </p>
      </div>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.12)] sm:p-6">
        <div className="mb-4 grid gap-1">
          <h2 className="text-xl font-black tracking-tight text-slate-900">Create User</h2>
          <p className="text-sm font-semibold text-slate-500">Buat akun baru lalu assign ke event dari halaman settings event.</p>
        </div>

        <form onSubmit={handleCreateUser} className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Email</span>
            <input
              type="email"
              placeholder="operator@event.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Password</span>
            <input
              type="password"
              placeholder="Minimal untuk operasional"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Role Global</span>
            <select value={role} onChange={(e) => setRole(e.target.value as RoleType)} className={inputClass}>
              <option value="admin">Operator Admin</option>
              <option value="race_control">Race Control</option>
              <option value="CHECKER">Checker</option>
              <option value="FINISHER">Finisher</option>
              <option value="RACE_DIRECTOR">Race Director</option>
              <option value="MC">MC</option>
            </select>
          </label>

          <div className="grid gap-2">
            <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-transparent">Action</span>
            <button
              type="submit"
              disabled={loading}
              className={`${buttonClass} border border-amber-300 bg-amber-400 text-slate-900 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {loading ? 'Membuat...' : 'Buat Akun'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-[1.5rem] border border-slate-700 bg-slate-900/75 p-4 shadow-[0_20px_44px_rgba(2,6,23,0.26)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <h2 className="text-xl font-black tracking-tight text-slate-50">User List</h2>
            <p className="text-sm font-semibold text-slate-300">
              Role global tetap ada untuk transisi, tapi operasional event sebaiknya diatur lewat assignment per event.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers(page)}
            disabled={listLoading}
            className={`${buttonClass} border border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {listLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          {users.length === 0 && !listLoading && (
            <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/40 p-4 text-sm font-semibold text-slate-300">
              Belum ada user.
            </div>
          )}

          {users.map((u) => {
            const meta = (u.user_metadata ?? {}) as Record<string, unknown>
            const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>
            const currentRole =
              (typeof meta.role === 'string' ? meta.role : null) ||
              (typeof appMeta.role === 'string' ? appMeta.role : null) ||
              'viewer'

            return (
              <article
                key={u.id}
                className="grid gap-4 rounded-[1.35rem] border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="grid gap-1">
                    <div className="text-base font-black tracking-tight text-slate-900">{u.email ?? u.id}</div>
                    <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-600">
                      {formatAppRoleLabel(currentRole)}
                    </div>
                  </div>
                  <div className="grid gap-1 text-xs font-semibold text-slate-500 md:text-right">
                    <div>Created: {u.created_at ? new Date(u.created_at).toLocaleString() : '-'}</div>
                    <div>Last Sign In: {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : '-'}</div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_auto_auto] md:items-end">
                  <label className="grid gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Role</span>
                    <select
                      value={currentRole}
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
                      className={inputClass}
                    >
                      <option value="super_admin">Central Admin</option>
                      <option value="admin">Operator Admin</option>
                      <option value="race_control">Race Control</option>
                      <option value="CHECKER">Checker</option>
                      <option value="FINISHER">Finisher</option>
                      <option value="RACE_DIRECTOR">Race Director</option>
                      <option value="MC">MC</option>
                    </select>
                  </label>

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
                          body: JSON.stringify({ role: ((u.user_metadata as Record<string, unknown>)?.role ?? currentRole) as string }),
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
                    className={`${buttonClass} border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60`}
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
                    className={`${buttonClass} border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/45 px-4 py-3 text-slate-100 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={`${buttonClass} border border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45`}
          >
            Prev
          </button>
          <div className="text-center text-sm font-extrabold uppercase tracking-[0.12em] text-slate-200">
            Page {page} / {totalPages}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className={`${buttonClass} border border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45`}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  )
}
