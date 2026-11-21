/**
 * US-21.1 — the app notices a newer build and moves to it (research.md D-031).
 *
 * The app learns of a newer build by fetching a fresh copy of its own page and
 * reading the build stamp in it. Here that one request is answered by the test:
 * the real page, with its stamp rewritten to a later build, an older one, or
 * left alone — or the request refused. Everything else is the built app.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, loadFourBeats, composerState, appState } from './composer-helpers.js';

test.use(launch);

const NEWER = '2099-01-01 00:00:00 UTC (newer01)';
const NEWER_STILL = '2099-06-01 00:00:00 UTC (newer02)';
const OLDER = '2000-01-01 00:00:00 UTC (older00)';
const SAME = null;

const notice = (page) => page.locator('.update-notice');
const reload = (page) => notice(page).locator('.update-reload');
const dismiss = (page) => notice(page).locator('.update-dismiss');
const isFresh = (url) => new URL(url).searchParams.has('fresh');
const buildOf = (url) => new URL(url).searchParams.get('v');

/**
 * Answer the app's request for a fresh copy of its page. `server.answer` is the
 * stamp the copy carries (SAME leaves the page as built; 'fail' refuses the
 * request), and may be changed while the page is open. `server.asked` counts
 * the requests, `server.loads` lists every page load by the build it named.
 */
async function serve(page, answer = SAME) {
  const server = { answer, asked: 0, answered: 0, loads: [], hold: null };
  page.on('request', (request) => {
    // A page load, by the build it named. The server's own redirect to its base path is not a second one.
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && !request.redirectedFrom()) server.loads.push(buildOf(request.url()));
  });
  await page.route(
    (url) => isFresh(url.href),
    async (route) => {
      server.asked += 1;
      if (server.hold) await server.hold;
      if (server.answer === 'fail') {
        server.answered += 1;
        return route.abort('internetdisconnected');
      }
      try {
        const response = await route.fetch();
        let body = await response.text();
        if (server.answer) body = body.replace(/(<meta name="build-version" content=")[^"]*(")/, `$1${server.answer}$2`);
        await route.fulfill({ response, body });
      } catch {
        // The page that asked has gone — it moved to the newer build, or the test is over.
      }
      server.answered += 1;
      return undefined;
    }
  );
  return server;
}

/** The tab is shown again: the app asks once more, and the answer has arrived. */
async function showAgain(page, server) {
  const before = server.answered;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => server.answered).toBeGreaterThan(before);
}

/** Open the app on the build it was handed, the first check answered and done. */
async function openSettled(page, answer = SAME) {
  const server = await serve(page, answer);
  await openApp(page);
  await expect.poll(() => server.answered).toBe(1);
  return server;
}

/** Open, then have a newer build found: the notice is up. */
async function openWithNotice(page) {
  const server = await openSettled(page);
  server.answer = NEWER;
  await showAgain(page, server);
  await expect(notice(page)).toBeVisible();
  return server;
}

const stamp = (page) => page.evaluate(() => document.querySelector('meta[name="build-version"]').content);
const stores = (page) => page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));

// --- AC-21.1.1: on opening ------------------------------------------------------

test('AC-21.1.1/1 — On opening, the app asks its own address for a fresh copy of its page, past any kept copy, and when that copy is a newer build the app loads it without being asked', async ({ page }) => {
  const server = await serve(page, NEWER);
  const fresh = page.waitForRequest((request) => isFresh(request.url()));
  await page.goto('/');
  // Its own address, with a query no kept copy can answer: the time of asking.
  const request = await fresh;
  const asked = new URL(request.url());
  expect(asked.origin + asked.pathname).toBe(new URL(page.url()).origin + new URL(page.url()).pathname);
  expect(asked.searchParams.get('fresh')).toMatch(/^\d+$/);
  // Nothing was pressed: the page loads again, for the newer build.
  await expect.poll(() => server.loads).toEqual([null, 'newer01']);
  await expect(page.locator('.mode-switch')).toBeVisible();
});

