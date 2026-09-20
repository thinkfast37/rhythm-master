import { defineConfig } from '@playwright/test';

// Chromium is pre-installed in the dev container; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
// (see .npmrc) stops npm postinstall from fetching another copy.
export default defineConfig({
  testDir: 'tests/e2e',
  reporter: [['list'], ['json', { outputFile: 'tests/.playwright-report.json' }]],
  use: {
    baseURL: 'http://localhost:4173',
    /*
     * Every context opens in Lab (US-14.1). The suite was written against the
     * cockpit, and Lab is the cockpit, remembered; a first launch shows the
     * goals screen instead (AC-14.1.1/4), which tests/e2e/goals.spec.js
     * exercises with an empty storage state of its own.
     */
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [{ name: 'rm.settings.v1', value: JSON.stringify({ schemaVersion: 1, goal: 'lab' }) }],
        },
      ],
    },
    /*
     * Use the Chromium already present in the container rather than letting
     * Playwright download its own. The bundled revision moves with the
     * @playwright/test version, so pin the path instead of the build number
     * where one is provided.
     */
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
