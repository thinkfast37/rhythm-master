import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, composerState, loadFourBeats, fret, key, cslot, recordAll } from './composer-helpers.js';

test.use(launch);

const target = async (page) => (await composerState(page)).target;
const noteAt = (page, beat) => page.evaluate((b) => window.__rm.composer().draft.measures[0].beats[b].slots[0].pitch ?? null, beat);

// --- AC-19.4.1: Record targets the first syllable without a note ----------------

test('AC-19.4.1/1 — Pressing Record marks the first sounding Slot with no note, in playing order, as the target, shown in the composing grid by a mark that is neither the playback cursor nor the selection', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'true');
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 0, slotIndex: 0 });
  await expect(cslot(page, 0, 0)).toHaveClass(/target/);
  await expect(cslot(page, 0, 0)).not.toHaveClass(/selected|playing/);
  await expect(page.locator('.composer-grid .slot.target')).toHaveCount(1);
  // With the first two pitched, Record starts on the third.
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.locator('.record').click(); // off
  await page.locator('.record').click(); // on again
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 2, slotIndex: 0 });
  await expect(cslot(page, 0, 2)).toHaveClass(/target/);
});

test('AC-19.4.1/2 — With every sounding Slot already pitched, Record is disabled and a hint says every syllable has a note', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await expect(page.locator('.record')).toBeDisabled();
  await expect(page.locator('.record-hint')).toContainText('Every syllable has a note');
});

test('AC-19.4.1/3 — With no composition loaded, Record is disabled', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await expect(page.locator('.record')).toBeDisabled();
  await expect(page.locator('.composer-delete')).toBeDisabled();
});

// --- AC-19.4.2: a tap records and moves on -------------------------------------

test("AC-19.4.2/1 — A tap on a fret or key gives the target that note, shown in the Slot's note box, and sounds it with the instrument's voice", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await fret(page, 1, 1).click(); // C4 on the B string
  expect(await noteAt(page, 0)).toEqual({ degree: '1', octaveOffset: 0 });
  await expect(cslot(page, 0, 0).locator('.cslot-note')).toHaveAttribute('data-note-name', 'C4');
  await expect(cslot(page, 0, 0).locator('.cslot-name')).toHaveText('C4');
  const log = await page.evaluate(() => window.__rm.voiceLog());
  expect(log.at(-1)).toMatchObject({ instrument: 'guitar', midi: 60 });
  // A key does the same.
  await page.locator('.instrument-switch [data-instrument="piano"]').click();
  await key(page, 62).click();
  expect(await noteAt(page, 1)).toEqual({ degree: '2', octaveOffset: 0 });
  await expect(cslot(page, 0, 1).locator('.cslot-name')).toHaveText('D4');
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toMatchObject({ instrument: 'piano', midi: 62 });
});

test('AC-19.4.2/2 — The target then moves to the next sounding Slot after it that has no note, in playing order', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // Pitch Beat 3 by hand first, so the record pass has to skip it.
  await cslot(page, 0, 2).locator('.cslot-note').click();
  await fret(page, 0, 0).click();
  await cslot(page, 0, 2).locator('.cslot-note').click(); // deselect
  await page.locator('.record').click();
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 0, slotIndex: 0 });
  await fret(page, 1, 1).click();
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  await fret(page, 1, 3).click();
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 3, slotIndex: 0 });
  await expect(cslot(page, 0, 3)).toHaveClass(/target/);
  await expect(cslot(page, 0, 2)).not.toHaveClass(/target/);
});

test('AC-19.4.2/3 — Recording the last sounding Slot without a note leaves record mode, with no target marked', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  for (const [s, f] of [[1, 1], [1, 3], [0, 0]]) await fret(page, s, f).click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'true');
  await fret(page, 0, 1).click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
  expect(await composerState(page)).toMatchObject({ recording: false, target: null });
  await expect(page.locator('.composer-grid .slot.target')).toHaveCount(0);
  await expect(page.locator('.composer-missing')).toHaveCount(0);
});

test('AC-19.4.2/4 — Pressing Record while recording leaves record mode and keeps every note recorded so far', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.locator('.record').click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
  expect(await noteAt(page, 0)).toEqual({ degree: '1', octaveOffset: 0 });
  expect(await noteAt(page, 1)).toEqual({ degree: '2', octaveOffset: 0 });
  expect(await noteAt(page, 2)).toBeNull();
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '2');
});

