import type { GameState, Move, Variant } from '@/engine/types'
import { applyMove, createInitialState, legalMovesForTeam, sanFor } from '@/engine/rules'
import { classicChess } from '@/engine/templates'

/**
 * PGN — the standard text form of a game.
 *
 * The moves are written in algebraic notation, the way a score sheet reads:
 * "Nf3", "exd5", "O-O", "e8=Q+". The engine writes that notation on every
 * move, so exporting is a matter of putting the headers around it.
 *
 * Importing works the other way around: every legal move of the side to move
 * is written out in the same notation and the score sheet is read against it,
 * so a PGN plays itself back move by move or is rejected.
 */

export function toPgn(
  state: GameState,
  options: { event?: string; site?: string; date?: string } = {},
): string {
  const headers = [
    `[Event "${options.event ?? 'Goonchess game'}"]`,
    `[Site "${options.site ?? 'goonchess.com'}"]`,
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

/**
 * Plays a PGN back on a variant — classic chess unless another is given — and
 * returns the final position with every position it passed through. Null when
 * the score sheet does not read as legal moves of the variant.
 */
export function fromPgn(
  pgn: string,
  variant: Variant = classicChess(),
): { game: GameState; states: GameState[] } | null {
  const moves = readSanMoves(pgn)
  if (!moves.length) return null

  let game = createInitialState(variant)
  const states: GameState[] = [game]
  for (const token of moves) {
    const wanted = normalizeSan(token)
    let found: Move | null = null
    for (const move of legalMovesForTeam(game, game.turn)) {
      const next = applyMove(game, move, { compute: false })
      if (normalizeSan(sanFor(game, move, next)) === wanted) {
        // The notation names one move; two answers mean the sheet is broken.
        if (found) return null
        found = move
      }
    }
    if (!found) return null
    game = applyMove(game, found, { san: true })
    states.push(game)
  }
  return { game, states }
}

/** Pulls the SAN tokens out of a PGN, headers, comments and variations aside. */
function readSanMoves(pgn: string): string[] {
  let text = pgn
  text = text.replace(/^\s*\[[^\]]*\]\s*$/gm, ' ') // [Header "lines"]
  text = text.replace(/\{[^}]*\}/g, ' ') // { bracketed comments }
  text = text.replace(/;[^\n]*/g, ' ') // ; rest-of-the-line comments
  // Variations nest, so the innermost ones are lifted out until none remain.
  while (/\([^()]*\)/.test(text)) text = text.replace(/\([^()]*\)/g, ' ')

  const moves: string[] = []
  for (const raw of text.split(/\s+/)) {
    // A move number may carry the move with it: "1.e4" or "3...Nf6".
    const token = raw.replace(/^\d+\.*$/, '').replace(/^\d+\.+/, '')
    if (!token || token.startsWith('[')) continue
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) continue
    moves.push(token)
  }
  return moves
}

/** Strips the decoration a score sheet may carry around the bare move. */
function normalizeSan(token: string): string {
  return token
    .replace(/[+#!?]/g, '')
    .replace(/\s*e\.p\./i, '')
    .replace(/^0(-0)+$/, (match) => match.replace(/0/g, 'O'))
    .toLowerCase()
}
