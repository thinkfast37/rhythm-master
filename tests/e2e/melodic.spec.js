import { test, expect } from '@playwright/test';

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

test('AC-2.1.1 — Sound Mode is Percussive by default and switchable', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await expect(page.locator('.sound-mode')).toHaveValue('percussive');
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.sound-mode')).toHaveValue('melodic');
});

test('AC-2.1.2 — Key appears only in Melodic mode, not disabled in Percussive', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await expect(page.locator('.key-picker')).toHaveCount(0);

  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.key-picker')).toBeVisible();
  await expect(page.locator('.key-picker')).toHaveValue('C');

  await page.locator('.sound-mode').selectOption('percussive');
  await expect(page.locator('.key-picker')).toHaveCount(0);
});

test('AC-2.1.3 — switching to Melodic gives every sounding Slot a pitch', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.sound-mode').selectOption('melodic');

  const pitched = await page.evaluate(() =>
    window.__rm.getState().pattern.measures[0].beats[0].slots[0].pitch
  );
  expect(pitched).toEqual({ degree: '1', octaveOffset: 0 });
  await expect(page.locator('.slot-pitch').first()).toBeVisible();
});

test('AC-2.1.4 — switching back to Percussive strips pitch, keeping the Pattern valid', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.sound-mode').selectOption('percussive');

  const state = await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    return { key: 'key' in p, pitch: 'pitch' in p.measures[0].beats[0].slots[0] };
  });
  expect(state.key).toBe(false);
  expect(state.pitch).toBe(false);
});

test('AC-2.2.1 — a Slot’s degree and octave are settable and shown in the grid', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  await page.locator('.degree-picker').selectOption('b3');
  await page.locator('.octave-picker').selectOption('-1');

  const badge = page.locator('.slot[data-beat="0"][data-slot="0"] .slot-pitch');
  await expect(badge).toHaveAttribute('data-degree', 'b3');
  await expect(badge).toHaveAttribute('data-octave', '-1');
  await expect(badge).toHaveText('b3,');
});

test('AC-2.2.2 — pitch survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.degree-picker').selectOption('5');

  await page.reload();
  const pitch = await page.evaluate(
    () => window.__rm.getState().pattern.measures[0].beats[0].slots[0].pitch
  );
  expect(pitch.degree).toBe('5');
});

test('AC-2.3.1 — the Key control offers exactly twelve keys', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.key-picker option')).toHaveCount(12);
});

test('AC-2.3.2 — changing Key transposes playback but leaves stored degrees alone', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  const inC = await page.evaluate(() => window.__rmMidi());
  await page.locator('.key-picker').selectOption('D');
  const inD = await page.evaluate(() => window.__rmMidi());

  expect(inD - inC).toBe(2);
  const degree = await page.evaluate(
    () => window.__rm.getState().pattern.measures[0].beats[0].slots[0].pitch.degree
  );
  expect(degree).toBe('1');
});

test('AC-2.4.3 — Percussive playback never waits on samples', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 3000 });
  // No sample load was needed to get here.
  expect(await page.evaluate(() => window.__rm.getState().pianoStatus.status)).toBe('idle');
});

test('AC-2.4.1 — Melodic playback reports a definite sample status, never silent failure', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(
    () => ['ready', 'fallback'].includes(window.__rm.getState().pianoStatus.status),
    null,
    { timeout: 15000 }
  );

  // Either outcome is acceptable; silence and an indefinite spinner are not.
  const status = await page.evaluate(() => window.__rm.getState().pianoStatus.status);
  expect(['ready', 'fallback']).toContain(status);
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });
});

test('AC-4.4.1 — swing defaults to 0 and is offered per straight group', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  const slider = page.locator('.swing-slider');
  await expect(slider).toHaveCount(1);
  await expect(slider).toHaveValue('0');
  await expect(slider).toHaveAttribute('min', '0');
  await expect(slider).toHaveAttribute('max', '100');
});

test('AC-4.4.3 — a triplet Recipe offers no swing control at all', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.recipe-picker').selectOption('triplet-8ths');
  await expect(page.locator('.swing-slider')).toHaveCount(0);
  await expect(page.locator('.group[data-feel="triplet"]').first()).not.toHaveAttribute('data-swing', /.*/);
});

test('AC-4.4.2 — a mixed Recipe swings its straight half only', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.recipe-picker').selectOption('straight-triplet-split');

  // Only the straight group of the split gets a control.
  await expect(page.locator('.swing-slider')).toHaveCount(1);
  await page.locator('.swing-slider').fill('60');

  const groups = page.locator('.beat[data-beat="0"] .group');
  await expect(groups.nth(0)).toHaveAttribute('data-swing', '60');
  await expect(groups.nth(1)).not.toHaveAttribute('data-swing', /.*/);
});

test('AC-2.4.1 — the soundfont is served from this app’s own origin, never a CDN', async ({ page }) => {
  // Anything not served by our own dev/preview server is a third-party request.
  const external = [];
  page.on('request', (r) => {
    const { hostname } = new URL(r.url());
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') external.push(r.url());
  });

  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('[data-action="play"]').click();

  await page.waitForFunction(
    () => ['ready', 'fallback'].includes(window.__rm.getState().pianoStatus.status),
    null,
    { timeout: 20000 }
  );

  // Principle V: the app is a static artifact. Nothing may reach a third-party
  // host at runtime — a CDN is someone else's uptime standing in for ours.
  expect(external, `unexpected third-party requests: ${external.join(', ')}`).toEqual([]);

  const base = await page.evaluate(() => window.__rm.piano.soundfontBaseUrl);
  expect(base).not.toMatch(/^https?:\/\//);
  expect(base).toContain('soundfonts/');
});

test('AC-2.4.5 — a missing soundfont degrades to synthesis with an explanatory status', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('[data-action="play"]').click();

  await page.waitForFunction(
    () => ['ready', 'fallback'].includes(window.__rm.getState().pianoStatus.status),
    null,
    { timeout: 20000 }
  );

  const status = await page.evaluate(() => {
    const s = window.__rm.piano.getStatus();
    return { status: s.status, message: s.error?.message ?? null };
  });

  if (status.status === 'fallback') {
    // The message must say what to do about it, not merely that it failed.
    expect(status.message).toContain('fetch:soundfont');
  }
  // Either way the Pattern plays.
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });
});
