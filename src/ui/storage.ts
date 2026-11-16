/**
 * Everything the game remembers between visits, kept in localStorage.
 * Storage can be unavailable (private windows, blocked site data), so every
 * read falls back to a default and every write may silently fail.
 */

import {
  DEFAULT_OPTIONS,
  type DrawCount,
  type KlondikeOptions,
  type Move,
  type ScoringMode,
} from '../engine/klondike';
import { type DailyLog, type Stats, emptyStats } from './stats';
import { BACKS, type Back, FELTS, type Felt } from './theme';

const KEYS = {
  settings: 'solitaire.settings',
  game: 'solitaire.game',
  stats: 'solitaire.stats',
  daily: 'solitaire.daily',
} as const;

export interface Settings {
  readonly drawCount: DrawCount;
  readonly scoring: ScoringMode;
  readonly sound: boolean;
  /** Deal only games the solver has won. */
  readonly winnable: boolean;
  /** Say so when the game in progress can no longer be won. */
  readonly deadEnds: boolean;
  readonly felt: Felt;
  readonly back: Back;
}

export interface SavedGame {
  readonly seed: number;
  readonly options: KlondikeOptions;
  readonly moves: readonly Move[];
  readonly seconds: number;
  /** The day (`YYYY-MM-DD`) if this is that day's daily deal. */
  readonly daily?: string | null;
}

export const SCORING_MODES: readonly ScoringMode[] = ['none', 'standard', 'timed', 'vegas'];

function read(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering is a convenience; the game works without it.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanOptions(value: unknown): KlondikeOptions {
  const raw = isRecord(value) ? value : {};
  return {
    drawCount: raw.drawCount === 3 ? 3 : raw.drawCount === 1 ? 1 : DEFAULT_OPTIONS.drawCount,
    scoring: SCORING_MODES.includes(raw.scoring as ScoringMode) ? (raw.scoring as ScoringMode) : DEFAULT_OPTIONS.scoring,
  };
}

export function loadSettings(): Settings {
  const raw = read(KEYS.settings);
  const options = cleanOptions(raw);
  return {
    ...options,
    sound: !(isRecord(raw) && raw.sound === false),
    winnable: !(isRecord(raw) && raw.winnable === false),
    deadEnds: !(isRecord(raw) && raw.deadEnds === false),
    felt: isRecord(raw) && FELTS.includes(raw.felt as Felt) ? (raw.felt as Felt) : 'emerald',
    back: isRecord(raw) && BACKS.includes(raw.back as Back) ? (raw.back as Back) : 'navy',
  };
}

export function saveSettings(settings: Settings): void {
  write(KEYS.settings, settings);
}

export function loadGame(): SavedGame | null {
  const raw = read(KEYS.game);
  if (!isRecord(raw) || !Number.isInteger(raw.seed) || !Array.isArray(raw.moves)) return null;
  return {
    seed: raw.seed as number,
    options: cleanOptions(raw.options),
    // Moves are replayed through the engine, which rejects anything malformed.
    moves: raw.moves as Move[],
    seconds: typeof raw.seconds === 'number' && raw.seconds >= 0 ? raw.seconds : 0,
    daily: typeof raw.daily === 'string' && DAY.test(raw.daily) ? raw.daily : null,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function loadDaily(): DailyLog {
  const raw = read(KEYS.daily);
  if (!isRecord(raw)) return {};
  const log: Record<string, { seconds: number; moves: number }> = {};
  for (const [day, entry] of Object.entries(raw)) {
    if (DAY.test(day) && isRecord(entry) && typeof entry.seconds === 'number' && typeof entry.moves === 'number') {
      log[day] = { seconds: entry.seconds, moves: entry.moves };
    }
  }
  return log;
}

export function saveDaily(log: DailyLog): void {
  write(KEYS.daily, log);
}

export function saveGame(game: SavedGame | null): void {
  write(KEYS.game, game);
}

export function loadStats(): Stats {
  const raw = read(KEYS.stats);
  const empty = emptyStats();
  if (!isRecord(raw)) return empty;
  return {
    draw1: { ...empty.draw1, ...(isRecord(raw.draw1) ? raw.draw1 : {}) },
    draw3: { ...empty.draw3, ...(isRecord(raw.draw3) ? raw.draw3 : {}) },
    inProgress: raw.inProgress === 1 || raw.inProgress === 3 ? raw.inProgress : null,
  } as Stats;
}

export function saveStats(stats: Stats): void {
  write(KEYS.stats, stats);
}
