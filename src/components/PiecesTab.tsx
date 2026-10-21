import { Copy, Layers, Plus, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import type { Effect, MovePattern, PieceArt, PieceIcon, PieceType, Vec } from '@/engine/types'
import { PIECE_ICONS } from '@/engine/types'
import { leaper, slider } from '@/engine/templates'
import { uid } from '@/engine/rules'
import { useAppStore } from '@/store/useAppStore'
import { PatternGrid } from './PatternGrid'
import { PieceComposer } from './PieceComposer'
import { PieceGlyph } from './PieceGlyph'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { cn } from '@/lib/utils'

const KNIGHT: Vec[] = [
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: 2, y: -1 },
  { x: 1, y: -2 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
  { x: -2, y: 1 },
  { x: -1, y: 2 },
]
const ORTH: Vec[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]
const DIAG: Vec[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
]
const ALL8: Vec[] = [...ORTH, ...DIAG]

const TEMPLATE_PIECES: { label: string; build: () => Partial<PieceType> }[] = [
  { label: 'King', build: () => ({ name: 'King', icon: 'king', value: 0, move: [leaper(ALL8)], flags: { royal: true } as PieceType['flags'] }) },
  { label: 'Queen', build: () => ({ name: 'Queen', icon: 'queen', value: 9, move: [slider(ALL8)] }) },
  { label: 'Rook', build: () => ({ name: 'Rook', icon: 'rook', value: 5, move: [slider(ORTH)] }) },
  { label: 'Bishop', build: () => ({ name: 'Bishop', icon: 'bishop', value: 3, move: [slider(DIAG)] }) },
  { label: 'Knight', build: () => ({ name: 'Knight', icon: 'knight', value: 3, move: [leaper(KNIGHT)], flags: { jump: true } as PieceType['flags'] }) },
  { label: 'Pawn', build: () => {
    const dbl = slider([{ x: 0, y: -1 }], 2)
    dbl.firstMoveOnly = true
    return { name: 'Pawn', icon: 'pawn', value: 1, move: [leaper([{ x: 0, y: -1 }]), dbl], capture: [leaper([{ x: -1, y: -1 }, { x: 1, y: -1 }])] }
  } },
]

export function PiecesTab() {
  const variant = useAppStore((s) => s.variant)
  const selectedId = useAppStore((s) => s.selectedPieceTypeId)
  const setSelected = useAppStore((s) => s.setSelectedPieceType)
  const addPieceType = useAppStore((s) => s.addPieceType)
  const updatePieceType = useAppStore((s) => s.updatePieceType)
  const deletePieceType = useAppStore((s) => s.deletePieceType)
  const duplicatePieceType = useAppStore((s) => s.duplicatePieceType)
  const setBrush = useAppStore((s) => s.setBrush)
  const setMakerTab = useAppStore((s) => s.setMakerTab)

  const piece = variant.pieceTypes.find((p) => p.id === selectedId) ?? variant.pieceTypes[0]
  const teamIndex = 0
  const [composing, setComposing] = useState(false)

  if (!piece) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No pieces yet</CardTitle>
          <CardDescription>Add a piece type to start building your army.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TEMPLATE_PIECES.map((t) => (
            <Button key={t.label} variant="outline" size="sm" onClick={() => addPieceType(t.build())}>
              <Plus /> {t.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    )
  }

  const set = (patch: Partial<PieceType>) => updatePieceType(piece.id, patch)
  const setMove = (move: MovePattern[]) => set({ move })
  const setCapture = (capture: MovePattern[]) => set({ capture })

  const addPattern = (list: 'move' | 'capture', kind: 'leaper' | 'slider') => {
    const pattern: MovePattern = { id: uid(), kind, vectors: [], maxRange: 0 }
    if (list === 'move') setMove([...piece.move, pattern])
    else setCapture([...piece.capture, pattern])
  }

  const updatePattern = (list: 'move' | 'capture', index: number, next: MovePattern) => {
    const arr = list === 'move' ? [...piece.move] : [...piece.capture]
    arr[index] = next
    if (list === 'move') setMove(arr)
    else setCapture(arr)
  }

  const removePattern = (list: 'move' | 'capture', index: number) => {
    const arr = (list === 'move' ? piece.move : piece.capture).filter((_, i) => i !== index)
    if (list === 'move') setMove(arr)
    else setCapture(arr)
  }

  const setEffect = (index: number, next: Effect | null) => {
    const effects = [...piece.effects]
    if (next === null) effects.splice(index, 1)
    else effects[index] = next
    set({ effects })
  }

  const flags: { key: keyof PieceType['flags']; label: string; hint: string }[] = [
    { key: 'jump', label: 'Jump / leap', hint: 'May pass over pieces while sliding.' },
    { key: 'mustCapture', label: 'Must capture', hint: 'Can only move when taking a piece.' },
    { key: 'uncapturable', label: 'Uncapturable', hint: 'No enemy piece may take it.' },
    { key: 'royal', label: 'Royal', hint: 'Check, checkmate and its capture decide the game.' },
    { key: 'movesOnce', label: 'Moves once', hint: 'Frozen after its first move.' },
    { key: 'mirror', label: 'Mirror for other team', hint: 'Rotates the pattern vertically for the opposing team.' },
    { key: 'enPassant', label: 'En passant', hint: 'May capture an enemy that just crossed an attacked square in a two-square step.' },
    { key: 'dice', label: 'Rolls a die', hint: 'Throws a die to pick which of its movement patterns it uses.' },
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-sm">Piece types</CardTitle>
          <CardDescription>{variant.pieceTypes.length} defined</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-1">
            {variant.pieceTypes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
                  p.id === piece.id ? 'border-ring bg-accent' : 'hover:bg-accent/60',
                )}
              >
                <PieceGlyph piece={p} teamIndex={teamIndex} size={22} />
                <span className="flex-1 truncate">{p.name}</span>
                <Badge variant="secondary" className="font-mono">
                  {p.value}
                </Badge>
              </button>
            ))}
          </div>
          <Separator />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => addPieceType()}>
              <Plus /> Blank
            </Button>
            <Button size="sm" variant="outline" onClick={() => duplicatePieceType(piece.id)}>
              <Copy /> Copy
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => deletePieceType(piece.id)}
            >
              <Trash2 /> Delete
            </Button>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Quick-add classic pieces</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_PIECES.map((t) => (
                <Button key={t.label} size="sm" variant="secondary" onClick={() => addPieceType(t.build())}>
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base">
              <PieceGlyph piece={piece} teamIndex={teamIndex} size={32} />
              {piece.name}
            </CardTitle>
            <CardDescription>Identity, appearance and score value.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="piece-name">Name</Label>
              <Input
                id="piece-name"
                value={piece.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <Select
                value={piece.icon}
                onValueChange={(v) => set({ icon: v as PieceIcon })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIECE_ICONS.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {piece.art && piece.art.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  This piece has a drawing of its own. The icon is only used when the drawing is
                  removed.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Drawing</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setComposing(true)}
                >
                  <Layers /> Compose
                </Button>
                {piece.art && piece.art.length > 0 && (
                  <Button variant="ghost" onClick={() => set({ art: undefined })}>
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {piece.icon === 'custom' && (
              <div className="space-y-1.5">
                <Label htmlFor="piece-symbol">Symbol</Label>
                <Input
                  id="piece-symbol"
                  value={piece.symbol}
                  maxLength={3}
                  onChange={(e) => set({ symbol: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Point value</Label>
              <div className="flex items-center gap-3">
                <Slider
                  min={0}
                  max={20}
                  step={1}
                  value={[piece.value]}
                  onValueChange={([v]) => set({ value: v })}
                  className="flex-1"
                />
                <Badge variant="secondary" className="w-10 justify-center font-mono">
                  {piece.value}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">How it moves</CardTitle>
            <CardDescription>
              Grid is oriented with your forward direction at the top. Patterns stay valid for both teams
              when mirroring is on.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {piece.move.length === 0 && (
              <p className="text-sm text-muted-foreground">No movement patterns: this piece cannot move.</p>
            )}
            {piece.move.map((pattern, i) => (
              <PatternGrid
                key={pattern.id}
                pattern={pattern}
                onChange={(p) => updatePattern('move', i, p)}
                onRemove={() => removePattern('move', i)}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => addPattern('move', 'leaper')}>
                <Plus /> Leaper
              </Button>
              <Button size="sm" variant="outline" onClick={() => addPattern('move', 'slider')}>
                <Plus /> Slider
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMove([slider(ALL8)])}
              >
                <Wand2 /> Queen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMove([slider(ORTH)])}>
                <Wand2 /> Rook
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMove([slider(DIAG)])}>
                <Wand2 /> Bishop
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMove([leaper(KNIGHT)])}>
                <Wand2 /> Knight
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>How it captures</span>
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                Custom capture
                <Switch
                  checked={piece.capture.length > 0}
                  onCheckedChange={(on) => setCapture(on ? [leaper([{ x: 0, y: -1 }])] : [])}
                />
              </span>
            </CardTitle>
            <CardDescription>
              {piece.capture.length > 0
                ? 'This piece captures differently than it moves.'
                : 'Currently captures exactly the way it moves.'}
            </CardDescription>
          </CardHeader>
          {piece.capture.length > 0 && (
            <CardContent className="space-y-3">
              {piece.capture.map((pattern, i) => (
                <PatternGrid
                  key={pattern.id}
                  pattern={pattern}
                  onChange={(p) => updatePattern('capture', i, p)}
                  onRemove={() => removePattern('capture', i)}
                />
              ))}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => addPattern('capture', 'leaper')}>
                  <Plus /> Leaper
                </Button>
                <Button size="sm" variant="outline" onClick={() => addPattern('capture', 'slider')}>
                  <Plus /> Slider
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCapture([leaper([{ x: -1, y: -1 }, { x: 1, y: -1 }])])}
                >
                  <Wand2 /> Pawn
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rules &amp; restrictions</CardTitle>
            <CardDescription>What this piece can and cannot do.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {flags.map((f) => (
              <label
                key={f.key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              >
                <Checkbox
                  checked={piece.flags[f.key]}
                  onCheckedChange={(v) => set({ flags: { ...piece.flags, [f.key]: v === true } })}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium leading-none">{f.label}</span>
                  <span className="block text-xs text-muted-foreground">{f.hint}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Special effects</CardTitle>
            <CardDescription>Things that happen when this piece lands a move or capture.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {piece.effects.map((eff, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{eff.kind}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEffect(i, null)}>
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </div>
                {eff.kind === 'explosion' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs">Radius</Label>
                      <Slider
                        min={1}
                        max={3}
                        step={1}
                        value={[eff.radius]}
                        onValueChange={([v]) => setEffect(i, { kind: 'explosion', radius: v })}
                        className="max-w-40"
                      />
                      <span className="font-mono text-xs">{eff.radius}</span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Destroys every enemy piece within the radius. The mover's own team is unharmed.
                    </p>
                  </div>
                )}
                {eff.kind === 'spawn' && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Spawns</Label>
                      <Select
                        value={eff.pieceTypeId}
                        onValueChange={(v) =>
                          setEffect(i, { kind: 'spawn', pieceTypeId: v, offset: eff.offset })
                        }
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue placeholder="Choose piece" />
                        </SelectTrigger>
                        <SelectContent>
                          {variant.pieceTypes.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Offset</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          className="h-8 w-16"
                          value={eff.offset.x}
                          onChange={(e) =>
                            setEffect(i, {
                              kind: 'spawn',
                              pieceTypeId: eff.pieceTypeId,
                              offset: { x: Number(e.target.value), y: eff.offset.y },
                            })
                          }
                        />
                        <Input
                          type="number"
                          className="h-8 w-16"
                          value={eff.offset.y}
                          onChange={(e) =>
                            setEffect(i, {
                              kind: 'spawn',
                              pieceTypeId: eff.pieceTypeId,
                              offset: { x: eff.offset.x, y: Number(e.target.value) },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => set({ effects: [...piece.effects, { kind: 'swap' }] })}
              >
                <Plus /> Swap on capture
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => set({ effects: [...piece.effects, { kind: 'explosion', radius: 1 }] })}
              >
                <Plus /> Explosion
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!variant.pieceTypes.length}
                onClick={() =>
                  set({
                    effects: [
                      ...piece.effects,
                      {
                        kind: 'spawn',
                        pieceTypeId: variant.pieceTypes[0].id,
                        offset: { x: 0, y: -1 },
                      },
                    ],
                  })
                }
              >
                <Plus /> Spawn piece
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Promotion</CardTitle>
            <CardDescription>
              When this piece reaches the enemy back rank it becomes another piece type. Pick one
              option, or several — the player then chooses when the piece gets there.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {variant.pieceTypes
                .filter((p) => p.id !== piece.id)
                .map((p) => {
                  const on = piece.promotion?.typeIds.includes(p.id) ?? false
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const current = piece.promotion?.typeIds ?? []
                        const typeIds = on
                          ? current.filter((id) => id !== p.id)
                          : [...current, p.id]
                        set({ promotion: typeIds.length ? { typeIds } : null })
                      }}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                        on
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'hover:bg-muted text-muted-foreground',
                      )}
                    >
                      <PieceGlyph piece={p} teamIndex={0} size={20} />
                      {p.name}
                    </button>
                  )
                })}
            </div>
            <p className="text-muted-foreground text-xs">
              {piece.promotion?.typeIds.length
                ? piece.promotion.typeIds.length > 1
                  ? 'The player picks one of these when the piece promotes.'
                  : 'This piece always promotes into the piece above.'
                : 'This piece never changes.'}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setBrush({ mode: 'piece', terrain: 'normal', team: variant.teams[0].id, typeId: piece.id })
                setMakerTab('setup')
                toast.info(`${piece.name} ready to place`)
              }}
            >
              Place on board
            </Button>
          </CardContent>
        </Card>
      </div>

      <PieceComposer
        open={composing}
        onOpenChange={setComposing}
        art={piece.art ?? []}
        onChange={(art: PieceArt) => set({ art })}
      />
    </div>
  )
}
