/**
 * Plays real games through the browser with mouse and touch, mirroring every
 * move in the engine, and checks that each card ends where the engine says.
 */

import { type Page, expect, test } from '@playwright/test';
import { KlondikeGame } from '../src/engine/game';
import { hint } from '../src/engine/hint';
import { dailyDeal } from '../src/engine/daily';
import { createRng } from '../src/engine/rng';
import { analyse, solve } from '../src/engine/solver';
import {
  DEFAULT_OPTIONS,
  type KlondikeState,
  type Move,
  type PileRef,
  applyMove,
  canAutoFinish,
  deal,
  legalMoves,
  quickMove,
} from '../src/engine/klondike';

const SEED = 1234;

function pileName(pile: PileRef): string {
  return pile.kind === 'foundation' || pile.kind === 'tableau' ? `${pile.kind}-${pile.index}` : pile.kind;
}

async function waitForDeal(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getElementById('table')?.dataset.phase === 'playing', null, {
    timeout: 10_000,
  });
}

/** Waits until no card has moved for a few frames. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const read = () =>
          [...document.querySelectorAll<HTMLElement>('.card')].map((c) => c.style.transform).join();
        const started = performance.now();
        let last = read();
        let still = 0;
        const check = () => {
          const now = read();
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 6) return resolve();
          if (performance.now() - started > 5000) return reject(new Error('Cards never settled'));
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
}

/** Every card's pile and face, as the page shows them. */
async function readTable(page: Page): Promise<Record<string, { pile: string; faceUp: boolean }>> {
  return page.evaluate(() => {
    const out: Record<string, { pile: string; faceUp: boolean }> = {};
    for (const el of document.querySelectorAll<HTMLElement>('.card')) {
      out[el.dataset.card as string] = { pile: el.dataset.pile as string, faceUp: el.dataset.face === 'up' };
    }
    return out;
  });
}

function expected(state: KlondikeState): Record<string, { pile: string; faceUp: boolean }> {
  const out: Record<string, { pile: string; faceUp: boolean }> = {};
  for (const card of state.stock) out[card] = { pile: 'stock', faceUp: false };
  for (const card of state.waste) out[card] = { pile: 'waste', faceUp: true };
  state.foundations.forEach((pile, i) => {
    for (const card of pile) out[card] = { pile: `foundation-${i}`, faceUp: true };
  });
  state.tableau.forEach((pile, i) => {
    pile.cards.forEach((card, j) => (out[card] = { pile: `tableau-${i}`, faceUp: j >= pile.faceDown }));
  });
  return out;
}

/** A sensible next move for a test game: progress first, otherwise turn the stock. */
function chooseMove(state: KlondikeState): Move | null {
  const moves = legalMoves(state);
  const score = (move: Move): number => {
    if (move.type !== 'move') return 1;
    if (move.from.kind === 'foundation') return -1;
    if (move.to.kind === 'foundation') return 5;
    if (move.from.kind === 'waste') return 4;
    if (move.from.kind === 'tableau') {
      const pile = state.tableau[move.from.index];
      const uncovers = pile && pile.faceDown > 0 && move.count === pile.cards.length - pile.faceDown;
      return uncovers ? 3 : -1;
    }
    return -1;
  };
  const best = moves.filter((m) => score(m) > 0).sort((a, b) => score(b) - score(a))[0];
  return best ?? null;
}

/** The top-left corner the page should show for the card that leads a move. */
async function leadCardBox(page: Page, state: KlondikeState, move: Extract<Move, { type: 'move' }>) {
  let card: string | undefined;
  if (move.from.kind === 'waste') card = state.waste.at(-1);
  else if (move.from.kind === 'foundation') card = state.foundations[move.from.index]?.at(-1);
  else if (move.from.kind === 'tableau') {
    const cards = state.tableau[move.from.index]?.cards ?? [];
    card = cards[cards.length - move.count];
  }
  const box = await page.locator(`.card[data-card="${card}"]`).boundingBox();
  if (!box) throw new Error(`No box for ${card}`);
  return box;
}

