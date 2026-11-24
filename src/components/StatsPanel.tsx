import { BarChart3, Flame } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import {
  dayKey,
  liveStreakDays,
  loadStats,
  loadStreak,
} from '@/lib/stats'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

/**
 * Keeps track of how the games went.
 *
 * This tally stays in the browser — it is only what was played on this
 * device. The site-wide move statistics are in `CommunityPanel`.
 */
export function StatsPanel() {
  // A result is persisted by the app-level watcher before this render.
  useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const stats = loadStats()
  const streak = loadStreak()

  const row = stats[variant.id]
  const others = Object.entries(stats).filter(([id]) => id !== variant.id)
  const streakDays = liveStreakDays(streak, dayKey(new Date()))

  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="text-muted-foreground size-4" /> Games played
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 text-sm">
        {!row && others.length === 0 && (
          <p className="text-muted-foreground text-xs">
            No finished games yet. The tally is kept in this browser only.
          </p>
        )}
        {row && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{variant.name}</p>
            <p className="text-muted-foreground font-mono text-xs">
              {row.games} played · {row.wins} won · {row.losses} lost · {row.draws} drawn
            </p>
          </div>
        )}
        {others.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            {others.slice(0, 4).map(([id, value]) => (
              <p key={id} className="text-muted-foreground font-mono text-[11px]">
                {id}: {value.games} played · {value.wins} won
              </p>
            ))}
          </div>
        )}
        {streakDays > 0 && (
          <p
            className={cn(
              'flex items-center gap-1 border-t pt-2 font-medium',
              streakDays >= 5 ? 'text-amber-500' : 'text-foreground',
            )}
          >
            <Flame className="size-3.5" />
            {streakDays === 1 ? '1 day' : `${streakDays} days`} in a row
            {streak.best > streakDays && (
              <span className="text-muted-foreground font-normal">· best {streak.best}</span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
