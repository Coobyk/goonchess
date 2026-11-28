import { cloneState, createInitialState, getLegalMoves } from '@/engine/rules'
import { ALL8, DIAG, KNIGHT, ORTH } from '@/engine/templates'
import {
  defaultPieceFlags,
  vecKey,
  type Effect,
  type GameState,
  type Move,
  type MovePattern,
  type PieceType,
  type Terrain,
  type Variant,
  type VariantRule,
  type Vec,
  type WinConditionKind,
} from '@/engine/types'

const ORTH_KEY = setKey(ORTH)
const DIAG_KEY = setKey(DIAG)
const ALL8_KEY = setKey(ALL8)
const KNIGHT_KEY = setKey(KNIGHT)

export const TERRAIN_COPY: Record<Terrain, { name: string; hint: string }> = {
  normal: { name: 'Normal', hint: 'Open ground. Any piece may enter or pass through.' },
  wall: { name: 'Wall', hint: 'Blocks movement and captures. Sliders cannot see past it.' },
  void: { name: 'Void', hint: 'A hole in the board. Nothing can stand on it or cross it.' },
  portal: { name: 'Portal', hint: 'Stepping on one teleports the piece to its linked square.' },
  oneway: { name: 'One-way portal', hint: 'A portal that only sends pieces toward its linked square.' },
}

export const WIN_COPY: Record<WinConditionKind, { name: string; hint: string }> = {
  checkmate: {
    name: 'Checkmate',
    hint: 'Trap the enemy royal piece so it is attacked and has no legal escape.',
  },
  kingCapture: {
    name: 'Capture the royal',
    hint: 'The game ends the moment a royal piece is captured.',
  },
  elimination: { name: 'Elimination', hint: 'Win by removing every enemy piece from the board.' },
  points: {
    name: 'Point target',
    hint: 'Win by capturing material until you reach the point target.',
  },
  center: {
    name: 'King of the Hill',
    hint: 'Walk your king onto one of the four centre squares and the game is yours at once.',
  },
  threeCheck: {
    name: 'Three checks',
    hint: 'Give check three times — the third one ends the game.',
  },
  antichess: {
    name: 'Losing chess',
    hint: 'Lose every piece, or be left with no move at all, and you win.',
  },
  race: {
    name: 'The race',
    hint: 'The first king to reach the far rank wins. If White gets there first, Black has one reply to level the race.',
  },
  predator: {
    name: 'Slay the Predator',
    hint: 'Only a king can slay a Predator for good. Win by slaying the enemy one, or — as the Predator — by eating every pawn and minor piece.',
  },
}

export const RULE_COPY: Record<VariantRule, { name: string; hint: string }> = {
  atomic: {
    name: 'Atomic',
    hint: 'A capture explodes. The landing square is cleared, and everything around it goes up too — friendly and enemy alike — except pawns, which shrug the blast off. A blast that catches a king ends the game at once.',
  },
  crazyhouse: {
    name: 'Pockets',
    hint: 'Every piece you capture changes sides into your pocket. On your turn you may drop one of them onto an empty square instead of moving a piece. A captured pawn comes back as a pawn, and a pawn may never be dropped on the back rank.',
  },
  forcedCapture: {
    name: 'Capture is compulsory',
    hint: 'When a capture is on the board, taking it is the only move allowed.',
  },
  noCheck: {
    name: 'Checks are forbidden',
    hint: 'Giving check is against the rules as much as standing in one: a move may not leave the enemy king attacked, and may not attack it either.',
  },
  noCastle: {
    name: 'No castling',
    hint: 'The king and the rook never swap places.',
  },
  predator: {
    name: 'Predators',
    hint: 'A Predator must take the pawn or minor piece it sees, comes back when anything but a king takes it, and only a king can slay it for good.',
  },
  loyalty: {
    name: 'Loyalty',
    hint: 'The king is jealous of his queen. If she looks the enemy king in the eye — however the line opened — he explodes where he stands, and her side loses on the spot. Her gaze is a trap too: a king may step into it on purpose, and a pinned piece may unveil him.',
  },
  hypergamy: {
    name: 'Hypergamy',
    hint: 'A piece may only take a piece worth as much as itself or more. A pawn takes anything, knights and bishops hunt each other, a rook reaches rooks and queens — and the queen can only ever be taken down by another queen. The king stands outside the order: worth nothing, he may take anyone, and anyone may take him.',
  },
  spinning: {
    name: 'Spinning pieces',
    hint: 'Every piece on the board spins round and round, all game long. The rules are the ordinary ones — only your eyes have to keep up.',
  },
  turning: {
    name: 'Turning pieces',
    hint: 'After every move, each piece randomly turns 45° left, 45° right, or stays put. Its movement turns with it, rounded to the squares of the board: a rook can become a bishop, a bishop a rook, a horse walks two square steps diagonally, and a pawn can start walking sideways.',
  },
}

