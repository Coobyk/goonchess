import type { Ruleset, PieceType, TeamId } from './types';
import { uid } from './engine';

const mkPiece = (p: Omit<PieceType, 'id'> & { id?: string }): PieceType => ({ id: p.id ?? uid(), ...p });

const mods = (o: Partial<PieceType['modifiers']> = {}): PieceType['modifiers'] => ({
  canJump: false, mustCaptureToMove: false, uncapturable: false, royal: false, ...o,
});

const stepper = (offsets: {dx:number;dy:number}[]): PieceType['movePattern'] => [{ kind: 'stepper', offsets }];
const slider = (directions: {dx:number;dy:number}[], maxSteps?: number): PieceType['movePattern'] => [{ kind: 'slider', directions, maxSteps }];

const ORTH = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
const DIAG = [{dx:1,dy:1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:-1,dy:-1}];
const ALL8 = [...ORTH, ...DIAG];
const KNIGHT = [{dx:2,dy:1},{dx:2,dy:-1},{dx:-2,dy:1},{dx:-2,dy:-1},{dx:1,dy:2},{dx:1,dy:-2},{dx:-1,dy:2},{dx:-1,dy:-2}];

function board(w:number,h:number, light='#f0d9b5', dark='#b58863'): Ruleset['board'] {
  const tiles = Array.from({length:h}, () => Array.from({length:w}, () => ({ behavior: 'normal' as const })));
  return { width: w, height: h, tiles, lightColor: light, darkColor: dark };
}

export function orthodoxChess(): Ruleset {
  const white = 'white', black = 'black';
  const king = mkPiece({ name:'King', symbol:'♔', pointValue:0, team:white, movePattern:stepper(ALL8), capturePattern:[], modifiers:mods({royal:true}), effects:[] });
  const queen = mkPiece({ name:'Queen', symbol:'♕', pointValue:9, team:white, movePattern:slider([...ORTH,...DIAG]), capturePattern:[], modifiers:mods(), effects:[] });
  const rook = mkPiece({ name:'Rook', symbol:'♖', pointValue:5, team:white, movePattern:slider(ORTH), capturePattern:[], modifiers:mods(), effects:[] });
  const bishop = mkPiece({ name:'Bishop', symbol:'♗', pointValue:3, team:white, movePattern:slider(DIAG), capturePattern:[], modifiers:mods(), effects:[] });
  const knight = mkPiece({ name:'Knight', symbol:'♘', pointValue:3, team:white, movePattern:stepper(KNIGHT), capturePattern:[], modifiers:mods({canJump:true}), effects:[] });
  const pawnW = mkPiece({ name:'Pawn', symbol:'♙', pointValue:1, team:white, movePattern:stepper([{dx:0,dy:-1}]), capturePattern:stepper([{dx:-1,dy:-1},{dx:1,dy:-1}]), modifiers:mods(), effects:[] });

  const K = mkPiece({ name:'King', symbol:'♚', pointValue:0, team:black, movePattern:stepper(ALL8), capturePattern:[], modifiers:mods({royal:true}), effects:[] });
  const Q = mkPiece({ name:'Queen', symbol:'♛', pointValue:9, team:black, movePattern:slider([...ORTH,...DIAG]), capturePattern:[], modifiers:mods(), effects:[] });
  const R = mkPiece({ name:'Rook', symbol:'♜', pointValue:5, team:black, movePattern:slider(ORTH), capturePattern:[], modifiers:mods(), effects:[] });
  const B = mkPiece({ name:'Bishop', symbol:'♝', pointValue:3, team:black, movePattern:slider(DIAG), capturePattern:[], modifiers:mods(), effects:[] });
  const N = mkPiece({ name:'Knight', symbol:'♞', pointValue:3, team:black, movePattern:stepper(KNIGHT), capturePattern:[], modifiers:mods({canJump:true}), effects:[] });
  const pawnB = mkPiece({ name:'Pawn', symbol:'♟', pointValue:1, team:black, movePattern:stepper([{dx:0,dy:1}]), capturePattern:stepper([{dx:-1,dy:1},{dx:1,dy:1}]), modifiers:mods(), effects:[] });

  const types = [king,queen,rook,bishop,knight,pawnW,K,Q,R,B,N,pawnB];
  // fix ids by name for setup references
  const byName = (name:string, team:TeamId) => types.find(t=>t.name===name && t.team===team)!.id;

  const setup: Ruleset['setup'] = [];
  const backRank = (team:TeamId, y:number) => {
    const order = ['Rook','Knight','Bishop','Queen','King','Bishop','Knight','Rook'];
    order.forEach((n,x) => setup.push({ typeId: byName(n, team), x, y }));
  };
  backRank(black, 0);
  for (let x=0;x<8;x++) setup.push({ typeId: byName('Pawn', black), x, y:1 });
  backRank(white, 7);
  for (let x=0;x<8;x++) setup.push({ typeId: byName('Pawn', white), x, y:6 });

  return {
    id: 'orthodox',
    name: 'Orthodox Chess',
    board: board(8,8),
    pieceTypes: types,
    setup,
    teams: [white, black],
    turnOrder: { kind: 'alternating' },
    winConditions: [{kind:'checkmate'}, {kind:'kingCapture'}],
  };
}

