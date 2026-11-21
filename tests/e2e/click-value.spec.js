/**
 * US-4.3 / AC-4.3.7 — The musician chooses what the metronome click counts.
 * Driven through the click-value menu beside the Click toggle in Practice and
 * beside the Metronome toggle in the Composer, and read off the real
 * transport's own snapshot of the clicks it is running.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, appState, makeFourBeats, enterComposer } from './composer-helpers.js';

test.use(launch);

const snapshot = (page) => page.evaluate(() => window.__rm.transport._snapshot());
const practiceMenu = (page) => page.locator('.practice-group [data-action="set-click-value"]');
const composerMenu = (page) => page.locator('.main-top-bar .play-controls [data-action="set-click-value"]');
const transportButton = (page) => page.locator('.main-top-bar .transport').first();

/** Measures of the given meters, one sounding Slot each, loaded as owned. */
async function loadMeters(page, meters, { tempo = 120, id = 'p_click' } = {}) {
  await page.evaluate(
    ({ meters, tempo, id }) => {
      const beat = (eighth) => (eighth ? { recipe: 'undivided', slots: [{ on: false }] } : { recipe: 'straight-8ths', slots: [{ on: false }, { on: false }] });
      const measures = meters.map((ts) => {
        const [n, d] = ts.split('/').map(Number);
        const beats = Array.from({ length: n }, () => beat(d === 8));
        beats[0].slots[0].on = true;
        return { timeSignature: ts, beats };
      });
      window.__rm.loadPattern({ id, name: `Click ${meters.join(' ')}`, soundMode: 'percussive', tempo, tags: [], rating: 0, measures }, { owned: true });
      // Opening a Pattern shows the workbench's first tab; the click is in Practice.
      window.__rm.handlers.onWorkbenchTab('practice');
    },
    { meters, tempo, id }
  );
}

/** Practice group shown, click on. */
async function practiceWithClick(page) {
  await openApp(page);
  await page.evaluate(() => window.__rm.handlers.onWorkbenchTab('practice'));
  await page.locator('.practice-group [data-action="toggle-metronome"]').click();
}

/** Play, read the clicks the transport is running, stop. */
async function played(page) {
  await page.locator('[data-action="play"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  const snap = await snapshot(page);
  await page.locator('[data-action="stop"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
  return snap;
}

const round = (times) => times.map((t) => Math.round(t * 1e6) / 1e6);

test('AC-4.3.7/1 — A click-value menu sits beside every Click or Metronome toggle, offering Beat, 16ths, 8ths, Quarters, Halves, Wholes and Measure, with Beat chosen on a first load', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__rm.handlers.onWorkbenchTab('practice'));
  // Practice: beside Click, in the same group.
  const group = page.locator('.practice-group .control-group', { has: page.locator('[data-action="toggle-metronome"]') });
  expect(await group.locator('> *').evaluateAll((els) => els.map((e) => e.dataset.action))).toEqual(['toggle-metronome', 'set-click-value', 'toggle-count-in']);
  await expect(practiceMenu(page)).toBeVisible();
  expect(await practiceMenu(page).locator('option').allTextContents()).toEqual(['Beat', '16ths', '8ths', 'Quarters', 'Halves', 'Wholes', 'Measure']);
  await expect(practiceMenu(page)).toHaveValue('beat');
  expect((await appState(page)).settings.clickValue).toBe('beat');

  // The Composer: beside Metronome, in the pinned bar's Play group.
  await makeFourBeats(page);
  await enterComposer(page, { load: 'accept', name: 'My line' });
  await expect(composerMenu(page)).toBeVisible();
  expect(await composerMenu(page).locator('option').allTextContents()).toEqual(['Beat', '16ths', '8ths', 'Quarters', 'Halves', 'Wholes', 'Measure']);
  await expect(composerMenu(page)).toHaveValue('beat');
  const metronome = await page.locator('.main-top-bar .composer-metronome').boundingBox();
  const menu = await composerMenu(page).boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(metronome.x + metronome.width);
});

test('AC-4.3.7/2 — Beat clicks every Beat of each Measure at its own length: four clicks in a 4/4 Measure, six in a 6/8 one', async ({ page }) => {
  await practiceWithClick(page);
  await practiceMenu(page).selectOption('beat');
  // ♩ = 120: quarters of 0.5 s, then eighths of 0.25 s.
  await loadMeters(page, ['4/4', '6/8']);
  const snap = await played(page);
  expect(round(snap.beatTimes)).toEqual([0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.25]);
  expect(snap.clickDownbeats).toEqual([true, false, false, false, true, false, false, false, false, false]);
});

test('AC-4.3.7/3 — A note value clicks at its written length against the tempo: at ♩ = 120 in 4/4, 16ths every 0.125 s, 8ths every 0.25 s, quarters every 0.5 s, halves every 1 s and wholes every 2 s', async ({ page }) => {
  await practiceWithClick(page);
  await loadMeters(page, ['4/4', '4/4']);
  const every = (step, count) => Array.from({ length: count }, (_, i) => i * step);
  for (const [value, step] of [
    ['sixteenth', 0.125],
    ['eighth', 0.25],
    ['quarter', 0.5],
    ['half', 1],
    ['whole', 2],
  ]) {
    await practiceMenu(page).selectOption(value);
    const snap = await played(page);
    expect(snap.clickValue, value).toBe(value);
    expect(round(snap.beatTimes), value).toEqual(every(step, 4 / step));
  }
});

