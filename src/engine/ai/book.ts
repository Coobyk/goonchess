import { applyMove, legalMovesForTeam, sanFor } from '../rules'
import type { GameState, Move } from '../types'

/**
 * A small opening book for classic chess.
 *
 * The book is a list of score sheets: a position is found by reading the SAN
 * of the moves played so far against the beginnings of the lines. The bot
 * plays from it for the first few moves, so its games do not all open the
 * same way, and everything past the book is left to the search.
 */

const LINES: string[][] = [
  // The open game and the Ruy Lopez and Italian that follow it.
  ['e4', 'e5', 'Nf3'],
  ['e4', 'e5', 'Nf3', 'Nc6'],
  ['e4', 'e5', 'Nf3', 'Nf6'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'd4'],
  ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5'],
  // The Sicilian.
  ['e4', 'c5'],
  ['e4', 'c5', 'Nf3'],
  ['e4', 'c5', 'Nf3', 'd6'],
  ['e4', 'c5', 'Nf3', 'Nc6'],
  ['e4', 'c5', 'Nf3', 'e6'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4'],
  ['e4', 'c5', 'c3'],
  // The French and the Caro-Kann.
  ['e4', 'e6'],
  ['e4', 'e6', 'd4'],
  ['e4', 'e6', 'd4', 'd5'],
  ['e4', 'e6', 'd4', 'd5', 'Nc3'],
  ['e4', 'e6', 'd4', 'd5', 'e5'],
  ['e4', 'c6'],
  ['e4', 'c6', 'd4'],
  ['e4', 'c6', 'd4', 'd5'],
  ['e4', 'c6', 'd4', 'd5', 'Nc3'],
  ['e4', 'c6', 'd4', 'd5', 'e5'],
  ['e4', 'c6', 'd4', 'd5', 'exd5'],
  // Queen's pawn openings.
  ['d4'],
  ['d4', 'd5'],
  ['d4', 'Nf6'],
  ['d4', 'd5', 'c4'],
  ['d4', 'd5', 'c4', 'e6'],
  ['d4', 'd5', 'c4', 'c6'],
  ['d4', 'd5', 'c4', 'dxc4'],
  ['d4', 'd5', 'c4', 'e6', 'Nc3'],
  ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'],
  ['d4', 'd5', 'c4', 'c6', 'Nf3'],
  ['d4', 'Nf6', 'c4'],
  ['d4', 'Nf6', 'c4', 'e6'],
  ['d4', 'Nf6', 'c4', 'g6'],
  ['d4', 'Nf6', 'c4', 'e6', 'Nc3'],
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3'],
  // Flank openings.
  ['Nf3'],
  ['Nf3', 'd5'],
  ['Nf3', 'Nf6'],
  ['c4'],
  ['c4', 'e5'],
  ['c4', 'Nf6'],
]

/**
 * The book, as a trie of score sheets. Every node carries the moves the bot
 * may play from the position the node stands for.
 */
interface BookNode {
  moves: Set<string>
  next: Map<string, BookNode>
}

let root: BookNode | null = null

function book(): BookNode {
  if (root) return root
  root = { moves: new Set(), next: new Map() }
  for (const line of LINES) {
    let node = root
    for (const san of line) {
      node.moves.add(san)
      let child = node.next.get(san)
      if (!child) {
        child = { moves: new Set(), next: new Map() }
        node.next.set(san, child)
      }
      node = child
    }
  }
  return root
}

/** Small deterministic random generator, the same one the search uses. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The notation of every legal move, so the book's SAN can be played back. */
function sanOf(state: GameState, move: Move): string {
  const next = applyMove(state, move, { compute: false })
  return sanFor(state, move, next)
}

/**
 * The move the book suggests, or null when the game has left the book — or
 * was never in it. The candidates are chosen at random with the seed, so a
 * seeded game can be replayed.
 */
export function bookMove(state: GameState, seed = 0): Move | null {
  // The book was written for classic chess, and for nothing else.
  if (state.variant.id !== 'classic') return null
  // The sheet is read from the moves already played. One played without its
  // notation and the game is off the page.
  let node = book()
  for (const record of state.moveHistory) {
    if (!record.san) return null
    const child = node.next.get(record.san)
    if (!child) return null
    node = child
  }
  if (!node.moves.size) return null

  const wanted = new Set([...node.moves].map((san) => san.replace(/[+#!?]/g, '')))
  const candidates = legalMovesForTeam(state, state.turn).filter((move) =>
    wanted.has(sanOf(state, move).replace(/[+#!?]/g, '')),
  )
  if (!candidates.length) return null
  const pick = Math.floor(mulberry32(seed)() * candidates.length)
  return candidates[pick] ?? null
}
