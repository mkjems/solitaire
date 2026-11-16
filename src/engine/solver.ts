/**
 * A Klondike solver: finds a sequence of moves that wins a position, if it can
 * within a budget. It sees the face-down cards, which is what "can this deal be
 * won?" means, and is how winnable deals are chosen.
 *
 * Depth-first search over a compact copy of the position, with:
 *   - a table of positions already searched, so none is searched twice;
 *   - the stock and waste treated as one sequence (the "talon"): a single move
 *     plays any card that drawing (and, if the rules allow, turning the waste
 *     over) can bring to the top, instead of one move per draw;
 *   - safe foundation moves made automatically: a card goes home when no card
 *     left in play could ever need to be placed on it;
 *   - moves tried in order of promise, and moves that cannot help left out.
 *
 * Leaving moves out makes the search fast but not exhaustive, so "not solved"
 * means "no solution found", never "cannot be won".
 */

import { type CardId, SUITS, cardId, rankOf, suitOf } from './cards';
import {
  type KlondikeOptions,
  type KlondikeState,
  type Move,
  applyMove,
  canDraw,
  deal,
  foundationFor,
  isWon,
  maxPasses,
} from './klondike';

// Cards are numbers here: suit * 13 + rank - 1, suits in the order of SUITS.
const rank = (card: number): number => (card % 13) + 1;
const suit = (card: number): number => Math.floor(card / 13);
const RED = SUITS.map((s) => s === 'H' || s === 'D');
const red = (card: number): boolean => RED[suit(card)] as boolean;

const toNumber = (id: CardId): number => SUITS.indexOf(suitOf(id)) * 13 + rankOf(id) - 1;
const toId = (card: number): CardId => cardId(rank(card), SUITS[suit(card)] as (typeof SUITS)[number]);

interface Position {
  /** Tableau piles, bottom card first. */
  tab: number[][];
  /** Face-down cards at the bottom of each pile. */
  down: number[];
  /** Cards on the foundation of each suit (so also the rank of its top card). */
  found: number[];
  /** The waste (bottom first) followed by the stock in the order it is drawn. */
  talon: number[];
  /** How many talon cards are in the waste: the top waste card is talon[p - 1]. */
  p: number;
  /** Times the waste may still be turned over (Infinity outside Vegas). */
  passes: number;
}

/** One solver move. Talon moves name the card's place in the talon. */
type Step =
  | { t: 'tab-found'; from: number }
  | { t: 'talon-found'; i: number }
  | { t: 'talon-tab'; i: number; to: number }
  | { t: 'tab-tab'; from: number; count: number; to: number }
  | { t: 'found-tab'; suit: number; to: number };

export interface SolveOptions {
  /** Positions to examine before giving up. */
  maxNodes?: number;
}

export interface SolveResult {
  solved: boolean;
  /** The winning moves, in the engine's terms, from the given position. Empty if not solved. */
  moves: Move[];
  /** Positions examined. */
  nodes: number;
}

const DEFAULT_MAX_NODES = 60_000;

class OutOfBudget extends Error {}

function fromState(state: KlondikeState): Position {
  const found = [0, 0, 0, 0];
  for (const pile of state.foundations) {
    const lead = pile[0];
    if (lead !== undefined) found[SUITS.indexOf(suitOf(lead))] = pile.length;
  }
  return {
    tab: state.tableau.map((pile) => pile.cards.map(toNumber)),
    down: state.tableau.map((pile) => pile.faceDown),
    found,
    talon: [...state.waste, ...state.stock.slice().reverse()].map(toNumber),
    p: state.waste.length,
    passes: maxPasses(state.options) - 1 - state.recycles,
  };
}

function clone(pos: Position): Position {
  return {
    tab: pos.tab.map((pile) => pile.slice()),
    down: pos.down.slice(),
    found: pos.found.slice(),
    talon: pos.talon.slice(),
    p: pos.p,
    passes: pos.passes,
  };
}

export class Solver {
  private readonly draw: number;
  private readonly unlimited: boolean;
  private readonly seen = new Set<string>();
  private readonly path: Step[] = [];
  private nodes = 0;

  constructor(
    private readonly state: KlondikeState,
    private readonly maxNodes = DEFAULT_MAX_NODES,
  ) {
    this.draw = state.options.drawCount;
    this.unlimited = maxPasses(state.options) === Infinity;
  }

