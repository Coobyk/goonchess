/**
 * The board's colours.
 *
 * The squares used to be customisable per variant, which turned into a
 * distraction rather than a feature. Every board now wears the same two
 * shades, and the theme decides which pair that is.
 */
export const BOARD_LIGHT = '#f0d9b5'
export const BOARD_DARK = '#b58863'

/** The square colours of the theme that is on right now. */
export function boardColors(): { light: string; dark: string } {
  if (typeof document === 'undefined') return { light: BOARD_LIGHT, dark: BOARD_DARK }
  const styles = getComputedStyle(document.documentElement)
  return {
    light: styles.getPropertyValue('--board-light').trim() || BOARD_LIGHT,
    dark: styles.getPropertyValue('--board-dark').trim() || BOARD_DARK,
  }
}
