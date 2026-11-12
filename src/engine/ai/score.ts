/**
 * The shape of a search score — shared by the search that writes it and the
 * panels that read it, so the two can never disagree on the scale.
 */

/** A win by force reads as this minus the plies it still takes. */
export const MATE = 1_000_000

/** The band around MATE in which a score still describes a mate. */
export const isMateScore = (score: number): boolean => Math.abs(score) >= MATE - 1000

/** The moves a mate score still needs, or null for a plain evaluation. */
export function mateIn(score: number): number | null {
  if (!isMateScore(score)) return null
  return Math.max(1, Math.ceil((MATE - Math.abs(score)) / 2))
}
