import type { BotLevel } from './search'

/** Who the human is playing against. */
export interface BotSettings {
  /**
   * `off` — two people share the board.
   * `one` — the bot plays `team`, the human plays the other side.
   * `all` — every side is played by a bot, and the human watches.
   */
  mode: 'off' | 'one' | 'all'
  /** In `one` mode: the side the bot plays. */
  team: string | null
  /** The strength of each side, by team id. */
  levels: Record<string, BotLevel>
}

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  mode: 'off',
  team: null,
  levels: {},
}

/** Is this side played by a bot? */
export function isBotTeam(settings: BotSettings, teamId: string): boolean {
  if (settings.mode === 'all') return true
  if (settings.mode === 'one') return settings.team === teamId
  return false
}

/** How hard the bot of this side plays. */
export function botLevelFor(settings: BotSettings, teamId: string): BotLevel {
  return settings.levels[teamId] ?? 'normal'
}

/** Reads settings that were saved by an older version. */
export function normalizeBotSettings(input: unknown): BotSettings {
  const raw = (input ?? {}) as Partial<BotSettings> & { level?: BotLevel }
  const mode: BotSettings['mode'] =
    raw.mode === 'one' || raw.mode === 'all' ? raw.mode : raw.team ? 'one' : 'off'
  const levels: Record<string, BotLevel> = { ...(raw.levels ?? {}) }
  // Older settings kept one level for the bot's side.
  if (raw.level && raw.team) levels[raw.team] = raw.level
  return { mode, team: raw.team ?? null, levels }
}
