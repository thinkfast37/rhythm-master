/**
 * The Composer's metronome toggle (AC-19.6.3): beside Play/Stop in the pinned
 * bar in the Composer, stopped or playing, the app's one click setting, switched without
 * a restart — proven in the DOM.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, appState, makeFourBeats, enterComposer, leaveComposer, recordAll, fret } from './composer-helpers.js';

test.use(launch);

const toggle = (page) => page.locator('.main-top-bar .play-controls .composer-metronome');
const transportButton = (page) => page.locator('.main-top-bar .transport').first();
const snapshot = (page) => page.evaluate(() => window.__rm.transport._snapshot());
const practiceClick = (page) => page.locator('.practice-group [data-action="toggle-metronome"]');

async function setTempo(page, bpm) {
  await page.locator('.composer-tempo-entry').fill(String(bpm));
  await page.locator('.composer-tempo-entry').press('Enter');
}

/** A saved composition in the Composer, so leaving it asks nothing. */
async function savedComposition(page) {
  await makeFourBeats(page);
  await enterComposer(page, { load: 'accept', name: 'My line' });
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
}

test('AC-19.6.3/1 — In the Composer, stopped or playing, recording or not, a Metronome toggle sits beside Play/Stop in the pinned bar, marked on or off; switched on while stopped it sounds nothing until Play; it is absent in Practice', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page);
  // In Practice, stopped and playing: the bar carries none.
  await expect(toggle(page)).toHaveCount(0);
  await transportButton(page).click();
  await expect(transportButton(page)).toHaveText('Stop');
  await expect(toggle(page)).toHaveCount(0);
  await transportButton(page).click();

  await enterComposer(page, { load: 'accept', name: 'My line' });
  // In the Composer, stopped: beside Play, in the same group, marked off,
  // with what the click counts beside it (AC-4.3.7/1).
  await expect(toggle(page)).toBeVisible();
  await expect(toggle(page)).toHaveText('Metronome');
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('.main-top-bar .transport-group > *').evaluateAll((els) => els.map((e) => e.dataset.action))).toEqual(['play', 'composer-metronome', 'set-click-value']);
  const play = await transportButton(page).boundingBox();
  const box = await toggle(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(play.x + play.width);
  // Switched on while stopped: marked on, and nothing sounds.
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  expect((await appState(page)).settings.metronomeEnabled).toBe(true);
  expect((await appState(page)).isPlaying).toBe(false);
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
  // Play: the click sounds, the toggle still there and still on.
  await transportButton(page).click();
  await expect(transportButton(page)).toHaveText('Stop');
  await expect.poll(async () => (await snapshot(page)).clicksScheduled).toBeGreaterThan(0);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  // Playing and recording: still there, and switches off.
  await page.locator('.record').click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle(page)).toBeVisible();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(page)).not.toHaveClass(/\bon\b/);
  expect((await composerState(page)).recording).toBe(true);
  // Stopped again: still there.
  await transportButton(page).click();
  await expect(transportButton(page)).toHaveText('Play');
  await expect(toggle(page)).toBeVisible();
});

