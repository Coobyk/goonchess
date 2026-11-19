import { describe, expect, it } from 'vitest'
import { applyMove, cloneState, createInitialState, getLegalMoves, hasAnyLegalMove, isInCheck, legalMovesForTeam, legalOptionsForTeam, staggerPass } from './rules'
import { bossFight } from './templates'
import { positionKey } from './repetition'
import { hashPosition } from './ai/hash'
import { searchBestMove } from './ai/search'
import { evaluate } from './ai/evaluate'
import { decodeGame, decodeVariant, encodeGame, encodeVariant } from '../lib/encoding'
import { packVariant, unpackVariant } from '../lib/variantCodec'
import { planMove } from '../lib/moveAnimation'
import { replayMoves, replayStates, requestFor, resolveMove } from '../lib/replay'
import { fromPgn } from '../lib/pgn'
import { replayRequests } from '../lib/archive'
import { computeThreats } from './threats'
import { PASS_SQUARE, type GameState } from './types'

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
  it.each([[6, 6], [6, 7]])('escapes a checking Centaur on f3 by striking from %s,%s', (x, y) => {
    const game = createInitialState(fixture([
      ['King', 'white', 4, 7], ['Boss', 'black', 5, 5],
      ['Pawn', 'white', 6, 6], ['Knight', 'white', 6, 7], ['Pawn', 'white', 5, 3],
    ]))
    expect(game.winner).toBeNull()
    expect(isInCheck(game, 'white')).toBe(true)
    const bossId = game.board[5][5]!
    const attackerId = game.board[y][x]!
    const hit = play(game, x, y, 5, 5)
    expect(hit.pieces[attackerId]).toBeUndefined()
    expect(hit.pieces[bossId]).toMatchObject({ lives: 2, staggered: true })
    expect(game.pieces[bossId].staggered).toBeUndefined()
    expect(hit.winner).toBeNull()
    expect(isInCheck(hit, 'white')).toBe(false)
    expect(computeThreats(hit, 'white').coverage.size).toBe(0)
    const moves = getLegalMoves(hit, 5, 5)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((m) => !m.capturedId)).toBe(true)
    expect(legalMovesForTeam(hit, 'black')).toEqual(moves)
    const recovered = play(hit, 5, 5, 5, 4)
    expect(recovered.pieces[bossId]).toMatchObject({ staggered: true, staggerRecovered: true })
    expect(isInCheck(recovered, 'white')).toBe(false)
    expect(computeThreats(recovered, 'white').coverage.size).toBe(0)
    expect(hit.pieces[bossId].staggered).toBe(true)
    const ready = play(recovered, 4, 7, 3, 7)
    expect(ready.pieces[bossId].staggered).toBeUndefined()
    expect(ready.pieces[bossId].staggerRecovered).toBeUndefined()
    expect(recovered.pieces[bossId].staggered).toBe(true)
    expect(getLegalMoves(ready, 5, 4).some((m) => m.capturedId)).toBe(true)
  })

  it('ignores compulsory captures while staggered, including a Predator hunt', () => {
    const variant = fixture([['King', 'white', 0, 7], ['Pawn', 'white', 4, 1], ['Boss', 'black', 4, 0]])
    variant.rules = ['forcedCapture', 'predator']
    const type = variant.pieceTypes.find((p) => p.name === 'Boss')!
    type.flags.predator = true
    type.flags.mustCapture = true
    const game = createInitialState(variant)
    game.turn = 'black'
    expect(getLegalMoves(game, 4, 0).some((m) => m.capturedId)).toBe(true)
    game.pieces[game.board[0][4]!].staggered = true
    expect(staggerPass(game)).toBeUndefined()
    for (const moves of [getLegalMoves(game, 4, 0), legalMovesForTeam(game, 'black')]) {
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every((m) => !m.capturedId)).toBe(true)
    }
  })

  it('preserves stalemate when removing stagger would not restore a legal move', () => {
    const variant = fixture([['King', 'white', 0, 7], ['Pawn', 'white', 1, 6], ['Boss', 'black', 4, 0]])
    variant.board.tiles = variant.board.tiles.map((row, y) => row.map((tile, x) =>
      [[0, 7], [1, 6], [1, 5], [4, 0]].some(([tx, ty]) => tx === x && ty === y) ? tile : { terrain: 'wall' },
    ))
    const game = createInitialState(variant)
    game.pieces[game.board[0][4]!].staggered = true
    const next = play(game, 1, 6, 1, 5)
    expect(next.winner).toBe('draw')
    expect(next.status).toBe('stalemate')
    expect(staggerPass(next)).toBeUndefined()
  })

  it('records a forced recovery pass, preserving undo, replay, sharing and position identity', () => {
    const variant = fixture([['King', 'white', 4, 1], ['Pawn', 'white', 0, 6], ['Boss', 'black', 4, 0]])
    variant.board.tiles = variant.board.tiles.map((row, y) => row.map((tile, x) =>
      [[4, 0], [4, 1], [4, 2], [0, 6], [0, 5]].some(([tx, ty]) => tx === x && ty === y) ? tile : { terrain: 'wall' },
    ))
    const opening = createInitialState(variant)
    const bossId = opening.board[0][4]!
    const hit = play(opening, 4, 1, 4, 0)
    expect(hit.winner).toBeNull()
    expect(getLegalMoves(hit, 4, 0)).toEqual([])
    expect(hasAnyLegalMove(hit, 'black')).toBe(true)
    const pass = staggerPass(hit)!
    expect(pass).toMatchObject({ pass: true, from: PASS_SQUARE, to: PASS_SQUARE, finalTo: PASS_SQUARE })
    expect(legalMovesForTeam(hit, 'black')).toEqual([pass])
    const passed = applyMove(hit, pass, { san: true })
    expect(legalOptionsForTeam(hit, 'black')[0].next).toEqual(applyMove(hit, pass, { compute: false }))
    expect(passed.turn).toBe('white')
    expect(passed.winner).toBeNull()
    expect(passed.board).toEqual(hit.board)
    expect(passed.scores).toEqual(hit.scores)
    expect(passed.captured).toEqual(hit.captured)
    expect(passed.pieces[bossId]).toMatchObject({ lives: 2, staggered: true, staggerRecovered: true })
    expect(hit.pieces[bossId].staggerRecovered).toBeUndefined()
    expect(isInCheck(passed, 'white')).toBe(false)
    expect(passed.moveHistory.at(-1)).toMatchObject({ team: 'black', notation: 'pass', san: 'pass', positionKey: positionKey(passed), repeats: 1 })
    const beforeHash = { slot: 0, check: 0 }, afterHash = { slot: 0, check: 0 }
    hashPosition(hit, beforeHash)
    hashPosition(passed, afterHash)
    expect(afterHash).not.toEqual(beforeHash)
    expect(positionKey(passed)).not.toBe(positionKey(hit))
    expect(staggerPass(passed)).toBeUndefined()
    expect(resolveMove(opening, requestFor(passed.moveHistory.at(-1)!))).toEqual({ error: 'illegal_move' })
    expect(resolveMove(hit, requestFor(passed.moveHistory.at(-1)!))).toEqual({ move: { ...pass, promotionTypeId: undefined } })
    expect(resolveMove(hit, { ...requestFor(passed.moveHistory.at(-1)!), to: { x: 0, y: 0 } })).toEqual({ error: 'illegal_move' })
    const bot = searchBestMove(hit, { team: 'black', level: 'casual', timeBudgetMs: 100, seed: 1 })
    expect(bot.move).toEqual(pass)
    expect(applyMove(hit, bot.move!).turn).toBe('white')

    const replied = play(passed, 4, 1, 4, 2)
    expect(replied.pieces[bossId].staggered).toBeUndefined()
    expect(replied.pieces[bossId].staggerRecovered).toBeUndefined()
    expect(isInCheck(play(replied, 4, 0, 4, 1), 'white')).toBe(true)
    const states = replayStates(replied)
    expect(positionKey(states[1])).toBe(positionKey(hit))
    expect(positionKey(states[2])).toBe(positionKey(passed))
    expect(positionKey(states[3])).toBe(positionKey(replied))
    expect(positionKey(replayMoves(variant, replied.moveHistory.slice(0, -2)))).toBe(positionKey(hit))
    expect(replayRequests(variant, replied.moveHistory.map(requestFor))!.map(positionKey)).toEqual(states.map(positionKey))
    const shared = fromPgn(decodeGame(encodeGame(replied)), decodeVariant(encodeVariant(variant)))!
    expect(shared.game.moveHistory[1].move.pass).toBe(true)
    expect(positionKey(shared.game)).toBe(positionKey(replied))
    expect(shared.states.map(positionKey)).toEqual(states.map(positionKey))
  })

  it('expires the opponent\'s recovered stagger on a pass without clearing fresh wounds', () => {
    const variant = fixture([
      ['King', 'white', 4, 1], ['Pawn', 'white', 0, 6], ['Pawn', 'white', 1, 6], ['Boss', 'black', 4, 0],
    ])
    variant.board.tiles = variant.board.tiles.map((row, y) => row.map((tile, x) =>
      [[4, 0], [4, 1], [0, 6], [1, 6]].some(([tx, ty]) => tx === x && ty === y) ? tile : { terrain: 'wall' },
    ))
    const hit = play(createInitialState(variant), 4, 1, 4, 0)
    const recovered = hit.board[6][0]!, fresh = hit.board[6][1]!
    hit.pieces[recovered] = { ...hit.pieces[recovered], staggered: true, staggerRecovered: true }
    hit.pieces[fresh] = { ...hit.pieces[fresh], staggered: true }
    const next = applyMove(hit, staggerPass(hit)!)
    expect(next.pieces[recovered].staggered).toBeUndefined()
    expect(next.pieces[fresh].staggered).toBe(true)
    expect(hit.pieces[recovered].staggered).toBe(true)
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
    other.pieces[bossId].staggerRecovered = true
    const recovered = { slot: 0, check: 0 }
    hashPosition(other, recovered)
    expect(recovered).not.toEqual(b)
    const fresh = cloneState(other)
    fresh.pieces[bossId] = { ...fresh.pieces[bossId], staggerRecovered: false }
    expect(positionKey(fresh)).not.toBe(positionKey(other))
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

  it('starts with the full white army and one non-royal five-life Centaur', () => {
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

  it('takes one king step or jumps as a knight, never sliding or landing on allies', () => {
    const variant = fixture([
      ['King', 'white', 7, 7], ['Boss', 'black', 3, 3], ['Pawn', 'black', 3, 2],
    ])
    const game = createInitialState(variant)
    game.turn = 'black'
    const squares = getLegalMoves(game, 3, 3).map((m) => `${m.finalTo.x},${m.finalTo.y}`)
    expect(squares).toHaveLength(15)
    expect(squares).toEqual(expect.arrayContaining(['2,2', '4,3', '4,4', '4,1', '5,2']))
    expect(squares).not.toEqual(expect.arrayContaining(['0,3', '6,6', '3,1']))
    expect(squares).not.toContain('3,2')
    expect(squares.every((square) => {
      const [x, y] = square.split(',').map(Number)
      const dx = Math.abs(x - 3), dy = Math.abs(y - 3)
      return Math.max(dx, dy) === 1 || dx * dy === 2
    })).toBe(true)
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

  it('keeps the parrying king on e1 in the reported c2 line and silences the recovery', () => {
    let game = createInitialState(bossFight())
    for (const [x, y, tx, ty] of [
      [1, 7, 2, 5], [4, 0, 3, 2], [2, 5, 0, 4], [3, 2, 4, 3],
      [0, 4, 2, 3], [4, 3, 3, 4], [2, 3, 1, 1], [3, 4, 2, 6],
      [3, 7, 2, 6], [2, 6, 3, 7],
    ]) game = play(game, x, y, tx, ty)
    expect(game.winner).toBeNull()
    expect(isInCheck(game, 'white')).toBe(false)
    const kingId = game.board[7][4]!
    const bossId = game.board[7][3]!
    const next = play(game, 4, 7, 3, 7)
    expect(next.board[7][4]).toBe(kingId)
    expect(next.board[7][3]).toBe(bossId)
    expect(next.pieces[bossId]).toMatchObject({ lives: 3, staggered: true })
    expect(next.pieces[bossId].staggerRecovered).toBeUndefined()
    expect(next.winner).toBeNull()
    expect(isInCheck(next, 'white')).toBe(false)
    const replayed = fromPgn(decodeGame(encodeGame(next)), decodeVariant(encodeVariant(next.variant)))!
    expect(positionKey(replayed.game)).toBe(positionKey(next))
    const states = replayStates(next)
    expect(states.at(-1)!.pieces[bossId].staggered).toBe(true)
    expect(states.at(-2)!.pieces[bossId].staggerRecovered).toBe(true)
    const recovery = play(next, 3, 7, 2, 6)
    expect(recovery.board[7][4]).toBe(kingId)
    expect(recovery.pieces[bossId]).toMatchObject({ staggered: true, staggerRecovered: true })
    expect(isInCheck(recovery, 'white')).toBe(false)
    expect(recovery.status).not.toBe('checkmate')
    expect(recovery.winner).toBeNull()
    expect(recovery.winner).not.toBe('black')
    expect(getLegalMoves(recovery, 4, 7).some((m) => m.to.x === 2 && m.to.y === 6)).toBe(false)
    expect(hasAnyLegalMove(recovery, 'white')).toBe(true)
    const quiet = getLegalMoves(recovery, 0, 6).find((m) => m.to.x === 0 && m.to.y === 5)!
    expect(quiet).toBeDefined()
    const option = legalOptionsForTeam(recovery, 'white', { search: true }).find((o) => o.move.pieceId === quiet.pieceId && o.move.to.y === 5)!
    const continued = applyMove(recovery, quiet, { san: true })
    expect(continued.winner).toBeNull()
    expect(continued.pieces[bossId]).toMatchObject({ staggered: true, staggerRecovered: true })
    expect(isInCheck(continued, 'white')).toBe(false)
    expect(positionKey(option.next)).toBe(positionKey(continued))
    const awake = cloneState(continued)
    awake.pieces[bossId] = { ...awake.pieces[bossId] }
    delete awake.pieces[bossId].staggered
    delete awake.pieces[bossId].staggerRecovered
    expect(isInCheck(awake, 'white')).toBe(true)
    expect(positionKey(awake)).not.toBe(positionKey(continued))
    const awakeHash = { slot: 0, check: 0 }, continuedHash = { slot: 0, check: 0 }
    hashPosition(awake, awakeHash)
    hashPosition(continued, continuedHash)
    expect(awakeHash).not.toEqual(continuedHash)
    expect(positionKey(replayStates(continued).at(-1)!)).toBe(positionKey(continued))
    expect(positionKey(replayStates(continued).at(-2)!)).toBe(positionKey(recovery))
    const shared = fromPgn(decodeGame(encodeGame(continued)), decodeVariant(encodeVariant(continued.variant)))!
    expect(positionKey(shared.game)).toBe(positionKey(continued))
    const bot = searchBestMove(recovery, { team: 'white', level: 'casual', timeBudgetMs: 100, seed: 29 })
    expect(bot.move).toBeDefined()
    expect(applyMove(recovery, bot.move!).winner).toBeNull()
    const away = play(continued, 2, 6, 3, 4)
    const ready = play(away, 0, 5, 0, 4)
    expect(ready.pieces[bossId].staggered).toBeUndefined()
    expect(ready.pieces[bossId].staggerRecovered).toBeUndefined()
  })

  it('does not defer recovered stagger when a normal check escape is available', () => {
    const game = createInitialState(fixture([['King', 'white', 4, 7], ['Pawn', 'white', 0, 6], ['Boss', 'black', 5, 5]]))
    const bossId = game.board[5][5]!
    game.pieces[bossId] = { ...game.pieces[bossId], staggered: true, staggerRecovered: true }
    expect(getLegalMoves(game, 0, 6)).toEqual([])
    const safe = play(game, 4, 7, 3, 7)
    expect(safe.pieces[bossId].staggered).toBeUndefined()
    expect(isInCheck(safe, 'white')).toBe(false)
  })

  it('allows Kxc2 when the king really is on d1, resetting an already recovered stagger', () => {
    const game = createInitialState(fixture([['King', 'white', 3, 7], ['Boss', 'black', 2, 6]]))
    const kingId = game.board[7][3]!, bossId = game.board[6][2]!
    game.pieces[bossId].staggered = true
    game.pieces[bossId].staggerRecovered = true
    const next = play(game, 3, 7, 2, 6)
    expect(next.board[7][3]).toBe(kingId)
    expect(next.board[6][2]).toBe(bossId)
    expect(next.pieces[bossId]).toMatchObject({ lives: 2, staggered: true })
    expect(next.pieces[bossId].staggerRecovered).toBeUndefined()
    expect(next.winner).toBeNull()
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
    expect(staggerPass({ ...next, winner: null })).toBeUndefined()
    expect(getLegalMoves({ ...next, winner: null }, PASS_SQUARE.x, PASS_SQUARE.y)).toEqual([])
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
    const recovered = play(game, 5, 3, 4, 3)
    const recoveredReplay = fromPgn(decodeGame(encodeGame(recovered)), sharedVariant)!
    expect(positionKey(recoveredReplay.game)).toBe(positionKey(recovered))
    expect(recoveredReplay.game.pieces[recoveredReplay.game.board[3][4]!].staggerRecovered).toBe(true)
    const ready = play(recovered, 0, 5, 0, 4)
    expect(ready.pieces[recovered.board[3][4]!].staggered).toBeUndefined()
    expect(replayStates(ready).at(-2)!.pieces[recovered.board[3][4]!].staggerRecovered).toBe(true)
  })

  it('lets Black capture the white king and win', () => {
    const game = createInitialState(fixture([['King', 'white', 4, 7], ['Boss', 'black', 5, 5]]))
    game.turn = 'black'
    expect(play(game, 5, 5, 4, 7).winner).toBe('black')
  })

  it('resolves white checkmate and stalemate normally', () => {
    const mate = createInitialState(fixture([['King', 'white', 0, 7], ['Pawn', 'white', 1, 7], ['Boss', 'black', 2, 4]]))
    mate.turn = 'black'
    const won = play(mate, 2, 4, 1, 5)
    expect(won.status).toBe('checkmate')
    expect(won.winner).toBe('black')
    const draw = createInitialState(fixture([['King', 'white', 0, 7], ['Boss', 'black', 2, 4]]))
    draw.turn = 'black'
    const drawn = play(draw, 2, 4, 2, 5)
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
