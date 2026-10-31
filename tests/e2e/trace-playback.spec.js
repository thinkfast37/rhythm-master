/**
 * The swing control, counting, the accent tap cycle and Sound Mode loading, each
 * proved as its criterion is written, on the real grid (US-4.4, US-5.6, US-3.1,
 * US-2.4).
 *
 * Patterns are built with the app's own pure functions and handed to the
 * `window.__rm.loadPattern` seam; everything the criteria are about — a tap, a
 * picker, Play — then goes through the DOM. Expected labels come from
 * `core/counting.measureLabels`, the one function the grid itself renders from.
 */
import { test, expect } from '@playwright/test';
import { create, cycleAccent, setRecipe, addMeasure, setTimeSignature } from '../../src/core/pattern.js';
import { measureLabels } from '../../src/core/counting.js';

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/** The workbench is tabbed at every width (AC-15.1.7): one group on screen at a time. */
const onTab = (page, name) => page.locator(`.workbench-tab[data-tab="${name}"]`).click();

/** Load a Pattern built in Node, as an owned Pattern, and wait for its grid. */
async function load(page, pattern, id) {
  await page.evaluate(([p, pid]) => window.__rm.loadPattern({ ...p, id: pid }, { owned: true }), [pattern, id]);
  await expect(page.locator('.grid .measure')).toHaveCount(pattern.measures.length);
}

/** Every grid cell's counting label, in reading order. */
const gridLabels = (page) =>
  page.locator('.grid .slot .slot-label').evaluateAll((els) => els.map((e) => e.dataset.syllable));

/** What the grid must show for a Pattern in one counting system. */
const expected = (pattern, system) => pattern.measures.flatMap((m) => measureLabels(m, system).flat());

/** Apply a Recipe to one Beat through the Recipe strip, then disarm (AC-1.3.11). */
async function applyRecipe(page, recipeId, beat) {
  await onTab(page, 'rhythm');
  const chip = page.locator(`.recipe-chip[data-recipe="${recipeId}"]`);
  await chip.click();
  await page.locator(`.measure[data-measure="0"] .beat[data-beat="${beat}"]`).click();
  await chip.click();
}

/** "Samba Break"'s shape: two 4/4 Measures of Straight 16ths, a few Slots sounding. */
function sambaLike() {
  let p = { ...create('Samba Break'), tempo: 240 };
  p = addMeasure(p);
  for (const [m, b, s] of [[0, 0, 0], [0, 1, 2], [0, 2, 0], [0, 3, 3], [1, 0, 0], [1, 2, 1]]) {
    p = cycleAccent(p, m, b, s);
  }
  return p;
}

// --- US-4.4 ---------------------------------------------------------------------

test('AC-4.4.1 — Swing default and range: the swing control opens at 0 and runs 0–100 in steps of 1', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await onTab(page, 'practice');
  const slider = page.locator('.swing-slider');
  await expect(slider).toBeVisible();
  await expect(slider).toHaveValue('0');
  await expect(slider).toHaveAttribute('min', '0');
  await expect(slider).toHaveAttribute('max', '100');
  await expect(slider).toHaveAttribute('step', '1');
});

// --- US-5.6 ---------------------------------------------------------------------

