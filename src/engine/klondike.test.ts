import { describe, expect, it } from 'vitest';
import { type CardId, cardId, colourOf, fullDeck, rankOf, SUITS, suitOf } from './cards';
import { KlondikeGame } from './game';
import {
  type KlondikeOptions,
  type KlondikeState,
  type Move,
  type PileRef,
  applyMove,
  autoFinishMove,
  canAutoFinish,
  canRecycle,
  deal,
  dealOrder,
  findCard,
  isLegal,
  isWon,
  legalMoves,
  quickMove,
  scoreAt,
  timeBonus,
  timePenalty,
} from './klondike';
import { createRng } from './rng';

const STANDARD: KlondikeOptions = { drawCount: 1, scoring: 'standard' };

const waste: PileRef = { kind: 'waste' };
const tab = (index: number): PileRef => ({ kind: 'tableau', index });
const fnd = (index: number): PileRef => ({ kind: 'foundation', index });
const move = (from: PileRef, to: PileRef, count = 1): Move => ({ type: 'move', from, to, count });

/** Builds a position by hand. Tableau piles are written bottom to top; "|" marks where face-up cards begin. */
function position(parts: {
  stock?: string;
  waste?: string;
  wasteFan?: number;
  foundations?: string[];
  tableau?: string[];
  options?: KlondikeOptions;
  score?: number;
  recycles?: number;
}): KlondikeState {
  const list = (text: string | undefined): CardId[] =>
    (text ?? '').split(/\s+/).filter((token) => token !== '' && token !== '|');
  const tableau = Array.from({ length: 7 }, (_, i) => {
    const text = parts.tableau?.[i] ?? '';
    const tokens = text.split(/\s+/).filter(Boolean);
    const bar = tokens.indexOf('|');
    return { cards: list(text), faceDown: bar === -1 ? 0 : bar };
  });
  const wasteCards = list(parts.waste);
  return {
    seed: 0,
    options: parts.options ?? STANDARD,
    stock: list(parts.stock),
    waste: wasteCards,
    wasteFan: parts.wasteFan ?? Math.min(1, wasteCards.length),
    foundations: Array.from({ length: 4 }, (_, i) => list(parts.foundations?.[i])),
    tableau,
    score: parts.score ?? 0,
    moves: 0,
    recycles: parts.recycles ?? 0,
  };
}

function allCards(state: KlondikeState): CardId[] {
  return [
    ...state.stock,
    ...state.waste,
    ...state.foundations.flat(),
    ...state.tableau.flatMap((pile) => pile.cards),
  ];
}

