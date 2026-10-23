import { useEffect } from 'react'
import { LayoutGrid, ListTree, Redo2, Settings2, Swords, Undo2 } from 'lucide-react'
import { useAppStore, type MakerTab } from '@/store/useAppStore'
import { MakerBoard } from './MakerBoard'
import { BoardTab } from './BoardTab'
import { PiecesTab } from './PiecesTab'
import { SetupTab } from './SetupTab'
import { RulesTab } from './RulesTab'
import { Button } from './ui/button'
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-0">
      <Tabs
        value={makerTab}
        onValueChange={(v) => setMakerTab(v as MakerTab)}
        className="min-w-0 gap-4 xl:pr-8"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div className="min-w-0">
            <p className="label-mono">Maker</p>
            <h1 className="font-display mt-1 truncate text-xl font-semibold tracking-[-0.02em]">
              {variant.name}
            </h1>
          </div>
          <div className="flex items-center gap-1">
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
        </header>

        <TabsList className="grid w-full grid-cols-2 sm:flex sm:justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="min-w-0 justify-start px-3 sm:flex-none sm:justify-center">
              <t.icon />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="board" className="max-w-[900px]">
          <BoardTab />
        </TabsContent>
        <TabsContent value="pieces" className="max-w-[900px]">
          <PiecesTab />
        </TabsContent>
        <TabsContent value="setup" className="max-w-[900px]">
          <SetupTab />
        </TabsContent>
        <TabsContent value="rules" className="max-w-[900px]">
          <RulesTab />
        </TabsContent>
      </Tabs>

      <aside className="h-fit xl:sticky xl:top-20 xl:border-l xl:border-border xl:pl-7">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="label-mono">Preview</h2>
          <span className="text-muted-foreground/70 font-mono text-[10px]">
            {variant.board.width}×{variant.board.height}
          </span>
        </div>
        <MakerBoard interactive={makerTab === 'board' || makerTab === 'setup'} />
        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
          <span className="text-muted-foreground truncate text-xs">{brushLabel}</span>
          <Button size="sm" variant="ghost" onClick={() => setMakerTab('rules')}>
            Rules
          </Button>
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[1px] border bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgba(0,0,0,0.3)_3px_5px)]" />
            wall
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[1px] bg-black" />
            void
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[1px] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.9),rgba(56,189,248,0.15))]" />
            portal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-[1px] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.9),rgba(56,189,248,0.15))]" />
            one-way
          </span>
        </div>
      </aside>
    </div>
  )
}