export function speedChess(): Ruleset {
  // 6x6, queens+rooks+knights, pawns move 2
  const white='white', black='black';
  const king = mkPiece({ name:'King', symbol:'♔', pointValue:0, team:white, movePattern:stepper(ALL8), capturePattern:[], modifiers:mods({royal:true}), effects:[] });
  const queen = mkPiece({ name:'Queen', symbol:'♕', pointValue:9, team:white, movePattern:slider([...ORTH,...DIAG]), capturePattern:[], modifiers:mods(), effects:[] });
  const rook = mkPiece({ name:'Rook', symbol:'♖', pointValue:5, team:white, movePattern:slider(ORTH), capturePattern:[], modifiers:mods(), effects:[] });
  const knight = mkPiece({ name:'Knight', symbol:'♘', pointValue:3, team:white, movePattern:stepper(KNIGHT), capturePattern:[], modifiers:mods({canJump:true}), effects:[] });
  const pawnW = mkPiece({ name:'Pawn', symbol:'♙', pointValue:1, team:white, movePattern:stepper([{dx:0,dy:-1},{dx:0,dy:-2}]), capturePattern:stepper([{dx:-1,dy:-1},{dx:1,dy:-1}]), modifiers:mods(), effects:[] });

  const K = mkPiece({ name:'King', symbol:'♚', pointValue:0, team:black, movePattern:stepper(ALL8), capturePattern:[], modifiers:mods({royal:true}), effects:[] });
  const Q = mkPiece({ name:'Queen', symbol:'♛', pointValue:9, team:black, movePattern:slider([...ORTH,...DIAG]), capturePattern:[], modifiers:mods(), effects:[] });
  const R = mkPiece({ name:'Rook', symbol:'♜', pointValue:5, team:black, movePattern:slider(ORTH), capturePattern:[], modifiers:mods(), effects:[] });
  const N = mkPiece({ name:'Knight', symbol:'♞', pointValue:3, team:black, movePattern:stepper(KNIGHT), capturePattern:[], modifiers:mods({canJump:true}), effects:[] });
  const pawnB = mkPiece({ name:'Pawn', symbol:'♟', pointValue:1, team:black, movePattern:stepper([{dx:0,dy:1},{dx:0,dy:2}]), capturePattern:stepper([{dx:-1,dy:1},{dx:1,dy:1}]), modifiers:mods(), effects:[] });

  const types = [king,queen,rook,knight,pawnW,K,Q,R,N,pawnB];
  const byName = (name:string, team:TeamId) => types.find(t=>t.name===name && t.team===team)!.id;
  const setup: Ruleset['setup'] = [];
  // back ranks
  ['Rook','Knight','Queen','King','Queen','Rook'].forEach((n,x)=>setup.push({typeId:byName(n,black),x,y:0}));
  for(let x=0;x<6;x++) setup.push({typeId:byName('Pawn',black),x,y:1});
  ['Rook','Knight','Queen','King','Queen','Rook'].forEach((n,x)=>setup.push({typeId:byName(n,white),x,y:5}));
  for(let x=0;x<6;x++) setup.push({typeId:byName('Pawn',white),x,y:4});

  return {
    id:'speedchess', name:'Speed Chess',
    board: board(6,6),
    pieceTypes: types,
    setup,
    teams:[white,black],
    turnOrder:{kind:'alternating'},
    winConditions:[{kind:'checkmate'},{kind:'kingCapture'}],
  };
}

