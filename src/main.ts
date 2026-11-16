import './styles.css';
import type { KlondikeOptions, KlondikeState, ScoringMode } from './engine/klondike';
import { dayKey, previousDay } from './engine/daily';
import { Advisor } from './ui/advisor';
import { SoundBoard } from './ui/audio';
import { celebrate, stopCelebration } from './ui/celebrate';
import { WinnableDeals } from './ui/deals';
import { Hud, hudInsets } from './ui/hud';
import { dailyStreak, emptyStats, recordDaily, recordStart, recordWin } from './ui/stats';
import {
  SCORING_MODES,
  type Settings,
  loadGame,
  loadSettings,
  loadDaily,
  loadStats,
  saveGame,
  saveSettings,
  saveDaily,
  saveStats,
} from './ui/storage';
import { pickLanguage } from './ui/strings';
import { Table } from './ui/table';

/** How long a hint waits for the solver before falling back to simple rules. */
const HINT_PATIENCE = 2500;
/** How long after a move the dead-end check starts, so quick runs of moves are checked once. */
const DEAD_END_DELAY = 500;
/** How many moves Go back looks back for a winnable position. */
const GO_BACK_LIMIT = 120;

/** Address parameters override the saved settings for this visit: `?draw=3&scoring=vegas`. */
function applyParams(settings: Settings, params: URLSearchParams): Settings {
  const draw = Number(params.get('draw'));
  const scoring = params.get('scoring') as ScoringMode | null;
  return {
    ...settings,
    drawCount: draw === 1 || draw === 3 ? draw : settings.drawCount,
    scoring: scoring && SCORING_MODES.includes(scoring) ? scoring : settings.scoring,
  };
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const { code, strings } = pickLanguage();
  // Each page's title is written for search engines, which read it after scripts
  // run, so it is kept. Only when the game opens in another language than the
  // page (a Danish browser on the English page) does the title follow the game.
  if (code !== document.documentElement.lang) document.title = strings.title;
  document.documentElement.lang = code;

  let settings = applyParams(loadSettings(), params);
  let stats = loadStats();
  const options = (): KlondikeOptions => ({ drawCount: settings.drawCount, scoring: settings.scoring });

  const tableRoot = document.getElementById('table') as HTMLElement;
  const hudRoot = document.getElementById('hud-root') as HTMLElement;
  const sounds = new SoundBoard(settings.sound);

  // The table and HUD refer to each other, so the HUD is attached once both exist.
  const hudRef: { current: Hud | null } = { current: null };

  const save = (): void => {
    if (table.phase === 'loading') return;
    if (table.phase === 'won' || !table.hasStarted) {
      saveGame(null);
      return;
    }
    saveGame({
      seed: table.state.seed,
      options: table.state.options,
      moves: table.log,
      seconds: table.seconds,
      daily: dailyDay,
    });
  };

  // The daily deal: the days it was solved, and the day of the one being played (if it is).
  let dailyLog = loadDaily();
  let dailyDay: string | null = null;
  function showDaily(): void {
    const today = dayKey(new Date());
    hudRef.current?.setDaily({
      playing: dailyDay,
      solvedToday: dailyLog[today] !== undefined,
      streak: dailyStreak(dailyLog, today, previousDay),
    });
  }

  // The dead-end notice: which position it was shown for, and whether the player was warned.
  const deadEnd: { shownFor: KlondikeState | null; warned: boolean; timer?: number } = {
    shownFor: null,
    // Warned once until the game is winnable again (after Go back or undo), not after every move.
    warned: false,
  };

  const table = new Table(tableRoot, options(), hudInsets, sounds, {
    change: () => {
      hudRef.current?.update();
      save();
      // The dead-end notice is about one position; any move or undo takes it away.
      if (table.state !== deadEnd.shownFor) hudRef.current?.hideDeadEnd();
      checkDeadEnd();
    },
    started: () => {
      stats = recordStart(stats, table.state.options.drawCount);
      saveStats(stats);
      hudRef.current?.setStats(stats);
    },
    won: () => {
      if (dailyDay) {
        dailyLog = recordDaily(dailyLog, dailyDay, { seconds: table.seconds, moves: table.state.moves });
        saveDaily(dailyLog);
        showDaily();
      }
      stats = recordWin(stats, {
        draw: table.state.options.drawCount,
        scoring: table.state.options.scoring,
        seconds: table.seconds,
        moves: table.state.moves,
        score: table.score,
      });
      saveStats(stats);
      saveGame(null);
      hudRef.current?.setStats(stats);
      const layout = tableRoot.style;
      const cardW = parseFloat(layout.getPropertyValue('--card-w')) || 100;
      const origins = [...tableRoot.querySelectorAll<HTMLElement>('.slot-foundation')].map((slot) => {
        const box = slot.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      });
      celebrate(tableRoot, origins, cardW);
    },
    noHint: () => hudRef.current?.say(strings.noHint),
    // Asked for a hint in a lost game: say so, whatever the dead-end setting.
    lost: () => showDeadEnd(),
  });

  // The solver's view of the game in progress, for hints and dead ends. It has a
  // worker of its own, so hints never wait behind deal-finding.
  const advisor = new Advisor();
  table.adviser = (state) => advisor.adviceWithin(state, HINT_PATIENCE);

  function showDeadEnd(): void {
    deadEnd.warned = true;
    deadEnd.shownFor = table.state;
    hudRef.current?.showDeadEnd();
  }

  /** Shortly after each move, asks whether the game can still be won, if the player wants to know. */
  function checkDeadEnd(): void {
    window.clearTimeout(deadEnd.timer);
    if (!settings.deadEnds) return;
    deadEnd.timer = window.setTimeout(async () => {
      if (table.phase !== 'playing' || !table.hasStarted) return;
      const state = table.state;
      const advice = await advisor.advice(state);
      if (table.state !== state || table.phase !== 'playing') return;
      if (advice.status === 'won') deadEnd.warned = false;
      else if (advice.status === 'lost' && !deadEnd.warned) showDeadEnd();
    }, DEAD_END_DELAY);
  }

  /** Undoes back to the last position from which the game could still be won. */
  async function goBack(): Promise<void> {
    const history = table.history;
    const current = table.state;
    const limit = Math.min(history.length, GO_BACK_LIMIT);
    for (let steps = 1; steps <= limit; steps++) {
      const advice = await advisor.advice(history[history.length - steps] as KlondikeState);
      if (table.state !== current) return; // the player moved on meanwhile
      if (advice.status !== 'lost') {
        deadEnd.warned = false;
        table.undoMoves(steps);
        return;
      }
    }
    if (limit === history.length) hudRef.current?.say(strings.neverWinnable, 4000);
  }

  // Winnable deals come from the solver in a worker; one is kept ready for the rules in use.
  const deals = new WinnableDeals();
  if (settings.winnable) deals.prepare(options());
  // Today's daily deal is worked out early too, so it is ready when asked for.
  void deals.daily(dayKey(new Date()), options());

  /** Deals today's daily deal, with the player's rules. */
  const playDaily = async (): Promise<void> => {
    const day = dayKey(new Date());
    await newGame(await deals.daily(day, options()), day);
  };
  let newGameRequest = 0;
  /** Whether the deal on the table was picked by the solver (rather than by number or at random). */
  let dealFromSolver = false;

  /**
   * Deals `seed`, or else a winnable deal (if chosen) or a random one. `daily`
   * is the day, when `seed` is that day's daily deal.
   */
  const newGame = async (seed?: number, daily: string | null = null): Promise<void> => {
    const request = ++newGameRequest;
    const rules = options();
    const fromSolver = seed === undefined && settings.winnable;
    const dealNumber = fromSolver ? await deals.next(rules) : seed;
    // A newer request (a second tap on New game) replaces this one.
    if (request !== newGameRequest) return;
    dealFromSolver = fromSolver;
    dailyDay = daily;
    showDaily();
    deadEnd.warned = false;
    hudRef.current?.hideDeadEnd();
    stopCelebration(tableRoot);
    table.setOptions(rules);
    table.newGame(dealNumber);
  };

  const toggleFullScreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  const hud = new Hud(
    hudRoot,
    table,
    strings,
    {
      newGame: () => void newGame(),
      goBack: () => void goBack(),
      playDaily: () => void playDaily(),
      changeSettings: (next) => {
        const optionsChanged = next.drawCount !== settings.drawCount || next.scoring !== settings.scoring;
        const dealsChanged = next.winnable !== settings.winnable;
        settings = next;
        saveSettings(settings);
        sounds.enabled = settings.sound;
        if (settings.winnable) deals.prepare(options());
        if (settings.deadEnds) checkDeadEnd();
        else hud.hideDeadEnd();
        // A game that has not started yet is dealt again with the new settings. A deal
        // the solver picked is only known to be winnable with the rules it was picked
        // for, so it is replaced, as is any deal when winnable deals are switched on.
        // A deal asked for by number keeps its number.
        // The daily deal stays the daily deal: the one for the new rules.
        if ((optionsChanged || dealsChanged) && !table.hasStarted && table.phase === 'playing') {
          const replace = settings.winnable && (dealsChanged || dealFromSolver);
          if (dailyDay) {
            if (optionsChanged) void playDaily();
          } else {
            void newGame(replace ? undefined : table.state.seed);
          }
        }
      },
      resetStats: () => {
        stats = emptyStats();
        saveStats(stats);
        hud.setStats(stats);
      },
      toggleFullScreen,
    },
    settings,
    stats,
  );
  hudRef.current = hud;
  showDaily();

  // Sound can only start after the player has touched the page. Phones only
  // count the end of a touch (not its start) as permission, so listen for both.
  const unlock = (): void => sounds.unlock();
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat || hud.menuOpen) return;
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (command && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) table.redo();
      else table.undo();
    } else if (command && key === 'y') {
      event.preventDefault();
      table.redo();
    } else if (command || event.altKey) {
      return;
    } else if (key === 'z' || key === 'u') {
      table.undo();
    } else if (key === 'r') {
      table.redo();
    } else if (key === 'h') {
      table.showHint();
    } else if (key === 'n') {
      void newGame();
    } else if ((key === ' ' || key === 'd') && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      table.drawOrRecycle();
    } else if (key === 'f') {
      toggleFullScreen();
    }
  });

  // Keep the clock ticking on screen, and the saved time current.
  setInterval(() => hud.update(), 250);
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', save);

  await table.load();
  table.relayout();

  // `?deal=1234` plays a specific numbered deal and `?daily` today's deal;
  // otherwise an unfinished game can be continued.
  const requested = Number(params.get('deal'));
  const dealNumber = Number.isInteger(requested) && requested > 0 ? requested : undefined;
  const dailyLink = params.has('daily');
  const saved = dealNumber === undefined && !dailyLink ? loadGame() : null;
  const canResume = saved !== null && saved.moves.length > 0;

  const choice = await hud.titleScreen(canResume, dailyLink);
  if (choice === 'resume' && saved) {
    dailyDay = saved.daily ?? null;
    showDaily();
    table.resume(saved.seed, saved.options, saved.moves, saved.seconds);
  } else if (choice === 'daily') {
    void playDaily();
  } else {
    void newGame(dealNumber);
  }

  // Once, in a phone browser: how to get the browser bars out of the way.
  const TIP_KEY = 'solitaire.swipeTip';
  const inPhoneBrowser = matchMedia('(pointer: coarse) and (display-mode: browser)').matches;
  let tipShown = true;
  try {
    tipShown = localStorage.getItem(TIP_KEY) !== null;
  } catch {
    // Without storage the tip would show on every visit; skip it instead.
  }
  if (inPhoneBrowser && !tipShown) {
    setTimeout(() => {
      if (window.scrollY > 10) return;
      hud.say(strings.swipeTip, 5000);
      try {
        localStorage.setItem(TIP_KEY, '1');
      } catch {
        // Fine: see above.
      }
    }, 3200);
  }

  // Offline play and installing to the home screen.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }
}

void start();
