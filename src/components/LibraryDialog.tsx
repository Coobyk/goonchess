import { useState } from 'react'
import { toast } from 'sonner'
import { Library, Save, Trash2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'

export function LibraryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const variant = useAppStore((s) => s.variant)
  const library = useAppStore((s) => s.library)
  const addCurrentToLibrary = useAppStore((s) => s.addCurrentToLibrary)
  const loadFromLibrary = useAppStore((s) => s.loadFromLibrary)
  const deleteFromLibrary = useAppStore((s) => s.deleteFromLibrary)
  const [name, setName] = useState(variant.name)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="size-4" /> Variant library
          </DialogTitle>
          <DialogDescription>
            Saved locally in this browser. Export a variant if you want to move it elsewhere.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="save-name">Save current variant as</Label>
            <Input
              id="save-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={variant.name}
            />
          </div>
          <Button
            onClick={() => {
              addCurrentToLibrary(name.trim() || variant.name)
              toast.success('Saved to library')
            }}
          >
            <Save /> Save
          </Button>
        </div>

        <Separator />

        <ScrollArea className="h-72 pr-3">
          {library.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing saved yet. Build something and save it here.
            </p>
          ) : (
            <div className="space-y-2">
              {library.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.variant.board.width}×{entry.variant.board.height} ·{' '}
                      {entry.variant.pieceTypes.length} pieces ·{' '}
                      {new Date(entry.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      loadFromLibrary(entry.id)
                      toast.success(`Loaded ${entry.name}`)
                      onOpenChange(false)
                    }}
                  >
                    Load
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteFromLibrary(entry.id)}
                    aria-label={`Delete ${entry.name}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
