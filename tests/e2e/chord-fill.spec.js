/*
 * US-2.15 — A fill for each chord of the progression, proved on the screen:
 * the Fill picker on each chord-editor row, the grid's note bands, the score,
 * the MIDI file, Cycle fills, a Song and Roll the dice. The pure deal is proved
 * in tests/unit/core/chord-fill.test.js.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * An owned Melodic Pattern in C Ionian: four Measures of 4/4 with a note on
 * every Beat, I–V–vi–IV changing every Measure over its roots, Ascending. At
 * rest the grid shows pass 1, in which Measure 4 is the IV — so a fill on the
 * fourth chord is visible without playing.
 */
async function varied(page) {
  await page.goto('/');
  await page.evaluate(() => {
    const h = window.__rm.handlers;
    window.__rm.loadBlank('4/4');
    h.onAddMeasure();
    h.onAddMeasure();
    h.onAddMeasure();
  });
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  for (let m = 0; m < 4; m++) for (let b = 0; b < 4; b++) await slotAt(page, b, 0, m).locator('.slot-accent').click();
  await page.locator('.progression-picker').selectOption('I-V-vi-IV');
  await page.locator('.arpeggio-picker').selectOption('up');
  await page.locator('.voicing-picker').selectOption('root');
  await page.locator('.chord-change[data-change="measure"]').click();
}

const slotAt = (page, beat, slot, measure = 0) =>
  page.locator(`.measure[data-measure="${measure}"] .slot[data-beat="${beat}"][data-slot="${slot}"]`);
const namesIn = (page, measure) => page.locator(`.measure[data-measure="${measure}"] .slot-note-name`).allTextContents();
const fillPicker = (page, chord) => page.locator(`.chord-editor[data-chord="${chord}"] .chord-fill`);
const pattern = (page) => page.evaluate(() => window.__rm.getState().pattern);
const chordFills = async (page) => (await pattern(page)).harmony.chords.map((c) => c.fill ?? null);
const fillInForce = (page) => page.evaluate(() => window.__rm.fillInForce());
const onTab = (page, name) => page.locator(`.workbench-tab[data-tab="${name}"]`).click();

const ASCENDING_I = ['C4', 'E4', 'G4', 'C4'];
const ASCENDING_IV = ['F4', 'A4', 'C5', 'F4'];
const DESCENDING_IV = ['C5', 'A4', 'F4', 'C5'];
const ALBERTI_IV = ['F4', 'C5', 'A4', 'C5'];

function midiNoteOns(bytes) {
  const ons = [];
  let i = 14 + 8;
  while (i < bytes.length) {
    while (bytes[i] & 0x80) i += 1;
    i += 1;
    const status = bytes[i];
    if (status === 0xff) i += 3 + bytes[i + 2];
    else {
      if ((status & 0xf0) === 0x90 && bytes[i + 2] > 0) ons.push(bytes[i + 1]);
      i += 3;
    }
  }
  return ons;
}

test("AC-2.15.1/1 — Each chord-editor row carries a Fill picker after the bass, offering As above first and then the whole fill catalogue under its group headings; As above names the Pattern's Arpeggio, and a row reads As above until a fill is chosen for its chord", async ({ page }) => {
  await varied(page);
  await expect(page.locator('.chord-editor .chord-fill')).toHaveCount(4);
  for (let c = 0; c < 4; c++) await expect(fillPicker(page, c)).toHaveValue('as-above');
  const picker = fillPicker(page, 3);
  await expect(picker).toHaveAttribute('aria-label', 'Chord 4 fill');
  const first = picker.locator('option').first();
  await expect(first).toHaveAttribute('value', 'as-above');
  await expect(first).toHaveText('As above (Ascending)');
  // After the bass picker in the row, and the catalogue under its eight headings.
  const order = await page.locator('.chord-editor[data-chord="3"]').evaluate((row) =>
    [...row.children].map((el) => el.className).filter((c) => c === 'chord-bass' || c === 'chord-fill')
  );
  expect(order).toEqual(['chord-bass', 'chord-fill']);
  expect(await picker.locator('optgroup').evaluateAll((gs) => gs.map((g) => g.label))).toEqual([
    'Chord tones', 'Fingerpicking', 'Open voicings', 'Drones', 'Pedal points', 'Scale walks', 'Repeated notes', 'Chromatic',
  ]);
  expect(await picker.locator('optgroup option').count()).toBe(await page.evaluate(() => window.__rm.catalogues().fills.length));
  // The label follows the Arpeggio.
  await page.locator('.arpeggio-picker').selectOption('alberti');
  await expect(fillPicker(page, 3).locator('option').first()).toHaveText('As above (Alberti)');
});

