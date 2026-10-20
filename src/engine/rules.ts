import type {
  Blast,
  Effect,
  GameState,
  Move,
  MovePattern,
  PieceType,
  TeamConfig,
  Tile,
  Variant,
  Vec,
} from './types'

export const uid = () => Math.random().toString(36).slice(2, 10)

export const opposite = (v: Vec): Vec => ({ x: v.x, y: v.y })

export function inBounds(board: { width: number; height: number }, x: number, y: number) {
  return x >= 0 && y >= 0 && x < board.width && y < board.height
}

export function tileAt(variant: Variant, x: number, y: number): Tile | null {
  if (!inBounds(variant.board, x, y)) return null
  return variant.board.tiles[y]?.[x] ?? null
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
  const tile = tileAt(variant, x, y)
  if (!tile) return null
  if (tile.terrain !== 'portal' && tile.terrain !== 'oneway') return { x, y }
  const dest = tile.target
    ? tile.target
    : { x: variant.board.width - 1 - x, y: variant.board.height - 1 - y }
  if (!inBounds(variant.board, dest.x, dest.y)) return null
  return { x: dest.x, y: dest.y }
}

function isBlocking(tile: Tile | null) {
  return !tile || tile.terrain === 'void' || tile.terrain === 'wall'
}

function orient(variant: Variant, piece: PieceType, teamId: string, v: Vec): Vec {
  const team = teamById(variant, teamId)
  if (!piece.flags.mirror || !team || team.forward === 'up') return v
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

  return {
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
  }
}

