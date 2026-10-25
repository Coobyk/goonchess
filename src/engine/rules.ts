import type {
  Blast,
  Effect,
  GameState,
  Move,
  MovePattern,
  MoveRecord,
  PieceType,
  TeamConfig,
  Tile,
  Variant,
  Vec,
} from './types'
import { positionKey } from './repetition'

export const uid = () => Math.random().toString(36).slice(2, 10)

export const opposite = (v: Vec): Vec => ({ x: v.x, y: v.y })

export function inBounds(board: { width: number; height: number }, x: number, y: number) {
  return x >= 0 && y >= 0 && x < board.width && y < board.height
}

/**
 * The board of a variant never changes, so the things a search keeps asking
 * about it — what terrain a square has, whether it blocks, where a portal
 * leads — are worked out once per variant and kept.
 */
interface Geometry {
  width: number
  height: number
  /** tiles[index] — the terrain of a square, null when it has none. */
  tiles: (Tile | null)[]
  /** 1 when the square blocks movement. */
  blocking: Uint8Array
  /** Where a portal leads: the index of the square, -1 when there is none. */
  portal: Int32Array
  /** Which way each team advances. */
  forward: Record<string, 'up' | 'down'>
}

const geometryCache = new WeakMap<Variant, Geometry>()

function geometryFor(variant: Variant): Geometry {
  const cached = geometryCache.get(variant)
  if (cached) return cached
  const { width, height } = variant.board
  const tiles: (Tile | null)[] = new Array(width * height).fill(null)
  const blocking = new Uint8Array(width * height)
  const portal = new Int32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const tile = variant.board.tiles[y]?.[x] ?? null
      tiles[index] = tile
      if (!tile) {
        // A square without terrain blocks everything, and leads nowhere.
        blocking[index] = 1
        portal[index] = -1
        continue
      }
      blocking[index] = tile.terrain === 'void' || tile.terrain === 'wall' ? 1 : 0
      if (tile.terrain === 'portal' || tile.terrain === 'oneway') {
        // Portals never chain, so one hop is the whole story.
        const dest = tile.target ?? { x: width - 1 - x, y: height - 1 - y }
        portal[index] =
          dest.x >= 0 && dest.y >= 0 && dest.x < width && dest.y < height
            ? dest.y * width + dest.x
            : -1
        continue
      }
      portal[index] = index
    }
  }
  const geometry = { width, height, tiles, blocking, portal, forward: forwardOf(variant) }
  geometryCache.set(variant, geometry)
  return geometry
}

/** Which way each team advances. */
function forwardOf(variant: Variant): Record<string, 'up' | 'down'> {
  const forward: Record<string, 'up' | 'down'> = {}
  for (const team of variant.teams) forward[team.id] = team.forward
  return forward
}

export function tileAt(variant: Variant, x: number, y: number): Tile | null {
  const geo = geometryFor(variant)
  if (x < 0 || y < 0 || x >= geo.width || y >= geo.height) return null
  return geo.tiles[y * geo.width + x]
}

export function teamById(variant: Variant, id: string): TeamConfig | undefined {
  return variant.teams.find((t) => t.id === id)
}

/** file letter, rank number: y grows downward, so the bottom rank is 1. */
export function squareName(variant: Variant, x: number, y: number) {
  const file = String.fromCharCode(97 + x)
  const rank = variant.board.height - y
  return `${file}${rank}`
}

/** Resolves a portal / one-way tile in a single hop. Portals never chain. */
export function resolvePortals(variant: Variant, x: number, y: number): Vec | null {
  const geo = geometryFor(variant)
  if (x < 0 || y < 0 || x >= geo.width || y >= geo.height) return null
  const index = geo.portal[y * geo.width + x]
  if (index < 0) return null
  return { x: index % geo.width, y: (index / geo.width) | 0 }
}

function isBlocking(tile: Tile | null) {
  return !tile || tile.terrain === 'void' || tile.terrain === 'wall'
}

/**
 * Turns a pattern the way a team sees it.
 *
 * A team that advances downwards sees the board mirrored, so a step that goes
 * "forward" in the pattern goes the other way on the board.
 */
function orient(piece: PieceType, forward: 'up' | 'down', v: Vec): Vec {
  if (!piece.flags.mirror || forward !== 'down') return v
  return { x: v.x, y: -v.y }
}

/* ----------------------------------------------------------- state setup */

export function createInitialState(variant: Variant): GameState {
  const board: (string | null)[][] = Array.from({ length: variant.board.height }, () =>
    Array.from({ length: variant.board.width }, () => null),
  )
  const pieces: GameState['pieces'] = {}
  const pieceTypes: Record<string, PieceType> = {}
  for (const pt of variant.pieceTypes) pieceTypes[pt.id] = pt

  for (const s of variant.setup) {
    const pt = pieceTypes[s.typeId]
    if (!pt) continue
    if (!variant.teams.some((t) => t.id === s.team)) continue
    if (!inBounds(variant.board, s.x, s.y)) continue
    if (board[s.y][s.x] !== null) continue
    // The id only depends on where the piece stands, so a game can be rebuilt
    // from its start — that is what the replay and the exports need.
    const id = `${s.typeId}|${s.team}|${s.x},${s.y}`
    pieces[id] = { id, typeId: s.typeId, team: s.team, hasMoved: false }
    board[s.y][s.x] = id
  }

  const scores: Record<string, number> = {}
  for (const t of variant.teams) scores[t.id] = 0

  const state: GameState = {
    variant,
    board,
    pieces,
    pieceTypes,
    turn: variant.teams[0]?.id ?? 'white',
    moveHistory: [],
    captured: [],
    winner: null,
    scores,
    status: 'active',
    // The rolls of the random pieces start from the seed of the variant, so a
    // game can be rebuilt and played out the same way.
    randomSeed: variant.randomSeed ?? 1,
  }
  // The opening position counts towards a repetition.
  state.startKey = positionKey(state)
  return state
}

