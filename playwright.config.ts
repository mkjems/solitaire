import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4317' },
  webServer: {
    // A port of its own, always freshly built, so a preview server left running
    // for phone testing is never mistaken for the build under test.
    command: 'npm run build && npm run preview -- --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'phone-landscape', use: { ...devices['Pixel 7 landscape'] } },
  ],
});
