/**
 * Shift a part by an octave (US-19.14): Octave down and Octave up on a part's
 * row in the Layers section, the question each press asks, the shift in place
 * and the copy — proven in the DOM.
 *
 * Fixtures from the shipped library: Bossa Nova (s_21, percussive) and
 * Djembe 2 (s_108, melodic). The composition is the four-Beat fixture recorded
 * C4 D4 E4 F4, every note in octave 4.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, appState, loadFourBeats, fret, recordAll, leaveComposer } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const DJEMBE = 's_108';

const row = (page, id) => page.locator(`.composer-layers .layer-item[data-pattern-id="${id}"]`);
const onScreen = (page) => page.locator('.composer-layers .layer-item.composition');
const up = (item) => item.locator('.layer-octave-up');
const down = (item) => item.locator('.layer-octave-down');
const buttons = (page) => page.locator('.dialog .dialog-button');
const answer = (page, label) => page.locator('.dialog .dialog-button', { hasText: new RegExp(`^${label}$`) }).click();

/** Every note's stored octave offset, in playing order. */
const octavesOf = (pattern) =>
  pattern.measures.flatMap((m) => m.beats.flatMap((b) => b.slots.filter((s) => s.on && s.pitch).map((s) => s.pitch.octaveOffset ?? 0)));
const stored = (page, id) => page.evaluate((i) => window.__rm.patternStore.findById(i), id);
const shipped = (page, id) => page.evaluate((i) => window.__rm.seedStore.findById(i), id);

async function addLayer(page, id) {
  await page.locator('.layer-add').click();
  await expect(page.locator('.composer-layers [data-picking="true"]')).toBeVisible();
  await page.locator(`.pattern-item[data-pattern-id="${id}"] [data-action="open-pattern"]`).click();
  await expect(row(page, id)).toBeVisible();
}

async function saveComposition(page) {
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  return (await composerState(page)).savedId;
}

/** Press an octave button and take the dialog's first, primary, answer. */
async function shift(page, button) {
  await button.click();
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
}

async function acceptName(page) {
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
}

// --- AC-19.14.1: the buttons ----------------------------------------------------

test('AC-19.14.1/1 — In the Layers section every part that can sound a pitched note carries Octave down and Octave up, and a percussive layer and a part on Drums carry neither', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  await addLayer(page, DJEMBE);
  await addLayer(page, BOSSA);
  for (const item of [onScreen(page), row(page, DJEMBE)]) {
    await expect(down(item)).toBeVisible();
    await expect(up(item)).toBeVisible();
    await expect(down(item)).toHaveAttribute('aria-label', /^Octave down for /);
    await expect(up(item)).toHaveAttribute('aria-label', /^Octave up for /);
  }
  // A percussive layer has no note to move.
  await expect(row(page, BOSSA).locator('.layer-kind')).toHaveText('rhythm');
  await expect(row(page, BOSSA).locator('.layer-octave')).toHaveCount(0);
  // On Drums a note an octave away is another drum: the buttons go, and come back.
  await row(page, DJEMBE).locator('.layer-instrument').selectOption('drums');
  await expect(row(page, DJEMBE).locator('.layer-octave')).toHaveCount(0);
  await row(page, DJEMBE).locator('.layer-instrument').selectOption('piano');
  await expect(up(row(page, DJEMBE))).toBeVisible();
  await onScreen(page).locator('.layer-instrument').selectOption('drums');
  await expect(onScreen(page).locator('.layer-octave')).toHaveCount(0);
});

test('AC-19.14.1/2 — Octave up is disabled, saying why, when any note of the part is already in octave 7, Octave down when any is in octave 1, and both on a part with no note', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // No note yet: both disabled, saying so.
  await expect(up(onScreen(page))).toBeDisabled();
  await expect(down(onScreen(page))).toBeDisabled();
  await expect(up(onScreen(page))).toHaveAttribute('title', /No note to move/);
  await expect(down(onScreen(page))).toHaveAttribute('title', /No note to move/);
  await recordAll(page);
  await expect(up(onScreen(page))).toBeEnabled();
  await expect(down(onScreen(page))).toBeEnabled();
  // Octave 4 up to 7: three shifts, and no further.
  for (let i = 0; i < 3; i++) await shift(page, up(onScreen(page)));
  expect(octavesOf((await composerState(page)).draft)).toEqual([3, 3, 3, 3]);
  await expect(up(onScreen(page))).toBeDisabled();
  await expect(up(onScreen(page))).toHaveAttribute('title', /already in octave 7/);
  await expect(down(onScreen(page))).toBeEnabled();
  // Down to octave 1: six shifts, and no further.
  for (let i = 0; i < 6; i++) await shift(page, down(onScreen(page)));
  expect(octavesOf((await composerState(page)).draft)).toEqual([-3, -3, -3, -3]);
  await expect(down(onScreen(page))).toBeDisabled();
  await expect(down(onScreen(page))).toHaveAttribute('title', /already in octave 1/);
  await expect(up(onScreen(page))).toBeEnabled();
});

