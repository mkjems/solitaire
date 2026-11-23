/**
 * The table's look: the colour of the felt and of the card backs. The felt
 * colours themselves are in styles.css (`:root[data-felt=...]`); the card backs
 * are made by scripts/prepare-cards.mjs.
 */

import { assetUrl } from './assets';

export const FELTS = ['emerald', 'midnight', 'burgundy', 'graphite', 'black'] as const;
export type Felt = (typeof FELTS)[number];

export const BACKS = ['navy', 'burgundy', 'emerald', 'black'] as const;
export type Back = (typeof BACKS)[number];

/** Each felt's darkest colour: behind the table, and for the browser's bars. Must match styles.css. */
export const FELT_BASE: Record<Felt, string> = {
  emerald: '#07301c',
  midnight: '#0a1b33',
  burgundy: '#2e0b13',
  graphite: '#18191c',
  black: '#000000',
};

/** A felt swatch for the menu: the felt's light centre fading to its edge. */
export const FELT_SWATCH: Record<Felt, string> = {
  emerald: 'radial-gradient(circle at 40% 35%, #218453, #0d4a2a 75%)',
  midnight: 'radial-gradient(circle at 40% 35%, #2a5a8c, #122d4d 75%)',
  burgundy: 'radial-gradient(circle at 40% 35%, #8a2a3a, #4a131e 75%)',
  graphite: 'radial-gradient(circle at 40% 35%, #55595f, #2b2d31 75%)',
  black: 'radial-gradient(circle at 40% 35%, #262626, #000 70%)',
};

export function backUrl(back: Back): string {
  return assetUrl(`cards/back-${back}.svg`);
}

/** Lays the felt: the table, the panels' tint and the colour of the browser's bars. */
export function applyFelt(felt: Felt): void {
  document.documentElement.dataset.felt = felt;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', FELT_BASE[felt]);
}
