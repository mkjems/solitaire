import { describe, expect, it } from 'vitest';
import { deal } from '../engine/klondike';
import { type Insets, type Layout, computeLayout, computePoses, tableauSteps } from './layout';

const none: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Every pile's resting rectangle, to check nothing overlaps or leaves the screen. */
function pileRects(layout: Layout) {
  return [layout.stock, layout.waste, ...layout.foundations, ...layout.tableau].map((p) => ({
    ...p,
    w: layout.cardW,
    h: layout.cardH,
  }));
}

describe('layout', () => {
  it('keeps the classic arrangement on a desktop', () => {
    const layout = computeLayout(1440, 900, { ...none, top: 56 });
    expect(layout.mode).toBe('classic');
    expect(layout.cardW).toBeGreaterThan(130);
  });

  it('uses the side arrangement on a phone held sideways, with bigger cards', () => {
    const insets: Insets = { top: 44, right: 59, bottom: 25, left: 59 };
    const layout = computeLayout(852, 393, insets);
    expect(layout.mode).toBe('side');
    expect(layout.cardW).toBeGreaterThanOrEqual(62);
    // Uses the width: the outer columns reach close to the safe areas.
    expect(layout.stock.x).toBeLessThan(insets.left + 20);
    const right = Math.max(...layout.foundations.map((p) => p.x)) + layout.cardW;
    expect(right).toBeGreaterThan(852 - insets.right - 20);
  });

  it('fits every pile on screen in both arrangements', () => {
    const cases: [number, number, Insets][] = [
      [393, 852, { top: 63, right: 0, bottom: 90, left: 0 }],
      [852, 393, { top: 44, right: 59, bottom: 25, left: 59 }],
      [667, 375, { top: 44, right: 0, bottom: 4, left: 0 }],
      [1440, 900, { ...none, top: 56 }],
      [2560, 1080, { ...none, top: 56 }],
    ];
    for (const [w, h, insets] of cases) {
      const layout = computeLayout(w, h, insets);
      for (const r of pileRects(layout)) {
        expect(r.x).toBeGreaterThanOrEqual(insets.left);
        expect(r.x + r.w).toBeLessThanOrEqual(w - insets.right);
        expect(r.y).toBeGreaterThanOrEqual(insets.top);
        expect(r.y + r.h).toBeLessThanOrEqual(h - insets.bottom);
      }
    }
  });

  it('fans the waste downwards in the side arrangement', () => {
    const layout = computeLayout(852, 393, { top: 44, right: 59, bottom: 25, left: 59 });
    let state = deal(3, { drawCount: 3, scoring: 'none' });
    state = { ...state, waste: state.stock.slice(-3), stock: state.stock.slice(0, -3), wasteFan: 3 };
    const poses = computePoses(state, layout);
    const ys = state.waste.map((id) => poses.get(id)?.y ?? 0);
    expect(ys[2]).toBeGreaterThan(ys[1] as number);
    expect(ys[1]).toBeGreaterThan(ys[0] as number);
  });
});

