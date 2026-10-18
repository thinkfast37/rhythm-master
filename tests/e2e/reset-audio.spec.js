import { test, expect } from '@playwright/test';

/**
 * Reset audio (AC-4.1.16). Sound can die below the page — Safari's audio for a web
 * app — where only quitting the app brings it back, so the action replaces the
 * context inside the press and says so plainly when even that has not worked.
 */
test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/**
 * Every context the app makes is recorded, with the oscillators started on it, and
 * its clock can be frozen — a context that reports running while no time passes,
 * which is what the stuck state looks like from the page.
 */
async function withRecordedContexts(page) {
  await page.addInitScript(() => {
    const Real = window.AudioContext;
    window.__contexts = [];
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args);
        this.oscillatorsStarted = 0;
        window.__contexts.push(this);
      }
      get currentTime() {
        return window.__freezeClock ? 0 : super.currentTime;
      }
      createOscillator() {
        const osc = super.createOscillator();
        osc.addEventListener?.('ended', () => {});
        this.oscillatorsStarted += 1;
        return osc;
      }
    };
  });
}

async function loadSimple(page) {
  await page.evaluate(() => {
    const measure = {
      timeSignature: '4/4',
      beats: Array.from({ length: 4 }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }, { on: false }, { on: false }],
      })),
    };
    window.__rm.loadPattern(
      { id: 'p_reset', name: 'Reset Test', soundMode: 'percussive', tempo: 240, tags: [], rating: 0, measures: [measure] },
      { owned: true }
    );
  });
}

const actions = (page) => page.locator('details[data-section="actions"]');

async function openActions(page) {
  const section = actions(page);
  if ((await section.getAttribute('open')) === null) await section.locator('> summary').click();
}

test('AC-4.1.16/1 — A Reset audio action sits in Pattern actions, ahead of Delete', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);
  await openActions(page);

  const reset = actions(page).locator('[data-action="reset-audio"]');
  await expect(reset).toBeVisible();
  await expect(reset).toHaveText('Reset audio');
  const order = await actions(page).locator('button.action').evaluateAll((bs) => bs.map((b) => b.dataset.action));
  expect(order.indexOf('reset-audio')).toBeGreaterThan(-1);
  expect(order.indexOf('reset-audio')).toBeLessThan(order.indexOf('delete-pattern'));
  expect(order[order.length - 1]).toBe('delete-pattern');
});

test('AC-4.1.16/2 — Pressing it stops playback, replaces the context inside the press without waiting on the old one to close, and sounds a confirmation note on the replacement', async ({ page }) => {
  await withRecordedContexts(page);
  await page.goto('/');
  await loadSimple(page);
  await page.locator('[data-action="play"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  await openActions(page);

  // The old context's close() never settles: the replacement must not wait on it.
  await page.evaluate(() => {
    const old = window.__contexts[window.__contexts.length - 1];
    old.close = () => new Promise(() => {});
  });
  const before = await page.evaluate(() => window.__contexts.length);

  await actions(page).locator('[data-action="reset-audio"]').click();

  await expect.poll(() => page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
  const after = await page.evaluate(() => {
    const fresh = window.__contexts[window.__contexts.length - 1];
    return { count: window.__contexts.length, state: fresh.state, oscillators: fresh.oscillatorsStarted };
  });
  expect(after.count).toBe(before + 1);
  expect(after.state).toBe('running');
  expect(after.oscillators).toBeGreaterThan(0);
});

test("AC-4.1.16/3 — When the replacement's clock still is not running, a message says to quit and reopen the app, and a reset that works shows no message", async ({ page }) => {
  await withRecordedContexts(page);
  await page.goto('/');
  await loadSimple(page);
  await openActions(page);
  const notice = actions(page).locator('.audio-notice');

  // A reset that works: no message.
  await actions(page).locator('[data-action="reset-audio"]').click();
  await page.waitForTimeout(600);
  await expect(notice).toHaveCount(0);

  // A replacement whose clock never moves: the quit message, as a status.
  await page.evaluate(() => (window.__freezeClock = true));
  await openActions(page);
  await actions(page).locator('[data-action="reset-audio"]').click();
  await expect(notice).toBeVisible({ timeout: 2000 });
  await expect(notice).toHaveAttribute('role', 'status');
  await expect(notice).toContainText(/quit/i);
  await expect(notice).toContainText('⌘Q');
  await expect(notice).toContainText(/reopen/i);

  // Sound comes back: the next reset that works clears it.
  await page.evaluate(() => (window.__freezeClock = false));
  await openActions(page);
  await actions(page).locator('[data-action="reset-audio"]').click();
  await expect(notice).toHaveCount(0, { timeout: 2000 });
});
