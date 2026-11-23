/** Everything around the table: the bar, the menu panel, the title screen, messages, and the win panel. */

import type { DrawCount, ScoringMode } from '../engine/klondike';
import type { Insets } from './layout';
import { type ModeStats, type Stats, winRate } from './stats';
import { SCORING_MODES, type Settings } from './storage';
import type { Strings } from './strings';
import type { Table } from './table';
import { BACKS, type Back, DECKS, type Deck, FELTS, FELT_SWATCH, type Felt, backUrl, faceUrl } from './theme';

/** The daily deal, as the HUD shows it. */
export interface DailyInfo {
  /** The day of the daily deal being played (`YYYY-MM-DD`), or null for any other game. */
  readonly playing: string | null;
  readonly solvedToday: boolean;
  /** Days in a row with the daily deal solved. */
  readonly streak: number;
}

export interface HudActions {
  newGame(): void;
  /** Undo back to the last position from which the game could still be won. */
  goBack(): void;
  /** Deal today's daily deal. */
  playDaily(): void;
  changeSettings(settings: Settings): void;
  resetStats(): void;
  toggleFullScreen(): void;
}

/** Screens narrower than this get the controls at the bottom, within thumb reach. */
const NARROW = 600;
const BAR = 56;
const BAR_COMPACT = 44;

/** The space the HUD and the device's safe areas take from the table. Must match styles.css. */
export function hudInsets(width: number, height: number): Insets {
  const safe = safeArea();
  if (width < NARROW) {
    return { top: safe.top + 4, right: safe.right, bottom: BAR + safe.bottom, left: safe.left };
  }
  const bar = height < 480 ? BAR_COMPACT : BAR;
  return { top: bar + safe.top, right: safe.right, bottom: safe.bottom + 4, left: safe.left };
}

function safeArea(): Insets {
  const probe = document.getElementById('safe-area-probe');
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(label: string, action: string, className = ''): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.dataset.action = action;
  return node;
}

function stat(label: string, className = ''): { el: HTMLElement; value: HTMLElement } {
  const node = el('span', `stat ${className}`.trim());
  const value = el('span');
  node.append(el('b', '', label), value);
  return { el: node, value };
}

/**
 * A row of mutually exclusive choices. With `swatch`, each choice is drawn as
 * a sample of what it looks like (its label is then read out, and shown on hover).
 */
function segmented<T extends string | number | boolean>(
  name: string,
  choices: readonly { value: T; label: string; swatch?: string }[],
  onPick: (value: T) => void,
): { el: HTMLElement; set: (value: T) => void } {
  const swatches = choices.some((choice) => choice.swatch);
  const group = el('div', swatches ? 'swatches' : 'segmented');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', name);
  const buttons = choices.map((choice) => {
    const node = button(swatches ? '' : choice.label, `set-${name}`, swatches ? `swatch swatch-${name}` : '');
    if (choice.swatch) {
      node.style.background = choice.swatch;
      node.setAttribute('aria-label', choice.label);
      node.title = choice.label;
    }
    node.dataset.value = String(choice.value);
    node.setAttribute('role', 'radio');
    node.addEventListener('click', () => onPick(choice.value));
    group.append(node);
    return { node, value: choice.value };
  });
  return {
    el: group,
    set: (value) => {
      for (const b of buttons) {
        const on = b.value === value;
        b.node.classList.toggle('is-selected', on);
        b.node.setAttribute('aria-checked', String(on));
      }
    },
  };
}

type Tab = 'game' | 'stats' | 'help';

export class Hud {
  private readonly undo: HTMLButtonElement;
  private readonly redo: HTMLButtonElement;
  private readonly hint: HTMLButtonElement;
  private readonly finish: HTMLButtonElement;
  private readonly deal: { el: HTMLElement; value: HTMLElement };
  private readonly time: { el: HTMLElement; value: HTMLElement };
  private readonly moves: { el: HTMLElement; value: HTMLElement };
  private readonly score: { el: HTMLElement; value: HTMLElement };
  private readonly toast: HTMLElement;
  private toastTimer: number | undefined;

  private readonly win: HTMLElement;
  private readonly winSummary: HTMLElement;
  private readonly winStreak: HTMLElement;
  private readonly dailyStatus: HTMLElement;
  private daily: DailyInfo = { playing: null, solvedToday: false, streak: 0 };

