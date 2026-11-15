/**
 * Choose what a Key change does to the notes (US-19.15): the question the
 * Composer's scale root picker asks over written notes, and each of its
 * answers — proven in the DOM.
 *
 * The composition is the four-Beat fixture recorded C4 D4 E4 F4 from the
 * fretboard, in C. Djembe 2 (s_108, melodic) is the layer.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, loadFourBeats, recordAll, cslot } from './composer-helpers.js';

test.use(launch);

const DJEMBE = 's_108';
const WRITTEN = [60, 62, 64, 65];

const keyPicker = (page) => page.locator('.composer-key');
const dialog = (page) => page.locator('.dialog');
const labels = (page) => page.locator('.dialog .dialog-button').allTextContents();
const answer = async (page, label) => {
  await page.locator('.dialog .dialog-button', { hasText: new RegExp(`^${label}$`) }).click();
  await expect(dialog(page)).toHaveCount(0);
};

/** The MIDI notes the part on screen holds, in order, as the one timeline resolves them. */
const notes = (page) =>
  page.evaluate(() =>
    window.__rmTimeline
      .buildTimeline(window.__rm.composer().draft, 0)
      .filter((e) => e.pitch)
      .map((e) => e.pitch.midiNote)
  );
const degrees = async (page) =>
  (await composerState(page)).draft.measures.flatMap((m) => m.beats.flatMap((b) => b.slots.filter((s) => s.on && s.pitch).map((s) => s.pitch.degree)));
const stored = (page, id) => page.evaluate((i) => window.__rm.patternStore.findById(i), id);

async function written(page) {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  expect(await notes(page)).toEqual(WRITTEN);
}

async function save(page) {
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  return (await composerState(page)).savedId;
}

// --- AC-19.15.1: the question ---------------------------------------------------

test('AC-19.15.1/1 — Choosing another scale root while the part on screen has a note asks first, naming the new Key, and offers Keep the notes, Transpose up, Transpose down and Cancel; Cancel leaves the Key and every note as they were', async ({ page }) => {
  await written(page);
  await keyPicker(page).selectOption('G');
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('.dialog-message')).toContainText('G');
  expect(await labels(page)).toEqual(['Keep the notes', 'Transpose up to G', 'Transpose down to G', 'Cancel']);
  // Nothing has moved while the question stands.
  expect((await composerState(page)).draft.key).toBe('C');
  expect(await notes(page)).toEqual(WRITTEN);
  await answer(page, 'Cancel');
  expect((await composerState(page)).draft.key).toBe('C');
  await expect(keyPicker(page)).toHaveValue('C');
  expect(await notes(page)).toEqual(WRITTEN);
  expect(await degrees(page)).toEqual(['1', '2', '3', '4']);
});

test('AC-19.15.1/2 — A part with no note yet takes the new Key with no question', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await keyPicker(page).selectOption('G');
  await expect(dialog(page)).toHaveCount(0);
  expect((await composerState(page)).draft.key).toBe('G');
  await expect(keyPicker(page)).toHaveValue('G');
});

test('AC-19.15.1/3 — A part on Drums takes the new Key with no question and keeps its drums', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.instrument-switch [data-instrument="drums"]').click();
  await expect(page.locator('.piano')).toBeVisible();
  await page.locator('.record').click();
  for (const midi of [36, 42, 38, 46]) await page.locator(`.piano .key[data-midi="${midi}"]`).click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
  expect(await notes(page)).toEqual([36, 42, 38, 46]);
  await keyPicker(page).selectOption('A');
  await expect(dialog(page)).toHaveCount(0);
  expect((await composerState(page)).draft.key).toBe('A');
  expect(await notes(page)).toEqual([36, 42, 38, 46]);
});

