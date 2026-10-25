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

/** The shapes a piece can be drawn from. */
export type ArtShape = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn'

/**
 * One shape in the drawing of a piece.
 *
 * The shapes are the chess pieces as they are normally drawn. A piece that is
 * made of several of them is drawn by stacking them: the last shape is the
 * one on top.
 */
export interface PieceArtLayer {
  shape: ArtShape
  /** Where the shape sits, in the 45 by 45 space the pieces are drawn in. */
  x: number
  y: number
  /** How large the shape is. 1 is its normal size. */
  scale: number
  /** Show only the crown of the shape — everything above its pedestal. */
  crown?: boolean
}

/** The drawing of a piece, shape by shape. */
export type PieceArt = PieceArtLayer[]

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
  /** May capture a piece that just stepped two squares past an attacked square. */
  enPassant: boolean
  /** Rolls a die to pick how it moves. */
  dice: boolean
  /** Turns into a random other piece after every move. */
  random: boolean
}

export type Effect =
  | { kind: 'swap' }
  | { kind: 'explosion'; radius: number }
  | { kind: 'spawn'; pieceTypeId: string; offset: Vec }

export interface Promotion {
  /** The piece types this piece may become on the far rank. */
  typeIds: string[]
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
  /** A drawing of the piece, made of the shapes below. Wins over the icon. */
  art?: PieceArt
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
  | 'center'
  | 'threeCheck'
  | 'antichess'
  | 'race'

export interface WinCondition {
  id: string
  kind: WinConditionKind
  /** points only */
  threshold?: number
}

/**
 * Extra rules a variant can be built on, on top of how its pieces move.
 * They change the way a move is played or judged, not who wins.
 */
export type VariantRule =
  /** Every capture sets off an explosion around the square it landed on. */
  | 'atomic'
  /** Captured pieces join a hand and may be dropped back on the board. */
  | 'crazyhouse'
  /** When a capture is on the board, taking it is the only move allowed. */
  | 'forcedCapture'
  /** Checking the opponent is itself against the rules. */
  | 'noCheck'
  /** The king and the rook never swap places. */
  | 'noCastle'

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
  /** The rules this variant plays under, beyond the pieces themselves. */
  rules?: VariantRule[]
  /**
   * The seed the random pieces are rolled from. The same seed always plays
   * the same game, so a game can be rebuilt and shared.
   */
  randomSeed?: number
}

/* ---------------------------------------------------------- game state */

export interface CastleInfo {
  /** The rook that moves with the king. */
  rookId: string
  rookFrom: Vec
  rookTo: Vec
  /** Which way the king travels: 1 is toward the h-file, -1 toward the a-file. */
  dir?: 1 | -1
}

export interface Move {
  from: Vec
  to: Vec
  pieceId: string
  capturedId?: string
  /** Where the captured piece stood, when it is not the destination (en passant). */
  capturedAt?: Vec
  effects: Effect[]
  /** Final square after portals. */
  finalTo: Vec
  promotionTypeId?: string
  /** The die this move was made with, for a piece that rolls to move. */
  roll?: number
  /** The pieces this move may promote into. The player picks one. */
  promotionOptions?: string[]
  /** Set when this move is a king-side or queen-side castle. */
  castle?: CastleInfo
  /** Set when the piece comes out of a pocket instead of off the board. */
  drop?: { typeId: string }
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
  /** The move in algebraic notation, for PGN. */
  san?: string
  /** What identifies the position after this move, for repetition. */
  positionKey?: string
  /** How often this position has now come up. */
  repeats?: number
  capturedName?: string
  blasts?: Blast[]
  /** Release point of a dragged move, in board units, for the drop animation. */
  origin?: Vec
}

export interface PieceInstance {
  id: string
  typeId: string
  team: string
  hasMoved: boolean
  /** What this piece was before it promoted — a captured one returns to a pocket as it. */
  promotedFrom?: string
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
  /** How many checks each team has given, in a game of Three-Check. */
  checks?: Record<string, number>
  /** What each team holds in its pocket, in a game of Crazyhouse. */
  hands?: Record<string, Record<string, number>>
  /** The die a piece rolled to pick its move, while it is being chosen. */
  roll?: { pieceId: string; value: number }
  /** What identifies the position the game started from, for repetition. */
  startKey?: string
  status:
    | 'active'
    | 'checkmate'
    | 'stalemate'
    | 'royal-captured'
    | 'eliminated'
    | 'points'
    | 'timeout'
    | 'threefold'
    | 'resign'
    | 'center'
    | 'three-check'
    | 'antichess'
    | 'race'
  /** Where the rolls of the random pieces stand, so a game can be rebuilt. */
  randomSeed?: number
}