test("AC-2.15.1/2 — The picker is absent from every row while the Arpeggio is None, and setting the Arpeggio to None drops every chord's own fill, so setting it again afterwards finds every row at As above", async ({ page }) => {
  await varied(page);
  await fillPicker(page, 3).selectOption('down');
  expect(await chordFills(page)).toEqual([null, null, null, 'down']);
  await page.locator('.arpeggio-picker').selectOption('none');
  await expect(page.locator('.chord-editor .chord-fill')).toHaveCount(0);
  expect(await chordFills(page)).toEqual([null, null, null, null]);
  await page.locator('.arpeggio-picker').selectOption('up');
  await expect(page.locator('.chord-editor .chord-fill')).toHaveCount(4);
  for (let c = 0; c < 4; c++) await expect(fillPicker(page, c)).toHaveValue('as-above');
  expect(await namesIn(page, 3)).toEqual(ASCENDING_IV);
});

test("AC-2.15.1/3 — Choosing a fill for one chord changes that chord alone: the Arpeggio picker still shows the Pattern's Arpeggio and every other row keeps As above or its own fill", async ({ page }) => {
  await varied(page);
  await fillPicker(page, 3).selectOption('down');
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up');
  await expect(fillPicker(page, 3)).toHaveValue('down');
  for (const c of [0, 1, 2]) await expect(fillPicker(page, c)).toHaveValue('as-above');
  await fillPicker(page, 1).selectOption('alberti');
  await expect(fillPicker(page, 3)).toHaveValue('down');
  await expect(fillPicker(page, 1)).toHaveValue('alberti');
  expect(await chordFills(page)).toEqual([null, 'alberti', null, 'down']);
  expect(await namesIn(page, 0)).toEqual(ASCENDING_I);
  expect(await namesIn(page, 1)).toEqual(['G4', 'D5', 'B4', 'D5']);
  expect(await namesIn(page, 3)).toEqual(DESCENDING_IV);
});

test("AC-2.15.1/4 — Changing the Arpeggio changes what As above deals and leaves each chord's own fill as it is", async ({ page }) => {
  await varied(page);
  await fillPicker(page, 3).selectOption('down');
  await page.locator('.arpeggio-picker').selectOption('alberti');
  await expect(fillPicker(page, 3)).toHaveValue('down');
  expect(await chordFills(page)).toEqual([null, null, null, 'down']);
  expect(await namesIn(page, 0)).toEqual(['C4', 'G4', 'E4', 'G4']);
  expect(await namesIn(page, 3)).toEqual(DESCENDING_IV);
});

