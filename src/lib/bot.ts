import { useEffect, useState } from 'react'
import type { BotLevel } from '@/engine/ai/search'
import type { BotReply, BotRequest } from '@/engine/ai/worker'
import type { GameState, Move, Variant } from '@/engine/types'

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
    difficulty: string
    themes: string[]
  } | null
  /** The score of every position, when a whole game was analysed. */
  scores?: number[] | null
}

interface Pending {
  id: number
  resolve: (result: BotResult) => void
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

  /** One request replaces the last: the position it thought about is history. */
  private send(request: Omit<BotRequest, 'id'>): Promise<BotResult> {
    this.cancel()
    const id = this.nextId++
    return new Promise<BotResult>((resolve) => {
      this.pending = { id, resolve }
      this.ensureWorker().postMessage({ ...request, id })
    })
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
    } = {},
  ): Promise<BotResult> {
    return this.send({ state, team, level, seed: options.seed ?? Date.now(), ...options })
  }

  /** Looks for a puzzle in a variant. */
  findPuzzle(variant: Variant, seed = Date.now()): Promise<BotResult> {
    return this.send({ seed, puzzle: { variant, seed } })
  }

  /**
   * Analyses a whole game, position by position.
   *
   * The scores come back in the order of the positions, so they can be drawn
   * as a graph of how the game went.
   */
  analyseGame(states: GameState[], team: string): Promise<BotResult> {
    return this.send({ seed: 1, analyseGame: { states, team } })
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

/** The worker client for the life of a component. */
export function useBotWorker(): BotWorker {
  const [client] = useState(() => new BotWorker())
  useEffect(() => () => client.dispose(), [client])
  return client
}
