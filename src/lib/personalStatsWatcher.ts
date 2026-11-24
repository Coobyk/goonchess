import { toast } from 'sonner'
import { selectViewerSeat, useAppStore } from '@/store/useAppStore'
import { dayKey, loadStats, loadStreak, recordPlayDay, recordResult, saveStats, saveStreak } from './stats'

/** Record actual game endings, independently of which view or scoresheet tab is open. */
export function watchPersonalResults(): () => void {
  const recorded = new WeakSet<object>()
  return useAppStore.subscribe((state, prev) => {
    const { game, variant, online } = state
    if (!game.winner) return
    // Loading a replay/position is not playing a move. Online histories are
    // deserialized, so their room and playing status establish continuity.
    if (online) {
      if (online.status !== 'over' || online.code !== prev.online?.code || prev.online.status !== 'playing') return
    } else {
      if (game === prev.game || prev.game.winner || state.puzzle) return
      const before = prev.game.moveHistory
      const after = game.moveHistory
      if (variant !== prev.variant || (after.length !== before.length && after.length !== before.length + 1)) return
      if (!before.every((move, i) => move === after[i])) return
      const sameHistory = prev.undoStack.length > 0
        ? state.undoStack[0] === prev.undoStack[0]
        : state.undoStack.length === 1 && state.undoStack[0].moveHistory === game.moveHistory
      if (state.undoStack !== prev.undoStack && !sameHistory) return
    }
    // The opening history entry identifies a game, not its move count or winner.
    // Rewinding/reviewing that game cannot award the same result again.
    if (!online) {
      const start = state.undoStack[0] ?? prev.undoStack[0] ?? prev.game
      if (recorded.has(start)) return
      recorded.add(start)
    }
    const viewerSeat = selectViewerSeat(state)
    if (viewerSeat === null && (online || state.bot.mode === 'all')) return
    const you = variant.teams[viewerSeat ?? 0]?.id
    const result = game.winner === 'draw' ? 'draw' : game.winner === you ? 'win' : 'loss'
    saveStats(recordResult(loadStats(), variant.id, result))
    const streak = loadStreak()
    const today = dayKey(new Date())
    const next = recordPlayDay(streak, today)
    saveStreak(next)
    if (streak.lastDay !== today) {
      toast(next.days === 1 ? 'Your streak started! 🔥' : `Day ${next.days} in a row! 🔥`, {
        description: next.days === 1 ? 'Come back tomorrow to make it 2 days in a row.' : 'Come back tomorrow to keep the streak going.',
      })
    }
  })
}