test('AC-5.6.1 — Counting-system toggle updates labels live', async ({ page }) => {
  await page.goto('/');
  const p = sambaLike();
  await load(page, p, 'p_samba');
  await onTab(page, 'practice');
  await page.locator('.counting-picker').selectOption('takadimi');
  expect(await gridLabels(page)).toEqual(expected(p, 'takadimi'));

  await page.locator('[data-action="play"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.getState().loop), { timeout: 10000 }).toBeGreaterThanOrEqual(1);

  // Count every (re)start from here on: toggling must not restart playback.
  await page.evaluate(() => {
    const t = window.__rm.transport;
    window.__restarts = 0;
    for (const name of ['start', 'restart']) {
      const real = t[name].bind(t);
      t[name] = (...args) => {
        window.__restarts += 1;
        return real(...args);
      };
    }
  });
  const loopBefore = await page.evaluate(() => window.__rm.getState().loop);

  await page.locator('.counting-picker').selectOption('one-e-and-a');

  // Every grid cell label, at once — not on the next pass, not after reselecting.
  await expect.poll(() => gridLabels(page), { timeout: 500 }).toEqual(expected(p, 'one-e-and-a'));
  const after = await page.evaluate(() => ({
    running: window.__rm.transport.isRunning,
    restarts: window.__restarts,
    loop: window.__rm.getState().loop,
    id: window.__rm.getState().pattern.id,
  }));
  expect(after.running).toBe(true);
  expect(after.restarts).toBe(0);
  expect(after.loop).toBeGreaterThanOrEqual(loopBefore); // the loop counter did not reset
  expect(after.id).toBe('p_samba'); // the same Pattern, not reselected
  // The sounding Slots now read in the new system too.
  await expect(page.locator('.grid .slot[data-measure="0"][data-beat="1"][data-slot="2"] .slot-label')).toHaveText('&');
  await page.locator('[data-action="stop"]').click();
});

test('AC-5.6.3 — Pattern-level restriction does not overwrite the global setting', async ({ page }) => {
  await page.goto('/');
  await onTab(page, 'practice');
  await page.locator('.counting-picker').selectOption('takadimi');

  // "Mixed Feel Groove": one mixed-feel Beat forces Numbered (AC-5.6.2).
  let mixed = create('Mixed Feel Groove');
  mixed = setRecipe(mixed, 0, 1, 'straight-triplet-split');
  await load(page, mixed, 'p_mixed');
  expect(await gridLabels(page)).toEqual(expected(mixed, 'numbered'));

  // Then "Samba Break", with no mixed-feel Recipe.
  const samba = sambaLike();
  await load(page, samba, 'p_samba');
  expect(await gridLabels(page)).toEqual(expected(samba, 'takadimi'));
  await onTab(page, 'practice');
  await expect(page.locator('.counting-picker')).toHaveValue('takadimi');
  await expect(page.locator('[data-forced-numbered]')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).countingSystem);
  expect(stored).toBe('takadimi');
});

test('AC-5.6.4 — A Pattern without mixed-feel Recipes supports all three systems', async ({ page }) => {
  await page.goto('/');
  // Every single-feel Recipe: Straight 16ths, Straight 8ths and Triplet 8ths on
  // quarter-note Beats, and Undivided on the eighth-note Beats of a 6/8 Measure.
  let p = create('Single feel');
  p = setRecipe(p, 0, 1, 'straight-8ths');
  p = setRecipe(p, 0, 2, 'triplet-8ths');
  p = addMeasure(p);
  p = setTimeSignature(p, 1, '6/8');
  for (let b = 0; b < 6; b++) p = setRecipe(p, 1, b, 'undivided');
  for (const [m, b] of [[0, 0], [0, 1], [0, 2], [1, 0], [1, 3]]) p = cycleAccent(p, m, b, 0);
  await load(page, p, 'p_single');
  await onTab(page, 'practice');
  const picker = page.locator('.counting-picker');

  // It renders in whichever is globally selected — the default to begin with.
  expect(await gridLabels(page)).toEqual(expected(p, await picker.inputValue()));
  await expect(page.locator('[data-forced-numbered]')).toHaveCount(0);

  for (const system of ['one-e-and-a', 'numbered', 'takadimi']) {
    await expect(picker.locator(`option[value="${system}"]`)).toHaveJSProperty('disabled', false);
    await picker.selectOption(system);
    await expect(picker).toHaveValue(system);
    await expect.poll(() => gridLabels(page)).toEqual(expected(p, system));
  }
});

test('AC-5.6.5 — Adding a mixed-feel Recipe to a Pattern switches it to Numbered immediately', async ({ page }) => {
  await page.goto('/');
  let p = create('Samba Break');
  p = setRecipe(p, 0, 1, 'straight-8ths');
  await load(page, p, 'p_samba');
  await onTab(page, 'practice');
  await page.locator('.counting-picker').selectOption('takadimi');
  expect(await gridLabels(page)).toEqual(expected(p, 'takadimi'));

  // The Composer changes one Beat to Straight → Triplet split.
  await applyRecipe(page, 'straight-triplet-split', 2);
  const mixed = setRecipe(p, 0, 2, 'straight-triplet-split');
  expect(await gridLabels(page)).toEqual(expected(mixed, 'numbered'));
  await onTab(page, 'practice');
  const picker = page.locator('.counting-picker');
  await expect(picker.locator('option[value="takadimi"]')).toHaveJSProperty('disabled', true);
  await expect(picker.locator('option[value="one-e-and-a"]')).toHaveJSProperty('disabled', true);
  await expect(picker.locator('option[value="numbered"]')).toHaveJSProperty('disabled', false);

  // And back to a single-feel Recipe: Takadimi again, the global setting untouched.
  await applyRecipe(page, 'straight-16ths', 2);
  expect(await gridLabels(page)).toEqual(expected(p, 'takadimi'));
  await onTab(page, 'practice');
  await expect(picker).toHaveValue('takadimi');
  await expect(picker.locator('option[value="takadimi"]')).toHaveJSProperty('disabled', false);
  await expect(picker.locator('option[value="one-e-and-a"]')).toHaveJSProperty('disabled', false);
});

