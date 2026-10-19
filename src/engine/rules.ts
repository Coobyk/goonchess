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
    const id = uid()
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

    if (occupant === null) {
      if (mode === 'capture') return
      seen.add(key)
      moves.push({
        from: { x, y },
        to: { x: tx, y: ty },
        pieceId,
        effects: piece.effects.map((e) => ({ ...e })),
        finalTo: final,
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

  if (piece.flags.mustCapture) return moves.filter((m) => !!m.capturedId)
  return moves
}

export function isInCheck(state: GameState, teamId: string): boolean {
  const royals: Vec[] = []
  for (const id in state.pieces) {
    const inst = state.pieces[id]
    if (inst.team !== teamId) continue
    if (state.pieceTypes[inst.typeId]?.flags.royal) {
      const pos = findPiece(state, id)
      if (pos) royals.push(pos)
    }
  }
  if (royals.length === 0) return false

  for (const id in state.pieces) {
    const inst = state.pieces[id]
    if (inst.team === teamId) continue
    const pos = findPiece(state, id)
    if (!pos) continue
    const caps = movesFor(state, pos.x, pos.y)
    for (const m of caps) {
      if (!m.capturedId) continue
      const target = state.pieces[m.capturedId]
      if (target && target.team === teamId && state.pieceTypes[target.typeId]?.flags.royal) {
        return true
      }
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

export function getLegalMoves(state: GameState, x: number, y: number): Move[] {
  const pieceId = state.board[y]?.[x]
  if (!pieceId) return []
  const inst = state.pieces[pieceId]
  if (!inst) return []
  return movesFor(state, x, y).filter((m) => {
    const next = applyMove(state, m, { compute: false })
    return !isInCheck(next, inst.team)
  })
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
}

export function applyMove(
  state: GameState,
  move: Move,
  options: ApplyOptions = {},
): GameState {
  const compute = options.compute ?? true
  const next: GameState = structuredClone(state)
  const inst = next.pieces[move.pieceId]
  if (!inst) return next
  const piece = next.pieceTypes[inst.typeId]
  if (!piece) return next

  const hasSwap = move.effects.some((e) => e.kind === 'swap')
  const capturedInst = move.capturedId ? next.pieces[move.capturedId] : undefined
  const capturedPiece = capturedInst ? next.pieceTypes[capturedInst.typeId] : undefined

  const fx = move.finalTo.x
  const fy = move.finalTo.y

  if (move.capturedId && capturedInst) {
    if (hasSwap) {
      // Swap positions instead of capturing.
      next.board[fy][fx] = null
      next.pieces[move.capturedId].hasMoved = true
    } else {
      delete next.pieces[move.capturedId]
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
  next.pieces[move.pieceId].hasMoved = true

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
          const sid = uid()
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
      const target = next.pieceTypes[piece.promotion.typeId]
      if (target) {
        promotionTypeId = target.id
        next.pieces[move.pieceId].typeId = target.id
      }
    }
  }

  const record = {
    move: { ...move, promotionTypeId },
    team: state.turn,
    notation: notationFor(state, move, piece, capturedPiece),
    capturedName: capturedPiece?.name,
    blasts: blasts.length ? blasts : undefined,
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
) {
  const from = squareName(state.variant, move.from.x, move.from.y)
  const to = squareName(state.variant, move.finalTo.x, move.finalTo.y)
  const cap = move.capturedId ? 'x' : '-'
  const suffix = capturedPiece ? ` (${capturedPiece.name})` : ''
  return `${piece.name} ${from}${cap}${to}${suffix}`
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
