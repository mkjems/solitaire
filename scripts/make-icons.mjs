// Renders the app icon (art/icon.svg) to the PNG sizes phones and browsers need.
// Uses the Chromium that the browser tests already install.
//
// Run with: npm run icons

import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await readFile(new URL('../art/icon.svg', import.meta.url), 'utf8');
const sizes = [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/apple-touch-icon.png', 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of sizes) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
console.log(`Rendered ${sizes.length} icons into public/icons`);
