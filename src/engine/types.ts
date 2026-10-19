export interface Vec {
  x: number
  y: number
}

export const vecKey = (v: Vec) => `${v.x},${v.y}`

/* ------------------------------------------------------------------ board */

export type Terrain = 'normal' | 'void' | 'wall' | 'portal' | 'oneway'

export interface Tile {
  terrain: Terrain
  /** Destination for portal / oneway tiles. */
  target?: Vec
}

export interface BoardConfig {
  width: number
  height: number
  light: string
  dark: string
  /** tiles[y][x] */
  tiles: Tile[][]
}

/* ------------------------------------------------------------------ teams */

export interface TeamConfig {
  id: string
  name: string
  /** Tint applied to pieces of this team. */
  color: string
  /** Direction this team advances. Used to mirror movement patterns. */
  forward: 'up' | 'down'
}

/* -------------------------------------------------------------- pieces */

export type PieceIcon =
  | 'king'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'pawn'
  | 'custom'

export const PIECE_ICONS: { id: PieceIcon; label: string }[] = [
  { id: 'king', label: 'King' },
  { id: 'queen', label: 'Queen' },
  { id: 'rook', label: 'Rook' },
  { id: 'bishop', label: 'Bishop' },
  { id: 'knight', label: 'Knight' },
  { id: 'pawn', label: 'Pawn' },
  { id: 'custom', label: 'Letter / Symbol' },
]

export type PatternKind = 'leaper' | 'slider'

export interface MovePattern {
  id: string
  kind: PatternKind
  /** Leaper offsets or slider directions. Orientation is "friendly forward". */
  vectors: Vec[]
  /** Slider only: how many squares it may travel. */
  maxRange: number
  /** Applies only while the piece has never moved (e.g. a pawn's double step). */
  firstMoveOnly?: boolean
}

export interface PieceFlags {
  /** Leap over blockers while moving on sliders. */
  jump: boolean
  /** May only move when capturing. */
  mustCapture: boolean
  /** Cannot be captured by any piece. */
  uncapturable: boolean
  /** Loss of this piece decides the game (king / royal). */
  royal: boolean
  /** May move only once per game, then becomes frozen. */
  movesOnce: boolean
  /** Mirror the movement patterns vertically for the opposing team. */
  mirror: boolean
}

export type Effect =
  | { kind: 'swap' }
  | { kind: 'explosion'; radius: number }
  | { kind: 'spawn'; pieceTypeId: string; offset: Vec }

export interface Promotion {
  /** Piece type this becomes when it reaches the far rank. */
  typeId: string
}

export interface PieceType {
  id: string
  name: string
  icon: PieceIcon
  /** Letter / glyph used when icon is "custom". */
  symbol: string
  value: number
  move: MovePattern[]
  /** Empty means "capture the same way it moves". */
  capture: MovePattern[]
  flags: PieceFlags
  effects: Effect[]
  promotion: Promotion | null
}

/* ---------------------------------------------------------------- setup */

export interface SetupPiece {
  typeId: string
  team: string
  x: number
  y: number
}

/* -------------------------------------------------------------- variant */

export type WinConditionKind =
  | 'checkmate'
  | 'kingCapture'
  | 'elimination'
  | 'points'

export interface WinCondition {
  id: string
  kind: WinConditionKind
  /** points only */
  threshold?: number
}

export interface Variant {
  schema: 1
  id: string
  name: string
  description: string
  board: BoardConfig
  teams: TeamConfig[]
  pieceTypes: PieceType[]
  setup: SetupPiece[]
  winConditions: WinCondition[]
}

/* ---------------------------------------------------------- game state */

export interface Move {
  from: Vec
  to: Vec
  pieceId: string
  capturedId?: string
  effects: Effect[]
  /** Final square after portals. */
  finalTo: Vec
  promotionTypeId?: string
}

/** Visual record of an explosion that happened during a move. */
export interface Blast {
  /** Centre of the blast (the moving piece's final square). */
  x: number
  y: number
  radius: number
  /** Squares whose occupant was destroyed by the blast. */
  victims: Vec[]
}

export interface MoveRecord {
  move: Move
  team: string
  notation: string
  capturedName?: string
  blasts?: Blast[]
}

export interface PieceInstance {
  id: string
  typeId: string
  team: string
  hasMoved: boolean
}

export interface GameState {
  variant: Variant
  /** board[y][x] = piece id */
  board: (string | null)[][]
  pieces: Record<string, PieceInstance>
  pieceTypes: Record<string, PieceType>
  turn: string
  moveHistory: MoveRecord[]
  captured: { team: string; typeId: string; by: string }[]
  winner: string | 'draw' | null
  scores: Record<string, number>
  status: 'active' | 'checkmate' | 'stalemate' | 'royal-captured' | 'eliminated' | 'points'
}