test("AC-2.15.1/5 — A chord's fill is Pattern content: it is saved with the Pattern and survives a reload, auto-saves into an owned Pattern, is one Undo step, is carried by the Pattern's JSON export and its submission, and on a shipped Pattern goes through the naming prompt, cancelling it leaving the Pattern as it was", async ({ page }) => {
  await varied(page);
  const id = (await pattern(page)).id;
  const stored = () => page.evaluate((pid) => window.__rm.patternStore.loadAll().find((p) => p.id === pid)?.harmony.chords.map((c) => c.fill ?? null), id);
  await fillPicker(page, 3).selectOption('down');
  // Auto-saved into the owned Pattern at once, and still there after a reload.
  expect(await stored()).toEqual([null, null, null, 'down']);
  await page.reload();
  expect(await stored()).toEqual([null, null, null, 'down']);
  // Back on the Pattern: the picker reads it, and one Undo takes it back.
  await page.evaluate((pid) => window.__rm.loadPattern(window.__rm.patternStore.loadAll().find((p) => p.id === pid), { owned: true }), id);
  await expect(fillPicker(page, 3)).toHaveValue('down');
  await fillPicker(page, 2).selectOption('alberti');
  await page.evaluate(() => window.__rm.undo());
  await expect(fillPicker(page, 2)).toHaveValue('as-above');
  await expect(fillPicker(page, 3)).toHaveValue('down');
  // The JSON the Pattern exports is the Pattern, the fill in it.
  expect(JSON.stringify(await pattern(page))).toContain('"fill":"down"');

  // A shipped Pattern: the naming prompt first; cancelled, nothing changes.
  await page.evaluate(() => {
    const p = structuredClone(window.__rm.getState().pattern);
    p.id = 'p_pretend_shipped';
    p.name = 'Pretend Shipped';
    p.measures[0].beats[3].slots[1] = { on: true, pitch: { degree: '5', octaveOffset: 0 } };
    window.__rm.loadPattern(p, { owned: false });
  });
  await fillPicker(page, 0).selectOption('down');
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button:not(.primary)', { hasText: 'Cancel' }).click();
  expect(await chordFills(page)).toEqual([null, null, null, 'down']);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await expect(fillPicker(page, 0)).toHaveValue('as-above');
});

test("AC-2.15.1/6 — Choosing a progression from the picker gives fresh chords with no fill of their own, a chord added with + Chord has none, editing a chord's root, quality or bass keeps its fill, and removing a chord takes its fill with it", async ({ page }) => {
  await varied(page);
  await fillPicker(page, 3).selectOption('down');
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await expect(page.locator('.chord-editor .chord-fill')).toHaveCount(3);
  expect(await chordFills(page)).toEqual([null, null, null]);
  await fillPicker(page, 2).selectOption('down');
  await page.locator('[data-action="add-chord"]').click();
  await expect(fillPicker(page, 3)).toHaveValue('as-above');
  expect(await chordFills(page)).toEqual([null, null, 'down', null]);
  await page.locator('.chord-editor[data-chord="2"] .chord-root').selectOption('6');
  await page.locator('.chord-editor[data-chord="2"] .chord-quality').selectOption('m7');
  await page.locator('.chord-editor[data-chord="2"] .chord-bass').selectOption('1');
  await expect(fillPicker(page, 2)).toHaveValue('down');
  await page.locator('[data-action="remove-chord"][data-chord="2"]').click();
  expect(await chordFills(page)).toEqual([null, null, null]);
});

test("AC-2.15.2/2 — Playback, the grid's note bands, the score and MIDI export all sound and show the chord's own fill, from the one timeline, and the pitch strip still says the notes follow the arpeggio", async ({ page }) => {
  await varied(page);
  expect(await namesIn(page, 3)).toEqual(ASCENDING_IV);
  await page.locator('.view-button[data-view="sheet"]').click();
  const scoreSteps = () => page.locator('.score .note-item[data-measure="3"]').evaluateAll((els) => els.map((e) => e.dataset.step));
  const before = await scoreSteps();
  await page.locator('.view-button[data-view="grid"]').click();
  await fillPicker(page, 3).selectOption('down');
  expect(await namesIn(page, 3)).toEqual(DESCENDING_IV);
  expect(await namesIn(page, 0)).toEqual(ASCENDING_I);
  await expect(page.locator('.pitch-strip', { hasText: 'Notes follow the Ascending arpeggio' })).toHaveCount(1);
  // The score: F A C F becomes C A F C — the outer notes swap with the inner.
  await page.locator('.view-button[data-view="sheet"]').click();
  const after = await scoreSteps();
  expect(after).toHaveLength(4);
  expect(after).toEqual([before[2], before[1], before[0], before[2]]);
  await page.locator('.view-button[data-view="grid"]').click();
  // The file: one pass of sixteen notes, the last four from the IV's 5th down.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-midi"]').click()]);
  const ons = midiNoteOns(readFileSync(await download.path()));
  expect(ons).toHaveLength(16);
  expect(ons.slice(12)).toEqual([72, 69, 65, 72]);
  expect(ons.slice(0, 4)).toEqual([60, 64, 67, 60]);
});

