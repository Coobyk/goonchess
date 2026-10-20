import { searchBestMove, type BotLevel } from './search'
import { applyMove } from '../rules'
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
  /** Overrides the level's time budget, for playing against a clock. */
  timeBudgetMs?: number
  /** Analyse the position instead of playing a move. */
  analyze?: boolean
}

export interface BotReply {
  id: number
  move: Move | null
  score: number
  depth: number
  nodes: number
  elapsedMs: number
  /** The best line, in the notation of the variant. */
  line: string[]
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BotRequest>) => void) | null
  postMessage: (data: BotReply) => void
}

scope.onmessage = (event) => {
  const { id, state, team, level, seed, timeBudgetMs, analyze } = event.data
  try {
    const result = searchBestMove(state, { team, level, seed, timeBudgetMs, analyze })
    scope.postMessage({
      id,
      move: result.move,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      elapsedMs: result.elapsedMs,
      line: describeLine(state, result.line),
    })
  } catch (error) {
    scope.postMessage({
      id,
      move: null,
      score: 0,
      depth: 0,
      nodes: 0,
      elapsedMs: 0,
      line: [],
    })
    throw error
  }
}

/** Turns the best line into the notation the variant uses. */
function describeLine(state: GameState, line: Move[]): string[] {
  const out: string[] = []
  let current = state
  for (const move of line) {
    const next = applyMove(current, move, { compute: false })
    const record = next.moveHistory[next.moveHistory.length - 1]
    out.push(record.notation)
    current = next
  }
  return out
}
