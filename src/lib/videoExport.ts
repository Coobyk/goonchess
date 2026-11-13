import {
  SAN_LETTERS,
  type Blast,
  type GameState,
  type PieceType,
  type Vec,
} from '@/engine/types'
import { isInCheck } from '@/engine/rules'
import { BLAST_STAGGER, planMove, type Anim } from './moveAnimation'
import { boardColors, portalRgba } from './palette'
import { artToUri, rainbowUri, SHAPE_OF_ICON } from './pieceArt'
import { findPack } from './soundPacks'
import { VOLUME, type SoundName } from './sound'

/**
 * Turns a finished game's history into a video. The frames are drawn on an
 * offscreen canvas with the same pieces and colours the board uses, the moves
 * glide the way `planMove` plans them, blasts replay their shockwave, and the
 * sound pack is mixed in through WebAudio. The whole thing is captured by
 * MediaRecorder, so it renders in real time: one second of game is one second
 * of waiting.
 */

const SOUND_NAMES: SoundName[] = [
  'move',
  'capture',
  'check',
  'promote',
  'explosion',
  'win',
  'draw',
]

const BLAST_MS = 620
const POP_MS = 260
const HOLD_FIRST_MS = 500
const HOLD_MS = 160
const SETTLE_MS = 220
const END_CARD_MS = 1400
const SPARK_ANGLES = [0, 60, 120, 180, 240, 300]

/* Cubic-bezier curves matching the CSS animations, so the video moves the
   way the board does. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const xAt = (t: number) => ((ax * t + bx) * t + cx) * t
  const yAt = (t: number) => ((ay * t + by) * t + cy) * t
  return (t: number) => {
    let lo = 0
    let hi = 1
    let u = t
    for (let i = 0; i < 24; i++) {
      const x = xAt(u)
      if (Math.abs(x - t) < 1e-4) break
      if (x < t) lo = u
      else hi = u
      u = (lo + hi) / 2
    }
    return yAt(u)
  }
}

const EASE_SLIDE = bezier(0.22, 1, 0.36, 1)
const EASE_LIFT = bezier(0.34, 1.2, 0.64, 1)
const EASE_DISSOLVE = bezier(0.4, 0, 1, 1)
const EASE_VANISH = bezier(0.4, 0, 0.2, 1)
const EASE_EMERGE = bezier(0.34, 1.3, 0.64, 1)
const EASE_BLAST = bezier(0.16, 1, 0.3, 1)

interface Segment {
  prev: GameState
  next: GameState
  anim: Anim | null
  /** When the pieces start to move, ms into the video. */
  start: number
  /** When the moving piece lands and blasts go off. */
  landing: number
  end: number
}

/** The picture a skin would show for this piece, or null for a letter. */
function spriteFor(piece: PieceType, teamIndex: number): { src: string | null; letter: string } {
  const shape = piece.flags?.random ? SHAPE_OF_ICON[piece.icon] : undefined
  if (shape) return { src: rainbowUri(shape, teamIndex === 0), letter: '' }
  if (piece.flags?.random) return { src: null, letter: piece.symbol || piece.name.slice(0, 1) }
  const custom = piece.images?.[teamIndex]
  if (custom) return { src: custom, letter: '' }
  if (piece.art?.length) return { src: artToUri(piece.art, teamIndex === 0), letter: '' }
  const code = SAN_LETTERS[piece.icon]
  if (piece.icon !== 'custom' && code) {
    return { src: `/pieces/cburnett/${teamIndex === 0 ? 'w' : 'b'}${code}.svg`, letter: '' }
  }
  return { src: null, letter: piece.symbol || piece.name.slice(0, 1) }
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.src = src
  try {
    await image.decode()
    return image
  } catch {
    return null
  }
}

