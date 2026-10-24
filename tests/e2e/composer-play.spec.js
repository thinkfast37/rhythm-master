import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, loadFourBeats, fret, cslot } from './composer-helpers.js';

test.use(launch);

const play = (page) => page.locator('.transport').first().click();
const voiceLog = (page) => page.evaluate(() => window.__rm.voiceLog());

/**
 * Click an instrument button and return how long the voice log was at the
 * instant the switch took effect. Read in a capturing listener, so it runs in
 * the click's own dispatch, before the button's handler and with no scheduler
 * tick able to interleave: everything logged after it was scheduled after the
 * switch. A length read in a separate round trip before the click also counts
 * whatever the scheduler queued in the old voice while the click was on its
 * way (T410).
 */
async function switchInstrument(page, id) {
  await page.evaluate(() => {
    document.addEventListener('click', () => { window.__voiceLogAtSwitch = window.__rm.voiceLog().length; }, { capture: true, once: true });
  });
  await page.locator(`.instrument-switch [data-instrument="${id}"]`).click();
  return page.evaluate(() => window.__voiceLogAtSwitch);
}

// --- AC-19.6.1: Play sounds what is recorded and the rest percussively ----------------

test('AC-19.6.1/1 — Play loops the composition, with the playback cursor moving through the composing grid, and Stop stops it', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-tempo-entry').fill('240');
  await page.locator('.composer-tempo-entry').press('Enter');
  await play(page);
  expect((await page.evaluate(() => window.__rm.getState())).isPlaying).toBe(true);
  await expect(page.locator('.composer-grid .slot.playing')).toHaveCount(1);
  // The cursor moves on, and the run loops past the last Beat.
  await expect.poll(() => page.evaluate(() => window.__rm.getState().transportPosition?.beatIndex), { timeout: 5000 }).not.toBe(0);
  await expect.poll(() => page.evaluate(() => window.__rm.getState().transportPosition?.loop ?? window.__rm.getState().loop), { timeout: 8000 }).toBeGreaterThan(0);
  await expect(page.locator('.transport').first()).toHaveText('Stop');
  await play(page);
  expect((await page.evaluate(() => window.__rm.getState())).isPlaying).toBe(false);
  await expect(page.locator('.composer-grid .slot.playing')).toHaveCount(0);
});

test('AC-19.6.1/2 — A pitched Slot sounds with the voice of the instrument shown, guitar or piano, and an unpitched sounding Slot sounds percussively at its Accent Level', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-tempo-entry').fill('240');
  await page.locator('.composer-tempo-entry').press('Enter');
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.locator('.record').click();
  await page.evaluate(() => window.__rm.voiceLog().length);
  const logBefore = (await voiceLog(page)).length;
  // The scheduled timeline: two pitched events (melodic), two with no pitch (percussive).
  const events = await page.evaluate(() => window.__rmTimeline.buildTimeline(window.__rm.composer().draft, 0).map((e) => ({ beat: e.beatIndex, pitched: e.pitch !== null, accent: e.accent })));
  expect(events.map((e) => e.pitched)).toEqual([true, true, false, false]);
  expect(events.every((e) => e.accent >= 1)).toBe(true);
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).length, { timeout: 8000 }).toBeGreaterThan(logBefore + 1);
  const guitarRun = (await voiceLog(page)).slice(logBefore);
  expect(guitarRun.every((v) => v.instrument === 'guitar')).toBe(true);
  expect(guitarRun.map((v) => v.midi).every((m) => m === 60 || m === 62)).toBe(true);
  await play(page);
  await page.locator('.instrument-switch [data-instrument="piano"]').click();
  const logMid = (await voiceLog(page)).length;
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).length, { timeout: 8000 }).toBeGreaterThan(logMid + 1);
  expect((await voiceLog(page)).slice(logMid).every((v) => v.instrument === 'piano' && v.via === 'synth')).toBe(true);
  await play(page);
});

