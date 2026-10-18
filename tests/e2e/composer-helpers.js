/**
 * Shared fixtures for the Composer suites (US-19.1–US-19.9).
 *
 * Every suite opens the app in Lab, keeps the guitar's samples from being
 * fetched unless it is about them, and builds its rhythm through the app's own
 * seams rather than by hand.
 */
import { expect } from '@playwright/test';

export const launch = {
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
};

export const SAMPLE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_guitar_steel-mp3.js';

/** Open the app with the sample request blocked (so no suite waits on the network). */
export async function openApp(page, { samples = 'abort' } = {}) {
  if (samples === 'abort') await page.route('https://gleitz.github.io/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
}

export const composerState = (page) => page.evaluate(() => window.__rm.composer());
export const appState = (page) => page.evaluate(() => window.__rm.getState());

export async function enterComposer(page) {
  await page.locator('.mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.composer-panel')).toBeVisible();
}

export async function leaveComposer(page) {
  await page.locator('.mode-switch [data-mode="practice"]').click();
}

/**
 * An owned 4/4 Pattern, one syllable on each Beat, stored as `p_test` — built in
 * Practice through the app's own slot taps, so it auto-saves as any edit does.
 */
export async function makeFourBeats(page, name = 'Fixture') {
  await page.evaluate(async (n) => {
    window.__rm.loadBlank('4/4', n);
    for (let b = 0; b < 4; b++) await window.__rm.handlers.onSlotTap(0, b, 0);
  }, name);
  await expect(page.locator('.grid .slot[data-beat="3"][data-slot="0"].accent-weak, .grid .slot[data-beat="3"][data-slot="0"].accent-medium, .grid .slot[data-beat="3"][data-slot="0"].accent-strong').first()).toBeVisible();
}

/** Open an owned or shipped Pattern into the Composer, naming the composition when asked. */
export async function openInComposer(page, id, owned, name = 'My line') {
  await page.evaluate(([i, o]) => window.__rm.handlers.onOpen(i, o), [id, owned]);
  await expect(page.locator('.dialog')).toBeVisible();
  if (name !== null) {
    await page.locator('.dialog-input').fill(name);
    await page.locator('.dialog-button.primary').click();
    await expect(page.locator('.dialog')).toHaveCount(0);
    await expect(page.locator('.composer-grid')).toBeVisible();
  }
}

/** The whole path: a four-syllable rhythm open in the Composer as an unsaved composition. */
export async function loadFourBeats(page, name = 'My line') {
  await makeFourBeats(page);
  await enterComposer(page);
  await openInComposer(page, 'p_test', true, name);
}

export const fret = (page, string, fretNumber) => page.locator(`.fretboard .note[data-string="${string}"][data-fret="${fretNumber}"]`);
export const key = (page, midi) => page.locator(`.piano .key[data-midi="${midi}"]`);
export const cslot = (page, measure, beat, slot = 0) =>
  page.locator(`.composer-grid .slot[data-measure="${measure}"][data-beat="${beat}"][data-slot="${slot}"]`);

/** Record every syllable of the four-Beat fixture from the fretboard: C4 D4 E4 F4. */
export async function recordAll(page) {
  await page.locator('.record').click();
  for (const [s, f] of [
    [1, 1],
    [1, 3],
    [0, 0],
    [0, 1],
  ]) {
    await fret(page, s, f).click();
  }
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
}

/** A tiny valid WAV as a data URI, for a fake soundfont the browser can decode. */
export function wavDataUri() {
  const samples = 200;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true);
  v.setUint32(28, 22050 * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 3) * 8000), true);
  return `data:audio/wav;base64,${Buffer.from(buf).toString('base64')}`;
}

/** A MIDI.js-format soundfont file holding the named notes. */
export function fakeSoundfont(notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']) {
  const uri = wavDataUri();
  const body = notes.map((n) => `"${n}": "${uri}",`).join('\n');
  return `MIDI.Soundfont.acoustic_guitar_steel = {\n${body}\n}`;
}
