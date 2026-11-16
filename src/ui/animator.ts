/**
 * The frame loop. Steps every card's springs, runs delayed tasks (used to
 * stagger the deal), and goes to sleep when nothing is moving.
 */

import type { CardView } from './cardview';

/** Springs are integrated in steps no longer than this, for stability. */
const MAX_STEP = 1 / 240;
/** A long frame (tab switch, GC pause) is treated as at most this long. */
const MAX_FRAME = 1 / 20;

interface Task {
  at: number;
  run: () => void;
}

export class Animator {
  private readonly cards: CardView[] = [];
  private tasks: Task[] = [];
  private readonly frameHooks = new Set<(dt: number) => void>();
  private running = false;
  private last = 0;

  add(card: CardView): void {
    this.cards.push(card);
  }

  /** Makes sure the loop is running. Call after changing any spring. */
  wake(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  /** Runs `run` after `delayMs`. */
  after(delayMs: number, run: () => void): void {
    this.tasks.push({ at: performance.now() + delayMs, run });
    this.wake();
  }

  /** Runs every pending task now, in order. Used to skip the deal. */
  flush(): void {
    while (this.tasks.length > 0) {
      const pending = this.tasks.sort((a, b) => a.at - b.at);
      this.tasks = [];
      for (const task of pending) task.run();
    }
    this.wake();
  }

  get hasPendingTasks(): boolean {
    return this.tasks.length > 0;
  }

  /** Calls `hook` every frame until the returned function is called. */
  onFrame(hook: (dt: number) => void): () => void {
    this.frameHooks.add(hook);
    this.wake();
    return () => this.frameHooks.delete(hook);
  }

  /** Renders every card once without advancing time. */
  renderAll(): void {
    for (const card of this.cards) card.render();
  }

  private readonly tick = (now: number): void => {
    const dt = Math.min(MAX_FRAME, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    if (this.tasks.length > 0) {
      const due = this.tasks.filter((task) => task.at <= now).sort((a, b) => a.at - b.at);
      if (due.length > 0) {
        this.tasks = this.tasks.filter((task) => task.at > now);
        for (const task of due) task.run();
      }
    }

    for (const hook of this.frameHooks) hook(dt);

    let moving = false;
    const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
    const h = dt / steps;
    for (const card of this.cards) {
      let active = false;
      for (let i = 0; i < steps; i++) active = card.step(h);
      card.render();
      moving = moving || active;
    }

    if (moving || this.tasks.length > 0 || this.frameHooks.size > 0) {
      requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };
}
