import { describe, expect, it } from 'vitest';
import { type CardId, cardId } from './cards';
import { createRng } from './rng';
import {
  type KlondikeOptions,
  type KlondikeState,
  type Move,
  applyMove,
  deal,
  isWon,
  legalMoves,
} from './klondike';
import { findWinnableDeal, solve } from './solver';

const DRAW_1: KlondikeOptions = { drawCount: 1, scoring: 'standard' };
const DRAW_3: KlondikeOptions = { drawCount: 3, scoring: 'standard' };

function play(state: KlondikeState, moves: readonly Move[]): KlondikeState {
  return moves.reduce(applyMove, state);
}

const suit = (s: 'S' | 'H' | 'D' | 'C', from = 1, to = 13): CardId[] =>
  Array.from({ length: to - from + 1 }, (_, i) => cardId(from + i, s));

/** Hearts, diamonds and clubs home; the spades, Ace at the bottom, in the waste. */
function spadesInWaste(options: KlondikeOptions): KlondikeState {
  return {
    ...deal(1, options),
    stock: [],
    waste: suit('S'),
    wasteFan: 1,
    foundations: [suit('H'), suit('D'), suit('C'), []],
    tableau: Array.from({ length: 7 }, () => ({ cards: [], faceDown: 0 })),
  };
}

describe('solver', () => {
  it('wins deals with moves the rules accept, in every draw and scoring mode', () => {
    const modes: KlondikeOptions[] = [
      DRAW_1,
      DRAW_3,
      { drawCount: 1, scoring: 'vegas' },
      { drawCount: 3, scoring: 'vegas' },
    ];
    for (const options of modes) {
      // The first few deals the solver wins (one-pass Vegas wins are rare, so search for them).
      let next = 1;
      for (let found = 0; found < 3; found++) {
        const winnable = findWinnableDeal(options, () => next++, { maxNodes: 20_000 });
        expect(winnable, JSON.stringify(options)).not.toBeNull();
        const state = deal(winnable?.seed as number, options);
        const result = solve(state, { maxNodes: 20_000 });
        expect(result.solved).toBe(true);
        // applyMove throws on any illegal move.
        expect(isWon(play(state, result.moves)), `${JSON.stringify(options)} deal ${state.seed}`).toBe(true);
      }
    }
  }, 30_000);

  it('wins most draw-one deals', () => {
    let solved = 0;
    for (let seed = 101; seed <= 160; seed++) {
      if (solve(deal(seed, DRAW_1), { maxNodes: 20_000 }).solved) solved++;
    }
    // About four in five Klondike deals can be won; the solver finds most of them.
    expect(solved / 60).toBeGreaterThan(0.65);
  });

  it('continues from a game in progress', () => {
    const rng = createRng(7);
    let state = deal(42, DRAW_1);
    for (let i = 0; i < 12; i++) {
      const safe = legalMoves(state).filter((move) => move.type !== 'move' || move.from.kind !== 'foundation');
      state = applyMove(state, safe[Math.floor(rng() * safe.length)] as Move);
    }
    const result = solve(state);
    if (result.solved) expect(isWon(play(state, result.moves))).toBe(true);
    else expect(result.moves).toEqual([]);
  });

  it('turns the waste over to reach a card, when the rules allow it', () => {
    const state = spadesInWaste(DRAW_1);
    const result = solve(state);
    expect(result.solved).toBe(true);
    expect(result.moves[0]).toEqual({ type: 'recycle' });
    expect(isWon(play(state, result.moves))).toBe(true);
  });

  it('does not turn the waste over when Vegas allows no more passes', () => {
    expect(solve(spadesInWaste({ drawCount: 1, scoring: 'vegas' })).solved).toBe(false);
  });

  it('only plays the cards that drawing three at a time can reach', () => {
    // Drawing three turns up the 3, 6, 9, Queen and King of spades, never the Ace.
    expect(solve(spadesInWaste(DRAW_3)).solved).toBe(false);
  });

  it('reports a won position as solved with nothing to do', () => {
    const won: KlondikeState = { ...spadesInWaste(DRAW_1), waste: [], foundations: [suit('H'), suit('D'), suit('C'), suit('S')] };
    expect(solve(won)).toEqual({ solved: true, moves: [], nodes: 0 });
  });

  it('gives up within its budget', () => {
    const result = solve(deal(3, { drawCount: 1, scoring: 'vegas' }), { maxNodes: 50 });
    expect(result.nodes).toBeLessThanOrEqual(51);
  });
});

describe('winnable deals', () => {
  it('finds a deal the solver can win', () => {
    let next = 1000;
    const found = findWinnableDeal(DRAW_3, () => next++);
    expect(found).not.toBeNull();
    const state = deal(found?.seed as number, DRAW_3);
    const result = solve(state);
    expect(result.solved).toBe(true);
    expect(isWon(play(state, result.moves))).toBe(true);
    expect(found?.tries).toBe((found?.seed as number) - 999);
  });

  it('gives up after its number of tries', () => {
    const tried: number[] = [];
    const none = findWinnableDeal(DRAW_1, () => {
      tried.push(tried.length);
      return 5;
    }, { maxNodes: 1, maxTries: 3 });
    expect(none).toBeNull();
    expect(tried).toHaveLength(3);
  });
});
