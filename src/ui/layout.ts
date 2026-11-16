/**
 * Table layout. One pure function turns a viewport size into card size and
 * pile positions, so the table fills any screen from a phone to a 4K monitor.
 */

import type { CardId } from '../engine/cards';
import {
  FOUNDATION_PILES,
  type KlondikeState,
  type PileRef,
  TABLEAU_PILES,
  type TableauPile,
} from '../engine/klondike';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point {
  readonly w: number;
  readonly h: number;
}

/** Space the table must keep clear on each side (HUD, notches, home indicator). */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Layout {
  /**
   * classic: stock, waste and foundations in a row above the tableau.
   * side: stock and waste in a column left of the tableau, foundations in a
   * 2×2 grid to its right; for wide, short screens such as phones held sideways.
   */
  readonly mode: 'classic' | 'side';
  readonly width: number;
  readonly height: number;
  readonly cardW: number;
  readonly cardH: number;
  readonly gapX: number;
  readonly stock: Point;
  readonly waste: Point;
  /** Step between fanned waste cards: sideways in the classic layout, downwards in the side layout. */
  readonly wasteFanDx: number;
  readonly wasteFanDy: number;
  readonly foundations: readonly Point[];
  readonly tableau: readonly Point[];
  /** Vertical step between face-down and face-up tableau cards, before compression. */
  readonly faceDownDy: number;
  readonly faceUpDy: number;
  /** The lowest y a tableau pile may reach. */
  readonly tableauBottom: number;
  /** Tiny per-card offset that gives squared-up piles visible thickness. */
  readonly thickness: number;
}

/** Card proportions: 2.5in × 3.5in. */
const ASPECT = 3.5 / 2.5;

/**
 * Picks the arrangement that gives the biggest cards. The side layout is only
 * considered on small screens, so desktops keep the familiar arrangement.
 */
export function computeLayout(width: number, height: number, insets: Insets): Layout {
  const classic = classicLayout(width, height, insets);
  if (classic.cardW >= 100) return classic;
  const side = sideLayout(width, height, insets);
  return side.cardW > classic.cardW * 1.06 ? side : classic;
}

function classicLayout(width: number, height: number, insets: Insets): Layout {
  const availW = Math.max(200, width - insets.left - insets.right);
  const availH = Math.max(200, height - insets.top - insets.bottom);
  const narrow = availW < 600;
  /** Portrait phones have height to spare, so piles can fan out further. */
  const tall = availH > availW * 1.35;

  const marginX = narrow ? 3 : Math.max(16, availW * 0.025);
  const minGapRatio = narrow ? 0.045 : 0.14;

  // The card must fit seven columns across, and leave room below the top row
  // for a reasonably long tableau pile.
  const byWidth = (availW - 2 * marginX) / (TABLEAU_PILES + (TABLEAU_PILES - 1) * minGapRatio);
  const byHeight = availH / 4.05 / ASPECT;
  const cardW = Math.floor(Math.min(byWidth, byHeight));
  const cardH = Math.round(cardW * ASPECT);

  // When height is the limit there is spare width; spread the columns a little.
  const spare = (availW - 2 * marginX - TABLEAU_PILES * cardW) / (TABLEAU_PILES - 1);
  const gapX = Math.max(cardW * minGapRatio, Math.min(cardW * 0.34, spare));

  const rowW = TABLEAU_PILES * cardW + (TABLEAU_PILES - 1) * gapX;
  const originX = insets.left + (availW - rowW) / 2;
  const column = (i: number): number => Math.round(originX + i * (cardW + gapX));

  const topY = Math.round(insets.top + Math.max(8, cardH * 0.09));
  const tableauY = Math.round(topY + cardH + cardH * (narrow ? 0.16 : 0.2));

  return {
    mode: 'classic',
    width,
    height,
    cardW,
    cardH,
    gapX,
    stock: { x: column(0), y: topY },
    waste: { x: column(1), y: topY },
    // Wider on phones, where the large-print ranks need the room.
    wasteFanDx: cardW * (narrow ? 0.42 : 0.3),
    wasteFanDy: 0,
    foundations: Array.from({ length: FOUNDATION_PILES }, (_, i) => ({
      x: column(TABLEAU_PILES - FOUNDATION_PILES + i),
      y: topY,
    })),
    tableau: Array.from({ length: TABLEAU_PILES }, (_, i) => ({ x: column(i), y: tableauY })),
    faceDownDy: cardH * (tall ? 0.15 : 0.11),
    faceUpDy: cardH * (tall ? 0.31 : 0.25),
    tableauBottom: height - insets.bottom - Math.max(8, cardH * 0.07),
    thickness: Math.min(0.5, cardW * 0.0025),
  };
}

