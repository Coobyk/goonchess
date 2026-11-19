import { useEffect, useState, useSyncExternalStore } from 'react'
import { Users } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type { ExplorerMove, VariantSummary } from '@/lib/archive'
import {
  fetchExplorer,
  fetchVariantSummary,
  loadSharing,
  saveSharing,
  storedVersion,
  subscribeStored,
} from '@/lib/archiveClient'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'
import { Switch } from './ui/switch'

/**
 * What everybody else played: the most popular moves in the position on the
 * board, and how games of this variant usually go. The switch decides
 * whether games played in this browser are sent (see `archiveWatcher`).
 */
export function CommunityPanel() {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const puzzle = useAppStore((s) => s.puzzle)
  const [sharing, setSharing] = useState(loadSharing)
  const [explorer, setExplorer] = useState<{ games: number; moves: ExplorerMove[] } | null>(null)
  const [summary, setSummary] = useState<VariantSummary | null>(null)
  // Moves on once a game is stored, so the numbers include it.
  const stored = useSyncExternalStore(subscribeStored, storedVersion)

  useEffect(() => {
    if (puzzle) return
    const abort = new AbortController()
    fetchExplorer(game, abort.signal).then(setExplorer, () => setExplorer(null))
    return () => abort.abort()
  }, [game, puzzle, stored])

  useEffect(() => {
    const abort = new AbortController()
    fetchVariantSummary(variant, abort.signal).then(setSummary, () => setSummary(null))
    return () => abort.abort()
  }, [variant, stored])

  const total = explorer?.games ?? 0
  const teams = variant.teams

  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="text-muted-foreground size-4" /> Popular moves
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 text-sm">
        {puzzle ? (
          <p className="text-muted-foreground text-xs">Not counted during a puzzle.</p>
        ) : explorer && explorer.moves.length > 0 ? (
          <ul className="space-y-1">
            {explorer.moves.slice(0, 6).map((row) => (
              <li key={row.move} className="flex items-center gap-2 font-mono text-xs">
                <span className="w-14 shrink-0 font-medium">{row.move}</span>
                <span className="bg-muted relative h-2 flex-1 overflow-hidden rounded">
                  <span
                    className="bg-primary absolute inset-y-0 left-0"
                    style={{ width: `${Math.round((row.games / Math.max(total, 1)) * 100)}%` }}
                  />
                </span>
                <span className="text-muted-foreground w-16 shrink-0 text-right">
                  {row.games} · {Math.round((row.games / Math.max(total, 1)) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">Nobody has played on from this position yet.</p>
        )}
        {summary && summary.games > 0 && (
          <div className="text-muted-foreground space-y-1 border-t pt-2 font-mono text-[11px]">
            <p>
              {summary.games} {summary.games === 1 ? 'game' : 'games'} of {variant.name} · ~
              {Math.round(summary.averagePlies)} plies
            </p>
            <p>
              {teams[0]?.name ?? 'First'} {summary.wins[0]} · {teams[1]?.name ?? 'Second'} {summary.wins[1]} · drawn{' '}
              {summary.draws}
            </p>
            {summary.endings.length > 0 && (
              <p>{summary.endings.slice(0, 3).map((e) => `${e.status} ${e.count}`).join(' · ')}</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <Label htmlFor="share-games" className="text-muted-foreground text-xs font-normal">
            Add my finished games (moves and result only)
          </Label>
          <Switch
            id="share-games"
            checked={sharing}
            onCheckedChange={(on) => {
              setSharing(on)
              saveSharing(on)
            }}
          />
        </div>
      </CardContent>
    </Card>
  )
}