test('AC-21.1.1/2 — The app moves by itself once per opening: a page loaded for a newer build does not move again by itself, and a build newer still is offered in the notice instead', async ({ page }) => {
  const server = await serve(page, NEWER);
  await page.goto('/');
  await expect.poll(() => server.loads).toEqual([null, 'newer01']);
  // The page it moved to asks too, and is told of one newer still.
  server.answer = NEWER_STILL;
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toContainText('A newer version is available');
  await expect.poll(() => server.answered).toBeGreaterThanOrEqual(2);
  // It does not go again without being told.
  await showAgain(page, server);
  expect(server.loads).toEqual([null, 'newer01']);
});

test('AC-21.1.1/3 — When the musician has already pressed a key or a button before the answer arrives, the newer build is offered in the notice instead of loaded', async ({ page }) => {
  const server = await serve(page, NEWER);
  let release;
  server.hold = new Promise((resolve) => {
    release = resolve;
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await expect.poll(() => server.asked).toBe(1);
  await page.keyboard.press('Shift');
  server.hold = null;
  release();
  await expect(notice(page)).toBeVisible();
  expect(server.loads).toEqual([null]);
});

// --- AC-21.1.2: while the app is open ---------------------------------------------

test('AC-21.1.2/1 — The app checks again each time its tab is shown again, and every five minutes while it stays shown', async ({ page }) => {
  await page.clock.install();
  const server = await serve(page);
  await openApp(page);
  await expect.poll(() => server.answered).toBe(1);
  // Shown again.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => server.answered).toBe(2);
  // Left showing: nothing for four minutes, then once at five, and again at ten.
  await page.clock.fastForward('04:00');
  expect(server.asked).toBe(2);
  await page.clock.fastForward('01:00');
  await expect.poll(() => server.answered).toBe(3);
  await page.clock.fastForward('05:00');
  await expect.poll(() => server.answered).toBe(4);
  // Hidden, it does not ask: neither on the change nor on the five minutes.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward('05:00');
  expect(server.asked).toBe(4);
});

test('AC-21.1.2/2 — A newer build found after opening shows the notice "A newer version is available" with Reload and Dismiss, and nothing loads until Reload is pressed', async ({ page }) => {
  const server = await openSettled(page);
  await expect(notice(page)).toHaveCount(0);
  server.answer = NEWER;
  await showAgain(page, server);
  await expect(notice(page).locator('.update-notice-text')).toHaveText('A newer version is available');
  await expect(reload(page)).toHaveText('Reload');
  await expect(dismiss(page)).toHaveText('Dismiss');
  // Asked again, and again: it waits.
  await showAgain(page, server);
  await showAgain(page, server);
  expect(server.loads).toEqual([null]);
  await reload(page).click();
  await expect.poll(() => server.loads).toEqual([null, 'newer01']);
});

test('AC-21.1.2/3 — The notice stops nothing: playback goes on while it shows, and the controls of the screen stay in use', async ({ page }) => {
  const server = await openSettled(page);
  await page.locator('.transport').click();
  await expect.poll(async () => (await appState(page)).isPlaying).toBe(true);
  server.answer = NEWER;
  await showAgain(page, server);
  await expect(notice(page)).toBeVisible();
  expect((await appState(page)).isPlaying).toBe(true);
  // The loop goes on round beneath it.
  const loop = (await appState(page)).loop;
  await expect.poll(async () => (await appState(page)).loop, { timeout: 15000 }).toBeGreaterThan(loop);
  // And the screen is still the musician's: stop, and change mode, with the notice up.
  await page.locator('.transport').click();
  await expect.poll(async () => (await appState(page)).isPlaying).toBe(false);
  await page.locator('.mode-switch [data-mode="arrange"]').click();
  await expect(page.locator('.arrange-panel')).toBeVisible();
  await expect(notice(page)).toBeVisible();
});

test('AC-21.1.2/4 — Dismiss hides the notice for that build, a build newer still shows it again, and nothing about it is stored', async ({ page }) => {
  const server = await openSettled(page);
  const before = await stores(page);
  server.answer = NEWER;
  await showAgain(page, server);
  await expect(notice(page)).toBeVisible();
  await dismiss(page).click();
  await expect(notice(page)).toHaveCount(0);
  // The same build, found again: still dismissed.
  await showAgain(page, server);
  await showAgain(page, server);
  await expect(notice(page)).toHaveCount(0);
  // One newer still: offered.
  server.answer = NEWER_STILL;
  await showAgain(page, server);
  await expect(notice(page)).toBeVisible();
  await dismiss(page).click();
  // The earlier one again is not newer than what was dismissed.
  server.answer = NEWER;
  await showAgain(page, server);
  await expect(notice(page)).toHaveCount(0);
  expect(await stores(page)).toBe(before);
});

// --- AC-21.1.3: Reload ------------------------------------------------------------

test('AC-21.1.3/1 — Reload loads an address that carries the commit of the newer build, so a kept copy of the page cannot be handed over again, and the address is tidied once the build has loaded', async ({ page }) => {
  const server = await openWithNotice(page);
  const plain = page.url();
  const loading = page.waitForRequest((request) => request.isNavigationRequest() && buildOf(request.url()) === 'newer01');
  await reload(page).click();
  const request = await loading;
  // The plain address, plus the commit and nothing else.
  const there = new URL(request.url());
  there.searchParams.delete('v');
  expect(there.href).toBe(plain);
  await expect(page.locator('.mode-switch')).toBeVisible();
  await expect.poll(() => page.url()).toBe(plain);
  expect(server.loads).toEqual([null, 'newer01']);
});

test('AC-21.1.3/2 — With unsaved work in the Composer, Reload asks first with the question leaving the Composer asks, and declining keeps the work, the build and the notice as they were', async ({ page }) => {
  const server = await openSettled(page);
  await loadFourBeats(page, 'Half done');
  expect(await page.evaluate(() => window.__rm.composerUnsaved())).toBe(true);
  const running = await stamp(page);
  server.answer = NEWER;
  await showAgain(page, server);
  await reload(page).click();
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog-message')).toHaveText('"Half done" has not been saved to the library yet. Leave anyway and lose it?');
  await page.locator('.dialog-button[data-value="false"]').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect((await composerState(page)).draft.name).toBe('Half done');
  expect(await page.evaluate(() => window.__rm.composerUnsaved())).toBe(true);
  expect(await stamp(page)).toBe(running);
  expect(server.loads).toEqual([null]);
  await expect(notice(page)).toBeVisible();
  // Agreeing goes.
  await reload(page).click();
  await page.locator('.dialog-button[data-value="true"]').click();
  await expect.poll(() => server.loads).toEqual([null, 'newer01']);
});

test('AC-21.1.3/3 — With an Arrangement that has never been saved, Reload asks first, and declining keeps the Arrangement, the build and the notice as they were', async ({ page }) => {
  const server = await openSettled(page);
  await page.locator('.mode-switch [data-mode="arrange"]').click();
  const panel = page.locator('.arrange-panel');
  await expect(panel).toBeVisible();
  await panel.locator('[data-action="arrange-add"]').click();
  if (!(await page.locator('.library .library-group-toggle[data-group="patterns"]').isVisible())) await page.locator('.library-toggle').click();
  await page.locator('.library .pattern-item[data-pattern-id="s_21"] [data-action="open-pattern"]').click();
  await expect(panel.locator('.arrange-palette-item[data-kind="pattern"][data-id="s_21"]')).toBeVisible();
  const arrangement = () => page.evaluate(() => JSON.stringify(window.__rm.getState().arrange.arrangement));
  const before = await arrangement();
  expect(JSON.parse(before).id ?? null).toBeNull();
  const running = await stamp(page);
  server.answer = NEWER;
  await showAgain(page, server);
  await reload(page).click();
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog-message')).toHaveText('Reload? The Arrangement here has not been saved and will be lost.');
  await page.locator('.dialog-button[data-value="false"]').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await arrangement()).toBe(before);
  expect(await stamp(page)).toBe(running);
  expect(server.loads).toEqual([null]);
  await expect(notice(page)).toBeVisible();
});

// --- AC-21.1.4: only forwards -----------------------------------------------------

test('AC-21.1.4/3 — A fetched copy that is the same build, or an older one, loads nothing and shows no notice', async ({ page }) => {
  // On opening: an older copy, as a part of the host that has not caught up would hand over.
  const server = await openSettled(page, OLDER);
  await expect(notice(page)).toHaveCount(0);
  expect(server.loads).toEqual([null]);
  // While open: older again, then the very same build.
  await showAgain(page, server);
  server.answer = SAME;
  await showAgain(page, server);
  await expect(notice(page)).toHaveCount(0);
  expect(server.loads).toEqual([null]);
  // And a page whose stamp cannot be read.
  server.answer = 'not a stamp';
  await showAgain(page, server);
  await expect(notice(page)).toHaveCount(0);
  expect(server.loads).toEqual([null]);
});

// --- AC-21.1.5: when it cannot check ----------------------------------------------

test('AC-21.1.5/1 — When the request fails, as it does offline, no notice shows, no error is raised, and the app works as before', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const server = await openSettled(page, 'fail');
  await showAgain(page, server);
  await expect(notice(page)).toHaveCount(0);
  expect(server.loads).toEqual([null]);
  // The app is as it was: it plays, and stops.
  await page.locator('.transport').click();
  await expect.poll(async () => (await appState(page)).isPlaying).toBe(true);
  await page.locator('.transport').click();
  await expect.poll(async () => (await appState(page)).isPlaying).toBe(false);
  expect(errors).toEqual([]);
  // Back in reach, it finds what is there.
  server.answer = NEWER;
  await showAgain(page, server);
  await expect(notice(page)).toBeVisible();
});

