import { useState } from 'react'
import { ArrowDown, ArrowUpRight, Check, Search, X } from 'lucide-react'
import { TEMPLATES } from '@/engine/templates'
import { useAppStore } from '@/store/useAppStore'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Input } from './ui/input'

const QUICK_PICKS = ['classic', 'chess960', 'atomic', 'crazyhouse']

export function ClubWelcome() {
  const variant = useAppStore((s) => s.variant)
  const online = useAppStore((s) => s.online)
  const playVariant = useAppStore((s) => s.playVariant)
  const setView = useAppStore((s) => s.setView)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [query, setQuery] = useState('')
  const templates = TEMPLATES.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
      {!online && (
        <section className="club-intro" aria-labelledby="club-title">
          <div>
            <p className="club-eyebrow"><span /> A chess club for the curious</p>
            <h1 id="club-title">Old game.<br /><em>New mischief.</em></h1>
          </div>
          <div className="club-intro-note">
            <span className="club-asterisk" aria-hidden="true">✳</span>
            <p>Some rules are worth breaking.<br />Play a different kind of chess, or invent your own.</p>
            <button type="button" className="club-text-link" onClick={() => setView('maker')}>
              Make something strange <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="club-edition" aria-hidden="true">INDEPENDENT THINKING<br />SINCE MOVE ONE</div>
        </section>
      )}

      <section className="club-table-heading" aria-label="Choose a chess variant">
        <div className="club-table-label"><span className="club-section-number">01</span><h2>Your table</h2></div>
        {!online && (
          <div className="club-quick-picks">
            {TEMPLATES.filter((t) => QUICK_PICKS.includes(t.id)).map((template) => (
              <button
                type="button"
                key={template.id}
                className={variant.id === template.id ? 'is-current' : ''}
                aria-pressed={variant.id === template.id}
                onClick={() => playVariant(template.build())}
              >
                {variant.id === template.id && <span className="club-current-dot" />}
                {template.name === 'Classic Chess' ? 'Classic' : template.name}
              </button>
            ))}
            <DialogTrigger asChild>
              <button type="button" className="club-browse" onClick={() => setQuery('')}>
                All variants <ArrowDown size={13} />
              </button>
            </DialogTrigger>
          </div>
        )}
      </section>

        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <p className="club-eyebrow">The collection / {TEMPLATES.length} ways to play</p>
            <DialogTitle className="club-dialog-title">Find your next obsession.</DialogTitle>
            <DialogDescription>Familiar pieces. Entirely different possibilities. Picking a variant starts a fresh game.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input aria-label="Search variants" placeholder="Find a variant…" className="h-10 pl-9 pr-10" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <Button variant="ghost" size="icon-sm" aria-label="Clear search" className="absolute right-1 top-1" onClick={() => setQuery('')}><X /></Button>}
          </div>
          <div className="club-variant-grid">
            {templates.map((template, index) => (
              <button type="button" key={template.id} onClick={() => { playVariant(template.build()); setBrowseOpen(false) }}>
                <span className="club-eyebrow">{String(index + 1).padStart(2, '0')}</span>
                <span className="club-variant-name">{template.name}{variant.id === template.id ? <Check size={17} /> : <ArrowUpRight size={17} />}</span>
                <span className="text-muted-foreground text-xs">{template.description}</span>
              </button>
            ))}
          </div>
          {templates.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No variants found. Try a different search.</p>}
        </DialogContent>
    </Dialog>
  )
}

export function ClubWorkshop() {
  const online = useAppStore((s) => s.online)
  const setView = useAppStore((s) => s.setView)
  const playVariant = useAppStore((s) => s.playVariant)
  if (online) return null

  const openGame = (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id)
    if (!template) return
    playVariant(template.build())
    const table = document.getElementById('play-table')
    table?.focus({ preventScroll: true })
    table?.scrollIntoView({ block: 'start' })
  }

  const openWorkshop = () => {
    setView('maker')
    document.getElementById('main-content')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }

  return (
    <section className="club-workshop" aria-labelledby="workshop-title">
      <div className="club-workshop-heading"><span className="club-section-number">02</span><h2 id="workshop-title">A little less ordinary.</h2><span>OFF THE BEATEN BOARD</span></div>
      <div className="club-discovery-grid">
        <button type="button" onClick={() => openGame('horses')}>
          <span className="club-discovery-art club-horses" aria-hidden="true">♞♘</span>
          <span className="club-eyebrow">A different kind of horsepower</span>
          <span className="club-discovery-title">Only Horses <ArrowUpRight /></span>
          <span>Every piece jumps. Nothing goes to plan.</span>
        </button>
        <button type="button" onClick={() => openGame('king-of-the-hill')}>
          <span className="club-discovery-art club-hill" aria-hidden="true">♚</span>
          <span className="club-eyebrow">Take the scenic route</span>
          <span className="club-discovery-title">King of the Hill <ArrowUpRight /></span>
          <span>The middle of the board is the finish line.</span>
        </button>
        <button type="button" className="club-create-card" onClick={openWorkshop}>
          <span className="club-discovery-art" aria-hidden="true">✳</span>
          <span className="club-eyebrow">No rulebook? No problem.</span>
          <span className="club-discovery-title">Your next bad idea <ArrowUpRight /></span>
          <span>New pieces. Strange boards. Your rules.</span>
        </button>
      </div>
    </section>
  )
}
