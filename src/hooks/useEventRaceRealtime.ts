'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/src/lib/supabaseClient'

type RaceStateSignal = {
  event_id?: string
  moto_id?: string | null
  table?: string
  operation?: 'INSERT' | 'UPDATE' | 'DELETE'
}

type UseEventRaceRealtimeOptions = {
  eventId: string
  enabled?: boolean
  onRaceStateChanged: (signal: RaceStateSignal) => void
  debounceMs?: number
}

const readAccessTokenCookie = () => {
  if (typeof document === 'undefined') return null
  const entry = document.cookie.split('; ').find((item) => item.startsWith('sb-access-token='))
  return entry ? decodeURIComponent(entry.slice('sb-access-token='.length)) : null
}

// Realtime only sends a tiny signal. Each screen decides how to refetch its
// existing protected data, which keeps Broadcast payloads small and reusable.
export function useEventRaceRealtime({
  eventId,
  enabled = true,
  onRaceStateChanged,
  debounceMs = 350,
}: UseEventRaceRealtimeOptions) {
  const callbackRef = useRef(onRaceStateChanged)
  const timerRef = useRef<number | null>(null)
  const latestSignalRef = useRef<RaceStateSignal | null>(null)

  useEffect(() => {
    callbackRef.current = onRaceStateChanged
  }, [onRaceStateChanged])

  useEffect(() => {
    if (!eventId || !enabled) return

    let disposed = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    const connect = async () => {
      let accessToken = readAccessTokenCookie()
      if (!accessToken) {
        const { data } = await supabase.auth.getSession()
        accessToken = data.session?.access_token ?? null
      }
      if (!accessToken || disposed) return

      await supabase.realtime.setAuth(accessToken)
      if (disposed) return

      channel = supabase
        .channel(`race:event:${eventId}`, { config: { private: true } })
        .on('broadcast', { event: 'race_state_changed' }, ({ payload }) => {
          const signal = (payload ?? {}) as RaceStateSignal
          if (signal.event_id !== eventId) return

          latestSignalRef.current = signal
          if (timerRef.current) window.clearTimeout(timerRef.current)
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null
            const latestSignal = latestSignalRef.current
            latestSignalRef.current = null
            if (latestSignal) callbackRef.current(latestSignal)
          }, debounceMs)
        })
        .subscribe()
    }

    void connect()

    return () => {
      disposed = true
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      latestSignalRef.current = null
      if (channel) void supabase.removeChannel(channel)
    }
  }, [debounceMs, enabled, eventId])
}
