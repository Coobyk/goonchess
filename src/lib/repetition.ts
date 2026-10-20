import type { GameState } from '@/engine/types'

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

  return [rows.join('/'), teamIndex.get(state.turn) ?? 0, castlingRights(state), enPassantRight(state)].join(
    '|',
  )
}

/** Which castles are still possible. */
function castlingRights(state: GameState): string {
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
  return out.join('') || '-'
}

/** The square an en passant capture would land on, if one is possible. */
function enPassantRight(state: GameState): string {
  const last = state.moveHistory[state.moveHistory.length - 1]
  if (!last) return '-'
  const piece = state.pieceTypes[state.pieces[last.move.pieceId]?.typeId ?? '']
  if (piece?.icon !== 'pawn') return '-'
  const dy = last.move.finalTo.y - last.move.from.y
  if (Math.abs(dy) !== 2) return '-'
  const x = last.move.finalTo.x
  const y = last.move.finalTo.y - Math.sign(dy)
  // Only an enemy pawn that stands diagonally next to it can take en passant.
  for (const dx of [-1, 1]) {
    for (const dy2 of [-1, 1]) {
      const nx = x + dx
      const ny = y + dy2
      if (nx < 0 || nx >= state.variant.board.width) continue
      if (ny < 0 || ny >= state.variant.board.height) continue
      const id = state.board[ny][nx]
      if (!id) continue
      const inst = state.pieces[id]
      // Only the side that is to move now can take en passant.
      if (inst.team !== state.turn) continue
      if (state.pieceTypes[inst.typeId]?.icon === 'pawn') return `${x},${y}`
    }
  }
  return '-'
}

function findSquare(state: GameState, pieceId: string) {
  for (let y = 0; y < state.board.length; y++) {
    const x = state.board[y].indexOf(pieceId)
    if (x >= 0) return { x, y }
  }
  return null
}
