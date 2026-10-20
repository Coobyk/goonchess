import type {
  BoardConfig,
  MovePattern,
  PieceFlags,
  PieceType,
  SetupPiece,
  Terrain,
  Tile,
  Variant,
  Vec,
} from './types'
import { uid } from './rules'

const ORTH: Vec[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]
const DIAG: Vec[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
]
const ALL8: Vec[] = [...ORTH, ...DIAG]
const KNIGHT: Vec[] = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: 2, y: -1 },
  { x: 1, y: -2 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
  { x: -2, y: 1 },
  { x: -1, y: 2 },
]

export function emptyBoard(width: number, height: number, light = '#e9dfcd', dark = '#9b7b5c'): BoardConfig {
  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ terrain: 'normal' as Terrain })),
  )
  return { width, height, light, dark, tiles }
}

export function leaper(vectors: Vec[], id = uid(), firstMoveOnly = false): MovePattern {
  return { id, kind: 'leaper', vectors, maxRange: 0, firstMoveOnly }
}

export function slider(vectors: Vec[], maxRange = 0, id = uid()): MovePattern {
  return { id, kind: 'slider', vectors, maxRange }
}

export function makePiece(
  partial: Omit<Partial<PieceType>, 'flags'> & { name: string; flags?: Partial<PieceFlags> },
): PieceType {
  return {
    id: partial.id ?? uid(),
    name: partial.name,
    icon: partial.icon ?? 'custom',
    symbol: partial.symbol ?? partial.name.slice(0, 1),
    value: partial.value ?? 1,
    move: partial.move ?? [leaper(ALL8)],
    capture: partial.capture ?? [],
    flags: {
      jump: false,
      mustCapture: false,
      uncapturable: false,
      royal: false,
      movesOnce: false,
      mirror: true,
      enPassant: false,
      ...partial.flags,
    },
    effects: partial.effects ?? [],
    promotion: partial.promotion ?? null,
  }
}

function put(
  setup: SetupPiece[],
  typeId: string,
  team: string,
  x: number,
  y: number,
) {
  setup.push({ typeId, team, x, y })
}

/* ------------------------------------------------------------ classic 8x8 */

export function classicChess(): Variant {
  const king = makePiece({ name: 'King', icon: 'king', value: 0, move: [leaper(ALL8)], flags: { royal: true } })
  const queen = makePiece({ name: 'Queen', icon: 'queen', value: 9, move: [slider(ALL8)] })
  const rook = makePiece({ name: 'Rook', icon: 'rook', value: 5, move: [slider(ORTH)] })
  const bishop = makePiece({ name: 'Bishop', icon: 'bishop', value: 3, move: [slider(DIAG)] })
  const knight = makePiece({ name: 'Knight', icon: 'knight', value: 3, move: [leaper(KNIGHT)], flags: { jump: true } })
  const pawn = makePiece({
    name: 'Pawn',
    icon: 'pawn',
    value: 1,
    move: [leaper([{ x: 0, y: -1 }])],
    capture: [leaper([{ x: -1, y: -1 }, { x: 1, y: -1 }])],
    flags: { enPassant: true },
  })
  const doubleStep = slider([{ x: 0, y: -1 }], 2)
  doubleStep.firstMoveOnly = true
  pawn.move = [...pawn.move, doubleStep]
  pawn.promotion = { typeId: queen.id }

  const pieceTypes = [king, queen, rook, bishop, knight, pawn]
  const setup: SetupPiece[] = []
  const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']
  const byName = (name: string) => pieceTypes.find((p) => p.name === name)!.id

  for (const team of ['black', 'white']) {
    const rank = team === 'black' ? 0 : 7
    const pawnRank = team === 'black' ? 1 : 6
    back.forEach((n, x) => put(setup, byName(n[0].toUpperCase() + n.slice(1)), team, x, rank))
    for (let x = 0; x < 8; x++) put(setup, pawn.id, team, x, pawnRank)
  }

  return {
    schema: 1,
    id: 'classic',
    name: 'Classic Chess',
    description: 'The standard 8×8 game, rebuilt with the same rule system the Maker uses.',
    board: emptyBoard(8, 8),
    teams: [
      { id: 'white', name: 'White', color: '#f4f1ea', forward: 'up' },
      { id: 'black', name: 'Black', color: '#3f3f46', forward: 'down' },
    ],
    pieceTypes,
    setup,
    winConditions: [
      { id: uid(), kind: 'checkmate' },
      { id: uid(), kind: 'kingCapture' },
    ],
  }
}

