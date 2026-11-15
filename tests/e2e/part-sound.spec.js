/**
 * An instrument and a volume for each part (US-19.12): the pickers and the
 * volume controls in the Layers section, what a part then sounds with, what
 * a Section keeps of it, and how the fetched instruments load — proven
 * in the DOM.
 *
 * Fixtures from the shipped library: Bossa Nova (s_21, percussive) and
 * Djembe 2 (s_108, melodic). The soundfont CDN is aborted by `openApp` unless
 * a test is about it, so a fetched instrument sounds through the synth and is
 * still logged as the instrument it is.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, appState, loadFourBeats, fret, key, recordAll, fakeSoundfont } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const DJEMBE = 's_108';
const FONT = (name) => `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${name}-mp3.js`;

const play = (page) => page.locator('.transport').first().click();
const voiceLog = (page) => page.evaluate(() => window.__rm.voiceLog());
const levelLog = (page) => page.evaluate(() => window.__rm.levelLog());
const row = (page, id) => page.locator(`.composer-layers .layer-item[data-pattern-id="${id}"]`);
const onScreen = (page) => page.locator('.composer-layers .layer-item.composition');
const picker = (item) => item.locator('.layer-instrument');
const slider = (item) => item.locator('.layer-volume-slider');
const entry = (item) => item.locator('.layer-volume-entry');
const switchTo = (page, id) => page.locator(`.instrument-switch [data-instrument="${id}"]`);
const dB = (gain) => 20 * Math.log10(gain);

async function addLayer(page, id) {
  await page.locator('.layer-add').click();
  await expect(page.locator('.composer-layers [data-picking="true"]')).toBeVisible();
  await page.locator(`.pattern-item[data-pattern-id="${id}"] [data-action="open-pattern"]`).click();
  await expect(row(page, id)).toBeVisible();
}

async function setTempo(page, bpm) {
  await page.locator('.composer-tempo-entry').fill(String(bpm));
  await page.locator('.composer-tempo-entry').press('Enter');
}

async function saveComposition(page) {
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  return (await composerState(page)).savedId;
}

async function nameInDialog(page, name) {
  await expect(page.locator('.dialog')).toBeVisible();
  if (name !== undefined) await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
}

async function typeVolume(item, value) {
  await entry(item).fill(String(value));
  await entry(item).press('Enter');
}

/** The settings store, edited before the app reads it. */
async function withSettings(page, partial) {
  await page.evaluate((p) => localStorage.setItem('rm.settings.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('rm.settings.v1') ?? '{}'), ...p })), partial);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
}

/** Reopen the Composer after a reload, declining any prompt, and open the first saved Section. */
async function reopenSection(page) {
  await page.locator('.mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.composer-panel')).toBeVisible();
  await page.waitForTimeout(300);
  if (await page.locator('.dialog').count()) await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await page.locator('.section-item[data-section-id="arr_1"] .section-load').click();
  await expect(page.locator('.composer-layers .layer-item')).toHaveCount(3);
}

/** A saved composition with a melody and a rhythm under it, every part in the library. */
async function band(page) {
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  await addLayer(page, DJEMBE);
  await addLayer(page, BOSSA);
  return mine;
}

// --- AC-19.12.2: each part has its own instrument ------------------------------

test('AC-19.12.2/1 — In the Layers section every part that can sound a pitched note carries an instrument picker showing its instrument, and a percussive layer carries none', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // Before any layer: the composition is a part, with its picker on the Composer's instrument.
  await expect(picker(onScreen(page))).toHaveValue('guitar');
  await expect(picker(onScreen(page)).locator('option')).toHaveText(['Piano', 'Synth', 'Guitar', 'Electric guitar', 'Bass', 'Sax', 'Trumpet', 'Flute', 'Drums']);
  await addLayer(page, DJEMBE);
  await addLayer(page, BOSSA);
  await expect(picker(row(page, DJEMBE))).toHaveValue('piano');
  await expect(row(page, DJEMBE)).toHaveAttribute('data-instrument', 'piano');
  await expect(picker(row(page, BOSSA))).toHaveCount(0);
  await expect(row(page, BOSSA).locator('.layer-kind')).toHaveText('rhythm');
});

