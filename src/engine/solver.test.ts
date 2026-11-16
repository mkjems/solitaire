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
import { analyse, findWinnableDeal, solve } from './solver';

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

/**
 * A dead end: every card but `waste` and the 2 of spades lies face down in the
 * first pile, under the 2 of spades, which has nowhere to go.
 */
function stuck(options: KlondikeOptions, waste: CardId[]): KlondikeState {
  const hidden = suit('S', 3).concat(suit('H'), suit('D'), suit('C'), ['AS']).filter((id) => !waste.includes(id));
  return {
    ...deal(1, options),
    stock: [],
    waste,
    wasteFan: 1,
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 7 }, (_, i) =>
      i === 0 ? { cards: [...hidden, '2S'], faceDown: hidden.length } : { cards: [], faceDown: 0 },
    ),
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
        expect(result.status).toBe('won');
        // applyMove throws on any illegal move.
        expect(isWon(play(state, result.moves)), `${JSON.stringify(options)} deal ${state.seed}`).toBe(true);
      }
    }
  }, 30_000);

  it('wins most draw-one deals', () => {
    let solved = 0;
    for (let seed = 101; seed <= 160; seed++) {
      if (solve(deal(seed, DRAW_1), { maxNodes: 20_000 }).status === 'won') solved++;
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
    if (result.status === 'won') expect(isWon(play(state, result.moves))).toBe(true);
    else expect(result.moves).toEqual([]);
  });

  it('turns the waste over to reach a card, when the rules allow it', () => {
    const state = spadesInWaste(DRAW_1);
    const result = solve(state);
    expect(result.status).toBe('won');
    expect(result.moves[0]).toEqual({ type: 'recycle' });
    expect(isWon(play(state, result.moves))).toBe(true);
  });

  it('does not turn the waste over when Vegas allows no more passes', () => {
    // The King of clubs on top can go to an empty pile and free the Ace of hearts,
    // but after that nothing can move.
    const vegas = { drawCount: 1, scoring: 'vegas' } as const;
    expect(solve(stuck(vegas, ['AH', 'KC']), { exhaustive: true }).status).toBe('lost');
    // With the Queen of clubs on top instead, the Ace is out of reach for good.
    const state = stuck(vegas, ['AH', 'KC', 'QC']);
    expect(solve(state).status).toBe('unknown');
    expect(solve(state, { exhaustive: true }).status).toBe('lost');
    // Allowed to turn the waste over, the Ace comes back round, but the game is still stuck.
    expect(solve(stuck(DRAW_1, ['AH', 'KC', 'QC']), { exhaustive: true }).status).toBe('lost');
  });

  it('only plays the cards that drawing three at a time can reach', () => {
    // Three at a time, only the 7 of diamonds ever comes to the top.
    expect(solve(stuck(DRAW_3, ['AH', 'QC', '7D']), { exhaustive: true }).status).toBe('lost');
  });

  it('finds wins the fast search passes over, such as taking cards back off a foundation', () => {
    // The spades are in the waste with the Ace at the bottom and no pass left. The
    // Kings and Queens of the other suits come back down to give the spades a place.
    const state = spadesInWaste({ drawCount: 1, scoring: 'vegas' });
    expect(solve(state).status).toBe('unknown');
    const result = solve(state, { exhaustive: true });
    expect(result.status).toBe('won');
    expect(isWon(play(state, result.moves))).toBe(true);
    expect(result.moves.some((move) => move.type === 'move' && move.from.kind === 'foundation')).toBe(true);
  });

  it('reports a won position as won with nothing to do', () => {
    const won: KlondikeState = { ...spadesInWaste(DRAW_1), waste: [], foundations: [suit('H'), suit('D'), suit('C'), suit('S')] };
    expect(solve(won)).toEqual({ status: 'won', moves: [], nodes: 0 });
  });

  it('gives up within its budget', () => {
    const result = solve(deal(3, { drawCount: 1, scoring: 'vegas' }), { maxNodes: 50 });
    expect(result.nodes).toBeLessThanOrEqual(51);
  });
});

describe('exhaustive search', () => {
  /** Positions from random play: early, middle and late in games. */
  function positions(count: number): KlondikeState[] {
    const rng = createRng(99);
    const out: KlondikeState[] = [];
    for (let seed = 1; out.length < count; seed++) {
      let state = deal(seed, seed % 2 ? DRAW_1 : DRAW_3);
      const length = 10 + Math.floor(rng() * 90);
      for (let i = 0; i < length; i++) {
        const moves = legalMoves(state);
        if (moves.length === 0) break;
        state = applyMove(state, moves[Math.floor(rng() * moves.length)] as Move);
      }
      if (!isWon(state)) out.push(state);
    }
    return out;
  }

  it('never calls a position lost that can be won', () => {
    let lost = 0;
    let won = 0;
    for (const state of positions(60)) {
      const fast = solve(state, { maxNodes: 20_000 });
      const thorough = solve(state, { maxNodes: 40_000, exhaustive: true });
      if (fast.status === 'won') {
        won++;
        expect(thorough.status, `deal ${state.seed}`).not.toBe('lost');
      }
      if (thorough.status === 'won') expect(isWon(play(state, thorough.moves))).toBe(true);
      if (thorough.status === 'lost') lost++;
    }
    // The sample has both kinds, so the check above means something.
    expect(won).toBeGreaterThan(5);
    expect(lost).toBeGreaterThan(5);
  }, 60_000);

  it('analyses a game in progress: a winning line, or lost, or unknown', () => {
    for (const state of positions(15)) {
      const result = analyse(state, { fastNodes: 10_000, exhaustiveNodes: 20_000 });
      if (result.status === 'won') expect(isWon(play(state, result.moves))).toBe(true);
      else expect(result.moves).toEqual([]);
    }
  }, 30_000);
});

describe('winnable deals', () => {
  it('finds a deal the solver can win', () => {
    let next = 1000;
    const found = findWinnableDeal(DRAW_3, () => next++);
    expect(found).not.toBeNull();
    const state = deal(found?.seed as number, DRAW_3);
    const result = solve(state);
    expect(result.status).toBe('won');
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
