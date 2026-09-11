import React, { useId, useMemo, useState } from 'react';
import { Chess, Move, PieceSymbol, Square } from 'chess.js';
import './game.css';

export type BoardMove = { from: string; to: string; promotion?: string };
export type ChessBoardProps = {
  fen: string;
  onMove?: (move: BoardMove) => void;
  orientation?: 'w' | 'b';
  disabled?: boolean;
  lastMove?: { from: string; to: string };
  theme?: string;
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const symbols: Record<PieceSymbol, string> = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

/** Small, scalable vector piece. Kept deliberately geometric so it remains legible at 38px. */
export function Piece({ type, color, size = 74 }: { type: PieceSymbol; color: 'w' | 'b'; size?: number }) {
  const filterId = useId().replace(/:/g, '');
  const fill = color === 'w' ? '#fffaf0' : '#21352b';
  const stroke = color === 'w' ? '#927d5d' : '#0b1510';
  const letter = symbols[type];
  return <svg className={`nim-piece piece-${type} piece-${color}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
    <defs><filter id={`piece-shadow-${filterId}`}><feDropShadow dx="0" dy="2" stdDeviation="1.6" floodOpacity=".28" /></filter></defs>
    <g fill={fill} stroke={stroke} strokeWidth="3" strokeLinejoin="round" filter={`url(#piece-shadow-${filterId})`}>
      {type === 'p' && <><path d="M50 16c-10 0-15 8-15 16 0 6 3 10 7 13l-11 37h38L58 45c4-3 7-7 7-13 0-8-5-16-15-16z"/><path d="M26 82h48v7H26z"/></>}
      {type === 'n' && <><path d="M27 87h48v-7H65c2-13-2-22-13-28l-9-7c8-1 15 2 21 7 4-14-4-27-16-33l-4 12-11 6 7 8c-13 10-18 24-13 35h-7v7z"/><circle cx="51" cy="28" r="2" fill={stroke}/></>}
      {type === 'b' && <><path d="M50 13c-10 0-16 8-16 17 0 8 4 14 9 20L30 81h40L57 50c5-6 9-12 9-20 0-9-6-17-16-17z"/><path d="m42 20 16 25M27 82h46v7H27z"/></>}
      {type === 'r' && <><path d="M28 13h11v12h7V13h8v12h7V13h11v17l-8 8 5 42H31l5-42-8-8z"/><path d="M29 81h42v8H29z"/></>}
      {type === 'q' && <><path d="m20 18 11 11 9-15 10 17 10-17 9 15 11-11-7 48H27z"/><path d="M24 81h52v8H24z"/></>}
      {type === 'k' && <><path d="M45 9h10v12h10v9H55v9h14l-5 42H36l-5-42h14v-9H35v-9h10z"/><path d="M28 81h44v8H28z"/></>}
    </g>
  </svg>;
}

export default function ChessBoard({ fen, onMove, orientation = 'w', disabled = false, lastMove, theme = 'ivory-sage' }: ChessBoardProps) {
  const game = useMemo(() => { try { return new Chess(fen); } catch { return new Chess(); } }, [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const legal = useMemo(() => selected ? game.moves({ square: selected as Square, verbose: true }) as Move[] : [], [game, selected]);
  const legalTargets = new Set(legal.map(move => move.to));
  const ranks = orientation === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const shownFiles = orientation === 'w' ? files : [...files].reverse();

  const attempt = (from: string, to: string) => {
    if (disabled || from === to) return;
    const moves = game.moves({ square: from as Square, verbose: true }) as Move[];
    const candidate = moves.find(move => move.to === to);
    if (!candidate) return;
    if (candidate.promotion) { setPromotion({ from, to }); return; }
    onMove?.({ from, to }); setSelected(null);
  };
  const finishPromotion = (piece: string) => { if (promotion) onMove?.({ ...promotion, promotion: piece }); setPromotion(null); setSelected(null); };

  return <div className={`chess-board-wrap theme-${theme}`}>
    <div className="chess-board" role="grid" aria-label="Chess board">
      {ranks.flatMap(rank => shownFiles.map(file => {
        const square = `${file}${rank}` as Square;
        const piece = game.get(square);
        const isLight = (files.indexOf(file) + rank) % 2 === 1;
        const isLast = lastMove?.from === square || lastMove?.to === square;
        const isTarget = legalTargets.has(square);
        return <button key={square} type="button" role="gridcell" className={`board-square ${isLight ? 'light' : 'dark'} ${selected === square ? 'selected' : ''} ${isLast ? 'last-move' : ''} ${isTarget ? 'legal-target' : ''}`}
          aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`} disabled={disabled}
          draggable={Boolean(piece && !disabled)} onDragStart={() => { setDragFrom(square); setSelected(square); }} onDragOver={event => { if (dragFrom) event.preventDefault(); }} onDrop={() => { if (dragFrom) attempt(dragFrom, square); setDragFrom(null); }}
          onClick={() => { if (selected && legalTargets.has(square)) attempt(selected, square); else if (piece && piece.color === game.turn()) setSelected(square); else setSelected(null); }}>
          {(file===shownFiles[0]||rank===ranks[7])&&<span className="square-coordinate">{file===shownFiles[0]?rank:''}{rank===ranks[7]?file:''}</span>}
          {piece && <Piece type={piece.type} color={piece.color} size={72} />}
          {isTarget && !piece && <span className="move-dot" aria-hidden="true" />}
          {isTarget && piece && <span className="capture-ring" aria-hidden="true" />}
        </button>;
      }))}
    </div>
    {promotion && <div className="promotion-popover" role="dialog" aria-label="Choose promotion">
      <span>Promote pawn</span><div>{(['q','r','b','n'] as PieceSymbol[]).map(type => <button key={type} type="button" onClick={() => finishPromotion(type)}><Piece type={type} color={game.turn()} size={44} /><span>{type.toUpperCase()}</span></button>)}</div>
    </div>}
  </div>;
}
