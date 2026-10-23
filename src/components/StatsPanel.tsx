import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { loadStats, recordResult, saveStats, type Stats } from '@/lib/stats'

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
  const [recorded, setRecorded] = useState<string | null>(null)

  // Note the result once the game is over.
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
  }, [game, variant, recorded])

  const row = stats[variant.id]
  const others = Object.entries(stats).filter(([id]) => id !== variant.id)

  return (
    <section className="border-t pt-4">
      <h2 className="label-mono mb-2 flex items-center gap-1.5">
        <BarChart3 className="size-3" /> Games played
      </h2>
      <div className="space-y-2 text-sm">
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
      </div>
    </section>
  )
}
