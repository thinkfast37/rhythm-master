import { defineConfig } from '@playwright/test';

// Chromium is pre-installed in the dev container; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
// (see .npmrc) stops npm postinstall from fetching another copy.
export default defineConfig({
  testDir: 'tests/e2e',
  reporter: [['list'], ['json', { outputFile: 'tests/.playwright-report.json' }]],
  use: {
    baseURL: 'http://localhost:4173',
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