test('AC-19.12.2/2 — Choosing an instrument for a part changes that part alone, and is heard from its next note with nothing stopped or restarted', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.locator('.record').click();
  await addLayer(page, DJEMBE);
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).filter((v) => v.layer === 1).length, { timeout: 8000 }).toBeGreaterThan(1);
  const loopBefore = (await appState(page)).loop;
  const scheduledBefore = await page.evaluate(() => window.__rm.scheduled().layers.length);
  const at = (await voiceLog(page)).length;
  await picker(row(page, DJEMBE)).selectOption('bass');
  await expect(picker(row(page, DJEMBE))).toHaveValue('bass');
  await expect.poll(async () => (await voiceLog(page)).slice(at).filter((v) => v.layer === 1 && v.voice === 'bass').length, { timeout: 8000 }).toBeGreaterThan(1);
  // Wait for the part on screen to have sounded since, so there is something of its own to check.
  await expect.poll(async () => (await voiceLog(page)).slice(at).filter((v) => v.composition).length, { timeout: 8000 }).toBeGreaterThan(0);
  const after = (await voiceLog(page)).slice(at);
  // That part alone: the part on screen is still the guitar.
  expect(after.filter((v) => v.composition).length).toBeGreaterThan(0);
  expect(after.filter((v) => v.composition).every((v) => v.voice === 'guitar')).toBe(true);
  await expect(picker(onScreen(page))).toHaveValue('guitar');
  // Its next note: once one bass note has sounded, no later note of the layer is the piano.
  const layer = after.filter((v) => v.layer === 1).map((v) => v.voice);
  expect(layer.slice(layer.indexOf('bass')).every((v) => v === 'bass')).toBe(true);
  // Nothing stopped or restarted.
  const state = await appState(page);
  expect(state.isPlaying).toBe(true);
  expect(state.loop).toBeGreaterThanOrEqual(loopBefore);
  expect(await page.evaluate(() => window.__rm.scheduled().layers.length)).toBe(scheduledBefore);
  await play(page);
});

test("AC-19.12.2/3 — The picker of the part on screen and the record bar's instrument switch are one choice: setting either shows in the other, and the instrument view follows it", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(switchTo(page, 'guitar')).toHaveAttribute('aria-pressed', 'true');
  await picker(onScreen(page)).selectOption('sax');
  await expect(switchTo(page, 'sax')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.instrument-switch [aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.composer-instrument .piano')).toBeVisible();
  await expect(page.locator('.fretboard')).toHaveCount(0);
  await expect(page.locator('.composer-panel')).toHaveAttribute('data-voice', 'sax');
  await switchTo(page, 'electric').click();
  await expect(picker(onScreen(page))).toHaveValue('electric');
  await expect(page.locator('.composer-instrument .fretboard')).toBeVisible();
  await expect(page.locator('.piano')).toHaveCount(0);
  // A tap sounds the part's instrument.
  await fret(page, 0, 0).click();
  expect((await voiceLog(page)).at(-1)).toMatchObject({ instrument: 'guitar', voice: 'electric', midi: 64 });
});

test('AC-19.12.2/4 — A part keeps its instrument when it is put on screen and when it leaves: the part left sounds as it did, and the instrument view becomes the one the part now on screen is played on', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await nameInDialog(page, 'Line two');
  await setTempo(page, 240);
  await addLayer(page, mine);
  // Line two, on screen, on the trumpet (keyboard); My line, beneath, on the electric guitar.
  await switchTo(page, 'trumpet').click();
  await picker(row(page, mine)).selectOption('electric');
  await expect(page.locator('.composer-instrument .piano')).toBeVisible();
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).filter((v) => v.layer === 1 && v.voice === 'electric').length, { timeout: 8000 }).toBeGreaterThan(0);
  const at = (await voiceLog(page)).length;
  await row(page, mine).locator('.layer-pick').click();
  // My line is on screen with its own instrument, and the view is the one it is played on.
  await expect(switchTo(page, 'electric')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.composer-instrument .fretboard')).toBeVisible();
  await expect(picker(onScreen(page))).toHaveValue('electric');
  // Line two, left, keeps the trumpet.
  const left = page.locator('.composer-layers .layer-item:not(.composition)');
  await expect(left).toHaveCount(1);
  await expect(picker(left)).toHaveValue('trumpet');
  const c = await composerState(page);
  expect(c.instrument).toBe('electric');
  expect(c.layers.map((l) => l.instrument)).toEqual(['trumpet']);
  // And they sound as they did: the part on screen electric, the one left trumpet.
  await expect.poll(async () => (await voiceLog(page)).slice(at).some((v) => v.composition === true && v.voice === 'electric'), { timeout: 8000 }).toBe(true);
  await expect.poll(async () => (await voiceLog(page)).slice(at).some((v) => v.composition === false && v.voice === 'trumpet'), { timeout: 8000 }).toBe(true);
  const voices = new Set((await voiceLog(page)).slice(at).map((v) => v.voice));
  expect([...voices].sort()).toEqual(['electric', 'trumpet']);
  await play(page);
});