function setKey(vectors: Vec[]) {
  return vectors.map(vecKey).sort().join('|')
}

export function offsetText(v: Vec): string {
  const parts: string[] = []
  if (v.y < 0) parts.push(`${-v.y} forward`)
  if (v.y > 0) parts.push(`${v.y} back`)
  if (v.x > 0) parts.push(`${v.x} right`)
  if (v.x < 0) parts.push(`${-v.x} left`)
  return parts.join(' and ') || 'in place'
}

export function directionText(vectors: Vec[]): string {
  const key = setKey(vectors)
  if (key === ALL8_KEY) return 'in any of the eight directions'
  if (key === ORTH_KEY) return 'forward, back, left or right'
  if (key === DIAG_KEY) return 'diagonally'
  if (key === KNIGHT_KEY) return 'in an L: two squares one way and one square across'
  if (vectors.length === 1) return offsetText(vectors[0])
  return vectors.map(offsetText).join(', ')
}

export function patternText(pattern: MovePattern): string {
  const first = pattern.firstMoveOnly ? ' on its first move only' : ''
  if (pattern.kind === 'slider') {
    const range =
      pattern.maxRange > 0
        ? `up to ${pattern.maxRange} square${pattern.maxRange === 1 ? '' : 's'}`
        : 'any number of squares'
    return `slides ${range} ${directionText(pattern.vectors)}${first}`
  }
  return `leaps ${directionText(pattern.vectors)}${first}`
}

export function effectText(effect: Effect, pieceName: (id: string) => string): string {
  if (effect.kind === 'swap') return 'when it captures, it swaps places with the piece it tried to take'
  if (effect.kind === 'explosion') {
    return `after it lands, everything within ${effect.radius} square${
      effect.radius === 1 ? '' : 's'
    } is destroyed — only enemy pieces are harmed`
  }
  return `after it moves, it leaves a ${pieceName(effect.pieceTypeId)} ${offsetText(
    effect.offset,
  )} of its starting square, if that square is empty`
}

export function flagCopy(piece: PieceType): {
  label: string
  detail: string
  tone?: 'amber' | 'rose' | 'sky' | 'default'
}[] {
  const out: { label: string; detail: string; tone?: 'amber' | 'rose' | 'sky' | 'default' }[] = []
  if (piece.flags.royal) {
    out.push({ label: 'Royal', detail: 'If this piece is lost, the game can end.', tone: 'amber' })
  }
  if (piece.flags.uncapturable) {
    out.push({ label: 'Uncapturable', detail: 'No piece can capture it.', tone: 'sky' })
  }
  if (piece.flags.mustCapture) {
    out.push({ label: 'Capture-only', detail: 'It may move only when the move takes a piece.', tone: 'rose' })
  }
  if (piece.flags.movesOnce) {
    out.push({ label: 'One move only', detail: 'After its first move it is frozen for the rest of the game.', tone: 'amber' })
  }
  if (piece.flags.enPassant) {
    out.push({
      label: 'En passant',
      detail: 'It may take a piece that just ran two squares past a square this piece attacks.',
      tone: 'sky',
    })
  }
  if (piece.flags.jump) {
    out.push({ label: 'Leaps over blockers', detail: 'Pieces in the way do not stop its movement.' })
  }
  if (!piece.flags.mirror) {
    out.push({ label: 'Unmirrored', detail: 'It keeps the same pattern for every army instead of facing the other way.' })
  }
  if (piece.flags.dice) {
    out.push({ label: 'Dice-driven', detail: 'It rolls a die to choose which of its patterns it may use.', tone: 'amber' })
  }
  if (piece.flags.random) {
    out.push({ label: 'Random', detail: 'After every move it turns into a random piece kind from this variant.', tone: 'amber' })
  }
  if (piece.flags.predator) {
    out.push({
      label: 'Predator',
      detail: 'It must take prey it sees, returns when anything but a royal piece takes it, and only a royal piece can slay it for good.',
      tone: 'rose',
    })
  }
  return out
}

