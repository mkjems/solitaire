// Turns the index.html template and a page's text (site/pages.ts) into that
// page's HTML, and lists all pages in a sitemap. Pure string work, no Vite.

import { AUTHOR, IMAGE_SIZE, type Page, SITE_URL } from './pages.ts';

/** Where the page's head tags go in index.html. */
export const HEAD_MARKER = '<!-- page:head -->';
/** Where the page's text goes in index.html. */
export const ABOUT_MARKER = '<!-- page:about -->';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const absolute = (path: string): string => SITE_URL + path;

/** The page that serves an address: `/da/?deal=4` is the Danish page. */
export function pageFor(url: string, pages: Page[]): Page {
  const path = url.split(/[?#]/)[0] ?? '/';
  const match = pages.find((page) => page.path !== '/' && (path === page.path || path + '/' === page.path));
  return match ?? (pages[0] as Page);
}

function head(page: Page, pages: Page[]): string {
  const url = absolute(page.path);
  const image = absolute(page.image);
  const data = {
    '@context': 'https://schema.org',
    '@type': ['VideoGame', 'WebApplication'],
    name: page.title.split(' – ')[0],
    alternateName: page.alternateName,
    url,
    description: page.description,
    image,
    genre: page.genre,
    gamePlatform: 'Web browser',
    playMode: 'SinglePlayer',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    inLanguage: page.lang,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
  };
  const meta = (key: 'name' | 'property', name: string, content: string) =>
    `<meta ${key}="${name}" content="${escapeHtml(content)}" />`;

  return [
    `<title>${escapeHtml(page.title)}</title>`,
    meta('name', 'description', page.description),
    `<link rel="canonical" href="${url}" />`,
    ...pages.map((other) => `<link rel="alternate" hreflang="${other.lang}" href="${absolute(other.path)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${absolute((pages[0] as Page).path)}" />`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', page.title.split(' – ')[0] ?? page.title),
    meta('property', 'og:title', page.shareTitle),
    meta('property', 'og:description', page.shareDescription),
    meta('property', 'og:url', url),
    meta('property', 'og:locale', page.locale),
    ...pages.filter((other) => other !== page).map((other) => meta('property', 'og:locale:alternate', other.locale)),
    meta('property', 'og:image', image),
    meta('property', 'og:image:width', String(IMAGE_SIZE.width)),
    meta('property', 'og:image:height', String(IMAGE_SIZE.height)),
    meta('property', 'og:image:alt', page.imageAlt),
    meta('name', 'twitter:card', 'summary_large_image'),
    // `<` is escaped so no text can close the script element early.
    `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
}

function about(page: Page): string {
  const { about: a } = page;
  const author = `<a href="${AUTHOR.url}">${escapeHtml(AUTHOR.name)}</a>`;
  return [
    `<section class="about" aria-labelledby="about-title">`,
    `  <h1 id="about-title">${escapeHtml(a.heading)}</h1>`,
    `  <p>${escapeHtml(a.intro)}</p>`,
    `  <h2>${escapeHtml(a.featuresHeading)}</h2>`,
    `  <ul>`,
    ...a.features.map((feature) => `    <li>${escapeHtml(feature)}</li>`),
    `  </ul>`,
    `  <h2>${escapeHtml(a.howHeading)}</h2>`,
    ...a.how.map((paragraph) => `  <p>${escapeHtml(paragraph)}</p>`),
    `  <h2>${escapeHtml(a.keysHeading)}</h2>`,
    `  <p>${escapeHtml(a.keys)}</p>`,
    `  <p>${escapeHtml(a.madeBy).replace('{author}', author)}</p>`,
    `</section>`,
  ].join('\n    ');
}

/**
 * One page's HTML from the template. Pages other than the default also tell the
 * game which language to open in (`data-game-language`); the default page
 * follows the browser's language.
 */
export function renderPage(template: string, page: Page, pages: Page[]): string {
  for (const marker of [HEAD_MARKER, ABOUT_MARKER]) {
    if (!template.includes(marker)) throw new Error(`index.html is missing ${marker}`);
  }
  const fixed = page === pages[0] ? '' : ` data-game-language="${page.lang}"`;
  return template
    .replace(/<html lang="[^"]*"/, `<html lang="${page.lang}"${fixed}`)
    .replace(HEAD_MARKER, head(page, pages))
    .replace(ABOUT_MARKER, about(page));
}

/** A sitemap listing every page, each with its translations. */
export function renderSitemap(pages: Page[], lastmod: string): string {
  const alternates = pages
    .map((other) => `    <xhtml:link rel="alternate" hreflang="${other.lang}" href="${absolute(other.path)}" />`)
    .join('\n');
  const urls = pages.map(
    (page) => `  <url>\n    <loc>${absolute(page.path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alternates}\n  </url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
