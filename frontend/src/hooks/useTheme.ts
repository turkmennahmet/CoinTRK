import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'cointrk.theme'
/** Keys used under the app's earlier names; still read so saved themes survive. */
const LEGACY_STORAGE_KEYS = ['turcoin.theme', 'cointest.theme', 'coinscanner.theme'] as const

function readStored(): ThemePreference {
  try {
    const value = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].map((key) => localStorage.getItem(key)).find((v) => v !== null)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function useTheme(): [ThemePreference, () => void] {
  const [theme, setTheme] = useState<ThemePreference>(readStored)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key)
      if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this session.
    }
  }, [theme])

  const cycle = useCallback(() => {
    setTheme((current) => (current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system'))
  }, [])

  return [theme, cycle]
}