/* -------------------------------------------------------------- mini 6x6 */

export function miniChess(): Variant {
  const king = makePiece({ name: 'King', icon: 'king', value: 0, move: [leaper(ALL8)], flags: { royal: true } })
  const queen = makePiece({ name: 'Queen', icon: 'queen', value: 9, move: [slider(ALL8)] })
  const rook = makePiece({ name: 'Rook', icon: 'rook', value: 5, move: [slider(ORTH)] })
  const knight = makePiece({ name: 'Knight', icon: 'knight', value: 3, move: [leaper(KNIGHT)], flags: { jump: true } })
  const pawn = makePiece({
    name: 'Pawn',
    icon: 'pawn',
    value: 1,
    move: [leaper([{ x: 0, y: -1 }])],
    capture: [leaper([{ x: -1, y: -1 }, { x: 1, y: -1 }])],
    flags: { enPassant: true },
  })
  const miniDouble = slider([{ x: 0, y: -1 }], 2)
  miniDouble.firstMoveOnly = true
  pawn.move = [...pawn.move, miniDouble]
  pawn.promotion = { typeId: queen.id }

  const pieceTypes = [king, queen, rook, knight, pawn]
  const setup: SetupPiece[] = []
  const byName = (name: string) => pieceTypes.find((p) => p.name === name)!.id

  for (const team of ['black', 'white']) {
    const rank = team === 'black' ? 0 : 5
    const pawnRank = team === 'black' ? 1 : 4
    const row = ['Rook', 'Knight', 'Queen', 'King', 'Knight', 'Rook']
    row.forEach((n, x) => put(setup, byName(n), team, x, rank))
    for (let x = 0; x < 6; x++) put(setup, pawn.id, team, x, pawnRank)
  }

  return {
    schema: 1,
    id: 'mini',
    name: 'Mini Chess',
    description: 'A fast 6×6 duel. Pawns get a double step and promote to queens.',
    board: emptyBoard(6, 6, '#dcd6c8', '#7d6b57'),
    teams: [
      { id: 'white', name: 'White', color: '#f4f1ea', forward: 'up' },
      { id: 'black', name: 'Black', color: '#3f3f46', forward: 'down' },
    ],
    pieceTypes,
    setup,
    winConditions: [
      { id: uid(), kind: 'checkmate' },
      { id: uid(), kind: 'kingCapture' },
    ],
  }
}

/* ------------------------------------------------------------ chaos lab */