test('AC-4.3.7/4 — Measure clicks once in every Measure, on its downbeat', async ({ page }) => {
  await practiceWithClick(page);
  await practiceMenu(page).selectOption('measure');
  // 4/4 (2 s), 3/4 (1.5 s), 6/8 (1.5 s) at ♩ = 120.
  await loadMeters(page, ['4/4', '3/4', '6/8']);
  const snap = await played(page);
  expect(round(snap.beatTimes)).toEqual([0, 2, 3.5]);
  expect(snap.clickDownbeats).toEqual([true, true, true]);
});

test('AC-4.3.7/5 — The click starts again at every bar line: the first click of each Measure is on its downbeat and accented, and a value that does not fill the Measure evenly stops at the bar line — a half-note click in 3/4 sounds on Beats 1 and 3, a quarter-note click in 7/8 on Beats 1, 3, 5 and 7, a whole-note click in 3/4 once', async ({ page }) => {
  await practiceWithClick(page);
  // Halves in 3/4 at ♩ = 120: Beats 1 and 3 (0 s and 1 s), then the next bar's downbeat at 1.5 s.
  await loadMeters(page, ['3/4', '3/4']);
  await practiceMenu(page).selectOption('half');
  let snap = await played(page);
  expect(round(snap.beatTimes)).toEqual([0, 1, 1.5, 2.5]);
  expect(snap.clickDownbeats).toEqual([true, false, true, false]);

  // Wholes in 3/4: once a bar, on its downbeat.
  await practiceMenu(page).selectOption('whole');
  snap = await played(page);
  expect(round(snap.beatTimes)).toEqual([0, 1.5]);
  expect(snap.clickDownbeats).toEqual([true, true]);

  // Quarters in 7/8 at ♪ = 120 (eighths of 0.5 s): Beats 1, 3, 5 and 7, then the next bar at 3.5 s.
  await loadMeters(page, ['7/8', '7/8'], { id: 'p_seven' });
  await practiceMenu(page).selectOption('quarter');
  snap = await played(page);
  expect(round(snap.beatTimes)).toEqual([0, 1, 2, 3, 3.5, 4.5, 5.5, 6.5]);
  expect(snap.clickDownbeats).toEqual([true, false, false, false, true, false, false, false]);
});

test('AC-4.3.7/6 — The count-in is unchanged by it: one click for each Beat of the first Measure', async ({ page }) => {
  await practiceWithClick(page);
  await page.locator('.practice-group [data-action="toggle-count-in"]').click();
  await loadMeters(page, ['4/4']);
  for (const value of ['beat', 'sixteenth', 'half', 'measure']) {
    await practiceMenu(page).selectOption(value);
    // Four quarter-note Beats at ♩ = 120, whatever the click counts.
    expect((await played(page)).countInSeconds, value).toBeCloseTo(2, 10);
  }
  await loadMeters(page, ['6/8'], { id: 'p_six' });
  await practiceMenu(page).selectOption('quarter');
  // Six eighth-note Beats at ♪ = 120.
  expect((await played(page)).countInSeconds).toBeCloseTo(3, 10);
});

test("AC-4.3.7/7 — It is one app-wide setting, kept across reloads, with no per-Pattern override, and the Composer's metronome counts what it says", async ({ page }) => {
  await practiceWithClick(page);
  await practiceMenu(page).selectOption('half');
  expect((await appState(page)).settings.clickValue).toBe('half');
  // Kept across a reload.
  await page.reload();
  await page.evaluate(() => window.__rm.handlers.onWorkbenchTab('practice'));
  await expect(practiceMenu(page)).toHaveValue('half');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('rm.settings.v1'))).clickValue).toBe('half');
  // No per-Pattern override: another Pattern counts the same, and none stores it.
  await loadMeters(page, ['4/4', '4/4'], { id: 'p_a' });
  await expect(practiceMenu(page)).toHaveValue('half');
  expect(round((await played(page)).beatTimes)).toEqual([0, 1, 2, 3]);
  expect('clickValue' in (await appState(page)).pattern).toBe(false);

  // The Composer counts it too, and changing it there changes it in Practice.
  await makeFourBeats(page);
  await enterComposer(page, { load: 'accept', name: 'My line' });
  await expect(composerMenu(page)).toHaveValue('half');
  await transportButton(page).click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  const snap = await snapshot(page);
  expect(snap.clickValue).toBe('half');
  const bar = snap.loopDuration / (await page.evaluate(() => window.__rm.composer().draft.measures.length));
  expect(round(snap.beatTimes.slice(0, 2))).toEqual(round([0, bar / 2]));
  await composerMenu(page).selectOption('eighth');
  expect((await appState(page)).settings.clickValue).toBe('eighth');
  await transportButton(page).click();
});

test('AC-4.3.7/8 — Changing it while the Composer plays stops and restarts nothing: the click counts the new value from the next click', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page);
  await enterComposer(page, { load: 'accept', name: 'My line' });
  await page.locator('.main-top-bar .composer-metronome').click();
  await transportButton(page).click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  // Where the run began: a restart would move it.
  const origin = await page.evaluate(() => window.__rm.transport._eventTime(0, 0));
  const before = await snapshot(page);
  expect(before.clickValue).toBe('beat');
  const beats = before.beatTimes.length;

  await composerMenu(page).selectOption('eighth');
  const after = await snapshot(page);
  expect(after.clickValue).toBe('eighth');
  expect(after.beatTimes.length).toBe(beats * 2);
  expect(await page.evaluate(() => window.__rm.transport._eventTime(0, 0))).toBeCloseTo(origin, 6);
  expect((await appState(page)).isPlaying).toBe(true);
  await expect(transportButton(page)).toHaveText('Stop');
  // And it goes on clicking.
  const scheduled = after.clicksScheduled;
  await expect.poll(async () => (await snapshot(page)).clicksScheduled, { timeout: 5000 }).toBeGreaterThan(scheduled);
  await transportButton(page).click();
});
