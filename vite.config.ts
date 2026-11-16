import { defineConfig } from 'vitest/config';
import { staticPages } from './site/plugin';

export default defineConfig({
  // Served from the root of its own domain. Paths start at the root so that the
  // pages in other languages (/da/) find the same scripts, cards and icons.
  base: '/',
  build: { target: 'es2022' },
  plugins: [staticPages()],
  test: {
    include: ['src/**/*.test.ts', 'site/**/*.test.ts'],
  },
});