// --- AC-19.14.2: the question -----------------------------------------------------

test('AC-19.14.2/1 — Pressing either asks first, naming the part and the direction, and offers Shift this Pattern, Make a copy and Cancel; Cancel changes nothing', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  const before = JSON.stringify(await stored(page, mine));
  for (const [button, way] of [
    [up(onScreen(page)), 'up'],
    [down(onScreen(page)), 'down'],
  ]) {
    await button.click();
    await expect(page.locator('.dialog')).toContainText('"My line"');
    await expect(page.locator('.dialog')).toContainText(`${way} an octave`);
    await expect(buttons(page)).toHaveText(['Shift this Pattern', 'Make a copy', 'Cancel']);
    // Nothing has moved while the question stands.
    expect(octavesOf((await composerState(page)).draft)).toEqual([0, 0, 0, 0]);
    await answer(page, 'Cancel');
    await expect(page.locator('.dialog')).toHaveCount(0);
    expect(octavesOf((await composerState(page)).draft)).toEqual([0, 0, 0, 0]);
    expect(JSON.stringify(await stored(page, mine))).toBe(before);
    expect((await composerState(page)).savedId).toBe(mine);
  }
});

test('AC-19.14.2/2 — A part that is a shipped Pattern offers Make a copy and Cancel alone, saying the Pattern is built in', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  await addLayer(page, DJEMBE);
  await up(row(page, DJEMBE)).click();
  await expect(page.locator('.dialog')).toContainText('built in');
  await expect(buttons(page)).toHaveText(['Make a copy', 'Cancel']);
  await answer(page, 'Cancel');
  await expect(row(page, DJEMBE)).toBeVisible();
});

test('AC-19.14.2/3 — A part not yet saved to the library offers Shift and Cancel alone', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.locator('.record').click();
  expect((await composerState(page)).savedId).toBeNull();
  await up(onScreen(page)).click();
  await expect(buttons(page)).toHaveText(['Shift', 'Cancel']);
  await answer(page, 'Shift');
  expect(octavesOf((await composerState(page)).draft)).toEqual([1, 1]);
});

// --- AC-19.14.3: the shift in place -------------------------------------------------

test('AC-19.14.3/1 — Every note of the part moves one octave in the direction pressed, and no degree, syllable, Accent Level or other setting changes', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  const before = (await composerState(page)).draft;
  await shift(page, up(onScreen(page)));
  const raised = (await composerState(page)).draft;
  expect(octavesOf(raised)).toEqual([1, 1, 1, 1]);
  // The grid shows each note an octave up, under the same syllables.
  await expect(page.locator('.composer-grid')).toContainText('C5');
  await expect(page.locator('.composer-grid')).not.toContainText('C4');
  // Put the octaves back and it is the Pattern it was, to the last field.
  const undo = (p, step) => {
    const q = structuredClone(p);
    for (const m of q.measures) for (const b of m.beats) for (const s of b.slots) if (s.on && s.pitch) s.pitch.octaveOffset = (s.pitch.octaveOffset ?? 0) - step;
    return q;
  };
  const strip = (p) => ({ ...p, updatedAt: undefined, modifiedAt: undefined });
  expect(strip(undo(raised, 1))).toEqual(strip(before));
  // And down again, two octaves: one at a time.
  await shift(page, down(onScreen(page)));
  await shift(page, down(onScreen(page)));
  expect(octavesOf((await composerState(page)).draft)).toEqual([-1, -1, -1, -1]);
  await expect(page.locator('.composer-grid')).toContainText('C3');
});