export function leaperChaos(): Ruleset {
  const white='white', black='black';
  // pieces: leapers with various jumps, can jump
  const jumps = [KNIGHT, [{dx:3,dy:1},{dx:3,dy:-1},{dx:-3,dy:1},{dx:-3,dy:-1},{dx:1,dy:3},{dx:1,dy:-3},{dx:-1,dy:3},{dx:-1,dy:-3}],
    [{dx:2,dy:2},{dx:2,dy:-2},{dx:-2,dy:2},{dx:-2,dy:-2}],
  ];
  const mkTeam = (team:TeamId) => {
    const pieces: PieceType[] = [];
    const king = mkPiece({ name:'King', symbol: team===white?'♔':'♚', pointValue:0, team, movePattern:stepper(ALL8), capturePattern:[], modifiers:mods({royal:true}), effects:[] });
    pieces.push(king);
    jumps.forEach((j,i) => {
      const sym = team===white ? ['♘','♞','♝'][i] : ['♞','♘','♝'][i];
      pieces.push(mkPiece({ name:`Leaper ${i+1}`, symbol: sym, pointValue:2, team, movePattern:stepper(j), capturePattern:[], modifiers:mods({canJump:true}), effects:[] }));
    });
    // explosion piece
    pieces.push(mkPiece({ name:'Bomber', symbol: '💣', pointValue:4, team, movePattern:stepper(ALL8), capturePattern:[], modifiers:mods(), effects:[{kind:'explosion',radius:1}] }));
    return pieces;
  };
  const wPieces = mkTeam(white);
  const bPieces = mkTeam(black);
  const types = [...wPieces, ...bPieces];
  const byName = (name:string, team:TeamId) => types.find(t=>t.name===name && t.team===team)!.id;

  const setup: Ruleset['setup'] = [];
  for (let x=0;x<8;x++) {
    setup.push({ typeId: byName('Leaper 1', black), x, y:0 });
    setup.push({ typeId: byName('Leaper 2', black), x, y:1 });
  }
  setup.push({ typeId: byName('King', black), x:3, y:0 });
  for (let x=0;x<8;x++) {
    setup.push({ typeId: byName('Leaper 1', white), x, y:6 });
    setup.push({ typeId: byName('Leaper 2', white), x, y:7 });
  }
  setup.push({ typeId: byName('King', white), x:4, y:7 });
  // bombers
  setup.push({ typeId: byName('Bomber', white), x:0, y:7 });
  setup.push({ typeId: byName('Bomber', black), x:7, y:0 });

  return {
    id:'leaper-chaos', name:'Leaper Chaos',
    board: board(8,8, '#1a1a2e', '#16213e'),
    pieceTypes: types,
    setup,
    teams:[white,black],
    turnOrder:{kind:'alternating'},
    winConditions:[{kind:'kingCapture'},{kind:'elimination'}],
  };
}

export const PRESETS = [orthodoxChess, speedChess, leaperChaos];

export function defaultRuleset(): Ruleset {
  return orthodoxChess();
}
