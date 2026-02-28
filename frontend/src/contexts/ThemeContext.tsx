import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'default' | 'cream' | 'mint' | 'lavender'

type ThemeOption = {
  key: Theme
  label: string
  icon: string
}

type ThemeContextType = {
  theme: Theme
  setTheme: (theme: Theme) => void
  themes: ThemeOption[]
  darkMode: boolean
  toggleDarkMode: () => void
}

const THEMES: ThemeOption[] = [
  { key: 'default', label: 'Default', icon: 'D' },
  { key: 'cream', label: 'Cream', icon: 'C' },
  { key: 'mint', label: 'Mint', icon: 'M' },
  { key: 'lavender', label: 'Lavender', icon: 'L' },
]

const ThemeContext = createContext<ThemeContextType | null>(null)

function normalizeTheme(value: string | null): Theme {
  if (value === 'cream' || value === 'mint' || value === 'lavender' || value === 'default') {
    return value
  }
  return 'default'
}

function resolveInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  const stored = window.localStorage.getItem('von-dark-mode')
  if (stored !== null) return stored === 'true'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'default'
    return normalizeTheme(window.localStorage.getItem('von-theme'))
  })
  const [darkMode, setDarkMode] = useState<boolean>(() => resolveInitialDarkMode())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem('von-theme', theme)
  }, [theme])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    window.localStorage.setItem('von-dark-mode', String(darkMode))
  }, [darkMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem('von-dark-mode') === null) {
        setDarkMode(event.matches)
      }
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  const setTheme = (nextTheme: Theme) => setThemeState(nextTheme)
  const toggleDarkMode = () => setDarkMode((prev) => !prev)

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themes: THEMES,
      darkMode,
      toggleDarkMode,
    }),
    [theme, darkMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