/** The pattern a die picked out of a piece's patterns. */
function dicePattern(patterns: MovePattern[], roll: number): MovePattern[] {
  const list = patterns.filter(Boolean)
  if (!list.length) return []
  const index = ((Math.max(1, roll) - 1) % list.length + list.length) % list.length
  return [list[index]]
}

/* ------------------------------------------------------ scratch for moves */

/**
 * Move generation marks the squares it has already reached, so that two
 * patterns leading to the same square do not produce the same move twice. A
 * search does this thousands of times a second, so the marks live in a small
 * buffer that is borrowed and handed back instead of being allocated every
 * time.
 */
const scratchBuffers: Uint8Array[] = []
let scratchDepth = 0

function takeScratch(size: number): Uint8Array {
  const depth = scratchDepth++
  let buf = scratchBuffers[depth]
  if (!buf || buf.length < size) {
    buf = new Uint8Array(size)
    scratchBuffers[depth] = buf
  }
  buf.fill(0, 0, size)
  return buf
}

function giveScratch() {
  scratchDepth -= 1
}

export function movesFor(state: GameState, x: number, y: number): Move[] {
  const { width, height } = state.variant.board
  const seen = takeScratch(width * height)
  const moves = generateMoves(state, x, y, seen)
  giveScratch()
  return moves
}

function generateMoves(state: GameState, x: number, y: number, seen: Uint8Array): Move[] {
  const { variant } = state
  const geo = geometryFor(variant)
  const pieceId = state.board[y]?.[x]
  if (!pieceId) return []
  const inst = state.pieces[pieceId]
  if (!inst) return []
  const piece = state.pieceTypes[inst.typeId]
  if (!piece) return []
  if (piece.flags.movesOnce && inst.hasMoved) return []

  const moves: Move[] = []
  // Every move of this piece starts on the same square, so they all share it.
  const from = { x, y }

  // A piece that reaches the far rank may turn into one of several pieces.
  const promoOptions = (piece.promotion?.typeIds ?? []).filter((id) => !!state.pieceTypes[id])
  const forward = geo.forward[inst.team] ?? 'up'
  const farRank = forward === 'down' ? geo.height - 1 : 0

  const push = (
    tx: number,
    ty: number,
    mode: 'move' | 'capture',
    allowCapture: boolean,
  ) => {
    if (tx < 0 || ty < 0 || tx >= geo.width || ty >= geo.height) return
    const index = ty * geo.width + tx
    if (geo.blocking[index]) return
    const finalIndex = geo.portal[index]
    if (finalIndex < 0) return
    const fx = finalIndex % geo.width
    const fy = (finalIndex / geo.width) | 0
    if (geo.blocking[finalIndex]) return

    const occupant = state.board[fy][fx]
    if (seen[finalIndex]) return
    const promotion = promoOptions.length && fy === farRank ? promoOptions : undefined

    if (occupant === null) {
      if (mode === 'capture') return
      seen[finalIndex] = 1
      const finalTo = { x: fx, y: fy }
      moves.push({
        from,
        to: fx === tx && fy === ty ? finalTo : { x: tx, y: ty },
        pieceId,
        effects: piece.effects,
        finalTo,
        promotionOptions: promotion,
        roll: piece.flags.dice ? roll : undefined,
      })
      return
    }

    const occInst = state.pieces[occupant]
    if (!occInst) return
    if (occInst.team === inst.team) return
    if (!allowCapture && mode === 'move') return
    const occPiece = state.pieceTypes[occInst.typeId]
    if (occPiece?.flags.uncapturable) return
    seen[finalIndex] = 1
    const finalTo = { x: fx, y: fy }
    moves.push({
      from,
      to: fx === tx && fy === ty ? finalTo : { x: tx, y: ty },
      pieceId,
      capturedId: occupant,
      effects: piece.effects,
      finalTo,
      promotionOptions: promotion,
      roll: piece.flags.dice ? roll : undefined,
    })
  }

  // The die a piece rolled while it was being chosen.
  const roll = piece.flags.dice ? (state.roll?.pieceId === pieceId ? state.roll.value : 1) : 0

  const run = (
    patterns: MovePattern[],
    mode: 'move' | 'capture',
    allowCapture: boolean,
  ) => {
    // A piece that rolls a die uses only the pattern the die picked.
    const list = piece.flags.dice ? dicePattern(patterns, roll) : patterns
    for (const pattern of list) {
      if (pattern.firstMoveOnly && inst.hasMoved) continue
      for (const raw of pattern.vectors) {
        const v = orient(piece, forward, raw)
        if (pattern.kind === 'leaper') {
          push(x + v.x, y + v.y, mode, allowCapture)
          continue
        }
        const max = pattern.maxRange > 0
          ? pattern.maxRange
          : Math.max(variant.board.width, variant.board.height)
        for (let step = 1; step <= max; step++) {
          const tx = x + v.x * step
          const ty = y + v.y * step
          if (tx < 0 || ty < 0 || tx >= geo.width || ty >= geo.height) break
          const index = ty * geo.width + tx
          if (geo.blocking[index]) break
          const tile = geo.tiles[index]
          const isPortal = tile?.terrain === 'portal' || tile?.terrain === 'oneway'
          const finalIndex = geo.portal[index]
          if (finalIndex < 0) {
            if (!piece.flags.jump) break
            continue
          }
          const occupant = state.board[(finalIndex / geo.width) | 0][finalIndex % geo.width]
          push(tx, ty, mode, allowCapture)
          // Portals swallow the rest of the line unless the piece leaps.
          if ((isPortal || occupant !== null) && !piece.flags.jump) break
        }
      }
    }
  }

  const hasCapturePattern = piece.capture.length > 0
  run(piece.move, 'move', !hasCapturePattern)
  if (hasCapturePattern) run(piece.capture, 'capture', true)
  if (piece.flags.enPassant) {
    const enPassant = enPassantMove(state, x, y, inst, piece, seen, forward)
    if (enPassant) moves.push(enPassant)
  }

  if (piece.flags.royal) {
    const castles = castlingMoves(state, x, y, inst, piece)
    if (castles.length) {
      // A king that can both walk to the castling square and castle there is
      // asking to castle: the rook comes with it, and that is the move meant.
      const landing = new Set(castles.map((c) => `${c.finalTo.x},${c.finalTo.y}`))
      const rest = moves.filter((m) => !landing.has(`${m.finalTo.x},${m.finalTo.y}`))
      moves.length = 0
      moves.push(...rest, ...castles)
    }
  }

  if (piece.flags.mustCapture) return moves.filter((m) => !!m.capturedId)
  return moves
}