  solve(): SolveResult {
    if (isWon(this.state)) return { solved: true, moves: [], nodes: 0 };
    const start = fromState(this.state);
    this.autoplay(start);
    let solved = false;
    try {
      solved = this.search(start);
    } catch (error) {
      if (!(error instanceof OutOfBudget)) throw error;
    }
    return { solved, moves: solved ? this.translate() : [], nodes: this.nodes };
  }

  // -------------------------------------------------------------------------
  // Rules on the compact position
  // -------------------------------------------------------------------------

  /** 0: the card at talon[i] can be brought to the top by drawing; 1: only after turning the waste over; -1: not at all. */
  private reach(pos: Position, i: number): number {
    const target = i + 1; // the waste size when talon[i] is on top
    const length = pos.talon.length;
    if (target === pos.p) return 0;
    if (target > pos.p && ((target - pos.p) % this.draw === 0 || target === length)) return 0;
    if (pos.passes > 0 && (target % this.draw === 0 || target === length)) return 1;
    return -1;
  }

  private fitsFoundation(pos: Position, card: number): boolean {
    return pos.found[suit(card)] === rank(card) - 1;
  }

  private fitsTableau(pos: Position, card: number, to: number): boolean {
    const pile = pos.tab[to] as number[];
    const target = pile[pile.length - 1];
    if (target === undefined) return rank(card) === 13;
    return rank(target) === rank(card) + 1 && red(target) !== red(card);
  }

  /** A card may go home for good once both foundations of the other colour hold the rank below it. */
  private safeHome(pos: Position, card: number): boolean {
    const r = rank(card);
    if (r <= 2) return true;
    const isRed = red(card);
    return pos.found.every((count, s) => RED[s] === isRed || count >= r - 1);
  }

  private takeFromTableau(pos: Position, from: number, count: number): number[] {
    const pile = pos.tab[from] as number[];
    const cards = pile.splice(pile.length - count, count);
    // Turn over the newly exposed card.
    if (pile.length > 0 && (pos.down[from] as number) >= pile.length) pos.down[from] = pile.length - 1;
    return cards;
  }

  private takeFromTalon(pos: Position, i: number): number {
    if (this.reach(pos, i) === 1) pos.passes -= 1;
    const [card] = pos.talon.splice(i, 1);
    pos.p = i;
    return card as number;
  }

  private home(pos: Position, card: number): void {
    pos.found[suit(card)] = rank(card);
  }

  /** Makes a move on `pos`, and records it in the solution unless `record` is false. */
  private apply(pos: Position, step: Step, record = true): void {
    switch (step.t) {
      case 'tab-found': {
        const [card] = this.takeFromTableau(pos, step.from, 1);
        this.home(pos, card as number);
        break;
      }
      case 'talon-found': {
        this.home(pos, this.takeFromTalon(pos, step.i));
        break;
      }
      case 'talon-tab':
        (pos.tab[step.to] as number[]).push(this.takeFromTalon(pos, step.i));
        break;
      case 'tab-tab':
        (pos.tab[step.to] as number[]).push(...this.takeFromTableau(pos, step.from, step.count));
        break;
      case 'found-tab': {
        const count = (pos.found[step.suit] as number) - 1;
        pos.found[step.suit] = count;
        (pos.tab[step.to] as number[]).push(step.suit * 13 + count);
        break;
      }
    }
    if (record) this.path.push(step);
  }

  /** Makes every safe foundation move from the tableau and the top of the waste. */
  private autoplay(pos: Position): void {
    let moved = true;
    while (moved) {
      moved = false;
      for (let from = 0; from < pos.tab.length; from++) {
        const pile = pos.tab[from] as number[];
        const card = pile[pile.length - 1];
        if (card !== undefined && this.fitsFoundation(pos, card) && this.safeHome(pos, card)) {
          this.apply(pos, { t: 'tab-found', from });
          moved = true;
        }
      }
      const top = pos.p > 0 ? pos.talon[pos.p - 1] : undefined;
      if (top !== undefined && this.fitsFoundation(pos, top) && this.safeHome(pos, top)) {
        this.apply(pos, { t: 'talon-found', i: pos.p - 1 });
        moved = true;
      }
    }
  }

