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
import type { GameState } from './types'

function fixture(placements: [string, string, number, number][]) {
  const variant = bossFight()
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
  it('starts with the full white army and one non-royal three-life amazon', () => {
    const variant = bossFight()
    expect(variant.setup.filter((p) => p.team === 'white')).toHaveLength(16)
    expect(variant.setup.filter((p) => p.team === 'black')).toHaveLength(1)
    const boss = variant.pieceTypes.find((p) => p.name === 'Boss')!
    expect(boss.lives).toBe(3)
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

  it('does not let a royal sacrifice itself against a surviving boss', () => {
    const game = createInitialState(fixture([['King', 'white', 4, 1], ['Boss', 'black', 4, 0]]))
    expect(getLegalMoves(game, 4, 1).some((m) => m.capturedId)).toBe(false)
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
    expect(lives(game)).toBe(2)
    expect(lives(replayMoves(variant, game.moveHistory))).toBe(2)
    expect(lives(replayMoves(variant, game.moveHistory.slice(0, -1)))).toBe(3)
    const states = replayStates(game)
    expect(lives(states.at(-2)!)).toBe(3)
    expect(lives(states.at(-1)!)).toBe(2)
    const sharedVariant = decodeVariant(encodeVariant(variant))
    const shared = fromPgn(decodeGame(encodeGame(game)), sharedVariant)
    expect(shared).not.toBeNull()
    expect(lives(shared!.game)).toBe(2)
  })

  it('lets Black capture the white king and win', () => {
    const game = createInitialState(fixture([['King', 'white', 4, 7], ['Boss', 'black', 4, 0]]))
    game.turn = 'black'
    expect(play(game, 4, 0, 4, 7).winner).toBe('black')
  })

  it('resolves white checkmate and stalemate normally', () => {
    const mate = createInitialState(fixture([['King', 'white', 0, 7], ['Boss', 'black', 3, 5]]))
    mate.turn = 'black'
    const won = play(mate, 3, 5, 1, 6)
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

  it('round trips lives and app-relative art through a share link', () => {
    const variant = decodeVariant(encodeVariant(bossFight()))
    const boss = variant.pieceTypes.find((p) => p.name === 'Boss')!
    expect(boss.lives).toBe(3)
    expect(boss.images).toEqual(['/pieces/boss/boss.svg', '/pieces/boss/boss.svg'])
    expect(createInitialState(variant).pieces[createInitialState(variant).board[0][4]!].lives).toBe(3)
  })

  it('defaults old links to one life and discards external image paths', () => {
    const variant = bossFight()
    variant.pieceTypes[0].images = ['https://example.com/a.svg', '//example.com/a.svg']
    const packed = packVariant(variant)
    expect(unpackVariant(packed).pieceTypes[0].images).toEqual(['', ''])
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
