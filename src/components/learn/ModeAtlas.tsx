import { useMemo, useState } from 'react'
import { BookOpen, Play, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { TEMPLATES } from '@/engine/templates'
import type { Terrain, Variant, VariantRule, WinConditionKind } from '@/engine/types'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { tileBackground } from '../BoardShell'
import { PieceGlyph } from '../PieceGlyph'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'

type TemplateDefinition = (typeof TEMPLATES)[number]
type ModeCategory = 'classic' | 'twist' | 'custom'
type FilterId = 'all' | ModeCategory | 'saved'

interface AtlasItem {
  key: string
  id: string
  name: string
  description: string
  variant: Variant
  category: ModeCategory | 'saved'
  template?: TemplateDefinition
  saved: boolean
  updatedAt?: number
  searchText: string
}

const RULE_LABELS: Record<VariantRule, string> = {
  atomic: 'Atomic',
  crazyhouse: 'Pockets',
  forcedCapture: 'Forced captures',
  noCheck: 'No checks',
  noCastle: 'No castling',
  predator: 'Predator',
  loyalty: 'Loyalty',
  hypergamy: 'Hypergamy',
  spinning: 'Spinning',
  turning: 'Turning',
}

const WIN_LABELS: Record<WinConditionKind, string> = {
  checkmate: 'Checkmate',
  kingCapture: 'Royal capture',
  elimination: 'Elimination',
  points: 'Point target',
  center: 'King of the Hill',
  threeCheck: 'Three checks',
  antichess: 'Lose all',
  race: 'Race',
  predator: 'Slay the Predator',
}

const TERRAIN_LABELS: Record<Terrain, string> = {
  normal: 'Open ground',
  wall: 'Walls',
  void: 'Void squares',
  portal: 'Portals',
  oneway: 'One-way portals',
}

const CATEGORY_LABELS: Record<ModeCategory, string> = {
  classic: 'Classic & Variants',
  twist: 'Twist Modes',
  custom: 'Custom & Chaos',
}

const CLASSIC_TEMPLATE_IDS = new Set([
  'classic',
  'mini',
  'chess960',
  'king-of-the-hill',
  'three-check',
  'antichess',
  'horde',
  'racing-kings',
  'crazyhouse',
  'atomic',
])

const TWIST_TEMPLATE_IDS = new Set([
  'turn',
  'spinning',
  'loyalty',
  'hypergamy',
  'predator',
  'random',
])

const CUSTOM_TEMPLATE_IDS = new Set(['boss-fight', 'horses', 'chaos', 'bomb-queen'])

function terrainTags(variant: Variant) {
  const present = new Set<Terrain>()
  for (const row of variant.board.tiles) {
    for (const tile of row) {
      if (tile.terrain !== 'normal') present.add(tile.terrain)
    }
  }
  return (['portal', 'oneway', 'wall', 'void'] as Terrain[])
    .filter((terrain) => present.has(terrain))
    .map((terrain) => TERRAIN_LABELS[terrain])
}

function featureChips(variant: Variant) {
  const chips: string[] = []
  const add = (label: string | undefined) => {
    if (label && !chips.includes(label)) chips.push(label)
  }

  for (const rule of variant.rules ?? []) add(RULE_LABELS[rule])
  for (const condition of variant.winConditions) {
    if (condition.kind === 'checkmate' || condition.kind === 'kingCapture') continue
    add(
      condition.kind === 'points' && condition.threshold
        ? `${condition.threshold}-pt target`
        : WIN_LABELS[condition.kind],
    )
  }
  for (const terrain of terrainTags(variant)) add(terrain)

  if (variant.pieceTypes.some((piece) => piece.effects.some((effect) => effect.kind === 'explosion'))) {
    add('Explosions')
  }
  if (variant.pieceTypes.some((piece) => piece.effects.some((effect) => effect.kind === 'swap'))) {
    add('Swaps')
  }
  if (variant.pieceTypes.some((piece) => piece.effects.some((effect) => effect.kind === 'spawn'))) {
    add('Spawns')
  }
  if (
    variant.pieceTypes.some(
      (piece) => piece.presentation === 'boss' || (piece.lives ?? 1) > 1,
    )
  ) {
    add('Boss lives')
  }
  if (variant.pieceTypes.some((piece) => piece.flags.random)) add('Random pieces')
  if (variant.pieceTypes.some((piece) => piece.flags.dice)) add('Dice')
  if (variant.pieceTypes.some((piece) => piece.flags.uncapturable)) add('Uncapturable pieces')
  if (variant.winConditions.some((condition) => condition.kind === 'checkmate')) add('Checkmate')
  if (variant.winConditions.some((condition) => condition.kind === 'kingCapture')) add('Royal capture')

  return chips.slice(0, 4)
}

function classifyTemplate(template: TemplateDefinition, sample: Variant): ModeCategory {
  if (CLASSIC_TEMPLATE_IDS.has(template.id)) return 'classic'
  if (TWIST_TEMPLATE_IDS.has(template.id)) return 'twist'
  if (CUSTOM_TEMPLATE_IDS.has(template.id)) return 'custom'

  const specialTerrain = sample.board.tiles.some((row) =>
    row.some((tile) => tile.terrain !== 'normal'),
  )
  const specialPieces = sample.pieceTypes.some(
    (piece) =>
      piece.effects.length > 0 ||
      piece.presentation === 'boss' ||
      (piece.lives ?? 1) > 1,
  )
  if (sample.board.width !== 8 || sample.board.height !== 8 || specialTerrain || specialPieces) {
    return 'custom'
  }
  if (
    (sample.rules?.length ?? 0) > 0 ||
    sample.pieceTypes.some(
      (piece) => piece.flags.random || piece.flags.dice || piece.flags.predator,
    )
  ) {
    return 'twist'
  }
  return 'classic'
}

function buildSearchText(name: string, description: string, variant: Variant) {
  const parts = [name, description, variant.name, variant.description]
  for (const rule of variant.rules ?? []) parts.push(rule, RULE_LABELS[rule])
  for (const condition of variant.winConditions) {
    parts.push(condition.kind, WIN_LABELS[condition.kind])
  }
  parts.push(...terrainTags(variant), ...featureChips(variant))
  return parts.filter(Boolean).join(' ').toLowerCase()
}

function showcasePieces(variant: Variant) {
  const standardNames = new Set(['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'])
  return variant.pieceTypes
    .map((piece, index) => {
      let score = Math.min(piece.value, 30) / 10
      if (piece.presentation === 'boss') score += 140
      if (piece.flags.predator) score += 125
      if (piece.flags.random) score += 115
      if (piece.flags.dice) score += 110
      if (piece.flags.royal) score += 90
      if (piece.effects.length) score += 75
      if ((piece.lives ?? 1) > 1) score += 70
      if (piece.icon === 'custom') score += 45
      if (piece.images?.some(Boolean)) score += 40
      if (piece.flags.uncapturable) score += 35
      if (!standardNames.has(piece.name)) score += 30
      if (piece.promotion) score += 12
      return { piece, index, score }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 6)
    .map(({ piece }) => piece)
}

function teamIndexForPiece(variant: Variant, typeId: string) {
  const setupPiece = variant.setup.find((piece) => piece.typeId === typeId)
  return Math.max(0, variant.teams.findIndex((team) => team.id === setupPiece?.team))
}

function PieceShowcase({ variant }: { variant: Variant }) {
  const pieces = showcasePieces(variant)
  return (
    <div className="flex items-center gap-1 overflow-hidden rounded-lg border bg-muted/20 p-1">
      {pieces.map((piece, index) => (
        <span
          key={piece.id}
          title={piece.name}
          className="grid size-10 shrink-0 place-items-center rounded-sm"
          style={{ backgroundColor: tileBackground(index, 0) }}
        >
          <PieceGlyph
            piece={piece}
            teamIndex={teamIndexForPiece(variant, piece.id)}
            size={30}
          />
        </span>
      ))}
      {variant.pieceTypes.length > pieces.length && (
        <span className="text-muted-foreground ml-auto pr-1 font-mono text-[10px]">
          +{variant.pieceTypes.length - pieces.length}
        </span>
      )}
    </div>
  )
}

const TEMPLATE_METADATA = TEMPLATES.map((template) => {
  const sample = template.build()
  return { template, sample, category: classifyTemplate(template, sample) }
})

const TEMPLATE_ITEMS: AtlasItem[] = TEMPLATE_METADATA.map(({ template, sample, category }) => {
  const description = sample.description || template.description
  return {
    key: `template:${template.id}`,
    id: template.id,
    name: template.name,
    description,
    variant: sample,
    category,
    template,
    saved: false,
    searchText: buildSearchText(template.name, description, sample),
  }
})

export function ModeAtlas({ onLearnVariant }: { onLearnVariant?: () => void }) {
  const variant = useAppStore((s) => s.variant)
  const library = useAppStore((s) => s.library)
  const loadVariantIntoMaker = useAppStore((s) => s.loadVariantIntoMaker)
  const playVariant = useAppStore((s) => s.playVariant)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterId>('all')

  const savedItems = useMemo<AtlasItem[]>(
    () =>
      library.map((entry) => {
        const name = entry.name || entry.variant.name
        const description = entry.variant.description || 'A custom variant saved in this browser.'
        return {
          key: `saved:${entry.id}`,
          id: entry.variant.id,
          name,
          description,
          variant: entry.variant,
          category: 'saved' as const,
          saved: true,
          updatedAt: entry.updatedAt,
          searchText: buildSearchText(name, description, entry.variant),
        }
      }),
    [library],
  )

  const allItems = useMemo(() => [...TEMPLATE_ITEMS, ...savedItems], [savedItems])
  const effectiveFilter: FilterId =
    activeFilter === 'saved' && savedItems.length === 0 ? 'all' : activeFilter

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return allItems.filter((item) => {
      const inFilter =
        effectiveFilter === 'all' ||
        (effectiveFilter === 'saved' ? item.saved : !item.saved && item.category === effectiveFilter)
      if (!inFilter) return false
      return !query || item.searchText.includes(query)
    })
  }, [allItems, effectiveFilter, search])

  const filters: { id: FilterId; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: allItems.length },
    {
      id: 'classic',
      label: CATEGORY_LABELS.classic,
      count: TEMPLATE_ITEMS.filter((item) => item.category === 'classic').length,
    },
    {
      id: 'twist',
      label: CATEGORY_LABELS.twist,
      count: TEMPLATE_ITEMS.filter((item) => item.category === 'twist').length,
    },
    {
      id: 'custom',
      label: CATEGORY_LABELS.custom,
      count: TEMPLATE_ITEMS.filter((item) => item.category === 'custom').length,
    },
  ]
  if (savedItems.length > 0) {
    filters.push({ id: 'saved', label: 'Saved', count: savedItems.length })
  }

  const freshVariantFor = (item: AtlasItem) =>
    item.template ? item.template.build() : item.variant

  const learnVariant = (item: AtlasItem) => {
    loadVariantIntoMaker(freshVariantFor(item))
    toast.success(`${item.name} loaded`, {
      description: 'The Learn overview now uses these rules.',
    })
    onLearnVariant?.()
  }

  const playNow = (item: AtlasItem) => {
    playVariant(freshVariantFor(item))
  }

  const isCurrent = (item: AtlasItem) =>
    variant.id === item.id ||
    variant.name === item.name ||
    variant.name === item.variant.name ||
    (!!item.template && (variant.id === item.template.id || variant.name === item.template.name))

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
            <Sparkles className="size-4" /> Mode atlas
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Explore every mode</h2>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Compare boards, signature pieces and extra rules, then open a mode in Learn or jump
              straight into a game.
            </p>
          </div>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            placeholder="Search modes, rules, terrain…"
            aria-label="Search modes"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActiveFilter(filter.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              effectiveFilter === filter.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
          >
            {filter.label}
            <span className="ml-1.5 font-mono text-xs opacity-70">{filter.count}</span>
          </button>
        ))}
        <span className="text-muted-foreground ml-auto text-xs">
          {visibleItems.length} of {allItems.length} modes
        </span>
      </div>

      {visibleItems.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => {
            const current = isCurrent(item)
            const chips = featureChips(item.variant)
            return (
              <Card
                key={item.key}
                className="flex h-full flex-col gap-0 overflow-hidden py-0 transition-colors hover:border-primary/60"
              >
                <CardHeader className="px-4 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{item.name}</CardTitle>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {item.category === 'saved' ? 'Saved in this browser' : CATEGORY_LABELS[item.category]}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {current && <Badge>Current</Badge>}
                      {item.saved && <Badge variant="outline">Saved</Badge>}
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {item.variant.board.width}×{item.variant.board.height}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3">
                  <PieceShowcase variant={item.variant} />
                  <p className="text-muted-foreground line-clamp-3 text-sm leading-5">
                    {item.description}
                  </p>
                  <div className="mt-auto flex min-h-[26px] flex-wrap content-start gap-1.5">
                    {chips.map((chip) => (
                      <Badge key={chip} variant="secondary" className="font-normal">
                        {chip}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2 px-4 pb-4 pt-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => learnVariant(item)}
                  >
                    <BookOpen /> Learn rules
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => playNow(item)}
                  >
                    <Play /> Play
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No modes match that search</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Try a piece, rule, terrain or win condition name.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => {
              setSearch('')
              setActiveFilter('all')
            }}
          >
            Show everything
          </Button>
        </div>
      )}
    </div>
  )
}
