import { uid } from '@/engine/rules'
import { BOARD_DARK, BOARD_LIGHT } from './palette'
import {
  PIECE_ICONS,
  type ArtShape,
  type BoardConfig,
  type Effect,
  type MovePattern,
  type PieceArtLayer,
  type PieceFlags,
  type PieceIcon,
  type PieceType,
  type SetupPiece,
  type Terrain,
  type Tile,
  type Variant,
  type VariantRule,
  type Vec,
  type WinCondition,
  type WinConditionKind,
} from '@/engine/types'

/**
 * Schema-aware packing for share links.
 *
 * The plain JSON form is full of redundancy — spelled-out keys, a random id on
 * every piece and pattern, and a tile entry for every single square even when
 * it is empty. This packs a variant into nested arrays with short positional
 * fields, index references instead of ids, a bitfield for flags and a sparse
 * tile list, which compresses roughly 13x smaller once deflated.
 *
 * Bump FORMAT_VERSION whenever the packed shape changes.
 */
export const FORMAT_VERSION = 6

const TERRAINS: Terrain[] = ['normal', 'void', 'wall', 'portal', 'oneway']
const WIN_KINDS: WinConditionKind[] = [
  'checkmate',
  'kingCapture',
  'elimination',
  'points',
  'center',
  'threeCheck',
  'antichess',
  'race',
  'predator',
]
/** The extra rules a variant can be built on, packed as a bitfield. */
const RULES: VariantRule[] = [
  'atomic',
  'crazyhouse',
  'forcedCapture',
  'noCheck',
  'noCastle',
  'predator',
]
const ICONS: PieceIcon[] = PIECE_ICONS.map((i) => i.id)
const SHAPES: ArtShape[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']

const FLAGS: [keyof PieceFlags, number][] = [
  ['jump', 1],
  ['mustCapture', 2],
  ['uncapturable', 4],
  ['royal', 8],
  ['movesOnce', 16],
  ['mirror', 32],
  ['enPassant', 64],
  ['dice', 128],
  ['random', 256],
  ['predator', 512],
]

const DEFAULT_TEAMS: Variant['teams'] = [
  { id: 'white', name: 'Ivory', color: '#f4f1ea', forward: 'up' },
  { id: 'black', name: 'Onyx', color: '#2b2b33', forward: 'down' },
]

/* ------------------------------------------------------------------ pack */

export function packVariant(variant: Variant): unknown {
  const pieceIndex = new Map(variant.pieceTypes.map((p, i) => [p.id, i]))
  const teamIndex = new Map(variant.teams.map((t, i) => [t.id, i]))

  return [
    FORMAT_VERSION,
    variant.name,
    variant.description,
    [
      variant.board.width,
      variant.board.height,
      // The square colours are no longer part of a variant, but the two slots
      // stay in the link format so old links still open.
      BOARD_LIGHT,
      BOARD_DARK,
      packTiles(variant.board),
    ],
    variant.teams.map((t) => [t.id, t.name, t.color, t.forward === 'down' ? 1 : 0]),
    variant.pieceTypes.map((p) => [
      p.name,
      ICONS.indexOf(p.icon),
      p.symbol,
      p.value,
      packFlags(p.flags),
      p.move.map(packPattern),
      p.capture.map(packPattern),
      p.effects.map((e) => packEffect(e, pieceIndex)),
      p.promotion
        ? p.promotion.typeIds.map((id) => pieceIndex.get(id) ?? -1).filter((i) => i >= 0)
        : [],
      (p.art ?? []).map(packArtLayer),
    ]),
    variant.setup.map((s) => [pieceIndex.get(s.typeId) ?? -1, teamIndex.get(s.team) ?? 0, s.x, s.y]),
    variant.winConditions.map((w) =>
      w.kind === 'points' ? [WIN_KINDS.indexOf('points'), w.threshold ?? 20] : [WIN_KINDS.indexOf(w.kind)],
    ),
    packRandomSeed(variant),
    packRules(variant.rules),
  ]
}

/** The extra rules the variant is built on, as a bitfield. */
function packRules(rules: VariantRule[] | undefined): number {
  let bits = 0
  for (const rule of rules ?? []) {
    const bit = RULES.indexOf(rule)
    if (bit >= 0) bits |= 1 << bit
  }
  return bits
}

/** The seed the random pieces are rolled from, if the variant has one. */
function packRandomSeed(variant: Variant): number {
  return variant.randomSeed ?? 0
}

/** Only squares that are not plain terrain are stored, as [x, y, terrain, tx?, ty?]. */
function packTiles(board: BoardConfig): number[][] {
  const out: number[][] = []
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const tile = board.tiles[y]?.[x]
      if (!tile || tile.terrain === 'normal') continue
      const row = [x, y, TERRAINS.indexOf(tile.terrain)]
      if (tile.terrain === 'portal' || tile.terrain === 'oneway') {
        const target = tile.target ?? { x: board.width - 1 - x, y: board.height - 1 - y }
        row.push(target.x, target.y)
      }
      out.push(row)
    }
  }
  return out
}