  private won(pos: Position): boolean {
    return pos.found.every((count) => count === 13);
  }

  /** With the talon empty and every card face up, the rest goes home lowest first. */
  private finishable(pos: Position): boolean {
    return pos.talon.length === 0 && pos.down.every((count) => count === 0);
  }

  private finish(pos: Position): void {
    while (!this.won(pos)) {
      let best = -1;
      for (let from = 0; from < pos.tab.length; from++) {
        const pile = pos.tab[from] as number[];
        const card = pile[pile.length - 1];
        if (card === undefined || !this.fitsFoundation(pos, card)) continue;
        const bestPile = pos.tab[best] as number[] | undefined;
        if (best === -1 || rank(card) < rank(bestPile?.[bestPile.length - 1] as number)) best = from;
      }
      if (best === -1) throw new Error('Solver: a finishable position could not be finished');
      this.apply(pos, { t: 'tab-found', from: best });
    }
  }

  private key(pos: Position): string {
    const piles = pos.tab.map((pile, i) => String.fromCharCode(65 + (pos.down[i] as number), ...pile.map((c) => c + 48)));
    piles.sort();
    // With one card drawn at a time and no limit on passes, every talon card can
    // always be reached, so where the waste ends does not matter.
    const talon = String.fromCharCode(...pos.talon.map((c) => c + 48));
    const where = this.draw === 1 && this.unlimited ? '' : `${pos.p}/${pos.passes}`;
    return `${piles.join('|')}#${talon}#${where}`;
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /** Candidate moves with a priority (higher first). Moves that cannot help are left out. */
  private candidates(pos: Position): { step: Step; value: number }[] {
    const out: { step: Step; value: number }[] = [];
    const piles = pos.tab.length;
    const firstEmpty = pos.tab.findIndex((pile) => pile.length === 0);

    // From the tableau.
    for (let from = 0; from < piles; from++) {
      const pile = pos.tab[from] as number[];
      if (pile.length === 0) continue;
      const down = pos.down[from] as number;
      const faceUp = pile.length - down;
      const top = pile[pile.length - 1] as number;

      if (this.fitsFoundation(pos, top)) {
        const reveals = faceUp === 1 && down > 0;
        out.push({ step: { t: 'tab-found', from }, value: reveals ? 120 + down : 90 });
      }

      for (let count = faceUp; count >= 1; count--) {
        const lead = pile[pile.length - count] as number;
        const whole = count === faceUp;
        let value: number;
        if (whole && down > 0) {
          value = 70 + down; // turns over a hidden card
        } else if (whole) {
          value = 20; // empties the pile
        } else {
          // Part of a run: only worth it if the card left on top can then go home.
          const exposed = pile[pile.length - count - 1] as number;
          if (!this.fitsFoundation(pos, exposed)) continue;
          value = 60;
        }
        for (let to = 0; to < piles; to++) {
          if (to === from || !this.fitsTableau(pos, lead, to)) continue;
          const toEmpty = (pos.tab[to] as number[]).length === 0;
          if (toEmpty && (to !== firstEmpty || (whole && down === 0))) continue;
          out.push({ step: { t: 'tab-tab', from, count, to }, value });
        }
      }
    }

    // From the talon: every card that drawing can bring to the top.
    for (let i = 0; i < pos.talon.length; i++) {
      const reach = this.reach(pos, i);
      if (reach < 0) continue;
      const card = pos.talon[i] as number;
      const cost = reach * 4 + (i + 1 === pos.p ? 0 : 1);
      if (this.fitsFoundation(pos, card)) out.push({ step: { t: 'talon-found', i }, value: 85 - cost });
      for (let to = 0; to < piles; to++) {
        if (!this.fitsTableau(pos, card, to)) continue;
        const toEmpty = (pos.tab[to] as number[]).length === 0;
        if (toEmpty && to !== firstEmpty) continue;
        out.push({ step: { t: 'talon-tab', i, to }, value: (toEmpty ? 40 : 50) - cost });
      }
    }

    // Back down from a foundation, to give a card somewhere to go.
    for (let s = 0; s < 4; s++) {
      const count = pos.found[s] as number;
      if (count < 3) continue;
      const card = s * 13 + count - 1;
      if (this.safeHome(pos, card)) continue;
      for (let to = 0; to < piles; to++) {
        if ((pos.tab[to] as number[]).length > 0 && this.fitsTableau(pos, card, to)) {
          out.push({ step: { t: 'found-tab', suit: s, to }, value: 5 });
        }
      }
    }

    return out.sort((a, b) => b.value - a.value);
  }

  private search(pos: Position): boolean {
    if (this.finishable(pos)) {
      this.finish(pos);
      return true;
    }
    if (++this.nodes > this.maxNodes) throw new OutOfBudget();
    const key = this.key(pos);
    if (this.seen.has(key)) return false;
    this.seen.add(key);

    for (const { step } of this.candidates(pos)) {
      const mark = this.path.length;
      const next = clone(pos);
      this.apply(next, step);
      this.autoplay(next);
      if (this.search(next)) return true;
      this.path.length = mark;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Back to the engine's moves
  // -------------------------------------------------------------------------

  /** Replays the solution on the real state, turning talon moves into draws and recycles. */
  private translate(): Move[] {
    const moves: Move[] = [];
    let state = this.state;
    const play = (move: Move) => {
      state = applyMove(state, move); // throws if the solver and the rules ever disagree
      moves.push(move);
    };
    const bringToTop = (card: CardId) => {
      for (let guard = 0; state.waste[state.waste.length - 1] !== card; guard++) {
        if (guard > 200) throw new Error(`Solver: cannot reach ${card} in the stock`);
        play(canDraw(state) ? { type: 'draw' } : { type: 'recycle' });
      }
    };
    const toFoundation = (card: CardId) => ({ kind: 'foundation', index: foundationFor(state, card) ?? -1 }) as const;

    // Replay against a compact copy too, to know which card each talon index names.
    const pos = fromState(this.state);
    for (const step of this.path) {
      switch (step.t) {
        case 'tab-found': {
          const pile = pos.tab[step.from] as number[];
          const card = toId(pile[pile.length - 1] as number);
          play({ type: 'move', from: { kind: 'tableau', index: step.from }, to: toFoundation(card), count: 1 });
          break;
        }
        case 'talon-found': {
          const card = toId(pos.talon[step.i] as number);
          bringToTop(card);
          play({ type: 'move', from: { kind: 'waste' }, to: toFoundation(card), count: 1 });
          break;
        }
        case 'talon-tab':
          bringToTop(toId(pos.talon[step.i] as number));
          play({ type: 'move', from: { kind: 'waste' }, to: { kind: 'tableau', index: step.to }, count: 1 });
          break;
        case 'tab-tab':
          play({
            type: 'move',
            from: { kind: 'tableau', index: step.from },
            to: { kind: 'tableau', index: step.to },
            count: step.count,
          });
          break;
        case 'found-tab': {
          const card = toId(step.suit * 13 + (pos.found[step.suit] as number) - 1);
          const index = state.foundations.findIndex((pile) => pile[pile.length - 1] === card);
          play({ type: 'move', from: { kind: 'foundation', index }, to: { kind: 'tableau', index: step.to }, count: 1 });
          break;
        }
      }
      this.apply(pos, step, false);
    }
    if (!isWon(state)) throw new Error('Solver: the solution does not win');
    return moves;
  }
}

/** Tries to win `state`. See the notes at the top of this file. */
export function solve(state: KlondikeState, options: SolveOptions = {}): SolveResult {
  return new Solver(state, options.maxNodes ?? DEFAULT_MAX_NODES).solve();
}

export interface WinnableDeal {
  seed: number;
  /** Deals tried, including this one. */
  tries: number;
}

/**
 * A deal that can be won with these rules: deals are tried from `nextSeed()`
 * until the solver wins one. Returns null after `maxTries` deals.
 */
export function findWinnableDeal(
  options: KlondikeOptions,
  nextSeed: () => number,
  { maxNodes = DEFAULT_MAX_NODES, maxTries = 200 }: { maxNodes?: number; maxTries?: number } = {},
): WinnableDeal | null {
  for (let tries = 1; tries <= maxTries; tries++) {
    const seed = nextSeed();
    if (solve(deal(seed, options), { maxNodes }).solved) return { seed, tries };
  }
  return null;
}