export interface PieceDemoOptions {
  teamIndex?: number
  orientation?: number
  withTargets?: boolean
  boardSize?: number
}

const DEMO_RULES = new Set<VariantRule>(['spinning', 'turning'])
const FALLBACK_TEAMS = [
  { id: 'white', name: 'White', color: '#f4f1ea', forward: 'up' as const },
  { id: 'black', name: 'Black', color: '#3f3f46', forward: 'down' as const },
]

function normalizeIndex(index: number, length: number) {
  return ((Math.round(index) % length) + length) % length
}

function normalizeOrientation(orientation: number) {
  return normalizeIndex(orientation, 8)
}

function demoTeams(variant: Variant) {
  return variant.teams.length ? variant.teams : FALLBACK_TEAMS
}

/** Picks a light, non-royal piece of the variant to act as target practice. */
function targetTypeFor(variant: Variant): PieceType | null {
  const suitable = variant.pieceTypes.filter(
    (piece) => !piece.flags.royal && !piece.flags.uncapturable && !piece.flags.predator,
  )
  const existing =
    suitable.find((piece) => piece.icon === 'pawn') ??
    [...suitable].sort((a, b) => a.value - b.value)[0]
  if (existing) return existing
  const base = variant.pieceTypes.find((piece) => piece.icon === 'pawn') ?? variant.pieceTypes[0]
  if (!base) return null
  return {
    ...base,
    id: `__learn-target|${base.id}`,
    name: base.name,
    move: [],
    capture: [],
    flags: defaultPieceFlags({ mirror: false }),
    effects: [],
    promotion: null,
  }
}

function emptyDemoVariant(variant: Variant, size: number, targetType: PieceType | null): Variant {
  const tiles = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ terrain: 'normal' as const })),
  )
  const pieceTypes = targetType && !variant.pieceTypes.some((piece) => piece.id === targetType.id)
    ? [...variant.pieceTypes, targetType]
    : variant.pieceTypes
  return {
    ...variant,
    board: { width: size, height: size, tiles },
    teams: demoTeams(variant),
    pieceTypes,
    setup: [],
    winConditions: [],
    rules: variant.rules?.filter((rule) => DEMO_RULES.has(rule)),
  }
}

function placePiece(
  state: GameState,
  type: PieceType,
  team: string,
  at: Vec,
  id: string,
  orientation = 0,
): string {
  state.pieces[id] = {
    id,
    typeId: type.id,
    team,
    hasMoved: false,
    lives: type.lives ?? 1,
    orientation,
  }
  state.board[at.y][at.x] = id
  return id
}

function createDemoBase(
  variant: Variant,
  pieceType: PieceType,
  options: PieceDemoOptions = {},
): { state: GameState; pieceId: string; center: Vec; targetType: PieceType | null; targetTeam: string; teamIndex: number } {
  const size = Math.max(3, Math.round(options.boardSize ?? 7))
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) }
  const targetType = targetTypeFor(variant)
  const demoVariant = emptyDemoVariant(variant, size, targetType)
  const teams = demoVariant.teams
  const teamIndex = normalizeIndex(options.teamIndex ?? 0, teams.length)
  const team = teams[teamIndex]
  const targetTeam = teams[normalizeIndex(teamIndex + 1, teams.length)]
  const state = createInitialState(demoVariant)
  state.turn = team.id
  const pieceId = placePiece(state, pieceType, team.id, center, `demo|${pieceType.id}`, normalizeOrientation(options.orientation ?? 0))
  return { state, pieceId, center, targetType, targetTeam: targetTeam.id, teamIndex }
}

