import { findPiece, movesFor } from './rules'
import type { GameState, Move, Vec } from './types'

/** What the threat overlay should mark. Persisted with the user's settings. */
export interface ThreatSettings {
  show: boolean
  /** Faint tint on every square the enemy can move to or capture on. */
  coverage: boolean
  /** Ring friendly pieces that are attacked and not defended. */
  hanging: boolean
  /** Ring friendly pieces that are attacked but defended. */
  defended: boolean
  /** Whose threats to show: only the side to move, or both armies. */
  scope: 'turn' | 'both'
}

export const DEFAULT_THREAT_SETTINGS: ThreatSettings = {
  show: false,
  coverage: true,
  hanging: true,
  defended: true,
  scope: 'turn',
}

export interface PieceThreat {
  pieceId: string
  at: Vec
  /** Team ids that can capture this piece. */
  by: string[]
  /** At least one friendly piece can recapture after any attacker lands. */
  defended: boolean
}

export interface ThreatReport {
  /** "x,y" squares attacked by the opposing teams. */
  coverage: Set<string>
  /** Friendly pieces that can be captured right now. */
  pieces: Map<string, PieceThreat>
}

export const threatKey = (x: number, y: number) => `${x},${y}`

/**
 * Finds what the other teams threaten against `teamId` right now. Attack
 * coverage comes from the same move generator as play, so portals, walls,
 * custom patterns and en passant are all respected.
 */
export function computeThreats(state: GameState, teamId: string): ThreatReport {
  const coverage = new Set<string>()
  const pieces = new Map<string, PieceThreat>()
  const captures = new Map<string, { move: Move; by: string }>()

  for (const id in state.pieces) {
    const inst = state.pieces[id]
    if (inst.team === teamId) continue
    const pos = findPiece(state, id)
    if (!pos) continue
    for (const move of movesFor(state, pos.x, pos.y)) {
      coverage.add(threatKey(move.finalTo.x, move.finalTo.y))
      if (!move.capturedId) continue
      const target = state.pieces[move.capturedId]
      if (!target || target.team !== teamId) continue
      const existing = pieces.get(move.capturedId)
      if (existing) {
        if (!existing.by.includes(inst.team)) existing.by.push(inst.team)
      } else {
        pieces.set(move.capturedId, {
          pieceId: move.capturedId,
          at: move.finalTo,
          by: [inst.team],
          defended: false,
        })
      }
      if (!captures.has(move.capturedId)) captures.set(move.capturedId, { move, by: inst.team })
    }
  }

  // A piece is defended when a teammate can take back on the landing square.
  for (const [pieceId, threat] of pieces) {
    const attack = captures.get(pieceId)
    if (!attack) continue
    threat.defended = canRecapture(state, pieceId, attack.move)
  }

  return { coverage, pieces }
}

function canRecapture(state: GameState, defenderId: string, attack: Move): boolean {
  const inst = state.pieces[attack.pieceId]
  if (!inst) return false
  const at = attack.finalTo

  // Simulate the attacker standing on the defended square. Effects are ignored:
  // this is purely an occupancy question.
  const board = state.board.map((row) => [...row])
  const attackerFrom = findPiece(state, attack.pieceId)
  if (!attackerFrom) return false
  const defender = state.pieces[defenderId]
  if (!defender) return false
  const defenderHome = findPiece(state, defenderId)
  if (defenderHome) board[defenderHome.y][defenderHome.x] = null
  board[attackerFrom.y][attackerFrom.x] = null
  board[at.y][at.x] = attack.pieceId

  const sim: GameState = { ...state, board, turn: defender.team }
  for (const id in state.pieces) {
    const other = state.pieces[id]
    if (other.team !== defender.team || id === defenderId) continue
    const pos = findPiece(sim, id)
    if (!pos) continue
    const canTake = movesFor(sim, pos.x, pos.y).some(
      (m) => m.capturedId === attack.pieceId && m.finalTo.x === at.x && m.finalTo.y === at.y,
    )
    if (canTake) return true
  }
  return false
}

/** Merge several reports so both armies can be viewed at once. */
export function mergeThreats(reports: ThreatReport[]): ThreatReport {
  const coverage = new Set<string>()
  const pieces = new Map<string, PieceThreat>()
  for (const report of reports) {
    for (const key of report.coverage) coverage.add(key)
    for (const [id, threat] of report.pieces) {
      const existing = pieces.get(id)
      if (existing) {
        for (const team of threat.by) if (!existing.by.includes(team)) existing.by.push(team)
        existing.defended = existing.defended || threat.defended
      } else {
        pieces.set(id, { ...threat, by: [...threat.by] })
      }
    }
  }
  return { coverage, pieces }
}

/** Counts for the sidebar legend. */
export function threatSummary(report: ThreatReport, game: GameState) {
  let hanging = 0
  let defended = 0
  for (const [id, threat] of report.pieces) {
    if (!game.pieces[id]) continue
    if (threat.defended) defended += 1
    else hanging += 1
  }
  return { hanging, defended, total: report.pieces.size }
}