  private readonly dialog: HTMLDialogElement;
  private readonly tabs = new Map<Tab, { tab: HTMLButtonElement; page: HTMLElement }>();
  private readonly drawChoice: ReturnType<typeof segmented<DrawCount>>;
  private readonly scoringChoice: ReturnType<typeof segmented<ScoringMode>>;
  private readonly dealsChoice: ReturnType<typeof segmented<boolean>>;
  private readonly deadEndsChoice: ReturnType<typeof segmented<boolean>>;
  private readonly notice: HTMLElement;
  private readonly soundChoice: ReturnType<typeof segmented<boolean>>;
  private readonly feltChoice: ReturnType<typeof segmented<Felt>>;
  private readonly deckChoice: ReturnType<typeof segmented<Deck>>;
  private readonly backChoice: ReturnType<typeof segmented<Back>>;
  private readonly nextGameNote: HTMLElement;
  private readonly statsBody: HTMLElement;
  private readonly resetButton: HTMLButtonElement;
  private resetArmed = false;

  private settings: Settings;
  private stats: Stats;
  private last = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly table: Table,
    private readonly strings: Strings,
    private readonly actions: HudActions,
    settings: Settings,
    stats: Stats,
  ) {
    this.settings = settings;
    this.stats = stats;

    // ----- The bar
    const bar = el('header', 'hud');
    const left = el('div', 'hud-group');
    const newGame = button(strings.newGame, 'new');
    this.undo = button(strings.undo, 'undo');
    this.redo = button(strings.redo, 'redo', 'hide-narrow hide-compact');
    left.append(newGame, this.undo, this.redo);

    const status = el('div', 'hud-status');
    this.deal = stat(strings.deal, 'hide-narrow hide-compact');
    this.time = stat(strings.time);
    this.moves = stat(strings.moves);
    this.score = stat(strings.score, 'hide-narrow');
    status.append(this.deal.el, this.time.el, this.moves.el, this.score.el);

    const right = el('div', 'hud-group');
    this.hint = button(strings.hint, 'hint');
    const menu = button(strings.menu, 'menu');
    right.append(this.hint, menu);
    if (document.fullscreenEnabled) {
      const full = button(strings.fullScreen, 'fullscreen', 'hide-narrow');
      full.addEventListener('click', () => actions.toggleFullScreen());
      right.append(full);
    }
    bar.append(left, status, right);

    this.finish = button(strings.finish, 'finish', 'finish');
    this.finish.hidden = true;

    this.toast = el('div', 'toast');
    this.toast.setAttribute('role', 'status');

    // ----- The win panel
    this.win = el('div', 'win');
    const winPanel = el('div', 'win-panel');
    this.winSummary = el('p', 'win-summary');
    this.winStreak = el('p', 'win-streak');
    const again = button(strings.playAgain, 'play-again');
    winPanel.append(
      el('div', 'ornament'),
      el('h1', '', strings.wonTitle),
      el('p', '', strings.wonText),
      this.winSummary,
      this.winStreak,
      again,
    );
    this.win.append(winPanel);

    // ----- The menu panel
    this.dialog = el('dialog', 'panel');
    const tabBar = el('div', 'panel-tabs');
    tabBar.setAttribute('role', 'tablist');
    const pages = el('div', 'panel-pages');
    const addTab = (tab: Tab, label: string): HTMLElement => {
      const tabButton = button(label, `tab-${tab}`, 'panel-tab');
      tabButton.setAttribute('role', 'tab');
      tabButton.addEventListener('click', () => this.showTab(tab));
      const page = el('section', 'panel-page');
      page.setAttribute('role', 'tabpanel');
      tabBar.append(tabButton);
      pages.append(page);
      this.tabs.set(tab, { tab: tabButton, page });
      return page;
    };

    // Game settings
    const gamePage = addTab('game', strings.tabGame);
    const playDaily = button(strings.playDaily, 'play-daily', 'quiet');
    playDaily.addEventListener('click', () => {
      this.dialog.close();
      actions.playDaily();
    });
    this.dailyStatus = el('span', 'daily-status');
    const dailyRow = el('div', 'daily-row');
    dailyRow.append(playDaily, this.dailyStatus);
    this.drawChoice = segmented<DrawCount>(
      'draw',
      [
        { value: 1, label: strings.draw1 },
        { value: 3, label: strings.draw3 },
      ],
      (drawCount) => this.change({ ...this.settings, drawCount }),
    );
    const scoringLabels: Record<ScoringMode, string> = {
      none: strings.scoringNone,
      standard: strings.scoringStandard,
      timed: strings.scoringTimed,
      vegas: strings.scoringVegas,
    };
    this.scoringChoice = segmented<ScoringMode>(
      'scoring',
      SCORING_MODES.map((value) => ({ value, label: scoringLabels[value] })),
      (scoring) => this.change({ ...this.settings, scoring }),
    );
    this.dealsChoice = segmented<boolean>(
      'deals',
      [
        { value: true, label: strings.dealsWinnable },
        { value: false, label: strings.dealsAny },
      ],
      (winnable) => this.change({ ...this.settings, winnable }),
    );
    this.deadEndsChoice = segmented<boolean>(
      'dead-ends',
      [
        { value: true, label: strings.warnMe },
        { value: false, label: strings.off },
      ],
      (deadEnds) => this.change({ ...this.settings, deadEnds }),
    );
    this.feltChoice = segmented<Felt>(
      'felt',
      FELTS.map((value) => ({ value, label: strings.felts[value], swatch: FELT_SWATCH[value] })),
      (felt) => this.change({ ...this.settings, felt }),
    );
    this.deckChoice = segmented<Deck>(
      'deck',
      DECKS.map((value) => ({
        value,
        label: strings.deckNames[value],
        swatch: `url("${faceUrl('AS', value, false)}") center / cover`,
      })),
      (deck) => this.change({ ...this.settings, deck }),
    );
    this.backChoice = segmented<Back>(
      'back',
      BACKS.map((value) => ({
        value,
        label: strings.backNames[value],
        swatch: `url("${backUrl(value)}") center / cover`,
      })),
      (back) => this.change({ ...this.settings, back }),
    );
    this.soundChoice = segmented<boolean>(
      'sound',
      [
        { value: true, label: strings.on },
        { value: false, label: strings.off },
      ],
      (sound) => this.change({ ...this.settings, sound }),
    );
    const setting = (label: string, control: HTMLElement): HTMLElement => {
      const row = el('div', 'setting');
      row.append(el('span', 'setting-label', label), control);
      return row;
    };
    this.nextGameNote = el('div', 'next-game');
    const newNow = button(strings.newGameNow, 'new-now', 'quiet');
    newNow.addEventListener('click', () => {
      this.dialog.close();
      actions.newGame();
    });
    this.nextGameNote.append(el('span', '', strings.nextGame), newNow);
    gamePage.append(
      setting(strings.dailyDeal, dailyRow),
      setting(strings.draw, this.drawChoice.el),
      setting(strings.scoring, this.scoringChoice.el),
      setting(strings.deals, this.dealsChoice.el),
      setting(strings.deadEnds, this.deadEndsChoice.el),
      setting(strings.felt, this.feltChoice.el),
      setting(strings.deck, this.deckChoice.el),
      setting(strings.backs, this.backChoice.el),
      setting(strings.sound, this.soundChoice.el),
    );
    if (document.fullscreenEnabled) {
      const full = button(strings.fullScreen, 'fullscreen-menu', 'quiet');
      full.addEventListener('click', () => {
        this.dialog.close();
        actions.toggleFullScreen();
      });
      gamePage.append(setting(strings.screen, full));
    }
    gamePage.append(this.nextGameNote);

    // Statistics
    const statsPage = addTab('stats', strings.tabStats);
    this.statsBody = el('div', 'stats-table');
    this.resetButton = button(strings.reset, 'reset-stats', 'quiet');
    this.resetButton.addEventListener('click', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.resetButton.textContent = strings.resetConfirm;
        return;
      }
      this.disarmReset();
      actions.resetStats();
    });
    statsPage.append(this.statsBody, this.resetButton);

    // How to play
    const helpPage = addTab('help', strings.tabHelp);
    for (const [heading, text] of strings.help) {
      helpPage.append(el('h3', '', heading), el('p', '', text));
    }

    const close = button(strings.close, 'close', 'panel-close');
    close.addEventListener('click', () => this.dialog.close());
    this.dialog.append(tabBar, pages, close);
    // A click on the backdrop closes the panel.
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.dialog.close();
    });
    this.dialog.addEventListener('close', () => this.disarmReset());

    // Said when the game can no longer be won, with the ways out.
    this.notice = el('div', 'notice');
    this.notice.setAttribute('role', 'alert');
    this.notice.hidden = true;
    const back = button(strings.goBack, 'go-back', 'notice-primary');
    const fresh = button(strings.newGame, 'notice-new', 'quiet');
    const dismiss = button('×', 'notice-close', 'notice-close');
    dismiss.setAttribute('aria-label', strings.close);
    back.addEventListener('click', () => {
      this.hideDeadEnd();
      actions.goBack();
    });
    fresh.addEventListener('click', () => {
      this.hideDeadEnd();
      actions.newGame();
    });
    dismiss.addEventListener('click', () => this.hideDeadEnd());
    const actionsRow = el('div', 'notice-actions');
    actionsRow.append(back, fresh);
    this.notice.append(el('span', 'notice-text', strings.deadEnd), actionsRow, dismiss);

    root.append(bar, this.finish, this.toast, this.notice, this.win, this.dialog);

    newGame.addEventListener('click', () => actions.newGame());
    again.addEventListener('click', () => actions.newGame());
    this.undo.addEventListener('click', () => table.undo());
    this.redo.addEventListener('click', () => table.redo());
    this.hint.addEventListener('click', () => table.showHint());
    menu.addEventListener('click', () => this.openMenu());
    this.finish.addEventListener('click', () => table.finish());

    this.renderSettings();
    this.renderStats();
  }

  openMenu(tab: Tab = 'game'): void {
    this.showTab(tab);
    this.renderSettings();
    this.renderStats();
    if (!this.dialog.open) this.dialog.showModal();
  }

  get menuOpen(): boolean {
    return this.dialog.open;
  }

  setStats(stats: Stats): void {
    this.stats = stats;
    this.renderStats();
  }

  setDaily(daily: DailyInfo): void {
    this.daily = daily;
    this.last = '';
    this.update();
    this.renderSettings();
  }

  /** "16 Nov" for `2026-11-16`, in the page's language. */
  private dayLabel(day: string): string {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    // The English text is British, so the dates are too ("16 Nov").
    const lang = document.documentElement.lang === 'en' ? 'en-GB' : document.documentElement.lang || undefined;
    const format = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' });
    return format.format(new Date(y, m - 1, d));
  }

  private streakText(): string {
    return this.daily.streak > 1 ? `${this.daily.streak} ${this.strings.daysInARow}` : '';
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.renderSettings();
  }

  /** A short message that fades away by itself. */
  /** Tells the player the game can no longer be won. */
  showDeadEnd(): void {
    this.toast.classList.remove('is-visible');
    this.notice.hidden = false;
  }

  hideDeadEnd(): void {
    this.notice.hidden = true;
  }

  get deadEndShown(): boolean {
    return !this.notice.hidden;
  }

  say(text: string, ms = 2200): void {
    this.toast.textContent = text;
    this.toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('is-visible'), ms);
  }

  /** Shows the title screen and resolves with the player's choice. */
  /**
   * The opening screen. Resolves with the player's choice: continue the saved
   * game, deal a new one, or play today's deal. With `dailyFirst` (a link to
   * the daily deal), today's deal is the main choice.
   */
  titleScreen(canResume: boolean, dailyFirst = false): Promise<'new' | 'resume' | 'daily'> {
    const strings = this.strings;
    const screen = el('div', 'title-screen');
    const inner = el('div', 'title-inner');
    const actions = el('div', 'title-actions');
    const main: 'new' | 'resume' | 'daily' = dailyFirst ? 'daily' : canResume ? 'resume' : 'new';
    const labels = { new: strings.start, resume: strings.resume, daily: strings.dailyDeal };
    const start = button(labels[main], 'start', 'primary');
    actions.append(start);
    const fresh = main === 'resume' ? button(strings.newGame, 'start-new', 'quiet') : null;
    if (fresh) actions.append(fresh);
    const daily = main !== 'daily' ? button(strings.dailyDeal, 'start-daily', 'quiet') : null;
    if (daily) actions.append(daily);
    inner.append(
      el('div', 'ornament'),
      el('h1', 'title-name', strings.title),
      el('p', 'title-sub', strings.subtitle),
      actions,
    );
    screen.append(inner);
    this.root.append(screen);
    requestAnimationFrame(() => screen.classList.add('is-visible'));
    start.focus({ preventScroll: true });

    return new Promise((resolve) => {
      const done = (choice: 'new' | 'resume' | 'daily'): void => {
        screen.classList.remove('is-visible');
        screen.classList.add('is-leaving');
        setTimeout(() => screen.remove(), 600);
        resolve(choice);
      };
      start.addEventListener('click', () => done(main), { once: true });
      fresh?.addEventListener('click', () => done('new'), { once: true });
      daily?.addEventListener('click', () => done('daily'), { once: true });
    });
  }

  /** Refreshes the controls. Cheap enough to call often; the DOM is touched only on change. */
  update(): void {
    const table = this.table;
    const state = table.state;
    const scoring = state.options.scoring;
    const won = table.phase === 'won';

    const snapshot = [
      table.phase,
      table.canUndo,
      table.canRedo,
      table.canFinish,
      table.hasStarted,
      state.seed,
      this.daily.playing,
      table.seconds,
      state.moves,
      table.score,
      scoring,
    ].join('|');
    if (snapshot === this.last) return;
    this.last = snapshot;

    this.undo.disabled = !table.canUndo;
    this.redo.disabled = !table.canRedo;
    this.hint.disabled = table.phase !== 'playing';
    this.finish.hidden = !table.canFinish;

    const dealLabel = this.deal.el.querySelector('b');
    if (dealLabel) dealLabel.textContent = this.daily.playing ? this.strings.daily : this.strings.deal;
    this.deal.value.textContent = this.daily.playing ? this.dayLabel(this.daily.playing) : `#${state.seed}`;
    this.time.value.textContent = formatTime(table.seconds);
    this.moves.value.textContent = String(state.moves);
    this.score.el.hidden = scoring === 'none';
    this.score.value.textContent = String(table.score);

    this.win.classList.toggle('is-visible', won);
    if (won) {
      const parts = [
        `${this.strings.time} ${formatTime(table.seconds)}`,
        `${this.strings.moves} ${state.moves}`,
      ];
      if (scoring !== 'none') parts.push(`${this.strings.score} ${table.score}`);
      this.winSummary.textContent = parts.join('   ·   ');
      const mode = state.options.drawCount === 1 ? this.stats.draw1 : this.stats.draw3;
      if (this.daily.playing) {
        this.winStreak.textContent = [this.strings.dailySolved, this.streakText()].filter(Boolean).join('   ·   ');
      } else {
        this.winStreak.textContent = mode.streak > 1 ? `${this.strings.streak}: ${mode.streak}` : '';
      }
    }
    this.renderSettings();
  }

  // -------------------------------------------------------------------------

  private change(settings: Settings): void {
    this.settings = settings;
    this.actions.changeSettings(settings);
    this.renderSettings();
  }

  private showTab(tab: Tab): void {
    for (const [name, { tab: tabButton, page }] of this.tabs) {
      const on = name === tab;
      tabButton.classList.toggle('is-selected', on);
      tabButton.setAttribute('aria-selected', String(on));
      page.hidden = !on;
    }
  }

  private renderSettings(): void {
    this.drawChoice.set(this.settings.drawCount);
    this.scoringChoice.set(this.settings.scoring);
    this.dealsChoice.set(this.settings.winnable);
    this.deadEndsChoice.set(this.settings.deadEnds);
    this.feltChoice.set(this.settings.felt);
    this.deckChoice.set(this.settings.deck);
    this.backChoice.set(this.settings.back);
    // The back swatches show the backs of the chosen deck.
    for (const node of this.backChoice.el.querySelectorAll<HTMLElement>('button[data-value]')) {
      node.style.background = `url("${backUrl(node.dataset.value as Back, this.settings.deck)}") center / cover`;
    }
    this.dailyStatus.textContent = this.daily.solvedToday
      ? [`✓ ${this.strings.solvedToday}`, this.streakText()].filter(Boolean).join(' · ')
      : this.streakText();
    this.soundChoice.set(this.settings.sound);
    const current = this.table.state.options;
    const pending =
      this.table.hasStarted &&
      (current.drawCount !== this.settings.drawCount || current.scoring !== this.settings.scoring);
    this.nextGameNote.hidden = !pending;
  }

  private renderStats(): void {
    const s = this.strings;
    const scoring = this.settings.scoring;
    const columns: [string, ModeStats][] = [
      [s.statsDraw1, this.stats.draw1],
      [s.statsDraw3, this.stats.draw3],
    ];
    const dash = '–';
    const rows: [string, (m: ModeStats) => string][] = [
      [s.played, (m) => String(m.played)],
      [s.won, (m) => String(m.won)],
      [s.winRate, (m) => (winRate(m) === null ? dash : `${winRate(m)}%`)],
      [s.currentStreak, (m) => String(m.streak)],
      [s.bestStreak, (m) => String(m.bestStreak)],
      [s.bestTime, (m) => (m.bestTime === null ? dash : formatTime(m.bestTime))],
      [s.fewestMoves, (m) => (m.fewestMoves === null ? dash : String(m.fewestMoves))],
    ];
    if (scoring !== 'none') {
      rows.push([s.bestScore, (m) => (m.bestScore[scoring] === undefined ? dash : String(m.bestScore[scoring]))]);
    }

    const table = el('table');
    const head = el('tr');
    head.append(el('th'), ...columns.map(([label]) => el('th', '', label)));
    table.append(head);
    for (const [label, value] of rows) {
      const row = el('tr');
      row.append(el('td', 'row-label', label), ...columns.map(([, mode]) => el('td', '', value(mode))));
      table.append(row);
    }
    this.statsBody.replaceChildren(table);
  }

  private disarmReset(): void {
    this.resetArmed = false;
    this.resetButton.textContent = this.strings.reset;
  }
}