test('AC-19.12.2/5 — A layer newly added starts on the voice Practice remembers for its Pattern, and on Piano when there is none', async ({ page }) => {
  // Rewritten 2026-11-15 with the criterion (T504): Practice has no one voice to give any more.
  await openApp(page);
  await loadFourBeats(page);
  // Nothing remembered for Djembe 2: the layer starts on Piano.
  await addLayer(page, DJEMBE);
  await expect(picker(row(page, DJEMBE))).toHaveValue('piano');
  expect((await composerState(page)).layers[0].instrument).toBe('piano');
  await row(page, DJEMBE).locator('.layer-remove').click();
  await expect(row(page, DJEMBE)).toHaveCount(0);
  // Practice remembers Synth for it: added again, it starts there.
  await page.evaluate((id) => window.__rm.overlayStore.setVoice(id, 'synth'), DJEMBE);
  await addLayer(page, DJEMBE);
  await expect(picker(row(page, DJEMBE))).toHaveValue('synth');
  expect((await composerState(page)).layers[0].instrument).toBe('synth');
  // It is the layer's own from then on: Practice remembering another voice for the Pattern moves nothing.
  await page.evaluate((id) => window.__rm.overlayStore.setVoice(id, 'trumpet'), DJEMBE);
  await typeVolume(row(page, DJEMBE), 70);
  await expect(picker(row(page, DJEMBE))).toHaveValue('synth');
  expect((await composerState(page)).layers[0].instrument).toBe('synth');
});

test('AC-19.12.2/6 — A percussive layer has no instrument of its own, and put on screen it takes the instrument of the part it replaces', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, BOSSA);
  expect((await composerState(page)).layers[0].instrument).toBeUndefined();
  await switchTo(page, 'electric').click();
  await row(page, BOSSA).locator('.layer-pick').click();
  await nameInDialog(page, 'Bossa line');
  // Bossa line is on screen, on the electric guitar the Composer was on; My line, left, keeps it too.
  await expect(switchTo(page, 'electric')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.composer-instrument .fretboard')).toBeVisible();
  await expect(picker(onScreen(page))).toHaveValue('electric');
  const c = await composerState(page);
  expect(c.instrument).toBe('electric');
  expect(c.layers.map((l) => l.instrument)).toEqual(['electric']);
});

// --- AC-19.12.3: each part has its own volume ------------------------------------

test('AC-19.12.3/1 — In the Layers section every part, a percussive layer included, carries a volume slider and a number box showing the same value, from 1 to 100, 80 until it is changed', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, DJEMBE);
  await addLayer(page, BOSSA);
  for (const item of [onScreen(page), row(page, DJEMBE), row(page, BOSSA)]) {
    await expect(slider(item)).toBeVisible();
    await expect(slider(item)).toHaveAttribute('type', 'range');
    await expect(slider(item)).toHaveAttribute('min', '1');
    await expect(slider(item)).toHaveAttribute('max', '100');
    await expect(slider(item)).toHaveValue('80');
    await expect(entry(item)).toBeVisible();
    await expect(entry(item)).toHaveAttribute('type', 'number');
    await expect(entry(item)).toHaveAttribute('min', '1');
    await expect(entry(item)).toHaveAttribute('max', '100');
    await expect(entry(item)).toHaveValue('80');
    await expect(item).toHaveAttribute('data-volume', '80');
  }
});

test('AC-19.12.3/2 — Moving the slider or typing a number sets both, and a typed number outside 1 to 100 is held to the nearest end', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, BOSSA);
  for (const item of [onScreen(page), row(page, BOSSA)]) {
    await slider(item).fill('35');
    await expect(entry(item)).toHaveValue('35');
    await expect(item).toHaveAttribute('data-volume', '35');
    await typeVolume(item, 62);
    await expect(slider(item)).toHaveValue('62');
    await expect(item).toHaveAttribute('data-volume', '62');
    await typeVolume(item, 250);
    await expect(slider(item)).toHaveValue('100');
    await expect(entry(item)).toHaveValue('100');
    await typeVolume(item, 0);
    await expect(slider(item)).toHaveValue('1');
    await expect(entry(item)).toHaveValue('1');
    await typeVolume(item, -40);
    await expect(entry(item)).toHaveValue('1');
  }
  // Each part's own: the two were set separately and neither moved the other.
  await typeVolume(row(page, BOSSA), 44);
  await expect(entry(onScreen(page))).toHaveValue('1');
  const c = await composerState(page);
  expect(c.volume).toBe(1);
  expect(c.layers[0].volume).toBe(44);
});

