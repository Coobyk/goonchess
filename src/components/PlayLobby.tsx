import { useMemo, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Bomb, Check, Crown, Orbit, Search, Skull, Sparkles, Wrench } from 'lucide-react'
import { TEMPLATES } from '@/engine/templates'
import { selectLatestGame, useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import { packVariant } from '@/lib/variantCodec'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

type Template = (typeof TEMPLATES)[number]
const FEATURED = [
  { id: 'classic', icon: Crown, tone: 'cyan', label: 'The original' },
  { id: 'chaos', icon: Orbit, tone: 'violet', label: 'Portals & bombers' },
  { id: 'atomic', icon: Bomb, tone: 'coral', label: 'Every capture explodes' },
  { id: 'boss-fight', icon: Skull, tone: 'amber', label: 'One boss. Five lives.' },
] as const

/** Discovery stays out of shared rooms: changing a variant starts a new local game. */
export function PlayLobby() {
  const variant = useAppStore((s) => s.variant)
  // Template IDs survive Maker edits; only an unchanged setup is selected.
  const activeTemplate = useMemo(() => {
    const template = TEMPLATES.find((t) => t.id === variant.id)
    if (!template || !FEATURED.some((t) => t.id === template.id)) return null
    return JSON.stringify(packVariant(variant)) === JSON.stringify(packVariant(template.build()))
      ? template.id
      : null
  }, [variant])
  const playVariant = useAppStore((s) => s.playVariant)
  const setView = useAppStore((s) => s.setView)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<Template | null>(null)
  const browseTrigger = useRef<HTMLButtonElement>(null)
  const confirmationTrigger = useRef<HTMLElement | null>(null)

  const start = (template: Template, trigger: HTMLElement) => {
    // Reviewing the opening must not hide the moves in the live game.
    const game = selectLatestGame(useAppStore.getState())
    if (game.moveHistory.length > 0 && !game.winner) {
      confirmationTrigger.current = trigger
      setPending(template)
      return
    }
    playVariant(template.build())
    setBrowseOpen(false)
  }

  const matches = TEMPLATES.filter((template) =>
    `${template.name} ${template.description}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <section className="play-lobby" aria-label="Discover chess variants">
      <div className="lobby-intro">
        <div>
          <p className="eyebrow"><span className="status-dot" /> A different kind of chess club</p>
          <h1>Chess. <span>With a twist.</span></h1>
          <p className="lobby-description">Forget the usual. Play wild variants, or invent your own.</p>
        </div>
        <Button className="create-cta" size="lg" onClick={() => setView('maker')}>
          <Wrench /> Make a variant <ArrowUpRight />
        </Button>
        <Sparkles className="lobby-spark" aria-hidden="true" />
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Choose your chaos <span className="ml-2 text-xs font-normal text-muted-foreground">Find your next obsession.</span></h2>
        <Button ref={browseTrigger} variant="ghost" size="sm" className="browse-variants h-7 text-xs" onClick={() => setBrowseOpen(true)}>
          All {TEMPLATES.length} variants <ArrowRight className="size-3.5" />
        </Button>
      </div>
      <div className="variant-deck">
        {FEATURED.map(({ id, icon: Icon, tone, label }) => {
          const template = TEMPLATES.find((t) => t.id === id)!
          const active = activeTemplate === id
          return (
            <button
              type="button"
              key={id}
              className={cn('variant-tile', `variant-${tone}`, active && 'is-selected')}
              aria-pressed={active}
              onClick={(event) => start(template, event.currentTarget)}
            >
              <span className="variant-icon"><Icon className="size-5" /></span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-[13px] font-semibold">{template.name}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">{label}</span>
              </span>
              {active && <Check className="variant-check size-3.5" aria-label="Selected" />}
            </button>
          )
        })}
      </div>

      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={(event) => {
          event.preventDefault()
          browseTrigger.current?.focus()
        }}>
          <DialogHeader>
            <DialogTitle>Pick your next plot twist.</DialogTitle>
            <DialogDescription>{TEMPLATES.length} ways to play. Same game, different possibilities.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input aria-label="Search variants" placeholder="Search variants…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 pl-9" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {matches.map((template) => (
              <button type="button" key={template.id} onClick={(event) => start(template, event.currentTarget)} className="variant-result rounded-xl border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">{template.name}<ArrowUpRight className="size-3.5 text-muted-foreground" /></span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{template.description}</span>
              </button>
            ))}
          </div>
          {matches.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No variants found. Try a different search.</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent onCloseAutoFocus={(event) => {
          event.preventDefault()
          const trigger = confirmationTrigger.current
          if (trigger?.isConnected) trigger.focus()
          else browseTrigger.current?.focus()
        }}>
          <DialogHeader>
            <DialogTitle>Start {pending?.name}?</DialogTitle>
            <DialogDescription>This replaces the game in progress. Your current moves won’t be kept.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>Keep playing</Button>
            <Button onClick={() => {
              if (!pending) return
              playVariant(pending.build())
              // Catalog results disappear when a new variant starts.
              if (browseOpen) confirmationTrigger.current = browseTrigger.current
              setPending(null)
              setBrowseOpen(false)
            }}>Start new game <ArrowRight /></Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
