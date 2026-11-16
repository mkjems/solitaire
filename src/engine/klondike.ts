/**
 * Klondike rules. Pure functions over immutable state; no DOM, no timers.
 * The rules implemented here are specified in docs/RulesOfTheGame.md.
 */

import { type CardId, colourOf, fullDeck, rankOf, suitOf } from './cards';
import { createRng, shuffle } from './rng';

export type DrawCount = 1 | 3;
export type ScoringMode = 'none' | 'standard' | 'timed' | 'vegas';

export interface KlondikeOptions {
  readonly drawCount: DrawCount;
  readonly scoring: ScoringMode;
}

export const DEFAULT_OPTIONS: KlondikeOptions = { drawCount: 1, scoring: 'timed' };

export const TABLEAU_PILES = 7;
export const FOUNDATION_PILES = 4;

/** In every pile the last element is the top card. */
export interface TableauPile {
  readonly cards: readonly CardId[];
  /** How many cards at the bottom of the pile are face down. */
  readonly faceDown: number;
}

export interface KlondikeState {
  readonly seed: number;
  readonly options: KlondikeOptions;
  readonly stock: readonly CardId[];
  readonly waste: readonly CardId[];
  /** How many cards at the top of the waste are shown fanned out. */
  readonly wasteFan: number;
  readonly foundations: readonly (readonly CardId[])[];
  readonly tableau: readonly TableauPile[];
  readonly score: number;
  /** Number of moves made, counting draws and recycles. */
  readonly moves: number;
  /** How many times the waste has been turned over into the stock. */
  readonly recycles: number;
}

export type PileRef =
  | { readonly kind: 'stock' }
  | { readonly kind: 'waste' }
  | { readonly kind: 'foundation'; readonly index: number }
  | { readonly kind: 'tableau'; readonly index: number };

export type Move =
  | { readonly type: 'draw' }
  | { readonly type: 'recycle' }
  | { readonly type: 'move'; readonly from: PileRef; readonly to: PileRef; readonly count: number };

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

/** Deals a new game. The same seed and options always give the same game. */
export function deal(seed: number, options: KlondikeOptions = DEFAULT_OPTIONS): KlondikeState {
  const deck = shuffle(fullDeck(), createRng(seed));
  const piles: CardId[][] = Array.from({ length: TABLEAU_PILES }, () => []);

  // Traditional deal: row by row, each row starting one pile further right.
  for (let row = 0; row < TABLEAU_PILES; row++) {
    for (let pile = row; pile < TABLEAU_PILES; pile++) {
      (piles[pile] as CardId[]).push(deck.pop() as CardId);
    }
  }

  return {
    seed,
    options,
    stock: deck,
    waste: [],
    wasteFan: 0,
    foundations: Array.from({ length: FOUNDATION_PILES }, () => []),
    tableau: piles.map((cards) => ({ cards, faceDown: cards.length - 1 })),
    score: options.scoring === 'vegas' ? -52 : 0,
    moves: 0,
    recycles: 0,
  };
}

/**
 * The order in which the opening animation deals the tableau: each entry is
 * the pile index and whether that card lands face up.
 */
export function dealOrder(): { pile: number; row: number; faceUp: boolean }[] {
  const order: { pile: number; row: number; faceUp: boolean }[] = [];
  for (let row = 0; row < TABLEAU_PILES; row++) {
    for (let pile = row; pile < TABLEAU_PILES; pile++) {
      order.push({ pile, row, faceUp: pile === row });
    }
  }
  return order;
}

// ---------------------------------------------------------------------------
// Placement rules
// ---------------------------------------------------------------------------

function top<T>(cards: readonly T[]): T | undefined {
  return cards[cards.length - 1];
}

/** May `card` (leading a group or alone) be placed on this tableau pile? */
export function fitsOnTableau(card: CardId, pile: TableauPile): boolean {
  const target = top(pile.cards);
  if (target === undefined) return rankOf(card) === 13;
  return colourOf(card) !== colourOf(target) && rankOf(card) === rankOf(target) - 1;
}