/**
 * Castling, in the Chess960 sense: an unmoved royal piece and an unmoved
 * friendly rook on the same rank, with the squares both of them have to cross
 * clear apart from the two of them. The king always lands on its own king's
 * file and the rook on the file beside it — g and f one side, c and d the
 * other — which is what chess expects and what Chess960 needs when the king
 * and the rook started somewhere else entirely.
 */
function castlingMoves(
  state: GameState,
  x: number,
  y: number,
  inst: GameState['pieces'][string],
  piece: PieceType,
): Move[] {
  if (inst.hasMoved) return []
  const geo = geometryFor(state.variant)
  const width = geo.width
  // The king's file and the rook's file both have to exist.
  if (width < 4) return []
  if (geo.tiles[y * width + x]?.terrain !== 'normal') return []

  const moves: Move[] = []
  for (const dir of [-1, 1] as const) {
    const kingToX = dir === 1 ? width - 2 : 2
    const rookToX = dir === 1 ? width - 3 : 3

    // The nearest piece in that direction has to be one of our unmoved rooks.
    let rookId: string | null = null
    let rookFromX = x
    for (let scan = x + dir; scan >= 0 && scan < width; scan += dir) {
      const tile = geo.tiles[y * width + scan]
      if (tile?.terrain !== 'normal') break
      const occupant = state.board[y][scan]
      if (!occupant) continue
      const rook = state.pieces[occupant]
      const rookPiece = rook ? state.pieceTypes[rook.typeId] : null
      if (
        rook &&
        rook.team === inst.team &&
        !rook.hasMoved &&
        rookPiece?.icon === 'rook'
      ) {
        rookId = occupant
        rookFromX = scan
      }
      break
    }
    if (!rookId) continue

    // Every square the king crosses and every square the rook crosses must be
    // vacant, the king and the rook themselves excepted.
    if (!spanIsClear(state, y, x, kingToX, inst.id, rookId)) continue
    if (!spanIsClear(state, y, rookFromX, rookToX, inst.id, rookId)) continue

    const finalTo = { x: kingToX, y }
    moves.push({
      from: { x, y },
      to: finalTo,
      pieceId: inst.id,
      effects: piece.effects,
      finalTo,
      castle: {
        rookId,
        rookFrom: { x: rookFromX, y },
        rookTo: { x: rookToX, y },
        dir,
      },
    })
  }
  return moves
}

/**
 * Whether every square between two files — the origins of both pieces excepted
 * — is open for castling: normal ground, and empty apart from the king and the
 * rook.
 */
function spanIsClear(
  state: GameState,
  y: number,
  from: number,
  to: number,
  kingId: string,
  rookId: string,
): boolean {
  const geo = geometryFor(state.variant)
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  for (let scan = lo; scan <= hi; scan++) {
    if (scan === from) continue
    const occupant = state.board[y][scan]
    if (occupant) {
      if (occupant !== kingId && occupant !== rookId) return false
      continue
    }
    if (geo.tiles[y * geo.width + scan]?.terrain !== 'normal') return false
  }
  return true
}

/**
 * En passant, in the generic sense: a piece flagged `enPassant` may capture an
 * enemy piece that just crossed a square this piece attacks, as long as both
 * pieces are adjacent and the enemy crossed exactly two squares.
 */
function enPassantMove(
  state: GameState,
  x: number,
  y: number,
  inst: GameState['pieces'][string],
  piece: PieceType,
  seen: Uint8Array,
  forward: 'up' | 'down',
): Move | null {
  const last = state.moveHistory[state.moveHistory.length - 1]
  if (!last) return null
  const previous = last.move
  const jumped = state.pieces[previous.pieceId]
  if (!jumped || jumped.team === inst.team) return null
  const jumpedPiece = state.pieceTypes[jumped.typeId]
  if (!jumpedPiece?.flags.enPassant || jumpedPiece.flags.uncapturable) return null

  const dx = previous.finalTo.x - previous.from.x
  const dy = previous.finalTo.y - previous.from.y
  // Only a straight two-square crossing leaves a square to capture onto.
  if (Math.abs(dx) + Math.abs(dy) !== 2 || (dx !== 0 && dy !== 0)) return null
  const skipped = { x: previous.from.x + dx / 2, y: previous.from.y + dy / 2 }
  // The jumper must be standing right beside us after landing.
  if (Math.abs(previous.finalTo.x - x) + Math.abs(previous.finalTo.y - y) !== 1) return null
  if (state.board[skipped.y]?.[skipped.x] !== null) return null
  if (seen[skipped.y * state.variant.board.width + skipped.x]) return null

  // The skipped square must be one of our capture steps.
  const patterns = piece.capture.length > 0 ? piece.capture : piece.move
  const attacksIt = patterns.some((pattern) =>
    pattern.vectors.some((raw) => {
      const v = orient(piece, forward, raw)
      return x + v.x === skipped.x && y + v.y === skipped.y
    }),
  )
  if (!attacksIt) return null

  return {
    from: { x, y },
    to: skipped,
    pieceId: inst.id,
    capturedId: previous.pieceId,
    capturedAt: { ...previous.finalTo },
    effects: piece.effects,
    finalTo: skipped,
  }
}

