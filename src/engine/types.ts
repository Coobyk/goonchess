export type TeamId = string;

export interface Vec { x: number; y: number; }

export type TileBehavior = 'normal' | 'void' | 'impassable' | 'portal';

export interface Tile {
  behavior: TileBehavior;
  portalTarget?: Vec;
  colorOverride?: string;
}

export interface BoardConfig {
  width: number;
  height: number;
  tiles: Tile[][];
  lightColor: string;
  darkColor: string;
}

export interface MovementVector { dx: number; dy: number; }

export type MovePatternKind = 'stepper' | 'slider';

export interface StepperPattern {
  kind: 'stepper';
  offsets: MovementVector[];
}

export interface SliderPattern {
  kind: 'slider';
  directions: MovementVector[];
  maxSteps?: number;
}

export type MovePattern = StepperPattern | SliderPattern;

export interface PieceModifiers {
  canJump: boolean;
  mustCaptureToMove: boolean;
  uncapturable: boolean;
  royal: boolean;
}

export type SpecialEffect =
  | { kind: 'swap' }
  | { kind: 'explosion'; radius: number }
  | { kind: 'spawn'; pieceTypeId: string; offset: MovementVector };

export interface PieceType {
  id: string;
  name: string;
  symbol: string;
  svg?: string;
  pointValue: number;
  team: TeamId;
  movePattern: MovePattern[];
  capturePattern: MovePattern[];
  modifiers: PieceModifiers;
  effects: SpecialEffect[];
}

export interface PieceInstance {
  id: string;
  typeId: string;
  team: TeamId;
  hasMoved: boolean;
}

export type WinCondition =
  | { kind: 'checkmate' }
  | { kind: 'kingCapture' }
  | { kind: 'elimination' }
  | { kind: 'points'; threshold: number };

export type TurnOrder =
  | { kind: 'alternating' }
  | { kind: 'custom'; order: TeamId[] };

export interface Ruleset {
  id: string;
  name: string;
  board: BoardConfig;
  pieceTypes: PieceType[];
  setup: { typeId: string; x: number; y: number }[];
  teams: TeamId[];
  turnOrder: TurnOrder;
  winConditions: WinCondition[];
}

export interface Move {
  from: Vec;
  to: Vec;
  pieceId: string;
  capturedId?: string;
  effects: SpecialEffect[];
  // resolved final destination after portals
  finalTo: Vec;
}

export interface MoveRecord {
  move: Move;
  turn: TeamId;
  notation: string;
}

export interface GameState {
  ruleset: Ruleset;
  board: (string | null)[][]; // piece ids
  pieces: Record<string, PieceInstance>;
  pieceTypes: Record<string, PieceType>;
  turn: TeamId;
  turnIndex: number;
  moveHistory: MoveRecord[];
  captured: { team: TeamId; pieceId: string; typeId: string }[];
  winner: TeamId | 'draw' | null;
  draw: boolean;
  // scores: points captured per team
  scores: Record<string, number>;
}