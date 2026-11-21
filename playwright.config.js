import { defineConfig } from '@playwright/test';

// The preview server's port. 4173 unless E2E_PORT says otherwise, so that two
// checkouts on one machine can each run the suite against their own build
// rather than one waiting on, or silently reusing, the other's server.
const PORT = Number(process.env.E2E_PORT) || 4173;
const ORIGIN = `http://localhost:${PORT}`;

// Chromium is pre-installed in the dev container; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
// (see .npmrc) stops npm postinstall from fetching another copy.
export default defineConfig({
  testDir: 'tests/e2e',
  reporter: [['list'], ['json', { outputFile: 'tests/.playwright-report.json' }]],
  use: {
    baseURL: ORIGIN,
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
          origin: ORIGIN,
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
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
