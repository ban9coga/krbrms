'use client'

import { useEffect, useState } from 'react'

export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.visibilityState === 'visible'
    }
    return true
  })

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return isVisible
}