export function isInCheck(state: GameState, teamId: string): boolean {
  // One walk over the board finds the royal pieces and the pieces that could
  // attack them. Searching the board again for every piece is wasteful.
  const royalIds = new Set<string>()
  const enemies: { id: string; at: Vec }[] = []
  for (let y = 0; y < state.board.length; y++) {
    const row = state.board[y]
    for (let x = 0; x < row.length; x++) {
      const id = row[x]
      if (!id) continue
      const inst = state.pieces[id]
      if (!inst) continue
      if (inst.team === teamId) {
        if (state.pieceTypes[inst.typeId]?.flags.royal) royalIds.add(id)
        continue
      }
      enemies.push({ id, at: { x, y } })
    }
  }
  if (royalIds.size === 0) return false

  for (const enemy of enemies) {
    for (const m of movesFor(state, enemy.at.x, enemy.at.y)) {
      if (!m.capturedId) continue
      if (royalIds.has(m.capturedId)) return true
    }
  }
  return false
}

export function findPiece(state: GameState, pieceId: string): Vec | null {
  for (let y = 0; y < state.board.length; y++) {
    for (let x = 0; x < state.board[y].length; x++) {
      if (state.board[y][x] === pieceId) return { x, y }
    }
  }
  return null
}

/**
 * Copies the mutable parts of a game state.
 *
 * The variant and the piece type table are shared by reference: nothing in the
 * engine ever mutates them, and deep-cloning the board terrain for every node
 * of a search is pure waste. The board, the history and the score table are
 * copied because those do change. The piece instances are shared until
 * something changes one — then that single instance is copied first.
 */
/**
 * Rolls the random pieces.
 *
 * A piece whose kind is marked random changes after every move: it borrows
 * the way another piece moves, and it keeps the random mark so it goes on
 * changing. The new kinds live in the game's own table, so the variant
 * itself is never touched.
 *
 * The rolls come from a seed, so the same game always plays out the same way
 * and can be rebuilt later.
 */
export function rollRandomPieces(state: GameState, exceptPieceId?: string): GameState {
  const variant = state.variant
  const randomPieces = Object.keys(state.pieces).filter((id) => {
    const type = state.pieceTypes[state.pieces[id].typeId]
    return !!type?.flags.random && !type.flags.royal
  })
  if (!randomPieces.length) return state

  // A random piece becomes one of the kinds of the variant — never the royal
  // one, or the game would be over at once, and never another random piece,
  // or it would have no way of moving at all.
  const pool = variant.pieceTypes.filter((type) => !type.flags.royal)
  if (!pool.length) return state

  // The seed moves on with every roll, so a piece does not keep rolling into
  // the same kind over and over.
  let seed = (state.randomSeed ?? variant.randomSeed ?? 1) >>> 0
  const roll = () => {
    // A small, well-spread random number generator.
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }

  const pieceTypes = { ...state.pieceTypes }
  const pieces = { ...state.pieces }
  for (const id of randomPieces) {
    // The piece that has just moved keeps its kind: a pawn that has just
    // promoted should be seen as a queen, not as something else at once.
    if (id === exceptPieceId) continue
    const inst = pieces[id]
    const pick = pool[Math.floor(roll() * pool.length)]
    if (!pick) continue
    // Every piece needs a kind of its own, so the kind is named after it.
    const typeId = `r|${id}`
    pieceTypes[typeId] = { ...pick, id: typeId, flags: { ...pick.flags, random: true } }
    pieces[id] = { ...inst, typeId }
  }
  return { ...state, pieceTypes, pieces, randomSeed: seed }
}

export function cloneState(state: GameState): GameState {
  // Copying the piece table by hand is measurably faster than the spread
  // operator, and the search copies it once for every move it tries.
  const pieces: GameState['pieces'] = {}
  for (const id in state.pieces) pieces[id] = state.pieces[id]
  return {
    ...state,
    board: state.board.map((row) => row.slice()),
    pieces,
    moveHistory: state.moveHistory.slice(),
    captured: state.captured.slice(),
    scores: { ...state.scores },
  }
}

/** A legal move together with the state that playing it produces. */
export interface MoveOption {
  move: Move
  next: GameState
}

export function getLegalMoves(state: GameState, x: number, y: number): Move[] {
  return legalOptions(state, x, y).map((option) => option.move)
}

/**
 * The legal moves of one piece, each with the state it leads to. A search
 * needs that child state anyway, so it is built once and handed over instead
 * of being thrown away and rebuilt.
 */
export function legalOptions(state: GameState, x: number, y: number): MoveOption[] {
  const pieceId = state.board[y]?.[x]
  if (!pieceId) return []
  const inst = state.pieces[pieceId]
  if (!inst) return []
  const options: MoveOption[] = []
  for (const move of movesFor(state, x, y)) {
    if (!castlingIsLegal(state, move, inst)) continue
    const next = applyMove(state, move, { compute: false })
    if (isInCheck(next, inst.team)) continue
    options.push({ move, next })
  }
  return options
}

/** Castling has its own rules on top of the usual "do not stay in check". */
function castlingIsLegal(state: GameState, move: Move, inst: GameState['pieces'][string]) {
  if (!move.castle) return true
  // Not out of check.
  if (isInCheck(state, inst.team)) return false
  const step = Math.sign(move.finalTo.x - move.from.x)
  // A king that stays where it is has nothing to cross.
  if (step === 0) return true
  // Nor through check: every square on the way, the landing square among them.
  for (let x = move.from.x + step; ; x += step) {
    if (!isRoyalSafeOnSquare(state, move.pieceId, inst.team, x, move.from.y)) return false
    if (x === move.finalTo.x) break
  }
  return true
}

/* ------------------------------------------------- fast legality for a team */

/** The squares the other armies can take right now. */
function fillAttackedSquares(
  state: GameState,
  enemyTeams: Set<string>,
  out: Uint8Array,
): void {
  const width = state.variant.board.width
  for (let y = 0; y < state.board.length; y++) {
    const row = state.board[y]
    for (let x = 0; x < row.length; x++) {
      const id = row[x]
      if (!id) continue
      const inst = state.pieces[id]
      if (!inst || !enemyTeams.has(inst.team)) continue
      for (const move of movesFor(state, x, y)) {
        if (!move.capturedId) continue
        out[move.finalTo.y * width + move.finalTo.x] = 1
      }
    }
  }
}

