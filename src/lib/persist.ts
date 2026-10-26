import type { Variant } from '@/engine/types'
import { DEFAULT_THREAT_SETTINGS, type ThreatSettings } from '@/engine/threats'
import { normalizeBotSettings, type BotSettings } from '@/engine/ai/botSettings'
import { NO_CLOCK, type ClockSettings } from './clock'
import { DEFAULT_PACK } from './soundPacks'
import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisSettings } from './analysis'

const VARIANT_KEY = 'goonchess:variant'
const LIBRARY_KEY = 'goonchess:library'
const THEME_KEY = 'goonchess:theme'
const SOUND_KEY = 'goonchess:sound'
const THREAT_KEY = 'goonchess:threats'
const TURN_VIEW_KEY = 'goonchess:turn-view'
const BOT_KEY = 'goonchess:bot'
const CLOCK_KEY = 'goonchess:clock'
const PACK_KEY = 'goonchess:sound-pack'
const ANALYSIS_KEY = 'goonchess:analysis'

export type TurnView = 'off' | 'board' | 'pieces'

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

export const loadThreatSettings = (): ThreatSettings => ({
  ...DEFAULT_THREAT_SETTINGS,
  ...read<Partial<ThreatSettings>>(THREAT_KEY, {}),
})
export const saveThreatSettings = (v: ThreatSettings) => write(THREAT_KEY, v)

export const loadTurnView = (): TurnView => {
  const value = read<TurnView>(TURN_VIEW_KEY, 'off')
  return value === 'board' || value === 'pieces' ? value : 'off'
}
export const saveTurnView = (v: TurnView) => write(TURN_VIEW_KEY, v)

export const loadBotSettings = (): BotSettings =>
  normalizeBotSettings(read<unknown>(BOT_KEY, {}))
export const saveBotSettings = (v: BotSettings) => write(BOT_KEY, v)

export const loadClockSettings = (): ClockSettings => ({
  ...NO_CLOCK,
  ...read<Partial<ClockSettings>>(CLOCK_KEY, {}),
})
export const saveClockSettings = (v: ClockSettings) => write(CLOCK_KEY, v)

export const loadSoundPack = (): string => {
  const value = read<string>(PACK_KEY, DEFAULT_PACK)
  return typeof value === 'string' && value ? value : DEFAULT_PACK
}
export const saveSoundPack = (v: string) => write(PACK_KEY, v)

export const loadAnalysisSettings = (): AnalysisSettings => ({
  ...DEFAULT_ANALYSIS_SETTINGS,
  ...read<Partial<AnalysisSettings>>(ANALYSIS_KEY, {}),
})
export const saveAnalysisSettings = (v: AnalysisSettings) => write(ANALYSIS_KEY, v)

/* ------------------------------------------------------------- puzzles */

const PUZZLE_KEY = 'goonchess:puzzle-stats'

export interface PuzzleStats {
  /** The run of puzzles answered correctly in a row, right now. */
  streak: number
  /** The longest run there has ever been. */
  best: number
}

export const loadPuzzleStats = (): PuzzleStats => read<PuzzleStats>(PUZZLE_KEY, { streak: 0, best: 0 })
export const savePuzzleStats = (v: PuzzleStats) => write(PUZZLE_KEY, v)
