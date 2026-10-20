import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { isInCheck } from '@/engine/rules'

/**
 * Tells a screen reader what just happened.
 *
 * The region is polite, so it waits for a pause in whatever is being read
 * instead of interrupting it.
 */
export function LiveAnnouncer() {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const [message, setMessage] = useState('')
  const lastCount = useRef(0)

  useEffect(() => {
    const count = game.moveHistory.length
    if (count === lastCount.current) return
    const first = lastCount.current === 0
    lastCount.current = count
    const record = game.moveHistory[count - 1]
    if (!record) return
    const team = variant.teams.find((t) => t.id === record.team)
    const parts = [`${team?.name ?? record.team} played ${record.notation}`]
    if (first) parts.unshift('The game has started.')
    if (game.winner) {
      parts.push(
        game.winner === 'draw'
          ? 'The game is a draw.'
          : `${variant.teams.find((t) => t.id === game.winner)?.name ?? game.winner} wins.`,
      )
    } else if (isInCheck(game, game.turn)) {
      parts.push('Check.')
    } else {
      parts.push(`${variant.teams.find((t) => t.id === game.turn)?.name ?? game.turn} to move.`)
    }
    setMessage(parts.join(' '))
  }, [game, variant.teams])

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}
