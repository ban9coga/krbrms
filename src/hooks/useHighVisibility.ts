'use client'

import { useCallback, useState } from 'react'

export function useHighVisibility(storageKey: string) {
  const [highVisibility, setHighVisibility] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(storageKey) === '1'
  })

  const toggleHighVisibility = useCallback(() => {
    setHighVisibility((current) => {
      const next = !current
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, next ? '1' : '0')
      }
      return next
    })
  }, [storageKey])

  return { highVisibility, toggleHighVisibility }
}
