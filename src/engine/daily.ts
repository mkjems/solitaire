/**
 * The daily deal: one winnable deal per calendar day, the same for every player
 * with the same rules. Each browser works it out on its own: the date picks a
 * fixed sequence of deal numbers, and the first one the solver wins is the
 * day's deal. Nothing is fetched from a server.
 *
 * Standard, timed and no scoring share a deal, as they share the rules of play.
 * Draw three, and Vegas with its limited passes, change what can be won, so
 * they get deals of their own.
 */

import type { KlondikeOptions } from './klondike';
import { createRng } from './rng';
import { findWinnableDeal } from './solver';

/** The solver's budget for the daily deal. Fixed, so a faster solver never changes a day's deal. */
const DAILY_NODES = 60_000;
const DAILY_TRIES = 400;

/** A calendar date as `YYYY-MM-DD`, in the player's own time zone. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day before `key`, for counting days in a row. */
export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d - 1));
}

/** The rules that decide which deals can be won. */
function rulesKey(options: KlondikeOptions): string {
  return `draw${options.drawCount}${options.scoring === 'vegas' ? '-vegas' : ''}`;
}

/** FNV-1a: a small, stable hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The deal numbers tried for a day, in order. */
export function dailyCandidates(day: string, options: KlondikeOptions): () => number {
  const rng = createRng(hash(`solitaire-daily/${day}/${rulesKey(options)}`));
  return () => 1 + Math.floor(rng() * 999_999);
}

/** The day's deal number for these rules. */
export function dailyDeal(day: string, options: KlondikeOptions): number {
  const found = findWinnableDeal(options, dailyCandidates(day, options), {
    maxNodes: DAILY_NODES,
    maxTries: DAILY_TRIES,
  });
  // Practically never: then the day's first candidate, unchecked, so everyone still gets the same deal.
  return found?.seed ?? dailyCandidates(day, options)();
}
