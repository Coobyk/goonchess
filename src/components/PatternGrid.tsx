import { Trash2 } from 'lucide-react'
import type { MovePattern, Vec } from '@/engine/types'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Slider } from './ui/slider'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { cn } from '@/lib/utils'

const R = 4
const SIZE = R * 2 + 1

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0)
const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y

export function PatternGrid({
  pattern,
  onChange,
  onRemove,
}: {
  pattern: MovePattern
  onChange: (p: MovePattern) => void
  onRemove: () => void
}) {
  const cells: { x: number; y: number }[] = []
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) cells.push({ x, y })

  const toggle = (v: Vec) => {
    if (v.x === 0 && v.y === 0) return
    if (pattern.kind === 'leaper') {
      const exists = pattern.vectors.some((p) => same(p, v))
      const vectors = exists
        ? pattern.vectors.filter((p) => !same(p, v))
        : [...pattern.vectors, v]
      onChange({ ...pattern, vectors })
    } else {
      const dir = { x: sign(v.x), y: sign(v.y) }
      const exists = pattern.vectors.some((p) => same(p, dir))
      const vectors = exists
        ? pattern.vectors.filter((p) => !same(p, dir))
        : [...pattern.vectors, dir]
      onChange({ ...pattern, vectors })
    }
  }

  const onRay = (dir: Vec, x: number, y: number) => {
    if (dir.x === 0 && dir.y === 0) return false
    if (dir.x !== 0 && dir.y !== 0) {
      return sign(x) === dir.x && sign(y) === dir.y && Math.abs(x) === Math.abs(y)
    }
    if (dir.x !== 0) return y === 0 && sign(x) === dir.x
    return x === 0 && sign(y) === dir.y
  }

  const isActive = (x: number, y: number) => {
    if (x === 0 && y === 0) return false
    if (pattern.kind === 'leaper') return pattern.vectors.some((p) => p.x === x && p.y === y)
    return pattern.vectors.some((dir) => onRay(dir, x, y))
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          value={pattern.kind}
          onValueChange={(v) => {
            if (!v) return
            onChange({ ...pattern, kind: v as MovePattern['kind'], vectors: [] })
          }}
          size="sm"
        >
          <ToggleGroupItem value="leaper">Leaper</ToggleGroupItem>
          <ToggleGroupItem value="slider">Slider</ToggleGroupItem>
        </ToggleGroup>
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove pattern">
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>

      <div className="flex gap-3">
        <div
          className="grid shrink-0 gap-px rounded-md bg-border p-px"
          style={{ gridTemplateColumns: `repeat(${SIZE}, 18px)` }}
        >
          {cells.map(({ x, y }) => {
            const active = isActive(x, y)
            const center = x === 0 && y === 0
            return (
              <button
                key={`${x},${y}`}
                type="button"
                disabled={center}
                onClick={() => toggle({ x, y })}
                title={pattern.kind === 'leaper' ? `dx ${x}, dy ${y}` : `direction ${sign(x)},${sign(y)}`}
                className={cn(
                  'size-[18px] rounded-[2px] transition-colors',
                  center
                    ? 'bg-foreground'
                    : active
                      ? 'bg-primary'
                      : 'bg-background hover:bg-muted',
                )}
              />
            )
          })}
        </div>

        <div className="flex flex-1 flex-col gap-3 text-xs">
          {pattern.kind === 'slider' ? (
            <label className="space-y-2">
              <span className="text-muted-foreground">
                Range: {pattern.maxRange > 0 ? `${pattern.maxRange} squares` : 'unlimited'}
              </span>
              <Slider
                min={0}
                max={8}
                step={1}
                value={[pattern.maxRange]}
                onValueChange={([v]) => onChange({ ...pattern, maxRange: v })}
              />
            </label>
          ) : null}
          <p className="text-muted-foreground leading-relaxed">
            {pattern.kind === 'leaper'
              ? 'Click squares to add jump destinations. This piece leaps exactly to those offsets.'
              : 'Click a square to aim a ray in that direction; the piece slides until blocked.'}
          </p>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={!!pattern.firstMoveOnly}
              onCheckedChange={(v) => onChange({ ...pattern, firstMoveOnly: v === true })}
            />
            <span className="text-muted-foreground">Only before this piece first moves</span>
          </label>
          <div className="text-muted-foreground font-mono">
            {pattern.vectors.length
              ? pattern.vectors.map((v) => `(${v.x},${v.y})`).join(' ')
              : 'none'}
          </div>
        </div>
      </div>
    </div>
  )
}
