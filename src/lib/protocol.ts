import type { GameState, Variant, Vec } from '@/engine/types'
import type { ClockSettings, ClockState } from '@/lib/clock'

/**
 * The socket protocol between the browser and a GameRoom, written once for
 * both ends. The client types its sends against `ClientMessage` and the room
 * validates every field it reads; `ServerMessage` is what travels back.
 */

export type OfferKind = 'undo' | 'rematch'

export interface ChatLine {
  from: number
  text: string
  at: number
}

/** The longest a chat line can run, and how many the room remembers. */
export const CHAT_MAX_LENGTH = 280
export const CHAT_HISTORY = 30

export type ClientMessage =
  | {
      t: 'move'
      from: Vec
      to: Vec
      finalTo: Vec
      roll?: number
      promotionTypeId?: string
      origin?: Vec
      drop?: { typeId: string }
    }
  | { t: 'resign' }
  /** An offer to take the last move back, or to play the whole game again. */
  | { t: 'offer'; kind: OfferKind }
  | { t: 'offer-response'; kind: OfferKind; accept: boolean }
  | { t: 'chat'; text: string }

export type ServerMessage =
  | {
      t: 'hello'
      you: { seat: number | null; token: string | null }
      variant: Variant
      game: GameState | null
      /** The time control the room enforces, and where it stands. */
      clock: ClockSettings
      clockState: ClockState | null
      seats: boolean[]
      started: boolean
      name: string
      teams: string[]
      /** The chat so far, as the room remembers it. */
      chat?: ChatLine[]
    }
  | { t: 'state'; game: GameState; clockState?: ClockState | null }
  /**
   * A room made with random sides deals them again for every game: this is
   * the seat the browser holds for the new one.
   */
  | { t: 'seat'; seat: number }
  | { t: 'presence'; presence: boolean[]; watchers: number }
  /** Another seat offers to take a move back, or to play again. */
  | { t: 'offer'; kind: OfferKind; seat: number }
  | { t: 'offer-accepted'; kind: OfferKind }
  | { t: 'offer-declined'; kind: OfferKind }
  | { t: 'chat'; from: number; text: string; at: number }
  /**
   * A refusal carries the position and clock the room holds, so the board can
   * be put back.
   */
  | { t: 'error'; code: string; game?: GameState; clockState?: ClockState | null }
