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
      className={`theme ${className}`.trim()}
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      title={isDark ? 'Mode terang' : 'Mode gelap'}
    >
      <span className="theme__toggle-wrap">
        <input
          className="theme__toggle"
          type="checkbox"
          checked={isDark}
          onChange={toggleTheme}
          role="switch"
          aria-checked={isDark}
        />
        <span className="theme__fill" aria-hidden="true" />
        <span className="theme__icon" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} className="theme__icon-part" />
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