/** Can this piece slide along the given line? */
function slidesAlong(
  state: GameState,
  piece: PieceType,
  teamId: string,
  dx: number,
  dy: number,
): boolean {
  // A piece with its own capture patterns attacks along a different set of
  // lines, so do not guess — treat it as able to slide.
  if (piece.capture.length > 0) return true
  for (const pattern of piece.move) {
    if (pattern.kind !== 'slider') continue
    if (pattern.firstMoveOnly) {
      const inst = Object.values(state.pieces).find((p) => p.typeId === piece.id)
      if (inst?.hasMoved) continue
    }
    const forward = geometryFor(state.variant).forward[teamId] ?? 'up'
    for (const raw of pattern.vectors) {
      const v = orient(piece, forward, raw)
      if ((v.x === dx && v.y === dy) || (v.x === -dx && v.y === -dy)) return true
    }
  }
  return false
}

/**
 * The squares of our own pieces that block a line from the royal piece to an
 * enemy slider. Moving one of them away would expose the royal piece, so
 * those moves have to be checked the slow way.
 */
function exposedSquares(
  state: GameState,
  royalAt: Vec,
  teamId: string,
  enemyTeams: Set<string>,
  exposed: Uint8Array,
): void {
  const width = state.variant.board.width
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ]
  for (const dir of directions) {
    let x = royalAt.x + dir.x
    let y = royalAt.y + dir.y
    let first: Vec | null = null
    let firstId: string | null = null
    let blocked = false
    while (inBounds(state.variant.board, x, y)) {
      const tile = tileAt(state.variant, x, y)
      // A wall, a hole or a portal ends the line for good.
      if (isBlocking(tile) || tile?.terrain === 'portal' || tile?.terrain === 'oneway') {
        blocked = true
        break
      }
      const occupant = state.board[y][x]
      if (occupant) {
        first = { x, y }
        firstId = occupant
        break
      }
      x += dir.x
      y += dir.y
    }
    if (blocked || !first || !firstId) continue
    const firstInst = state.pieces[firstId]
    if (!firstInst || firstInst.team !== teamId) continue

    // Look behind our blocker for the enemy slider that would come through.
    let bx = first.x + dir.x
    let by = first.y + dir.y
    let second: Vec | null = null
    let secondId: string | null = null
    let blockedBehind = false
    while (inBounds(state.variant.board, bx, by)) {
      const tile = tileAt(state.variant, bx, by)
      if (isBlocking(tile) || tile?.terrain === 'portal' || tile?.terrain === 'oneway') {
        blockedBehind = true
        break
      }
      const occupant = state.board[by][bx]
      if (occupant) {
        second = { x: bx, y: by }
        secondId = occupant
        break
      }
      bx += dir.x
      by += dir.y
    }
    if (blockedBehind || !second || !secondId) continue
    const enemyInst = state.pieces[secondId]
    if (!enemyInst || !enemyTeams.has(enemyInst.team)) continue
    const enemyPiece = state.pieceTypes[enemyInst.typeId]
    if (!enemyPiece) continue
    if (enemyPiece.flags.movesOnce && enemyInst.hasMoved) continue
    if (!slidesAlong(state, enemyPiece, enemyInst.team, dir.x, dir.y)) continue
    exposed[first.y * width + first.x] = 1
  }
}

/** Moves that change the board in ways the fast check cannot follow. */
function needsSlowCheck(move: Move) {
  if (move.castle) return true
  if (move.capturedAt) return true
  if (move.effects.length > 0) return true
  return false
}

/**
 * Every legal move of a whole team, with the state it leads to.
 *
 * Asking "is the royal piece still safe?" is the expensive part of a legal
 * move, and a search asks it thousands of times. The squares the other armies
 * attack are worked out once per team, and a move can only change that when
 * the mover was standing in the way — which is found by looking along the
 * eight lines from the royal piece. Anything unusual falls back to the slow
 * but certain check.
 */
export function legalOptionsForTeam(
  state: GameState,
  teamId: string,
  settings: { search?: boolean } = {},
): MoveOption[] {
  const { moves, states } = collectTeamMoves(state, teamId, true, settings.search ?? false)
  const options: MoveOption[] = []
  for (let i = 0; i < moves.length; i++) {
    options.push({ move: moves[i], next: states[i] as GameState })
  }
  return options
}

/**
 * The legal moves of a whole team, without the states they lead to.
 *
 * A search throws away most of the moves it generates: it prunes them before
 * it ever looks at them. Building the state behind a move costs a copy of the
 * board and of the piece table, so a search asks for the moves alone and only
 * builds the state of the move it really wants to look at.
 */
export function legalMovesForTeam(
  state: GameState,
  teamId: string,
  settings: { search?: boolean } = {},
): Move[] {
  return collectTeamMoves(state, teamId, false, settings.search ?? false).moves
}

/**
 * The legal moves of a whole team. When the states are wanted, they are built
 * as the moves are found; when they are not, the moves come on their own.
 */
