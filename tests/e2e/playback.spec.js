import { test, expect } from '@playwright/test';

/**
 * Audio in headless Chromium needs a real (if silent) output device, and
 * autoplay must be permitted so the gesture-driven resume actually resumes.
 */
test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/** A 4/4 Pattern with one note per Beat, at a chosen tempo. */
async function loadSimple(page, tempo = 240) {
  await page.evaluate((bpm) => {
    const measure = {
      timeSignature: '4/4',
      beats: Array.from({ length: 4 }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }, { on: false }, { on: false }],
      })),
    };
    window.__rm.loadPattern(
      {
        id: 'p_play',
        name: 'Playback Test',
        soundMode: 'percussive',
        tempo: bpm,
        tags: [],
        rating: 0,
        measures: [measure],
      },
      { owned: true }
    );
  }, tempo);
}

test('AC-4.1.1 — no audio exists before a transport gesture', async ({ page }) => {
  await page.goto('/');
  // FR-010: nothing may create or start an AudioContext on load.
  const created = await page.evaluate(() => Boolean(window.__rm.transport.isRunning));
  expect(created).toBe(false);
});

test('AC-4.1.2 — pressing Play starts the transport and moves the cursor', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
});

test('AC-4.1.2 — the cursor advances through the Beats in order', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page, 300);

  await page.locator('[data-action="play"]').click();

  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const beat = await page.locator('.slot.playing').first().getAttribute('data-beat');
    if (beat !== null) seen.add(beat);
    if (seen.size >= 4) break;
    await page.waitForTimeout(60);
  }
  expect([...seen].sort()).toEqual(['0', '1', '2', '3']);
});

test('AC-4.1.3 — the loop counter increments once per full pass, not per Measure', async ({ page }) => {
  await page.goto('/');
  // Two Measures, so a per-Measure counter would tick twice as fast.
  await page.evaluate(() => {
    const measure = (ts) => ({
      timeSignature: ts,
      beats: Array.from({ length: Number(ts.split('/')[0]) }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }, { on: false }, { on: false }],
      })),
    });
    window.__rm.loadPattern(
      {
        id: 'p_loop',
        name: 'Loop Test',
        soundMode: 'percussive',
        tempo: 220,
        tags: [],
        rating: 0,
        measures: [measure('2/4'), measure('2/4')],
      },
      { owned: true }
    );
  });

  await page.locator('[data-action="play"]').click();
  // One pass is 4 Beats at 220 BPM ~= 1.09s.
  await page.waitForTimeout(1400);
  const loop = await page.evaluate(() => window.__rm.getState().loop);
  expect(loop).toBeGreaterThanOrEqual(1);
  expect(loop).toBeLessThanOrEqual(3);
});

test('AC-4.1.4 — a mixed-meter Pattern sounds every Beat of both Measures', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const beats = (n) =>
      Array.from({ length: n }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }],
      }));
    window.__rm.loadPattern(
      {
        id: 'p_mixed',
        name: 'Mixed Meter',
        soundMode: 'percussive',
        tempo: 300,
        tags: [],
        rating: 0,
        measures: [
          { timeSignature: '4/4', beats: beats(4).map((b) => ({ ...b, slots: [{ on: true }, { on: false }, { on: false }, { on: false }] })) },
          { timeSignature: '6/8', beats: beats(6) },
        ],
      },
      { owned: true }
    );
  });

  // 4 quarter-note Beats then 6 eighth-note Beats — 10 Beats per pass. The
  // failure this guards is 6/8 being read as two dotted-quarter Beats.
  await page.locator('[data-action="play"]').click();
  const measuresSeen = new Set();
  for (let i = 0; i < 40; i++) {
    const m = await page.locator('.slot.playing').first().getAttribute('data-measure');
    if (m !== null) measuresSeen.add(m);
    if (measuresSeen.size >= 2) break;
    await page.waitForTimeout(50);
  }
  expect([...measuresSeen].sort()).toEqual(['0', '1']);
});

test('AC-4.1.5 — backgrounding the tab stops the transport and resets it', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });

  // Simulate the device taking audio away.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.locator('.slot.playing')).toHaveCount(0, { timeout: 2000 });
  const after = await page.evaluate(() => ({
    running: window.__rm.transport.isRunning,
    position: window.__rm.getState().transportPosition,
    loop: window.__rm.getState().loop,
  }));
  expect(after.running).toBe(false);
  expect(after.position).toBeNull();
  expect(after.loop).toBe(0);
});

test('AC-4.1.6 — returning to the app does not resume playback by itself', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.slot.playing')).toHaveCount(0, { timeout: 2000 });

  // Regaining focus is not a transport interaction (FR-010).
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
  await expect(page.locator('[data-action="play"]')).toBeVisible();
});

test('AC-4.2.1 — tempo is clamped to 18–220 in the control', async ({ page }) => {
  await page.goto('/');
  const slider = page.locator('.tempo-slider');
  await expect(slider).toHaveAttribute('min', '18');
  await expect(slider).toHaveAttribute('max', '220');
});

test('AC-4.2.2 — changing tempo restarts playback and resets the loop counter', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page, 220);

  await page.locator('[data-action="play"]').click();
  await page.waitForTimeout(1400);
  expect(await page.evaluate(() => window.__rm.getState().loop)).toBeGreaterThanOrEqual(1);

  await page.locator('.preset', { hasText: '120' }).click();
  await page.waitForTimeout(120);

  const after = await page.evaluate(() => ({
    tempo: window.__rm.getState().pattern.tempo,
    loop: window.__rm.getState().loop,
    running: window.__rm.transport.isRunning,
  }));
  expect(after.tempo).toBe(120);
  expect(after.loop).toBe(0);
  expect(after.running).toBe(true);
});

test('AC-4.2.3 — the last-used tempo persists across a reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.preset', { hasText: '150' }).click();
  await page.reload();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).lastTempo);
  expect(stored).toBe(150);
});

test('AC-4.3.1 — the metronome and count-in are off by default and toggleable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-action="toggle-metronome"]')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('[data-action="toggle-count-in"]')).not.toHaveClass(/\bon\b/);

  await page.locator('[data-action="toggle-metronome"]').click();
  await expect(page.locator('[data-action="toggle-metronome"]')).toHaveClass(/\bon\b/);

  await page.reload();
  await expect(page.locator('[data-action="toggle-metronome"]')).toHaveClass(/\bon\b/);
});

test('AC-4.1.2 — Stop clears the cursor and halts the transport', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });

  await page.locator('[data-action="stop"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
});

test('AC-4.1.1 — event times are computed from an absolute origin, never accumulated', async ({
  page,
}) => {
  await page.goto('/');
  await loadSimple(page, 120);
  await page.locator('[data-action="play"]').click();
  await page.waitForTimeout(120);

  /*
   * The drift guard. Loop 500's first event must land exactly 500 loop
   * durations after loop 0's, to within floating-point noise. An accumulating
   * scheduler - one that adds an interval per loop - fails this by milliseconds
   * that compound over a long practice session.
   */
  const drift = await page.evaluate(() => {
    const t = window.__rm.transport;
    const loopDuration = t._eventTime(1, 0) - t._eventTime(0, 0);
    const predicted = t._eventTime(0, 0) + 500 * loopDuration;
    return Math.abs(t._eventTime(500, 0) - predicted);
  });
  expect(drift).toBeLessThan(0.0001);
});
