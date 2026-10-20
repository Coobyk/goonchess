import type { BotLevel } from '@/engine/ai/search'
import type { BotReply, BotRequest } from '@/engine/ai/worker'
import type { GameState, Move } from '@/engine/types'

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
      })
    }
    worker.onerror = () => {
      const pending = this.pending
      this.pending = null
      pending?.resolve({ move: null, score: 0, depth: 0, nodes: 0, elapsedMs: 0, line: [] })
    }
    this.worker = worker
    return worker
  }

  /** Starts a search. The promise resolves with the move the bot picked. */
  think(
    state: GameState,
    team: string,
    level: BotLevel,
    seed = Date.now(),
    timeBudgetMs?: number,
    analyze = false,
  ): Promise<BotResult> {
    this.cancel()
    const worker = this.ensureWorker()
    const id = this.nextId++
    return new Promise<BotResult>((resolve) => {
      this.pending = { id, resolve }
      const request: BotRequest = { id, state, team, level, seed, timeBudgetMs, analyze }
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
