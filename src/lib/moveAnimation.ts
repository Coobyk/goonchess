import { useEffect, useState } from 'react'
import type { GameState, Vec } from '@/engine/types'

/**
 * Move animation. A piece glides from the square it left to the square it
 * landed on instead of teleporting. The plan is derived by diffing the previous
 * and the current game state, so every engine effect (capture, swap, blast,
 * spawn, portal) animates without the rules engine knowing anything about it.
 */

/** Delay between the shockwave reaching each ring of a blast. */
export const BLAST_STAGGER = 55

const BASE_MS = 120
const PER_SQUARE_MS = 70
const MAX_MS = 480
const DISSOLVE_MS = 200
const POP_MS = 260
const EMERGE_MS = 190

/** Stagger between captured pieces fading out, one after another. */
const FADE_STAGGER = 30

/** Stagger between pieces leaving as a board transition starts. */
const TRANSITION_STAGGER = 20

/** Cap on that stagger, so a full board never waits too long to settle. */
const TRANSITION_MAX_STAGGER = 360

export type FlightKind = 'slide' | 'vanish' | 'emerge'

export interface Flight {
  key: string
  pieceId: string
  typeId: string
  team: string
  from: Vec
  to: Vec
  kind: FlightKind
  duration: number
  delay: number
}

export interface Dissolve {
  key: string
  typeId: string
  team: string
  at: Vec
  delay: number
  duration: number
}

export interface Pop {
  key: string
  pieceId: string
  typeId: string
  team: string
  at: Vec
  delay: number
}

/**
 * A board transition: a move, an undo, a reset, a variant switch or the first
 * laying out of an army. Every change the board can go through is planned as
 * flights, dissolves and pops, so pieces glide instead of teleporting.
 */
export interface Anim {
  /** Bumped per animation so the layer remounts and the animations replay. */
  id: number
  flights: Flight[]
  dissolves: Dissolve[]
  pops: Pop[]
  /** Time until the moving piece has landed. */
  duration: number
  /** Time until every animation of the move has finished. */
  total: number
}

function inBounds(game: GameState, x: number, y: number) {
  return x >= 0 && y >= 0 && x < game.variant.board.width && y < game.variant.board.height
}

function span(a: Vec, b: Vec) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

/** How long a piece takes to walk from one square to another. */
export function travelMs(from: Vec, to: Vec) {
  return Math.min(MAX_MS, BASE_MS + PER_SQUARE_MS * span(from, to))
}

