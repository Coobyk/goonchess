import { describe, expect, it } from 'vitest'
import { applyMove, cloneState, createInitialState, getLegalMoves, isInCheck, legalMovesForTeam } from './rules'
import { bossFight } from './templates'
import { positionKey } from './repetition'
import { hashPosition } from './ai/hash'
import { searchBestMove } from './ai/search'
import { evaluate } from './ai/evaluate'
import { decodeGame, decodeVariant, encodeGame, encodeVariant } from '../lib/encoding'
import { packVariant, unpackVariant } from '../lib/variantCodec'
import { planMove } from '../lib/moveAnimation'
import { replayMoves, replayStates } from '../lib/replay'
import { fromPgn } from '../lib/pgn'
import { computeThreats } from './threats'
import type { GameState } from './types'

function fixture(placements: [string, string, number, number][]) {
  const variant = bossFight()
  variant.pieceTypes.find((p) => p.name === 'Boss')!.lives = 3
  variant.setup = placements.map(([name, team, x, y]) => ({
    typeId: variant.pieceTypes.find((p) => p.name === name)!.id, team, x, y,
  }))
  return variant
}

function play(game: GameState, x: number, y: number, tx: number, ty: number) {
  const move = getLegalMoves(game, x, y).find((m) => m.finalTo.x === tx && m.finalTo.y === ty)
  expect(move, `${x},${y} -> ${tx},${ty}`).toBeDefined()
  return applyMove(game, move!, { san: true })
}

function arena() {
  return fixture([
    ['King', 'white', 0, 7], ['Boss', 'black', 4, 0],
    ['Rook', 'white', 4, 2], ['Rook', 'white', 0, 0], ['Rook', 'white', 7, 0],
  ])
}

