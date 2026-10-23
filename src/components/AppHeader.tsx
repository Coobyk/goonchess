import { useState, type MouseEvent } from 'react'
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

  /**
   * The logo is home: the root, with no game code and no variant hash left on
   * the address. Modified clicks are left to the browser, so new-tab works.
   */
  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    const store = useAppStore.getState()
    store.applyRoute({ view: 'play', makerTab: 'board', gameCode: null })
    // Home is a fresh board, not the position that was being played.
    store.resetGame()
    window.history.pushState(null, '', '/')
    window.scrollTo({ top: 0 })
  }
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
      <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2 px-3 sm:px-4 lg:px-8">
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <a
              href="/"
              aria-label="Goonchess home"
              onClick={goHome}
              className="grid size-8 shrink-0 place-items-center rounded-[3px] border border-white/10 bg-[#141416] transition-colors hover:border-white/25"
            >
              <img src="/logo.svg" alt="" className="size-6" />
            </a>
            <div className="hidden min-w-0 sm:block">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-semibold tracking-[-0.02em]">
                  Goonchess
                </span>
                <span className="text-muted-foreground/50 hidden font-mono text-[10px] lg:inline">
                  / {variant.name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:ml-4 lg:mx-auto">
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

          <div className="ml-auto flex shrink-0 items-center gap-0.5 lg:ml-0 lg:border-l lg:border-border/70 lg:pl-2">
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
