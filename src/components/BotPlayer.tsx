import { useEffect, useReducer, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { BotWorker } from '@/lib/bot'
import { LEVELS } from '@/engine/ai/search'
import { getLegalMoves } from '@/engine/rules'
import type { GameState, Move } from '@/engine/types'

/**
 * Plays the bot's side.
 *
 * The search runs in a worker, so the board stays usable while the bot thinks.
 * The move it returns is checked against the rules engine before it is played,
 * so a bot can never make an illegal move.
 */
export function BotPlayer() {
  const game = useAppStore((s) => s.game)
  const bot = useAppStore((s) => s.bot)
  const setBotThinking = useAppStore((s) => s.setBotThinking)
  const worker = useRef<BotWorker | null>(null)
  const running = useRef(false)
  // Bumped when a search finished on a position that is no longer current, so
  // the bot starts over on the new one.
  const [retry, bump] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    return () => {
      worker.current?.dispose()
      worker.current = null
    }
  }, [])

  useEffect(() => {
    const team = bot.team
    if (!team || game.winner || game.turn !== team) {
      worker.current?.cancel()
      running.current = false
      setBotThinking(false)
      return
    }
    if (running.current) return
    running.current = true
    setBotThinking(true)

    const client = worker.current ?? new BotWorker()
    worker.current = client
    const level = bot.level
    const state = game
    const seed = Math.floor(Math.random() * 1e9)

    void client.think(state, team, level, seed).then((result) => {
      running.current = false
      setBotThinking(false)
      const store = useAppStore.getState()
      if (store.bot.team !== team) return
      if (store.game !== state) {
        // The position changed while the bot was thinking — think again.
        bump()
        return
      }
      if (!result.move) return
      // The bot may only play a move the engine agrees with.
      const move = legalMoveFor(state, result.move)
      if (!move) return
      const wait = Math.max(0, LEVELS[level].minThinkMs - result.elapsedMs)
      window.setTimeout(() => {
        if (useAppStore.getState().game !== state) return
        useAppStore.getState().playMove(move)
      }, wait)
    })
  }, [bot.level, bot.team, game, retry, setBotThinking])

  return null
}

/** The legal move that matches what the bot wanted to play, if it is legal. */
function legalMoveFor(state: GameState, wanted: Move): Move | undefined {
  return getLegalMoves(state, wanted.from.x, wanted.from.y).find(
    (m) =>
      m.pieceId === wanted.pieceId &&
      m.finalTo.x === wanted.finalTo.x &&
      m.finalTo.y === wanted.finalTo.y,
  )
}
