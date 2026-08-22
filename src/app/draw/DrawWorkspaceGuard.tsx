'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/src/lib/supabaseClient'

export default function DrawWorkspaceGuard({ children }: { children: ReactNode }) {
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    const verifySession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session?.access_token) {
        window.location.replace('/login')
        return
      }
      if (!cancelled) setSessionChecked(true)
    }

    void verifySession()
    return () => {
      cancelled = true
    }
  }, [])

  if (!sessionChecked) return null
  return <>{children}</>
}