/** Decode every sound of the pack into buffers for the mix. */
async function loadBuffers(ctx: AudioContext, packId: string) {
  const dir = findPack(packId).dir
  const buffers = new Map<SoundName, AudioBuffer>()
  await Promise.all(
    SOUND_NAMES.map(async (name) => {
      try {
        const res = await fetch(`${dir}/${name}.mp3`)
        buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()))
      } catch {
        /* A missing sound just stays silent in the video. */
      }
    }),
  )
  return buffers
}

function roundRectPath(
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

export interface VideoExportOptions {
  /** Which sound pack the video's moves play. */
  packId: string
  /** Reports 0..1 as frames are captured. */
  onProgress?: (fraction: number) => void
}

export async function exportGameVideo(
  states: GameState[],
  options: VideoExportOptions,
): Promise<Blob> {
  const first = states[0]
  const last = states[states.length - 1]
  const { variant } = first
  const cols = variant.board.width
  const rows = variant.board.height
  const teamIndex = (id: string) => variant.teams.findIndex((t) => t.id === id)

  const cell = Math.max(48, Math.min(96, Math.round(980 / Math.max(cols, rows))))
  const pad = Math.round(cell * 0.42)
  const W = cols * cell + pad * 2
  const H = rows * cell + pad * 2 + Math.round(cell * 0.6)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.imageSmoothingQuality = 'high'

  // The context is created and resumed before any await, so the click that
  // started the export still counts as the user gesture it needs.
  let audio: AudioContext | null = null
  let dest: MediaStreamAudioDestinationNode | null = null
  try {
    audio = new AudioContext()
    dest = audio.createMediaStreamDestination()
    await audio.resume()
  } catch {
    audio = null
    dest = null
  }

  // ---------- sprites ----------
  const wanted = new Map<string, { src: string | null; letter: string; light: boolean }>()
  for (const state of states) {
    for (const type of Object.values(state.pieceTypes)) {
      for (let ti = 0; ti < variant.teams.length; ti++) {
        const key = `${type.id}:${ti}`
        if (wanted.has(key)) continue
        const { src, letter } = spriteFor(type, ti)
        wanted.set(key, { src, letter, light: ti === 0 })
      }
    }
  }
  // Each sprite is drawn once into its own bitmap at twice the square size,
  // so a frame is a handful of blits and pieces stay crisp even mid-lift.
  const spritePx = Math.round(cell * 0.78 * 2)
  const sprites = new Map<string, HTMLCanvasElement | null>()
  await Promise.all(
    [...wanted].map(async ([key, want]) => {
      const img = want.src ? await loadImage(want.src) : null
      let canvas: HTMLCanvasElement | null = null
      if (img || want.letter) {
        canvas = document.createElement('canvas')
        canvas.width = canvas.height = spritePx
        const g = canvas.getContext('2d')
        if (g) {
          if (img) {
            const iw = img.width || spritePx
            const ih = img.height || spritePx
            const fit = Math.min(spritePx / iw, spritePx / ih)
            g.drawImage(img, (spritePx - iw * fit) / 2, (spritePx - ih * fit) / 2, iw * fit, ih * fit)
          } else {
            g.fillStyle = want.light ? '#f8fafc' : '#111827'
            g.font = `600 ${Math.round(spritePx * 0.82)}px ui-sans-serif, system-ui, sans-serif`
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText(want.letter, spritePx / 2, spritePx * 0.54)
          }
        }
      }
      sprites.set(key, canvas)
    }),
  )

  // ---------- timeline ----------
  const segments: Segment[] = []
  const sounds: { at: number; name: SoundName }[] = []
  let cursor = 0
  for (let i = 1; i < states.length; i++) {
    const prev = states[i - 1]
    const next = states[i]
    const anim = planMove(prev, next)
    const record = next.moveHistory[next.moveHistory.length - 1]
    const start = cursor + (i === 1 ? HOLD_FIRST_MS : HOLD_MS)
    const landing = start + (anim?.duration ?? 0)
    const blasts = record?.blasts ?? []
    const maxRing = Math.max(0, ...blasts.map((b) => b.radius))
    const blastTail = blasts.length ? BLAST_MS + maxRing * BLAST_STAGGER + 100 : 0
    const end = start + Math.max(anim?.total ?? 0, (anim?.duration ?? 0) + blastTail) + SETTLE_MS

    const move = record?.move
    sounds.push({
      at: start,
      name: move?.promotionTypeId ? 'promote' : move?.capturedId ? 'capture' : 'move',
    })
    if (blasts.length) sounds.push({ at: landing, name: 'explosion' })
    if (!next.winner && isInCheck(next, next.turn)) sounds.push({ at: landing + 160, name: 'check' })

    segments.push({ prev, next, anim, start, landing, end })
    cursor = end
  }
  if (last.winner) {
    sounds.push({ at: cursor, name: last.winner === 'draw' ? 'draw' : 'win' })
  }
  const total = cursor + (last.winner ? END_CARD_MS : 300)

  // ---------- audio ----------
  if (audio && dest) {
    const buffers = await loadBuffers(audio, options.packId)
    const t0 = audio.currentTime + 0.08
    for (const { at, name } of sounds) {
      const buffer = buffers.get(name)
      if (!buffer) continue
      const src = audio.createBufferSource()
      const gain = audio.createGain()
      gain.gain.value = VOLUME[name]
      src.buffer = buffer
      src.connect(gain).connect(dest)
      src.start(t0 + at / 1000)
    }
  }

  // ---------- drawing helpers ----------
  const colors = boardColors()
  const x0 = pad
  const y0 = pad
  const radius = Math.round(cell * 0.12)
  const sx = (v: Vec | { x: number; y: number }) => x0 + v.x * cell
  const sy = (v: Vec | { x: number; y: number }) => y0 + v.y * cell

  const pieceSize = cell * 0.78
  const drawPiece = (
    typeId: string,
    team: string,
    cx: number,
    cy: number,
    scale: number,
    alpha: number,
  ) => {
    const sprite = sprites.get(`${typeId}:${teamIndex(team)}`)
    if (!sprite) return
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    ctx.globalAlpha *= Math.max(0, Math.min(1, alpha))
    ctx.drawImage(sprite, -pieceSize / 2, -pieceSize / 2, pieceSize, pieceSize)
    ctx.restore()
  }

  // Everything that never moves — backdrop, squares, terrain, border and the
  // rank/file labels — is painted once and blitted under the pieces per frame.
  const boardBase = document.createElement('canvas')
  boardBase.width = W
  boardBase.height = H
  const base = boardBase.getContext('2d')
  if (base) {
    base.fillStyle = '#0c0c0e'
    base.fillRect(0, 0, W, H)
    base.save()
    roundRectPath(base, x0, y0, cols * cell, rows * cell, radius)
    base.clip()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        base.fillStyle = (x + y) % 2 === 0 ? colors.light : colors.dark
        base.fillRect(x0 + x * cell, y0 + y * cell, cell, cell)
        const tile = variant.board.tiles[y]?.[x]
        if (tile?.terrain === 'wall') {
          base.fillStyle = 'rgba(0,0,0,0.28)'
          base.fillRect(x0 + x * cell, y0 + y * cell, cell, cell)
          base.strokeStyle = 'rgba(0,0,0,0.3)'
          base.lineWidth = 2
          for (let d = -cell; d < cell * 2; d += 7) {
            base.beginPath()
            base.moveTo(x0 + x * cell + d, y0 + y * cell + cell)
            base.lineTo(x0 + x * cell + d + cell, y0 + y * cell)
            base.stroke()
          }
        } else if (tile?.terrain === 'void') {
          base.fillStyle = 'rgba(0,0,0,0.75)'
          base.fillRect(x0 + x * cell, y0 + y * cell, cell, cell)
        } else if (tile?.terrain === 'portal' || tile?.terrain === 'oneway') {
          const g = base.createRadialGradient(
            x0 + x * cell + cell / 2,
            y0 + y * cell + cell / 2,
            0,
            x0 + x * cell + cell / 2,
            y0 + y * cell + cell / 2,
            cell / 2,
          )
          g.addColorStop(0, portalRgba(0.55))
          g.addColorStop(0.6, portalRgba(0.12))
          g.addColorStop(0.72, 'rgba(56,189,248,0)')
          base.fillStyle = g
          base.fillRect(x0 + x * cell, y0 + y * cell, cell, cell)
        }
      }
    }
    base.restore()
    base.strokeStyle = 'rgba(255,255,255,0.14)'
    base.lineWidth = 2
    roundRectPath(base, x0 + 1, y0 + 1, cols * cell - 2, rows * cell - 2, radius)
    base.stroke()

    base.fillStyle = 'rgba(255,255,255,0.55)'
    base.font = `${Math.round(cell * 0.3)}px ui-monospace, monospace`
    base.textAlign = 'center'
    base.textBaseline = 'middle'
    for (let x = 0; x < cols; x++) {
      const letter = String.fromCharCode(97 + x)
      base.fillText(letter, x0 + x * cell + cell / 2, y0 + rows * cell + pad * 0.55)
      base.fillText(letter, x0 + x * cell + cell / 2, y0 - pad * 0.5)
    }
    for (let y = 0; y < rows; y++) {
      const rank = String(rows - y)
      base.fillText(rank, x0 - pad * 0.55, y0 + y * cell + cell / 2)
      base.fillText(rank, x0 + cols * cell + pad * 0.55, y0 + y * cell + cell / 2)
    }
  }

  const drawLastMove = (move: { from: Vec; finalTo: Vec }) => {
    ctx.fillStyle = 'rgba(251,191,36,0.28)'
    ctx.fillRect(sx(move.from), sy(move.from), cell, cell)
    if (move.finalTo.x !== move.from.x || move.finalTo.y !== move.from.y) {
      ctx.fillRect(sx(move.finalTo), sy(move.finalTo), cell, cell)
    }
  }

  const drawStaticPieces = (state: GameState, skip: Set<string>) => {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const id = state.board[y][x]
        if (!id || skip.has(id)) continue
        const inst = state.pieces[id]
        if (!inst) continue
        drawPiece(inst.typeId, inst.team, sx({ x, y }) + cell / 2, sy({ x, y }) + cell / 2, 1, 1)
      }
    }
  }

  const drawCheckRing = (state: GameState) => {
    if (!state.winner && isInCheck(state, state.turn)) {
      ctx.strokeStyle = 'rgb(244 63 94)'
      ctx.lineWidth = 2.5
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const id = state.board[y][x]
          const inst = id ? state.pieces[id] : null
          if (inst?.team === state.turn && state.pieceTypes[inst.typeId]?.flags.royal) {
            ctx.strokeRect(x0 + x * cell + 2, y0 + y * cell + 2, cell - 4, cell - 4)
          }
        }
      }
    }
  }

  const drawBlast = (blast: Blast, tau: number) => {
    // Ember flash on every square the shockwave reaches, staggered by ring.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = Math.max(Math.abs(x - blast.x), Math.abs(y - blast.y))
        if (d === 0 || d > blast.radius) continue
        const p = (tau - d * BLAST_STAGGER) / BLAST_MS
        if (p <= 0 || p >= 1) continue
        const a = 0.6 * Math.min(p / 0.35, 1) * (1 - p)
        const g = ctx.createRadialGradient(
          x0 + x * cell + cell / 2,
          y0 + y * cell + cell / 2,
          0,
          x0 + x * cell + cell / 2,
          y0 + y * cell + cell / 2,
          cell / 2,
        )
        g.addColorStop(0, `rgba(253,186,116,${a})`)
        g.addColorStop(0.6, `rgba(249,115,22,${a * 0.45})`)
        g.addColorStop(0.82, 'rgba(249,115,22,0)')
        ctx.fillStyle = g
        ctx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell)
      }
    }

    const p = Math.min(1, tau / BLAST_MS)
    if (p <= 0) return
    const e = EASE_BLAST(p)
    const cx = x0 + blast.x * cell + cell / 2
    const cy = y0 + blast.y * cell + cell / 2
    const size = ((blast.radius * 2 + 1) * cell) / 2

    // The hot core.
    const coreScale = p < 0.2 ? 0.25 + 0.65 * (p / 0.2) : 0.9 + 0.25 * ((p - 0.2) / 0.8)
    const coreAlpha = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * coreScale)
    g.addColorStop(0, `rgba(255,247,224,${0.92 * coreAlpha})`)
    g.addColorStop(0.22, `rgba(253,186,116,${0.72 * coreAlpha})`)
    g.addColorStop(0.48, `rgba(249,115,22,${0.32 * coreAlpha})`)
    g.addColorStop(0.64, 'rgba(249,115,22,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, size * coreScale, 0, Math.PI * 2)
    ctx.fill()

    // The ring expanding past the blast.
    ctx.strokeStyle = `rgba(254,215,170,${0.8 * (1 - p)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, size * (0.3 + e), 0, Math.PI * 2)
    ctx.stroke()

    // Sparks flying outward.
    ctx.strokeStyle = `rgba(254,243,199,${1 - p})`
    ctx.lineCap = 'round'
    for (const angle of SPARK_ANGLES) {
      const rad = (angle * Math.PI) / 180
      const dist = cell * 1.1 * 0.58 * e
      const len = cell * 0.28 * (1 - p * 0.6)
      ctx.lineWidth = Math.max(1, 3 * (1 - p))
      ctx.beginPath()
      ctx.moveTo(cx + Math.sin(rad) * dist, cy - Math.cos(rad) * dist)
      ctx.lineTo(cx + Math.sin(rad) * (dist + len), cy - Math.cos(rad) * (dist + len))
      ctx.stroke()
    }
  }

  const drawFrame = (t: number) => {
    ctx.drawImage(boardBase, 0, 0)

    const seg = segments.find((s) => t < s.end) ?? segments[segments.length - 1]
    const record = seg?.next.moveHistory[seg.next.moveHistory.length - 1]
    const inAnim = seg && t >= seg.start

    if (inAnim && record?.move) drawLastMove(record.move)

    if (!seg) return

    if (!inAnim) {
      // Holding on the position before the next move starts.
      drawStaticPieces(seg.prev, new Set())
      drawCheckRing(seg.prev)
    } else {
      const anim = seg.anim
      const tau = t - seg.start
      const skip = new Set<string>()
      if (anim) {
        for (const f of anim.flights) skip.add(f.pieceId)
        for (const p of anim.pops) skip.add(p.pieceId)
      }
      drawStaticPieces(seg.next, skip)

      if (anim) {
        for (const d of anim.dissolves) {
          const p = (tau - d.delay) / d.duration
          if (p <= 0 || p >= 1) continue
          const e = EASE_DISSOLVE(p)
          drawPiece(
            d.typeId,
            d.team,
            sx(d.at) + cell / 2,
            sy(d.at) + cell / 2,
            1 - 0.65 * e,
            1 - e,
          )
        }
        for (const f of anim.flights) {
          const local = tau - f.delay
          if (local < 0) {
            // A delayed flight still sits at its origin (emerge pieces don't).
            if (f.kind !== 'emerge') {
              drawPiece(f.typeId, f.team, sx(f.from) + cell / 2, sy(f.from) + cell / 2, 1, 1)
            }
            continue
          }
          const p = Math.min(1, local / f.duration)
          if (f.kind === 'slide') {
            const e = EASE_SLIDE(p)
            const lift = 1 + 0.08 * Math.sin(Math.PI * EASE_LIFT(p))
            drawPiece(
              f.typeId,
              f.team,
              sx(f.from) + cell / 2 + (f.to.x - f.from.x) * cell * e,
              sy(f.from) + cell / 2 + (f.to.y - f.from.y) * cell * e,
              lift,
              1,
            )
          } else if (f.kind === 'vanish') {
            const e = EASE_VANISH(p)
            const scale = p < 0.55 ? 1 - 0.5 * (p / 0.55) : 0.5 - 0.4 * ((p - 0.55) / 0.45)
            const alpha = p < 0.55 ? 1 : 0.85 * (1 - (p - 0.55) / 0.45)
            drawPiece(
              f.typeId,
              f.team,
              sx(f.from) + cell / 2 + (f.to.x - f.from.x) * cell * e,
              sy(f.from) + cell / 2 + (f.to.y - f.from.y) * cell * e,
              scale,
              alpha,
            )
          } else {
            // emerge: grow out of the landing square, overshooting a touch.
            const scale = 0.1 + 0.9 * EASE_EMERGE(p)
            drawPiece(f.typeId, f.team, sx(f.to) + cell / 2, sy(f.to) + cell / 2, scale, Math.min(1, p / 0.45))
          }
        }
        for (const p of anim.pops) {
          const local = tau - p.delay
          if (local < 0 || local > POP_MS) continue
          const e = EASE_EMERGE(local / POP_MS)
          drawPiece(
            p.typeId,
            p.team,
            sx(p.at) + cell / 2,
            sy(p.at) + cell / 2,
            0.35 + 0.65 * e,
            Math.min(1, local / (POP_MS * 0.45)),
          )
        }
      }

      // Blasts go off when the mover lands.
      for (const blast of record?.blasts ?? []) {
        const tau = t - seg.landing
        if (tau >= 0) drawBlast(blast, tau)
      }
      if (t >= seg.landing) drawCheckRing(seg.next)
    }

    // The result card, while the win/draw sting plays.
    if (last.winner && t >= cursor) {
      const label = last.winner === 'draw' ? 'Draw' : `${variant.teams.find((tm) => tm.id === last.winner)?.name ?? last.winner} wins`
      ctx.font = `600 ${Math.round(cell * 0.4)}px ui-sans-serif, system-ui, sans-serif`
      const w = ctx.measureText(label).width + cell * 0.8
      const h = cell * 0.72
      const px = W / 2 - w / 2
      const py = H / 2 - h / 2
      ctx.fillStyle = 'rgba(10,10,12,0.82)'
      roundRectPath(ctx, px, py, w, h, h / 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, W / 2, H / 2 + 1)
    }
  }

  // ---------- capture ----------
  // The video is a square 1080×1080; the board scene renders at its natural
  // size and is blitted centred into it every frame.
  const OUT = 1080
  const output = document.createElement('canvas')
  output.width = output.height = OUT
  const outCtx = output.getContext('2d')
  if (!outCtx) throw new Error('Canvas unavailable')
  outCtx.imageSmoothingQuality = 'high'
  const fit = Math.min(OUT / W, OUT / H)
  const dw = W * fit
  const dh = H * fit
  const dx = (OUT - dw) / 2
  const dy = (OUT - dh) / 2

  const mime = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ].find((m) => MediaRecorder.isTypeSupported(m))
  if (!mime) throw new Error('This browser cannot record video')
  const stream = output.captureStream(60)
  if (dest) for (const track of dest.stream.getAudioTracks()) stream.addTrack(track)
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }

  return await new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      audio?.close().catch(() => {})
      resolve(new Blob(chunks, { type: mime.split(';')[0] }))
    }
    recorder.onerror = () => {
      audio?.close().catch(() => {})
      reject(new Error('Recording failed'))
    }

    const t0 = performance.now()
    let lastProgress = -1
    const frame = () => {
      const t = performance.now() - t0
      drawFrame(t)
      outCtx.fillStyle = '#0c0c0e'
      outCtx.fillRect(0, 0, OUT, OUT)
      outCtx.drawImage(canvas, dx, dy, dw, dh)
      const progress = Math.floor((t / total) * 100)
      if (progress !== lastProgress) {
        lastProgress = progress
        options.onProgress?.(Math.min(1, t / total))
      }
      if (t >= total) recorder.stop()
      else requestAnimationFrame(frame)
    }
    recorder.start(250)
    requestAnimationFrame(frame)
  })
}
