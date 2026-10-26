import type { BotLevel } from '@/engine/ai/search'
import type { BotReply, BotRequest } from '@/engine/ai/worker'
import { createInitialState } from '@/engine/rules'
import type { GameState, Move, Variant } from '@/engine/types'

/** A starting position, used when a request carries no board of its own. */
function emptyState(variant: Variant): GameState {
  return createInitialState(variant)
}

/**
 * Talks to the bot worker. One search at a time: a new request replaces the
 * old one, because the position it was thinking about is already history.
 */

export interface BotResult {
  move: Move | null
  score: number
  depth: number
  nodes: number
  elapsedMs: number
  /** The best line, in the notation of the variant. */
  line: string[]
  /** The move came out of the opening book. */
  book?: boolean
  /** A puzzle, when one was asked for. */
  puzzle?: {
    state: GameState
    from: { x: number; y: number }
    to: { x: number; y: number }
    side: string
    gain: number
  } | null
  /** The score of every position, when a whole game was analysed. */
  scores?: number[] | null
}

/** How far the search has come, told while it is still thinking. */
export interface BotProgress {
  depth: number
  score: number
  nodes: number
  elapsedMs: number
}

interface Pending {
  id: number
  resolve: (result: BotResult) => void
  onProgress?: (progress: BotProgress) => void
}

export class BotWorker {
  private worker: Worker | null = null
  private pending: Pending | null = null
  private nextId = 1

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('../engine/ai/worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<BotReply>) => {
      const pending = this.pending
      if (!pending || pending.id !== event.data.id) return
      if (event.data.kind === 'progress') {
        pending.onProgress?.({
          depth: event.data.depth,
          score: event.data.score,
          nodes: event.data.nodes,
          elapsedMs: event.data.elapsedMs,
        })
        return
      }
      this.pending = null
      pending.resolve({
        move: event.data.move,
        score: event.data.score,
        depth: event.data.depth,
        nodes: event.data.nodes,
        elapsedMs: event.data.elapsedMs,
        line: event.data.line ?? [],
        book: event.data.book,
        puzzle: event.data.puzzle ?? null,
        scores: event.data.scores ?? null,
      })
    }
    worker.onerror = () => {
      const pending = this.pending
      this.pending = null
      pending?.resolve({
        move: null,
        score: 0,
        depth: 0,
        nodes: 0,
        elapsedMs: 0,
        line: [],
        puzzle: null,
        scores: null,
      })
    }
    this.worker = worker
    return worker
  }

  /** Starts a search. The promise resolves with the move the bot picked. */
  think(
    state: GameState,
    team: string,
    level: BotLevel,
    options: {
      seed?: number
      timeBudgetMs?: number
      analyze?: boolean
      exclude?: string[]
      /** Ask for the best line as well. */
      wantLine?: boolean
      /** Told how the search is coming along, once per finished depth. */
      onProgress?: (progress: BotProgress) => void
    } = {},
  ): Promise<BotResult> {
    this.cancel()
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<BotResult>((resolve) => {
      this.pending = { id, resolve, onProgress: options.onProgress }
      const request: BotRequest = {
        id,
        state,
        team,
        level,
        seed: options.seed ?? Date.now(),
        timeBudgetMs: options.timeBudgetMs,
        analyze: options.analyze,
        exclude: options.exclude,
        wantLine: options.wantLine,
      }
      worker.postMessage(request)
    })
  }

  /** Looks for a puzzle in a variant. */
  findPuzzle(variant: Variant, seed = Date.now()): Promise<BotResult> {
    this.cancel()
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<BotResult>((resolve) => {
      this.pending = { id, resolve }
      const request: BotRequest = {
        id,
        state: emptyState(variant),
        team: variant.teams[0]?.id ?? 'white',
        level: 'normal',
        seed,
        puzzle: { variant, seed },
      }
      worker.postMessage(request)
    })
  }

  /**
   * Analyses a whole game, position by position.
   *
   * The scores come back in the order of the positions, so they can be drawn
   * as a graph of how the game went.
   */
  analyseGame(states: GameState[], team: string): Promise<BotResult> {
    this.cancel()
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<BotResult>((resolve) => {
      this.pending = { id, resolve }
      const request: BotRequest = {
        id,
        state: states[0] ?? emptyState({} as Variant),
        team,
        level: 'casual',
        seed: 1,
        analyse: { states, team },
      }
      worker.postMessage(request)
    })
  }

  /** Drops the current search, if any. */
  cancel() {
    this.pending = null
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.pending = null
  }
}
