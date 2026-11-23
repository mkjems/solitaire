/**
 * The card table: owns the game in progress, the 52 card views, the deal
 * animations, sound cues, and all pointer input (drag and drop, tap to move,
 * drawing).
 */

import { type CardId, fullDeck, rankOf } from '../engine/cards';
import { KlondikeGame } from '../engine/game';
import { hint } from '../engine/hint';
import {
  FOUNDATION_PILES,
  type KlondikeOptions,
  type KlondikeState,
  type Move,
  type PileRef,
  TABLEAU_PILES,
  autoFinishMove,
  canAutoFinish,
  canRecycle,
  findCard,
  isLegal,
  isWon,
  quickMove,
  scoreAt,
} from '../engine/klondike';
import { randomDealNumber } from '../engine/rng';
import { Animator } from './animator';
import type { SoundBoard } from './audio';
import { CardView } from './cardview';
import {
  type Insets,
  type Layout,
  type Point,
  type Pose,
  computeLayout,
  computePoses,
  dropZone,
  landingSpot,
  overlapArea,
} from './layout';
import { SPRINGS, type SpringConfig } from './spring';
import { type Back, type Deck, backUrl, faceUrl } from './theme';

export type Phase = 'loading' | 'dealing' | 'playing' | 'finishing' | 'won';

export interface TableEvents {
  /** Anything visible changed: position, phase, history. */
  change(): void;
  /** The first move of a game was played. */
  started(): void;
  /** The game was won. */
  won(): void;
  /** A hint was asked for but there is nothing useful to do. */
  noHint(): void;
  /** A hint was asked for, and the game can no longer be won. */
  lost(): void;
}

/** What the solver says about a position (see src/ui/advisor.ts). */
export type Advice = { status: 'won'; line: readonly Move[] } | { status: 'lost' } | { status: 'unknown' };

/** Milliseconds between cards in the opening deal. */
const DEAL_INTERVAL = 58;
/** Milliseconds between cards when drawing three. */
const DRAW_INTERVAL = 75;
/** Milliseconds between cards in an automatic finish. */
const FINISH_INTERVAL = 95;
/** How long a hint stays visible. */
const HINT_TIME = 1700;

/**
 * Below this card width the large-print faces are used, in both layouts: on a
 * phone, upright or sideways, the original artwork is too fine to read.
 */
const LARGE_PRINT_BELOW = 84;

function wantsLargePrint(layout: Layout): boolean {
  return layout.cardW < LARGE_PRINT_BELOW;
}

/** Pentatonic steps for foundation chimes, Ace to King: each card home rings a little higher. */
const CHIME_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

interface DragState {
  pointerId: number;
  touch: boolean;
  from: PileRef;
  count: number;
  views: CardView[];
  /** Each dragged card's resting offset from the lead card. */
  offsets: Point[];
  /** Pointer position relative to the lead card's top-left corner. */
  grabX: number;
  grabY: number;
  startX: number;
  startY: number;
  /** How far the pointer must travel before a press counts as a drag. */
  threshold: number;
  moved: boolean;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
  tiltSign: number;
  targets: PileRef[];
  target: PileRef | null;
  stopFrameHook: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pileKey(pile: PileRef): string {
  return pile.kind === 'foundation' || pile.kind === 'tableau'
    ? `${pile.kind}-${pile.index}`
    : pile.kind;
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported; haptics are a nicety.
  }
}

export class Table {
  phase: Phase = 'loading';
  /** The deck and card back in use. Set before load() to avoid loading the defaults first. */
  private deck: Deck = 'classic';
  private back: Back = 'navy';
  private backUrl = backUrl('navy');

  private game: KlondikeGame;
  private options: KlondikeOptions;
  private layout: Layout;
  private readonly animator = new Animator();
  private readonly views = new Map<CardId, CardView>();
  private readonly slots = new Map<string, HTMLDivElement>();
  private readonly cardLayer: HTMLDivElement;
  private readonly dropHint: HTMLDivElement;
  private drag: DragState | null = null;
  /** A touch on the stock: it draws when the finger lifts, unless the touch became a scroll. */
  private stockTouch: number | null = null;
  /** Bumped whenever cards are retargeted, so stale delayed moves are dropped. */
  private generation = 0;
  private hasDealt = false;
  private started = false;
  private largePrint: boolean | null = null;
  private hintTimer: number | undefined;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private clockStartedAt: number | null = null;
  private clockElapsed = 0;

