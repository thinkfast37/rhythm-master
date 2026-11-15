/**
 * Hear a Percussive Pattern on a drum kit (US-2.18): the Accents | Drum kit
 * switch in the Pattern header, what it remembers, and what is heard — proven
 * in the DOM.
 *
 * Bossa Nova (s_21) is the shipped Percussive Pattern; the owned one is a blank
 * 4/4 with the first syllable of every Beat sounding, whose computed accents
 * are Strong, Weak, Medium, Weak.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const sw = (page) => page.locator('.pattern-header .percussion-switch');
const option = (page, mode) => page.locator(`.percussion-switch [data-percussion="${mode}"]`);
const play = (page) => page.locator('[data-action="play"]').click();
const stop = (page) => page.locator('[data-action="stop"]').click();
const heard = (page, via = 'live') => page.evaluate((v) => window.__rm.percussionLog().filter((e) => e.via === v), via);

/** An owned four-Beat Percussive Pattern, one syllable on each Beat. */
async function fourBeats(page) {
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  for (let b = 0; b < 4; b++) await page.locator(`.grid .slot[data-beat="${b}"][data-slot="0"]`).click();
  await expect(sw(page)).toBeVisible();
  return page.evaluate(() => window.__rm.getState().pattern.id);
}

// --- AC-2.18.1: the switch -------------------------------------------------------

test('AC-2.18.1/1 — While the Pattern is Percussive, the Pattern header shows a percussion switch, Accents and Drum kit, beside the Sound Mode switch, Accents pressed until Drum kit is chosen; while it is Melodic the switch is not shown', async ({ page }) => {
  await openApp(page);
  await fourBeats(page);
  await expect(sw(page).locator('button')).toHaveText(['Accents', 'Drum kit']);
  await expect(option(page, 'accents')).toHaveAttribute('aria-pressed', 'true');
  await expect(sw(page).locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.voice-switch')).toHaveCount(0);
  // Beside the Sound Mode switch: the next thing in the header, on the same row.
  const adjacent = await page.evaluate(() => document.querySelector('.pattern-header .sound-mode').nextElementSibling?.contains(document.querySelector('.percussion-switch')));
  expect(adjacent).toBe(true);
  const mode = await page.locator('.sound-mode').boundingBox();
  const box = await sw(page).boundingBox();
  expect(Math.abs(mode.y - box.y)).toBeLessThan(4);
  expect(box.x).toBeGreaterThan(mode.x + mode.width - 1);

  await option(page, 'drums').click();
  await expect(option(page, 'drums')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'accents')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(page.locator('.percussion-switch')).toHaveCount(0);
  await expect(page.locator('.voice-switch')).toBeVisible();
  // Back to Percussive, the Pattern is still on the kit.
  await page.locator('.sound-mode [data-mode="percussive"]').click();
  await expect(option(page, 'drums')).toHaveAttribute('aria-pressed', 'true');
});

test('AC-2.18.1/2 — The choice is remembered for that Pattern alone across loads, and is never Pattern content: choosing never prompts on a shipped Pattern, never changes the Pattern, and no Pattern export carries it', async ({ page }) => {
  await openApp(page);
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), BOSSA);
  await expect(option(page, 'accents')).toHaveAttribute('aria-pressed', 'true');
  const before = await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));

  await option(page, 'drums').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(option(page, 'drums')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern))).toBe(before);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  expect(await page.evaluate(() => window.__rm.canUndo())).toBe(false);

  // That Pattern alone: one of the musician's own is on Accents.
  const owned = await fourBeats(page);
  await expect(option(page, 'accents')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), BOSSA);
  await expect(option(page, 'drums')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, true), owned);
  await expect(option(page, 'accents')).toHaveAttribute('aria-pressed', 'true');

  // Kept beside the Patterns; no stored Pattern and no export carries it.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.overlays.v1')).byPatternId)).toMatchObject({ [BOSSA]: { percussion: 'drums' } });
  expect(await page.evaluate(() => localStorage.getItem('rm.patterns.v1'))).not.toMatch(/"percussion"/);
  expect(await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern))).not.toMatch(/"percussion"/);
});

test('AC-2.18.1/3 — Choosing Accents or Drum kit while playing changes the sound from the next note, with no restart', async ({ page }) => {
  await openApp(page);
  await fourBeats(page);
  await play(page);
  await expect.poll(async () => (await heard(page)).length, { timeout: 5000 }).toBeGreaterThan(2);
  expect((await heard(page)).every((e) => e.mode === 'accents')).toBe(true);
  const loopsBefore = await page.evaluate(() => window.__rm.getState().loopCount ?? null);
  const playingSince = await page.evaluate(() => window.__rm.getState().isPlaying);
  expect(playingSince).toBe(true);

  const at = (await heard(page)).length;
  await option(page, 'drums').click();
  await expect.poll(async () => (await heard(page)).slice(at).filter((e) => e.mode === 'drums').length, { timeout: 5000 }).toBeGreaterThan(2);
  // Notes already scheduled ahead may still be accent tones; once a drum sounds, every later one is a drum.
  const after = (await heard(page)).slice(at);
  const first = after.findIndex((e) => e.mode === 'drums');
  expect(after.slice(first).every((e) => e.mode === 'drums')).toBe(true);
  // Nothing was stopped or restarted.
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
  if (loopsBefore !== null) expect(await page.evaluate(() => window.__rm.getState().loopCount)).toBeGreaterThanOrEqual(loopsBefore);

  const back = (await heard(page)).length;
  await option(page, 'accents').click();
  await expect.poll(async () => (await heard(page)).slice(back).filter((e) => e.mode === 'accents').length, { timeout: 5000 }).toBeGreaterThan(2);
  await stop(page);
});

