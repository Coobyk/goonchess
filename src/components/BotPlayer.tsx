import { useEffect, useReducer, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { BotWorker } from '@/lib/bot'
import { LEVELS } from '@/engine/ai/search'
import { botLevelFor, isBotTeam } from '@/engine/ai/botSettings'
import { clockIsOn } from '@/lib/clock'
import { wouldRepeat } from '@/lib/repetition'
import { moveKey } from '@/engine/repetition'
import { getLegalMoves, legalOptionsForTeam } from '@/engine/rules'
import type { GameState, Move } from '@/engine/types'

/**
 * Plays the bot's side.
 *
 * The search runs in a worker, so the board stays usable while the bot thinks.
 * The move it returns is checked against the rules engine before it is played,
 * so a bot can never make an illegal move. When both sides are bots, each one
 * plays with the strength that is set for its side.
 */
export function BotPlayer() {
  const game = useAppStore((s) => s.game)
  const bot = useAppStore((s) => s.bot)
  const botSide = useAppStore((s) => s.botSide)
  const clock = useAppStore((s) => s.clock)
  const clockState = useAppStore((s) => s.clockState)
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
    const team = game.turn
    const botTurn = isBotTeam(bot, team, botSide)
    // A terminal game (win / draw / stalemate / timeout) is a separate state:
    // the bots stop and stay stopped so the position can be analysed without
    // pieces moving around under them.
    if (!botTurn || game.winner || game.status !== 'active') {
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
    const level = botLevelFor(bot, team)
    const state = game
    const seed = Math.floor(Math.random() * 1e9)
    // With a clock running, the bot never uses more than a third of its time.
    const remaining = clockState.times[team] ?? 0
    const budget = clockIsOn(clock)
      ? Math.max(200, Math.min(LEVELS[level].timeBudgetMs, remaining / 3 - 800))
      : undefined
    // Playing a position that has been on the board before would be a draw, so
    // those moves are taken off the table.
    const repeating = legalOptionsForTeam(state, team)
      .filter((option) => wouldRepeat(state, option.move))
      .map((option) => moveKey(option.move))

    void client
      .think(state, team, level, { seed, timeBudgetMs: budget, exclude: repeating })
      .then((result) => {
        running.current = false
        setBotThinking(false)
        const store = useAppStore.getState()
        if (!isBotTeam(store.bot, team, store.botSide)) return
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
  }, [bot, botSide, game, retry, setBotThinking])

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
