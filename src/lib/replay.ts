import {
  applyMove,
  createInitialState,
  dropOptions,
  getLegalMoves,
  rollRandomPieces,
  type ApplyOptions,
} from '@/engine/rules'
import { countPosition, positionKey } from '@/engine/repetition'
import { DICE_SIDES, intentMatches, type GameState, type Move, type MoveRecord, type Variant, type Vec } from '@/engine/types'

// A random piece is rolled anew after every move, the same way it was when
// the game was played. The piece that has just moved keeps its kind.
function step(state: GameState, record: MoveRecord, options: ApplyOptions): GameState {
  return rollRandomPieces(applyMove(state, record.move, options), record.move.pieceId)
}

/**
 * Rebuilds a game from its start, so it can be replayed or exported.
 *
 * The piece ids are derived from where the pieces stand, so replaying the
 * recorded moves lands on exactly the same positions.
 */
export function replayStates(game: GameState): GameState[] {
  const states = [createInitialState(game.variant)]
  for (const record of game.moveHistory) {
    states.push(step(states[states.length - 1], record, { compute: false }))
  }
  return states
}

/**
 * The position a list of moves ends in. The room's undo relies on it: take
 * every move back by playing all but the last one again.
 */
export function replayMoves(
  variant: Variant,
  records: MoveRecord[],
  options: (record: MoveRecord) => ApplyOptions = () => ({}),
): GameState {
  let state = createInitialState(variant)
  for (const record of records) state = step(state, record, options(record))
  return state
}

export function undoPly(records: MoveRecord[], target = records.length - 1): number {
  target = Math.max(0, target)
  while (target > 0 && records[target]?.move.pass) target -= 1
  return target
}

/**
 * Would this move bring back a position that has already been played?
 *
 * The third time round is a draw, and shuffling towards it is never good
 * play, so a bot that can avoid it should.
 */
export function wouldRepeat(state: GameState, move: Move): boolean {
  const next = applyMove(state, move, { compute: false })
  return countPosition(next, positionKey(next)) > 0
}

/** What a player asks for: this piece to that square, with the choices made on the way. */
export interface MoveRequest {
  from: Vec
  to: Vec
  finalTo: Vec
  drop?: { typeId: string }
  promotionTypeId?: string
  /** The die the player saw, for a piece that rolls to move. */
  roll?: number
}

/**
 * Turns a request into the legal move it names, or says why it is not one.
 * The room checks every online move with it, and the archive checks every
 * game it is sent the same way.
 */
export function resolveMove(
  game: GameState,
  request: MoveRequest,
): { move: Move } | { error: 'illegal_move' | 'bad_promotion' } {
  const { from, to, finalTo } = request
  // The die of a piece that rolls to move is part of the position, so the
  // legal moves are worked out with the roll the player saw.
  const pieceId = game.board[from.y]?.[from.x]
  const roll =
    pieceId && Number.isInteger(request.roll) && request.roll! >= 1 && request.roll! <= DICE_SIDES
      ? { pieceId, value: request.roll! }
      : undefined
  const position = roll ? { ...game, roll } : game
  // A drop comes out of the pocket, so there is no piece under `from` to
  // ask — the legal drops are worked out instead.
  const legal = request.drop
    ? dropOptions(position, game.turn).map((option) => option.move)
    : getLegalMoves(position, from.x, from.y)
  const move = legal.find((candidate) => intentMatches(candidate, { to, finalTo, drop: request.drop }))
  if (!move) return { error: 'illegal_move' }

  const options = move.promotionOptions ?? []
  let promotionTypeId = request.promotionTypeId
  if (options.length) {
    if (!promotionTypeId) promotionTypeId = options[0]
    if (!options.includes(promotionTypeId)) return { error: 'bad_promotion' }
  } else {
    promotionTypeId = undefined
  }
  return { move: { ...move, promotionTypeId } }
}

/** The request that played a recorded move, so a game can be checked again elsewhere. */
export function requestFor(record: MoveRecord): MoveRequest {
  const { move } = record
  return {
    from: move.from,
    to: move.to,
    finalTo: move.finalTo,
    drop: move.drop,
    promotionTypeId: move.promotionTypeId,
    roll: move.roll,
  }
}