test('AC-19.6.1/3 — Switching Guitar to Piano, or back, while playing changes the voice from the next event without a restart', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-tempo-entry').fill('240');
  await page.locator('.composer-tempo-entry').press('Enter');
  await page.locator('.record').click();
  for (const [s, f] of [[1, 1], [1, 3], [0, 0], [0, 1]]) await fret(page, s, f).click();
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).filter((v) => v.instrument === 'guitar').length, { timeout: 8000 }).toBeGreaterThan(1);
  const loopBefore = await page.evaluate(() => window.__rm.getState().loop);
  const countBefore = await switchInstrument(page, 'piano');
  await expect.poll(async () => (await voiceLog(page)).length, { timeout: 8000 }).toBeGreaterThan(countBefore + 1);
  const after = (await voiceLog(page)).slice(countBefore);
  // From the next event: every note scheduled after the switch is piano.
  expect(after.some((v) => v.instrument === 'piano')).toBe(true);
  expect(after.every((v) => v.instrument === 'piano')).toBe(true);
  // No restart: still playing, the loop counter not reset below where it was.
  const state = await page.evaluate(() => window.__rm.getState());
  expect(state.isPlaying).toBe(true);
  expect(state.loop).toBeGreaterThanOrEqual(loopBefore);
  const countBack = await switchInstrument(page, 'guitar');
  await expect.poll(async () => (await voiceLog(page)).length, { timeout: 8000 }).toBeGreaterThan(countBack + 1);
  expect((await voiceLog(page)).slice(countBack).every((v) => v.instrument === 'guitar')).toBe(true);
  await play(page);
});

// --- AC-19.6.2: recording and editing under playback ------------------------------------

test('AC-19.6.2/1 — A note recorded while playing is heard from the next pass, and the target moves on as it does at rest', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-tempo-entry').fill('240');
  await page.locator('.composer-tempo-entry').press('Enter');
  await page.locator('.record').click();
  await play(page);
  await fret(page, 1, 1).click();
  expect((await composerState(page)).target).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  await expect(cslot(page, 0, 1)).toHaveClass(/target/);
  // Pending for the next pass (AC-4.1.9), then in force.
  await expect.poll(() => page.evaluate(() => window.__rm.transport._snapshot().pattern?.measures[0].beats[0].slots[0].pitch?.degree ?? null), { timeout: 8000 }).toBe('1');
  const state = await page.evaluate(() => window.__rm.getState());
  expect(state.isPlaying).toBe(true);
  expect((await composerState(page)).recording).toBe(true);
  await play(page);
});

test('AC-19.6.2/2 — Tempo and swing changes while playing take effect as they do in Practice, and no other edit stops or restarts playback', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-tempo-entry').fill('240');
  await page.locator('.composer-tempo-entry').press('Enter');
  await play(page);
  await expect.poll(() => page.evaluate(() => window.__rm.getState().loop), { timeout: 8000 }).toBeGreaterThan(0);
  // A tempo change restarts from the top at the new tempo (AC-4.2.2).
  await page.locator('.composer-tempo-entry').fill('200');
  await page.locator('.composer-tempo-entry').press('Enter');
  await expect.poll(() => page.evaluate(() => window.__rm.transport._snapshot().pattern?.tempo)).toBe(200);
  expect((await page.evaluate(() => window.__rm.getState())).isPlaying).toBe(true);
  await page.locator('.composer-swing-entry').fill('30');
  await page.locator('.composer-swing-entry').press('Enter');
  await expect.poll(() => page.evaluate(() => window.__rm.transport._snapshot().pattern?.swingAmount)).toBe(30);
  // Other edits neither stop nor restart: the loop counter keeps counting.
  await expect.poll(() => page.evaluate(() => window.__rm.getState().loop), { timeout: 8000 }).toBeGreaterThan(0);
  const loopBefore = await page.evaluate(() => window.__rm.getState().loop);
  await cslot(page, 0, 0, 2).locator('.cslot-syllable').click();
  await cslot(page, 0, 1).locator('.cslot-note').click();
  await fret(page, 0, 0).click();
  // The edit goes to the transport as a pending update, not a restart. Read
  // in the click's own dispatch, after the button's handler: the pending edit
  // is consumed at the next pass boundary, which a read a few round trips
  // later could already have crossed (T410).
  await page.evaluate(() => {
    document.addEventListener('click', () => { window.__pendingAfterDelete = window.__rm.transport._snapshot().pendingEdit; }, { once: true });
  });
  await page.locator('.composer-delete').click();
  const state = await page.evaluate(() => window.__rm.getState());
  expect(state.isPlaying).toBe(true);
  expect(state.loop).toBeGreaterThanOrEqual(loopBefore);
  expect(await page.evaluate(() => window.__pendingAfterDelete)).toBe(true);
  await play(page);
});