/** Builds the animation for the move that was just played. */
export function planMove(prev: GameState, game: GameState): Anim | null {
  if (game.moveHistory.length <= prev.moveHistory.length) return null
  const record = game.moveHistory[game.moveHistory.length - 1]
  const move = record.move
  const mover = prev.pieces[move.pieceId]
  if (!mover && !move.drop) return null

  const flights: Flight[] = []
  const dissolves: Dissolve[] = []
  const pops: Pop[] = []

  // A drop has no square to fly from: the piece grows out of the one it
  // lands on. Reaching here without a mover means the move was a drop.
  if (!mover) {
    pops.push({
      key: 'drop',
      pieceId: move.pieceId,
      typeId: move.drop?.typeId ?? '',
      team: record.team,
      at: move.finalTo,
      delay: 0,
    })
    return {
      id: game.moveHistory.length,
      flights,
      dissolves,
      pops,
      duration: 0,
      total: POP_MS,
    }
  }

  const flight = (key: string, pieceId: string, typeId: string, team: string, from: Vec, to: Vec, kind: FlightKind, duration: number, delay: number): Flight => ({
    key,
    pieceId,
    typeId,
    team,
    from,
    to,
    kind,
    duration,
    delay,
  })

  // A portal hop ends on a different square than the one that was stepped on.
  const throughPortal = move.to.x !== move.finalTo.x || move.to.y !== move.finalTo.y
  // A dragged piece is already under the cursor, so its flight starts there
  // instead of snapping back to the square it came from.
  const start = record.origin ?? move.from
  const travel = travelMs(start, move.to)
  // A promotion chosen after the piece has already walked to the far rank only
  // has to change kind where it stands, so it pops instead of flying.
  const inPlace = !throughPortal && span(start, move.finalTo) === 0
  let landing: number

  if (inPlace) {
    const changed = game.pieces[move.pieceId]?.typeId
    if (changed && changed !== mover.typeId) {
      pops.push({
        key: 'promote',
        pieceId: move.pieceId,
        typeId: changed,
        team: mover.team,
        at: move.finalTo,
        delay: 0,
      })
    }
    landing = 0
  } else if (throughPortal) {
    // The piece sinks into the portal and grows back out of the exit.
    flights.push(flight('mover-in', move.pieceId, mover.typeId, mover.team, start, move.to, 'vanish', travel, 0))
    flights.push(flight('mover-out', move.pieceId, mover.typeId, mover.team, move.finalTo, move.finalTo, 'emerge', EMERGE_MS, travel))
    landing = travel + EMERGE_MS
  } else {
    flights.push(flight('mover', move.pieceId, mover.typeId, mover.team, start, move.finalTo, 'slide', travel, 0))
    landing = travel
  }

  // The rook glides alongside the king when castling.
  if (move.castle) {
    const rook = prev.pieces[move.castle.rookId]
    if (rook) {
      flights.push(
        flight(
          'castle-rook',
          move.castle.rookId,
          rook.typeId,
          rook.team,
          move.castle.rookFrom,
          move.castle.rookTo,
          'slide',
          travel,
          0,
        ),
      )
    }
  }

  // A captured piece either trades places with the mover or dissolves on arrival.
  const captured = move.capturedId ? prev.pieces[move.capturedId] : undefined
  if (captured && move.capturedId) {
    if (move.effects.some((e) => e.kind === 'swap')) {
      flights.push(flight('swap', move.capturedId, captured.typeId, captured.team, move.finalTo, move.from, 'slide', travel, 0))
    } else {
      // The fade runs out exactly when the mover lands.
      const fade = Math.min(DISSOLVE_MS, landing)
      dissolves.push({
        key: 'captured',
        typeId: captured.typeId,
        team: captured.team,
        at: move.capturedAt ?? move.finalTo,
        delay: Math.max(0, landing - fade),
        duration: fade,
      })
    }
  }

  // Pieces caught in a blast fade out as the shockwave reaches them.
  for (const blast of record.blasts ?? []) {
    for (const victim of blast.victims) {
      const id = prev.board[victim.y]?.[victim.x]
      if (!id) continue
      const inst = prev.pieces[id]
      if (!inst) continue
      const ring = Math.max(Math.abs(victim.x - blast.x), Math.abs(victim.y - blast.y))
      dissolves.push({
        key: `blast-${victim.x}-${victim.y}`,
        typeId: inst.typeId,
        team: inst.team,
        at: victim,
        delay: landing + ring * BLAST_STAGGER,
        duration: DISSOLVE_MS,
      })
    }
  }

  // A spawned piece pops into existence once the mover has landed.
  for (const eff of move.effects) {
    if (eff.kind !== 'spawn') continue
    const at = { x: move.from.x + eff.offset.x, y: move.from.y + eff.offset.y }
    if (!inBounds(prev, at.x, at.y)) continue
    if (prev.board[at.y][at.x] !== null) continue
    if (!prev.pieceTypes[eff.pieceTypeId]) continue
    const spawnedId = game.board[at.y]?.[at.x]
    if (!spawnedId) continue
    pops.push({
      key: `spawn-${at.x}-${at.y}`,
      pieceId: spawnedId,
      typeId: eff.pieceTypeId,
      team: mover.team,
      at,
      delay: landing,
    })
  }

  const total = Math.max(
    landing,
    ...flights.map((f) => f.delay + f.duration),
    ...dissolves.map((d) => d.delay + d.duration),
    ...pops.map((p) => p.delay + POP_MS),
  )

  return { id: game.moveHistory.length, flights, dissolves, pops, duration: landing, total }
}

/** A piece standing on the board, in the terms the animator cares about. */
interface PieceSpot {
  pieceId: string
  x: number
  y: number
  typeId: string
  team: string
}

function collectPieces(game: GameState): PieceSpot[] {
  const spots: PieceSpot[] = []
  for (let y = 0; y < game.variant.board.height; y++) {
    for (let x = 0; x < game.variant.board.width; x++) {
      const pieceId = game.board[y][x]
      if (!pieceId) continue
      const piece = game.pieces[pieceId]
      if (piece) spots.push({ pieceId, x, y, typeId: piece.typeId, team: piece.team })
    }
  }
  return spots
}

let animSeq = 0
const nextAnimId = () => ++animSeq

/** Rings of the old board leave from the centre outwards. */
function staggerFlights(flights: Flight[], from: GameState) {
  const centerX = (from.variant.board.width - 1) / 2
  const centerY = (from.variant.board.height - 1) / 2
  flights.sort(
    (a, b) =>
      Math.max(Math.abs(a.from.x - centerX), Math.abs(a.from.y - centerY)) -
      Math.max(Math.abs(b.from.x - centerX), Math.abs(b.from.y - centerY)),
  )
  for (let i = 0; i < flights.length; i++) {
    flights[i].delay = Math.min(TRANSITION_MAX_STAGGER, i * TRANSITION_STAGGER)
  }
}

/**
 * A board that is not reached by a move — an undo, a jump through history, a
 * reset, a variant switch. Pieces keep their identity where they can: the same
 * piece glides from where it stood to where it stands now, the rest are matched
 * to an old piece of the same kind by nearest square, and whatever has no
 * counterpart pops in or fades out.
 */
