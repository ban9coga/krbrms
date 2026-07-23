import { useCallback, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useApiFetch() {
  const tokenRef = useRef<string | null>(null)

  const getToken = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && tokenRef.current) return tokenRef.current
    const { data } = await supabase.auth.getSession()
    if (!data.session?.access_token) return null
    tokenRef.current = data.session.access_token
    return tokenRef.current
  }, [])

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}, retryUnauthorized = true) => {
      let token = await getToken()
      
      const headers: Record<string, string> = {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...((options.headers ?? {}) as Record<string, string>),
      }
      
      if (token) headers.Authorization = `Bearer ${token}`
      
      let res = await fetch(url, { ...options, headers })
      
      if (res.status === 401 && retryUnauthorized) {
        token = await getToken(true) // Force refresh on 401
        if (token) headers.Authorization = `Bearer ${token}`
        res = await fetch(url, { ...options, headers })
      }
      
      const json = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Session login habis. Silakan login ulang.')
        }
        throw new Error(json?.error || 'Request failed')
      }
      
      return json
    },
    [getToken]
  )

  return apiFetch
}
