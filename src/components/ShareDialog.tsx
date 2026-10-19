import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Download, FileJson, Link2, Upload } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { variantToHash } from '@/lib/encoding'
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
  const exportVariant = useAppStore((s) => s.exportVariant)
  const importVariant = useAppStore((s) => s.importVariant)
  const [importText, setImportText] = useState('')
  const [error, setError] = useState<string | null>(null)

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
            <TabsTrigger value="link">
              <Link2 /> Link
            </TabsTrigger>
            <TabsTrigger value="json">
              <FileJson /> JSON
            </TabsTrigger>
            <TabsTrigger value="import">
              <Upload /> Import
            </TabsTrigger>
          </TabsList>

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
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
