import type { GameState, Move, Variant } from '@/engine/types'
import { createInitialState, squareName, teamById } from '@/engine/rules'
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
  const enPassant = enPassantSquare(state)
  const halfmove = halfmoveClock(state)
  const fullmove = Math.floor(state.moveHistory.length / 2) + 1

  return `${rankRows.join('/')} ${sideToMove} ${castling} ${enPassant} ${halfmove} ${fullmove}`
}

function castlingRights(state: GameState): string {
  const { variant } = state
  const rights: string[] = []
  for (const team of variant.teams) {
    const home = team.id === variant.teams[0]?.id ? variant.board.height - 1 : 0
    // The king must be home and unmoved.
    let kingHome = false
    const rooks: { x: number }[] = []
    for (const id in state.pieces) {
      const inst = state.pieces[id]
      if (inst.team !== team.id || inst.hasMoved) continue
      const piece = state.pieceTypes[inst.typeId]
      const at = findSquare(state, id)
      if (!at || at.y !== home) continue
      if (piece?.icon === 'king') kingHome = true
      if (piece?.icon === 'rook') rooks.push({ x: at.x })
    }
    if (!kingHome || rooks.length < 2) continue
    const left = Math.min(...rooks.map((r) => r.x))
    const right = Math.max(...rooks.map((r) => r.x))
    const upper = team.id === variant.teams[0]?.id
    if (left < variant.board.width / 2) rights.push(upper ? 'Q' : 'q')
    if (right >= variant.board.width / 2) rights.push(upper ? 'K' : 'k')
  }
  // The rights are written in the usual order: KQkq.
  const order = 'KQkq'
  const set = new Set(rights)
  const sorted = order.split('').filter((c) => set.has(c)).join('')
  return sorted || '-'
}

function findSquare(state: GameState, pieceId: string) {
  for (let y = 0; y < state.board.length; y++) {
    const x = state.board[y].indexOf(pieceId)
    if (x >= 0) return { x, y }
  }
  return null
}

function enPassantSquare(state: GameState): string {
  const last = state.moveHistory[state.moveHistory.length - 1]
  if (!last) return '-'
  const piece = state.pieceTypes[state.pieces[last.move.pieceId]?.typeId ?? '']
  if (piece?.icon !== 'pawn') return '-'
  const dy = last.move.finalTo.y - last.move.from.y
  if (Math.abs(dy) !== 2) return '-'
  const x = last.move.finalTo.x
  const y = last.move.finalTo.y - Math.sign(dy)
  return `${String.fromCharCode(97 + x)}${state.variant.board.height - y}`
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

  // The engine only knows en passant from the last move, so a double push is
  // written into the history to make it work.
  if (enPassant !== '-') {
    const file = enPassant.charCodeAt(0) - 97
    const rank = Number(enPassant[1])
    const y = variant.board.height - rank
    const team = turn
    const pawnId = Object.keys(game.pieces).find((id) => {
      const inst = game.pieces[id]
      if (inst.team !== team) return false
      const piece = game.pieceTypes[inst.typeId]
      if (piece?.icon !== 'pawn') return false
      const at = findSquare(game, id)
      return !!at && at.x === file
    })
    if (pawnId) {
      const from = { x: file, y: y === 0 ? 1 : y + 1 }
      const to = { x: file, y }
      const move: Move = {
        from,
        to,
        pieceId: pawnId,
        effects: [],
        finalTo: to,
      }
      game.pieces[pawnId].hasMoved = true
      game.moveHistory = [
        {
          move,
          team,
          notation: `Pawn ${squareName(variant, from.x, from.y)}-${squareName(variant, to.x, to.y)}`,
        },
      ]
    }
  }

  void castling
  void teamById
  return { variant, game }
}
