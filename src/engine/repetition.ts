import type { GameState, Move, Vec } from './types'

/**
 * The identity of a position.
 *
 * Two positions are the same when the pieces stand in the same squares, the
 * same side is to move, the same pieces can still castle, and an en passant
 * capture is available in both or in neither. That is the rule for repetition,
 * and it is what the game counts.
 */
export function positionKey(state: GameState): string {
  const { variant } = state
  const teamIndex = new Map(variant.teams.map((t, i) => [t.id, i]))
  const typeIndex = new Map(variant.pieceTypes.map((p, i) => [p.id, i]))

  const rows: string[] = []
  for (let y = 0; y < state.board.length; y++) {
    let row = ''
    for (let x = 0; x < state.board[y].length; x++) {
      const id = state.board[y][x]
      if (!id) {
        // Every square is written the same width, so no two positions can
        // look alike.
        row += '..'
        continue
      }
      const inst = state.pieces[id]
      const team = teamIndex.get(inst.team) ?? 0
      const type = typeIndex.get(inst.typeId) ?? 0
      row += `${team.toString(36).padStart(2, '0')}${type.toString(36).padStart(2, '0')}`
    }
    rows.push(row)
  }

  const ep = enPassantRight(state)
  const parts: (string | number)[] = [
    rows.join('/'),
    teamIndex.get(state.turn) ?? 0,
    castlingRights(state),
    ep ? `${ep.x},${ep.y}` : '-',
  ]
  // Three-Check: two positions with the same pieces are different games when
  // the checks have been counted differently. Every other game keeps the
  // keys it has always had.
  if (state.checks) {
    parts.push(variant.teams.map((team) => state.checks?.[team.id] ?? 0).join(','))
  }
  // Crazyhouse: two positions with the same pieces on the board are different
  // games when the pockets hold different things. The kinds are listed in the
  // variant's own order, so the same pockets always spell the same string.
  if (state.hands) {
    parts.push(
      variant.teams
        .map((team) => {
          const hand = state.hands?.[team.id]
          if (!hand) return ''
          return variant.pieceTypes
            .map((piece, i) => ({ i, count: hand[piece.id] ?? 0 }))
            .filter((entry) => entry.count > 0)
            .map((entry) => `${entry.i.toString(36)}x${entry.count.toString(36)}`)
            .join(',')
        })
        .join('/'),
    )
  }
  return parts.join('|')
}

/** Which castles are still possible. */
export function castlingRights(state: GameState): string {
  const { variant } = state
  const out: string[] = []
  for (const team of variant.teams) {
    const home = team.id === variant.teams[0]?.id ? variant.board.height - 1 : 0
    let kingHome = false
    const rooks: number[] = []
    for (const id in state.pieces) {
      const inst = state.pieces[id]
      if (inst.team !== team.id || inst.hasMoved) continue
      const piece = state.pieceTypes[inst.typeId]
      const at = findSquare(state, id)
      if (!at || at.y !== home) continue
      if (piece?.icon === 'king') kingHome = true
      if (piece?.icon === 'rook') rooks.push(at.x)
    }
    if (!kingHome || rooks.length < 2) continue
    const upper = team.id === variant.teams[0]?.id
    if (Math.min(...rooks) < variant.board.width / 2) out.push(upper ? 'Q' : 'q')
    if (Math.max(...rooks) >= variant.board.width / 2) out.push(upper ? 'K' : 'k')
  }
  // The rights are written in the usual order: KQkq.
  return 'KQkq'.split('').filter((c) => out.includes(c)).join('') || '-'
}

/**
 * The square an en passant capture would land on, if one is possible right
 * now. Position keys, FEN output and the search's hash all ask this, so it
 * lives once — a taker beside the landing square, belonging to the side to
 * move and carrying the same `enPassant` flag the capture rule checks.
 */
/**
 * The square a double push skipped over, written into a FEN whether or not
 * a capture is waiting for it — FEN records the target, not the capture.
 */
export function enPassantTarget(state: GameState): Vec | null {
  const last = state.moveHistory[state.moveHistory.length - 1]
  if (!last) return null
  const dx = last.move.finalTo.x - last.move.from.x
  const dy = last.move.finalTo.y - last.move.from.y
  if (Math.abs(dx) + Math.abs(dy) !== 2 || (dx !== 0 && dy !== 0)) return null
  const jumped = state.pieces[last.move.pieceId]
  const jumpedPiece = jumped ? state.pieceTypes[jumped.typeId] : undefined
  if (!jumpedPiece?.flags.enPassant) return null
  return { x: last.move.from.x + dx / 2, y: last.move.from.y + dy / 2 }
}

export function enPassantRight(state: GameState): Vec | null {
  const last = state.moveHistory[state.moveHistory.length - 1]
  if (!last) return null
  const dx = last.move.finalTo.x - last.move.from.x
  const dy = last.move.finalTo.y - last.move.from.y
  // Only a straight two-square crossing leaves a square to capture onto.
  if (Math.abs(dx) + Math.abs(dy) !== 2 || (dx !== 0 && dy !== 0)) return null
  const jumped = state.pieces[last.move.pieceId]
  const jumpedPiece = jumped ? state.pieceTypes[jumped.typeId] : undefined
  if (!jumpedPiece?.flags.enPassant || jumpedPiece.flags.uncapturable) return null
  const skipped = { x: last.move.from.x + dx / 2, y: last.move.from.y + dy / 2 }
  if (state.board[skipped.y]?.[skipped.x]) return null
  // The taker stands right beside the jumped piece after it lands.
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const id = state.board[last.move.finalTo.y + oy]?.[last.move.finalTo.x + ox]
    if (!id) continue
    const inst = state.pieces[id]
    if (inst.team !== state.turn) continue
    if (state.pieceTypes[inst.typeId]?.flags.enPassant) return skipped
  }
  return null
}

export function findSquare(state: GameState, pieceId: string) {
  for (let y = 0; y < state.board.length; y++) {
    const x = state.board[y].indexOf(pieceId)
    if (x >= 0) return { x, y }
  }
  return null
}


/** How often a position has stood on the board so far. */
export function countPosition(state: GameState, key: string): number {
  let count = state.startKey === key ? 1 : 0
  for (const record of state.moveHistory) {
    if (record.positionKey === key) count += 1
  }
  return count
}

/** A short name for a move, so the search can be told to leave it alone. */
export function moveKey(move: Move): string {
  return `${move.from.x},${move.from.y}->${move.finalTo.x},${move.finalTo.y}`
}
