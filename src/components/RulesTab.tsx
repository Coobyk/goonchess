import { RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'

const WIN_CONDITIONS: { kind: 'checkmate' | 'kingCapture' | 'elimination' | 'points'; label: string; hint: string }[] = [
  { kind: 'checkmate', label: 'Checkmate', hint: 'Win by trapping the opponent royal with no legal moves.' },
  { kind: 'kingCapture', label: 'Capture the royal', hint: 'Win the instant a royal piece is taken.' },
  { kind: 'elimination', label: 'Elimination', hint: 'Win by wiping out every enemy piece.' },
  { kind: 'points', label: 'Point target', hint: 'Win by capturing material worth enough points.' },
]

export function RulesTab() {
  const variant = useAppStore((s) => s.variant)
  const updateVariant = useAppStore((s) => s.updateVariant)
  const updateTeam = useAppStore((s) => s.updateTeam)
  const toggleWinCondition = useAppStore((s) => s.toggleWinCondition)
  const setPointThreshold = useAppStore((s) => s.setPointThreshold)
  const resetGame = useAppStore((s) => s.resetGame)

  const points = variant.winConditions.find((w) => w.kind === 'points')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variant identity</CardTitle>
          <CardDescription>Shown in the library and when you share a link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="variant-name">Name</Label>
            <Input
              id="variant-name"
              value={variant.name}
              onChange={(e) => updateVariant((v) => ({ ...v, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variant-desc">Description</Label>
            <Input
              id="variant-desc"
              value={variant.description}
              onChange={(e) => updateVariant((v) => ({ ...v, description: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Teams</CardTitle>
          <CardDescription>Names, colors and the direction each side advances.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {variant.teams.map((team) => (
            <div key={team.id} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={team.name} onChange={(e) => updateTeam(team.id, { name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <input
                  type="color"
                  value={team.color}
                  onChange={(e) => updateTeam(team.id, { color: e.target.value })}
                  className="h-9 w-16 cursor-pointer rounded-md border bg-transparent"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Advances</Label>
                <Select
                  value={team.forward}
                  onValueChange={(v) => updateTeam(team.id, { forward: v as 'up' | 'down' })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="up">Up</SelectItem>
                    <SelectItem value="down">Down</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Win conditions</CardTitle>
          <CardDescription>Any enabled condition can end the game.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {WIN_CONDITIONS.map((wc) => {
            const checked = variant.winConditions.some((w) => w.kind === wc.kind)
            return (
              <label
                key={wc.kind}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleWinCondition(wc.kind)} />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium leading-none">{wc.label}</span>
                  <span className="block text-xs text-muted-foreground">{wc.hint}</span>
                </span>
              </label>
            )
          })}
          {points && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Label htmlFor="points-threshold">Points to win</Label>
              <Input
                id="points-threshold"
                type="number"
                min={1}
                className="w-24"
                value={points.threshold ?? 20}
                onChange={(e) => setPointThreshold(Number(e.target.value))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{variant.board.width} × {variant.board.height}</Badge>
            <Badge variant="secondary">{variant.pieceTypes.length} piece types</Badge>
            <Badge variant="secondary">{variant.setup.length} pieces placed</Badge>
            <Badge variant="secondary">
              {variant.winConditions.length} win condition{variant.winConditions.length === 1 ? '' : 's'}
            </Badge>
          </div>
          <Separator />
          <Button size="sm" variant="outline" onClick={resetGame}>
            <RotateCcw /> Restart game from this setup
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
