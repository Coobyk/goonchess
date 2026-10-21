/**
 * The artwork of the pieces.
 *
 * The shapes are the cburnett chess pieces — the set the board already uses.
 * The markup of each piece is kept exactly as it was drawn; the composer
 * stacks the shapes on top of each other and paints them in the colour of the
 * team.
 *
 * Cburnett chess pieces by Colin M. L. Burnett, CC BY-SA 3.0.
 * See public/pieces/cburnett/ATTRIBUTION.txt.
 */

import type { ArtShape, PieceArt, PieceArtLayer, PieceIcon } from '@/engine/types'

export const ART_SHAPES: ArtShape[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']

export const ART_SHAPE_LABELS: Record<ArtShape, string> = {
  king: 'King',
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
  pawn: 'Pawn',
}

/** The markup of each piece, in the 45 by 45 space the pieces are drawn in. */
export const ART_MARKUP: Record<ArtShape, string> = {
  king: "<g fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path stroke-linejoin=\"miter\" d=\"M22.5 11.63V6M20 8h5\"/><path fill=\"#fff\" stroke-linecap=\"butt\" stroke-linejoin=\"miter\" d=\"M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5\"/><path fill=\"#fff\" d=\"M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z\"/><path d=\"M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0\"/></g>",
  queen: "<g fill=\"#fff\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0m16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0M16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0\"/><path stroke-linecap=\"butt\" d=\"M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14z\"/><path stroke-linecap=\"butt\" d=\"M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z\"/><path fill=\"none\" d=\"M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0\"/></g>",
  rook: "<g fill=\"#fff\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path stroke-linecap=\"butt\" d=\"M9 39h27v-3H9zm3-3v-4h21v4zm-1-22V9h4v2h5V9h5v2h5V9h4v5\"/><path d=\"m34 14-3 3H14l-3-3\"/><path stroke-linecap=\"butt\" stroke-linejoin=\"miter\" d=\"M31 17v12.5H14V17\"/><path d=\"m31 29.5 1.5 2.5h-20l1.5-2.5\"/><path fill=\"none\" stroke-linejoin=\"miter\" d=\"M11 14h23\"/></g>",
  bishop: "<g fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><g fill=\"#fff\" stroke-linecap=\"butt\"><path d=\"M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z\"/><path d=\"M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z\"/><path d=\"M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z\"/></g><path stroke-linejoin=\"miter\" d=\"M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5\"/></g>",
  knight: "<g fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path fill=\"#fff\" d=\"M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21\"/><path fill=\"#fff\" d=\"M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3\"/><path fill=\"#000\" d=\"M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5\"/></g>",
  pawn: "<path fill=\"#fff\" stroke=\"#000\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z\"/>",
}

/**
 * The part of each shape that counts as its crown — everything above the
 * pedestal. The composer can show only the crown of a shape, which is how a
 * piece gets another piece's head.
 */
export const ART_CROWN: Record<ArtShape, [number, number, number, number]> = {
  king: [0, 0, 45, 21],
  queen: [0, 0, 45, 27],
  rook: [0, 0, 45, 17],
  bishop: [0, 0, 45, 28],
  knight: [0, 0, 45, 21],
  pawn: [0, 0, 45, 24],
}

/* ------------------------------------------------------------- rendering */

const LIGHT_FILL = '#ffffff'
const DARK_FILL = '#111827'
const LIGHT_LINE = '#000000'
const DARK_LINE = '#e5e7eb'

/**
 * The colours of a random piece.
 *
 * Soft on purpose: a rainbow that shouts drowns the shape of the piece and
 * makes the two armies hard to tell apart. These are dusty enough to read as
 * a piece first and as a rainbow second.
 */
export const RAINBOW = ['#f1b5b5', '#f5dfa7', '#c5e0a8', '#a6c8e6', '#cab7e3']

/** The same colours, deeper, for the dark army. */
export const RAINBOW_DARK = ['#b34848', '#ba9330', '#659632', '#2e6ba0', '#6e4c9a']

/** The shape each icon is drawn from, for the rainbow drawing. */
export const SHAPE_OF_ICON: Partial<Record<PieceIcon, ArtShape>> = {
  king: 'king',
  queen: 'queen',
  rook: 'rook',
  bishop: 'bishop',
  knight: 'knight',
  pawn: 'pawn',
}

/** Paints the markup of a shape in the colour of a team. */
function paint(markup: string, light: boolean): string {
  const fill = light ? LIGHT_FILL : DARK_FILL
  const line = light ? LIGHT_LINE : DARK_LINE
  return markup
    .replace(/fill="#fff"/g, `fill="${fill}"`)
    .replace(/fill="#000"/g, `fill="${line}"`)
    .replace(/stroke="#000"/g, `stroke="${line}"`)
    .replace(/stroke="#ececec"/g, `stroke="${line}"`)
}

/** Paints the markup of a shape in the colours of a rainbow. */
function paintRainbow(markup: string, light: boolean): string {
  const line = light ? '#1f2937' : '#e5e7eb'
  return markup
    .replace(/fill="#fff"/g, 'fill="url(#rainbow)"')
    .replace(/fill="#000"/g, `fill="${line}"`)
    .replace(/stroke="#000"/g, `stroke="${line}"`)
    .replace(/stroke="#ececec"/g, `stroke="${line}"`)
}

function layerMarkup(layer: PieceArtLayer, light: boolean, index: number): string {
  const markup = paint(ART_MARKUP[layer.shape], light)
  const transform = `translate(${layer.x} ${layer.y}) scale(${layer.scale})`
  if (!layer.crown) return `<g transform="${transform}">${markup}</g>`
  const [x, y, w, h] = ART_CROWN[layer.shape]
  // The crown is cut out of the shape before it is moved and scaled, so the
  // cut always sits where the shape's own shoulders are.
  return (
    `<g transform="${transform}">` +
    `<g clip-path="url(#crown-${index})">${markup}</g>` +
    `</g>` +
    `<clipPath id="crown-${index}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`
  )
}

/** The drawing of a piece, as an SVG document. */
export function artToSvg(art: PieceArt, light: boolean): string {
  const layers = art.map((layer, i) => layerMarkup(layer, light, i)).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="45" height="45">` +
    `<g stroke-linecap="round" stroke-linejoin="round">${layers}</g>` +
    `</svg>`
  )
}

const uriCache = new Map<string, string>()

/** The drawing of a piece, as something an <img> can show. */
export function artToUri(art: PieceArt, light: boolean): string {
  const key = `${light ? 'w' : 'b'}:${JSON.stringify(art)}`
  const cached = uriCache.get(key)
  if (cached) return cached
  const svg = artToSvg(art, light)
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
  uriCache.set(key, uri)
  return uri
}

/**
 * The drawing of a random piece: the shape of a piece in the colours of a
 * rainbow, so it is clear at a glance that it is not what it seems.
 *
 * The rainbow lies at forty-five degrees and slides slowly downwards, which
 * gives it the shimmer of light running over the piece. The dark army gets
 * deeper colours and a light rim, so the two armies stay apart.
 */
export function rainbowUri(shape: ArtShape, light = true): string {
  const key = `rainbow:${light ? 'w' : 'b'}:${shape}`
  const cached = uriCache.get(key)
  if (cached) return cached
  const colours = light ? RAINBOW : RAINBOW_DARK
  const stops = colours
    .map(
      (colour, i) =>
        `<stop offset="${Math.round((i / (colours.length - 1)) * 100)}%" stop-color="${colour}"/>`,
    )
    .join('')
  // The gradient lies at forty-five degrees and slides one whole period
  // downwards, so the shimmer never jumps. It is drawn against the piece's own
  // box, so every piece shows the same rainbow in the same places.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="45" height="45">` +
    `<defs>` +
    `<linearGradient id="rainbow" x1="1" y1="0" x2="0" y2="1" spreadMethod="repeat">` +
    `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="-1 1" dur="3.6s" repeatCount="indefinite"/>` +
    stops +
    `</linearGradient></defs>` +
    `<g fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">` +
    paintRainbow(ART_MARKUP[shape], light) +
    `</g></svg>`
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
  uriCache.set(key, uri)
  return uri
}

/** A piece drawn from a single shape, the way the board draws them. */
export function singleShapeArt(shape: ArtShape): PieceArt {
  return [{ shape, x: 0, y: 0, scale: 1 }]
}

/* ------------------------------------------------------- the collection */

/**
 * The premade pieces.
 *
 * The six shapes on their own, and the classic combinations: a piece that
 * carries another piece's head. They are the starting points of the composer
 * — every one of them can be pulled apart and changed.
 */
export interface PremadeArt {
  id: string
  name: string
  /** What the piece is, in one line. */
  note: string
  art: PieceArt
}

export const PREMADE_ART: PremadeArt[] = [
  {
    id: 'king',
    name: 'King',
    note: 'The shape on its own',
    art: singleShapeArt('king'),
  },
  {
    id: 'queen',
    name: 'Queen',
    note: 'The shape on its own',
    art: singleShapeArt('queen'),
  },
  {
    id: 'rook',
    name: 'Rook',
    note: 'The shape on its own',
    art: singleShapeArt('rook'),
  },
  {
    id: 'bishop',
    name: 'Bishop',
    note: 'The shape on its own',
    art: singleShapeArt('bishop'),
  },
  {
    id: 'knight',
    name: 'Knight',
    note: 'The shape on its own',
    art: singleShapeArt('knight'),
  },
  {
    id: 'pawn',
    name: 'Pawn',
    note: 'The shape on its own',
    art: singleShapeArt('pawn'),
  },
  {
    id: 'archbishop',
    name: 'Archbishop',
    note: 'Knight with a bishop’s crown',
    art: [
      { shape: 'knight', x: 0, y: 0, scale: 1 },
      { shape: 'bishop', x: 8.5, y: 0.5, scale: 0.74, crown: true },
    ],
  },
  {
    id: 'chancellor',
    name: 'Chancellor',
    note: 'Knight with a rook’s crown',
    art: [
      { shape: 'knight', x: 0, y: 0, scale: 1 },
      { shape: 'rook', x: 9.5, y: 0.5, scale: 0.68, crown: true },
    ],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    note: 'Knight with a queen’s crown',
    art: [
      { shape: 'knight', x: 0, y: 0, scale: 1 },
      { shape: 'queen', x: 9.5, y: 0, scale: 0.64, crown: true },
    ],
  },
  {
    id: 'princess',
    name: 'Princess',
    note: 'Knight with a king’s crown',
    art: [
      { shape: 'knight', x: 0, y: 0, scale: 1 },
      { shape: 'king', x: 9.5, y: 0.5, scale: 0.62, crown: true },
    ],
  },
  {
    id: 'crowned-queen',
    name: 'Crowned Queen',
    note: 'Queen with a king’s crown',
    art: [
      { shape: 'queen', x: 0, y: 0, scale: 1 },
      { shape: 'king', x: 11, y: 0, scale: 0.45, crown: true },
    ],
  },
  {
    id: 'crowned-bishop',
    name: 'Crowned Bishop',
    note: 'Bishop with a queen’s crown',
    art: [
      { shape: 'bishop', x: 0, y: 0, scale: 1 },
      { shape: 'queen', x: 9.5, y: 0.5, scale: 0.55, crown: true },
    ],
  },
  {
    id: 'rook-horse',
    name: 'Rook Horse',
    note: 'Rook with a knight’s head',
    art: [
      { shape: 'rook', x: 0, y: 0, scale: 1 },
      { shape: 'knight', x: 8, y: 2, scale: 0.62, crown: true },
    ],
  },
  {
    id: 'bishop-horse',
    name: 'Bishop Horse',
    note: 'Bishop with a knight’s head',
    art: [
      { shape: 'bishop', x: 0, y: 0, scale: 1 },
      { shape: 'knight', x: 8, y: 2, scale: 0.6, crown: true },
    ],
  },
  {
    id: 'queen-horse',
    name: 'Queen Horse',
    note: 'Queen with a knight’s head',
    art: [
      { shape: 'queen', x: 0, y: 0, scale: 1 },
      { shape: 'knight', x: 8, y: 2.5, scale: 0.58, crown: true },
    ],
  },
  {
    id: 'king-horse',
    name: 'Dragon King',
    note: 'King with a knight’s head',
    art: [
      { shape: 'king', x: 0, y: 0, scale: 1 },
      { shape: 'knight', x: 8, y: 2.5, scale: 0.58, crown: true },
    ],
  },
]