// --- AC-19.4.3: Delete steps back ---------------------------------------------

test('AC-19.4.3/1 — Delete clears the note of the nearest sounding Slot before the target and makes that Slot the target', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 2, slotIndex: 0 });
  await page.locator('.composer-delete').click();
  expect(await noteAt(page, 1)).toBeNull();
  expect(await noteAt(page, 0)).toEqual({ degree: '1', octaveOffset: 0 });
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  await expect(cslot(page, 0, 1)).toHaveClass(/target/);
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'true');
});

test('AC-19.4.3/2 — With the target on the first sounding Slot, Delete changes nothing', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await expect(page.locator('.composer-delete')).toBeDisabled();
  const before = await page.evaluate(() => JSON.stringify(window.__rm.composer()));
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => JSON.stringify(window.__rm.composer()))).toBe(before);
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 0, slotIndex: 0 });
});

test('AC-19.4.3/3 — The Delete and Backspace keys do what the Delete control does, in and out of record mode', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.keyboard.press('Delete');
  expect(await noteAt(page, 1)).toBeNull();
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  await page.keyboard.press('Backspace');
  expect(await noteAt(page, 0)).toBeNull();
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 0, slotIndex: 0 });
  // Out of record mode, on a selection.
  await page.locator('.record').click();
  await recordAll(page);
  await cslot(page, 0, 2).locator('.cslot-note').click();
  await page.keyboard.press('Delete');
  expect(await noteAt(page, 2)).toBeNull();
  // While typing in a field the keys are the field's.
  await page.locator('.composer-tempo-entry').focus();
  await page.keyboard.press('Backspace');
  expect(await noteAt(page, 0)).not.toBeNull();
});

// --- AC-19.4.4: stored as the Key hears it, proven through the board and the keys ----

test('AC-19.4.4/1 — For every fret of the board and every key of the keyboard, the stored Pitch resolves through `core/pitch.js` to exactly the MIDI note tapped — a round trip with no loss: through the instrument views', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-key').selectOption('Eb');
  await page.locator('.composer-scale').selectOption('locrian');
  await page.locator('.record').click();
  // Two frets, high and low, then two keys at the ends of the keyboard.
  await fret(page, 0, 24).click(); // E6, 88
  await fret(page, 5, 0).click(); // E2, 40
  await page.locator('.instrument-switch [data-instrument="piano"]').click();
  await page.locator('.keys-picker').selectOption('88');
  await key(page, 21).click(); // A0
  await key(page, 108).click(); // C8
  const midis = await page.evaluate(() =>
    window.__rmTimeline.buildTimeline(window.__rm.composer().draft, 0).map((e) => e.pitch.midiNote)
  );
  expect(midis).toEqual([88, 40, 21, 108]);
  // Spelled against E♭ Locrian: E is its ♭2 (F♭), A its ♭5.
  await expect(cslot(page, 0, 0).locator('.cslot-degree')).toHaveText('b2');
  await expect(cslot(page, 0, 0).locator('.cslot-name')).toHaveText('Fb6');
  await expect(cslot(page, 0, 2).locator('.cslot-degree')).toHaveText('b5');
});

test("AC-19.4.4/2 — An in-scale note takes the scale's own degree token — `b5` in Locrian and `#4` in Lydian for the same semitone — and an out-of-scale note the default chromatic token of its semitone above the root: through the board", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-scale').selectOption('lydian');
  await page.locator('.record').click();
  await fret(page, 0, 2).click(); // F#4 above C
  expect(await noteAt(page, 0)).toEqual({ degree: '#4', octaveOffset: 0 });
  await expect(cslot(page, 0, 0).locator('.cslot-degree')).toHaveText('#4');
  await page.locator('.composer-scale').selectOption('locrian');
  await fret(page, 0, 2).click(); // the same fret, now the scale's b5
  expect(await noteAt(page, 1)).toEqual({ degree: 'b5', octaveOffset: 0 });
  await expect(cslot(page, 0, 1).locator('.cslot-degree')).toHaveText('b5');
  await page.locator('.composer-scale').selectOption('ionian');
  await fret(page, 1, 2).click(); // C#4 / Db4, out of C Ionian: the default token
  expect(await noteAt(page, 2)).toEqual({ degree: 'b2', octaveOffset: 0 });
  await expect(cslot(page, 0, 2).locator('.cslot-name')).toHaveText('Db4');
});