  constructor(
    private readonly root: HTMLElement,
    options: KlondikeOptions,
    private readonly getInsets: (width: number, height: number) => Insets,
    private readonly sounds: SoundBoard,
    private readonly events: TableEvents,
  ) {
    this.options = options;
    this.game = new KlondikeGame(0, options);

    const slotLayer = document.createElement('div');
    slotLayer.className = 'slots';
    this.cardLayer = document.createElement('div');
    this.cardLayer.className = 'cards';
    this.dropHint = document.createElement('div');
    this.dropHint.className = 'drop-hint';
    // The hint lives among the cards so it sits above resting cards but below dragged ones.
    this.cardLayer.append(this.dropHint);
    root.append(slotLayer, this.cardLayer);

    const addSlot = (key: string, kind: string): void => {
      const slot = document.createElement('div');
      slot.className = `slot slot-${kind}`;
      slot.dataset.slot = key;
      slotLayer.append(slot);
      this.slots.set(key, slot);
    };
    addSlot('stock', 'stock');
    addSlot('waste', 'waste');
    for (let i = 0; i < FOUNDATION_PILES; i++) addSlot(`foundation-${i}`, 'foundation');
    for (let i = 0; i < TABLEAU_PILES; i++) addSlot(`tableau-${i}`, 'tableau');

    this.layout = this.measure();
    root.style.setProperty('--card-back', `url("${this.backUrl}")`);
    for (const id of fullDeck()) {
      const view = new CardView(id, this.faceUrl(id, wantsLargePrint(this.layout)));
      view.onLand = this.onCardLand;
      view.onTurn = this.onCardTurn;
      this.views.set(id, view);
      this.animator.add(view);
      this.cardLayer.append(view.el);
    }

    this.applyLayout();

    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerCancel);
    root.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', () => this.relayout());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseClock();
      else if (this.phase === 'playing' && this.started) this.startClock();
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  get state(): KlondikeState {
    return this.game.state;
  }

  /**
   * Changes the deck: the faces and the backs. The new faces are loaded before
   * they replace the old, so no card is ever blank.
   */
  setDeck(deck: Deck): void {
    if (deck === this.deck) return;
    this.deck = deck;
    this.setCardBack(this.back);
    const largePrint = this.largePrint ?? wantsLargePrint(this.layout);
    if (this.phase === 'loading') {
      // Before the first deal: load() waits for these.
      for (const view of this.views.values()) view.setFace(this.faceUrl(view.id, largePrint));
      return;
    }
    const urls = [...this.views.keys()].map((id) => this.faceUrl(id, largePrint));
    const decoded = urls.map((url) => {
      const image = new Image();
      image.src = url;
      return image.decode().catch(() => undefined);
    });
    void Promise.all(decoded).then(() => {
      if (this.deck !== deck) return;
      const now = this.largePrint ?? largePrint;
      for (const view of this.views.values()) view.setFace(this.faceUrl(view.id, now));
    });
  }

