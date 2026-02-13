'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import AdminEventsPage from './events/page'
import { supabase } from '../../lib/supabaseClient'

export default function AdminDashboardPage() {
  const [email, setEmail] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      setEmail(user?.email ?? null)
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
      const metaRole = typeof meta.role === 'string' ? meta.role : null
      const appRole = typeof appMeta.role === 'string' ? appMeta.role : null
      setRole(metaRole || appRole || null)
    }
    load()
  }, [])

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 28, fontWeight: 950, margin: 0 }}>Admin Dashboard</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        {email ? `Signed in as ${email}` : 'Signed in'} {role ? `• role: ${role}` : ''}
      </div>

      <div style={{ marginTop: 24 }}>
        <AdminEventsPage showCreate={false} />
      </div>
    </div>
  )
}