function sideLayout(width: number, height: number, insets: Insets): Layout {
  const availW = Math.max(200, width - insets.left - insets.right);
  const availH = Math.max(200, height - insets.top - insets.bottom);

  const marginX = Math.max(6, availW * 0.012);
  const gapRatio = 0.09;
  /** Extra space separating the side columns from the tableau. */
  const sepRatio = 0.18;
  const columns = TABLEAU_PILES + 3;

  // Ten columns: stock and waste, seven tableau piles, and the foundations in a 2×2 grid.
  const units = columns + (columns - 1) * gapRatio + 2 * sepRatio;
  const byWidth = (availW - 2 * marginX) / units;
  // The tableau runs the full height, which must hold a long, compressed pile.
  const byHeight = availH / 2.8 / ASPECT;
  const cardW = Math.floor(Math.min(byWidth, byHeight));
  const cardH = Math.round(cardW * ASPECT);

  // Spread the columns if there is width to spare.
  const spare = (availW - 2 * marginX - columns * cardW - 2 * sepRatio * cardW) / (columns - 1);
  const gapX = Math.max(cardW * gapRatio, Math.min(cardW * 0.3, spare));
  const sep = cardW * sepRatio;
  const rowGap = Math.round(cardH * 0.12);

  const rowW = columns * cardW + (columns - 1) * gapX + 2 * sep;
  const left = insets.left + (availW - rowW) / 2;
  const topY = Math.round(insets.top + Math.max(6, cardH * 0.06));
  const bottom = height - insets.bottom - Math.max(6, cardH * 0.06);

  const tableauX = (i: number): number => Math.round(left + cardW + gapX + sep + i * (cardW + gapX));
  const foundationX = tableauX(TABLEAU_PILES - 1) + cardW + gapX + sep;

  return {
    mode: 'side',
    width,
    height,
    cardW,
    cardH,
    gapX,
    stock: { x: Math.round(left), y: topY },
    waste: { x: Math.round(left), y: topY + cardH + rowGap },
    wasteFanDx: 0,
    wasteFanDy: cardH * 0.22,
    foundations: Array.from({ length: FOUNDATION_PILES }, (_, i) => ({
      x: Math.round(foundationX + (i % 2) * (cardW + gapX)),
      y: topY + Math.floor(i / 2) * (cardH + rowGap),
    })),
    tableau: Array.from({ length: TABLEAU_PILES }, (_, i) => ({ x: tableauX(i), y: topY })),
    faceDownDy: cardH * 0.11,
    faceUpDy: cardH * 0.25,
    tableauBottom: bottom,
    thickness: Math.min(0.5, cardW * 0.0025),
  };
}

// ---------------------------------------------------------------------------
// Where every card goes
// ---------------------------------------------------------------------------

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly faceUp: boolean;
  /** Stacking order; higher is on top. Always below 1000. */
  readonly z: number;
  /** Which pile the card is in, e.g. "tableau-3". */
  readonly pile: string;
}

const Z_STOCK = 0;
const Z_WASTE = 100;
const Z_FOUNDATION = 200;
const Z_TABLEAU = 400;

