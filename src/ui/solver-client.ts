/**
 * Talks to one solver worker. Jobs run one after another in the worker; each
 * request gets its own answer. If the worker cannot start or fails, every
 * request answers null, and callers carry on without the solver.
 */

import type { SolverAnswer, SolverJob } from './solver.worker';

type AnswerFor<K extends SolverJob['kind']> = Extract<SolverAnswer, { kind: K }>;

export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, (answer: SolverAnswer | null) => void>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }: MessageEvent<{ id: number; answer: SolverAnswer }>) => {
        this.waiting.get(data.id)?.(data.answer);
        this.waiting.delete(data.id);
      };
      this.worker.onerror = () => this.stop();
    } catch {
      this.worker = null;
    }
  }

  ask<K extends SolverJob['kind']>(job: Extract<SolverJob, { kind: K }>): Promise<AnswerFor<K> | null> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiting.set(id, resolve as (answer: SolverAnswer | null) => void);
      worker.postMessage({ id, job });
    });
  }

  private stop(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const resolve of this.waiting.values()) resolve(null);
    this.waiting.clear();
  }
}
