'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

type LiveEntryButtonProps = {
  label: string
  mode: 'results' | 'display'
  className?: string
  activeClassName?: string
  fallbackHref?: string
  title?: string
  ariaLabel?: string
  children?: ReactNode
}

type LiveEventSummary = {
  id: string
}

type LiveCategorySummary = {
  id: string
  enabled?: boolean
}

const liveHrefRequests = new Map<'results' | 'display', Promise<string | null>>()

const getLiveEventHref = async (mode: 'results' | 'display'): Promise<string | null> => {
  const eventRes = await fetch('/api/events?status=LIVE', { cache: 'no-store' })
  const eventJson = await eventRes.json().catch(() => ({}))
  const liveEvent = (eventJson?.data?.[0] ?? null) as LiveEventSummary | null
  if (!liveEvent?.id) return null

  if (mode === 'display') {
    return `/event/${liveEvent.id}/display`
  }

  const categoryRes = await fetch(`/api/events/${liveEvent.id}/categories`, { cache: 'no-store' })
  const categoryJson = await categoryRes.json().catch(() => ({}))
  const categories = Array.isArray(categoryJson?.data) ? (categoryJson.data as LiveCategorySummary[]) : []
  const firstEnabledCategory = categories.find((item) => item?.enabled !== false) ?? categories[0] ?? null

  if (firstEnabledCategory?.id) {
    return `/event/${liveEvent.id}/live-score/${firstEnabledCategory.id}`
  }

  return `/event/${liveEvent.id}`
}

const getSharedLiveEventHref = (mode: 'results' | 'display') => {
  const existingRequest = liveHrefRequests.get(mode)
  if (existingRequest) return existingRequest

  const request = (async () => {
    try {
      return await getLiveEventHref(mode)
    } finally {
      liveHrefRequests.delete(mode)
    }
  })()
  liveHrefRequests.set(mode, request)
  return request
}

export default function LiveEntryButton({
  label,
  mode,
  className = '',
  activeClassName = '',
  fallbackHref = '/jadwal-race-pushbike',
  title,
  ariaLabel,
  children,
}: LiveEntryButtonProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [prefetchedHref, setPrefetchedHref] = useState<string | null>(null)
  const [hasCheckedLiveEvent, setHasCheckedLiveEvent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let isMounted = true

    const prime = async () => {
      try {
        const href = await getSharedLiveEventHref(mode)
        if (isMounted) {
          setPrefetchedHref(href)
          setHasCheckedLiveEvent(true)
        }
      } catch {
        if (isMounted) {
          setPrefetchedHref(null)
          setHasCheckedLiveEvent(true)
        }
      }
    }

    void prime()
    return () => {
      isMounted = false
    }
  }, [mode])

  const handleClick = useCallback(async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      const href = prefetchedHref ?? (await getSharedLiveEventHref(mode))
      if (!href) {
        router.push(fallbackHref)
        return
      }
      router.push(href)
    } catch {
      router.push(fallbackHref)
    } finally {
      setIsLoading(false)
    }
  }, [fallbackHref, isLoading, mode, prefetchedHref, router])

  const isActive = Boolean(
    mode === 'results'
      ? pathname.includes('/live-score/')
      : pathname.includes('/display')
  )

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${className} ${isActive ? activeClassName : ''}`.trim()}
      title={title}
      aria-label={ariaLabel}
      aria-current={isActive ? 'page' : undefined}
      aria-busy={isLoading || !hasCheckedLiveEvent}
    >
      {children ?? label}
    </button>
  )
}
