import { useEffect, useState } from 'react'
import { Eraser, Grid3x3, Paintbrush } from 'lucide-react'
import type { Terrain } from '@/engine/types'
import { useAppStore } from '@/store/useAppStore'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Badge } from './ui/badge'

const TERRAINS: { id: Terrain; label: string; hint: string }[] = [
  { id: 'normal', label: 'Open', hint: 'Ordinary square' },
  { id: 'wall', label: 'Wall', hint: 'Blocks movement and sliding' },
  { id: 'void', label: 'Void', hint: 'Empty hole, blocks everything' },
  { id: 'portal', label: 'Portal', hint: 'Click two squares to link them both ways' },
  { id: 'oneway', label: 'One-way', hint: 'Click source then destination' },
]

export function BoardTab() {
  const variant = useAppStore((s) => s.variant)
  const resizeBoard = useAppStore((s) => s.resizeBoard)
  const updateVariant = useAppStore((s) => s.updateVariant)
  const brush = useAppStore((s) => s.brush)
  const setBrush = useAppStore((s) => s.setBrush)
  const portalPending = useAppStore((s) => s.portalPending)
  const setPortalPending = useAppStore((s) => s.setPortalPending)

  const [w, setW] = useState(variant.board.width)
  const [h, setH] = useState(variant.board.height)

  useEffect(() => {
    setW(variant.board.width)
    setH(variant.board.height)
  }, [variant.board.width, variant.board.height])

  const counts = variant.board.tiles
    .flat()
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.terrain] = (acc[t.terrain] ?? 0) + 1
      return acc
    }, {})

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3x3 className="size-4" /> Board size
          </CardTitle>
          <CardDescription>From tiny 3×3 duels to sprawling 16×16 campaigns.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="board-w">Columns</Label>
              <Input
                id="board-w"
                type="number"
                min={3}
                max={16}
                className="w-24"
                value={w}
                onChange={(e) => setW(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="board-h">Rows</Label>
              <Input
                id="board-h"
                type="number"
                min={3}
                max={16}
                className="w-24"
                value={h}
                onChange={(e) => setH(Number(e.target.value))}
              />
            </div>
            <Button onClick={() => resizeBoard(w, h)}>Apply size</Button>
            <Badge variant="secondary">
              {variant.board.width} × {variant.board.height}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Shrinking the board trims pieces and terrain outside the new bounds.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Paintbrush className="size-4" /> Terrain brush
          </CardTitle>
          <CardDescription>Pick a terrain, then click squares on the board.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleGroup
            type="single"
            variant="outline"
            className="h-auto flex-wrap justify-start"
            value={brush.mode === 'terrain' ? brush.terrain : ''}
            onValueChange={(v) => {
              if (!v) return
              setBrush({ ...brush, mode: 'terrain', terrain: v as Terrain })
            }}
          >
            {TERRAINS.map((t) => (
              <ToggleGroupItem key={t.id} value={t.id} title={t.hint} className="px-3">
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="text-xs text-muted-foreground">
            {portalPending
              ? 'Portal started — click the destination square.'
              : (TERRAINS.find((t) => t.id === brush.terrain)?.hint ?? '')}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {portalPending && (
              <Button size="sm" variant="outline" onClick={() => setPortalPending(null)}>
                Cancel portal link
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateVariant((v) => ({
                  ...v,
                  board: {
                    ...v.board,
                    tiles: v.board.tiles.map((row) =>
                      row.map(() => ({ terrain: 'normal' as Terrain })),
                    ),
                  },
                }))
              }
            >
              <Eraser /> Clear terrain
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(counts).map(([terrain, n]) => (
              <Badge key={terrain} variant="secondary" className="capitalize">
                {terrain}: {n}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