export function chaosLab(): Variant {
  const king = makePiece({ name: 'Warden', icon: 'king', value: 0, move: [leaper(ALL8)], flags: { royal: true } })
  const crawler = makePiece({
    name: 'Crawler',
    icon: 'rook',
    value: 4,
    move: [slider(ORTH, 2)],
    flags: { jump: true },
  })
  const diver = makePiece({
    name: 'Diver',
    icon: 'bishop',
    value: 3,
    move: [slider(DIAG)],
  })
  const leaper31 = makePiece({
    name: 'Long Leaper',
    icon: 'knight',
    value: 4,
    move: [
      leaper([
        { x: 3, y: 1 },
        { x: 3, y: -1 },
        { x: -3, y: 1 },
        { x: -3, y: -1 },
        { x: 1, y: 3 },
        { x: 1, y: -3 },
        { x: -1, y: 3 },
        { x: -1, y: -3 },
      ]),
    ],
    flags: { jump: true },
  })
  const diagonal2 = makePiece({
    name: 'Spider',
    icon: 'custom',
    symbol: '✦',
    value: 2,
    move: [leaper([{ x: 2, y: 2 }, { x: 2, y: -2 }, { x: -2, y: 2 }, { x: -2, y: -2 }])],
    flags: { jump: true },
  })
  const bomber = makePiece({
    name: 'Bomber',
    icon: 'custom',
    symbol: '☄',
    value: 5,
    move: [leaper(ALL8)],
    flags: { mirror: true },
    effects: [{ kind: 'explosion', radius: 1 }],
  })
  const gem = makePiece({
    name: 'Gem',
    icon: 'pawn',
    value: 3,
    move: [leaper([{ x: 0, y: -1 }])],
    capture: [leaper([{ x: -1, y: 0 }, { x: 1, y: 0 }])],
    flags: { uncapturable: true },
  })

  const pieceTypes = [king, crawler, diver, leaper31, diagonal2, bomber, gem]

  const board = emptyBoard(8, 8, '#2b2b3d', '#1d1d2b')
  // A pair of portals and two walls.
  board.tiles[3][3] = { terrain: 'portal', target: { x: 5, y: 5 } }
  board.tiles[5][5] = { terrain: 'portal', target: { x: 3, y: 3 } }
  board.tiles[2][6] = { terrain: 'wall' }
  board.tiles[5][1] = { terrain: 'wall' }

  const setup: SetupPiece[] = []
  for (const team of ['black', 'white']) {
    const rank = team === 'black' ? 0 : 7
    const pawnRank = team === 'black' ? 1 : 6
    if (team === 'black') {
      put(setup, king.id, team, 3, rank)
      put(setup, crawler.id, team, 0, rank)
      put(setup, crawler.id, team, 7, rank)
      put(setup, diver.id, team, 2, rank)
      put(setup, diver.id, team, 5, rank)
      put(setup, leaper31.id, team, 1, rank)
      put(setup, leaper31.id, team, 6, rank)
      put(setup, diagonal2.id, team, 4, rank)
      put(setup, bomber.id, team, 0, 2)
    } else {
      put(setup, king.id, team, 4, rank)
      put(setup, crawler.id, team, 0, rank)
      put(setup, crawler.id, team, 7, rank)
      put(setup, diver.id, team, 2, rank)
      put(setup, diver.id, team, 5, rank)
      put(setup, leaper31.id, team, 1, rank)
      put(setup, leaper31.id, team, 6, rank)
      put(setup, diagonal2.id, team, 3, rank)
      put(setup, bomber.id, team, 7, 5)
    }
    for (let x = 0; x < 8; x += 2) put(setup, gem.id, team, x, pawnRank)
  }

  return {
    schema: 1,
    id: 'chaos',
    name: 'Chaos Lab',
    description:
      'Portals, walls, uncapturable gems and a bomber whose blasts destroy enemies but spare its own side.',
    board,
    teams: [
      { id: 'white', name: 'Ivory', color: '#f4f1ea', forward: 'up' },
      { id: 'black', name: 'Onyx', color: '#a78bfa', forward: 'down' },
    ],
    pieceTypes,
    setup,
    winConditions: [
      { id: uid(), kind: 'kingCapture' },
      { id: uid(), kind: 'elimination' },
    ],
  }
}

/* ----------------------------------------------------------------- blank */

export function blankVariant(width = 8, height = 8): Variant {
  const king = makePiece({ name: 'King', icon: 'king', value: 0, move: [leaper(ALL8)], flags: { royal: true } })
  const pawn = makePiece({
    name: 'Pawn',
    icon: 'pawn',
    value: 1,
    move: [leaper([{ x: 0, y: -1 }])],
    capture: [leaper([{ x: -1, y: -1 }, { x: 1, y: -1 }])],
    flags: { enPassant: true },
  })
  return {
    schema: 1,
    id: 'blank',
    name: 'Untitled Variant',
    description: 'A blank canvas. Paint the board, then place your army.',
    board: emptyBoard(width, height),
    teams: [
      { id: 'white', name: 'White', color: '#f4f1ea', forward: 'up' },
      { id: 'black', name: 'Black', color: '#3f3f46', forward: 'down' },
    ],
    pieceTypes: [king, pawn],
    setup: [],
    winConditions: [
      { id: uid(), kind: 'checkmate' },
      { id: uid(), kind: 'kingCapture' },
    ],
  }
}

export const TEMPLATES: { id: string; name: string; description: string; build: () => Variant }[] = [
  { id: 'classic', name: 'Classic Chess', description: 'Standard 8×8', build: classicChess },
  { id: 'mini', name: 'Mini Chess', description: 'Fast 6×6', build: miniChess },
  { id: 'chaos', name: 'Chaos Lab', description: 'Portals and bombers', build: chaosLab },
]

export function defaultVariant(): Variant {
  return classicChess()
}
