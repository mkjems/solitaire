import { describe, expect, it } from 'vitest';
import { dailyCandidates, dailyDeal, dayKey, previousDay } from './daily';
import { type KlondikeOptions, deal } from './klondike';
import { solve } from './solver';

const DRAW_1: KlondikeOptions = { drawCount: 1, scoring: 'timed' };

describe('daily deal', () => {
  it('names days by the local calendar date', () => {
    expect(dayKey(new Date(2026, 10, 16, 0, 5))).toBe('2026-11-16');
    expect(dayKey(new Date(2026, 10, 16, 23, 55))).toBe('2026-11-16');
    expect(dayKey(new Date(2027, 0, 3))).toBe('2027-01-03');
  });

  it('counts back across months and years', () => {
    expect(previousDay('2026-11-16')).toBe('2026-11-15');
    expect(previousDay('2026-12-01')).toBe('2026-11-30');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
  });

  it('is the same deal every time for a day, and a winnable one', () => {
    const today = dailyDeal('2026-11-16', DRAW_1);
    expect(dailyDeal('2026-11-16', DRAW_1)).toBe(today);
    expect(solve(deal(today, DRAW_1)).status).toBe('won');
  });

  it('is a different deal on different days', () => {
    const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'];
    expect(new Set(days.map((day) => dailyDeal(day, DRAW_1))).size).toBe(days.length);
  });

  it('is shared by scorings with the same rules of play, but not by draw three or Vegas', () => {
    const day = '2026-11-16';
    const seq = (options: KlondikeOptions) => dailyCandidates(day, options)();
    expect(seq({ drawCount: 1, scoring: 'standard' })).toBe(seq(DRAW_1));
    expect(seq({ drawCount: 1, scoring: 'none' })).toBe(seq(DRAW_1));
    expect(seq({ drawCount: 3, scoring: 'timed' })).not.toBe(seq(DRAW_1));
    expect(seq({ drawCount: 1, scoring: 'vegas' })).not.toBe(seq(DRAW_1));
  });

  it('can be won with draw three and with Vegas rules too', () => {
    for (const options of [{ drawCount: 3, scoring: 'standard' }, { drawCount: 3, scoring: 'vegas' }] as const) {
      const seed = dailyDeal('2026-11-16', options);
      expect(solve(deal(seed, options)).status, JSON.stringify(options)).toBe('won');
    }
  }, 30_000);
});
