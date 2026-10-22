import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Image as ImageIcon,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { BoardShell, tileBackground } from './BoardShell'
import { PieceGlyph } from './PieceGlyph'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { downloadBlob, fileNameFor, renderBoardImage } from '@/lib/image'
import { exportGif, exportVideo, videoType } from '@/lib/movie'
import { moveLabel, replayStates } from '@/lib/replay'
import type { GameState } from '@/engine/types'

/**
 * Replays a finished (or running) game.
 *
 * The game is rebuilt from its start, so every position can be shown again —
 * and the whole thing can be written out as a video or an animated picture.
 */
export function ReplayView({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const game = useAppStore((s) => s.game)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const states = useMemo(() => replayStates(game), [game])

  useEffect(() => {
    setIndex(states.length - 1)
  }, [states.length])

  // Autoplay.
  useEffect(() => {
    if (!playing) return
    if (index >= states.length - 1) {
      setPlaying(false)
      return
    }
    timer.current = window.setTimeout(() => setIndex((i) => Math.min(states.length - 1, i + 1)), 700 / speed)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [playing, index, states.length, speed])

  const current: GameState = states[Math.min(index, states.length - 1)] ?? game
  const video = videoType()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" /> Replay
          </DialogTitle>
          <DialogDescription>
            Step through the game again, or write it out as a video or an animated picture.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <ReplayBoard state={current} />

          <div className="w-full space-y-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, states.length - 1)}
              value={index}
              onChange={(e) => {
                setPlaying(false)
                setIndex(Number(e.target.value))
              }}
              aria-label="Move"
              className="w-full accent-amber-400"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground font-mono">
                {index} / {states.length - 1} · {moveLabel(game, index)}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Previous move"
                  onClick={() => {
                    setPlaying(false)
                    setIndex((i) => Math.max(0, i - 1))
                  }}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={playing ? 'Pause' : 'Play'}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? <Pause /> : <Play />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Next move"
                  onClick={() => {
                    setPlaying(false)
                    setIndex((i) => Math.min(states.length - 1, i + 1))
                  }}
                >
                  <ChevronRight />
                </Button>
                <select
                  aria-label="Speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="bg-background h-8 rounded-md border px-2 text-xs"
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('picture')
                try {
                  const blob = await renderBoardImage(current, {
                    labels: true,
                    highlightLastMove: true,
                    caption: moveLabel(game, index),
                  })
                  if (!blob) {
                    toast.error('The board could not be drawn.')
                    return
                  }
                  downloadBlob(blob, fileNameFor(`${game.variant.name}-${index}`, 'png'))
                  toast.success('Picture saved')
                } finally {
                  setBusy(null)
                }
              }}
            >
              <ImageIcon /> Picture
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('gif')
                try {
                  const result = await exportGif(states, { stepMs: 700 / speed })
                  if (!result) {
                    toast.error('The GIF could not be made.')
                    return
                  }
                  downloadBlob(result.blob, fileNameFor(game.variant.name, 'gif'))
                  toast.success('Animated picture saved')
                } catch {
                  toast.error('The GIF could not be made.')
                } finally {
                  setBusy(null)
                }
              }}
            >
              <Film /> Animated GIF
            </Button>
            {video && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy('video')
                  try {
                    const result = await exportVideo(states, { stepMs: 700 / speed })
                    if (!result) {
                      toast.error('The video could not be made.')
                      return
                    }
                    downloadBlob(result.blob, fileNameFor(game.variant.name, result.extension))
                    toast.success('Video saved')
                  } catch {
                    toast.error('The video could not be made.')
                  } finally {
                    setBusy(null)
                  }
                }}
              >
                <Download /> Video ({video.extension.toUpperCase()})
              </Button>
            )}
            {busy && <span className="text-muted-foreground text-xs">Working…</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A quiet, read-only board for the replay. */
export function ReplayBoard({ state }: { state: GameState }) {
  const { variant } = state
  const cols = variant.board.width
  const rows = variant.board.height
  const cell = 56
  const last = state.moveHistory[state.moveHistory.length - 1]?.move

  return (
    <BoardShell
      width={cols}
      height={rows}
      cellSize={cell}
      ariaLabel="Replay board"
      showLabels={false}
    >
      {Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          const id = state.board[y][x]
          const inst = id ? state.pieces[id] : undefined
          const piece = inst ? state.pieceTypes[inst.typeId] : undefined
          const teamIndex = variant.teams.findIndex((t) => t.id === inst?.team)
          const highlighted =
            !!last &&
            ((last.from.x === x && last.from.y === y) ||
              (last.finalTo.x === x && last.finalTo.y === y))
          return (
            <div
              key={`${x}-${y}`}
              className="relative flex items-center justify-center"
              style={{
                backgroundColor: tileBackground(x, y),
              }}
            >
              {highlighted && (
                <span className="absolute inset-0 bg-amber-400/25" />
              )}
              {piece && (
                <span className="relative z-10 inline-flex">
                  <PieceGlyph piece={piece} teamIndex={teamIndex} size={Math.round(cell * 0.78)} />
                </span>
              )}
            </div>
          )
        }),
      )}
    </BoardShell>
  )
}