function packFlags(flags: PieceFlags): number {
  let bits = 0
  for (const [key, bit] of FLAGS) if (flags[key]) bits |= bit
  return bits
}

function packPattern(pattern: MovePattern): unknown[] {
  const row: unknown[] = [
    pattern.kind === 'slider' ? 1 : 0,
    pattern.maxRange,
    pattern.vectors.flatMap((v) => [v.x, v.y]),
  ]
  if (pattern.firstMoveOnly) row.push(1)
  return row
}

/** One shape in the drawing of a piece. */
function packArtLayer(layer: PieceArtLayer): unknown[] {
  const row: unknown[] = [SHAPES.indexOf(layer.shape), layer.x, layer.y, layer.scale]
  if (layer.crown) row.push(1)
  return row
}

function packEffect(effect: Effect, pieceIndex: Map<string, number>): unknown[] {
  if (effect.kind === 'swap') return [0]
  if (effect.kind === 'explosion') return [1, effect.radius]
  return [2, pieceIndex.get(effect.pieceTypeId) ?? -1, effect.offset.x, effect.offset.y]
}

/* ---------------------------------------------------------------- unpack */

/** Throws on anything that is not a well-formed packed variant. */
export function unpackVariant(input: unknown): Variant {
  if (!Array.isArray(input)) throw new Error('packed variant must be an array')
  // Version 2 is the same format without the drawings of composed pieces,
  // version 3 without the seed of the random pieces, and version 4 without
  // the random pieces themselves.
  if (
    input[0] !== FORMAT_VERSION &&
    input[0] !== 5 &&
    input[0] !== 4 &&
    input[0] !== 3 &&
    input[0] !== 2
  ) {
    throw new Error(`unsupported packed variant version: ${String(input[0])}`)
  }

  const [, name, description, board, teams, pieces, setup, wins, chaos, packedRules] = input
  if (!Array.isArray(board) || !Array.isArray(pieces)) {
    throw new Error('packed variant is missing required sections')
  }

  // The colours in the link are ignored; every board uses the same two shades.
  const [width, height, , , tiles] = board as [
    number,
    number,
    string,
    string,
    unknown,
  ]
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('packed variant has an invalid board size')
  }

  const grid: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ terrain: 'normal' as Terrain })),
  )
  if (Array.isArray(tiles)) {
    for (const raw of tiles) {
      if (!Array.isArray(raw)) continue
      const [x, y, code, tx, ty] = raw as number[]
      if (!grid[y]?.[x]) continue
      const terrain = TERRAINS[code] ?? 'normal'
      const tile: Tile = { terrain }
      if (terrain === 'portal' || terrain === 'oneway') {
        tile.target =
          Number.isFinite(tx) && Number.isFinite(ty)
            ? { x: tx, y: ty }
            : { x: width - 1 - x, y: height - 1 - y }
      }
      grid[y][x] = tile
    }
  }

  const teamList = (Array.isArray(teams) ? teams : [])
    .map((raw) => {
      if (!Array.isArray(raw)) return null
      const [id, teamName, color, forward] = raw as [string, string, string, number]
      if (typeof id !== 'string' || !id) return null
      return {
        id,
        name: typeof teamName === 'string' ? teamName : id,
        color: typeof color === 'string' ? color : '#888888',
        forward: forward === 1 ? ('down' as const) : ('up' as const),
      }
    })
    .filter((t): t is Variant['teams'][number] => t !== null)

  const ids = pieces.map(() => uid())

  const pieceTypes = pieces.map((raw, i) => {
    if (!Array.isArray(raw)) throw new Error('packed piece is malformed')
    const [pieceName, icon, symbol, value, flags, move, capture, effects, promo, art] = raw as [
      string,
      number,
      string,
      number,
      number,
      unknown,
      unknown,
      unknown,
      number | number[],
      unknown,
    ]
    const promoList = Array.isArray(promo) ? promo : Number.isInteger(promo) ? [promo] : []
    // Older links stored a single index; newer ones store a list.
    const promoIds = promoList
      .filter((i): i is number => Number.isInteger(i) && i >= 0 && !!ids[i])
      .map((i) => ids[i])
    return {
      id: ids[i],
      name: typeof pieceName === 'string' && pieceName ? pieceName : 'Piece',
      icon: ICONS[icon] ?? 'custom',
      symbol: typeof symbol === 'string' && symbol ? symbol : '?',
      value: Number.isFinite(value) ? value : 1,
      move: asArray(move).map(unpackPattern),
      capture: asArray(capture).map(unpackPattern),
      flags: unpackFlags(Number(flags) || 0),
      effects: asArray(effects)
        .map((e) => unpackEffect(e, ids))
        .filter((e): e is Effect => e !== null),
      promotion: promoIds.length ? { typeIds: promoIds } : null,
      art: asArray(art).map(unpackArtLayer).filter((l): l is PieceArtLayer => l !== null),
    } satisfies PieceType
  })

  const setupList: SetupPiece[] = asArray(setup)
    .map((raw) => {
      if (!Array.isArray(raw)) return null
      const [typeIdx, teamIdx, x, y] = raw as number[]
      const typeId = ids[typeIdx]
      const team = teamList[teamIdx]?.id
      if (!typeId || !team || !Number.isFinite(x) || !Number.isFinite(y)) return null
      return { typeId, team, x, y }
    })
    .filter((s): s is SetupPiece => s !== null)

  const winConditions: WinCondition[] = asArray(wins)
    .map((raw): WinCondition | null => {
      if (!Array.isArray(raw)) return null
      const kind = WIN_KINDS[raw[0] as number]
      if (!kind) return null
      return kind === 'points'
        ? { id: uid(), kind, threshold: Number(raw[1]) || 20 }
        : { id: uid(), kind }
    })
    .filter((w): w is WinCondition => w !== null)

  return {
    schema: 1,
    id: uid(),
    name: typeof name === 'string' && name ? name : 'Shared variant',
    description: typeof description === 'string' ? description : '',
    board: {
      width,
      height,
      tiles: grid,
    },
    teams: teamList.length ? teamList : DEFAULT_TEAMS,
    pieceTypes,
    setup: setupList,
    winConditions,
    randomSeed: Number.isFinite(chaos) ? (chaos as number) : undefined,
    rules: unpackRules(packedRules),
  }
}

