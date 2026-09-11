import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { chooseMove, legalMoves } from './engine';

test('engine always returns a legal opening move', () => {
  const move = chooseMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'easy');
  assert.ok(move); assert.ok(legalMoves('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').some(x => x.from === move.from && x.to === move.to));
});

test('engine finds a mate in one and handles terminal positions', () => {
  const fen = '6k1/5ppp/8/8/8/6Q1/5PPP/6K1 w - - 0 1';
  const move = chooseMove(fen, 'hard');
  assert.ok(move); const after = new Chess(fen); after.move(move); assert.equal(after.isCheckmate(), true);
  assert.equal(chooseMove('7k/5Q2/7K/8/8/8/8/8 b - - 0 1'), null);
});

test('legal move generation includes castling, en passant, and promotion', () => {
  assert.ok(legalMoves('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').some(x => x.from === 'e1' && x.to === 'g1'));
  assert.ok(legalMoves('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2').some(x => x.from === 'e5' && x.to === 'd6'));
  assert.ok(legalMoves('4k3/P7/8/8/8/8/8/4K3 w - - 0 1').some(x => x.from === 'a7' && x.to === 'a8' && x.promotion === 'q'));
});