test('AC-19.12.3/3 — A volume scales the loudness of every note of its part by 0.4 dB a step: 100 is the full level, 80 is 8 dB under it and 1 is 39.6 dB under it', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const tapAt = async (volume) => {
    await typeVolume(onScreen(page), volume);
    await fret(page, 0, 0).click();
    return dB((await levelLog(page)).at(-1).gain);
  };
  // Untouched, a part is at 80.
  await fret(page, 0, 0).click();
  expect(dB((await levelLog(page)).at(-1).gain)).toBeCloseTo(-8, 6);
  expect(await tapAt(100)).toBeCloseTo(0, 6);
  expect(await tapAt(80)).toBeCloseTo(-8, 6);
  expect(await tapAt(1)).toBeCloseTo(-39.6, 6);
  expect((await tapAt(51)) - (await tapAt(50))).toBeCloseTo(0.4, 6);
  // The title beside the controls says the same in words.
  await typeVolume(onScreen(page), 80);
  await expect(onScreen(page).locator('.layer-volume')).toHaveAttribute('title', /8\.0 dB under full/);
});

test("AC-19.12.3/4 — A volume changed while playing is heard from that part's next note with nothing stopped or restarted, on that part alone, and Mute silences a part whatever its volume", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.locator('.record').click();
  await addLayer(page, DJEMBE);
  await play(page);
  await expect.poll(async () => (await levelLog(page)).filter((v) => v.layer === 1).length, { timeout: 8000 }).toBeGreaterThan(1);
  // At the default, every part is 8 dB under full.
  const first = await levelLog(page);
  expect(first.filter((v) => v.layer !== undefined).every((v) => Math.abs(dB(v.gain) + 8) < 1e-6)).toBe(true);
  const loopBefore = (await appState(page)).loop;
  const at = first.length;
  await typeVolume(row(page, DJEMBE), 50);
  await expect.poll(async () => (await levelLog(page)).slice(at).filter((v) => v.layer === 1 && Math.abs(dB(v.gain) + 20) < 1e-6).length, { timeout: 8000 }).toBeGreaterThan(1);
  await expect.poll(async () => (await levelLog(page)).slice(at).filter((v) => v.composition).length, { timeout: 8000 }).toBeGreaterThan(0);
  const after = (await levelLog(page)).slice(at);
  // That part alone: the part on screen is still at 80.
  expect(after.filter((v) => v.composition).length).toBeGreaterThan(0);
  expect(after.filter((v) => v.composition).every((v) => Math.abs(dB(v.gain) + 8) < 1e-6)).toBe(true);
  // From its next note: once one note has sounded at 50, none after it sounds at 80.
  const levels = after.filter((v) => v.layer === 1).map((v) => Math.round(dB(v.gain)));
  expect(levels.slice(levels.indexOf(-20)).every((l) => l === -20)).toBe(true);
  // The part on screen's own volume, the same way.
  const mid = (await levelLog(page)).length;
  await typeVolume(onScreen(page), 100);
  await expect.poll(async () => (await levelLog(page)).slice(mid).filter((v) => v.composition && v.gain === 1).length, { timeout: 8000 }).toBeGreaterThan(0);
  const state = await appState(page);
  expect(state.isPlaying).toBe(true);
  expect(state.loop).toBeGreaterThanOrEqual(loopBefore);
  // Mute silences the part whatever its volume, and leaves the volume where it was.
  await typeVolume(row(page, DJEMBE), 100);
  await row(page, DJEMBE).locator('.layer-mute').click();
  await expect.poll(() => page.evaluate(() => window.__rm.scheduled().layers[1].muted)).toBe(true);
  const loopAtMute = (await appState(page)).loop;
  await expect.poll(async () => (await appState(page)).loop, { timeout: 8000 }).toBeGreaterThan(loopAtMute + 1);
  const end = (await levelLog(page)).length;
  await expect.poll(async () => (await appState(page)).loop, { timeout: 8000 }).toBeGreaterThan(loopAtMute + 3);
  expect((await levelLog(page)).slice(end).some((v) => v.layer === 1)).toBe(false);
  await expect(entry(row(page, DJEMBE))).toHaveValue('100');
  await play(page);
});

