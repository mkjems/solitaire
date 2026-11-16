// Builds the card images the game serves (public/cards) from the source art (art/).
//
// The source deck is kept untouched. This script applies the game's styling:
//   - a warm paper tone and a soft edge in place of pure white with a black outline
//   - deeper red, softer black and richer court-card colours
//   - removal of the source site's name from the ace of spades
//   - the card back in each of the colours players can choose
//
// It also builds a large-print set (public/cards/large) for small screens:
// a big rank and suit in the top corners, where they stay visible when the
// cards are fanned, and below them one large suit or, for court cards, the
// upper half of the picture, enlarged (the lower half only mirrors it).
//
// Run with: npm run cards

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const source = new URL('../art/deck/', import.meta.url);
const backSource = new URL('../art/back.svg', import.meta.url);
const target = new URL('../public/cards/', import.meta.url);
const largeTarget = new URL('../public/cards/large/', import.meta.url);

const EDGE_BEFORE =
  '<rect width="239" height="335" x="-119.5" y="-167.5" rx="12" ry="12" fill="white" stroke="black"></rect>';
const EDGE_AFTER =
  '<rect width="239" height="335" x="-119.5" y="-167.5" rx="12" ry="12" fill="#fffdf7" stroke="#a8a091" stroke-width="1.5"></rect>';

const COLOURS = [
  ['"red"', '"#c2202b"'],
  ['"black"', '"#17171b"'],
  ['"#44F"', '"#2f4fa8"'],
  ['"#FC4"', '"#e8bd4f"'],
];

const FACE = /^[A2-9TJQK][SHDC]\.svg$/;

/** Size and position of the half court picture in the large-print faces. */
const COURT = { scale: 1.58, bottom: 158, halfWidth: 70 };

/** The large-print version of a styled face. */
function largePrint(id, svg) {
  const rank = id[0];
  const suit = id[1];
  const defs = svg.match(/<defs>[\s\S]*<\/defs>/)?.[0];
  if (!defs) throw new Error(`${id}: no <defs>`);

  const parts = [
    EDGE_AFTER,
    // Rank, top left.
    `<use xlink:href="#V${suit}${rank}" x="-112" y="-161" width="82" height="82"></use>`,
    // Suit, top right.
    `<use xlink:href="#S${suit}${rank}" x="34" y="-157" width="76" height="76"></use>`,
  ];

  if ('JQK'.includes(rank)) {
    // Only the upper half of the court picture (the lower half is its mirror
    // image), enlarged and rising from the bottom edge of the card.
    const upper = svg.match(
      new RegExp(`<use (?!transform)[^>]*xlink:href="#${suit}${rank}\\d"[^>]*></use>`, 'g'),
    );
    if (!upper || upper.length < 3) throw new Error(`${id}: court picture not found`);
    const { scale, bottom, halfWidth: w } = COURT;
    // The half picture spans x -82.4..82.4 and y -130.4..0 before scaling;
    // its outer edges hold only ornament, so they are trimmed to `halfWidth`.
    parts.push(
      `<clipPath id="half"><rect x="${-w}" y="-130.4" width="${2 * w}" height="130.4"></rect></clipPath>`,
      `<g transform="translate(0 ${bottom}) scale(${scale})">` +
        `<g clip-path="url(#half)">${upper.join('')}</g>` +
        `<path d="M${-w} 0V-130.4H${w}V0" fill="none" stroke="#2f4fa8" stroke-width="${1.6 / scale}"></path>` +
        `</g>`,
    );
  } else {
    // One large suit.
    parts.push(`<use xlink:href="#S${suit}${rank}" x="-78" y="-22" width="156" height="156"></use>`);
  }

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="card" face="${id}" height="3.5in" preserveAspectRatio="none" viewBox="-120 -168 240 336" width="2.5in">` +
    defs +
    parts.join('') +
    '</svg>'
  );
}

await mkdir(largeTarget, { recursive: true });

let count = 0;
for (const name of await readdir(source)) {
  if (!FACE.test(name)) continue; // skip jokers and the source backs

  let svg = await readFile(new URL(name, source), 'utf8');
  if (!svg.includes(EDGE_BEFORE)) throw new Error(`${name}: card edge not found`);
  svg = svg.replace(EDGE_BEFORE, EDGE_AFTER);
  for (const [from, to] of COLOURS) svg = svg.replaceAll(from, to);
  svg = svg.replace(/<text[^>]*>[^<]*<\/text>/g, '');

  await writeFile(new URL(name, target), svg);
  await writeFile(new URL(name, largeTarget), largePrint(name.slice(0, 2), svg));
  count++;
}

if (count !== 52) throw new Error(`Expected 52 card faces, found ${count}`);

// The card back in each of its colours. The source is navy; the others swap
// its panel gradient and medallion for their own colours (the gold stays).
const back = await readFile(backSource, 'utf8');
const NAVY = ['#1d3670', '#11234e', '#0a1634', '#0c1a3d'];
const BACKS = {
  navy: NAVY,
  burgundy: ['#7e2536', '#5a1725', '#360b15', '#3f0e19'],
  emerald: ['#1f6c46', '#144a30', '#0a2d1c', '#0c3421'],
  black: ['#3b3b40', '#232326', '#0f0f11', '#151517'],
};
for (const [name, colours] of Object.entries(BACKS)) {
  let svg = back;
  NAVY.forEach((from, i) => {
    if (!svg.includes(from)) throw new Error(`back.svg: colour ${from} not found`);
    svg = svg.replaceAll(from, colours[i]);
  });
  await writeFile(new URL(`back-${name}.svg`, target), svg);
}
// The plain name too, for anything that still asks for it.
await writeFile(new URL('back.svg', target), back);
console.log(
  `Prepared ${count} card faces, ${count} large-print faces and ${Object.keys(BACKS).length} card backs in public/cards`,
);
