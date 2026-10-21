import { useEffect, useState } from 'react'
import type { PieceType } from '@/engine/types'
import { RAINBOW, RAINBOW_DARK, SHAPE_OF_ICON, artToUri, rainbowUri } from '@/lib/pieceArt'

const CODES: Record<string, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
}

export function PieceGlyph({
  piece,
  teamIndex,
  size = 40,
  muted = false,
}: {
  piece?: PieceType | null
  teamIndex: number
  size?: number
  muted?: boolean
}) {
  if (!piece) return null
  const code = CODES[piece.icon]
  // A random piece is drawn in the colours of a rainbow: it changes its kind
  // after every move, and it says so.
  const light = teamIndex === 0
  const shape = piece.flags?.random ? SHAPE_OF_ICON[piece.icon] : undefined
  const glyph = shape ? (
    <img
      src={rainbowUri(shape, light)}
      alt={piece.name}
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'block', width: size, height: size }}
    />
  ) : piece.flags?.random ? (
    // A letter on a rainbow.
    <span
      style={{
        fontSize: size * 0.82,
        lineHeight: 1,
        fontWeight: 700,
        backgroundImage: `linear-gradient(-45deg, ${(light ? RAINBOW : RAINBOW_DARK).join(', ')})`,
        backgroundSize: '200% 200%',
        animation: 'rainbow-slide 3.6s linear infinite',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {piece.symbol || piece.name.slice(0, 1)}
    </span>
  ) : piece.art && piece.art.length ? (
    // A piece that was drawn in the composer.
    <img
      src={artToUri(piece.art, teamIndex === 0)}
      alt={piece.name}
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'block', width: size, height: size }}
    />
  ) : piece.icon !== 'custom' && code ? (
    <img
      src={`/pieces/cburnett/${teamIndex === 0 ? 'w' : 'b'}${code}.svg`}
      alt={piece.name}
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'block', width: size, height: size }}
    />
  ) : (
    <span
      style={{
        fontSize: size * 0.82,
        lineHeight: 1,
        fontWeight: 600,
        color: teamIndex === 0 ? '#f8fafc' : '#111827',
      }}
    >
      {piece.symbol || piece.name.slice(0, 1)}
    </span>
  )

  return (
    <span
      className="pointer-events-none flex items-center justify-center"
      style={{
        width: size,
        height: size,
        opacity: muted ? 0.45 : 1,
        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.45))',
      }}
    >
      {glyph}
    </span>
  )
}

export function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [node])
  return [setNode, width] as const
}

export function boardCellSize(containerWidth: number, cols: number, max = 64, min = 20) {
  if (!containerWidth) return max
  const raw = Math.floor((containerWidth - 44) / cols)
  return Math.max(min, Math.min(max, raw))
}