export function movesFor(state: GameState, x: number, y: number): Move[] {
  const { variant } = state
  const pieceId = state.board[y]?.[x]
  if (!pieceId) return []
  const inst = state.pieces[pieceId]
  if (!inst) return []
  const piece = state.pieceTypes[inst.typeId]
  if (!piece) return []
  if (piece.flags.movesOnce && inst.hasMoved) return []

  const moves: Move[] = []
  const seen = new Set<string>()

  // A piece that reaches the far rank may turn into one of several pieces.
  const promoOptions = (piece.promotion?.typeIds ?? []).filter((id) => !!state.pieceTypes[id])
  const team = teamById(variant, inst.team)
  const farRank = team?.forward === 'down' ? variant.board.height - 1 : 0

  const push = (
    tx: number,
    ty: number,
    mode: 'move' | 'capture',
    allowCapture: boolean,
  ) => {
    if (!inBounds(variant.board, tx, ty)) return
    const tile = tileAt(variant, tx, ty)
    if (isBlocking(tile)) return
    const final = resolvePortals(variant, tx, ty)
    if (!final || !inBounds(variant.board, final.x, final.y)) return
    const finalTile = tileAt(variant, final.x, final.y)
    if (isBlocking(finalTile)) return

    const occupant = state.board[final.y][final.x]
    const key = `${final.x},${final.y}`
    if (seen.has(key)) return
    const promotion = promoOptions.length && final.y === farRank ? promoOptions : undefined

    if (occupant === null) {
      if (mode === 'capture') return
      seen.add(key)
      moves.push({
        from: { x, y },
        to: { x: tx, y: ty },
        pieceId,
        effects: piece.effects.map((e) => ({ ...e })),
        finalTo: final,
        promotionOptions: promotion,
      })
      return
    }

    const occInst = state.pieces[occupant]
    if (!occInst) return
    if (occInst.team === inst.team) return
    if (!allowCapture && mode === 'move') return
    const occPiece = state.pieceTypes[occInst.typeId]
    if (occPiece?.flags.uncapturable) return
    seen.add(key)
    moves.push({
      from: { x, y },
      to: { x: tx, y: ty },
      pieceId,
      capturedId: occupant,
      effects: piece.effects.map((e) => ({ ...e })),
      finalTo: final,
      promotionOptions: promotion,
    })
  }

  const pieces = (patterns: MovePattern[]) => patterns.filter(Boolean)

  const run = (
    patterns: MovePattern[],
    mode: 'move' | 'capture',
    allowCapture: boolean,
  ) => {
    for (const pattern of pieces(patterns)) {
      if (pattern.firstMoveOnly && inst.hasMoved) continue
      for (const raw of pattern.vectors) {
        const v = orient(variant, piece, inst.team, raw)
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
          if (!inBounds(variant.board, tx, ty)) break
          const tile = tileAt(variant, tx, ty)
          if (isBlocking(tile)) break
          const isPortal = tile?.terrain === 'portal' || tile?.terrain === 'oneway'
          const final = resolvePortals(variant, tx, ty)
          if (!final || !inBounds(variant.board, final.x, final.y)) {
            if (!piece.flags.jump) break
            continue
          }
          const occupant = state.board[final.y][final.x]
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
    const enPassant = enPassantMove(state, x, y, inst, piece, seen)
    if (enPassant) moves.push(enPassant)
  }

  if (piece.flags.royal) moves.push(...castlingMoves(state, x, y, inst, piece, seen))

  if (piece.flags.mustCapture) return moves.filter((m) => !!m.capturedId)
  return moves
}

/**
 * Standard castling: an unmoved royal piece and an unmoved friendly rook on the
 * same rank, with every square between them open. The king travels two squares
 * toward the rook and the rook lands on the square the king crossed.
 */
function castlingMoves(
  state: GameState,
  x: number,
  y: number,
  inst: GameState['pieces'][string],
  piece: PieceType,
  seen: Set<string>,
): Move[] {
  if (inst.hasMoved) return []
  if (tileAt(state.variant, x, y)?.terrain !== 'normal') return []

  const moves: Move[] = []
  for (const dir of [-1, 1] as const) {
    const finalX = x + dir * 2
    if (!inBounds(state.variant.board, finalX, y)) continue

    let rookId: string | null = null
    let rookX = x
    for (let scan = x + dir; inBounds(state.variant.board, scan, y); scan += dir) {
      const tile = tileAt(state.variant, scan, y)
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
        rookX = scan
      }
      break
    }
    if (!rookId) continue

    const rookToX = x + dir
    if (state.board[y][finalX] !== null || state.board[y][rookToX] !== null) continue
    const key = `${finalX},${y}`
    if (seen.has(key)) continue
    seen.add(key)
    moves.push({
      from: { x, y },
      to: { x: finalX, y },
      pieceId: inst.id,
      effects: piece.effects.map((e) => ({ ...e })),
      finalTo: { x: finalX, y },
      castle: {
        rookId,
        rookFrom: { x: rookX, y },
        rookTo: { x: rookToX, y },
      },
    })
  }
  return moves
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
  seen: Set<string>,
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
  if (seen.has(`${skipped.x},${skipped.y}`)) return null

  // The skipped square must be one of our capture steps.
  const patterns = piece.capture.length > 0 ? piece.capture : piece.move
  const attacksIt = patterns.some((pattern) =>
    pattern.vectors.some((raw) => {
      const v = orient(state.variant, piece, inst.team, raw)
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
    effects: piece.effects.map((e) => ({ ...e })),
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
export function cloneState(state: GameState): GameState {
  return {
    ...state,
    board: state.board.map((row) => row.slice()),
    pieces: { ...state.pieces },
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
  if (isInCheck(state, inst.team)) return false
  const dir = Math.sign(move.finalTo.x - move.from.x)
  return isRoyalSafeOnSquare(state, move.pieceId, inst.team, move.from.x + dir, move.from.y)
}

/* ------------------------------------------------- fast legality for a team */

function squareKey(x: number, y: number) {
  return `${x},${y}`
}

/** The squares the other armies can take right now. */
function enemyAttackSquares(state: GameState, enemyTeams: Set<string>): Set<string> {
  const squares = new Set<string>()
  for (const id in state.pieces) {
    const inst = state.pieces[id]
    if (!enemyTeams.has(inst.team)) continue
    const at = findPiece(state, id)
    if (!at) continue
    for (const move of movesFor(state, at.x, at.y)) {
      if (!move.capturedId) continue
      squares.add(squareKey(move.finalTo.x, move.finalTo.y))
    }
  }
  return squares
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
    for (const raw of pattern.vectors) {
      const v = orient(state.variant, piece, teamId, raw)
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
): Set<string> {
  const exposed = new Set<string>()
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
    exposed.add(squareKey(first.x, first.y))
  }
  return exposed
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
export function legalOptionsForTeam(state: GameState, teamId: string): MoveOption[] {
  const options: MoveOption[] = []
  const royals: { id: string; at: Vec }[] = []
  for (const id in state.pieces) {
    const inst = state.pieces[id]
    if (inst.team !== teamId) continue
    if (!state.pieceTypes[inst.typeId]?.flags.royal) continue
    const at = findPiece(state, id)
    if (at) royals.push({ id, at })
  }
  const enemyTeams = new Set(
    state.variant.teams.filter((t) => t.id !== teamId).map((t) => t.id),
  )
  const attacked = enemyTeams.size ? enemyAttackSquares(state, enemyTeams) : new Set<string>()
  const royalIds = new Set(royals.map((r) => r.id))
  const inCheck = royals.some((r) => attacked.has(squareKey(r.at.x, r.at.y)))
  // With several royal pieces it is not worth guessing — check every move.
  const exposed =
    inCheck || royals.length !== 1
      ? null
      : exposedSquares(state, royals[0].at, teamId, enemyTeams)

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
          !exposed.has(squareKey(move.from.x, move.from.y)) &&
          !royalIds.has(move.pieceId) &&
          !needsSlowCheck(move)
        if (fast) {
          options.push({ move, next: applyMove(state, move, { compute: false }) })
          continue
        }
        const next = applyMove(state, move, { compute: false })
        if (isInCheck(next, inst.team)) continue
        options.push({ move, next })
      }
    }
  }
  return options
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
}

export function applyMove(
  state: GameState,
  move: Move,
  options: ApplyOptions = {},
): GameState {
  const compute = options.compute ?? true
  const next: GameState = cloneState(state)
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
      next.captured.push({ team: capturedInst.team, typeId: capturedInst.typeId, by: inst.team })
      if (capturedPiece) {
        next.scores[inst.team] = (next.scores[inst.team] ?? 0) + capturedPiece.value
      }
    }
  }

  // Remove from origin, place on destination.
  if (next.board[move.from.y]?.[move.from.x] === move.pieceId) {
    next.board[move.from.y][move.from.x] = null
  }
  if (next.board[fy][fx] && next.board[fy][fx] !== move.pieceId) {
    const leftover = next.board[fy][fx] as string
    const leftoverInst = next.pieces[leftover]
    if (leftoverInst) {
      const leftoverPiece = next.pieceTypes[leftoverInst.typeId]
      next.captured.push({ team: leftoverInst.team, typeId: leftoverInst.typeId, by: inst.team })
      if (leftoverPiece) {
        next.scores[inst.team] = (next.scores[inst.team] ?? 0) + leftoverPiece.value
      }
      delete next.pieces[leftover]
    }
  }
  next.board[fy][fx] = move.pieceId
  touch(move.pieceId)
  next.pieces[move.pieceId].hasMoved = true

  // Castling moves the rook in the same turn.
  if (move.castle) {
    const { rookId, rookFrom, rookTo } = move.castle
    if (next.board[rookFrom.y]?.[rookFrom.x] === rookId) {
      next.board[rookFrom.y][rookFrom.x] = null
      next.board[rookTo.y][rookTo.x] = rookId
      if (next.pieces[rookId]) {
        touch(rookId)
        next.pieces[rookId].hasMoved = true
      }
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
          next.captured.push({ team: oInst.team, typeId: oInst.typeId, by: inst.team })
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
        promotionTypeId = target.id
        touch(move.pieceId)
        next.pieces[move.pieceId].typeId = target.id
      }
    }
  }

  const record = {
    move: { ...move, promotionTypeId },
    team: state.turn,
    notation: notationFor(
      state,
      move,
      piece,
      capturedPiece,
      promotionTypeId ? next.pieceTypes[promotionTypeId]?.name : undefined,
    ),
    san: options.san ? sanFor(state, move, next) : undefined,
    capturedName: capturedPiece?.name,
    blasts: blasts.length ? blasts : undefined,
    origin: options.origin,
  }
  next.moveHistory = [...next.moveHistory, record]

  // Turn switch
  const order = next.variant.teams.map((t) => t.id)
  const idx = order.indexOf(next.turn)
  next.turn = order[(idx + 1) % order.length]

  if (compute) {
    detectOutcome(next, inst.team, { capturedRoyal: !!capturedPiece?.flags.royal || blastRoyal })
  }
  return next
}

function notationFor(
  state: GameState,
  move: Move,
  piece: PieceType,
  capturedPiece?: PieceType,
  promotionName?: string,
) {
  if (move.castle) return move.finalTo.x > move.from.x ? 'O-O' : 'O-O-O'
  const from = squareName(state.variant, move.from.x, move.from.y)
  const to = squareName(state.variant, move.finalTo.x, move.finalTo.y)
  const cap = move.capturedId ? 'x' : '-'
  const suffix = capturedPiece ? ` (${capturedPiece.name})` : ''
  const enPassant = move.capturedAt ? ' e.p.' : ''
  const promotion = promotionName ? `=${promotionName}` : ''
  return `${piece.name} ${from}${cap}${to}${promotion}${enPassant}${suffix}`
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
    return (move.finalTo.x > move.from.x ? 'O-O' : 'O-O-O') + checkSuffix(next)
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
}

export function cloneEffects(effects: Effect[]): Effect[] {
  return effects.map((e) => ({ ...e }))
}
