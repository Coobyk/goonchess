import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Flame } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import {
  dayKey,
  liveStreakDays,
  loadStats,
  loadStreak,
  recordPlayDay,
  recordResult,
  saveStreak,
  saveStats,
  type PlayStreak,
  type Stats,
} from '@/lib/stats'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

/**
 * Keeps track of how the games went.
 *
 * The numbers never leave the browser — they are only a small tally of what
 * was played on this device.
 */
export function StatsPanel() {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const [stats, setStats] = useState<Stats>(() => loadStats())
  const [streak, setStreak] = useState<PlayStreak>(() => loadStreak())
  const [recorded, setRecorded] = useState<string | null>(null)

  // Note the result once the game is over. A finished game — win, loss or
  // draw — marks the day as played and keeps the streak going.
  useEffect(() => {
    if (!game.winner) return
    const key = `${variant.id}:${game.moveHistory.length}:${game.winner}`
    if (recorded === key) return
    setRecorded(key)
    const result =
      game.winner === 'draw'
        ? ('draw' as const)
        : game.winner === variant.teams[0]?.id
          ? ('win' as const)
          : ('loss' as const)
    const next = recordResult(loadStats(), variant.id, result)
    saveStats(next)
    setStats(next)
    const today = dayKey(new Date())
    const nextStreak = recordPlayDay(loadStreak(), today)
    saveStreak(nextStreak)
    setStreak(nextStreak)
    // First finished game of the day: announce the streak.
    if (streak.lastDay !== today) {
      if (nextStreak.days === 1) {
        toast('Your streak started! 🔥', {
          description: 'Come back tomorrow to make it 2 days in a row.',
        })
      } else {
        toast(`Day ${nextStreak.days} in a row! 🔥`, {
          description: 'Come back tomorrow to keep the streak going.',
        })
      }
    }
  }, [game, variant, recorded, streak])

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
