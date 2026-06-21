'use client'

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'

type ThemeMode = 'light' | 'dark'

type ThemeContextValue = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const STORAGE_KEY = 'krb_theme_mode'

const applyTheme = (theme: ThemeMode) => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function ThemeToggleSwitch({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  )
  const isDark = theme === 'dark'

  if (!mounted) {
    return <span className={`theme-switch-placeholder ${className}`.trim()} aria-hidden="true" />
  }

  return (
    <label
      className={`switch theme-switch ${className}`.trim()}
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      title={isDark ? 'Mode terang' : 'Mode gelap'}
    >
      <input type="checkbox" checked={!isDark} onChange={toggleTheme} />
      <span className="slider">
        <span className="moons-hole" aria-hidden="true">
          <span className="moon-hole" />
          <span className="moon-hole" />
          <span className="moon-hole" />
        </span>
        <span className="stars" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((star) => (
            <svg key={star} className="star" viewBox="0 0 24 24">
              <path d="m12 1.8 2.1 6.1 6.4.1-5.1 3.9 1.9 6.2-5.3-3.6-5.3 3.6 1.9-6.2L3.5 8l6.4-.1L12 1.8Z" />
            </svg>
          ))}
        </span>
        <span className="black-clouds" aria-hidden="true">
          <span className="black-cloud" />
          <span className="black-cloud" />
          <span className="black-cloud" />
        </span>
        <span className="clouds" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((cloud) => (
            <span key={cloud} className="cloud" />
          ))}
        </span>
      </span>
    </label>
  )
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, nextTheme)
    }
    applyTheme(nextTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
