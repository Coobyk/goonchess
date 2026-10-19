import { Copy, Eraser, FlipHorizontal, FlipVertical, Trash2 } from 'lucide-react'
import { PIECE_DRAG_TYPE } from './MakerBoard'
import { PieceGlyph } from './PieceGlyph'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

export function SetupTab() {
  const variant = useAppStore((s) => s.variant)
  const brush = useAppStore((s) => s.brush)
  const setBrush = useAppStore((s) => s.setBrush)
  const clearSetup = useAppStore((s) => s.clearSetup)
  const mirrorSetup = useAppStore((s) => s.mirrorSetup)
  const duplicateSide = useAppStore((s) => s.duplicateSide)

  const activeTeam = brush.team
  const teamIndex = (id: string) => variant.teams.findIndex((t) => t.id === id)

  const counts = variant.teams.map((t) => ({
    team: t,
    count: variant.setup.filter((s) => s.team === t.id).length,
  }))

  const royalWarnings = variant.teams
    .filter(() =>
      variant.winConditions.some((w) => w.kind === 'checkmate' || w.kind === 'kingCapture'),
    )
    .filter(
      (t) =>
        !variant.setup.some(
          (s) => s.team === t.id && variant.pieceTypes.find((p) => p.id === s.typeId)?.flags.royal,
        ),
    )

  const [otherTeam] = variant.teams.filter((t) => t.id !== activeTeam)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Place your army</CardTitle>
          <CardDescription>
            Drag a piece onto the board, or select one and click squares. Right-click a square to clear it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleGroup
            type="single"
            className="h-auto flex-wrap justify-start"
            value={brush.mode === 'erase' ? 'erase' : activeTeam}
            onValueChange={(v) => {
              if (!v) return
              if (v === 'erase') setBrush({ ...brush, mode: 'erase' })
              else setBrush({ ...brush, mode: 'piece', team: v })
            }}
          >
            {variant.teams.map((t) => (
              <ToggleGroupItem key={t.id} value={t.id}>
                <span className="size-2.5 rounded-full ring-1 ring-black/20" style={{ backgroundColor: t.color }} />
                {t.name}
              </ToggleGroupItem>
            ))}
            <ToggleGroupItem value="erase">
              <Eraser /> Erase
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {variant.pieceTypes.map((p) => {
              const active = brush.mode === 'piece' && brush.typeId === p.id && brush.team === activeTeam
              return (
                <button
                  key={p.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      PIECE_DRAG_TYPE,
                      JSON.stringify({ typeId: p.id, team: activeTeam }),
                    )
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() =>
                    setBrush({ mode: 'piece', terrain: brush.terrain, team: activeTeam, typeId: p.id })
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors',
                    active ? 'border-ring bg-accent' : 'hover:bg-accent/60',
                  )}
                >
                  <PieceGlyph piece={p} teamIndex={teamIndex(activeTeam)} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">value {p.value}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Layout tools</CardTitle>
          <CardDescription>Symmetry helpers for building setups quickly.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => mirrorSetup('horizontal')}>
            <FlipHorizontal /> Mirror left/right
          </Button>
          <Button size="sm" variant="outline" onClick={() => mirrorSetup('vertical')}>
            <FlipVertical /> Mirror top/bottom
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!otherTeam}
            onClick={() => duplicateSide(activeTeam, otherTeam.id)}
          >
            <Copy /> Copy to {otherTeam?.name ?? 'other team'}
          </Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={clearSetup}>
            <Trash2 /> Clear all
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {counts.map(({ team, count }) => (
              <Badge key={team.id} variant="secondary" className="gap-1.5">
                <span className="size-2.5 rounded-full ring-1 ring-black/20" style={{ backgroundColor: team.color }} />
                {team.name}: {count}
              </Badge>
            ))}
          </div>
          {variant.setup.length === 0 && (
            <p className="text-muted-foreground">The board is empty. Place at least a royal piece per team.</p>
          )}
          {royalWarnings.map((t) => (
            <p key={t.id} className="text-rose-500">
              {t.name} has no royal piece, so checkmate-style conditions can never trigger.
            </p>
          ))}
          {variant.setup.length > 0 && royalWarnings.length === 0 && (
            <p className="text-muted-foreground">Both sides look ready.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
