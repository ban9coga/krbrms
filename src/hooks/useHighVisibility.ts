'use client'

import { useCallback, useEffect, useState } from 'react'

export function useHighVisibility(storageKey: string) {
  // Keep the server and first browser render identical. The saved preference
  // is applied after hydration to avoid a localStorage-based mismatch.
  const [highVisibility, setHighVisibility] = useState(false)

  useEffect(() => {
    setHighVisibility(window.localStorage.getItem(storageKey) === '1')
  }, [storageKey])

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
