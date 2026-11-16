/**
 * Hints: the most useful-looking move in a position, by simple priorities.
 * This is a heuristic, not a solver; a solver-backed hint comes later.
 */

import { rankOf } from './cards';
import { type KlondikeState, type Move, type TableauPile, legalMoves } from './klondike';

/** Higher is better. Moves scoring zero or less are never suggested. */
function value(state: KlondikeState, move: Move): number {
  if (move.type === 'draw' || move.type === 'recycle') return 1;

  const { from, to, count } = move;
  if (from.kind === 'foundation') return 0;

  if (from.kind === 'tableau') {
    const pile = state.tableau[from.index] as TableauPile;
    const faceUp = pile.cards.length - pile.faceDown;
    const movesWholeRun = count === faceUp;
    const uncovers = movesWholeRun && pile.faceDown > 0;

    if (to.kind === 'foundation') return uncovers ? 100 + pile.faceDown : 80;
    // Revealing a hidden card is the main way to make progress; deeper piles first.
    if (uncovers) return 60 + pile.faceDown;
    // Shifting part of a run, or a King from one empty pile to another, achieves nothing.
    return 0;
  }

  // From the waste.
  if (to.kind === 'foundation') return 90;
  const card = state.waste[state.waste.length - 1];
  const target = state.tableau[to.kind === 'tableau' ? to.index : 0] as TableauPile;
  // A King into an empty pile is fine, but other placements are preferred.
  if (card !== undefined && rankOf(card) === 13 && target.cards.length === 0) return 40;
  return 50;
}

/** The suggested move, or null when nothing useful is available. */
export function hint(state: KlondikeState): Move | null {
  let best: Move | null = null;
  let bestValue = 0;
  for (const move of legalMoves(state)) {
    const v = value(state, move);
    if (v > bestValue) {
      bestValue = v;
      best = move;
    }
  }
  return best;
}
