import { chooseMove, EngineDifficulty } from './engine';

self.onmessage = (event: MessageEvent<{ fen: string; difficulty?: EngineDifficulty }>) => {
  const move = chooseMove(event.data.fen, event.data.difficulty ?? 'medium');
  self.postMessage(move);
};

