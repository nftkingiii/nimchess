import { Chess, Move, Square } from 'chess.js';

export type EngineDifficulty = 'easy' | 'medium' | 'hard';
export type EngineMove = { from: string; to: string; promotion?: string };

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20_000 };
const DEPTH: Record<EngineDifficulty, number> = { easy: 1, medium: 2, hard: 3 };

function evaluate(game: Chess): number {
  if (game.isCheckmate()) return game.turn() === 'w' ? -999_999 : 999_999;
  if (game.isDraw() || game.isStalemate()) return 0;
  return game.board().reduce((total, row) => total + row.reduce((sum, piece) => {
    if (!piece) return sum;
    return sum + (piece.color === 'w' ? VALUES[piece.type] : -VALUES[piece.type]);
  }, 0), 0);
}

function search(game: Chess, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || game.isGameOver()) {
    const score = evaluate(game);
    return game.turn() === 'w' ? score : -score;
  }
  let best = -Infinity;
  for (const move of game.moves({ verbose: true }) as Move[]) {
    game.move(move);
    best = Math.max(best, -search(game, depth - 1, -beta, -alpha));
    game.undo();
    alpha = Math.max(alpha, best);
    if (alpha >= beta) break;
  }
  return best;
}

/** Returns a legal move without mutating the caller's position. */
export function chooseMove(fen: string, difficulty: EngineDifficulty = 'medium'): EngineMove | null {
  let game: Chess;
  try { game = new Chess(fen); } catch { return null; }
  const legal = game.moves({ verbose: true }) as Move[];
  if (!legal.length) return null;
  const depth = DEPTH[difficulty];
  let bestScore = -Infinity;
  let choices: Move[] = [];
  for (const move of legal) {
    game.move(move);
    const score = -search(game, depth - 1, -Infinity, Infinity);
    game.undo();
    if (score > bestScore) { bestScore = score; choices = [move]; }
    else if (score === bestScore) choices.push(move);
  }
  // Stable tie-breaking keeps demos and tests reproducible while still
  // making easy/medium/hard differ through search depth.
  const picked = choices[0];
  return { from: picked.from, to: picked.to, ...(picked.promotion ? { promotion: picked.promotion } : {}) };
}

export function legalMoves(fen: string, square?: string): EngineMove[] {
  try {
    const game = new Chess(fen);
    return (game.moves(square ? { square: square as Square, verbose: true } : { verbose: true }) as Move[])
      .map(move => ({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }));
  } catch { return []; }
}

