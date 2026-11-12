import { SAN_LETTERS, type PieceType } from '@/engine/types'
import { RAINBOW, SHAPE_OF_ICON, artToUri, rainbowUri } from '@/lib/pieceArt'

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
  const code = SAN_LETTERS[piece.icon]
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
        backgroundImage: `linear-gradient(-45deg, ${RAINBOW.join(', ')})`,
        backgroundSize: '200% 200%',
        animation: 'rainbow-slide 3.6s linear infinite',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {piece.symbol || piece.name.slice(0, 1)}
    </span>
  ) : piece.images?.[teamIndex] ? (
    // A piece with a picture of its own, one for each side.
    <img
      src={piece.images[teamIndex]}
      alt={piece.name}
      width={size}
      height={size}
      draggable={false}
      style={{
        display: 'block',
        width: size,
        height: size,
        objectFit: 'contain',
      }}
    />
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
        opacity: muted ? 0.7 : 1,
        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.45))',
      }}
    >
      {glyph}
    </span>
  )
}

