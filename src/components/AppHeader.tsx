import { useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  FileJson,
  Library,
  Plus,
  Sparkles,
  Swords,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react'
import { TEMPLATES, blankVariant } from '@/engine/templates'
import { useAppStore } from '@/store/useAppStore'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { ThemeToggle } from './ThemeToggle'
import { LibraryDialog } from './LibraryDialog'
import { ShareDialog } from './ShareDialog'

export function AppHeader() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const setMakerTab = useAppStore((s) => s.setMakerTab)
  const loadVariantIntoMaker = useAppStore((s) => s.loadVariantIntoMaker)
  const variant = useAppStore((s) => s.variant)
  const soundEnabled = useAppStore((s) => s.soundEnabled)
  const setSoundEnabled = useAppStore((s) => s.setSoundEnabled)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const loadTemplate = (build: () => ReturnType<typeof blankVariant>, name: string) => {
    loadVariantIntoMaker(build())
    setMakerTab('board')
    setView('maker')
    toast.success(`${name} loaded`)
  }

  return (
    <>
      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center gap-2 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-gradient-to-br from-zinc-800 to-zinc-950 shadow-sm">
              <img src="/pieces/cburnett/wN.svg" alt="goonchess" className="size-6" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold tracking-tight">goonchess</span>
              </div>
              <p className="text-muted-foreground hidden max-w-56 truncate text-xs lg:block">
                {variant.name}
              </p>
            </div>
          </div>

          <div className="mx-auto flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => {
                if (v) setView(v as 'play' | 'maker')
              }}
            >
              <ToggleGroupItem value="play" aria-label="Play" className="gap-1.5 px-3">
                <Swords /> <span className="hidden sm:inline">Play</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="maker" aria-label="Maker" className="gap-1.5 px-3">
                <Wrench /> <span className="hidden sm:inline">Maker</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5" aria-label="New variant">
                  <Plus />
                  <span className="hidden md:inline">New</span>
                  <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Templates</DropdownMenuLabel>
                {TEMPLATES.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => loadTemplate(t.build, t.name)}>
                    <Sparkles className="text-muted-foreground" />
                    <span className="flex-1">{t.name}</span>
                    <span className="text-muted-foreground text-[10px]">{t.description}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => loadTemplate(() => blankVariant(8, 8), 'Blank board')}
                >
                  <Plus className="text-muted-foreground" />
                  Blank 8×8
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => loadTemplate(() => blankVariant(12, 12), 'Blank 12×12')}
                >
                  <Plus className="text-muted-foreground" />
                  Blank 12×12
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" className="gap-1.5" aria-label="Library" onClick={() => setLibraryOpen(true)}>
              <Library />
              <span className="hidden md:inline">Library</span>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" aria-label="Share and import" onClick={() => setShareOpen(true)}>
              <FileJson />
              <span className="hidden md:inline">Share</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <LibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </>
  )
}