test("AC-19.6.3/2 — The toggle is the app's one metronome setting: switched on in the Composer the click sounds on every Beat of the part on screen and is on in Practice afterwards, and switched off it is off in both", async ({ page }) => {
  await openApp(page);
  await savedComposition(page);
  await setTempo(page, 240);
  expect((await appState(page)).settings.metronomeEnabled).toBe(false);
  await transportButton(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect((await snapshot(page)).clicksScheduled).toBe(0);

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  expect((await appState(page)).settings.metronomeEnabled).toBe(true);
  // A click on each of the part's four Beats, pass after pass.
  const s = await snapshot(page);
  expect(s.metronomeEnabled).toBe(true);
  expect(s.beatTimes).toHaveLength(4);
  await expect.poll(async () => (await snapshot(page)).clicksScheduled, { timeout: 8000 }).toBeGreaterThanOrEqual(8);
  await transportButton(page).click();

  // In Practice afterwards the click is on, in its own group.
  await leaveComposer(page);
  await expect(page.locator('.composer-panel')).toBeHidden();
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  await expect(practiceClick(page)).toHaveClass(/\bon\b/);
  // Switched off there, it is off in the Composer; switched off here, off there.
  await practiceClick(page).click();
  await expect(practiceClick(page)).not.toHaveClass(/\bon\b/);
  await practiceClick(page).click();
  await expect(practiceClick(page)).toHaveClass(/\bon\b/);
  await enterComposer(page, { load: 'none' });
  await transportButton(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect((await appState(page)).settings.metronomeEnabled).toBe(false);
  await transportButton(page).click();
  await leaveComposer(page);
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  await expect(practiceClick(page)).not.toHaveClass(/\bon\b/);
  // And it is the stored setting: a reload keeps it.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).metronomeEnabled)).toBe(false);
});

test('AC-19.6.3/3 — Switching it while playing stops and restarts nothing: the click begins or ceases from the next Beat and every part carries on', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page);
  await enterComposer(page, { load: 'accept', name: 'My line' });
  await setTempo(page, 240);
  await transportButton(page).click();
  // Recording under playback, with one note in: the place must survive the switch.
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  const target = (await composerState(page)).target;
  const voiceLog = () => page.evaluate(() => window.__rm.voiceLog().length);
  await expect.poll(voiceLog, { timeout: 8000 }).toBeGreaterThan(1);
  // Several passes in, so a restart — which counts passes from zero again — would show.
  await expect.poll(async () => (await appState(page)).loop, { timeout: 15000 }).toBeGreaterThanOrEqual(3);
  const loopBefore = (await appState(page)).loop;

  await toggle(page).click();
  await expect.poll(async () => (await snapshot(page)).clicksScheduled, { timeout: 8000 }).toBeGreaterThanOrEqual(4);
  // Nothing restarted: the pass counter went on from where it was, and the record target held.
  // (That the run stays anchored to the instant is proven on the transport, in scheduler.test.js.)
  let state = await appState(page);
  expect(state.isPlaying).toBe(true);
  expect(state.loop).toBeGreaterThanOrEqual(loopBefore);
  const c = await composerState(page);
  expect(c.recording).toBe(true);
  expect(c.target).toEqual(target);
  // The part went on sounding through it.
  const heard = await voiceLog();
  await expect.poll(voiceLog, { timeout: 8000 }).toBeGreaterThan(heard);

  // Off again: the clicks cease, the part carries on.
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(400);
  const settled = (await snapshot(page)).clicksScheduled;
  const heardThen = await voiceLog();
  await expect.poll(voiceLog, { timeout: 8000 }).toBeGreaterThan(heardThen + 2);
  expect((await snapshot(page)).clicksScheduled).toBe(settled);
  state = await appState(page);
  expect(state.isPlaying).toBe(true);
  expect(state.loop).toBeGreaterThanOrEqual(loopBefore);
  await expect(transportButton(page)).toHaveText('Stop');
});

test('AC-15.1.20/1 — The pinned bar holds, left to right, ‹ Goals, Library, Related, Play/Stop with the tempo entry and its ♩/♪ unit, and Prev/Next, the same under every goal and at every width; in the Composer, a Metronome toggle and its click value join Play/Stop; Related is a placeholder, disabled and saying so, until Share and tidy up lands: the toggle and its click value join the bar and nothing else does', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page);
  const barOrder = () =>
    page.locator('.main-top-bar > *:not(.goal-strip)').evaluateAll((els) => els.map((e) => e.className.split(' ')[0]));
  const before = await barOrder();
  await enterComposer(page, { load: 'accept', name: 'My line' });
  for (const playing of [false, true]) {
  if (playing) await transportButton(page).click();
  for (const size of [
    { width: 1280, height: 800 },
    { width: 820, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await expect(toggle(page), `${size.width}px`).toBeVisible();
    // The bar's own parts are the same five; the toggle sits inside the Play group.
    expect(await barOrder(), `${size.width}px`).toEqual(before);
    await expect(page.locator('.main-top-bar .play-controls .tempo-entry'), `${size.width}px`).toBeVisible();
    await expect(page.locator('.main-top-bar .pattern-nav [data-action="next-pattern"]'), `${size.width}px`).toBeVisible();
    // No horizontal scroll from the extra control.
    await expect(page.locator('.main-top-bar .play-controls [data-action="set-click-value"]'), `${size.width}px`).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${size.width}px`).toBe(true);
  }
  }
});
