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

export function emptyBoard(width: number, height: number): BoardConfig {
  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ terrain: 'normal' as Terrain })),
  )
  return { width, height, tiles }
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
      random: false,
      mirror: true,
      enPassant: false,
      dice: false,
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
  // As in chess: the player picks what the pawn becomes on the far rank.
  pawn.promotion = { typeIds: [queen.id, rook.id, bishop.id, knight.id] }

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
  // The small army has no bishop, so a pawn may become a queen, rook or knight.
  pawn.promotion = { typeIds: [queen.id, rook.id, knight.id] }

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
    description: 'A fast 6×6 duel. Pawns get a double step and promote to a piece of your choice.',
    board: emptyBoard(6, 6),
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

/* ---------------------------------------------------------- only horses */

/**
 * Every man is a horse, and every horse jumps. The usual chess army, with the
 * royal horse as the only piece you have to keep alive.
 */
export function onlyHorses(): Variant {
  const horse = makePiece({
    name: 'Horse',
    icon: 'knight',
    value: 1,
    move: [leaper(KNIGHT)],
    flags: { jump: true },
  })
  const royalHorse = makePiece({
    name: 'Royal Horse',
    icon: 'king',
    value: 0,
    move: [leaper(KNIGHT)],
    flags: { jump: true, royal: true },
  })

  const pieceTypes = [royalHorse, horse]
  const setup: SetupPiece[] = []
  // The usual back rank, but every square on it holds a horse.
  const back = [horse, horse, horse, horse, royalHorse, horse, horse, horse]
  for (const team of ['black', 'white']) {
    const rank = team === 'black' ? 0 : 7
    const pawnRank = team === 'black' ? 1 : 6
    back.forEach((piece, x) => put(setup, piece.id, team, x, rank))
    for (let x = 0; x < 8; x++) put(setup, horse.id, team, x, pawnRank)
  }

  return {
    schema: 1,
    id: 'horses',
    name: 'Only Horses',
    description:
      'Every piece is a horse and every horse jumps. The royal horse is the one to watch.',
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
      { id: uid(), kind: 'elimination' },
    ],
  }
}

/* ------------------------------------------------------------ bomb queen */

/**
 * Classic chess with a bomb for a queen: it steps one square in any
 * direction, and every capture sets off a blast that takes the enemy pieces
 * around it with it.
 */
