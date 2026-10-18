import type {
  GameState, Ruleset, PieceType, PieceInstance, Move, Vec, MovePattern,
  Tile, MoveRecord, SpecialEffect, TeamId,
} from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

export function getTurnOrder(ruleset: Ruleset): TeamId[] {
  if (ruleset.turnOrder.kind === 'custom') return ruleset.turnOrder.order.slice();
  return ruleset.teams.slice();
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

export function getPieceType(state: GameState, pieceId: string): PieceType | null {
  const inst = state.pieces[pieceId];
  if (!inst) return null;
  return state.pieceTypes[inst.typeId] ?? null;
}

export function inBounds(cfg: { width: number; height: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < cfg.width && y < cfg.height;
}

export function getTile(ruleset: Ruleset, x: number, y: number): Tile | null {
  if (!inBounds(ruleset.board, x, y)) return null;
  return ruleset.board.tiles[y]?.[x] ?? null;
}

export function resolveDestination(ruleset: Ruleset, x: number, y: number): Vec | null {
  const tile = getTile(ruleset, x, y);
  if (!tile) return null;
  if (tile.behavior === 'void' || tile.behavior === 'impassable') return null;
  if (tile.behavior === 'portal') {
    if (tile.portalTarget) return { x: tile.portalTarget.x, y: tile.portalTarget.y };
    // wrap to opposite
    return { x: ruleset.board.width - 1 - x, y: ruleset.board.height - 1 - y };
  }
  return { x, y };
}

export function createInitialState(ruleset: Ruleset): GameState {
  const board: (string | null)[][] = Array.from({ length: ruleset.board.height }, () =>
    Array.from({ length: ruleset.board.width }, () => null),
  );
  const pieces: Record<string, PieceInstance> = {};
  const pieceTypes: Record<string, PieceType> = {};
  for (const pt of ruleset.pieceTypes) pieceTypes[pt.id] = pt;

  for (const s of ruleset.setup) {
    const pt = pieceTypes[s.typeId];
    if (!pt) continue;
    if (!inBounds(ruleset.board, s.x, s.y)) continue;
    const id = uid();
    pieces[id] = { id, typeId: s.typeId, team: pt.team, hasMoved: false };
    if (board[s.y][s.x] === null) board[s.y][s.x] = id;
  }

  const scores: Record<string, number> = {};
  for (const t of ruleset.teams) scores[t] = 0;

  return {
    ruleset,
    board,
    pieces,
    pieceTypes,
    turn: ruleset.teams[0],
    turnIndex: 0,
    moveHistory: [],
    captured: [],
    winner: null,
    draw: false,
    scores,
  };
}

function isEnemy(a: TeamId, b: TeamId): boolean {
  return a !== b;
}

export function getPseudoMoves(state: GameState, x: number, y: number): Move[] {
  const ruleset = state.ruleset;
  const pieceId = state.board[y]?.[x];
  if (!pieceId) return [];
  const inst = state.pieces[pieceId];
  if (!inst) return [];
  const pt = state.pieceTypes[inst.typeId];
  if (!pt) return [];
  const moves: Move[] = [];
  const seen = new Set<string>();

  const addMove = (fx: number, fy: number, tx: number, ty: number, capturedId?: string, effects?: SpecialEffect[]) => {
    const final = resolveDestination(ruleset, tx, ty);
    if (!final) return;
    if (!inBounds(ruleset.board, final.x, final.y)) return;
    // void/impassable already handled
    const destTile = getTile(ruleset, final.x, final.y);
    if (!destTile || destTile.behavior === 'void' || destTile.behavior === 'impassable') return;
    const key = `${final.x},${final.y}`;
    if (seen.has(key)) return;
    // occupancy check
    const occupant = state.board[final.y]?.[final.x];
    if (capturedId === undefined) {
      // non-capture: dest must be empty
      if (occupant !== null) return;
    } else {
      // capture: dest must contain enemy
      if (occupant === null) return;
      const occInst = state.pieces[occupant];
      if (!occInst || !isEnemy(inst.team, occInst.team)) return;
      const occPt = state.pieceTypes[occInst.typeId];
      if (occPt?.modifiers.uncapturable) return;
    }
    seen.add(key);
    moves.push({
      from: { x: fx, y: fy },
      to: { x: tx, y: ty },
      pieceId,
      capturedId,
      effects: effects ?? pt.effects.slice(),
      finalTo: final,
    });
  };

  const movePatterns = pt.movePattern;
  const capturePatterns = pt.capturePattern.length ? pt.capturePattern : pt.movePattern;

  const slide = (pattern: MovePattern, mode: 'move' | 'capture') => {
    if (pattern.kind === 'stepper') {
      for (const off of pattern.offsets) {
        const tx = x + off.dx;
        const ty = y + off.dy;
        // tile/portal resolve happens in addMove; but for steppers we just propose
        if (mode === 'move') addMove(x, y, tx, ty, undefined);
        else {
          // capture: need enemy at resolved dest; addMove with capturedId placeholder resolved later
          // We'll handle occupancy in addMove; pass a marker by checking occupant now
          const final = resolveDestination(ruleset, tx, ty);
          if (!final) continue;
          const occ = state.board[final.y]?.[final.x];
          if (occ) {
            const occInst = state.pieces[occ];
            if (occInst && isEnemy(inst.team, occInst.team)) {
              addMove(x, y, tx, ty, occ);
            }
          }
        }
      }
    } else {
      // slider
      for (const dir of pattern.directions) {
        const max = pattern.maxSteps ?? Math.max(ruleset.board.width, ruleset.board.height);
        for (let step = 1; step <= max; step++) {
          const tx = x + dir.dx * step;
          const ty = y + dir.dy * step;
          if (!inBounds(ruleset.board, tx, ty) && !pt.modifiers.canJump) {
            // if canJump, allow wrap? no, bounds still
          }
          // resolve tile
          const final = resolveDestination(ruleset, tx, ty);
          if (!final) {
            if (!pt.modifiers.canJump) break;
            continue;
          }
          if (!inBounds(ruleset.board, final.x, final.y)) {
            if (!pt.modifiers.canJump) break;
            continue;
          }
          const occ = state.board[final.y]?.[final.x];
          if (mode === 'move') {
            if (occ === null) {
              addMove(x, y, tx, ty, undefined);
              if (!pt.modifiers.canJump) {
                // continue sliding
              } else {
                // can jump over, continue
              }
            } else {
              // blocked
              if (!pt.modifiers.canJump) break;
              // else continue
            }
          } else {
            if (occ !== null) {
              const occInst = state.pieces[occ];
              if (occInst && isEnemy(inst.team, occInst.team)) {
                const occPt = state.pieceTypes[occInst.typeId];
                if (!occPt?.modifiers.uncapturable) {
                  addMove(x, y, tx, ty, occ);
                }
              }
              if (!pt.modifiers.canJump) break;
            } else {
              // empty, continue
            }
          }
          // stopping condition for non-jump sliders
          if (!pt.modifiers.canJump && occ !== null) break;
          // also stop if we hit board edge naturally handled by bounds
          if (!inBounds(ruleset.board, tx, ty)) break;
        }
      }
    }
  };

  // move mode from movePatterns (empty dests)
  for (const p of movePatterns) slide(p, 'move');
  // capture mode from capturePatterns (enemy dests)
  for (const p of capturePatterns) slide(p, 'capture');

  // mustCaptureToMove: discard non-capturing moves
  if (pt.modifiers.mustCaptureToMove) {
    return moves.filter(m => !!m.capturedId);
  }
  return moves;
}

export function isInCheck(state: GameState, team: TeamId): boolean {
  // find royal pieces of team
  const royals: string[] = [];
  for (const id in state.pieces) {
    const inst = state.pieces[id];
    const pt = state.pieceTypes[inst.typeId];
    if (inst.team === team && pt?.modifiers.royal) royals.push(id);
  }
  if (royals.length === 0) return false;

  // for each opponent, see if any capture move targets a royal
  const opponents = state.ruleset.teams.filter(t => t !== team);
  for (const opp of opponents) {
    // generate pseudo captures for all opp pieces
    for (const id in state.pieces) {
      const inst = state.pieces[id];
      if (inst.team !== opp) continue;
      const pt = state.pieceTypes[inst.typeId];
      if (!pt) continue;
      // find position
      let pos: Vec | null = null;
      outer: for (let y = 0; y < state.ruleset.board.height; y++)
        for (let x = 0; x < state.ruleset.board.width; x++)
          if (state.board[y][x] === id) { pos = { x, y }; break outer; }
      if (!pos) continue;
      const caps = getPseudoMoves(state, pos.x, pos.y).filter(m => !!m.capturedId);
      for (const m of caps) {
        const capInst = m.capturedId ? state.pieces[m.capturedId] : null;
        const capPt = capInst ? state.pieceTypes[capInst.typeId] : null;
        if (capInst && capInst.team === team && capPt?.modifiers.royal) return true;
      }
    }
  }
  return false;
}

export function applyMove(state: GameState, move: Move, computeWinner: boolean = true): GameState {
  const next = cloneState(state);
  const inst = next.pieces[move.pieceId];
  if (!inst) return next;

  // handle captured
  const hasSwap = move.effects.some(e => e.kind === 'swap');
  if (move.capturedId) {
    const capInst = next.pieces[move.capturedId];
    if (capInst) {
      if (hasSwap) {
        // don't capture; will swap positions
      } else {
        const capPt = next.pieceTypes[capInst.typeId];
        next.captured.push({ team: inst.team, pieceId: move.capturedId, typeId: capInst.typeId });
        if (capPt) next.scores[inst.team] = (next.scores[inst.team] ?? 0) + capPt.pointValue;
        delete next.pieces[move.capturedId];
      }
    }
  }
  // leftover capture
  // (handled above in board occupancy; but we also pushed? no, handle scoring for leftover)
  // We'll handle leftover royal capture scoring in explosion? skip

  // move piece
  const fx = move.finalTo.x, fy = move.finalTo.y;
  // swap handling
  if (hasSwap && move.capturedId && next.pieces[move.capturedId]) {
    const capInst = next.pieces[move.capturedId];
    // move captured to origin
    // remove origin
    if (next.board[move.from.y]?.[move.from.x] === move.pieceId) next.board[move.from.y][move.from.x] = null;
    // if dest occupied by captured, clear
    if (next.board[fy]?.[fx] === move.capturedId) next.board[fy][fx] = null;
    next.board[fy][fx] = move.pieceId;
    next.board[move.from.y][move.from.x] = move.capturedId;
    capInst.hasMoved = true;
    inst.hasMoved = true;
  } else {
    if (next.board[move.from.y]?.[move.from.x] === move.pieceId) next.board[move.from.y][move.from.x] = null;
    if (next.board[fy]?.[fx] && next.board[fy][fx] !== move.pieceId) {
      const leftover = next.board[fy][fx]!;
      const linst = next.pieces[leftover];
      if (linst) {
        const lpt = next.pieceTypes[linst.typeId];
        next.captured.push({ team: inst.team, pieceId: leftover, typeId: linst.typeId });
        if (lpt) next.scores[inst.team] = (next.scores[inst.team] ?? 0) + lpt.pointValue;
        delete next.pieces[leftover];
      }
    }
    next.board[fy][fx] = move.pieceId;
    inst.hasMoved = true;
  }

  // special effects
  for (const eff of move.effects) {
    if (eff.kind === 'swap') {
      // swap handled during move application already
    } else if (eff.kind === 'explosion') {
      const r = eff.radius;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ex = fx + dx, ey = fy + dy;
          if (!inBounds(next.ruleset.board, ex, ey)) continue;
          const occ = next.board[ey]?.[ex];
          if (occ && occ !== move.pieceId) {
            const oinst = next.pieces[occ];
            if (oinst) {
              const opt = next.pieceTypes[oinst.typeId];
              // don't explode royals? allow
              next.captured.push({ team: inst.team, pieceId: occ, typeId: oinst.typeId });
              if (opt) next.scores[inst.team] = (next.scores[inst.team] ?? 0) + opt.pointValue;
              delete next.pieces[occ];
            }
            next.board[ey][ex] = null;
          }
        }
    } else if (eff.kind === 'spawn') {
      const pt = next.pieceTypes[eff.pieceTypeId];
      if (pt) {
        const sx = move.from.x + eff.offset.dx;
        const sy = move.from.y + eff.offset.dy;
        if (inBounds(next.ruleset.board, sx, sy) && next.board[sy]?.[sx] === null) {
          const sid = uid();
          next.pieces[sid] = { id: sid, typeId: eff.pieceTypeId, team: inst.team, hasMoved: false };
          next.board[sy][sx] = sid;
        }
      }
    }
  }

  // swap effect handling simpler: if swap in effects, and there was a captured piece, we actually want to swap positions rather than capture.
  // Re-implement swap as special: before capture deletion, swap. But we already deleted. Let's handle swap separately before capture above.
  // (We'll leave swap as no-op extra; instead implement swap by not deleting captured and moving it to origin.) 
  // To keep consistent, redo: swap effect handled by swapping inst with captured at origin. Since captured deleted, skip.

  // record
  const rec: MoveRecord = {
    move,
    turn: state.turn,
    notation: `${move.pieceId}@${move.from.x},${move.from.y}->${fx},${fy}`,
  };
  next.moveHistory = [...next.moveHistory, rec];

  // switch turn
  const order = getTurnOrder(next.ruleset);
  const idx = order.indexOf(next.turn);
  const nextIdx = (idx + 1) % order.length;
  // turnIndex increment
  next.turnIndex = next.turnIndex + 1;
  next.turn = order[nextIdx];

  // winner detection
  if (computeWinner) {
    next.winner = detectWinner(next, state.turn);
  } else {
    next.winner = state.winner;
  }

  return next;
}

function detectWinner(state: GameState, mover: TeamId): TeamId | 'draw' | null {
  const ruleset = state.ruleset;
  // kingCapture checked below via captured list

  // kingCapture win condition
  for (const wc of ruleset.winConditions) {
    if (wc.kind === 'kingCapture') {
      // if any royal of opponent captured this move
      // determine captured piece type from move.capturedId via history? We'll search captured pieces removed.
      // We'll check: if move.capturedId and its original type was royal.
      // Since piece deleted, look up in a temp map not available. Instead check: if last captured piece id === move.capturedId and its type royal? We didn't store. 
      // Fallback: check if opponent has fewer royals now.
    }
  }

  // elimination
  for (const wc of ruleset.winConditions) {
    if (wc.kind === 'elimination') {
      for (const team of ruleset.teams) {
        const hasPieces = Object.values(state.pieces).some(p => p.team === team);
        if (!hasPieces) {
          // mover wins if team eliminated is opponent
          const opponents = ruleset.teams.filter(t => t !== mover);
          if (opponents.includes(team)) return mover;
        }
      }
    }
  }

  // points
  for (const wc of ruleset.winConditions) {
    if (wc.kind === 'points') {
      if ((state.scores[mover] ?? 0) >= wc.threshold) return mover;
    }
  }

  if (ruleset.winConditions.some(wc => wc.kind === 'kingCapture')) {
    const last = state.captured[state.captured.length - 1];
    if (last && last.team === mover) {
      const pt = state.pieceTypes[last.typeId];
      // pieceTypes still has type def even if instance deleted
      if (pt?.modifiers.royal) return mover;
    }
  }

  // checkmate / stalemate detection for current player (state.turn already switched)
  const hasLegal = hasAnyLegalMove(state, state.turn);
  if (!hasLegal) {
    const inChk = isInCheck(state, state.turn);
    if (inChk) {
      // mover wins if checkmate condition enabled
      if (ruleset.winConditions.some(wc => wc.kind === 'checkmate' || wc.kind === 'kingCapture')) {
        return mover;
      }
    } else {
      return 'draw';
    }
  }
  return null;
}

// kingCapture detection improved: track royal captured by checking if mover captured a royal piece this move.
// We'll patch: in applyMove, before deleting captured, record if royal. But detectWinner runs after. Let's instead
// add a helper isRoyalCaptured. We'll modify applyMove to set winner for kingCapture there? 
// To keep detectWinner working, we can check: did the number of royal pieces of any opponent decrease? Compare not available.
// We'll instead handle kingCapture in applyMove directly by overriding winner after detectWinner.

export function hasAnyLegalMove(state: GameState, team: TeamId): boolean {
  if (state.turn !== team) {
    // still generate for team by temporarily? We'll just generate for all pieces of team regardless of turn
  }
  for (let y = 0; y < state.ruleset.board.height; y++)
    for (let x = 0; x < state.ruleset.board.width; x++) {
      const id = state.board[y][x];
      if (!id) continue;
      const inst = state.pieces[id];
      if (!inst || inst.team !== team) continue;
      const moves = getLegalMoves(state, x, y);
      if (moves.length > 0) return true;
    }
  return false;
}

export function getLegalMoves(state: GameState, x: number, y: number): Move[] {
  const pseudo = getPseudoMoves(state, x, y);
  const pieceId = state.board[y]?.[x];
  if (!pieceId) return [];
  const inst = state.pieces[pieceId];
  if (!inst) return [];
  const result: Move[] = [];
  for (const m of pseudo) {
    const next = applyMove(state, m, false);
    // ensure mover's team not in check after
    if (!isInCheck(next, inst.team)) {
      result.push(m);
    }
  }
  return result;
}