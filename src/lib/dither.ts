/**
 * Dithered drawings.
 *
 * The graph of a game is drawn the way a pixel artist would: the area under
 * the curve is filled with a checker of ink and paper, ordered so that the
 * denser parts of the graph get more ink. The result reads like an old
 * computer screen, which is the point.
 */

/** The four-by-four ordered dither. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

export interface GraphPoint {
  /** Where the point sits along the graph, from 0 to 1. */
  at: number
  /** How much of the graph is filled at that point, from 0 to 1. */
  value: number
}

export interface DitherOptions {
  /** The colour of the ink. */
  ink: string
  /** The colour of the paper behind it. */
  paper: string
  /** A line drawn along the top of the filled area. */
  edge?: string
  /** The width of one dot, in pixels. */
  dot?: number
}

/**
 * Draws a graph as a dithered picture.
 *
 * The values are the height of the graph at each point, from 0 to 1. Half of
 * the picture is one side of the graph and half the other, so a value of 0.5
 * runs down the middle.
 */
export function drawDitheredGraph(
  canvas: HTMLCanvasElement,
  points: GraphPoint[],
  options: DitherOptions,
): void {
  const dot = Math.max(1, Math.round(options.dot ?? 1))
  const width = Math.max(1, Math.floor(canvas.clientWidth / dot))
  const height = Math.max(1, Math.floor(canvas.clientHeight / dot))
  canvas.width = width * dot
  canvas.height = height * dot

  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)

  // The value of the graph at every column of dots.
  const column = new Float32Array(width)
  for (let x = 0; x < width; x++) {
    const at = width === 1 ? 0 : x / (width - 1)
    column[x] = valueAt(points, at)
  }

  const image = context.createImageData(canvas.width, canvas.height)
  const ink = parseColour(options.ink)
  const paper = parseColour(options.paper)
  const edge = options.edge ? parseColour(options.edge) : null

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = column[x]
      // How far the graph is from the middle, as a fraction of the height.
      const from = value * height
      const row = height - 1 - y
      const threshold = (BAYER4[y % 4][x % 4] + 0.5) / 16
      // How many dots below the graph this one is.
      const inside = from - row
      let colour = paper
      if (inside >= 2) {
        // Well inside the graph: solid ink.
        colour = ink
      } else if (inside >= 0) {
        // The edge of the graph fades into the paper, one ordered step at a
        // time, the way a pixel artist would draw it.
        colour = edge && threshold > inside / 2 ? edge : ink
      } else if (inside >= -1 && edge) {
        // A soft shadow under the line.
        colour = threshold > 0.5 ? edge : paper
      }
      // Each dot is a block of pixels.
      for (let dy = 0; dy < dot; dy++) {
        for (let dx = 0; dx < dot; dx++) {
          const px = x * dot + dx
          const py = y * dot + dy
          if (px >= canvas.width || py >= canvas.height) continue
          const offset = (py * canvas.width + px) * 4
          image.data[offset] = colour[0]
          image.data[offset + 1] = colour[1]
          image.data[offset + 2] = colour[2]
          image.data[offset + 3] = 255
        }
      }
    }
  }
  context.putImageData(image, 0, 0)
}

/** The value of the graph at a point, with the points joined up. */
function valueAt(points: GraphPoint[], at: number): number {
  if (!points.length) return 0.5
  if (at <= points[0].at) return points[0].value
  const last = points[points.length - 1]
  if (at >= last.at) return last.value
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (at <= b.at) {
      const span = b.at - a.at
      const t = span <= 0 ? 0 : (at - a.at) / span
      return a.value + (b.value - a.value) * t
    }
  }
  return last.value
}

/** Reads a colour, whatever way it was written. */
function parseColour(colour: string): [number, number, number] {
  const value = colour.trim()
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex.slice(0, 6)
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
    ]
  }
  const match = value.match(/rgba?\(([^)]+)\)/)
  if (match) {
    const parts = match[1].split(',').map((p) => parseFloat(p))
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }
  return [255, 255, 255]
}
