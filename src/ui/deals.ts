/**
 * Winnable deals, found by the solver in a worker. One deal is kept ready for
 * each set of rules in use, so a new game starts without waiting: as soon as a
 * deal is handed out, the worker starts on the next.
 */

import type { KlondikeOptions } from '../engine/klondike';
import { randomDealNumber } from '../engine/rng';
import type { WinnableReply, WinnableRequest } from './solver.worker';

/** How long a new game waits for the worker before dealing an unchecked game. */
const PATIENCE = 4000;

const keyOf = (options: KlondikeOptions): string => `${options.drawCount}/${options.scoring}`;

export class WinnableDeals {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, (seed: number | null) => void>();
  private readonly ready = new Map<string, Promise<number | null>>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }: MessageEvent<WinnableReply>) => {
        this.waiting.get(data.id)?.(data.seed);
        this.waiting.delete(data.id);
      };
      this.worker.onerror = () => this.stop();
    } catch {
      this.worker = null;
    }
  }

  /** Starts finding a deal for these rules, if one is not already ready or on its way. */
  prepare(options: KlondikeOptions): void {
    const key = keyOf(options);
    if (!this.ready.has(key)) this.ready.set(key, this.request(options));
  }

  /**
   * A winnable deal number for these rules. Falls back to an unchecked deal if
   * the worker cannot run or takes too long, so a game always starts.
   */
  async next(options: KlondikeOptions): Promise<number> {
    const key = keyOf(options);
    const found = this.ready.get(key) ?? this.request(options);
    this.ready.delete(key);
    this.prepare(options);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PATIENCE));
    return (await Promise.race([found, timeout])) ?? randomDealNumber();
  }

  private request(options: KlondikeOptions): Promise<number | null> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      const message: WinnableRequest = { id, options };
      worker.postMessage(message);
    });
  }

  /** Without a worker every request answers at once with null: unchecked deals. */
  private stop(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const resolve of this.waiting.values()) resolve(null);
    this.waiting.clear();
    this.ready.clear();
  }
}
