import { useState } from 'react'
import { Layers, Plus, Trash2 } from 'lucide-react'
import type { ArtShape, PieceArt, PieceArtLayer } from '@/engine/types'
import {
  ART_SHAPES,
  ART_SHAPE_LABELS,
  PREMADE_ART,
  artToUri,
  singleShapeArt,
} from '@/lib/pieceArt'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { cn } from '@/lib/utils'

/** The space the pieces are drawn in. */
const SPACE = 45
/** How big the preview is drawn, in pixels. */
const PREVIEW = 190

/**
 * The piece composer.
 *
 * A piece is drawn by stacking shapes on top of each other: the chess pieces
 * as they are normally drawn. The last shape is the one on top, so a knight
 * with a bishop's crown on its head is a knight with the bishop's crown
 * stacked on it, moved and shrunk to fit.
 */
export function PieceComposer({
  open,
  onOpenChange,
  art,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  art: PieceArt
  onChange: (art: PieceArt) => void
}) {
  const [active, setActive] = useState(0)

  const layers = art.length ? art : singleShapeArt('queen')
  const index = Math.min(active, layers.length - 1)
  const layer = layers[index]
  const uri = artToUri(layers, true)
  const darkUri = artToUri(layers, false)

  const update = (patch: Partial<PieceArtLayer>) => {
    const next = layers.map((l, i) => (i === index ? { ...l, ...patch } : l))
    onChange(next)
  }

  const move = (dx: number, dy: number) => {
    update({
      x: Math.round(Math.max(-15, Math.min(30, layer.x + dx)) * 10) / 10,
      y: Math.round(Math.max(-15, Math.min(30, layer.y + dy)) * 10) / 10,
    })
  }

  const addLayer = (shape: ArtShape) => {
    onChange([...layers, { shape, x: 8, y: 0, scale: 0.55, crown: true }])
    setActive(layers.length)
  }

  const removeLayer = (at: number) => {
    if (layers.length <= 1) return
    const next = layers.filter((_, i) => i !== at)
    onChange(next)
    setActive(Math.max(0, Math.min(at - 1, next.length - 1)))
  }

  /** A drag on the preview moves the shape that is being worked on. */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    let last = { x: event.clientX, y: event.clientY }
    const onMove = (e: PointerEvent) => {
      const dx = ((e.clientX - last.x) / rect.width) * SPACE
      const dy = ((e.clientY - last.y) / rect.height) * SPACE
      last = { x: e.clientX, y: e.clientY }
      move(dx, dy)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4" /> Piece composer
          </DialogTitle>
          <DialogDescription>
            Stack shapes on top of each other to draw a piece. Drag the picture to move the shape
            that is selected.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          {/* The picture being worked on. */}
          <div className="space-y-2">
            <div
              className="flex cursor-grab touch-none items-center justify-center rounded-lg bg-[#ebe9e3] active:cursor-grabbing"
              style={{ width: PREVIEW, height: PREVIEW }}
              onPointerDown={onPointerDown}
              role="presentation"
            >
              <img
                src={uri}
                alt="The piece being drawn"
                width={PREVIEW - 20}
                height={PREVIEW - 20}
                draggable={false}
                style={{ pointerEvents: 'none' }}
              />
            </div>
            <div className="flex items-center justify-center gap-2">
              <div
                className="flex items-center justify-center rounded bg-[#ebe9e3]"
                style={{ width: 44, height: 44 }}
              >
                <img src={uri} alt="" width={38} height={38} draggable={false} />
              </div>
              <div
                className="flex items-center justify-center rounded bg-[#6b6b74]"
                style={{ width: 44, height: 44 }}
              >
                <img src={darkUri} alt="" width={38} height={38} draggable={false} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* The collection of premade pieces. */}
            <div className="space-y-1.5">
              <Label>Collection</Label>
              <div className="grid max-h-52 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6">
                {PREMADE_ART.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={`${item.name} — ${item.note}`}
                    className="flex flex-col items-center gap-0.5 rounded-md border border-border bg-card p-1.5 transition-colors hover:border-foreground/40 hover:bg-accent"
                    onClick={() => {
                      onChange(item.art.map((l) => ({ ...l })))
                      setActive(0)
                    }}
                  >
                    <img
                      src={artToUri(item.art, true)}
                      alt={item.name}
                      width={38}
                      height={38}
                      draggable={false}
                    />
                    <span className="truncate text-[10px] leading-tight">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* The shapes in the piece. */}
            <div className="space-y-1.5">
              <Label>Shapes</Label>
              <div className="space-y-1">
                {layers.map((l, i) => (
                  <div
                    key={`${l.shape}-${i}`}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2 py-1 text-sm',
                      i === index
                        ? 'border-foreground/40 bg-accent'
                        : 'border-transparent bg-muted/40',
                    )}
                    onClick={() => setActive(i)}
                  >
                    <img
                      src={artToUri([{ ...l, x: 0, y: 0, scale: 1 }], true)}
                      alt=""
                      width={26}
                      height={26}
                      draggable={false}
                      className="rounded bg-[#ebe9e3]"
                    />
                    <span className="flex-1">{ART_SHAPE_LABELS[l.shape]}</span>
                    {l.crown && (
                      <span className="text-[10px] text-muted-foreground">crown only</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={layers.length <= 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeLayer(i)
                      }}
                      aria-label={`Remove the ${ART_SHAPE_LABELS[l.shape]}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {ART_SHAPES.map((shape) => (
                  <Button
                    key={shape}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    aria-label={`Add a ${ART_SHAPE_LABELS[shape]}`}
                    onClick={() => addLayer(shape)}
                  >
                    <Plus className="size-3" /> {ART_SHAPE_LABELS[shape]}
                  </Button>
                ))}
              </div>
            </div>

            {/* The shape that is selected. */}
            {layer && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="text-sm font-medium">{ART_SHAPE_LABELS[layer.shape]}</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <Label className="w-12 text-xs">Sideways</Label>
                    <Slider
                      min={-12}
                      max={30}
                      step={0.5}
                      value={[layer.x]}
                      onValueChange={([v]) => update({ x: v })}
                      className="flex-1"
                    />
                    <span className="w-12 text-right font-mono text-xs">{layer.x}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-12 text-xs">Height</Label>
                    <Slider
                      min={-12}
                      max={30}
                      step={0.5}
                      value={[layer.y]}
                      onValueChange={([v]) => update({ y: v })}
                      className="flex-1"
                    />
                    <span className="w-12 text-right font-mono text-xs">{layer.y}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-12 text-xs">Size</Label>
                    <Slider
                      min={0.2}
                      max={1.4}
                      step={0.02}
                      value={[layer.scale]}
                      onValueChange={([v]) => update({ scale: v })}
                      className="flex-1"
                    />
                    <span className="w-12 text-right font-mono text-xs">
                      {Math.round(layer.scale * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <Switch
                      id="crown-only"
                      checked={!!layer.crown}
                      onCheckedChange={(v) => update({ crown: v })}
                    />
                    <Label htmlFor="crown-only" className="text-xs">
                      Crown only — show the head, not the pedestal
                    </Label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground max-w-sm text-[11px]">
            Chess pieces by Colin M. L. Burnett, shared under CC BY-SA 3.0.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => onOpenChange(false)}>Use this piece</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
