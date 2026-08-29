import { useCallback, useRef } from 'react'
import { supabase } from '@/src/lib/supabaseClient'

const readAccessTokenCookie = () => {
  if (typeof document === 'undefined') return null
  const entry = document.cookie.split('; ').find((item) => item.startsWith('sb-access-token='))
  return entry ? decodeURIComponent(entry.slice('sb-access-token='.length)) : null
}

export function useApiFetch() {
  const tokenRef = useRef<string | null>(null)

  const getToken = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && tokenRef.current) return tokenRef.current

    if (forceRefresh) {
      const { data } = await supabase.auth.refreshSession()
      tokenRef.current = data.session?.access_token ?? null
      if (tokenRef.current && typeof window !== 'undefined') {
        const secureCookie = window.location.protocol === 'https:' ? '; Secure' : ''
        const maxAge = data.session?.expires_in ?? 3600
        document.cookie = `sb-access-token=${encodeURIComponent(tokenRef.current)}; Path=/; Max-Age=${maxAge}${secureCookie}; SameSite=Lax`
      }
      return tokenRef.current
    }

    const { data } = await supabase.auth.getSession()
    tokenRef.current = data.session?.access_token ?? readAccessTokenCookie()
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
