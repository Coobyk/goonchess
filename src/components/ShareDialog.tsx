import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardType, Copy, Download, FileJson, FileText, Link2, Loader2, Upload, Users } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { captchaMessage } from '@/lib/captcha'
import { variantToHash } from '@/lib/encoding'
import { fromFen, toFen } from '@/lib/fen'
import { fromPgn, toPgn } from '@/lib/pgn'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
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
  const loadPosition = useAppStore((s) => s.loadPosition)
  const setView = useAppStore((s) => s.setView)
  const [importText, setImportText] = useState('')
  const [fenText, setFenText] = useState('')
  const [pgnText, setPgnText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pgnError, setPgnError] = useState<string | null>(null)
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
      const created = await startOnlineGame()
      // The link is the whole invitation, so it goes to the clipboard before
      // the dialog closes. A browser that refuses still has the copy button on
      // the bar above the board.
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${created.path}`)
        toast.success('Game link copied — send it to whoever you want to play.')
      } catch {
        toast.success('Game link ready — copy it from the bar above the board.')
      }
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
            <TabsTrigger value="pgn">
              <FileText /> PGN
            </TabsTrigger>
          </TabsList>

          <TabsContent value="online" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              The first person to open it becomes the opponent; everyone after that can watch.
            </p>
            {playError && <p className="text-destructive text-sm">{playError}</p>}
            <Button onClick={createGame} disabled={creating || !twoTeams}>
              {creating ? <Loader2 className="animate-spin" /> : <Users />}
              {creating ? 'Making a link…' : 'Create a game link'}
            </Button>
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
          <TabsContent value="pgn" className="space-y-3 pt-3">
            <Label htmlFor="pgn-input">Paste a PGN</Label>
            <Textarea
              id="pgn-input"
              value={pgnText}
              onChange={(e) => {
                setPgnText(e.target.value)
                setPgnError(null)
              }}
              placeholder={'[Event "Casual game"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5'}
              className="h-40 font-mono text-xs"
            />
            {pgnError && <p className="text-sm text-destructive">{pgnError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  // The game is replayed on this variant when it can be, and
                  // on classic chess when it cannot.
                  const result = fromPgn(pgnText, variant) ?? fromPgn(pgnText)
                  if (!result) {
                    setPgnError('Those moves cannot be played out as written.')
                    return
                  }
                  loadPosition(result.game)
                  setView('play')
                  toast.success('Game imported')
                  setPgnText('')
                  setPgnError(null)
                  onOpenChange(false)
                }}
              >
                <Upload /> Import game
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPgnText(toPgn(game))
                  setPgnError(null)
                }}
              >
                Use the current game
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              A PGN is a whole game written as a score sheet. It is replayed move by move — on this
              variant when the moves fit it, on classic chess otherwise — and lands on the board
              ready to step through.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
