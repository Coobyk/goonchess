import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, Copy, Eye, Flag, Loader2, Radio, WifiOff } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

/**
 * The strip above a shared board: which side you are, whether the other player
 * is here, and the one thing the person who made the link needs — a way to send
 * it.
 */
export function OnlineBar() {
  const online = useAppStore((s) => s.online)
  const variant = useAppStore((s) => s.variant)
  const game = useAppStore((s) => s.game)
  const resign = useAppStore((s) => s.resignOnline)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(false), 4000)
    return () => window.clearTimeout(timer)
  }, [confirming])

  if (!online) return null

  const other = online.seat === null ? null : (online.seat + 1) % 2
  const myTeam = online.seat === null ? null : variant.teams[online.seat]?.id
  const turnTeam = game.turn
  const myTurn = !!myTeam && turnTeam === myTeam

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/g/${online.code}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      toast.success('Game link copied')
    } catch {
      toast.error('Clipboard unavailable — copy the address bar instead.')
    }
  }

  let tone: 'muted' | 'live' | 'warn' = 'muted'
  if (!online.connected) tone = 'warn'
  else if (online.status === 'playing' && myTurn) tone = 'live'

  let label: string
  if (!online.connected) label = 'Reconnecting…'
  else if (online.status === 'connecting') label = 'Joining the game…'
  else if (online.status === 'spectating') label = 'Watching this game'
  else if (online.status === 'waiting') label = 'Waiting for an opponent'
  else if (online.status === 'over') label = 'Game over'
  else if (myTurn) label = 'Your move'
  else label = 'Waiting for the other player'

  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border bg-card px-2.5 py-2 text-[13px]',
        tone === 'live' && 'border-signal/45 bg-signal/[0.06]',
        tone === 'warn' && 'border-destructive/40 bg-destructive/[0.06]',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-2 font-medium',
          tone === 'live' && 'text-signal',
        )}
      >
        {!online.connected ? (
          <WifiOff className="size-4" />
        ) : online.status === 'spectating' ? (
          <Eye className="size-4" />
        ) : tone === 'live' ? (
          <Radio className="size-4 animate-pulse" />
        ) : (
          <Radio className="size-4" />
        )}
        {label}
      </span>

      {online.seat !== null && (
        <span className="text-muted-foreground text-xs">
          You are {variant.teams[online.seat]?.name ?? `team ${online.seat + 1}`}
        </span>
      )}

      {online.status === 'waiting' && (
        <span className="text-muted-foreground text-xs">
          Share the link — the first person to open it takes the other side.
        </span>
      )}

      {online.status === 'playing' && other !== null && !online.presence[other] && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="size-3.5" /> Opponent is offline — the game waits for them.
        </span>
      )}

      {online.error && (
        <span className="flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="size-3.5" />
          {online.error === 'not_your_turn'
            ? 'That move was not yours to make.'
            : online.error === 'offline'
              ? 'The connection is down — moves are paused until it is back.'
              : 'The room refused that move. The board was put back.'}
        </span>
      )}

      <span className="ml-auto flex items-center gap-1.5">
        <span className="text-muted-foreground/70 hidden font-mono text-[11px] tracking-tight sm:inline">
          /g/{online.code}
        </span>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />} Copy link
        </Button>
        {online.status === 'playing' && (
          <Button
            size="sm"
            variant={confirming ? 'destructive' : 'ghost'}
            onClick={() => {
              if (!confirming) {
                setConfirming(true)
                return
              }
              setConfirming(false)
              resign()
            }}
          >
            <Flag /> {confirming ? 'Confirm?' : 'Resign'}
          </Button>
        )}
        {!online.connected && <Loader2 className="size-4 animate-spin" />}
      </span>
    </div>
  )
}