/** The extra rules a variant is built on, read back from the bitfield. */
function unpackRules(bits: unknown): VariantRule[] | undefined {
  if (!Number.isFinite(bits as number)) return undefined
  const mask = Number(bits)
  const rules = RULES.filter((_, i) => (mask & (1 << i)) !== 0)
  return rules.length ? rules : undefined
}

const asArray = (input: unknown): unknown[] => (Array.isArray(input) ? input : [])

function unpackFlags(bits: number): PieceFlags {
  const flags = {
    jump: false,
    mustCapture: false,
    uncapturable: false,
    royal: false,
    movesOnce: false,
    mirror: false,
    enPassant: false,
    dice: false,
    random: false,
    predator: false,
  }
  for (const [key, bit] of FLAGS) flags[key] = (bits & bit) !== 0
  return flags
}

function unpackPattern(raw: unknown): MovePattern {
  if (!Array.isArray(raw)) throw new Error('packed move pattern is malformed')
  const [kind, maxRange, flat, firstMoveOnly] = raw as [number, number, number[], number]
  const vectors: Vec[] = []
  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) {
      vectors.push({ x: Number(flat[i]) || 0, y: Number(flat[i + 1]) || 0 })
    }
  }
  return {
    id: uid(),
    kind: kind === 1 ? 'slider' : 'leaper',
    vectors,
    maxRange: Number(maxRange) || 0,
    firstMoveOnly: firstMoveOnly === 1,
  }
}

/** One shape in the drawing of a piece. */
function unpackArtLayer(raw: unknown): PieceArtLayer | null {
  if (!Array.isArray(raw)) return null
  const [shape, x, y, scale, crown] = raw as [number, number, number, number, number]
  if (!Number.isInteger(shape) || shape < 0 || shape >= SHAPES.length) return null
  return {
    shape: SHAPES[shape],
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    scale: Number.isFinite(scale) ? scale : 1,
    crown: crown === 1,
  }
}

function unpackEffect(raw: unknown, ids: string[]): Effect | null {
  if (!Array.isArray(raw)) return null
  const [code, arg, ox, oy] = raw as [number, number, number, number]
  if (code === 0) return { kind: 'swap' }
  if (code === 1) return { kind: 'explosion', radius: Math.max(1, Math.min(3, Number(arg) || 1)) }
  const pieceTypeId = ids[arg]
  if (!pieceTypeId) return null
  return { kind: 'spawn', pieceTypeId, offset: { x: Number(ox) || 0, y: Number(oy) || 0 } }
}
