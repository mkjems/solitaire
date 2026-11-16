/**
 * Winnable deals, found by the solver in a worker. One deal is kept ready for
 * each set of rules in use, so a new game starts without waiting: as soon as a
 * deal is handed out, the worker starts on the next.
 */

import type { KlondikeOptions } from '../engine/klondike';
import { randomDealNumber } from '../engine/rng';
import { SolverClient } from './solver-client';

/** How long a new game waits for the worker before dealing an unchecked game. */
const PATIENCE = 4000;

const keyOf = (options: KlondikeOptions): string => `${options.drawCount}/${options.scoring}`;

export class WinnableDeals {
  private readonly solver = new SolverClient();
  private readonly ready = new Map<string, Promise<number | null>>();

  /** Starts finding a deal for these rules, if one is not already ready or on its way. */
  prepare(options: KlondikeOptions): void {
    const key = keyOf(options);
    if (!this.ready.has(key)) this.ready.set(key, this.find(options));
  }

  /**
   * A winnable deal number for these rules. Falls back to an unchecked deal if
   * the worker cannot run or takes too long, so a game always starts.
   */
  async next(options: KlondikeOptions): Promise<number> {
    const key = keyOf(options);
    const found = this.ready.get(key) ?? this.find(options);
    this.ready.delete(key);
    this.prepare(options);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PATIENCE));
    return (await Promise.race([found, timeout])) ?? randomDealNumber();
  }

  private async find(options: KlondikeOptions): Promise<number | null> {
    const answer = await this.solver.ask({ kind: 'winnable', options });
    return answer?.seed ?? null;
  }
}