test('AC-5.6.6 — Default counting system on first load', async ({ page }) => {
  // What the settings store held before the app's own script first ran.
  await page.addInitScript(() => {
    window.__settingsBefore = localStorage.getItem('rm.settings.v1');
  });
  await page.goto('/');
  // First load: nothing has chosen a counting system yet.
  const before = await page.evaluate(() => JSON.parse(window.__settingsBefore ?? '{}').countingSystem);
  expect(before ?? null).toBeNull();

  await onTab(page, 'practice');
  await expect(page.locator('.counting-picker')).toHaveValue('takadimi');
  const p = sambaLike();
  await load(page, p, 'p_samba');
  expect(await gridLabels(page)).toEqual(expected(p, 'takadimi'));
});

// --- US-3.1 ---------------------------------------------------------------------

/** Tap a Slot in the grid and read back the Accent Level it now shows. */
async function tapAndRead(page, beat) {
  const slot = page.locator(`.grid .slot[data-measure="0"][data-beat="${beat}"][data-slot="0"]`);
  await slot.click();
  return Number(await slot.getAttribute('data-accent'));
}

test('AC-3.1.12 — Override cycle, Medium default', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  // Slot 1 of Beat 3, turned on: its computed default, Medium.
  expect(await tapAndRead(page, 2)).toBe(2);
  // Three more taps: Strong, Weak, Off.
  expect(await tapAndRead(page, 2)).toBe(3);
  expect(await tapAndRead(page, 2)).toBe(1);
  expect(await tapAndRead(page, 2)).toBe(0);
  // A fourth returns it to Medium.
  expect(await tapAndRead(page, 2)).toBe(2);
});

test('AC-3.1.13 — Override cycle, Weak default', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  // Slot 1 of Beat 2, turned on: its computed default, Weak.
  expect(await tapAndRead(page, 1)).toBe(1);
  // Three more taps: Medium, Strong, Off.
  expect(await tapAndRead(page, 1)).toBe(2);
  expect(await tapAndRead(page, 1)).toBe(3);
  expect(await tapAndRead(page, 1)).toBe(0);
  // A fourth returns it to Weak.
  expect(await tapAndRead(page, 1)).toBe(1);
});

// --- US-2.4 ---------------------------------------------------------------------

test('AC-2.4.3 — Neither Sound Mode waits on anything to load', async ({ page }) => {
  // Nothing sampled is ever allowed to finish loading in this test: the piano's
  // recordings and the guitar's soundfont are held, unanswered, throughout.
  const held = [];
  await page.route('**/audio/piano/*.mp3', (route) => held.push(route));
  await page.route('https://gleitz.github.io/**', (route) => held.push(route));
  await page.goto('/');

  const playAndHear = async () => {
    await page.locator('[data-action="play"]').click();
    await expect(page.locator('.grid .slot.playing')).toHaveCount(1, { timeout: 2000 });
    expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
  };
  const stop = () => page.locator('[data-action="stop"]').click();

  // Percussive: nothing to load.
  let p = create('Loading');
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
  await load(page, p, 'p_loading');
  await playAndHear();
  await stop();

  // Melodic, under each voice. Piano and Guitar cannot have loaded; their notes
  // sound through the synth rather than holding Play.
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  for (const voice of ['piano', 'synth', 'guitar']) {
    await page.locator(`.voice-switch [data-voice="${voice}"]`).click();
    const before = (await page.evaluate(() => window.__rm.voiceLog())).length;
    await playAndHear();
    await expect.poll(async () => (await page.evaluate(() => window.__rm.voiceLog())).length, { timeout: 2000 }).toBeGreaterThan(before);
    const heard = (await page.evaluate(() => window.__rm.voiceLog())).slice(before);
    expect(heard.every((e) => e.voice === voice), voice).toBe(true);
    expect(heard.every((e) => (voice === 'synth' ? e.via === 'synth' : e.via === 'fallback')), voice).toBe(true);
    await stop();
  }
  expect(held.length).toBeGreaterThan(0); // the loads really were asked for, and are still pending
});