  /** Changes the card backs. The new back is loaded before it replaces the old, so nothing flickers. */
  setCardBack(back: Back): void {
    this.back = back;
    const url = backUrl(back, this.deck);
    if (url === this.backUrl) return;
    this.backUrl = url;
    const image = new Image();
    image.src = url;
    void image
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (this.backUrl === url) this.root.style.setProperty('--card-back', `url("${url}")`);
      });
  }

  /** The moves played so far, for saving the game. */
  get log(): Move[] {
    return this.game.log;
  }

  get canUndo(): boolean {
    return this.phase === 'playing' && this.game.canUndo;
  }

  get canRedo(): boolean {
    return this.phase === 'playing' && this.game.canRedo;
  }

  get canFinish(): boolean {
    return this.phase === 'playing' && canAutoFinish(this.game.state);
  }

  /** Whether the current game has had a move played (and so counts in the statistics). */
  get hasStarted(): boolean {
    return this.started;
  }

  /** Seconds played in this game. The clock starts with the first move. */
  get seconds(): number {
    const running = this.clockStartedAt === null ? 0 : performance.now() - this.clockStartedAt;
    return Math.floor((this.clockElapsed + running) / 1000);
  }

  get score(): number {
    return scoreAt(this.game.state, this.seconds);
  }

  /** Waits for the card images, so the first deal never shows blank cards. */
  async load(): Promise<void> {
    const images = Array.from(this.cardLayer.querySelectorAll('img'));
    const back = new Image();
    back.src = this.backUrl;
    const decoded = Promise.all([...images, back].map((img) => img.decode().catch(() => undefined)));
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    await Promise.race([decoded, timeout]);
  }

  setOptions(options: KlondikeOptions): void {
    this.options = options;
  }

  /** Starts a new game and plays the opening deal. */
  newGame(seed: number = randomDealNumber()): void {
    this.begin(new KlondikeGame(seed, this.options), 0, false);
  }

  /** Continues a saved game: the cards are dealt straight to where they were. */
  resume(seed: number, options: KlondikeOptions, moves: readonly Move[], seconds: number): void {
    const game = KlondikeGame.restore(seed, options, moves);
    this.begin(game, seconds * 1000, game.log.length > 0);
  }

  /** Deals the same game again. */
  restart(): void {
    this.newGame(this.game.state.seed);
  }

  undo(): void {
    this.undoMoves(1);
  }

  /** Takes back the last `count` moves in one go. */
  undoMoves(count: number): void {
    if (this.phase !== 'playing' || this.drag) return;
    this.clearHint();
    let undone = 0;
    while (undone < count && this.game.undo()) undone++;
    if (undone > 0) this.sync(SPRINGS.move);
  }

  /** The positions before each move played, oldest first. */
  get history(): KlondikeState[] {
    return this.game.history;
  }

  redo(): void {
    if (this.phase !== 'playing' || this.drag) return;
    this.clearHint();
    if (this.game.redo()) this.sync(SPRINGS.move);
  }

  /** Draws from the stock, or turns the waste over if the stock is empty. */
  drawOrRecycle(): void {
    if (this.phase !== 'playing' || this.drag) return;
    if (!this.play({ type: 'draw' }) && !this.play({ type: 'recycle' })) {
      this.sounds.play('deny', { volume: 0.6, pan: this.pan(this.layout.stock.x) });
    }
  }

  /** Plays the remaining cards to the foundations once the game cannot be lost. */
  finish(): void {
    if (!this.canFinish) return;
    this.clearHint();
    this.setPhase('finishing');
    const step = (): void => {
      if (this.phase !== 'finishing') return;
      const move = autoFinishMove(this.game.state);
      if (!move || !this.game.play(move)) return;
      this.sync(SPRINGS.move);
      if (isWon(this.game.state)) this.win();
      else setTimeout(step, FINISH_INTERVAL);
    };
    step();
  }

  /**
   * Where hints come from: the solver's advice for a position. Without it (or
   * when the solver has no answer) hints fall back to simple rules.
   */
  adviser: ((state: KlondikeState) => Promise<Advice>) | null = null;

  /**
   * Shows a good move: the next move of a winning line when the solver has one,
   * otherwise the most useful-looking move. The cards glow and their
   * destination is outlined.
   */
  async showHint(): Promise<void> {
    if (this.phase !== 'playing' || this.drag) return;
    this.clearHint();
    const state = this.game.state;
    const advice = this.adviser ? await this.adviser(state) : null;
    // The player may have moved on while the solver was thinking.
    if (this.game.state !== state || this.phase !== 'playing' || this.drag) return;
    if (advice?.status === 'lost') {
      this.events.lost();
      return;
    }
    const move = (advice?.status === 'won' ? advice.line[0] : undefined) ?? hint(state);
    if (!move) {
      this.events.noHint();
      return;
    }

    let cards: readonly CardId[] = [];
    let target: Point | null = null;

    if (move.type === 'move') {
      if (move.from.kind === 'waste') cards = state.waste.slice(-1);
      else if (move.from.kind === 'tableau') cards = state.tableau[move.from.index]?.cards.slice(-move.count) ?? [];
      target = landingSpot(state, this.layout, move.to);
    } else {
      const top = state.stock[state.stock.length - 1];
      if (top) cards = [top];
      else this.slots.get('stock')?.classList.add('is-hinted');
    }

    for (const id of cards) {
      const view = this.view(id);
      view.el.classList.add('is-hinted');
      // A small nudge towards the destination draws the eye.
      if (target) {
        view.x.velocity += clamp(target.x - view.x.value, -1, 1) * this.layout.cardW * 2.2;
        view.y.velocity += clamp(target.y - view.y.value, -1, 1) * this.layout.cardW * 2.2;
      } else {
        view.y.velocity -= this.layout.cardW * 2.2;
      }
    }
    if (target) {
      this.dropHint.style.transform = `translate3d(${target.x}px,${target.y}px,0)`;
      this.dropHint.classList.add('is-visible', 'is-hint');
    }
    this.animator.wake();
    this.hintTimer = window.setTimeout(() => this.clearHint(), HINT_TIME);
  }

  // -------------------------------------------------------------------------
  // Dealing
  // -------------------------------------------------------------------------

  private begin(game: KlondikeGame, elapsedMs: number, alreadyStarted: boolean): void {
    this.cancelDrag();
    this.clearHint();
    this.game = game;
    this.options = game.state.options;
    this.started = alreadyStarted;
    this.clockStartedAt = null;
    this.clockElapsed = elapsedMs;
    this.setPhase('dealing');
    this.dealIn();
  }

  /**
   * Gathers every card into a pack on the stock, then deals the cards that
   * are not in the stock to where the current position has them. For a new
   * game this is the traditional row-by-row deal.
   */
  private dealIn(): void {
    const gen = ++this.generation;
    const state = this.game.state;
    const layout = this.layout;
    const finalPoses = computePoses(state, layout);

    if (this.reducedMotion) {
      for (const [id, pose] of finalPoses) this.view(id).place(pose);
      this.hasDealt = true;
      this.animator.renderAll();
      this.setPhase('playing');
      this.sync(SPRINGS.move);
      return;
    }

    // Tableau row by row, then the foundations from the Ace up, then the waste.
    const dealt: CardId[] = [];
    const rows = Math.max(...state.tableau.map((pile) => pile.cards.length));
    for (let row = 0; row < rows; row++) {
      for (const pile of state.tableau) {
        const card = pile.cards[row];
        if (card) dealt.push(card);
      }
    }
    const longest = Math.max(...state.foundations.map((pile) => pile.length));
    for (let i = 0; i < longest; i++) {
      for (const pile of state.foundations) {
        const card = pile[i];
        if (card) dealt.push(card);
      }
    }
    dealt.push(...state.waste);

    // The pack: the stock at the bottom, the first card to be dealt on top.
    const pack = [...state.stock, ...dealt.slice().reverse()];
    const packPose = (i: number): Pose => ({
      x: layout.stock.x - i * layout.thickness,
      y: layout.stock.y - i * layout.thickness,
      faceUp: false,
      z: i,
      pile: 'stock',
    });

    const firstDeal = !this.hasDealt;
    pack.forEach((id, i) => {
      const view = this.view(id);
      const pose = packPose(i);
      if (firstDeal) {
        // The pack slides in from above the table.
        view.place({ ...pose, y: pose.y - layout.stock.y - layout.cardH * 1.25 });
      }
      view.moveTo(pose, SPRINGS.gather, true);
      // The pack arrives as one: only its bottom card casts a shadow.
      if (firstDeal) view.castsShadow = i === 0;
    });
    this.hasDealt = true;
    this.sounds.play(firstDeal ? 'slide' : 'shuffle', { pan: this.pan(layout.stock.x), volume: firstDeal ? 0.8 : 1 });
    const gatherTime = firstDeal ? 560 : 640;

    // Long resumed games are dealt faster, so the wait stays short.
    const interval = Math.min(DEAL_INTERVAL, 1700 / Math.max(1, dealt.length));

    dealt.forEach((id, k) => {
      const pose = finalPoses.get(id) as Pose;
      const view = this.view(id);
      const launch = gatherTime + k * interval;
      this.animator.after(launch, () => {
        if (gen !== this.generation) return;
        // Leaves the pack face down with a slight spin.
        view.rot.configure(SPRINGS.tilt);
        view.rot.velocity = (k % 2 === 0 ? 1 : -1) * (70 + Math.random() * 70);
        view.moveTo({ ...pose, faceUp: false }, SPRINGS.deal);
        this.sounds.play('slide', { volume: 0.45, pan: this.pan(pose.x) });
      });
      if (pose.faceUp) {
        // Turns over as it lands.
        this.animator.after(launch + 210, () => {
          if (gen === this.generation) view.moveTo(pose, SPRINGS.deal);
        });
      }
    });

    this.animator.after(gatherTime + dealt.length * interval + 380, () => {
      if (gen !== this.generation) return;
      this.setPhase('playing');
      if (this.started) this.startClock();
    });
    this.events.change();
  }

  private skipDeal(): void {
    this.animator.flush();
    if (this.phase === 'playing') this.sync(SPRINGS.snap, undefined, true);
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  private measure(): Layout {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    return computeLayout(width, height, this.getInsets(width, height));
  }

  private faceUrl(id: CardId, largePrint: boolean): string {
    return faceUrl(id, this.deck, largePrint);
  }

  private applyLayout(): void {
    const layout = this.layout;
    this.root.style.setProperty('--card-w', `${layout.cardW}px`);
    this.root.style.setProperty('--card-h', `${layout.cardH}px`);
    this.root.dataset.layout = layout.mode;
    const largePrint = wantsLargePrint(layout);
    const switchFaces = largePrint !== this.largePrint;
    this.largePrint = largePrint;
    for (const view of this.views.values()) {
      view.setSize(layout.cardW, layout.cardH);
      if (switchFaces) view.setFace(this.faceUrl(view.id, largePrint));
    }

    const place = (key: string, point: Point): void => {
      const slot = this.slots.get(key);
      if (slot) slot.style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
    };
    place('stock', layout.stock);
    place('waste', layout.waste);
    layout.foundations.forEach((point, i) => place(`foundation-${i}`, point));
    layout.tableau.forEach((point, i) => place(`tableau-${i}`, point));
  }

  /** Recomputes the layout after a resize or rotation and moves the cards to match. */
  relayout(): void {
    this.cancelDrag();
    this.clearHint();
    if (this.phase === 'dealing') this.animator.flush();
    this.layout = this.measure();
    this.applyLayout();
    if (this.phase !== 'loading') this.sync(SPRINGS.resize, undefined, true);
  }

  /** Stereo position for a point on the table: gently left to right. */
  private pan(x: number): number {
    return clamp(((x + this.layout.cardW / 2) / this.layout.width) * 2 - 1, -1, 1) * 0.55;
  }

  // -------------------------------------------------------------------------
  // Keeping the cards in step with the game
  // -------------------------------------------------------------------------

  private view(id: CardId): CardView {
    return this.views.get(id) as CardView;
  }

  /** Sends every card to where the current position says it belongs. */
  private sync(config: SpringConfig, delays?: Map<CardId, number>, quiet = false): void {
    const gen = ++this.generation;
    const poses = computePoses(this.game.state, this.layout);
    for (const [id, pose] of poses) {
      const view = this.view(id);
      if (view.dragging) continue;
      const delay = delays?.get(id) ?? 0;
      if (delay > 0) {
        this.animator.after(delay, () => {
          if (gen === this.generation) view.moveTo(pose, config, quiet);
        });
      } else {
        view.moveTo(pose, config, quiet);
      }
    }
    this.animator.wake();
    this.updateSlots();
    this.events.change();
  }

  private play(move: Move, config: SpringConfig = SPRINGS.move): boolean {
    const before = this.game.state;
    if (!this.game.play(move)) return false;
    this.clearHint();
    const after = this.game.state;
    this.startClock();
    if (!this.started) {
      this.started = true;
      this.events.started();
    }

    const delays = new Map<CardId, number>();
    let quiet = false;
    if (move.type === 'draw') {
      // Cards leave the stock one after another.
      after.waste.slice(before.waste.length).forEach((id, i) => {
        delays.set(id, i * DRAW_INTERVAL);
        this.sounds.play('slide', { delay: (i * DRAW_INTERVAL) / 1000, volume: 0.7, pan: this.pan(this.layout.stock.x) });
      });
    } else if (move.type === 'recycle') {
      after.stock.forEach((id, i) => delays.set(id, i * 9));
      this.sounds.play('riffle', { pan: this.pan(this.layout.stock.x) });
      quiet = true;
    }

    this.sync(config, delays, quiet);
    if (isWon(after)) this.win();
    return true;
  }

  private win(): void {
    this.pauseClock();
    this.setPhase('won');
    // The four kings hop in turn, each with a rising chime.
    this.game.state.foundations.forEach((pile, i) => {
      const king = pile[pile.length - 1];
      if (!king) return;
      this.animator.after(450 + i * 120, () => {
        if (this.phase !== 'won') return;
        const view = this.view(king);
        view.y.velocity = -this.layout.cardH * 4.5;
        this.sounds.play('chime', { semitones: [12, 16, 19, 24][i] ?? 24, pan: this.pan(view.x.value), volume: 1.3 });
      });
    });
    this.events.won();
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.root.dataset.phase = phase;
    this.updateSlots();
    this.events.change();
  }

  private updateSlots(): void {
    const stock = this.slots.get('stock');
    if (!stock) return;
    const state = this.game.state;
    stock.classList.toggle('can-recycle', this.phase !== 'loading' && canRecycle(state));
    stock.classList.toggle(
      'is-spent',
      this.phase === 'playing' && state.stock.length === 0 && !canRecycle(state),
    );
  }

  private startClock(): void {
    if (this.clockStartedAt === null && this.phase === 'playing') {
      this.clockStartedAt = performance.now();
    }
  }

  private pauseClock(): void {
    if (this.clockStartedAt !== null) {
      this.clockElapsed += performance.now() - this.clockStartedAt;
      this.clockStartedAt = null;
    }
  }

  private clearHint(): void {
    if (this.hintTimer === undefined) return;
    window.clearTimeout(this.hintTimer);
    this.hintTimer = undefined;
    for (const el of this.root.querySelectorAll('.is-hinted')) el.classList.remove('is-hinted');
    this.dropHint.classList.remove('is-visible', 'is-hint');
  }

  // -------------------------------------------------------------------------
  // Sound cues from the animation
  // -------------------------------------------------------------------------

  private readonly onCardLand = (view: CardView): void => {
    const pan = this.pan(view.x.value);
    const dealing = this.phase === 'dealing';
    this.sounds.play('place', { pan, volume: dealing ? 0.7 : 1 });
    if (view.pile.startsWith('foundation') && !dealing && this.phase !== 'won') {
      const step = CHIME_STEPS[rankOf(view.id) - 1] ?? 0;
      this.sounds.play('chime', { pan, semitones: step - 7 });
    }
  };

  private readonly onCardTurn = (view: CardView): void => {
    this.sounds.play('flip', { pan: this.pan(view.x.value), volume: this.phase === 'dealing' ? 0.6 : 0.85 });
  };

  // -------------------------------------------------------------------------
  // Pointer input
  // -------------------------------------------------------------------------

  private point(event: PointerEvent | MouseEvent): Point {
    const bounds = this.root.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  /** What a press on this element refers to: a group of movable cards, or the stock. */
  private pick(target: EventTarget | null):
    | { kind: 'stock' }
    | { kind: 'cards'; from: PileRef; count: number; ids: readonly CardId[] }
    | null {
    if (!(target instanceof Element)) return null;

    const slot = target.closest<HTMLElement>('.slot');
    if (slot?.dataset.slot === 'stock') return { kind: 'stock' };

    const id = target.closest<HTMLElement>('.card')?.dataset.card;
    if (!id) return null;
    const state = this.game.state;
    const found = findCard(state, id);
    if (!found) return null;
    if (found.pile.kind === 'stock') return { kind: 'stock' };
    if (!found.faceUp) return null;

    if (found.pile.kind === 'waste') {
      if (found.index !== state.waste.length - 1) return null;
      return { kind: 'cards', from: found.pile, count: 1, ids: [id] };
    }
    if (found.pile.kind === 'foundation') {
      const pile = state.foundations[found.pile.index] ?? [];
      if (found.index !== pile.length - 1) return null;
      return { kind: 'cards', from: found.pile, count: 1, ids: [id] };
    }
    const cards = state.tableau[found.pile.index]?.cards ?? [];
    const ids = cards.slice(found.index);
    return { kind: 'cards', from: found.pile, count: ids.length, ids };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.sounds.unlock();
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.phase === 'dealing') {
      this.skipDeal();
      return;
    }
    if (this.phase !== 'playing' || this.drag) return;

    const picked = this.pick(event.target);
    if (!picked) return;
    event.preventDefault();
    this.clearHint();

    if (picked.kind === 'stock') {
      if (event.pointerType === 'touch') this.stockTouch = event.pointerId;
      else this.drawOrRecycle();
      return;
    }

    const state = this.game.state;
    const views = picked.ids.map((id) => this.view(id));
    const lead = views[0] as CardView;
    const p = this.point(event);
    const { cardW, cardH } = this.layout;

    const offsets = views.map((view) => ({
      x: view.x.target - lead.x.target,
      y: view.y.target - lead.y.target,
    }));
    const grabX = p.x - lead.x.value;
    const grabY = p.y - lead.y.value;

    // A card grabbed above its centre of mass trails behind like a pendulum.
    const lastOffset = offsets[offsets.length - 1] as Point;
    const massY = cardH / 2 + lastOffset.y / 2;
    const lever = clamp((massY - grabY) / (cardH / 2), -1, 1);
    const tiltSign = Math.abs(lever) < 0.3 ? 0.3 * (lever < 0 ? -1 : 1) : lever;

    const targets: PileRef[] = [];
    for (let index = 0; index < FOUNDATION_PILES; index++) targets.push({ kind: 'foundation', index });
    for (let index = 0; index < TABLEAU_PILES; index++) targets.push({ kind: 'tableau', index });

    views.forEach((view, i) => {
      const offset = offsets[i] as Point;
      view.pivotX = grabX - offset.x - cardW / 2;
      view.pivotY = grabY - offset.y - cardH / 2;
      view.rot.configure(SPRINGS.tilt);
      view.startDrag(i);
    });

    this.drag = {
      pointerId: event.pointerId,
      touch: event.pointerType === 'touch',
      from: picked.from,
      count: picked.count,
      views,
      offsets,
      grabX,
      grabY,
      startX: p.x,
      startY: p.y,
      threshold: event.pointerType === 'mouse' ? 4 : 9,
      moved: false,
      lastX: p.x,
      lastY: p.y,
      lastT: performance.now(),
      vx: 0,
      vy: 0,
      tiltSign,
      targets: targets.filter((to) =>
        isLegal(state, { type: 'move', from: picked.from, to, count: picked.count }),
      ),
      target: null,
      stopFrameHook: this.animator.onFrame(this.onDragFrame),
    };
    this.root.setPointerCapture(event.pointerId);
    this.root.classList.add('is-dragging');
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const p = this.point(event);
    const now = performance.now();
    const dt = Math.max(0.004, (now - drag.lastT) / 1000);

    drag.vx = drag.vx * 0.55 + ((p.x - drag.lastX) / dt) * 0.45;
    drag.vy = drag.vy * 0.55 + ((p.y - drag.lastY) / dt) * 0.45;
    drag.lastX = p.x;
    drag.lastY = p.y;
    drag.lastT = now;

    if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > drag.threshold) {
      drag.moved = true;
      this.sounds.play('pickup', { pan: this.pan(p.x) });
    }

    const lead = drag.views[0] as CardView;
    lead.x.set(p.x - drag.grabX);
    lead.y.set(p.y - drag.grabY);
    this.updateDropTarget(drag);
  };

  /** Runs every frame during a drag: tilt, and the trailing of the cards below the lead. */
  private readonly onDragFrame = (dt: number): void => {
    const drag = this.drag;
    if (!drag) return;
    const lead = drag.views[0] as CardView;

    // With the pointer at rest there are no move events, so let the speed die away.
    if (performance.now() - drag.lastT > 40) {
      const decay = Math.exp(-dt * 14);
      drag.vx *= decay;
      drag.vy *= decay;
    }
    lead.rot.target = clamp(drag.vx * 0.011 * drag.tiltSign, -11, 11);

    // Each card chases the one above it, so a long stack trails like a ribbon.
    const follow = 1 - Math.exp(-dt / 0.011);
    for (let i = 1; i < drag.views.length; i++) {
      const view = drag.views[i] as CardView;
      const ahead = drag.views[i - 1] as CardView;
      const offset = drag.offsets[i] as Point;
      const aheadOffset = drag.offsets[i - 1] as Point;
      const tx = ahead.x.value + offset.x - aheadOffset.x;
      const ty = ahead.y.value + offset.y - aheadOffset.y;
      view.x.set(view.x.value + (tx - view.x.value) * follow);
      view.y.set(view.y.value + (ty - view.y.value) * follow);
      view.rot.set(view.rot.value + (ahead.rot.value - view.rot.value) * follow);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.stockTouch === event.pointerId) {
      this.stockTouch = null;
      this.drawOrRecycle();
      return;
    }
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { from, count, target, moved, views, touch } = drag;
    this.releaseDrag(true);

    if (!moved) {
      // A tap: send the cards to the best place, or shake them if there is none.
      const move = quickMove(this.game.state, from, count);
      if (move && this.play(move)) return;
      this.sync(SPRINGS.home, undefined, true);
      this.wobble(views, touch);
      return;
    }

    if (target && this.play({ type: 'move', from, to: target, count }, SPRINGS.snap)) {
      if (touch) vibrate(8);
      return;
    }
    this.sync(SPRINGS.home);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    // The browser took the touch over for scrolling.
    if (this.stockTouch === event.pointerId) this.stockTouch = null;
    if (this.drag && event.pointerId === this.drag.pointerId) this.cancelDrag();
  };

  /** Right-click: the same as a tap. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    if (this.phase !== 'playing' || this.drag) return;
    const picked = this.pick(event.target);
    if (!picked || picked.kind !== 'cards') return;
    const move = quickMove(this.game.state, picked.from, picked.count);
    if (move && this.play(move)) return;
    this.wobble(picked.ids.map((id) => this.view(id)), false);
  };

  /** Ends the drag bookkeeping. With `throwCards`, the cards keep the pointer's momentum. */
  private releaseDrag(throwCards: boolean): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.stopFrameHook();
    if (this.root.hasPointerCapture(drag.pointerId)) {
      this.root.releasePointerCapture(drag.pointerId);
    }
    this.root.classList.remove('is-dragging');
    this.dropHint.classList.remove('is-visible');
    for (const view of drag.views) {
      view.endDrag();
      if (throwCards && drag.moved) {
        view.x.velocity = clamp(drag.vx, -2500, 2500);
        view.y.velocity = clamp(drag.vy, -2500, 2500);
      }
    }
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    this.releaseDrag(false);
    this.sync(SPRINGS.home, undefined, true);
  }

  /** Finds the legal pile the dragged cards overlap most, and shows where they would land. */
  private updateDropTarget(drag: DragState): void {
    const lead = drag.views[0] as CardView;
    const { cardW, cardH } = this.layout;
    const rect = { x: lead.x.value, y: lead.y.value, w: cardW, h: cardH };

    let best: PileRef | null = null;
    let bestArea = cardW * cardH * 0.12;
    for (const pile of drag.targets) {
      const area = overlapArea(rect, dropZone(this.layout, pile));
      if (area > bestArea) {
        bestArea = area;
        best = pile;
      }
    }

    if (best && (!drag.target || pileKey(best) !== pileKey(drag.target))) {
      const spot = landingSpot(this.game.state, this.layout, best);
      this.dropHint.style.transform = `translate3d(${spot.x}px,${spot.y}px,0)`;
    }
    drag.target = drag.moved ? best : null;
    this.dropHint.classList.toggle('is-visible', drag.target !== null);
  }

  /** The "no" gesture: the cards shake when they have nowhere to go. */
  private wobble(views: readonly CardView[], touch: boolean): void {
    const direction = Math.random() < 0.5 ? -1 : 1;
    for (const view of views) {
      view.rot.configure(SPRINGS.wobble);
      view.rot.velocity = direction * 190;
    }
    const lead = views[0];
    this.sounds.play('deny', { pan: lead ? this.pan(lead.x.value) : 0 });
    if (touch) vibrate([12, 50, 12]);
    this.animator.wake();
  }
}
