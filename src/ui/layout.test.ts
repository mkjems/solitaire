import { describe, expect, it } from 'vitest';
import { deal } from '../engine/klondike';
import { type Insets, type Layout, computeLayout, computePoses } from './layout';

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