export function bombQueen(): Variant {
  const king = makePiece({ name: 'King', icon: 'king', value: 0, move: [leaper(ALL8)], flags: { royal: true } })
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
  const queen = makePiece({
    name: 'Bomb Queen',
    icon: 'queen',
    value: 9,
    move: [leaper(ALL8)],
    effects: [{ kind: 'explosion', radius: 1 }],
    promotion: { typeIds: [pawn.id] },
  })
  // The bomb queen is one of the choices, so a pawn can still become a bomb.
  pawn.promotion = { typeIds: [queen.id, rook.id, bishop.id, knight.id] }
  const doubleStep = slider([{ x: 0, y: -1 }], 2)
  doubleStep.firstMoveOnly = true
  pawn.move = [...pawn.move, doubleStep]

  const pieceTypes = [king, queen, rook, bishop, knight, pawn]
  const setup: SetupPiece[] = []
  const back = [rook, knight, bishop, queen, king, bishop, knight, rook]

  for (const team of ['black', 'white']) {
    const rank = team === 'black' ? 0 : 7
    const pawnRank = team === 'black' ? 1 : 6
    back.forEach((piece, x) => put(setup, piece.id, team, x, rank))
    for (let x = 0; x < 8; x++) put(setup, pawn.id, team, x, pawnRank)
  }

  return {
    schema: 1,
    id: 'bomb-queen',
    name: 'Bomb Queen',
    description:
      'Classic chess with a bomb for a queen: it steps one square in any direction and detonates on every capture.',
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

/* -------------------------------------------------------- lucky rollers */

/**
 * Every other piece throws a die to decide how it moves: a knight one roll,
 * a slider the next. The royal piece is the only one that always walks.
 */
export function luckyRollers(): Variant {
  const king = makePiece({ name: 'King', icon: 'king', value: 0, move: [leaper(ALL8)], flags: { royal: true } })
  const roller = makePiece({
    name: 'Roller',
    icon: 'knight',
    value: 3,
    move: [leaper(KNIGHT), slider(ORTH, 2)],
    flags: { dice: true, jump: true },
  })
  const pawn = makePiece({
    name: 'Pawn',
    icon: 'pawn',
    value: 1,
    move: [leaper([{ x: 0, y: -1 }])],
    capture: [leaper([{ x: -1, y: -1 }, { x: 1, y: -1 }])],
  })

  const pieceTypes = [king, roller, pawn]
  const setup: SetupPiece[] = []
  const back = [roller, roller, pawn, pawn, king, pawn, pawn, roller]
  for (const team of ['black', 'white']) {
    const rank = team === 'black' ? 0 : 7
    const pawnRank = team === 'black' ? 1 : 6
    back.forEach((piece, x) => put(setup, piece.id, team, x, rank))
    for (let x = 0; x < 8; x++) put(setup, pawn.id, team, x, pawnRank)
  }

  return {
    schema: 1,
    id: 'rollers',
    name: 'Lucky Rollers',
    description:
      'The rollers throw a die to move: a knight one roll, a slider the next. Nothing is certain.',
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

  const board = emptyBoard(8, 8)
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

/* ----------------------------------------------------------- random chess */

/**
 * A game where the pieces change their kind after every move.
 *
 * Every piece but the king is marked random, so after each move it is given
 * a new kind, drawn at random from the kinds of the variant. The pieces wear
 * the colours of a rainbow, so it is clear at a glance that they are not
 * what they seem.
 */
export function randomChess(seed = Math.floor(Math.random() * 2 ** 31)): Variant {
  const base = classicChess()
  const pieceTypes = base.pieceTypes.map((piece) =>
    piece.flags.royal ? piece : { ...piece, flags: { ...piece.flags, random: true } },
  )
  const byName = new Map(pieceTypes.map((p) => [p.name, p.id]))
  const setup = base.setup.map((s) => ({
    ...s,
    typeId: byName.get(pieceTypes.find((p) => p.id === s.typeId)?.name ?? '') ?? s.typeId,
  }))
  return {
    ...base,
    id: 'random',
    name: 'Random Chess',
    description:
      'Every piece but the king is rolled anew after every move, so nobody knows what they will be.',
    pieceTypes,
    setup,
    randomSeed: seed,
  }
}

/* -------------------------------------------------------------- chess960 */

/** A plain shuffle, so every game is dealt a different back rank. */
function shuffle<T>(list: T[]): T[] {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * One of the 960 back ranks: the bishops on squares of opposite colour and the
 * king somewhere between the rooks. Once the two bishops and the queen are
 * down, two of the five squares left are the knights' — and the last three
 * are filled rook, king, rook, which is exactly what leaves the king in
 * between them.
 */
function randomBackRank(): string[] {
  const rank: (string | null)[] = Array(8).fill(null)
  const free = () => [0, 1, 2, 3, 4, 5, 6, 7].filter((x) => rank[x] === null)
  const pick = (list: number[]) => list[Math.floor(Math.random() * list.length)]
  rank[pick([0, 2, 4, 6])] = 'B'
  rank[pick([1, 3, 5, 7])] = 'B'
  const afterBishops = free()
  rank[pick(afterBishops)] = 'Q'
  const knights = shuffle(free()).slice(0, 2)
  for (const x of knights) rank[x] = 'N'
  const last = free().sort((a, b) => a - b)
  rank[last[0]] = 'R'
  rank[last[1]] = 'K'
  rank[last[2]] = 'R'
  return rank as string[]
}

/**
 * Deals a fresh back rank over the one a variant already has, using that
 * variant's own pieces — so a Chess960 game can be played again without
 * losing anything else about it. Black is set up on the same files as White,
 * which is how Chess960 puts the two armies opposite each other.
 */
export function reshuffleChess960(variant: Variant): Variant {
  const names: Record<string, string> = {
    K: 'King',
    Q: 'Queen',
    R: 'Rook',
    B: 'Bishop',
    N: 'Knight',
  }
  const ids = new Map(variant.pieceTypes.map((p) => [p.name.toLowerCase(), p.id]))
  const order = randomBackRank()
  const wanted = order.map((letter) => ids.get(names[letter].toLowerCase()))
  // A variant whose pieces have been renamed or removed cannot be dealt again.
  if (wanted.some((id) => !id)) return variant

  const height = variant.board.height
  const home = (team: string) => (team === variant.teams[0]?.id ? height - 1 : 0)
  const setup = variant.setup.filter((s) => s.y !== home(s.team))
  for (const team of variant.teams) {
    const y = home(team.id)
    wanted.forEach((typeId, x) => {
      if (typeId) setup.push({ typeId, team: team.id, x, y })
    })
  }
  return { ...variant, setup }
}

export function chess960(): Variant {
  const base = classicChess()
  const dealt = reshuffleChess960(base)
  return {
    ...base,
    id: 'chess960',
    name: 'Chess960',
    description: 'The starting position of the home rank pieces is randomized.',
    setup: dealt.setup,
  }
}

/* ------------------------------------------------------- king of the hill */

/**
 * Classic chess with a hill in the middle: checkmate still wins, and so does
 * walking your own king onto one of the four centre squares.
 */
export function kingOfTheHill(): Variant {
  const base = classicChess()
  return {
    ...base,
    id: 'king-of-the-hill',
    name: 'King of the Hill',
    description: 'Bring your King to the center to win the game.',
    winConditions: [
      { id: uid(), kind: 'checkmate' },
      { id: uid(), kind: 'kingCapture' },
      { id: uid(), kind: 'center' },
    ],
  }
}

/* ------------------------------------------------------------ three check */

/**
 * Classic chess with a counter over the board: every check you give is banked,
 * and the third one wins the game as surely as a checkmate would.
 */
export function threeCheck(): Variant {
  const base = classicChess()
  return {
    ...base,
    id: 'three-check',
    name: 'Three-Check',
    description: 'Check your opponent 3 times to win the game.',
    winConditions: [
      { id: uid(), kind: 'checkmate' },
      { id: uid(), kind: 'kingCapture' },
      { id: uid(), kind: 'threeCheck' },
    ],
  }
}

export const TEMPLATES: {
  id: string
  name: string
  description: string
  build: () => Variant
  /** Lays a fresh board for the same variant — used to deal a new game. */
  freshSetup?: (variant: Variant) => Variant
}[] = [
  { id: 'classic', name: 'Classic Chess', description: 'Standard 8×8', build: classicChess },
  { id: 'mini', name: 'Mini Chess', description: 'Fast 6×6', build: miniChess },
  { id: 'horses', name: 'Only Horses', description: 'Every piece jumps', build: onlyHorses },
  { id: 'random', name: 'Random Chess', description: 'The pieces change', build: randomChess },
  { id: 'bomb-queen', name: 'Bomb Queen', description: 'A queen that detonates', build: bombQueen },
  { id: 'rollers', name: 'Lucky Rollers', description: 'They roll to move', build: luckyRollers },
  { id: 'chaos', name: 'Chaos Lab', description: 'Portals and bombers', build: chaosLab },
  {
    id: 'chess960',
    name: 'Chess960',
    description: 'A shuffled back rank',
    build: chess960,
    freshSetup: reshuffleChess960,
  },
  {
    id: 'king-of-the-hill',
    name: 'King of the Hill',
    description: 'The king takes the centre',
    build: kingOfTheHill,
  },
  {
    id: 'three-check',
    name: 'Three-Check',
    description: 'Three checks win',
    build: threeCheck,
  },
]

export function defaultVariant(): Variant {
  return classicChess()
}