function collectTeamMoves(
  state: GameState,
  teamId: string,
  wantStates: boolean,
  search: boolean,
): { moves: Move[]; states: (GameState | null)[] } {
  const moves: Move[] = []
  const states: (GameState | null)[] = []
  const royals: { id: string; at: Vec }[] = []
  const enemyTeams = new Set(
    state.variant.teams.filter((t) => t.id !== teamId).map((t) => t.id),
  )
  for (let y = 0; y < state.board.length; y++) {
    const row = state.board[y]
    for (let x = 0; x < row.length; x++) {
      const id = row[x]
      if (!id) continue
      const inst = state.pieces[id]
      if (!inst || inst.team !== teamId) continue
      if (state.pieceTypes[inst.typeId]?.flags.royal) royals.push({ id, at: { x, y } })
    }
  }
  const size = state.variant.board.width * state.variant.board.height
  const attacked = takeScratch(size)
  if (enemyTeams.size) fillAttackedSquares(state, enemyTeams, attacked)
  const royalIds = new Set(royals.map((r) => r.id))
  const inCheck = royals.some((r) => attacked[r.at.y * state.variant.board.width + r.at.x] > 0)
  giveScratch()
  // With several royal pieces it is not worth guessing — check every move.
  const exposed = inCheck || royals.length !== 1 ? null : takeScratch(size)
  if (exposed) exposedSquares(state, royals[0].at, teamId, enemyTeams, exposed)

  for (let y = 0; y < state.board.length; y++) {
    const row = state.board[y]
    for (let x = 0; x < row.length; x++) {
      const pieceId = row[x]
      if (!pieceId) continue
      const inst = state.pieces[pieceId]
      if (!inst || inst.team !== teamId) continue
      for (const move of movesFor(state, x, y)) {
        if (!castlingIsLegal(state, move, inst)) continue
        const fast =
          !inCheck &&
          exposed !== null &&
          !exposed[move.from.y * state.variant.board.width + move.from.x] &&
          !royalIds.has(move.pieceId) &&
          !needsSlowCheck(move)
        if (fast) {
          moves.push(move)
          // The state is only built when somebody asks for it.
          states.push(
            wantStates ? applyMove(state, move, { compute: false, search }) : null,
          )
          continue
        }
        // This move has to be looked at properly, so the state is built now.
        const next = applyMove(state, move, { compute: false, search })
        if (isInCheck(next, inst.team)) continue
        moves.push(move)
        states.push(next)
      }
    }
  }
  if (exposed) giveScratch()
  return { moves, states }
}

/** Put the royal piece on a square and see whether it is attacked there. */
function isRoyalSafeOnSquare(
  state: GameState,
  royalId: string,
  teamId: string,
  x: number,
  y: number,
): boolean {
  const probe = cloneState(state)
  const from = findPiece(probe, royalId)
  if (!from) return false
  probe.board[from.y][from.x] = null
  probe.board[y][x] = royalId
  return !isInCheck(probe, teamId)
}

export function hasAnyLegalMove(state: GameState, teamId: string): boolean {
  for (let y = 0; y < state.board.length; y++) {
    for (let x = 0; x < state.board[y].length; x++) {
      const id = state.board[y][x]
      if (!id) continue
      const inst = state.pieces[id]
      if (!inst || inst.team !== teamId) continue
      if (getLegalMoves(state, x, y).length > 0) return true
    }
  }
  return false
}

/* ------------------------------------------------------------- apply move */

interface ApplyOptions {
  compute?: boolean
  /** Where the player released a dragged piece, in board units. */
  origin?: Vec
  /** Work out the algebraic notation too. It costs time, so searches skip it. */
  san?: boolean
  /**
   * A search tries millions of moves that never reach the board. The wording
   * of such a move and the list of captured pieces are of no use there, so
   * they are left out.
   */
  search?: boolean
}

