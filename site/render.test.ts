import { describe, expect, it } from 'vitest';
import template from '../index.html?raw';
import { PAGES, type Page } from './pages';
import { pageFor, renderPage, renderSitemap } from './render';
const [en, da] = PAGES as [Page, Page];

/** The parts of a rendered page that search engines and link previews read. */
function read(html: string) {
  const attr = (pattern: RegExp) => html.match(pattern)?.[1];
  const ld = attr(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return {
    lang: attr(/<html lang="([^"]*)"/),
    gameLanguage: attr(/data-game-language="([^"]*)"/),
    title: attr(/<title>([^<]*)<\/title>/),
    description: attr(/<meta name="description" content="([^"]*)"/),
    canonical: attr(/<link rel="canonical" href="([^"]*)"/),
    alternates: [...html.matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)"/g)].map((m) => `${m[1]} ${m[2]}`),
    data: ld ? (JSON.parse(ld) as Record<string, unknown>) : undefined,
    heading: attr(/<h1[^>]*>([^<]*)<\/h1>/),
  };
}

describe('static pages', () => {
  it('keeps titles and descriptions short enough to show in full in search results', () => {
    for (const page of PAGES) {
      expect(page.title.length, page.lang).toBeLessThanOrEqual(60);
      expect(page.description.length, page.lang).toBeLessThanOrEqual(155);
      expect(page.path === '/' || page.path === `/${page.lang}/`, page.lang).toBe(true);
    }
    expect(en.path).toBe('/');
  });

  it('writes each page in its own language, pointing to the others', () => {
    for (const page of PAGES) {
      const html = renderPage(template, page, PAGES);
      const seen = read(html);
      expect(seen.lang).toBe(page.lang);
      expect(seen.title).toBe(page.title.replace(/&/g, '&amp;'));
      expect(seen.canonical).toBe(`https://solitaire.mkjems.dk${page.path}`);
      expect(seen.alternates).toEqual([
        'en https://solitaire.mkjems.dk/',
        'da https://solitaire.mkjems.dk/da/',
        'x-default https://solitaire.mkjems.dk/',
      ]);
      expect(seen.data?.inLanguage).toBe(page.lang);
      expect(html).toContain(`<meta property="og:image" content="https://solitaire.mkjems.dk${page.image}" />`);
      expect(seen.heading).toBe(page.about.heading);
      expect(html).not.toContain('<!-- page:');
    }
  });

  it('opens the game in the page language, except on the main page', () => {
    expect(read(renderPage(template, en, PAGES)).gameLanguage).toBeUndefined();
    expect(read(renderPage(template, da, PAGES)).gameLanguage).toBe('da');
    expect(read(renderPage(template, da, PAGES)).description).toBe(da.description);
  });

  it('gives each language a link preview image of its own that exists', () => {
    const images = Object.keys(import.meta.glob('../public/*.{jpg,png}'));
    for (const page of PAGES) expect(images, page.lang).toContain(`../public${page.image}`);
    expect(new Set(PAGES.map((page) => page.image)).size).toBe(PAGES.length);
  });

  it('finds the page for an address', () => {
    expect(pageFor('/', PAGES)).toBe(en);
    expect(pageFor('/?deal=4', PAGES)).toBe(en);
    expect(pageFor('/da/', PAGES)).toBe(da);
    expect(pageFor('/da', PAGES)).toBe(da);
    expect(pageFor('/da/?deal=4&lang=en', PAGES)).toBe(da);
    expect(pageFor('/dansk', PAGES)).toBe(en);
  });

  it('escapes text so it cannot break the page', () => {
    const tricky: Page = { ...da, title: 'A "B" & <C>', description: '</script><b>' };
    const html = renderPage(template, tricky, [en, tricky]);
    expect(html).toContain('<title>A &quot;B&quot; &amp; &lt;C&gt;</title>');
    expect(html).not.toContain('</script><b>');
  });

  it('lists every page and its translations in the sitemap', () => {
    const xml = renderSitemap(PAGES, '2026-11-16');
    expect(xml.match(/<loc>/g)).toHaveLength(PAGES.length);
    expect(xml).toContain('<loc>https://solitaire.mkjems.dk/da/</loc>');
    expect(xml.match(/hreflang=/g)).toHaveLength(PAGES.length * PAGES.length);
  });
});
