import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { drawBoardToContext } from './image'
import type { GameState } from '@/engine/types'

/**
 * Turns a game into a video or an animated picture.
 *
 * The frames are drawn on a canvas — the same drawing the PNG export uses —
 * and either recorded with the browser's own media recorder, or encoded as a
 * GIF frame by frame.
 */

export interface MovieOptions {
  /** The size of one square, in pixels. */
  cell?: number
  /** How long one move stays on the screen, in milliseconds. */
  stepMs?: number
  /** The maximum number of frames, so a long game stays a reasonable size. */
  maxFrames?: number
  /** A caption under the board, such as the move that was played. */
  caption?: (state: GameState) => string
}

export interface MovieResult {
  blob: Blob
  extension: 'mp4' | 'webm' | 'gif'
}

/** The video type this browser can record. */
export function videoType(): { mimeType: string; extension: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates: { mimeType: string; extension: 'mp4' | 'webm' }[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ]
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate
  }
  return null
}

function makeCanvas(states: GameState[], options: MovieOptions) {
  const { variant } = states[0]
  const cell = options.cell ?? 64
  const canvas = document.createElement('canvas')
  canvas.width = variant.board.width * cell
  canvas.height = variant.board.height * cell + (options.caption ? Math.round(cell * 0.8) : 0)
  return canvas
}

/** Records the game as a video file. */
export async function exportVideo(
  states: GameState[],
  options: MovieOptions = {},
): Promise<MovieResult | null> {
  const type = videoType()
  if (!type || !states.length) return null
  const cell = options.cell ?? 64
  const stepMs = options.stepMs ?? 700
  const canvas = makeCanvas(states, options)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const stream = canvas.captureStream(12)
  const recorder = new MediaRecorder(stream, {
    mimeType: type.mimeType,
    videoBitsPerSecond: 2_500_000,
  })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  recorder.start()
  for (const state of states) {
    await drawFrame(ctx, state, cell, options)
    await sleep(stepMs)
  }
  recorder.stop()
  await finished
  stream.getTracks().forEach((track) => track.stop())
  return { blob: new Blob(chunks, { type: type.mimeType }), extension: type.extension }
}

/** Encodes the game as an animated GIF. */
export async function exportGif(
  states: GameState[],
  options: MovieOptions = {},
): Promise<MovieResult | null> {
  if (!states.length) return null
  const cell = options.cell ?? 48
  const stepMs = options.stepMs ?? 700
  const maxFrames = options.maxFrames ?? 160
  const frames = states.length > maxFrames ? sample(states, maxFrames) : states

  const { variant } = states[0]
  const width = variant.board.width * cell
  const height = variant.board.height * cell + (options.caption ? Math.round(cell * 0.8) : 0)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const encoder = GIFEncoder()
  let palette: number[][] | null = null
  for (const state of frames) {
    await drawFrame(ctx, state, cell, options)
    const data = ctx.getImageData(0, 0, width, height).data
    if (!palette) palette = quantize(data, 128)
    const index = applyPalette(data, palette)
    encoder.writeFrame(index, width, height, { palette, delay: stepMs })
    // Let the browser breathe between frames.
    await sleep(0)
  }
  encoder.finish()
  const bytes = encoder.bytes()
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return { blob: new Blob([copy.buffer], { type: 'image/gif' }), extension: 'gif' }
}

/** Draws one frame of the board, with the real piece pictures. */
async function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cell: number,
  options: MovieOptions,
) {
  const caption = options.caption?.(state)
  await drawBoardToContext(
    ctx,
    state,
    {
      cell,
      highlightLastMove: true,
      caption,
      // The frame has no room for the labels, so the caption carries the move.
    },
    0,
    0,
  )
  if (!caption) return
  // The caption is drawn inside the board area by the shared drawing code, so
  // nothing more is needed here.
}

/** Takes every nth state, so a long game still fits in a small file. */
function sample(states: GameState[], max: number): GameState[] {
  const step = Math.ceil(states.length / max)
  const out: GameState[] = []
  for (let i = 0; i < states.length; i += step) out.push(states[i])
  return out
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
