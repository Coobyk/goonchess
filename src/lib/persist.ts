import type { Variant } from '@/engine/types'

const VARIANT_KEY = 'goonchess:variant'
const LIBRARY_KEY = 'goonchess:library'
const THEME_KEY = 'goonchess:theme'
const SOUND_KEY = 'goonchess:sound'

export interface SavedVariant {
  id: string
  name: string
  updatedAt: number
  variant: Variant
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: ignore */
  }
}

export const loadVariant = () => read<Variant | null>(VARIANT_KEY, null)
export const saveVariant = (v: Variant) => write(VARIANT_KEY, v)

export const loadLibrary = () => read<SavedVariant[]>(LIBRARY_KEY, [])
export const saveLibrary = (items: SavedVariant[]) => write(LIBRARY_KEY, items)

export const loadTheme = () => read<'dark' | 'light'>(THEME_KEY, 'dark')
export const saveTheme = (t: 'dark' | 'light') => write(THEME_KEY, t)

export const loadSoundEnabled = () => read<boolean>(SOUND_KEY, true)
export const saveSoundEnabled = (v: boolean) => write(SOUND_KEY, v)
