/**
 * The solver's view of the game in progress: whether a position can still be
 * won, and how. Answers come from a worker of their own (so hints never wait
 * behind deal-finding) and are remembered. A winning line also answers for
 * every position along it, so a player who follows the hints gets each next
 * one at once, and undoing to a position seen before needs no new search.
 */

import { type KlondikeState, applyMove } from '../engine/klondike';
import type { SolveResult } from '../engine/solver';
import { SolverClient } from './solver-client';
import type { Advice } from './table';

/** Positions remembered before the memory is cleared. */
const MEMORY = 4000;

/** Everything that decides what can happen next (not the score or move count). */
function positionKey(state: KlondikeState): string {
  const { stock, waste, foundations, tableau, recycles, options } = state;
  return JSON.stringify([stock, waste, foundations, tableau, recycles, options.drawCount, options.scoring === 'vegas']);
}

function adviceFrom(result: SolveResult | undefined): Advice {
  if (result?.status === 'won') return { status: 'won', line: result.moves };
  if (result?.status === 'lost') return { status: 'lost' };
  return { status: 'unknown' };
}

export class Advisor {
  private readonly solver = new SolverClient();
  private readonly known = new Map<string, Advice>();
  private readonly asking = new Map<string, Promise<Advice>>();

  /** The solver's view of `state`, from memory or from the worker. */
  advice(state: KlondikeState): Promise<Advice> {
    const key = positionKey(state);
    const known = this.known.get(key);
    if (known) return Promise.resolve(known);
    const pending = this.asking.get(key);
    if (pending) return pending;

    const answer = this.solver.ask({ kind: 'analyse', state }).then((reply) => {
      this.asking.delete(key);
      const advice = adviceFrom(reply?.result);
      // Without a worker every answer is "unknown"; do not remember that as fact.
      if (reply) this.remember(state, advice);
      return advice;
    });
    this.asking.set(key, answer);
    return answer;
  }

  /** As `advice`, but answers "unknown" if the worker takes longer than `ms`. */
  adviceWithin(state: KlondikeState, ms: number): Promise<Advice> {
    const late = new Promise<Advice>((resolve) => setTimeout(() => resolve({ status: 'unknown' }), ms));
    return Promise.race([this.advice(state), late]);
  }

  private remember(state: KlondikeState, advice: Advice): void {
    if (this.known.size > MEMORY) this.known.clear();
    this.known.set(positionKey(state), advice);
    if (advice.status !== 'won') return;
    // Every position along a winning line is winnable by the rest of the line.
    let position = state;
    advice.line.forEach((move, i) => {
      position = applyMove(position, move);
      this.known.set(positionKey(position), { status: 'won', line: advice.line.slice(i + 1) });
    });
  }
}