// --- AC-19.12.4: the Section's, never a Pattern's -------------------------------

test("AC-19.12.4/1 — Save section stores each part's instrument and volume, and opening the Section restores them", async ({ page }) => {
  await openApp(page);
  const mine = await band(page);
  await switchTo(page, 'sax').click();
  await typeVolume(onScreen(page), 70);
  await picker(row(page, DJEMBE)).selectOption('bass');
  await typeVolume(row(page, DJEMBE), 55);
  await typeVolume(row(page, BOSSA), 30);
  await page.locator('.section-save').click();
  await nameInDialog(page, 'Band');
  const [stored] = await page.evaluate(() => window.__rm.sectionStore.loadAll());
  expect(stored).toMatchObject({ name: 'Band', compositionId: mine, instrument: 'sax', volume: 70 });
  expect(stored.layers[0]).toMatchObject({ patternId: DJEMBE, muted: false, instrument: 'bass', volume: 55 });
  expect(stored.layers[1]).toMatchObject({ patternId: BOSSA, muted: false, volume: 30 });
  await expect(page.locator('.layers-unsaved')).toHaveCount(0);

  // Another instrument is remembered meanwhile, so what returns is the Section's and not the setting.
  await page.evaluate((id) => window.__rm.overlayStore.setVoice(id, 'trumpet'), DJEMBE);
  await withSettings(page, { composerInstrument: 'guitar' });
  await reopenSection(page);
  await expect(picker(onScreen(page))).toHaveValue('sax');
  await expect(switchTo(page, 'sax')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.composer-instrument .piano')).toBeVisible();
  await expect(entry(onScreen(page))).toHaveValue('70');
  await expect(picker(row(page, DJEMBE))).toHaveValue('bass');
  await expect(entry(row(page, DJEMBE))).toHaveValue('55');
  await expect(slider(row(page, BOSSA))).toHaveValue('30');
  await expect(page.locator('.layers-unsaved')).toHaveCount(0);
});

test('AC-19.12.4/2 — Changing an instrument or a volume in a saved Section saves it in place at once, as every other change to its parts does', async ({ page }) => {
  await openApp(page);
  await band(page);
  await page.locator('.section-save').click();
  await nameInDialog(page, 'Band');
  const stored = async () => (await page.evaluate(() => window.__rm.sectionStore.loadAll()))[0];
  await expect(page.locator('.layers-saved')).toBeVisible();
  // A layer's volume: saved as it is set, with nothing pressed.
  await typeVolume(row(page, BOSSA), 45);
  await expect.poll(async () => (await stored()).layers[1].volume).toBe(45);
  // A layer's instrument.
  await picker(row(page, DJEMBE)).selectOption('trumpet');
  await expect.poll(async () => (await stored()).layers[0].instrument).toBe('trumpet');
  // The part on screen's own instrument and volume.
  await switchTo(page, 'bass').click();
  await expect.poll(async () => (await stored()).instrument).toBe('bass');
  await typeVolume(onScreen(page), 64);
  await expect.poll(async () => (await stored()).volume).toBe(64);
  // In place: still the one Section, never shown as unsaved.
  expect(await page.evaluate(() => window.__rm.sectionStore.loadAll().length)).toBe(1);
  expect((await stored()).id).toBe('arr_1');
  await expect(page.locator('.layers-unsaved')).toHaveCount(0);
  await expect(page.locator('.layers-saved')).toBeVisible();
  // And it is what a reload brings back.
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await reopenSection(page);
  await expect(picker(onScreen(page))).toHaveValue('bass');
  await expect(entry(onScreen(page))).toHaveValue('64');
  await expect(picker(row(page, DJEMBE))).toHaveValue('trumpet');
  await expect(entry(row(page, BOSSA))).toHaveValue('45');
});

test("AC-19.12.4/3 — A Section saved before parts had instruments or volumes opens with the part on screen on the Composer's remembered instrument, every other part on the voice Practice remembers for its Pattern or on Piano when there is none, and every volume at 80", async ({ page }) => {
  await openApp(page);
  const mine = await band(page);
  await page.locator('.section-save').click();
  await nameInDialog(page, 'Bed');
  // The record as it was written before US-19.12: ids, mutes and the part on screen, nothing else.
  await page.evaluate(([id, djembe, bossa]) => {
    const store = JSON.parse(localStorage.getItem('rm.sections.v1'));
    store.sections = [{ id: 'arr_1', name: 'Bed', compositionId: id, layers: [{ patternId: djembe, muted: false }, { patternId: bossa, muted: false }], active: 0 }];
    localStorage.setItem('rm.sections.v1', JSON.stringify(store));
  }, [mine, DJEMBE, BOSSA]);
  // Practice remembers Synth for the melodic layer's Pattern (revised 2026-11-15, T504).
  await page.evaluate((id) => window.__rm.overlayStore.setVoice(id, 'synth'), DJEMBE);
  await withSettings(page, { composerInstrument: 'piano' });
  await reopenSection(page);
  await expect(picker(onScreen(page))).toHaveValue('piano');
  await expect(page.locator('.composer-instrument .piano')).toBeVisible();
  await expect(picker(row(page, DJEMBE))).toHaveValue('synth');
  for (const item of [onScreen(page), row(page, DJEMBE), row(page, BOSSA)]) await expect(entry(item)).toHaveValue('80');
  // Opened, it is not "changed": nothing was stamped on it.
  await expect(page.locator('.layers-unsaved')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.sectionStore.loadAll()[0])).toEqual({ id: 'arr_1', name: 'Bed', compositionId: mine, layers: [{ patternId: DJEMBE, muted: false }, { patternId: BOSSA, muted: false }], active: 0 });
});

