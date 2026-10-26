import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves } from '@/engine/rules'
import { classicChess } from '@/engine/templates'
import { planBoardEntrance, planBoardTransition, planMove } from './moveAnimation'

type State = ReturnType<typeof createInitialState>

function play(game: State, from: [number, number], to: [number, number]) {
  const move = getLegalMoves(game, from[0], from[1]).find(
    (m) => m.to.x === to[0] && m.to.y === to[1],
  )
  expect(move).toBeTruthy()
  return applyMove(game, move!)
}

describe('planMove', () => {
  it('slides the mover from its square to the one it landed on', () => {
    const before = createInitialState(classicChess())
    const after = play(before, [4, 6], [4, 4])
    const anim = planMove(before, after)
    expect(anim).not.toBeNull()
    expect(anim!.flights).toHaveLength(1)
    expect(anim!.flights[0].from).toEqual({ x: 4, y: 6 })
    expect(anim!.flights[0].to).toEqual({ x: 4, y: 4 })
    expect(anim!.flights[0].kind).toBe('slide')
    expect(anim!.dissolves).toHaveLength(0)
    expect(anim!.pops).toHaveLength(0)
  })

  it('dissolves a captured piece where it stood', () => {
    const before = createInitialState(classicChess())
    const after = play(play(before, [4, 6], [4, 4]), [3, 1], [3, 3])
    const capturing = play(after, [4, 4], [3, 3])
    const anim = planMove(after, capturing)
    expect(anim!.dissolves).toHaveLength(1)
    expect(anim!.dissolves[0].at).toEqual({ x: 3, y: 3 })
  })

  it('grows a drop out of the square it lands on', () => {
    const before = createInitialState(classicChess())
    const after = play(before, [4, 6], [4, 4])
    expect(planMove(before, after)!.duration).toBeGreaterThan(0)
  })
})

describe('planBoardEntrance', () => {
  it('pops every piece of the starting army in a staggered wave', () => {
    const anim = planBoardEntrance(createInitialState(classicChess()))
    expect(anim).not.toBeNull()
    expect(anim!.pops).toHaveLength(32)
    expect(anim!.flights).toHaveLength(0)
    // Delays grow piece by piece and are capped.
    const delays = anim!.pops.map((p) => p.delay)
    expect(delays[0]).toBe(0)
    expect(Math.max(...delays)).toBeLessThanOrEqual(600)
    expect(new Set(delays).size).toBeGreaterThan(1)
  })

  it('plans nothing for an empty board', () => {
    expect(planBoardEntrance(createInitialState(classicChess()))).not.toBeNull()
    const empty = classicChess()
    empty.setup = []
    expect(planBoardEntrance(createInitialState(empty))).toBeNull()
  })
})

describe('planBoardTransition', () => {
  it('glides the same piece back home on undo, by identity', () => {
    const opening = createInitialState(classicChess())
    const after = play(opening, [4, 6], [4, 4])
    const anim = planBoardTransition(after, opening)
    expect(anim).not.toBeNull()
    expect(anim!.flights).toHaveLength(1)
    expect(anim!.flights[0].pieceId).toBe(after.board[4][4])
    expect(anim!.flights[0].from).toEqual({ x: 4, y: 4 })
    expect(anim!.flights[0].to).toEqual({ x: 4, y: 6 })
  })

  it('conserves the army on a reset by matching kinds, gliding what moved', () => {
    const played = play(createInitialState(classicChess()), [4, 6], [4, 4])
    // A restart deals a new state from the same variant, so ids change.
    const fresh = createInitialState(played.variant)
    const anim = planBoardTransition(played, fresh)
    expect(anim).not.toBeNull()
    // Every piece found a home: nothing pops in, nothing fades out.
    expect(anim!.pops).toHaveLength(0)
    expect(anim!.dissolves).toHaveLength(0)
    // The e-pawn lands back on its home square by kind matching.
    expect(anim!.flights.length).toBeGreaterThan(0)
    expect(anim!.flights.every((f) => Math.max(Math.abs(f.to.x - f.from.x), Math.abs(f.to.y - f.from.y)) <= 2)).toBe(true)
  })

  it('pops in pieces the new state has and fades the ones it lost', () => {
    const variant = classicChess()
    const pawn = variant.pieceTypes.find((p) => p.name === 'Pawn')!
    const full = createInitialState(variant)
    const smaller = createInitialState({ ...variant, setup: variant.setup.filter((s) => s.typeId !== pawn.id || s.team !== 'white' || s.x !== 4) })
    const anim = planBoardTransition(full, smaller)
    expect(anim!.dissolves).toHaveLength(1)
    expect(anim!.pops).toHaveLength(0)
    const back = planBoardTransition(smaller, full)
    expect(back!.pops).toHaveLength(1)
    expect(back!.dissolves).toHaveLength(0)
  })

  it('falls back to an entrance when the board changes size', () => {
    const played = createInitialState(classicChess())
    const mini = createInitialState(classicChess())
    mini.variant = { ...mini.variant, board: { width: 6, height: 6, tiles: [] } }
    const anim = planBoardTransition(played, mini)
    expect(anim).not.toBeNull()
    expect(anim!.flights).toHaveLength(0)
    expect(anim!.pops.length).toBeGreaterThan(0)
  })
})
