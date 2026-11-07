'use client'

import { useEffect, useRef } from 'react'
import { useApiFetch } from './useApiFetch'
import { usePageVisibility } from '../lib/usePageVisibility'

type UseJuryHeartbeatOptions = {
  eventId?: string | null
  motoId?: string | null
  motoName?: string | null
  enabled?: boolean
  intervalMs?: number
}

export function useJuryHeartbeat({
  eventId,
  motoId,
  motoName,
  enabled = true,
  intervalMs = 25000,
}: UseJuryHeartbeatOptions) {
  const apiFetch = useApiFetch()
  const isPageVisible = usePageVisibility()
  const latestParamsRef = useRef({ eventId, motoId, motoName })

  useEffect(() => {
    latestParamsRef.current = { eventId, motoId, motoName }
  }, [eventId, motoId, motoName])

  useEffect(() => {
    if (!eventId || !enabled || !isPageVisible) return

    let disposed = false

    const sendPing = async () => {
      if (disposed) return
      const current = latestParamsRef.current
      if (!current.eventId) return

      try {
        await apiFetch('/api/jury/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: current.eventId,
            motoId: current.motoId ?? null,
            motoName: current.motoName ?? null,
            pageUrl: typeof window !== 'undefined' ? window.location.pathname : null,
          }),
        })
      } catch {
        // Silently catch background heartbeat errors
      }
    }

    // Immediate ping on mount / when becoming visible
    void sendPing()

    const timer = window.setInterval(() => {
      void sendPing()
    }, intervalMs)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [apiFetch, enabled, eventId, intervalMs, isPageVisible])

  // Also ping immediately whenever motoId changes
  useEffect(() => {
    if (!eventId || !enabled || !isPageVisible || !motoId) return
    const current = latestParamsRef.current

    void apiFetch('/api/jury/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        motoId,
        motoName: current.motoName ?? null,
        pageUrl: typeof window !== 'undefined' ? window.location.pathname : null,
      }),
    }).catch(() => null)
  }, [apiFetch, enabled, eventId, isPageVisible, motoId])
}

