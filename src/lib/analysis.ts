/** How the analysis panel behaves. Persisted with the other display settings. */

export interface AnalysisSettings {
  /** Show the line the bot would play, under the score. */
  showLine: boolean
  /** Draw the move the engine likes best as an arrow on the board. */
  showArrow: boolean
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  showLine: false,
  showArrow: false,
}
