// A Vite plugin that builds one static page per language from index.html.
//
// While developing, the dev server fills in the page for the address asked for
// (/ or /da/). In a build, the finished index.html (with its hashed script and
// style links) is the template: it becomes the default page, every other
// language is written to <lang>/index.html, and sitemap.xml lists them all.

import type { Plugin } from 'vite';
import { PAGES } from './pages';
import { pageFor, renderPage, renderSitemap } from './render';

export function staticPages(): Plugin {
  return {
    name: 'static-pages',
    enforce: 'post',

    transformIndexHtml(html, ctx) {
      // In a build the template is kept whole, for generateBundle below.
      if (!ctx.server) return html;
      return renderPage(html, pageFor(ctx.originalUrl ?? '/', PAGES), PAGES);
    },

    generateBundle(_, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset') throw new Error('static-pages: the build has no index.html');
      const template = String(index.source);
      for (const page of PAGES) {
        const html = renderPage(template, page, PAGES);
        if (page.path === '/') index.source = html;
        else this.emitFile({ type: 'asset', fileName: `${page.path.slice(1)}index.html`, source: html });
      }
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(PAGES, today) });
    },
  };
}