function distanceOrder(center: Vec) {
  return (a: Vec, b: Vec) => {
    const ac = Math.max(Math.abs(a.x - center.x), Math.abs(a.y - center.y))
    const bc = Math.max(Math.abs(b.x - center.x), Math.abs(b.y - center.y))
    if (ac !== bc) return ac - bc
    const am = Math.abs(a.x - center.x) + Math.abs(a.y - center.y)
    const bm = Math.abs(b.x - center.x) + Math.abs(b.y - center.y)
    if (am !== bm) return am - bm
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  }
}

function probeCaptures(
  base: GameState,
  center: Vec,
  targetType: PieceType,
  targetTeam: string,
): Map<string, Move> {
  const captures = new Map<string, Move>()
  const { width, height } = base.variant.board
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === center.x && y === center.y) continue
      const probe = cloneState(base)
      const targetId = `probe|${x},${y}`
      placePiece(probe, targetType, targetTeam, { x, y }, targetId)
      for (const move of getLegalMoves(probe, center.x, center.y)) {
        if (!move.capturedId) continue
        if (move.finalTo.x === x && move.finalTo.y === y) captures.set(vecKey({ x, y }), move)
      }
    }
  }
  return captures
}

function directionKey(center: Vec, at: Vec) {
  return `${Math.sign(at.x - center.x)},${Math.sign(at.y - center.y)}`
}

function takeVaried(candidates: Vec[], count: number, selected: Vec[], center: Vec) {
  const taken = new Set(selected.map(vecKey))
  const directions = new Set(selected.map((at) => directionKey(center, at)))
  const sorted = [...candidates].sort(distanceOrder(center))
  for (const pass of [true, false]) {
    for (const at of sorted) {
      if (selected.length >= count) return
      const key = vecKey(at)
      if (taken.has(key)) continue
      const direction = directionKey(center, at)
      if (pass && directions.has(direction)) continue
      selected.push(at)
      taken.add(key)
      directions.add(direction)
    }
  }
}

function targetSquares(
  base: GameState,
  center: Vec,
  targetType: PieceType,
  targetTeam: string,
): Vec[] {
  const quiet = new Set(
    getLegalMoves(base, center.x, center.y)
      .filter((move) => !move.capturedId)
      .map((move) => vecKey(move.finalTo)),
  )
  const captureKeys = new Set(probeCaptures(base, center, targetType, targetTeam).keys())
  const squares: Vec[] = []
  const { width, height } = base.variant.board
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== center.x || y !== center.y) squares.push({ x, y })
    }
  }

  const captureOnly = squares.filter((at) => captureKeys.has(vecKey(at)) && !quiet.has(vecKey(at)))
  const shared = squares.filter((at) => captureKeys.has(vecKey(at)) && quiet.has(vecKey(at)))
  const selected: Vec[] = []
  takeVaried(captureOnly, 2, selected, center)
  takeVaried(shared, Math.min(4, selected.length + 2), selected, center)

  if (selected.length < 3) {
    const blockers = squares.filter((at) => !selected.some((other) => other.x === at.x && other.y === at.y))
    takeVaried(blockers, Math.min(4, Math.max(3, selected.length + 1)), selected, center)
  }
  return selected.slice(0, 4)
}

export function buildPieceDemoState(
  variant: Variant,
  pieceType: PieceType,
  options: PieceDemoOptions = {},
): { state: GameState; pieceId: string; center: Vec } {
  const base = createDemoBase(variant, pieceType, options)
  if (!options.withTargets || !base.targetType || base.targetTeam === base.state.turn) {
    return { state: base.state, pieceId: base.pieceId, center: base.center }
  }
  const state = cloneState(base.state)
  const selected = targetSquares(base.state, base.center, base.targetType, base.targetTeam)
  selected.forEach((at, index) => {
    placePiece(state, base.targetType!, base.targetTeam, at, `target|${index}|${at.x},${at.y}`)
  })
  return { state, pieceId: base.pieceId, center: base.center }
}

export type SquareMark = 'quiet' | 'capture' | 'both' | 'first-only' | 'blast' | 'spawn'

