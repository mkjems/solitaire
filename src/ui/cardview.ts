/**
 * One card on screen. Every visual property is a spring; the element is only
 * ever changed through its transform, so movement stays on the GPU.
 */

import type { CardId } from '../engine/cards';
import type { Pose } from './layout';
import { SPRINGS, Spring, type SpringConfig } from './spring';

/** z-index offsets: cards in flight sit above resting cards, dragged cards above everything. */
const Z_FLYING = 1000;
const Z_DRAGGED = 2000;

export class CardView {
  readonly id: CardId;
  readonly el: HTMLDivElement;
  private readonly shadow: HTMLDivElement;
  private readonly face: HTMLImageElement;

  readonly x = new Spring(0, SPRINGS.move);
  readonly y = new Spring(0, SPRINGS.move);
  /** Tilt in degrees. */
  readonly rot = new Spring(0, SPRINGS.tilt, 0.02);
  /** 0 = face down, 1 = face up. */
  readonly flip = new Spring(0, SPRINGS.flip, 0.002);
  /** 0 = resting on the table, 1 = lifted. */
  readonly lift = new Spring(0, SPRINGS.lift, 0.002);
  /**
   * Whether the card shows its shadow when lifted. Off for cards moving as part
   * of a pack, where one shadow stands for the whole pack (dozens of them on
   * top of each other add up to a heavy blot). Each move turns it back on.
   */
  castsShadow = true;

  /** Point the card tilts and scales around, relative to its centre. Set while dragging. */
  pivotX = 0;
  pivotY = 0;
  dragging = false;

  /** Called when the card arrives at its destination (the moment to play a sound). */
  onLand: ((card: CardView) => void) | null = null;
  /** Called when the card turns over. */
  onTurn: ((card: CardView) => void) | null = null;
  /** The pile the card is heading for or resting in. */
  pile = '';

  private z = 0;
  private dragOrder = 0;
  private flying = false;
  private landPending = false;
  private quietTurn = false;
  private shownFaceUp = false;
  private lastTransform = '';
  private lastShadow = -1;
  private lastZ = -1;
  private width = 0;
  private height = 0;

  constructor(id: CardId, faceUrl: string) {
    this.id = id;

    this.el = document.createElement('div');
    this.el.className = 'card';
    this.el.dataset.card = id;

    this.shadow = document.createElement('div');
    this.shadow.className = 'card-shadow';

    const face = document.createElement('img');
    this.face = face;
    face.className = 'card-face';
    face.src = faceUrl;
    face.alt = '';
    face.draggable = false;
    face.decoding = 'async';

    const back = document.createElement('div');
    back.className = 'card-back';

    this.el.append(this.shadow, face, back);
  }

