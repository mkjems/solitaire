import { describe, expect, it } from 'vitest';
import { emptyStats, recordStart, recordWin, winRate } from './stats';

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
