import { searchBestMove, type BotLevel } from './search'
import type { GameState, Move } from '../types'

/**
 * The bot runs in a worker so the board stays responsive while it thinks.
 * The worker only knows the rules engine — it never touches the interface.
 */

export interface BotRequest {
  id: number
  state: GameState
  team: string
  level: BotLevel
  seed: number
}

export interface BotReply {
  id: number
  move: Move | null
  score: number
  depth: number
  nodes: number
  elapsedMs: number
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BotRequest>) => void) | null
  postMessage: (data: BotReply) => void
}

scope.onmessage = (event) => {
  const { id, state, team, level, seed } = event.data
  try {
    const result = searchBestMove(state, { team, level, seed })
    scope.postMessage({
      id,
      move: result.move,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      elapsedMs: result.elapsedMs,
    })
  } catch (error) {
    scope.postMessage({
      id,
      move: null,
      score: 0,
      depth: 0,
      nodes: 0,
      elapsedMs: 0,
    })
    throw error
  }
}
