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
}

const THEMES: ThemeOption[] = [
  { key: 'default', label: '기본', icon: '◯' },
  { key: 'cream', label: '크림', icon: '◐' },
  { key: 'mint', label: '민트', icon: '◑' },
  { key: 'lavender', label: '라벤더', icon: '◍' },
]

const ThemeContext = createContext<ThemeContextType | null>(null)

function normalizeTheme(value: string | null): Theme {
  if (value === 'cream' || value === 'mint' || value === 'lavender' || value === 'default') {
    return value
  }
  return 'default'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'default'
    return normalizeTheme(window.localStorage.getItem('von-theme'))
  })

  useEffect(() => {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
    window.localStorage.setItem('von-theme', theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themes: THEMES,
    }),
    [theme],
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
