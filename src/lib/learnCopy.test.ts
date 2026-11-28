import { describe, expect, it } from 'vitest'
import { getLegalMoves } from '@/engine/rules'
import { classicChess, turnChess } from '@/engine/templates'
import type { PieceType, Variant } from '@/engine/types'
import { buildPieceDemoState, computePatternPreview, flagCopy } from './learnCopy'

const key = (x: number, y: number) => `${x},${y}`

function pieceNamed(variant: Variant, name: string): PieceType {
  const piece = variant.pieceTypes.find((candidate) => candidate.name === name)
  if (!piece) throw new Error(`missing piece ${name}`)
  return piece
}

function moveKeys(variant: Variant, piece: PieceType, withTargets = false) {
  const demo = buildPieceDemoState(variant, piece, { boardSize: 7, withTargets })
  return new Set(
    getLegalMoves(demo.state, demo.center.x, demo.center.y).map((move) => key(move.finalTo.x, move.finalTo.y)),
  )
}

describe('buildPieceDemoState', () => {
  it('shows a classic pawn quiet step and first-move double step on an empty board', () => {
    const variant = classicChess()
    const keys = moveKeys(variant, pieceNamed(variant, 'Pawn'))

    expect(keys.has(key(3, 2))).toBe(true)
    expect(keys.has(key(3, 1))).toBe(true)
    expect(keys.has(key(2, 2))).toBe(false)
    expect(keys.has(key(4, 2))).toBe(false)
  })

  it('places targets so a classic pawn can use its diagonal captures', () => {
    const variant = classicChess()
    const keys = moveKeys(variant, pieceNamed(variant, 'Pawn'), true)

    expect(keys.has(key(2, 2))).toBe(true)
    expect(keys.has(key(4, 2))).toBe(true)
  })

  it('shows the eight classic knight leaps', () => {
    const variant = classicChess()
    const keys = moveKeys(variant, pieceNamed(variant, 'Knight'))

    expect(keys).toEqual(
      new Set([
        key(4, 1),
        key(5, 2),
        key(5, 4),
        key(4, 5),
        key(2, 5),
        key(1, 4),
        key(1, 2),
        key(2, 1),
      ]),
    )
  })

  it('shows orthogonal rook movement and diagonal bishop movement', () => {
    const variant = classicChess()
    const rook = moveKeys(variant, pieceNamed(variant, 'Rook'))
    const bishop = moveKeys(variant, pieceNamed(variant, 'Bishop'))

    expect(rook.has(key(3, 0))).toBe(true)
    expect(rook.has(key(0, 3))).toBe(true)
    expect(rook.has(key(4, 4))).toBe(false)
    expect(bishop.has(key(0, 0))).toBe(true)
    expect(bishop.has(key(6, 6))).toBe(true)
    expect(bishop.has(key(3, 0))).toBe(false)
  })
})

describe('computePatternPreview classification', () => {
  it('marks pawn capture-only diagonals and its first-move double step', () => {
    const variant = classicChess()
    const preview = computePatternPreview(variant, pieceNamed(variant, 'Pawn'), { size: 7 })

    expect(preview.marks[key(2, 2)]).toBe('capture')
    expect(preview.marks[key(4, 2)]).toBe('capture')
    expect(preview.marks[key(3, 1)]).toBe('first-only')
    expect(preview.marks[key(3, 2)]).toBe('quiet')
  })
})

describe('computePatternPreview with Turn Chess orientations', () => {
  it('turns a rook at orientation 1 into a diagonal slider', () => {
    const variant = turnChess(123)
    const preview = computePatternPreview(variant, pieceNamed(variant, 'Rook'), { size: 7, orientation: 1 })

    expect(preview.marks[key(4, 2)]).toBe('both')
    expect(preview.marks[key(2, 4)]).toBe('both')
    expect(preview.marks[key(4, 3)]).toBeUndefined()
    expect(preview.marks[key(3, 4)]).toBeUndefined()
  })

  it('turns a bishop at orientation 1 into an orthogonal slider', () => {
    const variant = turnChess(123)
    const preview = computePatternPreview(variant, pieceNamed(variant, 'Bishop'), { size: 7, orientation: 1 })

    expect(preview.marks[key(4, 3)]).toBe('both')
    expect(preview.marks[key(3, 4)]).toBe('both')
    expect(preview.marks[key(4, 4)]).toBeUndefined()
    expect(preview.marks[key(2, 2)]).toBeUndefined()
  })

  it('turns a knight at orientation 1 into a two-square diagonal leaper', () => {
    const variant = turnChess(123)
    const preview = computePatternPreview(variant, pieceNamed(variant, 'Knight'), { size: 7, orientation: 1 })

    expect(preview.marks[key(5, 5)]).toBe('both')
    expect(preview.marks[key(5, 1)]).toBe('both')
    expect(preview.marks[key(1, 5)]).toBe('both')
    expect(preview.marks[key(1, 1)]).toBe('both')
    expect(Object.keys(preview.marks)).toHaveLength(4)
  })
})

describe('effects and flags', () => {
  it('marks spawn squares and explosion reach for a custom piece', () => {
    const base = classicChess()
    const knight = pieceNamed(base, 'Knight')
    const pawn = pieceNamed(base, 'Pawn')
    const spawner: PieceType = {
      ...knight,
      id: 'spawner',
      name: 'Spawner',
      effects: [
        { kind: 'spawn', pieceTypeId: pawn.id, offset: { x: 0, y: 1 } },
        { kind: 'explosion', radius: 1 },
      ],
    }
    const variant: Variant = { ...base, pieceTypes: [...base.pieceTypes, spawner] }
    const preview = computePatternPreview(variant, spawner, { size: 7 })

    expect(preview.marks[key(preview.center.x, preview.center.y + 1)]).toBe('spawn')
    expect(Object.values(preview.marks)).toContain('blast')
  })

  it('explains custom piece flags with labels and details', () => {
    const base = classicChess()
    const knight = pieceNamed(base, 'Knight')
    const custom: PieceType = {
      ...knight,
      id: 'hunter',
      name: 'Hunter',
      flags: { ...knight.flags, mustCapture: true, jump: true, movesOnce: true },
    }

    const copy = flagCopy(custom)
    expect(copy.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(['Capture-only', 'Leaps over blockers', 'One move only']),
    )
    expect(copy.every((entry) => entry.detail.length > 0)).toBe(true)
  })
})