describe('Boss Fight and generic lives', () => {
  it.each([[6, 6], [6, 7]])('escapes the old f3 mating pattern by striking from %s,%s', (x, y) => {
    let game = createInitialState(bossFight())
    for (const [fx, fy, tx, ty] of [[4, 6, 4, 4], [4, 0, 5, 2], [0, 6, 0, 5], [5, 2, 5, 5]]) {
      game = play(game, fx, fy, tx, ty)
    }
    expect(game.winner).toBeNull()
    expect(isInCheck(game, 'white')).toBe(true)
    const bossId = game.board[5][5]!
    const attackerId = game.board[y][x]!
    const hit = play(game, x, y, 5, 5)
    expect(hit.pieces[attackerId]).toBeUndefined()
    expect(hit.pieces[bossId]).toMatchObject({ lives: 4, staggered: true })
    expect(game.pieces[bossId].staggered).toBeUndefined()
    expect(hit.winner).toBeNull()
    expect(isInCheck(hit, 'white')).toBe(false)
    expect(computeThreats(hit, 'white').coverage.size).toBe(0)
    const moves = getLegalMoves(hit, 5, 5)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((m) => !m.capturedId)).toBe(true)
    expect(legalMovesForTeam(hit, 'black')).toEqual(moves)
    const recovered = play(hit, 5, 5, 5, 4)
    expect(recovered.pieces[bossId].staggered).toBeUndefined()
    expect(hit.pieces[bossId].staggered).toBe(true)
    recovered.turn = 'black'
    expect(getLegalMoves(recovered, 5, 4).some((m) => m.capturedId)).toBe(true)
  })

  it('ignores compulsory captures while staggered, including a Predator hunt', () => {
    const variant = fixture([['King', 'white', 0, 7], ['Pawn', 'white', 4, 2], ['Boss', 'black', 4, 0]])
    variant.rules = ['forcedCapture', 'predator']
    const type = variant.pieceTypes.find((p) => p.name === 'Boss')!
    type.flags.predator = true
    type.flags.mustCapture = true
    const game = createInitialState(variant)
    game.turn = 'black'
    game.pieces[game.board[0][4]!].staggered = true
    for (const moves of [getLegalMoves(game, 4, 0), legalMovesForTeam(game, 'black')]) {
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every((m) => !m.capturedId)).toBe(true)
    }
  })

  it('stalemates a staggered boss with no non-capturing destinations', () => {
    const variant = fixture([['King', 'white', 0, 7], ['Pawn', 'white', 1, 6], ['Boss', 'black', 4, 0]])
    variant.board.tiles = variant.board.tiles.map((row, y) => row.map((tile, x) =>
      [[0, 7], [1, 6], [1, 5], [4, 0]].some(([tx, ty]) => tx === x && ty === y) ? tile : { terrain: 'wall' },
    ))
    const game = createInitialState(variant)
    game.pieces[game.board[0][4]!].staggered = true
    const next = play(game, 1, 6, 1, 5)
    expect(next.winner).toBe('draw')
    expect(next.status).toBe('stalemate')
  })

  it('includes stagger independently of lives in identity and cloned state', () => {
    const game = createInitialState(arena())
    const other = cloneState(game)
    const bossId = game.board[0][4]!
    other.pieces[bossId] = { ...other.pieces[bossId], staggered: true }
    const a = { slot: 0, check: 0 }, b = { slot: 0, check: 0 }
    hashPosition(game, a)
    hashPosition(other, b)
    expect(a).not.toEqual(b)
    expect(positionKey(game)).not.toBe(positionKey(other))
    expect(JSON.parse(JSON.stringify(other)).pieces[bossId].staggered).toBe(true)
    other.pieces[bossId].staggered = false
    expect(positionKey(game)).toBe(positionKey(other))
  })

  it.each(['white', 'black'])('awards elimination to the defender when %s sacrifices its last piece', (mover) => {
    const defender = mover === 'white' ? 'black' : 'white'
    const variant = fixture([['Rook', mover, 4, 2], ['Boss', defender, 4, 0]])
    variant.winConditions = [{ id: 'elimination', kind: 'elimination' }]
    const game = createInitialState(variant)
    game.turn = mover
    const next = play(game, 4, 2, 4, 0)
    expect(Object.values(next.pieces)).toHaveLength(1)
    expect(next.pieces[next.board[0][4]!].lives).toBe(2)
    expect(next.status).toBe('eliminated')
    expect(next.winner).toBe(defender)
  })

  it.each([5, 6])('checks defender points after a sacrifice against a target of %s', (threshold) => {
    const variant = fixture([['King', 'white', 0, 7], ['Rook', 'white', 4, 2], ['Boss', 'black', 4, 0]])
    variant.winConditions = [{ id: 'points', kind: 'points', threshold }]
    const next = play(createInitialState(variant), 4, 2, 4, 0)
    expect(next.scores.black).toBe(5)
    expect(next.scores.white).toBe(0)
    expect(next.winner).toBe(threshold === 5 ? 'black' : null)
    expect(next.status).toBe(threshold === 5 ? 'points' : 'active')
  })

  it('starts with the full white army and one non-royal five-life amazon', () => {
    const variant = bossFight()
    expect(variant.setup.filter((p) => p.team === 'white')).toHaveLength(16)
    expect(variant.setup.filter((p) => p.team === 'black')).toHaveLength(1)
    const boss = variant.pieceTypes.find((p) => p.name === 'Boss')!
    expect(boss.lives).toBe(5)
    expect(boss.flags.royal).toBe(false)
  })

  it('sacrifices attackers on the first two hits and wins on the final capture', () => {
    const initial = createInitialState(arena())
    const bossId = initial.board[0][4]!
    const attacker = initial.board[2][4]!
    const first = play(initial, 4, 2, 4, 0)
    expect(first.board[0][4]).toBe(bossId)
    expect(first.board[2][4]).toBeNull()
    expect(first.pieces[attacker]).toBeUndefined()
    expect(first.pieces[bossId].lives).toBe(2)
    expect(initial.pieces[bossId].lives).toBe(3)
    expect(first.winner).toBeNull()
    const anim = planMove(initial, first)!
    expect(anim.dissolves.some((d) => d.key === 'captured')).toBe(false)
    expect(anim.dissolves.some((d) => d.key === 'striker')).toBe(true)
    first.turn = 'white'
    const second = play(first, 0, 0, 4, 0)
    expect(second.pieces[bossId].lives).toBe(1)
    second.turn = 'white'
    const finalAttacker = second.board[0][7]!
    const final = play(second, 7, 0, 4, 0)
    expect(final.pieces[bossId]).toBeUndefined()
    expect(final.board[0][4]).toBe(finalAttacker)
    expect(final.winner).toBe('white')
    expect(final.status).toBe('eliminated')
  })

  it('moves as a queen and a jumping knight, but cannot slide through blockers', () => {
    const variant = fixture([
      ['King', 'white', 7, 7], ['Boss', 'black', 3, 3], ['Pawn', 'black', 3, 2],
    ])
    const game = createInitialState(variant)
    game.turn = 'black'
    const squares = getLegalMoves(game, 3, 3).map((m) => `${m.finalTo.x},${m.finalTo.y}`)
    expect(squares).toEqual(expect.arrayContaining(['0,3', '6,6', '4,1', '5,2']))
    expect(squares).not.toContain('3,1')
    expect(isInCheck(game, 'black')).toBe(false)
  })

  it.each(['standard', 'crazyhouse', 'atomic'] as const)('keeps the royal on its square when parrying with %s rules', (rule) => {
    const variant = fixture([['King', 'white', 4, 1], ['Boss', 'black', 4, 0]])
    variant.rules = rule === 'standard' ? [] : [rule]
    const game = createInitialState(variant)
    const kingId = game.board[1][4]!
    const bossId = game.board[0][4]!
    expect(isInCheck(game, 'white')).toBe(true)
    const next = play(game, 4, 1, 4, 0)
    expect(next.board[1][4]).toBe(kingId)
    expect(next.board[0][4]).toBe(bossId)
    expect(next.pieces[kingId]).toMatchObject({ hasMoved: true })
    expect(next.pieces[bossId]).toMatchObject({ lives: 2, staggered: true })
    expect(isInCheck(next, 'white')).toBe(false)
    expect(next.winner).toBeNull()
    expect(next.captured).toEqual([])
    expect(next.scores).toEqual(game.scores)
    expect(next.hands).toEqual(game.hands)
    expect(game.pieces[kingId].hasMoved).toBe(false)
    const animation = planMove(game, next)!
    expect(animation.flights).toHaveLength(1)
    expect(animation.flights[0]).toMatchObject({ kind: 'parry', pieceId: kingId, from: { x: 4, y: 1 }, to: { x: 4, y: 0 } })
    expect(animation.dissolves).toEqual([])
  })

  it('captures the final life normally with the king', () => {
    const game = createInitialState(fixture([['King', 'white', 4, 1], ['Boss', 'black', 4, 0]]))
    const kingId = game.board[1][4]!
    const bossId = game.board[0][4]!
    game.pieces[bossId].lives = 1
    const next = play(game, 4, 1, 4, 0)
    expect(next.board[1][4]).toBeNull()
    expect(next.board[0][4]).toBe(kingId)
    expect(next.pieces[bossId]).toBeUndefined()
    expect(next.winner).toBe('white')
    expect(planMove(game, next)!.flights[0].kind).toBe('slide')
  })

  it('does not allow a parry that leaves another attacker checking the king', () => {
    const game = createInitialState(fixture([['King', 'white', 4, 1], ['Boss', 'black', 4, 0], ['Rook', 'black', 4, 7]]))
    for (const moves of [getLegalMoves(game, 4, 1), legalMovesForTeam(game, 'white')]) {
      expect(moves.some((m) => m.capturedId === game.board[0][4])).toBe(false)
    }
  })

  it('parries f1 after the previous self-play mating pattern and survives replay', () => {
    let game = createInitialState(bossFight())
    for (const [x, y, tx, ty] of [
      [1, 7, 2, 5], [4, 0, 2, 0], [5, 6, 5, 5], [2, 0, 7, 5],
      [2, 5, 4, 4], [7, 5, 6, 6], [5, 7, 6, 6], [6, 6, 5, 7],
    ]) game = play(game, x, y, tx, ty)
    expect(game.winner).toBeNull()
    expect(isInCheck(game, 'white')).toBe(true)
    const kingId = game.board[7][4]!
    const bossId = game.board[7][5]!
    const next = play(game, 4, 7, 5, 7)
    expect(next.board[7][4]).toBe(kingId)
    expect(next.board[7][5]).toBe(bossId)
    expect(next.pieces[bossId]).toMatchObject({ lives: 3, staggered: true })
    expect(next.winner).toBeNull()
    expect(isInCheck(next, 'white')).toBe(false)
    const replayed = fromPgn(decodeGame(encodeGame(next)), decodeVariant(encodeVariant(next.variant)))!
    expect(positionKey(replayed.game)).toBe(positionKey(next))
    const states = replayStates(next)
    expect(states.at(-1)!.pieces[bossId].staggered).toBe(true)
    expect(states.at(-2)!.pieces[bossId].staggered).toBeUndefined()
  })

  it.each([1, 2])('only forces a royal capture against a pawn with %s remaining lives', (lives) => {
    const variant = fixture([['King', 'white', 4, 3], ['Pawn', 'black', 3, 1], ['King', 'black', 7, 0]])
    variant.rules = ['forcedCapture']
    variant.pieceTypes.find((p) => p.name === 'Pawn')!.lives = lives
    const game = createInitialState(variant)
    game.turn = 'black'
    const next = play(game, 3, 1, 3, 2)
    expect(isInCheck(next, 'white')).toBe(true)
    expect(next.winner).toBeNull()
    expect(next.status).toBe('active')
    for (const moves of [getLegalMoves(next, 4, 3), legalMovesForTeam(next, 'white')]) {
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every((m) => !!m.capturedId)).toBe(true)
    }
  })

  it('swaps without damaging either piece', () => {
    const variant = arena()
    variant.pieceTypes.find((p) => p.name === 'Rook')!.effects = [{ kind: 'swap' }]
    const game = createInitialState(variant)
    const boss = game.board[0][4]!
    const rook = game.board[2][4]!
    const next = play(game, 4, 2, 4, 0)
    expect(next.board[2][4]).toBe(boss)
    expect(next.board[0][4]).toBe(rook)
    expect(next.pieces[boss].lives).toBe(3)
    expect(next.captured).toHaveLength(0)
  })

  it('draws when a surviving boss has no move', () => {
    const variant = fixture([['King', 'white', 0, 7], ['Pawn', 'white', 1, 6], ['Boss', 'black', 4, 0]])
    variant.pieceTypes.find((p) => p.name === 'Boss')!.flags.movesOnce = true
    const game = createInitialState(variant)
    game.pieces[game.board[0][4]!].hasMoved = true
    const next = play(game, 1, 6, 1, 5)
    expect(next.winner).toBe('draw')
    expect(next.status).toBe('stalemate')
  })

  it('rebuilds damaged lives for shared games and restores them on undo replay', () => {
    const variant = bossFight()
    let game = createInitialState(variant)
    for (const [x, y, tx, ty] of [[4, 6, 4, 4], [4, 0, 5, 2], [0, 6, 0, 5], [5, 2, 5, 3], [4, 4, 5, 3]]) {
      game = play(game, x, y, tx, ty)
    }
    const lives = (state: GameState) => Object.values(state.pieces).find((p) => state.pieceTypes[p.typeId].name === 'Boss')!.lives
    expect(lives(game)).toBe(4)
    expect(lives(replayMoves(variant, game.moveHistory))).toBe(4)
    expect(lives(replayMoves(variant, game.moveHistory.slice(0, -1)))).toBe(5)
    const states = replayStates(game)
    expect(lives(states.at(-2)!)).toBe(5)
    expect(lives(states.at(-1)!)).toBe(4)
    expect(states.at(-1)!.pieces[game.board[3][5]!].staggered).toBe(true)
    const sharedVariant = decodeVariant(encodeVariant(variant))
    const shared = fromPgn(decodeGame(encodeGame(game)), sharedVariant)
    expect(shared).not.toBeNull()
    expect(lives(shared!.game)).toBe(4)
    expect(Object.values(shared!.game.pieces).find((p) => p.staggered)?.lives).toBe(4)
  })

  it('lets Black capture the white king and win', () => {
    const game = createInitialState(fixture([['King', 'white', 4, 7], ['Boss', 'black', 4, 0]]))
    game.turn = 'black'
    expect(play(game, 4, 0, 4, 7).winner).toBe('black')
  })

  it('resolves white checkmate and stalemate normally', () => {
    const mate = createInitialState(fixture([['King', 'white', 0, 7], ['Boss', 'black', 3, 5]]))
    mate.turn = 'black'
    const won = play(mate, 3, 5, 1, 5)
    expect(won.status).toBe('checkmate')
    expect(won.winner).toBe('black')
    const draw = createInitialState(fixture([['King', 'white', 0, 7], ['Boss', 'black', 3, 5]]))
    draw.turn = 'black'
    const drawn = play(draw, 3, 5, 3, 6)
    expect(drawn.status).toBe('stalemate')
    expect(drawn.winner).toBe('draw')
  })

  it.each(['atomic', 'explosion'] as const)('%s hits cost one life and pocket only true removals', (kind) => {
    const variant = fixture([
      ['King', 'white', 0, 7], ['Boss', 'black', 4, 0],
      ['Rook', 'white', 4, 3], ['Pawn', 'black', 4, 1],
    ])
    variant.rules = ['crazyhouse', ...(kind === 'atomic' ? ['atomic' as const] : [])]
    if (kind === 'explosion') variant.pieceTypes.find((p) => p.name === 'Rook')!.effects = [{ kind: 'explosion', radius: 1 }]
    const game = createInitialState(variant)
    const bossId = game.board[0][4]!
    const next = play(game, 4, 3, 4, 1)
    expect(next.pieces[bossId].lives).toBe(2)
    expect(next.hands!.white[game.pieces[bossId].typeId] ?? 0).toBe(0)
    expect(next.captured.some((p) => p.typeId === game.pieces[bossId].typeId)).toBe(false)
    game.pieces[bossId].lives = 1
    const last = play(game, 4, 3, 4, 1)
    expect(last.pieces[bossId]).toBeUndefined()
    expect(last.hands!.white[game.pieces[bossId].typeId]).toBe(1)
  })

  it('does not pocket the boss before the last direct hit, including atomic captures', () => {
    const variant = arena()
    variant.rules = ['crazyhouse', 'atomic']
    const game = createInitialState(variant)
    const bossId = game.board[0][4]!
    const next = play(game, 4, 2, 4, 0)
    expect(next.pieces[bossId].lives).toBe(2)
    expect(next.hands!.white[game.pieces[bossId].typeId] ?? 0).toBe(0)
    expect(Object.values(next.hands!.black)).toEqual([1])
  })

  it('initializes lives for promotions, spawns, and pocket drops', () => {
    const variant = fixture([['King', 'white', 0, 7], ['Pawn', 'white', 6, 1], ['Boss', 'black', 4, 0]])
    const boss = variant.pieceTypes.find((p) => p.name === 'Boss')!
    const pawn = variant.pieceTypes.find((p) => p.name === 'Pawn')!
    pawn.promotion = { typeIds: [boss.id] }
    pawn.effects = [{ kind: 'spawn', pieceTypeId: boss.id, offset: { x: 1, y: 0 } }]
    const next = play(createInitialState(variant), 6, 1, 6, 0)
    expect(next.pieces[next.board[0][6]!].lives).toBe(3)
    expect(next.pieces[next.board[1][7]!].lives).toBe(3)
    variant.rules = ['crazyhouse']
    const game = createInitialState(variant)
    game.hands!.white[boss.id] = 1
    const drop = legalMovesForTeam(game, 'white').find((m) => m.drop?.typeId === boss.id)!
    const dropped = applyMove(game, drop)
    expect(dropped.pieces[drop.pieceId].lives).toBe(3)
  })

  it('distinguishes lives in bot and repetition identity, preserving cloned state', () => {
    const game = createInitialState(arena())
    const other = cloneState(game)
    const boss = game.board[0][4]!
    other.pieces[boss] = { ...other.pieces[boss], lives: 2 }
    const a = { slot: 0, check: 0 }, b = { slot: 0, check: 0 }
    hashPosition(game, a)
    hashPosition(other, b)
    expect(a).not.toEqual(b)
    expect(positionKey(game)).not.toBe(positionKey(other))
    expect(evaluate(game, 'black', { fast: true })).toBeGreaterThan(evaluate(other, 'black', { fast: true }) + 800)
    expect(game.pieces[boss].lives).toBe(3)
    expect(JSON.parse(JSON.stringify(other)).pieces[boss].lives).toBe(2)
  })

  it('round trips lives and the assembled presentation through a share link', () => {
    const variant = decodeVariant(encodeVariant(bossFight()))
    const boss = variant.pieceTypes.find((p) => p.name === 'Boss')!
    expect(boss.lives).toBe(5)
    expect(boss.presentation).toBe('boss')
    expect(createInitialState(variant).pieces[createInitialState(variant).board[0][4]!].lives).toBe(5)
  })

  it('defaults old links to one life and discards external image paths', () => {
    const variant = bossFight()
    variant.pieceTypes[0].images = ['https://example.com/a.svg', '//example.com/a.svg']
    const packed = packVariant(variant)
    expect(unpackVariant(packed).pieceTypes[0].images).toEqual([])
    const old = packed as unknown[]
    old[5] = (old[5] as unknown[][]).map((p) => p.slice(0, 10))
    const decoded = unpackVariant(old)
    expect(decoded.pieceTypes.every((p) => p.lives === 1)).toBe(true)
  })

  it('lets the bot play either side and recognizes the final blow as a win', () => {
    const game = createInitialState(arena())
    game.pieces[game.board[0][4]!].lives = 1
    const result = searchBestMove(game, { team: 'white', level: 'normal', analyze: true, timeBudgetMs: 150, seed: 1 })
    expect(result.move?.capturedId).toBe(game.board[0][4])
    expect(result.score).toBeGreaterThan(500_000)
    const start = createInitialState(bossFight())
    const white = searchBestMove(start, { team: 'white', level: 'casual', timeBudgetMs: 50, seed: 1 })
    expect(white.move).not.toBeNull()
    const blackTurn = applyMove(start, white.move!)
    const black = searchBestMove(blackTurn, { team: 'black', level: 'casual', timeBudgetMs: 50, seed: 1 })
    expect(black.move).not.toBeNull()
    expect(() => applyMove(blackTurn, black.move!)).not.toThrow()
  })
})
