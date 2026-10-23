import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardType, Copy, Download, FileJson, Link2, Loader2, Upload, Users } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { captchaMessage } from '@/lib/captcha'
import { variantToHash } from '@/lib/encoding'
import { fromFen, toFen } from '@/lib/fen'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Textarea } from './ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Label } from './ui/label'

export function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const variant = useAppStore((s) => s.variant)
  const game = useAppStore((s) => s.game)
  const exportVariant = useAppStore((s) => s.exportVariant)
  const importVariant = useAppStore((s) => s.importVariant)
  const loadVariantIntoMaker = useAppStore((s) => s.loadVariantIntoMaker)
  const startOnlineGame = useAppStore((s) => s.startOnlineGame)
  const [importText, setImportText] = useState('')
  const [fenText, setFenText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const twoTeams = variant.teams.length === 2

  const json = exportVariant()
  const url = useMemo(
    () => `${window.location.origin}${window.location.pathname}${variantToHash(variant)}`,
    [variant],
  )

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Clipboard unavailable — select the text and copy manually.')
    }
  }

  const createGame = async () => {
    setPlayError(null)
    setCreating(true)
    try {
      await startOnlineGame()
      toast.success('Game link ready — send it to whoever you want to play.')
      onOpenChange(false)
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'unknown'
      setPlayError(
        code === 'needs_two_teams'
          ? 'Online games need exactly two teams. This variant has ' + variant.teams.length + '.'
          : captchaMessage(code),
      )
    } finally {
      setCreating(false)
    }
  }

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `${variant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'variant'}.json`
    a.click()
    URL.revokeObjectURL(href)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="size-4" /> Share &amp; import
          </DialogTitle>
          <DialogDescription>
            Links pack the whole variant into a compressed, URL-safe code. JSON is handy for backups
            and hand-editing.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link">
          <TabsList className="w-full">
            <TabsTrigger value="online">
              <Users /> Play online
            </TabsTrigger>
            <TabsTrigger value="link">
              <Link2 /> Link
            </TabsTrigger>
            <TabsTrigger value="json">
              <FileJson /> JSON
            </TabsTrigger>
            <TabsTrigger value="import">
              <Upload /> Import
            </TabsTrigger>
            <TabsTrigger value="fen">
              <ClipboardType /> FEN
            </TabsTrigger>
          </TabsList>

          <TabsContent value="online" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Play this variant live against whoever opens the link. No account: the link is the
              invitation, and this browser keeps its side of the board.
            </p>
            <p className="text-sm text-muted-foreground">
              The first person to open it becomes the opponent; everyone after that can watch.
            </p>
            {playError && <p className="text-destructive text-sm">{playError}</p>}
            <Button onClick={createGame} disabled={creating || !twoTeams}>
              {creating ? <Loader2 className="animate-spin" /> : <Users />}
              {creating ? 'Making a link…' : 'Create a game link'}
            </Button>
            <p className="text-muted-foreground text-xs">
              A short proof of work runs in this tab before the link is made — invisible, takes
              about a tenth of a second, and keeps a script from creating games by the thousand.
            </p>
          </TabsContent>

          <TabsContent value="link" className="space-y-3 pt-3">
            <Label>Shareable link</Label>
            <Textarea readOnly value={url} className="h-24 font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => copy(url, 'Link')}>
                <Copy /> Copy link
              </Button>
              <Button variant="outline" onClick={() => copy(json, 'JSON')}>
                <Copy /> Copy JSON
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone opening the link gets this exact variant. The whole thing is packed and
              deflated into <span className="font-mono">{url.length}</span> characters.
            </p>
          </TabsContent>

          <TabsContent value="json" className="space-y-3 pt-3">
            <Label>Variant JSON</Label>
            <Textarea readOnly value={json} className="h-64 font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => copy(json, 'JSON')}>
                <Copy /> Copy JSON
              </Button>
              <Button variant="outline" onClick={download}>
                <Download /> Download file
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-3 pt-3">
            <Label htmlFor="import-json">Paste variant JSON</Label>
            <Textarea
              id="import-json"
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value)
                setError(null)
              }}
              placeholder='{ "schema": 1, "name": "My variant", ... }'
              className="h-64 font-mono text-xs"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              onClick={() => {
                const result = importVariant(importText)
                if (!result.ok) {
                  setError(result.error ?? 'Import failed')
                  return
                }
                toast.success('Variant imported')
                setImportText('')
                onOpenChange(false)
              }}
            >
              <Upload /> Import variant
            </Button>
          </TabsContent>
          <TabsContent value="fen" className="space-y-3 pt-3">
            <Label htmlFor="fen-input">Paste a FEN</Label>
            <Textarea
              id="fen-input"
              value={fenText}
              onChange={(e) => {
                setFenText(e.target.value)
                setError(null)
              }}
              placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              className="h-24 font-mono text-xs"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  const result = fromFen(fenText)
                  if (!result) {
                    setError('That does not look like a FEN.')
                    return
                  }
                  loadVariantIntoMaker(result.variant)
                  toast.success('Position imported')
                  setFenText('')
                  onOpenChange(false)
                }}
              >
                <Upload /> Import position
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const fen = toFen(game)
                  if (!fen) {
                    setError('This variant cannot be written as FEN.')
                    return
                  }
                  setFenText(fen)
                }}
              >
                Use the current position
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              A FEN describes a standard chess position. It is imported as a classic variant that you
              can then edit in the Maker.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