/** May `card` be placed on this foundation pile? */
export function fitsOnFoundation(card: CardId, pile: readonly CardId[]): boolean {
  const target = top(pile);
  if (target === undefined) return rankOf(card) === 1;
  return suitOf(card) === suitOf(target) && rankOf(card) === rankOf(target) + 1;
}

/** The maximum number of passes through the stock, or Infinity. */
export function maxPasses(options: KlondikeOptions): number {
  if (options.scoring !== 'vegas') return Infinity;
  return options.drawCount === 1 ? 1 : 3;
}

export function canDraw(state: KlondikeState): boolean {
  return state.stock.length > 0;
}

export function canRecycle(state: KlondikeState): boolean {
  return (
    state.stock.length === 0 &&
    state.waste.length > 0 &&
    state.recycles + 1 < maxPasses(state.options)
  );
}

/** The cards a move would pick up, bottom first, or null if they cannot be picked up. */
export function movableCards(
  state: KlondikeState,
  from: PileRef,
  count: number,
): readonly CardId[] | null {
  if (!Number.isInteger(count) || count < 1) return null;
  switch (from.kind) {
    case 'stock':
      return null;
    case 'waste':
      return count === 1 && state.waste.length > 0 ? state.waste.slice(-1) : null;
    case 'foundation': {
      const pile = state.foundations[from.index];
      return pile && count === 1 && pile.length > 0 ? pile.slice(-1) : null;
    }
    case 'tableau': {
      const pile = state.tableau[from.index];
      if (!pile || count > pile.cards.length - pile.faceDown) return null;
      return pile.cards.slice(-count);
    }
  }
}

function samePile(a: PileRef, b: PileRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'foundation' || a.kind === 'tableau') {
    return a.index === (b as { index: number }).index;
  }
  return true;
}

