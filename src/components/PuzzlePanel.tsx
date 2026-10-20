import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Lightbulb, Loader2, Puzzle as PuzzleIcon, SkipForward } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { BotWorker } from '@/lib/bot'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

/**
 * Puzzles.
 *
 * A position is looked for in a game the bot played against itself, and the
 * player has to find the move that wins the material.
 */
export function PuzzlePanel() {
  const variant = useAppStore((s) => s.variant)
  const game = useAppStore((s) => s.game)
  const worker = useRef<BotWorker | null>(null)
  const [busy, setBusy] = useState(false)
  const [puzzle, setPuzzle] = useState<{
    from: { x: number; y: number }
    to: { x: number; y: number }
    side: string
  } | null>(null)
  const [solved, setSolved] = useState<boolean | null>(null)
  const [count, setCount] = useState(0)
  const movesBefore = useRef(0)

  useEffect(() => {
    return () => {
      worker.current?.dispose()
      worker.current = null
    }
  }, [])

  // Watch for the player's answer.
  useEffect(() => {
    if (!puzzle || solved !== null) return
    if (game.moveHistory.length === movesBefore.current) return
    const record = game.moveHistory[game.moveHistory.length - 1]
    if (!record) return
    const right =
      record.move.from.x === puzzle.from.x &&
      record.move.from.y === puzzle.from.y &&
      record.move.finalTo.x === puzzle.to.x &&
      record.move.finalTo.y === puzzle.to.y
    setSolved(right)
    if (right) {
      toast.success('Solved!')
      setCount((c) => c + 1)
    } else {
      toast.error('Not this time — there was a better move.')
    }
  }, [game, puzzle, solved])

  const loadPuzzle = async () => {
    setBusy(true)
    setSolved(null)
    try {
      const client = worker.current ?? new BotWorker()
      worker.current = client
      const result = await client.findPuzzle(variant, Math.floor(Math.random() * 1e9))
      if (!result.puzzle) {
        toast.error('No puzzle could be found in this variant.')
        return
      }
      setPuzzle({
        from: result.puzzle.from,
        to: result.puzzle.to,
        side: result.puzzle.side,
      })
      movesBefore.current = result.puzzle.state.moveHistory.length
      useAppStore.getState().loadPosition(result.puzzle.state)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <PuzzleIcon className="text-muted-foreground size-4" /> Puzzles
            {busy && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
          </span>
          {count > 0 && <span className="text-muted-foreground text-xs">{count} solved</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 text-sm">
        {puzzle ? (
          <>
            <p className="text-muted-foreground text-xs">
              {solved === null
                ? 'Find the move that wins the material.'
                : solved
                  ? 'That was the move.'
                  : 'The best move was on the board.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={loadPuzzle} disabled={busy}>
                <SkipForward /> Next puzzle
              </Button>
              {solved === false && (
                <Button size="sm" variant="ghost" onClick={() => setSolved(null)}>
                  <Lightbulb /> Try again
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Positions are taken from games the bot played against itself. Find the capture that
              cannot be taken back.
            </p>
            <Button size="sm" variant="secondary" onClick={loadPuzzle} disabled={busy}>
              <PuzzleIcon /> Give me a puzzle
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