// --- AC-2.18.2: what is heard ----------------------------------------------------

test('AC-2.18.2/2 — On Drum kit every note of a Percussive Pattern sounds its drum through the synthesised kit of AC-19.13.1 with no audio file requested, and on Accents every note sounds its accent tone as it always has', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => {
    if (/\.(mp3|wav|ogg)(\?|$)|gleitz\.github\.io|soundfont/i.test(r.url())) requests.push(r.url());
  });
  await openApp(page);
  await fourBeats(page);

  // On Accents: accent tones, no drum.
  await play(page);
  await expect.poll(async () => (await heard(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(4);
  await stop(page);
  const accents = await heard(page);
  expect(accents.every((e) => e.mode === 'accents' && e.midi === null)).toBe(true);
  expect(accents.slice(0, 4).map((e) => e.accent)).toEqual([3, 1, 2, 1]);

  // On Drum kit: Kick, Floor tom, Snare, Floor tom — the drum each accent names.
  await option(page, 'drums').click();
  const at = accents.length;
  await play(page);
  await expect.poll(async () => (await heard(page)).length - at, { timeout: 5000 }).toBeGreaterThanOrEqual(4);
  await stop(page);
  const kit = (await heard(page)).slice(at);
  expect(kit.every((e) => e.mode === 'drums')).toBe(true);
  expect(kit.slice(0, 4).map((e) => e.midi)).toEqual([36, 43, 38, 43]);
  expect(kit.every((e) => e.midi === { 3: 36, 2: 38, 1: 43 }[e.accent])).toBe(true);
  // Nothing melodic sounded, and nothing was fetched: the kit is synthesis.
  expect(await page.evaluate(() => window.__rm.voiceLog())).toEqual([]);
  expect(requests).toEqual([]);
});

test('AC-2.18.2/4 — The offline render of a Percussive Pattern on Drum kit sounds the drums, and on Accents the accent tones: the render the app makes at Play', async ({ page }) => {
  await openApp(page);
  await fourBeats(page);
  await play(page);
  await expect.poll(async () => (await heard(page, 'render')).length, { timeout: 10000 }).toBeGreaterThanOrEqual(4);
  expect((await heard(page, 'render')).every((e) => e.mode === 'accents')).toBe(true);
  const at = (await heard(page, 'render')).length;
  // Choosing the kit renders the run again, on the drums.
  await option(page, 'drums').click();
  await expect.poll(async () => (await heard(page, 'render')).slice(at).length, { timeout: 10000 }).toBeGreaterThanOrEqual(4);
  const again = (await heard(page, 'render')).slice(at);
  expect(again.every((e) => e.mode === 'drums')).toBe(true);
  expect(again.slice(0, 4).map((e) => e.midi)).toEqual([36, 43, 38, 43]);
  await stop(page);
});

test('AC-2.18.2/1 — A Strong note is the Kick on MIDI note 36, a Medium note the Snare on 38 and a Weak note the Floor tom on 43: as Practice plays them', async ({ page }) => {
  await openApp(page);
  await fourBeats(page);
  await option(page, 'drums').click();
  // The grid's own accents for the four Beats of 4/4: Strong, Weak, Medium, Weak.
  const accents = await page.locator('.grid .slot[data-slot="0"]').evaluateAll((els) => els.slice(0, 4).map((el) => Number(el.dataset.accent)));
  expect(accents).toEqual([3, 1, 2, 1]);
  await play(page);
  await expect.poll(async () => (await heard(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(4);
  await stop(page);
  const pass = (await heard(page)).slice(0, 4);
  expect(pass.map((e) => [e.accent, e.midi])).toEqual([
    [3, 36],
    [1, 43],
    [2, 38],
    [1, 43],
  ]);
});

test('AC-2.18.2/3 — The metronome click is the same on Accents and on Drum kit: in Practice', async ({ page }) => {
  await openApp(page);
  await fourBeats(page);
  await page.evaluate(() => window.__rm.handlers.onSetting({ metronomeEnabled: true }));
  const clicksAfterOnePass = async () => {
    const at = (await heard(page)).length;
    await play(page);
    await expect.poll(async () => (await heard(page)).length - at, { timeout: 8000 }).toBeGreaterThanOrEqual(4);
    const snapshot = await page.evaluate(() => window.__rm.transport._snapshot());
    await stop(page);
    return snapshot;
  };
  const accents = await clicksAfterOnePass();
  await option(page, 'drums').click();
  const kit = await clicksAfterOnePass();
  // The click runs under both, and the kit takes nothing of it: no click is logged as a drum.
  expect(accents.metronomeEnabled).toBe(true);
  expect(kit.metronomeEnabled).toBe(true);
  expect(accents.clicksScheduled).toBeGreaterThan(0);
  expect(kit.clicksScheduled).toBeGreaterThan(0);
  expect((await heard(page)).every((e) => [1, 2, 3].includes(e.accent))).toBe(true);
});