async function dragMove(page: Page, state: KlondikeState, move: Extract<Move, { type: 'move' }>) {
  const lead = await leadCardBox(page, state, move);
  // Grab the strip of the card that is always visible.
  const grab = { x: lead.x + lead.width / 2, y: lead.y + lead.height * 0.07 };
  const slot = await page.locator(`.slot[data-slot="${pileName(move.to)}"]`).boundingBox();
  if (!slot) throw new Error('No slot');
  let topY = slot.y;
  if (move.to.kind === 'tableau') {
    const pile = state.tableau[move.to.index]?.cards ?? [];
    const top = pile.at(-1);
    if (top) topY = ((await page.locator(`.card[data-card="${top}"]`).boundingBox())?.y ?? slot.y) + lead.height * 0.25;
  }
  const drop = { x: slot.x + (grab.x - lead.x), y: topY + (grab.y - lead.y) };

  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 12 });
  await page.mouse.up();
}

async function clickStock(page: Page): Promise<void> {
  const box = await page.locator('.slot[data-slot="stock"]').boundingBox();
  if (!box) throw new Error('No stock');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/${query}`);
  await page.locator('[data-action=start]').click();
  await waitForDeal(page);
  await settle(page);
}

test.describe('playing', () => {
test.beforeEach(async ({ page }) => {
  await open(page, `?deal=${SEED}&lang=en`);
});

test('the opening deal leaves the table matching the engine', async ({ page }) => {
  expect(await readTable(page)).toEqual(expected(deal(SEED, DEFAULT_OPTIONS)));
  await expect(page.locator('.hud-status')).toContainText('#1234');
});

test('plays a game by dragging, tapping and drawing, with undo and redo', async ({ page }, info) => {
  test.setTimeout(120_000);
  let state = deal(SEED, DEFAULT_OPTIONS);
  const history: KlondikeState[] = [];
  let drags = 0;
  let taps = 0;

  for (let step = 0; step < 45; step++) {
    const move = chooseMove(state);
    history.push(state);

    if (move && move.type === 'move') {
      // Alternate between dragging and tapping when a tap would make the same move.
      const tap = quickMove(state, move.from, move.count);
      if (step % 2 === 1 && tap && JSON.stringify(tap) === JSON.stringify(move) && !info.project.name.startsWith('phone')) {
        const lead = await leadCardBox(page, state, move);
        await page.mouse.click(lead.x + lead.width / 2, lead.y + lead.height * 0.07);
        taps++;
      } else {
        await dragMove(page, state, move);
        drags++;
      }
      state = applyMove(state, move);
    } else {
      await clickStock(page);
      state = applyMove(state, state.stock.length > 0 ? { type: 'draw' } : { type: 'recycle' });
    }
    await settle(page);
    expect(await readTable(page), `after step ${step}`).toEqual(expected(state));
  }

  expect(drags).toBeGreaterThan(0);
  await expect(page.locator('.hud-status')).toContainText(`${state.moves}`);

  // Undo three moves, then redo them.
  for (let i = 0; i < 3; i++) await page.locator('[data-action=undo]').click();
  await settle(page);
  expect(await readTable(page)).toEqual(expected(history[history.length - 3] as KlondikeState));

  if (!info.project.name.startsWith('phone')) {
    for (let i = 0; i < 3; i++) await page.keyboard.press('r');
    await settle(page);
    expect(await readTable(page)).toEqual(expected(state));
  }
  void taps;
});

test('an illegal drop sends the cards home', async ({ page }) => {
  const before = await readTable(page);
  // The 4 of spades in pile 1 cannot go on the 6 of clubs in pile 7.
  const four = await page.locator('.card[data-card="4S"]').boundingBox();
  const six = await page.locator('.card[data-card="6C"]').boundingBox();
  if (!four || !six) throw new Error('Cards not found');
  await page.mouse.move(four.x + four.width / 2, four.y + 10);
  await page.mouse.down();
  await page.mouse.move(six.x + six.width / 2, six.y + 60, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  expect(await readTable(page)).toEqual(before);
  const after = await page.locator('.card[data-card="4S"]').boundingBox();
  expect(Math.abs((after?.x ?? 0) - four.x)).toBeLessThan(1);
  expect(Math.abs((after?.y ?? 0) - four.y)).toBeLessThan(1);
});

test('the table fits the screen with no overflow', async ({ page }) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');
  for (const slot of await page.locator('.slot').all()) {
    const box = await slot.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await expect(page.locator('[data-action=new]')).toBeVisible();
  await expect(page.locator('[data-action=undo]')).toBeVisible();
});

test('a new game deals a different deal', async ({ page }) => {
  await page.locator('[data-action=new]').click();
  await waitForDeal(page);
  await settle(page);
  await expect(page.locator('.hud-status')).not.toContainText('#1234');
});
});

test('a saved game continues where it was left, and finishing it wins', async ({ page }) => {
  test.setTimeout(60_000);
  // Deal 20 is won by following hints; save it once nothing is left hidden.
  const game = new KlondikeGame(20, { drawCount: 1, scoring: 'standard' });
  while (!canAutoFinish(game.state)) {
    const move = hint(game.state);
    if (!move) throw new Error('Deal 20 should be winnable by hints');
    game.play(move);
  }
  const saved = { seed: 20, options: game.state.options, moves: game.log, seconds: 125 };
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('solitaire.game', value);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(saved));

  await page.goto('/?lang=en');
  await expect(page.locator('[data-action=start]')).toHaveText('Continue game');
  await page.locator('[data-action=start]').click();
  await waitForDeal(page);
  await settle(page);
  expect(await readTable(page)).toEqual(expected(game.state));
  await expect(page.locator('.hud-status')).toContainText('2:05');

  await page.locator('[data-action=finish]').click();
  await expect(page.locator('.win')).toHaveClass(/is-visible/, { timeout: 15_000 });
  await expect(page.locator('.win-panel')).toContainText('Solved');

  // The win is recorded and the saved game is cleared.
  const stored = await page.evaluate(() => ({
    game: localStorage.getItem('solitaire.game'),
    stats: JSON.parse(localStorage.getItem('solitaire.stats') ?? '{}'),
  }));
  expect(stored.game).toBeNull();
  expect(stored.stats.draw1.won).toBe(1);
});

test('the menu changes settings and shows statistics', async ({ page }) => {
  await open(page, '?deal=7&lang=en');
  await page.locator('[data-action=menu]').click();
  await expect(page.locator('dialog.panel')).toBeVisible();
  await page.locator('[data-action=set-draw][data-value="3"]').click();
  // No move has been made, so the deal is replayed straight away with draw three.
  await page.locator('[data-action=close]').click();
  await waitForDeal(page);
  await settle(page);
  expect(await readTable(page)).toEqual(expected(deal(7, { drawCount: 3, scoring: 'timed' })));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solitaire.settings') ?? '{}').drawCount)).toBe(3);

  await page.locator('[data-action=menu]').click();
  await page.locator('[data-action=tab-stats]').click();
  await expect(page.locator('.stats-table')).toContainText('Played');
});

test('a hint highlights a move', async ({ page }) => {
  await open(page, `?deal=${SEED}&lang=en`);
  await page.locator('[data-action=hint]').click();
  await expect(page.locator('.is-hinted')).not.toHaveCount(0);
});

test('on a phone the page scrolls to hide the browser bars, and the table stays put', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('phone'), 'phones only');
  await open(page, `?deal=${SEED}&lang=en`);
  const before = await page.locator('.card[data-card="4S"]').boundingBox();
  const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  expect(room).toBeGreaterThan(40);
  await page.evaluate(() => window.scrollTo(0, 80));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.locator('.card[data-card="4S"]').boundingBox()).toEqual(before);
});

test('small screens get large-print cards, and phones held sideways the side layout', async ({ page }, info) => {
  await open(page, `?deal=${SEED}&lang=en`);
  const read = () =>
    page.evaluate(() => ({
      layout: document.getElementById('table')?.dataset.layout,
      face: document.querySelector<HTMLImageElement>('.card-face')?.src ?? '',
    }));
  const { layout, face } = await read();
  // Large print on phones, upright or sideways; the original artwork on a desktop.
  expect(face.includes('/cards/large/')).toBe(info.project.name !== 'desktop');
  expect(layout).toBe(info.project.name === 'phone-landscape' ? 'side' : 'classic');
});

test('turning a phone sideways and back restores the layout', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone held upright only');
  await open(page, `?deal=${SEED}&lang=en`);
  const upright = page.viewportSize();
  if (!upright) throw new Error('No viewport');
  const slotBoxes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.slot-foundation')].map((slot) => {
        const box = slot.getBoundingClientRect();
        return { y: Math.round(box.y), h: Math.round(box.height) };
      }),
    );
  const before = await slotBoxes();

  await page.setViewportSize({ width: upright.height, height: upright.width });
  await settle(page);
  expect(await page.evaluate(() => document.getElementById('table')?.dataset.layout)).toBe('side');

  await page.setViewportSize(upright);
  await settle(page);
  expect(await slotBoxes()).toEqual(before);
  // All four foundation outlines are full cards in a row.
  const after = await slotBoxes();
  expect(new Set(after.map((b) => b.y)).size).toBe(1);
  expect(new Set(after.map((b) => b.h)).size).toBe(1);
});

test.describe('pages per language', () => {
  test('the Danish page opens the game in Danish, with every card found', async ({ page }) => {
    const failed: string[] = [];
    page.on('requestfailed', (request) => failed.push(request.url()));
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`/da/?deal=${SEED}`);
    await expect(page.locator('[data-action=start]')).toHaveText('Læg kortene ud');
    await page.locator('[data-action=start]').click();
    await waitForDeal(page);
    await settle(page);

    expect(await page.evaluate(() => document.documentElement.lang)).toBe('da');
    await expect(page).toHaveTitle(/^Kabale – /);
    // Every face-up card has loaded its picture.
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('.card-face')].filter((img) => img.complete && img.naturalWidth === 0).length,
    );
    expect(broken).toBe(0);
    expect(failed.filter((url) => !url.includes('stats.mkjems.dk'))).toEqual([]);
  });

  test('the main page follows the browser language, and ?lang overrides it', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'da-DK' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('[data-action=start]')).toHaveText('Læg kortene ud');
    await expect(page).toHaveTitle('Kabale');
    await page.goto('/da/?lang=en');
    await expect(page.locator('[data-action=start]')).not.toHaveText('Læg kortene ud');
    await context.close();
  });
});

test('every deal can be won, unless any deal is chosen', async ({ page }) => {
  const dealNumber = async () => {
    const text = (await page.locator('.hud-status').textContent()) ?? '';
    return Number(text.match(/#(\d+)/)?.[1]);
  };
  await page.goto('/?lang=en');
  await page.locator('[data-action=start]').click();
  await waitForDeal(page);
  const first = await dealNumber();
  expect(solve(deal(first, DEFAULT_OPTIONS)).status, `deal ${first}`).toBe('won');

  await page.locator('[data-action=new]').click();
  await expect.poll(dealNumber).not.toBe(first);
  await waitForDeal(page);
  const second = await dealNumber();
  expect(solve(deal(second, DEFAULT_OPTIONS)).status, `deal ${second}`).toBe('won');

  // The setting is remembered.
  await page.locator('[data-action=menu]').click();
  await page.locator('[data-action=set-deals][data-value=false]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('solitaire.settings') ?? '{}').winnable)).toBe(false);
});

test.describe('smarter hints and dead ends', () => {
  /** The cards a hint for `move` should light up. */
  function hintedCards(state: KlondikeState, move: Move): string[] {
    if (move.type !== 'move') return state.stock.slice(-1);
    if (move.from.kind === 'waste') return state.waste.slice(-1);
    if (move.from.kind === 'tableau') return state.tableau[move.from.index]?.cards.slice(-move.count) ?? [];
    return state.foundations[move.from.kind === 'foundation' ? move.from.index : 0]?.slice(-1) ?? [];
  }

  /** A game that has just reached a dead end: lost now, but winnable one move earlier. */
  function deadEndGame(): { seed: number; moves: Move[]; before: KlondikeState } {
    const rng = createRng(5);
    for (let seed = 1; seed < 300; seed++) {
      const game = new KlondikeGame(seed, DEFAULT_OPTIONS);
      if (analyse(game.state).status !== 'won') continue;
      for (let step = 0; step < 80; step++) {
        const moves = legalMoves(game.state).filter((m) => m.type !== 'move' || m.from.kind !== 'foundation');
        if (moves.length === 0) break;
        const before = game.state;
        game.play(moves[Math.floor(rng() * moves.length)] as Move);
        const status = analyse(game.state).status;
        if (status === 'lost') return { seed, moves: game.log, before };
        if (status !== 'won') break;
      }
    }
    throw new Error('No dead end found');
  }

  async function resumeGame(page: Page, game: { seed: number; moves: Move[] }, settings?: object) {
    const saved = { seed: game.seed, options: DEFAULT_OPTIONS, moves: game.moves, seconds: 60 };
    await page.addInitScript(
      ([value, extra]) => {
        if (sessionStorage.getItem('seeded')) return;
        localStorage.setItem('solitaire.game', value);
        if (extra) localStorage.setItem('solitaire.settings', extra);
        sessionStorage.setItem('seeded', '1');
      },
      [JSON.stringify(saved), settings ? JSON.stringify(settings) : ''] as const,
    );
    await page.goto('/?lang=en');
    await page.locator('[data-action=start]').click();
    await waitForDeal(page);
    await settle(page);
  }

  test('a hint shows the next move of a winning line', async ({ page }) => {
    let seed = SEED;
    while (analyse(deal(seed, DEFAULT_OPTIONS)).status !== 'won') seed++;
    const state = deal(seed, DEFAULT_OPTIONS);
    const first = analyse(state).moves[0] as Move;

    await open(page, `?deal=${seed}&lang=en`);
    await page.locator('[data-action=hint]').click();
    await expect(page.locator('.card.is-hinted')).not.toHaveCount(0);
    const lit = await page.locator('.card.is-hinted').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.card));
    expect(lit.sort()).toEqual(hintedCards(state, first).sort());
  });

  test('a game that can no longer be won says so, and Go back returns to where it could', async ({ page }) => {
    test.setTimeout(90_000);
    const game = deadEndGame();
    await resumeGame(page, game);

    const notice = page.locator('.notice');
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(notice).toContainText('can no longer be won');
    await page.locator('[data-action=go-back]').click();
    await expect(notice).toBeHidden();
    await expect.poll(() => readTable(page), { timeout: 10_000 }).toEqual(expected(game.before));
  });

  test('with the warning turned off, only a hint tells', async ({ page }) => {
    test.setTimeout(90_000);
    const game = deadEndGame();
    await resumeGame(page, game, { drawCount: 1, scoring: 'timed', sound: true, winnable: true, deadEnds: false });

    await page.waitForTimeout(2000);
    await expect(page.locator('.notice')).toBeHidden();
    await page.locator('[data-action=hint]').click();
    await expect(page.locator('.notice')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('daily deal', () => {
  // A fixed day for the page; timers and animations run as normal.
  const DAY = '2026-11-20';
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 20, 12, 0));
  });

  const todays = () => deal(dailyDeal(DAY, DEFAULT_OPTIONS), DEFAULT_OPTIONS);

  test('the title screen offers today’s deal, the same for everyone', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.locator('[data-action=start-daily]').click();
    await waitForDeal(page);
    await settle(page);
    expect(await readTable(page)).toEqual(expected(todays()));
    await expect(page.locator('.hud-status')).toContainText('20 Nov');
  });

  test('a link opens today’s deal, and the menu shows it as not yet solved', async ({ page }) => {
    await page.goto('/?daily&lang=en');
    await expect(page.locator('[data-action=start]')).toHaveText('Today’s deal');
    await page.locator('[data-action=start]').click();
    await waitForDeal(page);
    await settle(page);
    expect(await readTable(page)).toEqual(expected(todays()));
    await page.locator('[data-action=menu]').click();
    await expect(page.locator('[data-action=play-daily]')).toBeVisible();
    await expect(page.locator('.daily-status')).toBeHidden();
  });

  test('solving it is remembered, with the days in a row', async ({ page }) => {
    test.setTimeout(60_000);
    // Today's deal played along the solver's line until only the finish is left.
    const game = new KlondikeGame(todays().seed, DEFAULT_OPTIONS);
    for (const move of solve(game.state).moves) {
      if (canAutoFinish(game.state)) break;
      game.play(move);
    }
    const saved = { seed: game.state.seed, options: DEFAULT_OPTIONS, moves: game.log, seconds: 300, daily: DAY };
    const yesterday = { '2026-11-19': { seconds: 400, moves: 150 } };
    await page.addInitScript(
      ([value, log]) => {
        if (sessionStorage.getItem('seeded')) return;
        localStorage.setItem('solitaire.game', value);
        localStorage.setItem('solitaire.daily', log);
        sessionStorage.setItem('seeded', '1');
      },
      [JSON.stringify(saved), JSON.stringify(yesterday)] as const,
    );
    await page.goto('/?lang=en');
    await page.locator('[data-action=start]').click();
    await waitForDeal(page);
    await page.locator('[data-action=finish]').click();
    await expect(page.locator('.win')).toHaveClass(/is-visible/, { timeout: 15_000 });
    await expect(page.locator('.win-streak')).toContainText('Today’s deal solved');
    await expect(page.locator('.win-streak')).toContainText('2 days in a row');
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('solitaire.daily') ?? '{}'));
    expect(Object.keys(log).sort()).toEqual(['2026-11-19', DAY]);
  });
});
