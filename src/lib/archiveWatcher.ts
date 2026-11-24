import { selectLatestGame, useAppStore } from '@/store/useAppStore'
import { loadSharing, submitGame } from '@/lib/archiveClient'

/**
 * Sends each game played in this browser to the archive at the moment it
 * ends. Only the step from a running game to a finished one counts, so a
 * finished game that is merely shown again — opened from a link, or seen
 * after a reload or a change of view — is never sent twice. Online games
 * are stored by their room, puzzles are not games.
 */
export function watchFinishedGames(): () => void {
  return useAppStore.subscribe((state, prev) => {
    // Reviewing a ply only changes the displayed game, not the live result.
    const game = selectLatestGame(state)
    const previous = selectLatestGame(prev)
    if (game === previous || !game.winner) return
    // A new result may continue the live game or branch from a reviewed ply.
    // Merely navigating the move list keeps the live snapshot unchanged above.
    if (![previous, prev.game].some((before) =>
      !before.winner && continues(before.moveHistory, game.moveHistory),
    )) return
    if (state.online || state.puzzle || !loadSharing()) return
    void submitGame(game, state.bot.mode === 'off' ? 'local' : 'bot')
  })
}

/** Whether `next` is `prev` with at most one more move: the same game, ending. */
function continues<T>(prev: T[], next: T[]): boolean {
  if (next.length !== prev.length && next.length !== prev.length + 1) return false
  return prev.every((record, i) => record === next[i])
}
