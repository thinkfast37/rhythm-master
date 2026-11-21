import { execFileSync } from 'node:child_process';
import { defineConfig } from '@playwright/test';

/*
 * The port the suite builds and serves on (T518). `E2E_PORT` names one; left
 * unset, a free port is asked of the operating system, so several sessions can
 * run the suite on one machine at once without meeting on a shared number.
 *
 * Playwright loads this file again in every worker process. The chosen port is
 * therefore written back to the environment the workers inherit: a second
 * probe would hand each worker a port nothing is listening on.
 */
function freePort() {
  const probe =
    "const s=require('node:net').createServer();" +
    "s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();});";
  return execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8' }).trim();
}
process.env.E2E_PORT ||= freePort();
const PORT = Number(process.env.E2E_PORT);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`E2E_PORT must be a port number, got "${process.env.E2E_PORT}"`);
}
const ORIGIN = `http://localhost:${PORT}`;

// Chromium is pre-installed in the dev container; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
// (see .npmrc) stops npm postinstall from fetching another copy.
export default defineConfig({
  testDir: 'tests/e2e',
  /*
   * Tests in one file run in parallel, and a shard is a share of the tests
   * rather than a share of the files (T518). Split by file, one shard drew the
   * slowest files and took eight minutes while the other three took two to
   * five. Every test opens its own page on its own storage, and no file keeps
   * state between its tests, which is what makes this safe.
   */
  fullyParallel: true,
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
    // --strictPort: a taken port fails the run rather than serving on the next one up.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: ORIGIN,
    /*
     * Never a server that was already there (T518). One left running by another
     * session serves that session's build, and the suite then passes or fails
     * on code this checkout does not contain.
     */
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
