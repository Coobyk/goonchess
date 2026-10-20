import type { BotLevel } from './search'
import type { Variant } from '../types'

/** Who the human is playing against. */
export interface BotSettings {
  /**
   * `off` — two people share the board.
   * `one` — the bot plays `side`, the human plays the other one.
   * `all` — every side is played by a bot, and the human watches.
   */
  mode: 'off' | 'one' | 'all'
  /** In `one` mode: the side the bot plays, or `random` to roll one per game. */
  side: string | 'random' | null
  /** How hard the bot plays in `one` mode. */
  level: BotLevel
  /** How hard each side plays in `all` mode. */
  levels: Record<string, BotLevel>
}

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  mode: 'off',
  side: null,
  level: 'normal',
  levels: {},
}

/** Is this side played by a bot? */
export function isBotTeam(
  settings: BotSettings,
  teamId: string,
  botSide: string | null,
): boolean {
  if (settings.mode === 'all') return true
  if (settings.mode === 'one') return botSide !== null && botSide === teamId
  return false
}

/** How hard the bot of this side plays. */
export function botLevelFor(settings: BotSettings, teamId: string): BotLevel {
  if (settings.mode === 'all') return settings.levels[teamId] ?? 'normal'
  return settings.level
}

/** Picks a side for the bot at random. */
export function rollBotSide(variant: Variant, current: string | null): string | null {
  const teams = variant.teams.map((team) => team.id)
  if (!teams.length) return current
  if (teams.length === 1) return teams[0]
  // Two games in a row on the same side gets boring, so avoid a repeat when
  // there is another side to pick.
  const others = teams.filter((id) => id !== current)
  const pool = others.length ? others : teams
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Reads settings that were saved by an older version. */
export function normalizeBotSettings(input: unknown): BotSettings {
  const raw = (input ?? {}) as Partial<BotSettings> & {
    team?: string | null
    level?: BotLevel
  }
  const mode: BotSettings['mode'] =
    raw.mode === 'one' || raw.mode === 'all' ? raw.mode : raw.team ? 'one' : 'off'
  const levels: Record<string, BotLevel> = { ...(raw.levels ?? {}) }
  // Older settings kept the side in `team` and one level for it.
  const side = raw.side ?? raw.team ?? null
  const level = raw.level ?? (raw.team ? levels[raw.team] : undefined) ?? 'normal'
  return { mode, side, level, levels }
}