export function applyMove(
  state: GameState,
  move: Move,
  options: ApplyOptions = {},
): GameState {
  const compute = options.compute ?? true
  const next: GameState = cloneState(state)
  // The die has been used; the next piece rolls its own.
  next.roll = undefined
  const inst = next.pieces[move.pieceId]
  if (!inst) return next
  const piece = next.pieceTypes[inst.typeId]
  if (!piece) return next

  // Piece instances are shared between states until one of them changes.
  const touch = (id: string) => {
    const current = next.pieces[id]
    if (current) next.pieces[id] = { ...current }
  }

  const hasSwap = move.effects.some((e) => e.kind === 'swap')
  const capturedInst = move.capturedId ? next.pieces[move.capturedId] : undefined
  const capturedPiece = capturedInst ? next.pieceTypes[capturedInst.typeId] : undefined

  const fx = move.finalTo.x
  const fy = move.finalTo.y

  if (move.capturedId && capturedInst) {
    if (hasSwap) {
      // Swap positions instead of capturing.
      next.board[fy][fx] = null
      touch(move.capturedId)
      next.pieces[move.capturedId].hasMoved = true
    } else {
      delete next.pieces[move.capturedId]
      // En passant takes a piece that is not standing on the landing square.
      const capturedAt = move.capturedAt ?? move.finalTo
      if (next.board[capturedAt.y]?.[capturedAt.x] === move.capturedId) {
        next.board[capturedAt.y][capturedAt.x] = null
      }
      if (!options.search) {
        next.captured.push({ team: capturedInst.team, typeId: capturedInst.typeId, by: inst.team })
      }
      if (capturedPiece) {
        next.scores[inst.team] = (next.scores[inst.team] ?? 0) + capturedPiece.value
      }
    }
  }

  // Remove from origin, place on destination.
  if (next.board[move.from.y]?.[move.from.x] === move.pieceId) {
    next.board[move.from.y][move.from.x] = null
  }
  // The castling rook leaves its square first: the king may be landing on it,
  // or the two may be crossing on their way to their own files.
  if (move.castle && next.board[move.castle.rookFrom.y]?.[move.castle.rookFrom.x] === move.castle.rookId) {
    next.board[move.castle.rookFrom.y][move.castle.rookFrom.x] = null
  }
  if (next.board[fy][fx] && next.board[fy][fx] !== move.pieceId) {
    const leftover = next.board[fy][fx] as string
    const leftoverInst = next.pieces[leftover]
    if (leftoverInst) {
      const leftoverPiece = next.pieceTypes[leftoverInst.typeId]
      if (!options.search) {
        next.captured.push({ team: leftoverInst.team, typeId: leftoverInst.typeId, by: inst.team })
      }
      if (leftoverPiece) {
        next.scores[inst.team] = (next.scores[inst.team] ?? 0) + leftoverPiece.value
      }
      delete next.pieces[leftover]
    }
  }
  next.board[fy][fx] = move.pieceId
  touch(move.pieceId)
  next.pieces[move.pieceId].hasMoved = true

  // Castling moves the rook in the same turn, once the king has landed.
  if (move.castle) {
    const { rookId, rookTo } = move.castle
    next.board[rookTo.y][rookTo.x] = rookId
    if (next.pieces[rookId]) {
      touch(rookId)
      next.pieces[rookId].hasMoved = true
    }
  }

  if (hasSwap && move.capturedId) {
    next.board[move.from.y][move.from.x] = move.capturedId
  }

  // Effects
  let blastRoyal = false
  const blasts: Blast[] = []
  for (const eff of move.effects) {
    if (eff.kind === 'explosion') {
      const { radius } = eff
      const victims: Vec[] = []
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue
          const ex = fx + dx
          const ey = fy + dy
          if (!inBounds(next.variant.board, ex, ey)) continue
          const occ = next.board[ey][ex]
          if (!occ || occ === move.pieceId) continue
          const oInst = next.pieces[occ]
          if (!oInst) continue
          // Friendly fire is off: a blast never harms the moving team.
          if (oInst.team === inst.team) continue
          const oPiece = next.pieceTypes[oInst.typeId]
          if (!options.search) {
            next.captured.push({ team: oInst.team, typeId: oInst.typeId, by: inst.team })
          }
          if (oPiece) {
            next.scores[inst.team] = (next.scores[inst.team] ?? 0) + oPiece.value
            if (oPiece.flags.royal) blastRoyal = true
          }
          delete next.pieces[occ]
          next.board[ey][ex] = null
          victims.push({ x: ex, y: ey })
        }
      }
      blasts.push({ x: fx, y: fy, radius, victims })
    } else if (eff.kind === 'spawn') {
      const spawnPiece = next.pieceTypes[eff.pieceTypeId]
      if (spawnPiece) {
        const sx = move.from.x + eff.offset.x
        const sy = move.from.y + eff.offset.y
        if (inBounds(next.variant.board, sx, sy) && next.board[sy][sx] === null) {
          // Spawned pieces are named after the move that made them, so the
          // game can be rebuilt later.
          const sid = `spawn|${state.moveHistory.length}|${eff.pieceTypeId}|${eff.offset.x},${eff.offset.y}`
          next.pieces[sid] = {
            id: sid,
            typeId: eff.pieceTypeId,
            team: inst.team,
            hasMoved: false,
          }
          next.board[sy][sx] = sid
        }
      }
    }
  }

  // Promotion
  let promotionTypeId: string | undefined
  if (piece.promotion) {
    const team = teamById(next.variant, inst.team)
    const farRank = team?.forward === 'down' ? next.variant.board.height - 1 : 0
    if (fy === farRank) {
      const options = piece.promotion.typeIds.filter((id) => !!next.pieceTypes[id])
      // The player may have chosen; otherwise the first option is used.
      const chosen =
        move.promotionTypeId && options.includes(move.promotionTypeId)
          ? move.promotionTypeId
          : options[0]
      const target = chosen ? next.pieceTypes[chosen] : undefined
      if (target) {
        touch(move.pieceId)
        if (piece.flags.random && !target.flags.random) {
          // A random piece keeps its random mark when it promotes: it borrows
          // the way of the piece it turned into, and goes on changing.
          const typeId = `r|${move.pieceId}`
          next.pieceTypes[typeId] = {
            ...target,
            id: typeId,
            flags: { ...target.flags, random: true },
          }
          next.pieces[move.pieceId].typeId = typeId
          promotionTypeId = typeId
        } else {
          promotionTypeId = target.id
          next.pieces[move.pieceId].typeId = target.id
        }
      }
    }
  }

  const record: MoveRecord = {
    move: { ...move, promotionTypeId },
    team: state.turn,
    notation: options.search
      ? ''
      : notationFor(
          state,
          move,
          piece,
          capturedPiece,
          promotionTypeId ? next.pieceTypes[promotionTypeId]?.name : undefined,
        ),
    san: options.san ? sanFor(state, move, next) : undefined,
    capturedName: options.search ? undefined : capturedPiece?.name,
    blasts: blasts.length ? blasts : undefined,
    origin: options.origin,
  }
  // Turn switch
  const order = next.variant.teams.map((t) => t.id)
  const idx = order.indexOf(next.turn)
  next.turn = order[(idx + 1) % order.length]
  next.moveHistory = [...next.moveHistory, record]

  // A real move notes which position it left behind, so a repetition can be
  // spotted later. It has to come after the turn has changed hands and after
  // the move is in the history — the position depends on both.
  if (options.san) {
    const key = positionKey(next)
    let repeats = 1
    if (next.startKey === key) repeats += 1
    for (const earlier of next.moveHistory) {
      if (earlier.positionKey === key) repeats += 1
    }
    record.positionKey = key
    record.repeats = repeats
  }

  if (compute) {
    detectOutcome(next, inst.team, { capturedRoyal: !!capturedPiece?.flags.royal || blastRoyal })
  }
  return next
}

/** Whether the castle ran toward the h-file — 0-0 rather than 0-0-0. */
function castleSide(move: Move): boolean {
  if (!move.castle) return true
  if (move.castle.dir !== undefined) return move.castle.dir === 1
  // Moves stored before the direction was recorded went by where the king ended.
  return move.finalTo.x > move.from.x
}

function notationFor(
  state: GameState,
  move: Move,
  piece: PieceType,
  capturedPiece?: PieceType,
  promotionName?: string,
) {  if (move.castle) return castleSide(move) ? 'O-O' : 'O-O-O'
  const from = squareName(state.variant, move.from.x, move.from.y)
  const to = squareName(state.variant, move.finalTo.x, move.finalTo.y)
  const cap = move.capturedId ? 'x' : '-'
  const suffix = capturedPiece ? ` (${capturedPiece.name})` : ''
  const enPassant = move.capturedAt ? ' e.p.' : ''
  const promotion = promotionName ? `=${promotionName}` : ''
  const roll = move.roll ? ` (${move.roll})` : ''
  return `${piece.name} ${from}${cap}${to}${promotion}${roll}${enPassant}${suffix}`
}

