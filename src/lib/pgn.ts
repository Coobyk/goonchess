import type { GameState } from '@/engine/types'

/**
 * PGN — the standard text form of a game.
 *
 * The moves are written in algebraic notation, the way a score sheet reads:
 * "Nf3", "exd5", "O-O", "e8=Q+". The engine writes that notation on every
 * move, so exporting is a matter of putting the headers around it.
 */

export function toPgn(
  state: GameState,
  options: { event?: string; site?: string; date?: string } = {},
): string {
  const headers = [
    `[Event "${options.event ?? 'Goonchess game'}"]`,
    `[Site "${options.site ?? 'chess.coobyk.com'}"]`,
    `[Date "${options.date ?? new Date().toISOString().slice(0, 10).replace(/-/g, '.')}"]`,
    `[White "${state.variant.teams[0]?.name ?? 'White'}"]`,
    `[Black "${state.variant.teams[1]?.name ?? 'Black'}"]`,
    `[Result "${result(state)}"]`,
  ]

  const tokens: string[] = []
  state.moveHistory.forEach((record, index) => {
    if (index % 2 === 0) tokens.push(`${Math.floor(index / 2) + 1}.`)
    tokens.push(record.san ?? record.notation)
  })

  const body = tokens.join(' ')
  return `${headers.join('\n')}\n\n${body}${body ? ' ' : ''}${result(state)}\n`
}

function result(state: GameState): string {
  if (!state.winner) return '*'
  if (state.winner === 'draw') return '1/2-1/2'
  const white = state.variant.teams[0]?.id
  return state.winner === white ? '1-0' : '0-1'
}
