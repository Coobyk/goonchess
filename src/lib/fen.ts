import type { GameState, Move, Variant } from '@/engine/types'
import { createInitialState, squareName } from '@/engine/rules'
import { castlingRights, enPassantTarget, findSquare } from '@/engine/repetition'
import { classicChess } from '@/engine/templates'

/**
 * FEN — the standard text form of a chess position.
 *
 * It only knows the six classic pieces, so a variant with custom pieces cannot
 * be written as FEN. Importing gives back a classic variant that can be
 * edited in the Maker afterwards.
 */

const LETTERS: Record<string, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
}

const BY_LETTER: Record<string, string> = {
  K: 'King',
  Q: 'Queen',
  R: 'Rook',
  B: 'Bishop',
  N: 'Knight',
  P: 'Pawn',
}

export function canUseFen(variant: Variant): boolean {
  return variant.pieceTypes.every((piece) => !!LETTERS[piece.icon])
}

/** Writes the position as FEN. Returns null when the variant cannot be. */
export function toFen(state: GameState): string | null {
  const { variant } = state
  if (!canUseFen(variant)) return null

  const rankRows: string[] = []
  for (let y = 0; y < variant.board.height; y++) {
    let row = ''
    let empty = 0
    for (let x = 0; x < variant.board.width; x++) {
      const id = state.board[y][x]
      if (!id) {
        empty += 1
        continue
      }
      const inst = state.pieces[id]
      const piece = state.pieceTypes[inst.typeId]
      const letter = piece ? LETTERS[piece.icon] : undefined
      if (!letter) return null
      if (empty) {
        row += empty
        empty = 0
      }
      row += inst.team === variant.teams[0]?.id ? letter : letter.toLowerCase()
    }
    if (empty) row += empty
    rankRows.push(row)
  }

  const sideToMove = state.turn === variant.teams[0]?.id ? 'w' : 'b'
  const castling = castlingRights(state)
  const ep = enPassantTarget(state)
  const enPassant = ep ? squareName(variant, ep.x, ep.y) : '-'
  const halfmove = halfmoveClock(state)
  const fullmove = Math.floor(state.moveHistory.length / 2) + 1

  return `${rankRows.join('/')} ${sideToMove} ${castling} ${enPassant} ${halfmove} ${fullmove}`
}




function halfmoveClock(state: GameState): number {
  let count = 0
  for (let i = state.moveHistory.length - 1; i >= 0; i--) {
    const record = state.moveHistory[i]
    const piece = state.pieceTypes[state.pieces[record.move.pieceId]?.typeId ?? '']
    if (record.move.capturedId || piece?.icon === 'pawn') break
    count += 1
  }
  return count
}

/** Reads a FEN into a classic variant that can be edited in the Maker. */
export function fromFen(fen: string): { variant: Variant; game: GameState } | null {
  const parts = fen.trim().split(/\s+/)
  if (parts.length < 4) return null
  const [layout, side, castling, enPassant] = parts
  const base = classicChess()
  const byName = new Map(base.pieceTypes.map((p) => [p.name, p]))

  const rows = layout.split('/')
  if (rows.length !== base.board.height) return null
  const setup = base.setup.filter((s) => {
    const piece = base.pieceTypes.find((p) => p.id === s.typeId)
    return piece?.icon !== 'king'
  })
  const kings: { team: string; x: number; y: number }[] = []

  for (let y = 0; y < rows.length; y++) {
    let x = 0
    for (const char of rows[y]) {
      if (char >= '1' && char <= '8') {
        x += Number(char)
        continue
      }
      const upper = char.toUpperCase()
      const name = BY_LETTER[upper]
      const piece = name ? byName.get(name) : undefined
      if (!piece) return null
      const team = char === upper ? base.teams[0].id : base.teams[1].id
      if (piece.icon === 'king') kings.push({ team, x, y })
      else setup.push({ typeId: piece.id, team, x, y })
      x += 1
    }
  }
  if (kings.length < 2) return null
  for (const king of kings) {
    setup.push({ typeId: byName.get('King')!.id, team: king.team, x: king.x, y: king.y })
  }

  const variant: Variant = {
    ...base,
    id: 'fen',
    name: 'Imported position',
    description: 'Imported from a FEN, and ready to be edited in the Maker.',
    setup,
  }
  const game = createInitialState(variant)
  const turn = side === 'b' ? variant.teams[1].id : variant.teams[0].id
  game.turn = turn

  // The engine only knows castling from the unmoved flags, so a letter the
  // FEN withholds is written back as a rook (or the king) having moved.
  const rights = castling ?? '-'
  for (const team of variant.teams) {
    const upper = team.id === variant.teams[0].id
    const home = upper ? variant.board.height - 1 : 0
    const [k, q] = upper ? ['K', 'Q'] : ['k', 'q']
    if (!rights.includes(k) && !rights.includes(q)) {
      // The king has no rights either side, so it cannot castle at all.
      const king = Object.keys(game.pieces).find((id) => {
        const inst = game.pieces[id]
        const at = findSquare(game, id)
        return inst.team === team.id && game.pieceTypes[inst.typeId]?.icon === 'king' && at?.y === home
      })
      if (king) game.pieces[king].hasMoved = true
      continue
    }
    for (const [letter, wing] of [[k, 1], [q, -1]] as const) {
      if (rights.includes(letter)) continue
      // The rook on that wing has moved (or is gone, which denies the castle
      // just the same).
      const rook = Object.keys(game.pieces).find((id) => {
        const inst = game.pieces[id]
        const at = findSquare(game, id)
        const onWing = at && Math.sign(at.x - variant.board.width / 2 + 0.5) === wing
        return inst.team === team.id && game.pieceTypes[inst.typeId]?.icon === 'rook' && at?.y === home && onWing
      })
      if (rook) game.pieces[rook].hasMoved = true
    }
  }

  // The engine only knows en passant from the last move, so the push that
  // opened it is written into the history: the square the FEN names is the
  // one that was skipped, and the pawn that crossed it stands beside it on
  // the same file, on the team that is not to move.
  if (enPassant !== '-') {
    const file = enPassant.charCodeAt(0) - 97
    const y = variant.board.height - Number(enPassant[1])
    const pawnId = Object.keys(game.pieces).find((id) => {
      const inst = game.pieces[id]
      if (inst.team === turn) return false
      if (!game.pieceTypes[inst.typeId]?.flags.enPassant) return false
      const at = findSquare(game, id)
      return !!at && at.x === file && Math.abs(at.y - y) === 1
    })
    if (pawnId) {
      const to = findSquare(game, pawnId)!
      const from = { x: file, y: 2 * y - to.y }
      const move: Move = {
        from,
        to,
        pieceId: pawnId,
        effects: [],
        finalTo: to,
      }
      game.moveHistory = [
        {
          move,
          team: game.pieces[pawnId].team,
          notation: `${squareName(variant, from.x, from.y)}-${squareName(variant, to.x, to.y)}`,
        },
      ]
    }
  }

  return { variant, game }
}