/* ------------------------------------------------------- algebraic notation */

const SAN_LETTERS: Record<string, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
}

/**
 * The move in algebraic notation — "Nf3", "exd5", "O-O", "e8=Q+".
 *
 * The position after the move is needed for the check mark, so this is only
 * worked out for real games, not for every node of a search.
 */
export function sanFor(state: GameState, move: Move, next: GameState): string {
  if (move.castle) {
    return (castleSide(move) ? 'O-O' : 'O-O-O') + checkSuffix(next)
  }
  const inst = state.pieces[move.pieceId]
  const piece = inst ? state.pieceTypes[inst.typeId] : undefined
  // A pawn has no letter; it is written by the file it comes from.
  const letter = piece && piece.icon !== 'pawn' ? SAN_LETTERS[piece.icon] ?? '' : ''
  const target = squareName(state.variant, move.finalTo.x, move.finalTo.y)

  if (move.capturedId && !letter) {    const from = squareName(state.variant, move.from.x, move.from.y)
    return `${from[0]}x${target}${promotionSuffix(state, move)}${checkSuffix(next)}`
  }

  let hint = ''
  if (letter) {
    const rivals = sameTypeRivals(state, move, piece?.icon)
    if (rivals.length) {
      const sameFile = rivals.some((r) => r.x === move.from.x)
      const sameRank = rivals.some((r) => r.y === move.from.y)
      if (!sameFile) hint = String.fromCharCode(97 + move.from.x)
      else if (!sameRank) hint = String(state.variant.board.height - move.from.y)
      else hint = squareName(state.variant, move.from.x, move.from.y)
    }
  }
  const capture = move.capturedId ? 'x' : ''
  return `${letter}${hint}${capture}${target}${promotionSuffix(state, move)}${checkSuffix(next)}`
}

/** Other pieces of the same kind that could also reach the same square. */
function sameTypeRivals(state: GameState, move: Move, icon?: string) {
  const rivals: { x: number; y: number }[] = []
  if (!icon) return rivals
  const inst = state.pieces[move.pieceId]
  if (!inst) return rivals
  for (let y = 0; y < state.board.length; y++) {
    for (let x = 0; x < state.board[y].length; x++) {
      if (x === move.from.x && y === move.from.y) continue
      const id = state.board[y][x]
      if (!id) continue
      const other = state.pieces[id]
      if (other.team !== inst.team) continue
      if (state.pieceTypes[other.typeId]?.icon !== icon) continue
      const reaches = movesFor(state, x, y).some(
        (m) => m.finalTo.x === move.finalTo.x && m.finalTo.y === move.finalTo.y,
      )
      if (reaches) rivals.push({ x, y })
    }
  }
  return rivals
}

function promotionSuffix(state: GameState, move: Move): string {
  if (!move.promotionTypeId) return ''
  const piece = state.pieceTypes[move.promotionTypeId]
  const letter = piece ? SAN_LETTERS[piece.icon] : undefined
  return letter ? `=${letter}` : ''
}

/** "+" when the opponent is in check, "#" when it is checkmate. */
function checkSuffix(next: GameState): string {
  const opponent = next.turn
  let inCheck = false
  for (const id in next.pieces) {
    const inst = next.pieces[id]
    if (inst.team !== opponent) continue
    if (!next.pieceTypes[inst.typeId]?.flags.royal) continue
    const at = findPiece(next, id)
    if (!at) continue
    for (let y = 0; y < next.board.length; y++) {
      for (let x = 0; x < next.board[y].length; x++) {
        const attacker = next.board[y][x]
        if (!attacker) continue
        const attackerInst = next.pieces[attacker]
        if (attackerInst.team === opponent) continue
        if (movesFor(next, x, y).some((m) => m.capturedId === id)) inCheck = true
      }
    }
  }
  if (!inCheck) return ''
  let anyMove = false
  for (let y = 0; y < next.board.length; y++) {
    for (let x = 0; x < next.board[y].length; x++) {
      const id = next.board[y][x]
      if (!id) continue
      if (next.pieces[id].team !== opponent) continue
      if (getLegalMoves(next, x, y).length > 0) anyMove = true
    }
  }
  return anyMove ? '+' : '#'
}

/* -------------------------------------------------------------- outcome */

export function detectOutcome(
  state: GameState,
  mover: string,
  meta: { capturedRoyal?: boolean } = {},
) {
  const { variant } = state

  if (meta.capturedRoyal && variant.winConditions.some((w) => w.kind === 'kingCapture')) {
    state.winner = mover
    state.status = 'royal-captured'
    return
  }

  for (const wc of variant.winConditions) {
    if (wc.kind === 'points' && (wc.threshold ?? Infinity) <= (state.scores[mover] ?? 0)) {
      state.winner = mover
      state.status = 'points'
      return
    }
  }

  for (const wc of variant.winConditions) {
    if (wc.kind !== 'elimination') continue
    for (const team of variant.teams) {
      if (team.id === mover) continue
      const alive = Object.values(state.pieces).some((p) => p.team === team.id)
      if (!alive) {
        state.winner = mover
        state.status = 'eliminated'
        return
      }
    }
  }

  const opponent = state.turn
  if (!hasAnyLegalMove(state, opponent)) {
    const checked = isInCheck(state, opponent)
    if (checked) {
      if (variant.winConditions.some((w) => w.kind === 'checkmate')) {
        state.winner = mover
        state.status = 'checkmate'
        return
      }
    } else {
      state.winner = 'draw'
      state.status = 'stalemate'
      return
    }
  }

  // The same position three times is a draw.
  const last = state.moveHistory[state.moveHistory.length - 1]
  if (last?.repeats && last.repeats >= 3) {
    state.winner = 'draw'
    state.status = 'threefold'
    return
  }
}

export function cloneEffects(effects: Effect[]): Effect[] {
  return effects.map((e) => ({ ...e }))
}
