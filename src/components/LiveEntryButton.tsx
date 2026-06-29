'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type LiveEntryButtonProps = {
  label: string
  mode: 'results' | 'display'
  className?: string
  activeClassName?: string
  fallbackHref?: string
  title?: string
}

type LiveEventSummary = {
  id: string
}

type LiveCategorySummary = {
  id: string
  enabled?: boolean
}

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

export default function LiveEntryButton({
  label,
  mode,
  className = '',
  activeClassName = '',
  fallbackHref = '/dashboard',
  title,
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
        const href = await getLiveEventHref(mode)
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
      const href = prefetchedHref ?? (await getLiveEventHref(mode))
      if (!href) {
        alert('Belum ada event yang LIVE. Lihat event lainnya.')
        router.push(fallbackHref)
        return
      }
      router.push(href)
    } catch {
      alert('Belum ada event yang LIVE. Lihat event lainnya.')
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

  if (hasCheckedLiveEvent && !prefetchedHref) {
    return null
  }

  if (!hasCheckedLiveEvent) {
    return null
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${className} ${isActive ? activeClassName : ''}`.trim()}
      title={title}
      aria-busy={isLoading}
    >
      {label}
    </button>
  )
}
