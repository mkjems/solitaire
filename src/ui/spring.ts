/**
 * A damped spring. Unlike a timed tween it can be retargeted at any moment
 * and keeps its velocity, which is what lets cards be caught mid-flight and
 * thrown without any visible seam.
 */

export interface SpringConfig {
  /** Higher is faster. */
  readonly stiffness: number;
  /** Higher settles with less overshoot. */
  readonly damping: number;
}

export class Spring {
  value: number;
  target: number;
  velocity = 0;
  stiffness: number;
  damping: number;
  /** Distance and speed below which the spring is considered settled. */
  private readonly rest: number;

  constructor(value: number, config: SpringConfig, rest = 0.05) {
    this.value = value;
    this.target = value;
    this.stiffness = config.stiffness;
    this.damping = config.damping;
    this.rest = rest;
  }

  configure(config: SpringConfig): void {
    this.stiffness = config.stiffness;
    this.damping = config.damping;
  }

  /** Jumps to a value with no motion. */
  set(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  get atRest(): boolean {
    return this.value === this.target && this.velocity === 0;
  }

  /** Advances by `dt` seconds. Returns true while still moving. */
  step(dt: number): boolean {
    if (this.atRest) return false;
    const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
    if (
      Math.abs(this.value - this.target) < this.rest &&
      Math.abs(this.velocity) < this.rest * 20
    ) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
}

/** Tuned spring settings. These numbers are the "feel" of the game. */
export const SPRINGS = {
  /** An ordinary card move. */
  move: { stiffness: 250, damping: 27 },
  /** The opening deal: a slower, longer glide. */
  deal: { stiffness: 150, damping: 21 },
  /** Gathering the deck before a new deal. */
  gather: { stiffness: 190, damping: 25 },
  /** A dragged card snapping into the pile it was dropped on. */
  snap: { stiffness: 420, damping: 34 },
  /** A dragged card gliding home after an invalid drop. */
  home: { stiffness: 210, damping: 25 },
  /** Layout changes: window resize and rotation. */
  resize: { stiffness: 600, damping: 48 },
  /** Turning a card over. */
  flip: { stiffness: 230, damping: 29 },
  /** Lifting off the table and settling back. */
  lift: { stiffness: 380, damping: 32 },
  /** Tilt while dragging: slightly loose, so a stop ends in a small swing. */
  tilt: { stiffness: 190, damping: 17 },
  /** The "no" wobble when a card has nowhere to go. */
  wobble: { stiffness: 420, damping: 13 },
} as const satisfies Record<string, SpringConfig>;
