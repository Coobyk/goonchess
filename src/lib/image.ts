import type { GameState, Vec } from '@/engine/types'

/**
 * Draws the board on a canvas so it can be saved as a picture.
 *
 * The piece images are the same ones the board uses, so a saved position looks
 * exactly like the one on screen.
 */

const imageCache = new Map<string, HTMLImageElement>()

async function loadPiece(src: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(src)
  if (cached) return cached
  const image = new Image()
  image.src = src
  try {
    await image.decode()
  } catch {
    return null
  }
  imageCache.set(src, image)
  return image
}

export interface BoardImageOptions {
  /** The size of one square, in pixels. */
  cell?: number
  /** Draw the rank and file labels around the board. */
  labels?: boolean
  /** Highlight the squares of the last move. */
  highlightLastMove?: boolean
}

export async function renderBoardImage(
  state: GameState,
  options: BoardImageOptions = {},
): Promise<Blob | null> {
  const { variant } = state
  const cols = variant.board.width
  const rows = variant.board.height
  const cell = options.cell ?? 72
  const pad = options.labels ? Math.round(cell * 0.42) : 0
  const radius = Math.round(cell * 0.12)

  const canvas = document.createElement('canvas')
  canvas.width = cols * cell + pad * 2
  canvas.height = rows * cell + pad * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // The board itself.
  ctx.fillStyle = '#111113'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  roundRect(ctx, pad, pad, cols * cell, rows * cell, radius)
  ctx.save()
  ctx.clip()

  const last = state.moveHistory[state.moveHistory.length - 1]?.move
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const light = (x + y) % 2 === 0
      ctx.fillStyle = light ? variant.board.light : variant.board.dark
      ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell)

      const tile = variant.board.tiles[y]?.[x]
      if (tile?.terrain === 'wall') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell)
      } else if (tile?.terrain === 'void') {
        ctx.fillStyle = '#000'
        ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell)
      } else if (tile?.terrain === 'portal' || tile?.terrain === 'oneway') {
        ctx.fillStyle = 'rgba(56,189,248,0.35)'
        ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell)
      }

      if (options.highlightLastMove && last) {
        const onFrom = last.from.x === x && last.from.y === y
        const onTo = last.finalTo.x === x && last.finalTo.y === y
        if (onFrom || onTo) {
          ctx.fillStyle = 'rgba(251,191,36,0.28)'
          ctx.fillRect(pad + x * cell, pad + y * cell, cell, cell)
        }
      }
    }
  }

  // The pieces.
  const size = Math.round(cell * 0.82)
  const offset = Math.round((cell - size) / 2)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const id = state.board[y][x]
      if (!id) continue
      const inst = state.pieces[id]
      const piece = state.pieceTypes[inst.typeId]
      if (!piece) continue
      const teamIndex = variant.teams.findIndex((t) => t.id === inst.team)
      const letter = piece.icon === 'custom' ? null : codeFor(piece.icon)
      if (!letter) continue
      const image = await loadPiece(`/pieces/cburnett/${teamIndex === 0 ? 'w' : 'b'}${letter}.svg`)
      if (!image) continue
      ctx.drawImage(image, pad + x * cell + offset, pad + y * cell + offset, size, size)
    }
  }
  ctx.restore()

  // The frame.
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 2
  roundRect(ctx, pad + 1, pad + 1, cols * cell - 2, rows * cell - 2, radius)
  ctx.stroke()

  if (options.labels) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `${Math.round(cell * 0.3)}px ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let x = 0; x < cols; x++) {
      const letter = String.fromCharCode(97 + x)
      ctx.fillText(letter, pad + x * cell + cell / 2, pad + rows * cell + pad * 0.55)
      ctx.fillText(letter, pad + x * cell + cell / 2, pad - pad * 0.5)
    }
    for (let y = 0; y < rows; y++) {
      const rank = String(rows - y)
      ctx.fillText(rank, pad - pad * 0.55, pad + y * cell + cell / 2)
      ctx.fillText(rank, pad + cols * cell + pad * 0.55, pad + y * cell + cell / 2)
    }
  }

  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function codeFor(icon: string): string | null {
  if (icon === 'king') return 'K'
  if (icon === 'queen') return 'Q'
  if (icon === 'rook') return 'R'
  if (icon === 'bishop') return 'B'
  if (icon === 'knight') return 'N'
  if (icon === 'pawn') return 'P'
  return null
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Saves a blob as a file. */
export function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}

/** A file name from a variant name. */
export function fileNameFor(name: string, extension: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${base || 'goonchess'}.${extension}`
}

export function positionName(state: GameState): string {
  const variant = state.variant
  const teams = variant.teams
  const white = teams[0]?.name ?? 'white'
  const black = teams[1]?.name ?? 'black'
  const moved = state.moveHistory.length
  const label = moved === 0 ? 'start' : `move-${moved}`
  return `${white}-vs-${black}-${label}`
}

export function squareAt(x: number, y: number, height: number) {
  return `${String.fromCharCode(97 + x)}${height - y}`
}

export type { Vec }