test('AC-19.15.1/4 — With layers under the composition the question says that the other parts follow the Key', async ({ page }) => {
  await written(page);
  // Alone, the question says nothing of other parts.
  await keyPicker(page).selectOption('G');
  await expect(page.locator('.dialog-message')).not.toContainText('other parts');
  await answer(page, 'Cancel');
  await save(page);
  await page.locator('.layer-add').click();
  await expect(page.locator('.composer-layers [data-picking="true"]')).toBeVisible();
  await page.locator(`.pattern-item[data-pattern-id="${DJEMBE}"] [data-action="open-pattern"]`).click();
  await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${DJEMBE}"]`)).toBeVisible();
  await keyPicker(page).selectOption('G');
  await expect(page.locator('.dialog-message')).toContainText('The other parts follow the Key');
  await answer(page, 'Cancel');
});

// --- AC-19.15.2: keep the notes -------------------------------------------------

test('AC-19.15.2/1 — Choosing Keep the notes sets the Key and leaves every note on the MIDI note it sounded, shown as its degree in the new Key', async ({ page }) => {
  await written(page);
  const id = await save(page);
  await keyPicker(page).selectOption('G');
  await answer(page, 'Keep the notes');
  expect((await composerState(page)).draft.key).toBe('G');
  await expect(keyPicker(page)).toHaveValue('G');
  expect(await notes(page)).toEqual(WRITTEN);
  // C D E F against G: the fourth, fifth and sixth, and F a flat seventh.
  expect(await degrees(page)).toEqual(['4', '5', '6', 'b7']);
  // The note boxes still name the notes that were written.
  for (const [b, name] of ['C4', 'D4', 'E4', 'F4'].entries()) await expect(cslot(page, 0, b)).toContainText(name);
  // And the saved composition is saved as it now is (AC-19.9.2).
  const saved = await stored(page, id);
  expect(saved.key).toBe('G');
  expect(saved.measures[0].beats.map((b) => b.slots[0].pitch.degree)).toEqual(['4', '5', '6', 'b7']);
});

// --- AC-19.15.3: transpose ------------------------------------------------------

test('AC-19.15.3/4 — Choosing Transpose up or Transpose down sets the Key and moves the notes on screen, a saved composition is saved as it now is, and a direction that is refused is not offered, the question saying why', async ({ page }) => {
  await written(page);
  const id = await save(page);
  await keyPicker(page).selectOption('G');
  await answer(page, 'Transpose up to G');
  expect((await composerState(page)).draft.key).toBe('G');
  expect(await notes(page)).toEqual(WRITTEN.map((m) => m + 7));
  expect(await degrees(page)).toEqual(['1', '2', '3', '4']);
  await expect(cslot(page, 0, 0)).toContainText('G4');
  expect((await stored(page, id)).key).toBe('G');
  // Back to C, downward: where it began.
  await keyPicker(page).selectOption('C');
  await answer(page, 'Transpose down to C');
  expect(await notes(page)).toEqual(WRITTEN);
  // Down to G from there is a fourth below.
  await keyPicker(page).selectOption('G');
  await answer(page, 'Transpose down to G');
  expect(await notes(page)).toEqual(WRITTEN.map((m) => m - 5));
  await expect(cslot(page, 0, 0)).toContainText('G3');
  const saved = await stored(page, id);
  expect(saved.key).toBe('G');
  expect(saved.measures[0].beats.map((b) => b.slots[0].pitch.degree)).toEqual(['1', '2', '3', '4']);
  // Lowered until a note sits in the lowest octave, down to a root above is out of reach.
  const octaveDown = page.locator('.composer-layers .layer-item.composition .layer-octave-down');
  while (await octaveDown.isEnabled()) {
    await octaveDown.click();
    await page.locator('.dialog .dialog-button.primary').click();
    await expect(dialog(page)).toHaveCount(0);
  }
  await keyPicker(page).selectOption('A');
  expect(await labels(page)).toEqual(['Keep the notes', 'Transpose up to A', 'Cancel']);
  await expect(page.locator('.dialog-message')).toContainText('lowest');
  await answer(page, 'Cancel');
});
