import { searchBestMove, type BotLevel } from './search'
import { findPuzzle } from './puzzles'
import { applyMove } from '../rules'
import type { GameState, Move, Variant } from '../types'

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
  /** Look for a puzzle in the variant instead of playing. */
  puzzle?: { variant: Variant; seed: number }
  /** Moves the bot must not play, by name. */
  exclude?: string[]
  /** Send the best line back as well. */
  wantLine?: boolean
  /** Analyse a whole game, position by position. */
  analyse?: { states: GameState[]; team: string }
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
  /** The score of every position, when a whole game was analysed. */
  scores?: number[] | null
  /** The move came out of the opening book. */
  book?: boolean
  /** A puzzle, when one was asked for. */
  puzzle?: {
    state: GameState
    from: { x: number; y: number }
    to: { x: number; y: number }
    side: string
    gain: number
    difficulty: string
    themes: string[]
  } | null
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<BotRequest>) => void) | null
  postMessage: (data: BotReply) => void
}

scope.onmessage = (event) => {
  const {
    id,
    state,
    team,
    level,
    seed,
    timeBudgetMs,
    analyze,
    puzzle,
    exclude,
    wantLine,
    analyse,
  } = event.data
  try {
    if (analyse) {
      // Every position of the game is looked at in turn, and the scores are
      // sent back for the graph.
      const scores = analyse.states.map((position) => {
        const result = searchBestMove(position, {
          team: analyse.team,
          level: 'casual',
          seed: 1,
          analyze: true,
          timeBudgetMs: 120,
        })
        return result.score
      })
      scope.postMessage({
        id,
        move: null,
        score: 0,
        depth: 0,
        nodes: 0,
        elapsedMs: 0,
        line: [],
        scores,
        puzzle: null,
      })
      return
    }
    if (puzzle) {
      const found = findPuzzle(puzzle.variant, puzzle.seed)
      scope.postMessage({
        id,
        move: null,
        score: 0,
        depth: 0,
        nodes: 0,
        elapsedMs: 0,
        line: [],
        scores: null,
        puzzle: found
          ? {
              state: found.state,
              from: { x: found.solution.from.x, y: found.solution.from.y },
              to: { x: found.solution.finalTo.x, y: found.solution.finalTo.y },
              side: found.side,
              gain: found.gain,
              difficulty: found.difficulty,
              themes: found.themes,
            }
          : null,
      })
      return
    }
    const result = searchBestMove(state, { team, level, seed, timeBudgetMs, analyze, exclude })
    scope.postMessage({
      id,
      move: result.move,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      elapsedMs: result.elapsedMs,
      line: wantLine ? describeLine(state, result.line) : [],
      scores: null,
      puzzle: null,
      book: result.book,
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
      scores: null,
      puzzle: null,
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