test('AC-19.12.4/4 — Choosing an instrument or a volume changes no Pattern, and no Pattern export carries either', async ({ page }) => {
  await openApp(page);
  const mine = await band(page);
  const patterns = () => page.evaluate(() => localStorage.getItem('rm.patterns.v1'));
  const before = await patterns();
  const draftBefore = await page.evaluate(() => JSON.stringify(window.__rm.composer().draft));
  await switchTo(page, 'trumpet').click();
  await typeVolume(onScreen(page), 33);
  await picker(row(page, DJEMBE)).selectOption('bass');
  await typeVolume(row(page, DJEMBE), 12);
  await typeVolume(row(page, BOSSA), 91);
  await page.locator('.section-save').click();
  await nameInDialog(page, 'Band');
  expect(await patterns()).toBe(before);
  expect(await page.evaluate(() => JSON.stringify(window.__rm.composer().draft))).toBe(draftBefore);
  // Nothing outside the Section and the settings holds either, and the Pattern as exported has neither.
  const elsewhere = await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'rm.settings.v1' && k !== 'rm.sections.v1').map((k) => localStorage.getItem(k)).join('\n'));
  expect(elsewhere).not.toMatch(/"instrument"|"volume"/);
  const exported = await page.evaluate((id) => JSON.stringify(window.__rm.getState().pattern.id === id ? window.__rm.getState().pattern : null), mine);
  expect(exported).not.toBe('null');
  expect(exported).not.toMatch(/"instrument"|"volume"|trumpet/);
});

// --- AC-19.12.5: the fetched instruments ------------------------------------------

test('AC-19.12.5/1 — Electric guitar, Bass, Sax and Trumpet are the FluidR3_GM `overdriven_guitar`, `electric_bass_finger`, `alto_sax` and `trumpet` samples, each requested once, when a part in the Composer is first set to it or at the first melodic note in Practice under it, and never on page load', async ({ page }) => {
  const requests = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    requests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await withSettings(page, { composerInstrument: 'piano' });
  expect(requests).toHaveLength(0);
  await loadFourBeats(page);
  await addLayer(page, DJEMBE);
  expect(requests).toHaveLength(0);
  // The part on screen, set to each in turn: one request each, for that instrument's samples.
  const fonts = { electric: 'overdriven_guitar', bass: 'electric_bass_finger', sax: 'alto_sax' };
  for (const [id, font] of Object.entries(fonts)) {
    await switchTo(page, id).click();
    await expect.poll(() => requests.filter((u) => u === FONT(font)).length).toBe(1);
    await expect.poll(() => page.evaluate((i) => window.__rm.instruments.statusOf(i).status, id)).toBe('ready');
  }
  // A layer set to one, not on screen at all.
  await picker(row(page, DJEMBE)).selectOption('trumpet');
  await expect.poll(() => requests.filter((u) => u === FONT('trumpet')).length).toBe(1);
  // Once: going back to an instrument asks for nothing more.
  await switchTo(page, 'piano').click();
  await switchTo(page, 'sax').click();
  await picker(row(page, DJEMBE)).selectOption('bass');
  await key(page, 60).click();
  expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'sax', via: 'sampled', midi: 60 });
  expect(requests.sort()).toEqual([FONT('alto_sax'), FONT('electric_bass_finger'), FONT('overdriven_guitar'), FONT('trumpet')]);
});

