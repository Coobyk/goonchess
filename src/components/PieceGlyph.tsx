import { useEffect, useState } from 'react'
import type { PieceType } from '@/engine/types'

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
  const glyph =
    piece.icon !== 'custom' && code ? (
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
