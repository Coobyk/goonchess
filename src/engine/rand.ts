/**
 * Small deterministic random generators, so a seed gives a repeatable game.
 * The search, the opening book, the puzzle picker and the dice in the rules
 * all draw from these, which is why they live here and not in one file.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The linear congruential step the board's own rolls use. The seed travels in
 * the game state, so a replayed game rolls the same dice again.
 */
export const nextSeed = (seed: number): number => (Math.imul(seed, 1664525) + 1013904223) >>> 0
