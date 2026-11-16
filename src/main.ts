import './styles.css';
import type { KlondikeOptions, ScoringMode } from './engine/klondike';
import { SoundBoard } from './ui/audio';
import { celebrate, stopCelebration } from './ui/celebrate';
import { Hud, hudInsets } from './ui/hud';
import { emptyStats, recordStart, recordWin } from './ui/stats';
import {
  SCORING_MODES,
  type Settings,
  loadGame,
  loadSettings,
  loadStats,
  saveGame,
  saveSettings,
  saveStats,
} from './ui/storage';
import { pickLanguage } from './ui/strings';
import { Table } from './ui/table';

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
  document.documentElement.lang = code;
  // The English title is left as written in the HTML, since search engines read it after
  // scripts run; players in other languages see the game's name in their own.
  if (code !== 'en') document.title = strings.title;

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
    saveGame({ seed: table.state.seed, options: table.state.options, moves: table.log, seconds: table.seconds });
  };

  const table = new Table(tableRoot, options(), hudInsets, sounds, {
    change: () => {
      hudRef.current?.update();
      save();
    },
    started: () => {
      stats = recordStart(stats, table.state.options.drawCount);
      saveStats(stats);
      hudRef.current?.setStats(stats);
    },
    won: () => {
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
  });

  const newGame = (seed?: number): void => {
    stopCelebration(tableRoot);
    table.setOptions(options());
    table.newGame(seed);
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
      newGame: () => newGame(),
      changeSettings: (next) => {
        const optionsChanged = next.drawCount !== settings.drawCount || next.scoring !== settings.scoring;
        settings = next;
        saveSettings(settings);
        sounds.enabled = settings.sound;
        // A game that has not started yet is simply dealt again with the new rules.
        if (optionsChanged && !table.hasStarted && table.phase === 'playing') newGame(table.state.seed);
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
      newGame();
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

  // `?deal=1234` plays a specific numbered deal; otherwise an unfinished game can be continued.
  const requested = Number(params.get('deal'));
  const dealNumber = Number.isInteger(requested) && requested > 0 ? requested : undefined;
  const saved = dealNumber === undefined ? loadGame() : null;
  const canResume = saved !== null && saved.moves.length > 0;

  const choice = await hud.titleScreen(canResume);
  if (choice === 'resume' && saved) {
    table.resume(saved.seed, saved.options, saved.moves, saved.seconds);
  } else {
    newGame(dealNumber);
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
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

void start();
