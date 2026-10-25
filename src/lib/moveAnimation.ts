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

export interface MoveAnim {
  /** Bumped per move so the layer remounts and the animations replay. */
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
export function planMove(prev: GameState, game: GameState): MoveAnim | null {
  if (game.moveHistory.length <= prev.moveHistory.length) return null
  const record = game.moveHistory[game.moveHistory.length - 1]
  const move = record.move
  const mover = prev.pieces[move.pieceId]
  if (!mover) return null

  const flights: Flight[] = []
  const dissolves: Dissolve[] = []
  const pops: Pop[] = []

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

/**
 * Tracks the animation of the latest move. The plan is known during the very
 * first render after a move, so a piece is never drawn in two places at once.
 */
export function useMoveAnimation(game: GameState) {
  const [anim, setAnim] = useState<MoveAnim | null>(null)
  const [duration, setDuration] = useState(0)
  const [prevGame, setPrevGame] = useState<GameState | null>(null)

  // Derive the animation of the move that was just played.
  if (prevGame !== game) {
    const plan = prevGame ? planMove(prevGame, game) : null
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
