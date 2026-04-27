'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

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

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      title={isDark ? 'Mode terang' : 'Mode gelap'}
      className="fixed bottom-4 right-4 z-[90] inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/92 px-4 py-2.5 text-sm font-black text-slate-800 shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur transition hover:bg-white data-[theme=dark]:border-slate-600 data-[theme=dark]:bg-slate-900/92 data-[theme=dark]:text-slate-100"
      data-theme={theme}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current/20">
        {isDark ? '☀' : '☾'}
      </span>
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    applyTheme(theme)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
      {mounted ? <ThemeToggleButton /> : null}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