function movedCopy(state: GameState, pieceId: string): GameState {
  const moved = cloneState(state)
  const piece = moved.pieces[pieceId]
  if (piece) moved.pieces[pieceId] = { ...piece, hasMoved: true }
  return moved
}

function moveKeySet(moves: Move[]) {
  return new Set(moves.map((move) => vecKey(move.finalTo)))
}

export function computePatternPreview(
  variant: Variant,
  pieceType: PieceType,
  options: { size?: number; teamIndex?: number; orientation?: number } = {},
): { size: number; center: Vec; marks: Record<string, SquareMark> } {
  const size = Math.max(3, Math.round(options.size ?? 7))
  const demo = buildPieceDemoState(variant, pieceType, {
    boardSize: size,
    teamIndex: options.teamIndex,
    orientation: options.orientation,
    withTargets: false,
  })
  const { state, pieceId, center } = demo
  const quietMoves = getLegalMoves(state, center.x, center.y).filter((move) => !move.capturedId)
  const quietKeys = moveKeySet(quietMoves)

  const needsCaptureProbe = pieceType.capture.length > 0 || pieceType.flags.mustCapture
  const context = needsCaptureProbe
    ? createDemoBase(variant, pieceType, {
        boardSize: size,
        teamIndex: options.teamIndex,
        orientation: options.orientation,
      })
    : null
  const captureMoves =
    needsCaptureProbe && context?.targetType
      ? probeCaptures(state, center, context.targetType, context.targetTeam)
      : new Map<string, Move>()
  const captureKeys = needsCaptureProbe ? new Set(captureMoves.keys()) : new Set(quietKeys)

  const marks: Record<string, SquareMark> = {}
  const reachable = new Set([...quietKeys, ...captureKeys])
  for (const key of reachable) {
    const quiet = quietKeys.has(key)
    const capture = captureKeys.has(key)
    marks[key] = quiet && capture ? 'both' : capture ? 'capture' : 'quiet'
  }

  const hasFirstMovePattern = [...pieceType.move, ...pieceType.capture].some((pattern) => pattern.firstMoveOnly)
  if (hasFirstMovePattern) {
    const moved = movedCopy(state, pieceId)
    const movedQuietKeys = moveKeySet(
      getLegalMoves(moved, center.x, center.y).filter((move) => !move.capturedId),
    )
    const movedCaptureKeys = needsCaptureProbe
      ? context?.targetType
        ? new Set(probeCaptures(moved, center, context.targetType, context.targetTeam).keys())
        : new Set<string>()
      : movedQuietKeys
    for (const key of reachable) {
      if (!movedQuietKeys.has(key) && !movedCaptureKeys.has(key)) marks[key] = 'first-only'
    }
  }

  for (const effect of pieceType.effects) {
    if (effect.kind !== 'spawn') continue
    const at = { x: center.x + effect.offset.x, y: center.y + effect.offset.y }
    if (at.x < 0 || at.y < 0 || at.x >= size || at.y >= size) continue
    if (at.x === center.x && at.y === center.y) continue
    const key = vecKey(at)
    if (!marks[key]) marks[key] = 'spawn'
  }

  const explosions = pieceType.effects.filter((effect): effect is Extract<Effect, { kind: 'explosion' }> => effect.kind === 'explosion')
  if (explosions.length) {
    const landings = new Map<string, Vec>()
    for (const move of quietMoves) landings.set(vecKey(move.finalTo), move.finalTo)
    for (const move of captureMoves.values()) landings.set(vecKey(move.finalTo), move.finalTo)
    for (const landing of landings.values()) {
      for (const effect of explosions) {
        for (let dy = -effect.radius; dy <= effect.radius; dy++) {
          for (let dx = -effect.radius; dx <= effect.radius; dx++) {
            if (!dx && !dy) continue
            const at = { x: landing.x + dx, y: landing.y + dy }
            if (at.x < 0 || at.y < 0 || at.x >= size || at.y >= size) continue
            const key = vecKey(at)
            if (!marks[key]) marks[key] = 'blast'
          }
        }
      }
    }
  }

  return { size, center, marks }
}
