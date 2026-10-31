'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/src/lib/supabaseClient'

type PublicLiveScoreSignal = {
  event_id?: string
  category_id?: string
}

type UsePublicLiveScoreRealtimeOptions = {
  eventId: string
  categoryId: string
  enabled?: boolean
  refreshOnVisible?: boolean
  onScoreChanged: () => void
  debounceMs?: number
}

export function usePublicLiveScoreRealtime({
  eventId,
  categoryId,
  enabled = true,
  refreshOnVisible = false,
  onScoreChanged,
  debounceMs = 600,
}: UsePublicLiveScoreRealtimeOptions) {
  const callbackRef = useRef(onScoreChanged)

  useEffect(() => {
    callbackRef.current = onScoreChanged
  }, [onScoreChanged])

  useEffect(() => {
    if (!eventId || !categoryId || !enabled) return

    let disposed = false
    let timer: number | null = null
    const refreshWhenVisible = () => {
      if (refreshOnVisible && document.visibilityState === 'visible') callbackRef.current()
    }
    const channel = supabase
      .channel(`public-live-score:event:${eventId}:category:${categoryId}`, {
        config: { private: false },
      })
      .on('broadcast', { event: 'score_changed' }, ({ payload }) => {
        const signal = (payload ?? {}) as PublicLiveScoreSignal
        if (signal.event_id !== eventId || signal.category_id !== categoryId) return
        if (document.visibilityState !== 'visible') return

        if (timer !== null) window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          timer = null
          if (!disposed) callbackRef.current()
        }, debounceMs)
      })
      .subscribe()
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      disposed = true
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      void supabase.removeChannel(channel)
    }
  }, [categoryId, debounceMs, enabled, eventId, refreshOnVisible])
}