test("AC-2.15.3/1 — While Cycle fills has a fill in force it deals every chord, each chord's own fill suspended; turning cycle mode off, or stopping where stopping returns the Pattern's own fill, returns the Arpeggio and each chord's own fill together, and the Pattern's JSON is unchanged throughout", async ({ page }) => {
  await varied(page);
  await fillPicker(page, 3).selectOption('down');
  const json = JSON.stringify(await pattern(page));
  // With a fill set, the cycle begins from it (AC-2.7.1/3): Ascending is in force, on every chord.
  await page.locator('.fill-cycle').click();
  expect(await fillInForce(page)).toBe('up');
  expect(await namesIn(page, 3)).toEqual(ASCENDING_IV);
  // Every view follows the fill in force (AC-2.7.2/4): the row reads As above while it lasts.
  await expect(fillPicker(page, 3)).toHaveValue('as-above');
  expect(JSON.stringify(await pattern(page))).toBe(json);
  await page.locator('.fill-cycle').click();
  await expect(page.locator('.fill-cycle')).toHaveAttribute('aria-pressed', 'false');
  expect(await namesIn(page, 3)).toEqual(DESCENDING_IV);
  await expect(fillPicker(page, 3)).toHaveValue('down');
  expect(JSON.stringify(await pattern(page))).toBe(json);
});

test("AC-2.15.3/2 — While a Song plays, the Section's fill in force deals every chord the same way, and Stop returns the Arpeggio and each chord's own fill together", async ({ page }) => {
  await varied(page);
  await fillPicker(page, 3).selectOption('down');
  const json = JSON.stringify(await pattern(page));
  await page.evaluate(() => window.__rm.handlers.onKeepFill('alberti'));
  await onTab(page, 'compose');
  await page.locator('[data-section="compose"] .palette-fill[data-fill="alberti"]').click();
  await page.locator('[data-section="compose"] [data-action="play-song"]').click();
  expect(await fillInForce(page)).toBe('alberti');
  expect(await namesIn(page, 3)).toEqual(ALBERTI_IV);
  expect(await namesIn(page, 0)).toEqual(['C4', 'G4', 'E4', 'G4']);
  await page.locator('[data-action="stop"]').click();
  // Stopped: the Pattern's own Ascending, and the fourth chord's Descending with it.
  expect(await fillInForce(page)).toBe('up');
  expect(await namesIn(page, 3)).toEqual(DESCENDING_IV);
  await expect(fillPicker(page, 3)).toHaveValue('down');
  expect(JSON.stringify(await pattern(page))).toBe(json);
});

test("AC-2.15.3/3 — Rolling the Fill control sets the Arpeggio to the rolled fill and clears every chord's own fill, as one edit that one Undo takes back whole; with Fill marked No dice each chord's own fill is as it was", async ({ page }) => {
  await varied(page);
  await fillPicker(page, 3).selectOption('down');
  await fillPicker(page, 1).selectOption('alberti');
  for (const id of ['key', 'scale', 'register', 'progression', 'change', 'voicing']) {
    await page.locator(`.melody-group .nodice[data-control="${id}"]`).click();
  }
  await page.evaluate(() => { Math.random = () => 0.5; });
  await page.locator('.melody-group [data-action="roll-dice"]').click();
  const rolled = await pattern(page);
  expect(rolled.harmony.arpeggio).not.toBe('up');
  expect(rolled.harmony.chords.map((c) => c.fill ?? null)).toEqual([null, null, null, null]);
  for (let c = 0; c < 4; c++) await expect(fillPicker(page, c)).toHaveValue('as-above');
  await page.evaluate(() => window.__rm.undo());
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up');
  expect(await chordFills(page)).toEqual([null, 'alberti', null, 'down']);
  // Fill marked No dice: the roll has nothing left to move, and the chords keep their fills.
  await page.locator('.melody-group .nodice[data-control="fill"]').click();
  await expect(page.locator('.melody-group [data-action="roll-dice"]')).toBeDisabled();
  expect(await chordFills(page)).toEqual([null, 'alberti', null, 'down']);
});
