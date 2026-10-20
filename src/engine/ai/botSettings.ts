import type { BotLevel } from './search'

/** Who the human is playing against. */
export interface BotSettings {
  /** The team the bot plays, or null for a two-player game. */
  team: string | null
  /** How hard the bot tries. */
  level: BotLevel
}

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  team: null,
  level: 'normal',
}
