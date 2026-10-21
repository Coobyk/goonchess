import { useEffect } from 'react'
import { LayoutGrid, ListTree, Redo2, Settings2, Swords, Undo2 } from 'lucide-react'
import { useAppStore, type MakerTab } from '@/store/useAppStore'
import { MakerBoard } from './MakerBoard'
import { BoardTab } from './BoardTab'
import { PiecesTab } from './PiecesTab'
import { SetupTab } from './SetupTab'
import { RulesTab } from './RulesTab'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

const TABS: { id: MakerTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'pieces', label: 'Pieces', icon: ListTree },
  { id: 'setup', label: 'Setup', icon: Settings2 },
  { id: 'rules', label: 'Rules', icon: Swords },
]

export function MakerView() {
  const makerTab = useAppStore((s) => s.makerTab)
  const setMakerTab = useAppStore((s) => s.setMakerTab)
  const variant = useAppStore((s) => s.variant)
  const undoVariant = useAppStore((s) => s.undoVariant)
  const redoVariant = useAppStore((s) => s.redoVariant)
  const canUndoVariant = useAppStore((s) => s.variantHistory.length > 0)
  const canRedoVariant = useAppStore((s) => s.variantFuture.length > 0)
  const brush = useAppStore((s) => s.brush)
  const setBrush = useAppStore((s) => s.setBrush)
  const portalPending = useAppStore((s) => s.portalPending)

  useEffect(() => {
    const first = variant.pieceTypes[0]
    if (!first) return
    if (makerTab === 'setup' && brush.mode === 'terrain') {
      setBrush({ mode: 'piece', terrain: brush.terrain, team: brush.team, typeId: first.id })
    }
    if (makerTab === 'board' && brush.mode === 'piece') {
      setBrush({ ...brush, mode: 'terrain' })
    }
    // Only react to tab changes; brush reads are intentional one-shot syncs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makerTab])

  const brushLabel = (() => {
    if (brush.mode === 'erase') return 'Eraser'
    if (brush.mode === 'piece') {
      const pt = variant.pieceTypes.find((p) => p.id === brush.typeId)
      const team = variant.teams.find((t) => t.id === brush.team)
      return pt ? `Placing ${team?.name} ${pt.name}` : 'Pick a piece'
    }
    if (brush.terrain === 'portal' || brush.terrain === 'oneway') {
      return portalPending ? 'Click the destination square' : `Linking a ${brush.terrain}`
    }
    return `Painting ${brush.terrain}`
  })()

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
      <Tabs
        value={makerTab}
        onValueChange={(v) => setMakerTab(v as MakerTab)}
        className="min-w-0"
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-none px-3">
              <t.icon />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* The undo and redo sit on their own row: in the tab strip they
            pushed the whole page sideways on a narrow screen. */}
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Undo the last change"
            disabled={!canUndoVariant}
            onClick={undoVariant}
          >
            <Undo2 /> Undo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Redo the last undone change"
            disabled={!canRedoVariant}
            onClick={redoVariant}
          >
            <Redo2 /> Redo
          </Button>
        </div>
        <TabsContent value="board" className="mt-4">
          <BoardTab />
        </TabsContent>
        <TabsContent value="pieces" className="mt-4">
          <PiecesTab />
        </TabsContent>
        <TabsContent value="setup" className="mt-4">
          <SetupTab />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <RulesTab />
        </TabsContent>
      </Tabs>

      <aside className="h-fit space-y-4 xl:sticky xl:top-20">
        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{variant.name}</span>
              <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                {variant.board.width}×{variant.board.height}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            <MakerBoard interactive={makerTab === 'board' || makerTab === 'setup'} />
            <Separator />
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{brushLabel}</span>
              <Button size="sm" variant="ghost" onClick={() => setMakerTab('rules')}>
                Rules
              </Button>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block size-3 rounded-sm border bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgba(0,0,0,0.3)_3px_5px)]" />
                wall
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-3 rounded-sm bg-black" /> void
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-3 rounded-sm bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.9),rgba(56,189,248,0.15))]" />
                portal
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-3 rounded-sm bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.9),rgba(56,189,248,0.15))] font-mono text-[8px] text-cyan-100">
                  1→
                </span>
                one-way
              </span>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