  /** Switches the face artwork, e.g. to the large-print set on small screens. */
  setFace(url: string): void {
    if (this.face.src !== url) this.face.src = url;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** Places the card immediately, with no animation. */
  place(pose: Pose): void {
    this.x.set(pose.x);
    this.y.set(pose.y);
    this.rot.set(0);
    this.flip.set(pose.faceUp ? 1 : 0);
    this.lift.set(0);
    this.castsShadow = true;
    this.z = pose.z;
    this.flying = false;
    this.landPending = false;
    this.quietTurn = true;
    this.pile = pose.pile;
    this.el.dataset.pile = pose.pile;
  }

  /**
   * Sends the card towards a pose. It lifts for the journey and settles on arrival.
   * A quiet move makes no sound (used for layout changes).
   */
  moveTo(pose: Pose, config: SpringConfig, quiet = false): void {
    this.z = pose.z;
    this.pile = pose.pile;
    this.el.dataset.pile = pose.pile;
    this.x.configure(config);
    this.y.configure(config);
    this.x.target = pose.x;
    this.y.target = pose.y;
    this.rot.target = 0;
    this.flip.target = pose.faceUp ? 1 : 0;
    const distance = Math.hypot(this.x.value - pose.x, this.y.value - pose.y);
    if (distance > 1 || !this.flip.atRest) this.flying = true;
    this.landPending = !quiet && distance > this.width * 0.08;
    this.quietTurn = quiet;
    this.castsShadow = true;
  }

  startDrag(order: number): void {
    this.dragging = true;
    this.dragOrder = order;
    this.flying = true;
    this.lift.target = 1;
  }

  endDrag(): void {
    this.dragging = false;
    this.landPending = true;
  }

  get faceUp(): boolean {
    return this.flip.target === 1;
  }

  /** Advances the springs. Returns true while anything is still moving. */
  step(dt: number): boolean {
    let moving = false;
    if (!this.dragging) {
      moving = this.x.step(dt) || moving;
      moving = this.y.step(dt) || moving;

      if (this.flying) {
        // Stay lifted while travelling, settle when nearly there.
        const remaining = Math.hypot(this.x.value - this.x.target, this.y.value - this.y.target);
        this.lift.target = remaining > this.width * 0.35 ? 1 : 0;
        if (this.landPending && remaining < Math.max(2, this.width * 0.05)) {
          this.landPending = false;
          this.onLand?.(this);
        }
        if (this.x.atRest && this.y.atRest && this.flip.atRest) {
          this.flying = false;
          this.lift.target = 0;
        }
      }
    }
    moving = this.rot.step(dt) || moving;
    moving = this.flip.step(dt) || moving;
    moving = this.lift.step(dt) || moving;

    if (!this.dragging && !this.flying && this.rot.atRest && this.lift.atRest) {
      this.pivotX = 0;
      this.pivotY = 0;
    }
    return moving || this.flying;
  }

  /** Writes the current spring values to the element. */
  render(): void {
    const flip = Math.min(1, Math.max(0, this.flip.value));
    const lift = Math.max(0, this.lift.value);

    const faceUp = flip > 0.5;
    if (faceUp !== this.shownFaceUp || this.lastZ === -1) {
      if (this.lastZ !== -1 && !this.quietTurn) this.onTurn?.(this);
      this.shownFaceUp = faceUp;
      this.el.classList.toggle('is-face-up', faceUp);
      this.el.dataset.face = faceUp ? 'up' : 'down';
    }

    // The card rises a little as it turns over, and whenever it is lifted.
    const scale = 1 + 0.045 * lift + 0.07 * Math.sin(Math.PI * flip);
    const angle = (this.rot.value * Math.PI) / 180;

    // Tilt and scale around the pivot (the grab point) instead of the centre.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = this.x.value + this.pivotX - scale * (cos * this.pivotX - sin * this.pivotY);
    const ty = this.y.value + this.pivotY - scale * (sin * this.pivotX + cos * this.pivotY);

    // The back turns from 0° to -90°, then the face continues from 90° to 0°.
    const turn = faceUp ? (1 - flip) * 180 : -flip * 180;

    let transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0)`;
    if (this.rot.value !== 0) transform += ` rotate(${this.rot.value.toFixed(2)}deg)`;
    if (scale !== 1) transform += ` scale(${scale.toFixed(4)})`;
    if (turn !== 0) transform += ` perspective(${Math.round(this.height * 4)}px) rotateY(${turn.toFixed(1)}deg)`;

    if (transform !== this.lastTransform) {
      this.lastTransform = transform;
      this.el.style.transform = transform;
    }

    const shadow = this.castsShadow ? Math.round(Math.min(1, lift) * 100) / 100 : 0;
    if (shadow !== this.lastShadow) {
      if ((shadow > 0) !== (this.lastShadow > 0)) this.el.classList.toggle('is-lifted', shadow > 0);
      this.lastShadow = shadow;
      this.shadow.style.opacity = String(shadow);
    }

    const z = this.dragging ? Z_DRAGGED + this.dragOrder : this.flying ? Z_FLYING + this.z : this.z;
    if (z !== this.lastZ) {
      this.lastZ = z;
      this.el.style.zIndex = String(z);
    }
  }
}
