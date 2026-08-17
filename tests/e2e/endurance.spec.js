import { test, expect } from '@playwright/test';

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/**
 * SC-002 — "it survives a long session".
 *
 * The real criterion is a 30-minute continuous run holding time from start to
 * finish. That is impractical in CI, so this asserts the property that makes it
 * true: scheduled times are computed from an absolute origin, so the error at
 * loop N is independent of N. The 500-loop check in playback.spec.js covers the
 * same guarantee at the scheduler's own API.
 *
 * Run the full 30 minutes by hand before release — quickstart.md V7.
 */
test('SC-002 — timing holds over a long run and the transport never degrades', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.slot[data-beat="2"][data-slot="0"]').click();

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 5000 });

  // 30 seconds of real playback — long enough for accumulated error to show.
  await page.waitForTimeout(30_000);

  const result = await page.evaluate(() => {
    const t = window.__rm.transport;
    const loopDuration = t._eventTime(1, 0) - t._eventTime(0, 0);
    const projected = 30 * 60; // seconds in the full 30-minute run
    const loops = Math.ceil(projected / loopDuration);
    const predicted = t._eventTime(0, 0) + loops * loopDuration;
    return {
      running: t.isRunning,
      loop: window.__rm.getState().loop,
      driftAtThirtyMinutes: Math.abs(t._eventTime(loops, 0) - predicted),
    };
  });

  expect(result.running).toBe(true);
  expect(result.loop).toBeGreaterThan(0);
  // Error at the 30-minute mark is floating-point noise, not accumulated lag.
  expect(result.driftAtThirtyMinutes).toBeLessThan(0.001);

  // Still responsive at the end, not stalled.
  await page.locator('[data-action="stop"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(0);
});