test('AC-19.14.3/2 — A part saved to the library is saved shifted at once, so the Pattern is shifted in Practice and in every Section it is a part of', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  // A second owned melody, layered under the first: a part that is not on screen.
  await page.evaluate((id) => {
    const p = window.__rm.patternStore.findById(id);
    window.__rm.patternStore.upsert({ ...structuredClone(p), id: 'p_low', name: 'Low line' });
  }, mine);
  await addLayer(page, 'p_low');

  // The part on screen: the library has the shift as soon as it is made.
  await shift(page, up(onScreen(page)));
  expect(octavesOf(await stored(page, mine))).toEqual([1, 1, 1, 1]);
  // The layer: its own Pattern in the library is the one shifted.
  await shift(page, down(row(page, 'p_low')));
  expect(octavesOf(await stored(page, 'p_low'))).toEqual([-1, -1, -1, -1]);
  // What a Section plays is the library's Pattern, by id: the set the transport is handed has both shifts.
  const set = await page.evaluate(() => window.__rm.scheduled().layers.map((l) => ({ id: l.pattern.id, name: l.pattern.name, pattern: l.pattern })));
  expect(octavesOf(set.find((l) => l.name === 'Low line').pattern)).toEqual([-1, -1, -1, -1]);
  expect(octavesOf(set.find((l) => l.name === 'My line').pattern)).toEqual([1, 1, 1, 1]);
  // And in Practice the Pattern is the shifted one.
  await leaveComposer(page);
  await expect(page.locator('.composer-panel')).toBeHidden();
  const open = (await appState(page)).pattern;
  expect(open.id).toBe(mine);
  expect(octavesOf(open)).toEqual([1, 1, 1, 1]);
  // A reload reads the same from the store.
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  expect(octavesOf(await stored(page, mine))).toEqual([1, 1, 1, 1]);
  expect(octavesOf(await stored(page, 'p_low'))).toEqual([-1, -1, -1, -1]);
});

test('AC-19.14.3/3 — A shift made while playing is heard from the next pass with nothing stopped or restarted', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  await page.locator('.composer-tempo-entry').fill('240');
  await page.locator('.composer-tempo-entry').press('Enter');
  await page.locator('.transport').first().click();
  const voiceLog = () => page.evaluate(() => window.__rm.voiceLog());
  await expect.poll(async () => (await voiceLog()).length, { timeout: 8000 }).toBeGreaterThan(3);
  // C4 D4 E4 F4 so far.
  expect(new Set((await voiceLog()).map((v) => v.midi))).toEqual(new Set([60, 62, 64, 65]));
  const loopBefore = (await appState(page)).loop;
  const at = (await voiceLog()).length;
  await shift(page, up(onScreen(page)));
  // The next pass is an octave up, whole.
  await expect.poll(async () => (await voiceLog()).slice(at).filter((v) => v.midi === 72).length, { timeout: 8000 }).toBeGreaterThan(1);
  const after = (await voiceLog()).slice(at).map((v) => v.midi);
  const first = after.indexOf(72);
  expect(after.slice(first).every((m) => [72, 74, 76, 77].includes(m))).toBe(true);
  // What sounded before the switch was the old pass, finishing: no note of it comes after.
  expect(after.slice(0, first).every((m) => [60, 62, 64, 65].includes(m))).toBe(true);
  const state = await appState(page);
  expect(state.isPlaying).toBe(true);
  expect(state.loop).toBeGreaterThanOrEqual(loopBefore);
  await expect(page.locator('.transport').first()).toHaveText('Stop');
});

// --- AC-19.14.4: the copy -------------------------------------------------------------

test("AC-19.14.4/1 — Make a copy asks a name, pre-filled with the Pattern's name followed by octave up or octave down and unique in the library, and cancelling it changes nothing", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  const count = () => page.evaluate(() => window.__rm.patternStore.loadAll().length);
  const owned = await count();
  for (const [button, way] of [
    [up(onScreen(page)), 'up'],
    [down(onScreen(page)), 'down'],
  ]) {
    await button.click();
    await answer(page, 'Make a copy');
    await expect(page.locator('.dialog-input')).toHaveValue(`My line octave ${way}`);
    await page.locator('.dialog .dialog-button', { hasText: 'Cancel' }).click();
    await expect(page.locator('.dialog')).toHaveCount(0);
    expect(await count()).toBe(owned);
    expect((await composerState(page)).savedId).toBe(mine);
    expect(octavesOf((await composerState(page)).draft)).toEqual([0, 0, 0, 0]);
  }
  // A name the library already holds is refused, and the next free one offered.
  await up(onScreen(page)).click();
  await answer(page, 'Make a copy');
  await page.locator('.dialog-input').fill('My line');
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toContainText('already exists');
  await page.locator('.dialog-input').fill('My line octave up');
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await down(onScreen(page)).click();
  await answer(page, 'Make a copy');
  // The part on screen is now "My line octave up": its copy down is named for it.
  await expect(page.locator('.dialog-input')).toHaveValue('My line octave up octave down');
  await page.locator('.dialog .dialog-button', { hasText: 'Cancel' }).click();
  await up(onScreen(page)).click();
  await answer(page, 'Make a copy');
  await page.locator('.dialog-input').fill('My line octave up');
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toContainText('already exists');
});