describe('cards', () => {
  it('builds a 52-card deck of unique cards', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it('reads rank, suit and colour from a card id', () => {
    expect(rankOf('AS')).toBe(1);
    expect(rankOf('TD')).toBe(10);
    expect(rankOf('KH')).toBe(13);
    expect(suitOf('QC')).toBe('C');
    expect(colourOf('7H')).toBe('red');
    expect(colourOf('7D')).toBe('red');
    expect(colourOf('7S')).toBe('black');
    expect(colourOf('7C')).toBe('black');
    expect(cardId(11, 'S')).toBe('JS');
  });
});

describe('deal', () => {
  it('lays out seven piles of 1 to 7 cards with only the top card face up', () => {
    const state = deal(1);
    state.tableau.forEach((pile, i) => {
      expect(pile.cards).toHaveLength(i + 1);
      expect(pile.faceDown).toBe(i);
    });
    expect(state.stock).toHaveLength(24);
    expect(state.waste).toHaveLength(0);
    expect(state.foundations.every((pile) => pile.length === 0)).toBe(true);
  });

  it('uses every card exactly once', () => {
    const cards = allCards(deal(42));
    expect(cards).toHaveLength(52);
    expect(new Set(cards).size).toBe(52);
  });

  it('gives the same game for the same deal number and different games otherwise', () => {
    expect(deal(7)).toEqual(deal(7));
    expect(allCards(deal(7))).not.toEqual(allCards(deal(8)));
  });

  it('starts at 0, or at -52 in Vegas scoring', () => {
    expect(deal(1, STANDARD).score).toBe(0);
    expect(deal(1, { drawCount: 3, scoring: 'vegas' }).score).toBe(-52);
  });

  it('describes the traditional row-by-row dealing order', () => {
    const order = dealOrder();
    expect(order).toHaveLength(28);
    expect(order.slice(0, 8).map((step) => step.pile)).toEqual([0, 1, 2, 3, 4, 5, 6, 1]);
    expect(order.filter((step) => step.faceUp).map((step) => step.pile)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('stock and waste', () => {
  it('draws one card at a time in draw one', () => {
    const start = deal(3, STANDARD);
    const next = applyMove(start, { type: 'draw' });
    expect(next.stock).toHaveLength(23);
    expect(next.waste).toEqual([start.stock[23]]);
    expect(next.wasteFan).toBe(1);
  });

  it('draws three cards in draw three, the last one turned ending on top', () => {
    const start = deal(3, { drawCount: 3, scoring: 'standard' });
    const next = applyMove(start, { type: 'draw' });
    expect(next.stock).toHaveLength(21);
    expect(next.waste).toEqual([start.stock[23], start.stock[22], start.stock[21]]);
    expect(next.wasteFan).toBe(3);
  });

  it('draws what is left when fewer than three cards remain', () => {
    const state = position({ stock: '2S 3S', options: { drawCount: 3, scoring: 'standard' } });
    const next = applyMove(state, { type: 'draw' });
    expect(next.stock).toHaveLength(0);
    expect(next.waste).toEqual(['3S', '2S']);
    expect(next.wasteFan).toBe(2);
  });

  it('cannot draw from an empty stock or recycle while cards remain', () => {
    expect(isLegal(position({ waste: '2S' }), { type: 'draw' })).toBe(false);
    expect(isLegal(position({ stock: '3S', waste: '2S' }), { type: 'recycle' })).toBe(false);
    expect(isLegal(position({}), { type: 'recycle' })).toBe(false);
  });

  it('turns the waste over without shuffling, so the cards come out in the same order', () => {
    let state = deal(5, STANDARD);
    const firstPass: CardId[] = [];
    while (state.stock.length > 0) {
      state = applyMove(state, { type: 'draw' });
      firstPass.push(state.waste.at(-1) as CardId);
    }
    state = applyMove(state, { type: 'recycle' });
    expect(state.waste).toHaveLength(0);
    expect(state.recycles).toBe(1);
    const secondPass: CardId[] = [];
    while (state.stock.length > 0) {
      state = applyMove(state, { type: 'draw' });
      secondPass.push(state.waste.at(-1) as CardId);
    }
    expect(secondPass).toEqual(firstPass);
  });

  it('shrinks the waste fan as cards are played from it, never below one', () => {
    let state = position({
      waste: '9D 4S 3D 2C',
      wasteFan: 3,
      tableau: ['3H', '4C', '5H'],
      options: { drawCount: 3, scoring: 'standard' },
    });
    state = applyMove(state, move(waste, tab(0)));
    expect(state.wasteFan).toBe(2);
    state = applyMove(state, move(waste, tab(1)));
    expect(state.wasteFan).toBe(1);
    state = applyMove(state, move(waste, tab(2)));
    expect(state.wasteFan).toBe(1);
    expect(state.waste).toEqual(['9D']);
  });
});

describe('tableau moves', () => {
  it('accepts a card one rank lower and of the opposite colour', () => {
    const state = position({ waste: '6H', tableau: ['7S', '7D', '8C'] });
    expect(isLegal(state, move(waste, tab(0)))).toBe(true);
    expect(isLegal(state, move(waste, tab(1)))).toBe(false); // same colour
    expect(isLegal(state, move(waste, tab(2)))).toBe(false); // wrong rank
  });

  it('accepts only a King on an empty pile', () => {
    expect(isLegal(position({ waste: 'KD' }), move(waste, tab(0)))).toBe(true);
    expect(isLegal(position({ waste: 'QD' }), move(waste, tab(0)))).toBe(false);
  });

  it('moves a face-up group starting from any card in it', () => {
    const state = position({ tableau: ['2C | 9S 8H 7C', '9C', 'TH'] });
    expect(isLegal(state, move(tab(0), tab(1), 2))).toBe(true);
    expect(isLegal(state, move(tab(0), tab(2), 3))).toBe(true);
    const next = applyMove(state, move(tab(0), tab(2), 3));
    expect(next.tableau[2]?.cards).toEqual(['TH', '9S', '8H', '7C']);
  });

  it('checks the first card of a group against the destination', () => {
    const state = position({ tableau: ['9S 8H 7C', '9D', '8D'] });
    // 8H onto 9D: both red.
    expect(isLegal(state, move(tab(0), tab(1), 2))).toBe(false);
    // 7C onto 8D: fits.
    expect(isLegal(state, move(tab(0), tab(2), 1))).toBe(true);
  });

  it('never picks up face-down cards', () => {
    const state = position({ tableau: ['9S 8H | 7C', '', '8D'] });
    expect(isLegal(state, move(tab(0), tab(2), 1))).toBe(true);
    expect(isLegal(state, move(tab(0), tab(2), 2))).toBe(false);
  });

  it('turns over the card a move uncovers', () => {
    const state = position({ tableau: ['4D 9S | 7C', '8D'] });
    const next = applyMove(state, move(tab(0), tab(1)));
    expect(next.tableau[0]).toEqual({ cards: ['4D', '9S'], faceDown: 1 });
    expect(findCard(next, '9S')?.faceUp).toBe(true);
    expect(findCard(next, '4D')?.faceUp).toBe(false);
  });

  it('rejects moving a pile onto itself', () => {
    const state = position({ tableau: ['KS'] });
    expect(isLegal(state, move(tab(0), tab(0)))).toBe(false);
  });
});

describe('foundation moves', () => {
  it('starts with an Ace on any empty foundation and builds up by suit', () => {
    let state = position({ waste: '3S 2H 2S AS', tableau: ['KD'] });
    expect(isLegal(state, move(waste, fnd(2)))).toBe(true);
    state = applyMove(state, move(waste, fnd(2)));
    expect(isLegal(state, move(waste, fnd(0)))).toBe(false); // a 2 cannot start a foundation
    state = applyMove(state, move(waste, fnd(2)));
    expect(isLegal(state, move(waste, fnd(2)))).toBe(false); // 2H on 2S: wrong suit
    expect(state.foundations[2]).toEqual(['AS', '2S']);
  });

  it('takes only one card at a time', () => {
    const state = position({ foundations: ['AS'], tableau: ['3D 2S'] });
    expect(isLegal(state, move(tab(0), fnd(0), 2))).toBe(false);
    expect(isLegal(state, move(tab(0), fnd(0), 1))).toBe(true);
  });

  it('lets the top card come back to the tableau', () => {
    const state = position({ foundations: ['AS 2S'], tableau: ['3D'] });
    const next = applyMove(state, move(fnd(0), tab(0)));
    expect(next.foundations[0]).toEqual(['AS']);
    expect(next.tableau[0]?.cards).toEqual(['3D', '2S']);
  });

  it('does not move cards between foundations', () => {
    const state = position({ foundations: ['AS'] });
    expect(isLegal(state, move(fnd(0), fnd(1)))).toBe(false);
  });
});

describe('standard scoring', () => {
  it('scores each kind of move', () => {
    // Waste to tableau: +5.
    expect(applyMove(position({ waste: '6H', tableau: ['7S'] }), move(waste, tab(0))).score).toBe(5);
    // Waste to foundation: +10.
    expect(applyMove(position({ waste: 'AH' }), move(waste, fnd(0))).score).toBe(10);
    // Tableau to foundation: +10.
    expect(applyMove(position({ tableau: ['AH'] }), move(tab(0), fnd(0))).score).toBe(10);
    // Tableau to foundation uncovering a card: +10 and +5.
    expect(applyMove(position({ tableau: ['9C | AH'] }), move(tab(0), fnd(0))).score).toBe(15);
    // Tableau to tableau uncovering a card: +5.
    expect(
      applyMove(position({ tableau: ['9C | 6H', '7S'] }), move(tab(0), tab(1))).score,
    ).toBe(5);
    // Tableau to tableau, nothing uncovered: 0.
    expect(applyMove(position({ tableau: ['6H', '7S'] }), move(tab(0), tab(1))).score).toBe(0);
    // Foundation back to tableau: -15.
    expect(
      applyMove(position({ foundations: ['AS 2S'], tableau: ['3D'], score: 40 }), move(fnd(0), tab(0)))
        .score,
    ).toBe(25);
  });

  it('charges 100 for each recycle in draw one and never goes below zero', () => {
    expect(applyMove(position({ waste: '2S', score: 130 }), { type: 'recycle' }).score).toBe(30);
    expect(applyMove(position({ waste: '2S', score: 30 }), { type: 'recycle' }).score).toBe(0);
  });

  it('charges 20 per recycle in draw three from the fourth pass onward', () => {
    const options: KlondikeOptions = { drawCount: 3, scoring: 'standard' };
    const at = (recycles: number) =>
      applyMove(position({ waste: '2S', score: 50, recycles, options }), { type: 'recycle' }).score;
    expect(at(0)).toBe(50); // starting pass 2
    expect(at(1)).toBe(50); // starting pass 3
    expect(at(2)).toBe(30); // starting pass 4
    expect(at(5)).toBe(30);
  });

  it('keeps the score at zero with scoring off', () => {
    const options: KlondikeOptions = { drawCount: 1, scoring: 'none' };
    expect(applyMove(position({ waste: 'AH', options }), move(waste, fnd(0))).score).toBe(0);
  });
});

describe('timed scoring', () => {
  it('takes 2 points per 10 seconds and pays a bonus for wins of 30 seconds or more', () => {
    expect(timePenalty(9)).toBe(0);
    expect(timePenalty(10)).toBe(2);
    expect(timePenalty(125)).toBe(24);
    expect(timeBonus(29)).toBe(0);
    expect(timeBonus(100)).toBe(7000);
  });

  it('applies the clock only in timed mode', () => {
    const timed: KlondikeOptions = { drawCount: 1, scoring: 'timed' };
    expect(scoreAt(position({ score: 50, options: timed, tableau: ['KS'] }), 100)).toBe(30);
    expect(scoreAt(position({ score: 5, options: timed, tableau: ['KS'] }), 100)).toBe(0);
    expect(scoreAt(position({ score: 50, tableau: ['KS'] }), 100)).toBe(50);
  });
});

describe('Vegas scoring', () => {
  const vegas1: KlondikeOptions = { drawCount: 1, scoring: 'vegas' };
  const vegas3: KlondikeOptions = { drawCount: 3, scoring: 'vegas' };

  it('pays 5 per card on a foundation and can stay negative', () => {
    const state = position({ waste: 'AH', options: vegas1, score: -52 });
    expect(applyMove(state, move(waste, fnd(0))).score).toBe(-47);
  });

  it('allows one pass in draw one and three passes in draw three', () => {
    expect(canRecycle(position({ waste: '2S', options: vegas1 }))).toBe(false);
    expect(canRecycle(position({ waste: '2S', options: vegas3, recycles: 0 }))).toBe(true);
    expect(canRecycle(position({ waste: '2S', options: vegas3, recycles: 1 }))).toBe(true);
    expect(canRecycle(position({ waste: '2S', options: vegas3, recycles: 2 }))).toBe(false);
  });
});

describe('winning', () => {
  const suitRun = (suit: string, upTo = 13) =>
    fullDeck()
      .filter((card) => suitOf(card) === suit && rankOf(card) <= upTo)
      .join(' ');

  it('is won when every foundation holds thirteen cards', () => {
    const won = position({ foundations: SUITS.map((suit) => suitRun(suit)) });
    expect(isWon(won)).toBe(true);
    expect(isWon(deal(1))).toBe(false);
  });

  it('finishes automatically, lowest cards first, once nothing is hidden', () => {
    let state = position({
      foundations: [suitRun('S', 11), suitRun('H', 11), suitRun('D', 13), suitRun('C', 12)],
      tableau: ['KS QH', 'KH QS', 'KC'],
    });
    expect(canAutoFinish(state)).toBe(true);
    let steps = 0;
    for (let next = autoFinishMove(state); next; next = autoFinishMove(state)) {
      state = applyMove(state, next);
      steps++;
    }
    expect(steps).toBe(5);
    expect(isWon(state)).toBe(true);
    expect(canAutoFinish(state)).toBe(false);
  });

  it('does not offer an automatic finish while cards are hidden or undealt', () => {
    expect(canAutoFinish(deal(1))).toBe(false);
    expect(canAutoFinish(position({ stock: '2S', tableau: ['KS'] }))).toBe(false);
    expect(canAutoFinish(position({ tableau: ['2S | KS'] }))).toBe(false);
  });

  it('ends a full Vegas game at +208', () => {
    let state = position({
      tableau: SUITS.map((suit) => suitRun(suit).split(' ').reverse().join(' ')),
      options: { drawCount: 1, scoring: 'vegas' },
      score: -52,
    });
    for (let next = autoFinishMove(state); next; next = autoFinishMove(state)) {
      state = applyMove(state, next);
    }
    expect(isWon(state)).toBe(true);
    expect(state.score).toBe(208);
  });
});

describe('quick move', () => {
  it('prefers a foundation', () => {
    const state = position({ waste: '2S', foundations: ['AS'], tableau: ['3D'] });
    expect(quickMove(state, waste, 1)).toEqual(move(waste, fnd(0)));
  });

  it('falls back to a tableau pile with cards, then to an empty pile', () => {
    const state = position({ waste: 'KD', tableau: ['3D', '', 'AS'] });
    expect(quickMove(state, waste, 1)).toEqual(move(waste, tab(1)));
    const queen = position({ waste: 'QD', tableau: ['', 'KS'] });
    expect(quickMove(queen, waste, 1)).toEqual(move(waste, tab(1)));
  });

  it('moves a group when the tapped card is not on top', () => {
    const state = position({ tableau: ['9S 8H 7C', 'TD'] });
    expect(quickMove(state, tab(0), 3)).toEqual(move(tab(0), tab(1), 3));
  });

  it('does not shuffle a King between empty piles', () => {
    const state = position({ tableau: ['KS QH', ''] });
    expect(quickMove(state, tab(0), 2)).toBeNull();
  });

  it('returns null when there is nowhere to go', () => {
    expect(quickMove(position({ waste: '5S', tableau: ['9D'] }), waste, 1)).toBeNull();
  });
});

describe('undo and redo', () => {
  it('restores positions exactly, including the score', () => {
    const game = new KlondikeGame(11, STANDARD);
    const start = game.state;
    expect(game.play({ type: 'draw' })).toBe(true);
    const afterDraw = game.state;
    expect(game.canUndo).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.state).toEqual(start);
    expect(game.redo()).toBe(true);
    expect(game.state).toEqual(afterDraw);
    expect(game.redo()).toBe(false);
  });

  it('refuses illegal moves and forgets redo history after a new move', () => {
    const game = new KlondikeGame(11, STANDARD);
    expect(game.play({ type: 'recycle' })).toBe(false);
    game.play({ type: 'draw' });
    game.undo();
    game.play({ type: 'draw' });
    expect(game.canRedo).toBe(false);
  });
});

describe('random play', () => {
  it('keeps all 52 cards and a consistent position through hundreds of random games', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed * 7919);
      const options: KlondikeOptions = {
        drawCount: seed % 2 === 0 ? 3 : 1,
        scoring: (['none', 'standard', 'timed', 'vegas'] as const)[seed % 4] ?? 'standard',
      };
      let state = deal(seed, options);
      for (let step = 0; step < 300; step++) {
        const moves = legalMoves(state);
        if (moves.length === 0) break;
        state = applyMove(state, moves[Math.floor(rng() * moves.length)] as Move);

        const cards = allCards(state);
        expect(cards).toHaveLength(52);
        expect(new Set(cards).size).toBe(52);
        expect(state.wasteFan).toBeLessThanOrEqual(state.waste.length);
        expect(state.wasteFan).toBeGreaterThanOrEqual(Math.min(1, state.waste.length));
        for (const pile of state.tableau) {
          // A pile with cards always shows at least its top card.
          if (pile.cards.length > 0) expect(pile.faceDown).toBeLessThan(pile.cards.length);
          // Face-up cards always form a valid descending, alternating run.
          for (let i = pile.faceDown + 1; i < pile.cards.length; i++) {
            const below = pile.cards[i - 1] as CardId;
            const above = pile.cards[i] as CardId;
            expect(rankOf(above)).toBe(rankOf(below) - 1);
            expect(colourOf(above)).not.toBe(colourOf(below));
          }
        }
        for (const pile of state.foundations) {
          pile.forEach((card, i) => {
            expect(rankOf(card)).toBe(i + 1);
            expect(suitOf(card)).toBe(suitOf(pile[0] as CardId));
          });
        }
        if (options.scoring !== 'vegas') expect(state.score).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