export function isLegal(state: KlondikeState, move: Move): boolean {
  if (move.type === 'draw') return canDraw(state);
  if (move.type === 'recycle') return canRecycle(state);

  const { from, to, count } = move;
  if (samePile(from, to)) return false;
  const cards = movableCards(state, from, count);
  if (!cards) return false;
  const lead = cards[0] as CardId;

  switch (to.kind) {
    case 'tableau': {
      const pile = state.tableau[to.index];
      return pile !== undefined && fitsOnTableau(lead, pile);
    }
    case 'foundation': {
      if (count !== 1 || from.kind === 'foundation') return false;
      const pile = state.foundations[to.index];
      return pile !== undefined && fitsOnFoundation(lead, pile);
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Applying moves
// ---------------------------------------------------------------------------

function scoreDelta(state: KlondikeState, move: Move, flipped: boolean): number {
  const { scoring, drawCount } = state.options;
  if (scoring === 'none') return 0;

  if (scoring === 'vegas') {
    if (move.type !== 'move') return 0;
    if (move.to.kind === 'foundation') return 5;
    if (move.from.kind === 'foundation') return -5;
    return 0;
  }

  // Standard and timed scoring share the same move values.
  if (move.type === 'draw') return 0;
  if (move.type === 'recycle') {
    if (drawCount === 1) return -100;
    // Draw three: free for the first three passes.
    return state.recycles + 1 >= 3 ? -20 : 0;
  }

  let delta = 0;
  const { from, to } = move;
  if (to.kind === 'foundation') delta += 10;
  else if (from.kind === 'waste') delta += 5;
  else if (from.kind === 'foundation') delta -= 15;
  if (flipped) delta += 5;
  return delta;
}

function applyScore(state: KlondikeState, delta: number): number {
  const next = state.score + delta;
  return state.options.scoring === 'vegas' ? next : Math.max(0, next);
}

/** Applies a legal move and returns the new state. Throws on an illegal move. */
export function applyMove(state: KlondikeState, move: Move): KlondikeState {
  if (!isLegal(state, move)) {
    throw new Error(`Illegal move: ${JSON.stringify(move)}`);
  }

  if (move.type === 'draw') {
    const n = Math.min(state.options.drawCount, state.stock.length);
    // Cards are turned one at a time, so the last one turned ends on top.
    const drawn = state.stock.slice(-n).reverse();
    return {
      ...state,
      stock: state.stock.slice(0, -n),
      waste: [...state.waste, ...drawn],
      wasteFan: n,
      moves: state.moves + 1,
    };
  }

  if (move.type === 'recycle') {
    return {
      ...state,
      stock: state.waste.slice().reverse(),
      waste: [],
      wasteFan: 0,
      score: applyScore(state, scoreDelta(state, move, false)),
      moves: state.moves + 1,
      recycles: state.recycles + 1,
    };
  }

  const { from, to, count } = move;
  const cards = movableCards(state, from, count) as readonly CardId[];

  let waste = state.waste;
  let wasteFan = state.wasteFan;
  let foundations = state.foundations;
  let tableau = state.tableau;
  let flipped = false;

  // Pick up.
  if (from.kind === 'waste') {
    waste = waste.slice(0, -1);
    wasteFan = waste.length === 0 ? 0 : Math.max(1, wasteFan - 1);
  } else if (from.kind === 'foundation') {
    foundations = foundations.map((pile, i) => (i === from.index ? pile.slice(0, -1) : pile));
  } else if (from.kind === 'tableau') {
    tableau = tableau.map((pile, i) => {
      if (i !== from.index) return pile;
      const remaining = pile.cards.slice(0, -count);
      let faceDown = pile.faceDown;
      // Turn over the newly exposed card.
      if (remaining.length > 0 && faceDown === remaining.length) {
        faceDown -= 1;
        flipped = true;
      }
      return { cards: remaining, faceDown };
    });
  }

  // Put down.
  if (to.kind === 'foundation') {
    foundations = foundations.map((pile, i) => (i === to.index ? [...pile, ...cards] : pile));
  } else if (to.kind === 'tableau') {
    tableau = tableau.map((pile, i) =>
      i === to.index ? { cards: [...pile.cards, ...cards], faceDown: pile.faceDown } : pile,
    );
  }

  return {
    ...state,
    waste,
    wasteFan,
    foundations,
    tableau,
    score: applyScore(state, scoreDelta(state, move, flipped)),
    moves: state.moves + 1,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isWon(state: KlondikeState): boolean {
  return state.foundations.every((pile) => pile.length === 13);
}

/** True when the game can no longer be lost: everything is face up and in the tableau. */
export function canAutoFinish(state: KlondikeState): boolean {
  return (
    !isWon(state) &&
    state.stock.length === 0 &&
    state.waste.length === 0 &&
    state.tableau.every((pile) => pile.faceDown === 0)
  );
}

/** The next tableau-to-foundation move of an automatic finish, lowest rank first. */
export function autoFinishMove(state: KlondikeState): Move | null {
  let best: Move | null = null;
  let bestRank = Infinity;
  for (let index = 0; index < state.tableau.length; index++) {
    const card = top((state.tableau[index] as TableauPile).cards);
    if (card === undefined) continue;
    const target = foundationFor(state, card);
    if (target === null || rankOf(card) >= bestRank) continue;
    bestRank = rankOf(card);
    best = {
      type: 'move',
      from: { kind: 'tableau', index },
      to: { kind: 'foundation', index: target },
      count: 1,
    };
  }
  return best;
}

/** The foundation that accepts `card` right now, or null. */
export function foundationFor(state: KlondikeState, card: CardId): number | null {
  const index = state.foundations.findIndex((pile) => fitsOnFoundation(card, pile));
  return index === -1 ? null : index;
}

/** Where a card currently is. `index` counts from the bottom of its pile. */
export function findCard(
  state: KlondikeState,
  card: CardId,
): { pile: PileRef; index: number; faceUp: boolean } | null {
  let index = state.stock.indexOf(card);
  if (index !== -1) return { pile: { kind: 'stock' }, index, faceUp: false };

  index = state.waste.indexOf(card);
  if (index !== -1) return { pile: { kind: 'waste' }, index, faceUp: true };

  for (let i = 0; i < state.foundations.length; i++) {
    index = (state.foundations[i] as readonly CardId[]).indexOf(card);
    if (index !== -1) return { pile: { kind: 'foundation', index: i }, index, faceUp: true };
  }

  for (let i = 0; i < state.tableau.length; i++) {
    const pile = state.tableau[i] as TableauPile;
    index = pile.cards.indexOf(card);
    if (index !== -1) {
      return { pile: { kind: 'tableau', index: i }, index, faceUp: index >= pile.faceDown };
    }
  }
  return null;
}

/** Every legal move in this position. Used by tests, and later by hints and the solver. */
export function legalMoves(state: KlondikeState): Move[] {
  const moves: Move[] = [];
  if (canDraw(state)) moves.push({ type: 'draw' });
  if (canRecycle(state)) moves.push({ type: 'recycle' });

  const sources: { from: PileRef; counts: number[] }[] = [];
  if (state.waste.length > 0) sources.push({ from: { kind: 'waste' }, counts: [1] });
  state.foundations.forEach((pile, index) => {
    if (pile.length > 0) sources.push({ from: { kind: 'foundation', index }, counts: [1] });
  });
  state.tableau.forEach((pile, index) => {
    const faceUp = pile.cards.length - pile.faceDown;
    const counts = Array.from({ length: faceUp }, (_, i) => i + 1);
    if (faceUp > 0) sources.push({ from: { kind: 'tableau', index }, counts });
  });

  for (const { from, counts } of sources) {
    for (const count of counts) {
      for (let index = 0; index < FOUNDATION_PILES; index++) {
        const move: Move = { type: 'move', from, to: { kind: 'foundation', index }, count };
        if (isLegal(state, move)) moves.push(move);
      }
      for (let index = 0; index < TABLEAU_PILES; index++) {
        const move: Move = { type: 'move', from, to: { kind: 'tableau', index }, count };
        if (isLegal(state, move)) moves.push(move);
      }
    }
  }
  return moves;
}

/**
 * The move a tap on a card should make: a foundation first, then a tableau
 * pile that already has cards, then an empty pile. Returns null if the cards
 * have nowhere useful to go.
 */
export function quickMove(state: KlondikeState, from: PileRef, count: number): Move | null {
  const cards = movableCards(state, from, count);
  if (!cards || from.kind === 'foundation') return null;
  const lead = cards[0] as CardId;

  if (count === 1) {
    const index = foundationFor(state, lead);
    if (index !== null) return { type: 'move', from, to: { kind: 'foundation', index }, count };
  }

  let emptyPile: number | null = null;
  for (let index = 0; index < TABLEAU_PILES; index++) {
    const pile = state.tableau[index] as TableauPile;
    if (from.kind === 'tableau' && from.index === index) continue;
    if (!fitsOnTableau(lead, pile)) continue;
    if (pile.cards.length > 0) return { type: 'move', from, to: { kind: 'tableau', index }, count };
    if (emptyPile === null) emptyPile = index;
  }

  if (emptyPile !== null) {
    // Moving a King that already sits at the bottom of its pile achieves nothing.
    if (from.kind === 'tableau') {
      const source = state.tableau[from.index] as TableauPile;
      if (source.cards.length === count) return null;
    }
    return { type: 'move', from, to: { kind: 'tableau', index: emptyPile }, count };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Timed scoring
// ---------------------------------------------------------------------------

/** Points lost to the clock in timed scoring: 2 for every 10 seconds played. */
export function timePenalty(seconds: number): number {
  return 2 * Math.floor(seconds / 10);
}

/** Bonus for winning in timed scoring. Nothing for games under 30 seconds. */
export function timeBonus(seconds: number): number {
  return seconds >= 30 ? Math.round(700_000 / seconds) : 0;
}

/** The score to show, taking the clock into account in timed scoring. */
export function scoreAt(state: KlondikeState, seconds: number): number {
  if (state.options.scoring !== 'timed') return state.score;
  const running = Math.max(0, state.score - timePenalty(seconds));
  return isWon(state) ? running + timeBonus(seconds) : running;
}