test("AC-19.14.4/2 — The copy holds every note shifted and takes the part's place in the parts' order with its instrument, volume and mute, on screen if the part was; the Pattern it was copied from is unchanged and still in the library", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  await addLayer(page, DJEMBE);
  await addLayer(page, BOSSA);
  const djembe = row(page, DJEMBE);
  await djembe.locator('.layer-instrument').selectOption('bass');
  await djembe.locator('.layer-volume-entry').fill('50');
  await djembe.locator('.layer-volume-entry').press('Enter');
  await djembe.locator('.layer-mute').click();
  await expect(djembe).toHaveAttribute('data-muted', 'true');
  const original = await shipped(page, DJEMBE);
  const wasShipped = JSON.stringify(original);

  // A layer: the copy takes its place, second of three, with what the layer sounded with.
  await down(djembe).click();
  await answer(page, 'Make a copy');
  await acceptName(page);
  const items = page.locator('.composer-layers .layer-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(1).locator('.layer-name')).toHaveText(`${original.name} octave down`);
  await expect(items.nth(1)).toHaveAttribute('data-instrument', 'bass');
  await expect(items.nth(1)).toHaveAttribute('data-volume', '50');
  await expect(items.nth(1)).toHaveAttribute('data-muted', 'true');
  await expect(items.nth(2)).toHaveAttribute('data-pattern-id', BOSSA);
  await expect(row(page, DJEMBE)).toHaveCount(0);
  const copyId = await items.nth(1).getAttribute('data-pattern-id');
  const copy = await stored(page, copyId);
  expect(octavesOf(copy)).toEqual(octavesOf(original).map((o) => o - 1));
  // The shipped Pattern is as it was, and still in the library.
  expect(JSON.stringify(await shipped(page, DJEMBE))).toBe(wasShipped);
  await expect(page.locator(`.pattern-item[data-pattern-id="${DJEMBE}"]`)).toHaveCount(1);

  // The part on screen: the copy is on screen in its place, the original untouched.
  await up(onScreen(page)).click();
  await answer(page, 'Make a copy');
  await acceptName(page);
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveClass(/composition/);
  await expect(page.locator('.composer-name')).toHaveText('My line octave up');
  const c = await composerState(page);
  expect(c.savedId).not.toBe(mine);
  expect(octavesOf(c.draft)).toEqual([1, 1, 1, 1]);
  expect(octavesOf(await stored(page, mine))).toEqual([0, 0, 0, 0]);
  expect((await stored(page, mine)).name).toBe('My line');
  await expect(page.locator(`.pattern-item[data-pattern-id="${mine}"]`)).toHaveCount(1);
});

test('AC-19.14.4/3 — A copy with a note on every syllable is saved to the library at once, and one with a syllable still without a note is an unsaved composition as any other', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  // Complete: the copy is in the library the moment it is made.
  await up(onScreen(page)).click();
  await answer(page, 'Make a copy');
  await acceptName(page);
  const first = await composerState(page);
  expect(first.savedId).toBeTruthy();
  expect((await stored(page, first.savedId)).name).toBe('My line octave up');
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');

  // A syllable without a note: the copy cannot be a Pattern yet, and is not saved.
  await page.evaluate(() => window.__rm.handlers.onComposerSyllable(0, 0, 1));
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '1');
  const owned = await page.evaluate(() => window.__rm.patternStore.loadAll().length);
  await down(onScreen(page)).click();
  await answer(page, 'Make a copy');
  await acceptName(page);
  const second = await composerState(page);
  expect(second.savedId).toBeNull();
  expect(second.draft.name).toBe('My line octave up octave down');
  expect(octavesOf(second.draft)).toEqual([0, 0, 0, 0]);
  await expect(page.locator('.composer-unsaved')).toHaveAttribute('data-unsaved', 'new');
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '1');
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(owned);
  expect((await stored(page, mine)).name).toBe('My line');
});
