/**
 * Statistics, kept separately for draw one and draw three. A game counts as
 * played once its first move is made. A game left unfinished counts as a loss
 * when the next one starts, which ends the winning streak.
 */

import type { DrawCount, ScoringMode } from '../engine/klondike';

export interface ModeStats {
  readonly played: number;
  readonly won: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly bestTime: number | null;
  readonly fewestMoves: number | null;
  readonly bestScore: Partial<Record<ScoringMode, number>>;
}

export interface Stats {
  readonly draw1: ModeStats;
  readonly draw3: ModeStats;
  /** The draw mode of the game being played, if it has started and not been won. */
  readonly inProgress: DrawCount | null;
}

const emptyMode = (): ModeStats => ({
  played: 0,
  won: 0,
  streak: 0,
  bestStreak: 0,
  bestTime: null,
  fewestMoves: null,
  bestScore: {},
});

export function emptyStats(): Stats {
  return { draw1: emptyMode(), draw3: emptyMode(), inProgress: null };
}

const key = (draw: DrawCount): 'draw1' | 'draw3' => (draw === 1 ? 'draw1' : 'draw3');

/** Records the first move of a new game. */
export function recordStart(stats: Stats, draw: DrawCount): Stats {
  let next = stats;
  if (stats.inProgress !== null) {
    // The previous game was left unfinished.
    const lost = key(stats.inProgress);
    next = { ...next, [lost]: { ...next[lost], streak: 0 } };
  }
  const mode = next[key(draw)];
  return { ...next, [key(draw)]: { ...mode, played: mode.played + 1 }, inProgress: draw };
}

export interface WinRecord {
  readonly draw: DrawCount;
  readonly scoring: ScoringMode;
  readonly seconds: number;
  readonly moves: number;
  readonly score: number;
}

export function recordWin(stats: Stats, win: WinRecord): Stats {
  const mode = stats[key(win.draw)];
  const streak = mode.streak + 1;
  const bestScore = { ...mode.bestScore };
  if (win.scoring !== 'none') {
    bestScore[win.scoring] = Math.max(bestScore[win.scoring] ?? -Infinity, win.score);
  }
  return {
    ...stats,
    [key(win.draw)]: {
      ...mode,
      won: mode.won + 1,
      streak,
      bestStreak: Math.max(mode.bestStreak, streak),
      bestTime: mode.bestTime === null ? win.seconds : Math.min(mode.bestTime, win.seconds),
      fewestMoves: mode.fewestMoves === null ? win.moves : Math.min(mode.fewestMoves, win.moves),
      bestScore,
    },
    inProgress: null,
  };
}

export function winRate(mode: ModeStats): number | null {
  return mode.played === 0 ? null : Math.round((mode.won / mode.played) * 100);
}
