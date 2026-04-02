import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type ThemeMode = 'light' | 'dark' | 'auto'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  mode: ThemeMode
  theme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

function getAutoTheme(): ResolvedTheme {
  const hour = new Date().getHours()
  // Light: 08:00 - 20:00, Dark: 20:00 - 08:00
  return hour >= 8 && hour < 20 ? 'light' : 'dark'
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('alerta-desnona-theme') as ThemeMode | null
    return saved && ['light', 'dark', 'auto'].includes(saved) ? saved : 'dark'
  })

  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    mode === 'auto' ? getAutoTheme() : mode as ResolvedTheme
  )

  function setMode(m: ThemeMode) {
    setModeState(m)
    localStorage.setItem('alerta-desnona-theme', m)
    const newResolved = m === 'auto' ? getAutoTheme() : m as ResolvedTheme
    setResolved(newResolved)
    applyTheme(newResolved)
  }

  function toggle() {
    const next: ThemeMode = mode === 'dark' ? 'light' : mode === 'light' ? 'auto' : 'dark'
    setMode(next)
  }

  // Auto-update on interval when in auto mode
  useEffect(() => {
    applyTheme(resolved)

    if (mode !== 'auto') return

    const interval = setInterval(() => {
      const autoTheme = getAutoTheme()
      setResolved(prev => {
        if (prev !== autoTheme) {
          applyTheme(autoTheme)
          return autoTheme
        }
        return prev
      })
    }, 60_000) // check every minute

    return () => clearInterval(interval)
  }, [mode, resolved])

  return (
    <ThemeContext.Provider value={{ mode, theme: resolved, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider')
  return ctx
}