describe('side layout foundations', () => {
  it('never overlap one another or the tableau', () => {
    for (const [w, h, insets] of [
      [852, 393, { top: 44, right: 59, bottom: 25, left: 59 }],
      [863, 360, { top: 44, right: 0, bottom: 4, left: 0 }],
      [932, 430, { top: 44, right: 59, bottom: 25, left: 59 }],
    ] as [number, number, Insets][]) {
      const layout = computeLayout(w, h, insets);
      expect(layout.mode).toBe('side');
      const rects = [...layout.foundations, layout.tableau[6] as { x: number; y: number }].map((p) => ({
        ...p,
        w: layout.cardW,
        h: layout.cardH,
      }));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i] as { x: number; y: number; w: number; h: number };
          const b = rects[j] as { x: number; y: number; w: number; h: number };
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${w}x${h}: piles ${i} and ${j}`).toBe(false);
        }
      }
    }
  });
});

describe('portrait layout', () => {
  const phones: [number, number, Insets][] = [
    [393, 852, { top: 63, right: 0, bottom: 90, left: 0 }],
    // Safari with its toolbars showing.
    [390, 664, { top: 4, right: 0, bottom: 56, left: 0 }],
    [375, 553, { top: 4, right: 0, bottom: 56, left: 0 }],
  ];

  it('keeps the cards off the screen edges', () => {
    for (const [w, h, insets] of phones) {
      const layout = computeLayout(w, h, insets);
      expect(layout.mode).toBe('portrait');
      const xs = [...layout.tableau, ...layout.foundations, layout.stock, layout.waste].map((p) => p.x);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(insets.left + 6);
      expect(Math.max(...xs) + layout.cardW).toBeLessThanOrEqual(w - insets.right - 6);
    }
  });

  it('puts the stock low on the right and the waste beside it, below the tableau', () => {
    for (const [w, h, insets] of phones) {
      const layout = computeLayout(w, h, insets);
      expect(layout.stock.x).toBe((layout.tableau[5] as { x: number }).x);
      expect(layout.waste.x).toBe((layout.tableau[4] as { x: number }).x);
      expect(layout.waste.y).toBe(layout.stock.y);
      expect(layout.stock.y).toBeGreaterThan(layout.tableauBottom);
      expect(layout.stock.y + layout.cardH).toBeLessThanOrEqual(h - insets.bottom);
    }
  });

  it('places the stock well above the bottom on a tall screen, clear of the longest pile', () => {
    const layout = computeLayout(393, 852, { top: 63, right: 0, bottom: 90, left: 0 });
    // Six face-down cards under a King-to-Ace run still fit above it, ranks readable.
    const pile = { cards: Array.from({ length: 19 }, (_, i) => i as never), faceDown: 6 };
    const { down, up } = tableauSteps(pile, layout);
    expect(up).toBeGreaterThan(layout.cardH * 0.2);
    const end = (layout.tableau[6] as { y: number }).y + 6 * down + 12 * up + layout.cardH;
    expect(end).toBeLessThan(layout.stock.y);
    // About a card's height of room is left below the stock.
    expect(layout.stock.y + 2 * layout.cardH).toBeLessThan(852 - 90);
  });

  it('keeps the tableau gap between the stock and the top waste card', () => {
    const layout = computeLayout(393, 852, { top: 63, right: 0, bottom: 90, left: 0 });
    for (const drawn of [1, 12, 24]) {
      let state = deal(3, { drawCount: 1, scoring: 'none' });
      state = { ...state, waste: state.stock.slice(-drawn), stock: state.stock.slice(0, -drawn), wasteFan: 1 };
      const poses = computePoses(state, layout);
      const top = poses.get(state.waste.at(-1) as never)?.x ?? 0;
      const stockTop = state.stock.at(-1);
      const stockX = stockTop === undefined ? layout.stock.x : (poses.get(stockTop)?.x ?? 0);
      expect(stockX - (top + layout.cardW)).toBeCloseTo(layout.tableau[1]!.x - layout.tableau[0]!.x - layout.cardW, 0);
    }
  });

  it('keeps the top waste card next to the stock and fans the rest to its left', () => {
    const layout = computeLayout(393, 852, { top: 63, right: 0, bottom: 90, left: 0 });
    let state = deal(3, { drawCount: 3, scoring: 'none' });
    state = { ...state, waste: state.stock.slice(-5), stock: state.stock.slice(0, -5), wasteFan: 3 };
    const poses = computePoses(state, layout);
    const xs = state.waste.map((id) => poses.get(id)?.x ?? 0);
    expect(xs[4]).toBeCloseTo(layout.waste.x);
    expect(xs[3]).toBeLessThan(xs[4] as number);
    expect(xs[2]).toBeLessThan(xs[3] as number);
    expect((xs[2] as number) + layout.cardW).toBeGreaterThan(xs[4] as number);
  });
});