test("AC-19.12.5/2 — While an instrument's samples load, or when they cannot, its notes sound through the synth; the record bar in the Composer and the voice switch in Practice say which instrument is loading, and a failure shows a non-blocking notice with Retry, which requests the samples again", async ({ page }) => {
  let mode = 'hold';
  const held = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    if (mode === 'hold') held.push(route);
    else if (mode === 'fail') route.abort();
    else route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await withSettings(page, { composerInstrument: 'piano' });
  await loadFourBeats(page);
  await switchTo(page, 'sax').click();
  // Loading: said in the record bar, and a note sounds through the synth meanwhile.
  const status = page.locator('.composer-bar .sample-status[data-sample="sax"]');
  await expect(status).toHaveAttribute('data-status', 'loading');
  await expect(status).toContainText('Loading Sax samples');
  await key(page, 60).click();
  expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'sax', via: 'fallback', midi: 60 });
  // Failing: a notice with Retry, nothing blocked, notes still sounding.
  mode = 'fail';
  for (const route of held.splice(0)) await route.abort();
  await expect(status).toHaveAttribute('data-status', 'error');
  await expect(status.locator('.sample-retry')).toBeVisible();
  await key(page, 62).click();
  expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'sax', via: 'fallback', midi: 62 });
  await expect(page.locator('.dialog')).toHaveCount(0);
  // Retry requests them again, and they arrive.
  mode = 'serve';
  await status.locator('.sample-retry').click();
  await expect(page.locator('.composer-bar .sample-status')).toHaveCount(0);
  await key(page, 64).click();
  expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'sax', via: 'sampled', midi: 64 });

  // Practice: the voice switch says the same of the voice chosen.
  mode = 'fail';
  await page.locator('.mode-switch [data-mode="practice"]').click();
  if (await page.locator('.dialog').count()) await page.locator('.dialog-button.primary').click();
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  for (let b = 0; b < 4; b++) await page.locator(`.grid .slot[data-beat="${b}"][data-slot="0"]`).click();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.locator('.voice-switch [data-voice="trumpet"]').click();
  await page.locator('[data-action="play"]').click();
  const note = page.locator('.melodic-voice .voice-status[data-sample="trumpet"]');
  await expect(note).toHaveAttribute('data-status', 'error');
  await expect(page.locator('.melodic-voice [data-action="sample-retry"]')).toBeVisible();
  const at = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 1);
  expect((await voiceLog(page)).slice(at).every((v) => v.voice === 'trumpet' && v.via === 'fallback')).toBe(true);
  mode = 'serve';
  await page.locator('.melodic-voice [data-action="sample-retry"]').click();
  await expect(page.locator('.melodic-voice .voice-status')).toHaveCount(0);
  await expect.poll(async () => (await voiceLog(page)).at(-1).via).toBe('sampled');
  await page.locator('[data-action="stop"]').click();
});

