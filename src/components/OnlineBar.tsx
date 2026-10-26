import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, Copy, Eye, Flag, Loader2, MessageCircle, Radio, Send, Undo2, WifiOff, X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { cn } from '@/lib/utils'

/**
 * The strip above a shared board: which side you are, whether the other player
 * is here, and the one thing the person who made the link needs — a way to send
 * it. Offers to take a move back or to play again are answered here, and so is
 * the chat.
 */
export function OnlineBar() {
  const online = useAppStore((s) => s.online)
  const variant = useAppStore((s) => s.variant)
  const game = useAppStore((s) => s.game)
  const resign = useAppStore((s) => s.resignOnline)
  const offerUndo = useAppStore((s) => s.offerOnlineUndo)
  const offerRematch = useAppStore((s) => s.offerOnlineRematch)
  const respondOffer = useAppStore((s) => s.respondOnlineOffer)
  const sendChat = useAppStore((s) => s.sendOnlineChat)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')

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
  const nameOf = (seat: number) => variant.teams[seat]?.name ?? `team ${seat + 1}`

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
        'flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-sm',
        tone === 'live' && 'border-primary/40 bg-primary/5',
        tone === 'warn' && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <span className="flex items-center gap-2 font-medium">
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
        <span className="text-muted-foreground">
          You are {nameOf(online.seat)}
        </span>
      )}

      {online.status === 'waiting' && (
        <span className="text-muted-foreground">Share the link — the first person to open it takes the other side.</span>
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

      {/* An offer from the other seat, answered where it arrived. */}
      {online.offer && (
        <span className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1">
          <span className="text-xs">
            {online.offer.from === online.seat
              ? `You offered ${online.offer.kind === 'undo' ? 'a take-back' : 'a rematch'} — waiting for an answer.`
              : online.offer.kind === 'undo'
                ? 'Take the last move back?'
                : 'Play the game again?'}
          </span>
          {online.offer.from !== online.seat && (
            <>
              <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={() => respondOffer(true)}>
                <Check /> Accept
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => respondOffer(false)}>
                <X /> Decline
              </Button>
            </>
          )}
        </span>
      )}

      <span className="ml-auto flex items-center gap-2">
        <span className="text-muted-foreground hidden font-mono text-xs sm:inline">/g/{online.code}</span>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />} Copy link
        </Button>
        {/* A take-back needs the other player to agree; so does a rematch. */}
        {online.status === 'playing' && !online.offer && game.moveHistory.length > 0 && (
          <Button size="sm" variant="ghost" onClick={offerUndo}>
            <Undo2 /> Take back
          </Button>
        )}
        {online.status === 'over' && !online.offer && (
          <Button size="sm" variant="ghost" onClick={offerRematch}>
            <Undo2 /> Rematch
          </Button>
        )}
        <Popover open={chatOpen} onOpenChange={setChatOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Chat">
              <MessageCircle /> Chat
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <div className="mb-2 max-h-56 space-y-1.5 overflow-y-auto" aria-live="polite">
              {online.chat.length === 0 && (
                <p className="text-muted-foreground text-xs">Nothing said yet. Say hello.</p>
              )}
              {online.chat.map((line, index) => (
                <p key={index} className="text-xs leading-snug">
                  <span className={cn('font-medium', line.from === online.seat && 'text-primary')}>
                    {line.from === online.seat ? 'You' : nameOf(line.from)}
                  </span>{' '}
                  {line.text}
                </p>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                sendChat(draft)
                setDraft('')
              }}
            >
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={280}
                placeholder="Say something…"
                className="h-8 text-xs"
                aria-label="Chat message"
              />
              <Button type="submit" size="sm" variant="secondary" className="h-8 px-2" disabled={!draft.trim()}>
                <Send />
              </Button>
            </form>
          </PopoverContent>
        </Popover>
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