export function planBoardTransition(prev: GameState, game: GameState): Anim | null {
  const { width, height } = game.variant.board
  if (prev.variant.board.width !== width || prev.variant.board.height !== height) {
    // A differently sized board has no squares to glide between; it just
    // appears as it is.
    return null
  }

  const before = collectPieces(prev)
  const after = collectPieces(game)
  if (!before.length && !after.length) return null

  const flights: Flight[] = []
  const dissolves: Dissolve[] = []
  const pops: Pop[] = []

  const standing = new Map(before.map((spot) => [spot.pieceId, spot]))
  // Pieces of the new state whose square (or kind) has no old self yet.
  const homeless: PieceSpot[] = []

  for (const spot of after) {
    const was = standing.get(spot.pieceId)
    if (!was) {
      homeless.push(spot)
      continue
    }
    standing.delete(spot.pieceId)
    if (was.x === spot.x && was.y === spot.y) {
      // A promotion choosing its kind in place only has to pop once.
      if (was.typeId !== spot.typeId) {
        pops.push({
          key: `turn-${spot.pieceId}`,
          pieceId: spot.pieceId,
          typeId: spot.typeId,
          team: spot.team,
          at: { x: spot.x, y: spot.y },
          delay: 0,
        })
      }
      continue
    }
    flights.push({
      key: `glide-${spot.pieceId}`,
      pieceId: spot.pieceId,
      typeId: spot.typeId,
      team: spot.team,
      from: { x: was.x, y: was.y },
      to: { x: spot.x, y: spot.y },
      kind: 'slide',
      duration: travelMs({ x: was.x, y: was.y }, { x: spot.x, y: spot.y }),
      delay: 0,
    })
  }

  // The old pieces nobody claimed become landing spots for the homeless, each
  // taking the nearest free old piece of the same kind.
  const vacant = [...standing.values()]
  const claimed = new Set<string>()
  for (const spot of homeless) {
    let best: PieceSpot | null = null
    let bestDistance = Infinity
    for (const was of vacant) {
      if (claimed.has(was.pieceId)) continue
      if (was.typeId !== spot.typeId || was.team !== spot.team) continue
      const distance = Math.abs(was.x - spot.x) + Math.abs(was.y - spot.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = was
      }
    }
    if (best) {
      claimed.add(best.pieceId)
      if (bestDistance > 0) {
        flights.push({
          key: `settle-${spot.pieceId}`,
          pieceId: spot.pieceId,
          typeId: spot.typeId,
          team: spot.team,
          from: { x: best.x, y: best.y },
          to: { x: spot.x, y: spot.y },
          kind: 'slide',
          duration: travelMs({ x: best.x, y: best.y }, { x: spot.x, y: spot.y }),
          delay: 0,
        })
      }
    } else {
      pops.push({
        key: `arrive-${spot.pieceId}`,
        pieceId: spot.pieceId,
        typeId: spot.typeId,
        team: spot.team,
        at: { x: spot.x, y: spot.y },
        delay: 0,
      })
    }
  }

  // What is left of the old army fades where it stands.
  let fading = 0
  for (const was of vacant) {
    if (claimed.has(was.pieceId)) continue
    dissolves.push({
      key: `fade-${was.pieceId}`,
      typeId: was.typeId,
      team: was.team,
      at: { x: was.x, y: was.y },
      delay: fading * FADE_STAGGER,
      duration: DISSOLVE_MS,
    })
    fading++
  }

  if (!flights.length && !dissolves.length && !pops.length) return null

  staggerFlights(flights, prev)

  const total = Math.max(
    0,
    ...flights.map((f) => f.delay + f.duration),
    ...dissolves.map((d) => d.delay + d.duration),
    ...pops.map((p) => p.delay + POP_MS),
  )
  return { id: nextAnimId(), flights, dissolves, pops, duration: total, total }
}

/**
 * Plans whichever animation the change from the previous state calls for: a
 * move glides, everything else — undo, jump, reset, variant switch — is a
 * board transition. The first board is not a change at all: the pieces are
 * simply there.
 */
function planTransition(prev: GameState | null, game: GameState): Anim | null {
  if (!prev) return null
  const sameVariant = prev.variant === game.variant || prev.variant.id === game.variant.id
  if (sameVariant && game.moveHistory.length > prev.moveHistory.length) {
    return planMove(prev, game)
  }
  return planBoardTransition(prev, game)
}

/**
 * Tracks the animation of the latest board change. The plan is known during
 * the very first render after the change, so a piece is never drawn in two
 * places at once.
 */
export function useMoveAnimation(game: GameState) {
  const [anim, setAnim] = useState<Anim | null>(null)
  const [duration, setDuration] = useState(0)
  const [prevGame, setPrevGame] = useState<GameState | null>(null)

  if (prevGame !== game) {
    const plan = planTransition(prevGame, game)
    setAnim(plan)
    setDuration(plan?.duration ?? 0)
    setPrevGame(game)
  }

  useEffect(() => {
    if (!anim) return
    const timer = window.setTimeout(() => setAnim(null), anim.total + 80)
    return () => window.clearTimeout(timer)
  }, [anim])

  return { anim, duration }
}