test("AC-19.12.5/3 — On Electric guitar, Bass, Sax and Trumpet a note is held until that part's next note begins or its recording ends; Piano, Synth and Guitar ring as they did", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // Stand a recording instrument in for each fetched voice: every note it is asked for, and when it was let go.
  await page.evaluate(() => {
    window.__notes = {};
    for (const [id, voice] of Object.entries(window.__rm.instruments.fetched)) {
      window.__notes[id] = [];
      voice.seams.reset();
      voice.seams.setLoader(() =>
        Promise.resolve({
          play(midi, when) {
            const note = { midi, when, stopped: null, stop: (at) => (note.stopped = at) };
            window.__notes[id].push(note);
            return note;
          },
        })
      );
    }
  });
  const notes = (id) => page.evaluate((i) => window.__notes[i].map((n) => ({ midi: n.midi, when: n.when, stopped: n.stopped })), id);
  for (const id of ['electric', 'bass', 'sax', 'trumpet']) {
    await switchTo(page, id).click();
    await expect.poll(() => page.evaluate((i) => window.__rm.instruments.statusOf(i).status, id)).toBe('ready');
    const tap = async (n) => (id === 'electric' ? fret(page, 0, n).click() : key(page, 60 + n).click());
    await tap(0);
    await tap(2);
    await tap(4);
    const played = await notes(id);
    expect(played).toHaveLength(3);
    // Each note is let go as the next begins; the last is left to its recording's end.
    expect(played[0].stopped).toBe(played[1].when);
    expect(played[1].stopped).toBe(played[2].when);
    expect(played[2].stopped).toBeNull();
  }
  // The guitar rings: nothing lets a note go.
  await switchTo(page, 'guitar').click();
  await expect.poll(() => page.evaluate(() => window.__rm.instruments.statusOf('guitar').status)).toBe('ready');
  await fret(page, 0, 0).click();
  await fret(page, 0, 2).click();
  expect((await notes('guitar')).map((n) => n.stopped)).toEqual([null, null]);
});

test('AC-19.12.5/5 — Flute is the FluidR3_GM `flute` samples, requested, held and falling back exactly as the four above are', async ({ page }) => {
  let serve = false;
  const requests = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    requests.push(route.request().url());
    if (serve) route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
    else route.abort();
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await withSettings(page, { composerInstrument: 'piano' });
  await loadFourBeats(page);
  expect(requests).toHaveLength(0);
  // Requested when the part is set to it; failing, it says so and the synth sounds the note.
  await switchTo(page, 'flute').click();
  await expect.poll(() => requests).toEqual([FONT('flute')]);
  const status = page.locator('.composer-bar .sample-status[data-sample="flute"]');
  await expect(status).toHaveAttribute('data-status', 'error');
  await key(page, 72).click();
  expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'flute', via: 'fallback', midi: 72 });
  // Retry brings the samples, and the keyboard stays the flute's place.
  serve = true;
  await status.locator('.sample-retry').click();
  await expect(page.locator('.composer-bar .sample-status')).toHaveCount(0);
  await expect(page.locator('.composer-instrument .piano')).toBeVisible();
  await key(page, 72).click();
  expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'flute', via: 'sampled', midi: 72 });
  // Held: with a recording instrument stood in, each note is let go as the next begins.
  await page.evaluate(() => {
    window.__flute = [];
    const voice = window.__rm.instruments.fetched.flute;
    voice.seams.reset();
    voice.seams.setLoader(() =>
      Promise.resolve({
        play(midi, when) {
          const note = { midi, when, stopped: null, stop: (at) => (note.stopped = at) };
          window.__flute.push(note);
          return note;
        },
      })
    );
  });
  await switchTo(page, 'piano').click();
  await switchTo(page, 'flute').click();
  await expect.poll(() => page.evaluate(() => window.__rm.instruments.statusOf('flute').status)).toBe('ready');
  await key(page, 72).click();
  await key(page, 74).click();
  const played = await page.evaluate(() => window.__flute.map((n) => ({ when: n.when, stopped: n.stopped })));
  expect(played).toHaveLength(2);
  expect(played[0].stopped).toBe(played[1].when);
  expect(played[1].stopped).toBeNull();
});

test("AC-19.12.5/4 — The screen-off render sounds every part through its own instrument at its own volume, and through the synth where an instrument's samples are not ready", async ({ page }) => {
  let serve = false;
  const held = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    if (serve) route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
    else held.push(route);
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await withSettings(page, { composerInstrument: 'synth' });
  await loadFourBeats(page);
  await setTempo(page, 240);
  await addLayer(page, DJEMBE);
  await picker(row(page, DJEMBE)).selectOption('sax');
  await play(page);
  // The layer's samples are not in: the render is the synth's, start to finish.
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.voice ?? null), { timeout: 15000 }).toBe('synth');
  expect(await page.evaluate(() => window.__rm.rendered().voices)).toEqual([]);
  // Arriving, they are rendered again: the layer through its sax, the part on screen still the synth it is set to.
  serve = true;
  for (const route of held.splice(0)) await route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  await expect.poll(() => page.evaluate(() => window.__rm.instruments.statusOf('sax').status)).toBe('ready');
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.voices ?? []), { timeout: 15000 }).toEqual(['sax']);
  expect(await page.evaluate(() => window.__rm.rendered().voice)).toBe('synth');
  await play(page);
});