/** The vertical steps for one tableau pile, compressed if the pile would run off the table. */
export function tableauSteps(pile: TableauPile, layout: Layout): { down: number; up: number } {
  const faceUp = pile.cards.length - pile.faceDown;
  const steps = Math.max(0, faceUp - 1);
  const room = layout.tableauBottom - (layout.tableau[0] as Point).y - layout.cardH;

  let down = layout.faceDownDy;
  let up = layout.faceUpDy;
  if (pile.faceDown * down + steps * up <= room) return { down, up };

  // Squeeze the face-down cards first; they carry no information.
  const minDown = layout.cardH * 0.045;
  if (pile.faceDown > 0) {
    down = Math.max(minDown, (room - steps * up) / pile.faceDown);
  }
  if (pile.faceDown * down + steps * up > room && steps > 0) {
    // Then the face-up cards, but keep each rank readable.
    up = Math.max(layout.cardH * 0.13, (room - pile.faceDown * down) / steps);
  }
  return { down, up };
}

export function computePoses(state: KlondikeState, layout: Layout): Map<CardId, Pose> {
  const poses = new Map<CardId, Pose>();
  const t = layout.thickness;

  state.stock.forEach((card, i) => {
    poses.set(card, {
      x: layout.stock.x - i * t,
      y: layout.stock.y - i * t,
      faceUp: false,
      z: Z_STOCK + i,
      pile: 'stock',
    });
  });

  const fanStart = state.waste.length - state.wasteFan;
  state.waste.forEach((card, i) => {
    const fanIndex = Math.max(0, i - fanStart);
    const depth = Math.min(i, fanStart) * t;
    poses.set(card, {
      x: layout.waste.x - depth + fanIndex * layout.wasteFanDx,
      y: layout.waste.y - depth + fanIndex * layout.wasteFanDy,
      faceUp: true,
      z: Z_WASTE + i,
      pile: 'waste',
    });
  });

  state.foundations.forEach((pile, f) => {
    const origin = layout.foundations[f] as Point;
    pile.forEach((card, i) => {
      poses.set(card, {
        x: origin.x - i * t,
        y: origin.y - i * t,
        faceUp: true,
        z: Z_FOUNDATION + f * 20 + i,
        pile: `foundation-${f}`,
      });
    });
  });

  state.tableau.forEach((pile, p) => {
    const origin = layout.tableau[p] as Point;
    const { down, up } = tableauSteps(pile, layout);
    let y = origin.y;
    pile.cards.forEach((card, i) => {
      const faceUp = i >= pile.faceDown;
      poses.set(card, { x: origin.x, y, faceUp, z: Z_TABLEAU + p * 40 + i, pile: `tableau-${p}` });
      y += faceUp ? up : down;
    });
  });

  return poses;
}

/** Where the next card placed on a pile would land. */
export function landingSpot(state: KlondikeState, layout: Layout, pile: PileRef): Point {
  switch (pile.kind) {
    case 'stock':
      return layout.stock;
    case 'waste':
      return layout.waste;
    case 'foundation':
      return layout.foundations[pile.index] as Point;
    case 'tableau': {
      const origin = layout.tableau[pile.index] as Point;
      const cards = state.tableau[pile.index] as TableauPile;
      if (cards.cards.length === 0) return origin;
      const { down, up } = tableauSteps(cards, layout);
      const faceUp = cards.cards.length - cards.faceDown;
      return { x: origin.x, y: origin.y + cards.faceDown * down + faceUp * up };
    }
  }
}

/** The area in which releasing a dragged card counts as dropping it on a pile. */
export function dropZone(layout: Layout, pile: PileRef): Rect {
  const pad = layout.gapX / 2;
  if (pile.kind === 'tableau') {
    const origin = layout.tableau[pile.index] as Point;
    return {
      x: origin.x - pad,
      y: origin.y - layout.cardH * 0.1,
      w: layout.cardW + 2 * pad,
      h: layout.height - origin.y,
    };
  }
  const origin = landingSpotForFixedPile(layout, pile);
  return {
    x: origin.x - pad,
    y: origin.y - pad,
    w: layout.cardW + 2 * pad,
    h: layout.cardH + 2 * pad,
  };
}

function landingSpotForFixedPile(layout: Layout, pile: PileRef): Point {
  if (pile.kind === 'foundation') return layout.foundations[pile.index] as Point;
  return pile.kind === 'waste' ? layout.waste : layout.stock;
}

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
