import { describe, expect, it } from 'vitest';
import type { CardId } from './cards';
import { KlondikeGame } from './game';
import { hint } from './hint';
import { type KlondikeState, type Move, applyMove, deal } from './klondike';

function position(parts: { stock?: string; waste?: string; foundations?: string[]; tableau?: string[] }): KlondikeState {
  const list = (text: string | undefined): CardId[] =>
    (text ?? '').split(/\s+/).filter((token) => token !== '' && token !== '|');
  return {
    seed: 0,
    options: { drawCount: 1, scoring: 'standard' },
    stock: list(parts.stock),
    waste: list(parts.waste),
    wasteFan: Math.min(1, list(parts.waste).length),
    foundations: Array.from({ length: 4 }, (_, i) => list(parts.foundations?.[i])),
    tableau: Array.from({ length: 7 }, (_, i) => {
      const tokens = (parts.tableau?.[i] ?? '').split(/\s+/).filter(Boolean);
      const bar = tokens.indexOf('|');
      return { cards: list(parts.tableau?.[i]), faceDown: bar === -1 ? 0 : bar };
    }),
    score: 0,
    moves: 0,
    recycles: 0,
  };
}

describe('hint', () => {
  it('prefers a foundation move that uncovers a card', () => {
    const state = position({ waste: 'AH', tableau: ['9C | AS', '7D'] });
    expect(hint(state)).toEqual({
      type: 'move',
      from: { kind: 'tableau', index: 0 },
      to: { kind: 'foundation', index: 0 },
      count: 1,
    });
  });

  it('uncovers the deepest hidden pile first', () => {
    const state = position({ tableau: ['2C | 6H', '2D 3D 4D | 6D', '7S'] });
    const move = hint(state) as Extract<Move, { type: 'move' }>;
    expect(move.from).toEqual({ kind: 'tableau', index: 1 });
  });

  it('does not suggest pointless shuffling between piles', () => {
    const state = position({ tableau: ['8S 7H', '8C', 'KD'] });
    expect(hint(state)).toBeNull();
  });

  it('draws when nothing else helps', () => {
    expect(hint(position({ stock: '5S', tableau: ['KD'] }))).toEqual({ type: 'draw' });
  });

  it('only ever suggests legal moves', () => {
    for (let seed = 1; seed <= 50; seed++) {
      let state = deal(seed);
      for (let step = 0; step < 120; step++) {
        const move = hint(state);
        if (!move) break;
        state = applyMove(state, move); // throws on an illegal move
      }
    }
  });
});

describe('saved games', () => {
  it('rebuilds the same position from the move log', () => {
    const game = new KlondikeGame(99);
    for (let i = 0; i < 40; i++) {
      const move = hint(game.state);
      if (!move) break;
      game.play(move);
    }
    game.undo();
    const copy = KlondikeGame.restore(99, game.state.options, game.log);
    expect(copy.state).toEqual(game.state);
  });

  it('redoes undone moves in order', () => {
    const game = new KlondikeGame(5);
    game.play({ type: 'draw' });
    game.play({ type: 'draw' });
    const end = game.state;
    game.undo();
    game.undo();
    game.redo();
    game.redo();
    expect(game.state).toEqual(end);
  });
});