/** The tab is shown again and time is given for a request to be made: none must be. */
async function shownAgainAsksNothing(page, server) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(400);
  expect(server.asked).toBe(0);
}

test('AC-21.1.5/2 — A page that carries no build stamp, as a development server serves it, makes no request at all', async ({ page }) => {
  await page.clock.install();
  const server = await serve(page, NEWER);
  // The built page with its stamp taken out, which is the page a development server serves.
  await page.route(
    (url) => url.pathname.endsWith('/') && !isFresh(url.href),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/<meta name="build-version"[^>]*>/, '');
      await route.fulfill({ response, body });
    }
  );
  await openApp(page);
  expect(await page.evaluate(() => document.querySelector('meta[name="build-version"]'))).toBeNull();
  await shownAgainAsksNothing(page, server);
  await page.clock.fastForward('05:00');
  await shownAgainAsksNothing(page, server);
  await expect(notice(page)).toHaveCount(0);
  expect(server.loads).toEqual([null]);
});

test('AC-21.1.5/3 — Inside the store shell no request is made: a store build is updated by its store', async ({ page }) => {
  await page.clock.install();
  const server = await serve(page, NEWER);
  // The shell is known by the bridge it injects (src/billing/index.js).
  await page.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true };
  });
  await page.goto('/');
  await expect(page.locator('meta[name="build-version"]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => Boolean(window.__rm))).toBe(true);
  await shownAgainAsksNothing(page, server);
  await page.clock.fastForward('05:00');
  await shownAgainAsksNothing(page, server);
  await expect(notice(page)).toHaveCount(0);
  expect(server.loads).toEqual([null]);
});
