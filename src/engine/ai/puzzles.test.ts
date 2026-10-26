import { describe, expect, it } from 'vitest'
import { createInitialState, getLegalMoves } from '../rules'
import { classicChess } from '../templates'
import { describePuzzle } from './puzzles'

type State = ReturnType<typeof createInitialState>

const base = createInitialState(classicChess())

function typeId(name: string) {
  return base.variant.pieceTypes.find((p) => p.name === name)!.id
}

function variantWith(setup: State['variant']['setup']) {
  // The ids in the setup come from the base variant, so it is reused.
  return createInitialState({ ...base.variant, setup })
}

function moveOf(state: State, from: [number, number], to: [number, number]) {
  const move = getLegalMoves(state, from[0], from[1]).find(
    (m) => m.to.x === to[0] && m.to.y === to[1],
  )
  expect(move).toBeTruthy()
  return move!
}

describe('puzzle description', () => {
  it('names a check and a big capture when a queen takes a rook with check', () => {
    const K = 'King'
    const Q = 'Queen'
    const R = 'Rook'
    const state = variantWith([
      { typeId: typeId(K), team: 'black', x: 7, y: 0 }, // Kh8
      { typeId: typeId(R), team: 'black', x: 0, y: 0 }, // Ra8
      { typeId: typeId(Q), team: 'white', x: 4, y: 4 }, // Qe4
      { typeId: typeId(K), team: 'white', x: 0, y: 7 }, // Ka1
    ])
    // Qe4 takes the rook on a8, along the diagonal, and checks the king.
    const move = moveOf(state, [4, 4], [0, 0])
    const { themes, difficulty } = describePuzzle(state, move, 520)
    expect(themes).toContain('capture')
    expect(themes).toContain('check')
    expect(themes).toContain('big-capture')
    expect(difficulty).toBe('medium')
  })

  it('names a fork when the capturer lands on two worthwhile targets', () => {
    const state = variantWith([
      { typeId: typeId('King'), team: 'black', x: 7, y: 0 }, // Kh8
      { typeId: typeId('Rook'), team: 'black', x: 2, y: 1 }, // Rc7
      { typeId: typeId('Rook'), team: 'black', x: 4, y: 1 }, // Re7
      { typeId: typeId('Pawn'), team: 'black', x: 3, y: 3 }, // Pd5
      { typeId: typeId('Knight'), team: 'white', x: 1, y: 4 }, // Nb4
      { typeId: typeId('King'), team: 'white', x: 0, y: 7 }, // Ka1
    ])
    // The knight takes the pawn on d5 and attacks both rooks at once.
    const move = moveOf(state, [1, 4], [3, 3])
    const { themes } = describePuzzle(state, move, 300)
    expect(themes).toContain('capture')
    expect(themes).toContain('fork')
  })

  it('scales the difficulty with what the move wins', () => {
    const state = variantWith([
      { typeId: typeId('King'), team: 'black', x: 7, y: 0 },
      { typeId: typeId('Pawn'), team: 'black', x: 4, y: 3 },
      { typeId: typeId('Queen'), team: 'white', x: 4, y: 6 },
      { typeId: typeId('King'), team: 'white', x: 0, y: 7 },
    ])
    const move = moveOf(state, [4, 6], [4, 3])
    expect(describePuzzle(state, move, 260).difficulty).toBe('easy')
    expect(describePuzzle(state, move, 600).difficulty).toBe('medium')
    expect(describePuzzle(state, move, 900).difficulty).toBe('hard')
  })
})
