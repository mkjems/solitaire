import { describe, expect, it } from 'vitest';
import { previousDay } from '../engine/daily';
import { emptyStats, recordStart, recordWin, winRate, type DailyLog, dailyStreak, recordDaily } from './stats';

const win = (seconds: number, moves: number, score = 0) =>
  ({ draw: 1, scoring: 'standard', seconds, moves, score }) as const;

describe('statistics', () => {
  it('counts games played and won, with a win rate', () => {
    let stats = emptyStats();
    stats = recordStart(stats, 1);
    stats = recordWin(stats, win(200, 120, 600));
    stats = recordStart(stats, 1);
    expect(stats.draw1.played).toBe(2);
    expect(stats.draw1.won).toBe(1);
    expect(winRate(stats.draw1)).toBe(50);
    expect(winRate(stats.draw3)).toBeNull();
  });

  it('keeps a streak until a game is left unfinished', () => {
    let stats = emptyStats();
    for (let i = 0; i < 3; i++) stats = recordWin(recordStart(stats, 1), win(100, 100));
    expect(stats.draw1.streak).toBe(3);
    stats = recordStart(stats, 1); // started, then abandoned
    stats = recordStart(stats, 1);
    expect(stats.draw1.streak).toBe(0);
    expect(stats.draw1.bestStreak).toBe(3);
  });

  it('keeps the best time, fewest moves and best score', () => {
    let stats = emptyStats();
    stats = recordWin(recordStart(stats, 1), win(300, 140, 500));
    stats = recordWin(recordStart(stats, 1), win(250, 160, 450));
    expect(stats.draw1.bestTime).toBe(250);
    expect(stats.draw1.fewestMoves).toBe(140);
    expect(stats.draw1.bestScore.standard).toBe(500);
  });

  it('keeps draw one and draw three apart', () => {
    let stats = recordStart(emptyStats(), 3);
    stats = recordWin(stats, { ...win(100, 100), draw: 3 });
    expect(stats.draw3.won).toBe(1);
    expect(stats.draw1.played).toBe(0);
  });
});

describe('daily deal log', () => {
  const result = { seconds: 200, moves: 120 };

  it('counts days in a row, and today not yet played does not break it', () => {
    let log: DailyLog = {};
    for (const day of ['2026-11-12', '2026-11-14', '2026-11-15']) log = recordDaily(log, day, result);
    expect(dailyStreak(log, '2026-11-16', previousDay)).toBe(2);
    log = recordDaily(log, '2026-11-16', result);
    expect(dailyStreak(log, '2026-11-16', previousDay)).toBe(3);
    // A missed day ends it.
    expect(dailyStreak(log, '2026-11-18', previousDay)).toBe(0);
  });

  it('keeps the first solve of a day', () => {
    const log = recordDaily(recordDaily({}, '2026-11-16', result), '2026-11-16', { seconds: 90, moves: 80 });
    expect(log['2026-11-16']).toEqual(result);
  });

  it('forgets the oldest days after a long while', () => {
    let log: DailyLog = {};
    let day = '2026-11-16';
    for (let i = 0; i < 820; i++) {
      log = recordDaily(log, day, result);
      day = previousDay(day);
    }
    expect(Object.keys(log)).toHaveLength(800);
    expect(log['2026-11-16']).toBeDefined();
  });
});
