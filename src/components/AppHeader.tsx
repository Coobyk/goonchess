import { useState } from 'react'
import { toast } from 'sonner'
import {
  BookOpen,
  ChevronDown,
  FileJson,
  Library,
  Menu,
  Plus,
  Sparkles,
  Swords,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react'
import { TEMPLATES, blankVariant } from '@/engine/templates'
import { useAppStore } from '@/store/useAppStore'
import { SOUND_PACKS, findPack } from '@/lib/soundPacks'
import { playSound } from '@/lib/sound'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'
import { cn } from '@/lib/utils'
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
  const playVariant = useAppStore((s) => s.playVariant)
  const library = useAppStore((s) => s.library)
  const variant = useAppStore((s) => s.variant)
  const soundEnabled = useAppStore((s) => s.soundEnabled)
  const setSoundEnabled = useAppStore((s) => s.setSoundEnabled)
  const soundPack = useAppStore((s) => s.soundPack)
  const setSoundPack = useAppStore((s) => s.setSoundPack)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const loadTemplate = (build: () => ReturnType<typeof blankVariant>, name: string) => {
    loadVariantIntoMaker(build())
    setMakerTab('board')
    setView('maker')
    toast.success(`${name} loaded`)
  }

  /** A template opens in the Play view, ready to be played. */
  const playTemplate = (build: () => ReturnType<typeof blankVariant>, name: string) => {
    playVariant(build())
    toast.success(`${name} loaded`)
  }

  /** The templates and the saved variants, all in one list. */
  const libraryItems = (
    <>
      <DropdownMenuLabel>Templates</DropdownMenuLabel>
      {TEMPLATES.map((t) => (
        <DropdownMenuItem key={t.id} onClick={() => playTemplate(t.build, t.name)}>
          <Sparkles className="text-muted-foreground" />
          <span className="flex-1">{t.name}</span>
          <span className="text-muted-foreground text-[10px]">{t.description}</span>
        </DropdownMenuItem>
      ))}
      {library.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Your variants</DropdownMenuLabel>
          {library.map((entry) => (
            <DropdownMenuItem key={entry.id} onClick={() => playVariant(entry.variant)}>
              <Library className="text-muted-foreground" />
              <span className="flex-1">{entry.name}</span>
            </DropdownMenuItem>
          ))}
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
        <Library className="text-muted-foreground" />
        Manage the library
      </DropdownMenuItem>
    </>
  )

  return (
    <>
      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center gap-1.5 px-3 sm:px-4 lg:px-8">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-gradient-to-br from-zinc-800 to-zinc-950 shadow-sm">
              <img src="/logo.svg" alt="Goonchess" className="size-7" />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold tracking-tight">Goonchess</span>
              </div>
              <p className="text-muted-foreground hidden max-w-56 truncate text-xs lg:block">
                {variant.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 lg:mx-auto">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => {
                if (v) setView(v as 'play' | 'maker' | 'rulebook')
              }}
            >
              <ToggleGroupItem value="play" aria-label="Play" className="gap-1.5 px-3 py-1.5">
                <Swords /> <span className="hidden sm:inline">Play</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="maker" aria-label="Maker" className="gap-1.5 px-3 py-1.5">
                <Wrench /> <span className="hidden sm:inline">Maker</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="rulebook" aria-label="Learn" className="gap-1.5 px-3 py-1.5">
                <BookOpen /> <span className="hidden sm:inline">Learn</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
            <div className="hidden items-center gap-1 lg:flex">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5" aria-label="New variant">
                    <Plus />
                    <span className="hidden md:inline">New</span>
                    <ChevronDown className="opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>New</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => loadTemplate(() => blankVariant(8, 8), 'Blank board')}>
                    <Plus className="text-muted-foreground" />
                    Blank 8×8 board
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => loadTemplate(() => blankVariant(12, 12), 'Blank 12×12')}>
                    <Plus className="text-muted-foreground" />
                    Blank 12×12 board
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
                    <Library className="text-muted-foreground" />
                    Save the current variant
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setMakerTab('board')
                      setView('maker')
                    }}
                  >
                    <Wrench className="text-muted-foreground" />
                    Open the Maker
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5" aria-label="Library">
                    <Library />
                    <span className="hidden md:inline">Library</span>
                    <ChevronDown className="opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {libraryItems}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" className="gap-1.5" aria-label="Share and import" onClick={() => setShareOpen(true)}>
                <FileJson />
                <span className="hidden md:inline">Share</span>
              </Button>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Sound settings"
                  title="Sound settings"
                >
                  {soundEnabled ? <Volume2 /> : <VolumeX />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Sounds</p>
                      <p className="text-muted-foreground text-xs">
                        {soundEnabled ? 'On' : 'Muted'}
                      </p>
                    </div>
                    <Switch
                      aria-label="Enable sounds"
                      checked={soundEnabled}
                      onCheckedChange={setSoundEnabled}
                    />
                  </div>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Sound pack</p>
                    {SOUND_PACKS.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => {
                          setSoundPack(pack.id)
                          playSound('move')
                        }}
                        className={cn(
                          'flex w-full flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                          soundPack === pack.id
                            ? 'border-primary bg-primary/10'
                            : 'hover:bg-muted',
                        )}
                      >
                        <span className="text-sm font-medium">{pack.name}</span>
                        <span className="text-muted-foreground text-xs">{pack.description}</span>
                      </button>
                    ))}
                    <p className="text-muted-foreground pt-1 text-[11px]">
                      {findPack(soundPack).credit}
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="More actions">
                  <Menu />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>New</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => loadTemplate(() => blankVariant(8, 8), 'Blank board')}>
                  <Plus className="text-muted-foreground" />
                  Blank 8×8 board
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => loadTemplate(() => blankVariant(12, 12), 'Blank 12×12')}>
                  <Plus className="text-muted-foreground" />
                  Blank 12×12 board
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setMakerTab('board')
                    setView('maker')
                  }}
                >
                  <Wrench className="text-muted-foreground" />
                  Open the Maker
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {libraryItems}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShareOpen(true)}>
                  <FileJson className="text-muted-foreground" />
                  Share &amp; import
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <LibraryDialog open={libraryOpen} onOpenChange={setLibraryOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </>
  )
}
