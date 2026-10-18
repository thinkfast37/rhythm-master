import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, loadFourBeats, fret, key, cslot, recordAll } from './composer-helpers.js';

test.use(launch);

const noteAt = (page, beat, measure = 0) =>
  page.evaluate(([m, b]) => window.__rm.composer().draft.measures[m].beats[b].slots[0].pitch ?? null, [measure, beat]);

// --- AC-19.5.1: the composing grid ------------------------------------------------

test('AC-19.5.1/1 — A sounding Slot shows its note name and degree in the large upper box and its counting syllable in the smaller box below; a sounding Slot with no note shows the upper box empty, and a silent Slot shows neither', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  const pitched = cslot(page, 0, 0);
  await expect(pitched.locator('.cslot-name')).toHaveText('C4');
  await expect(pitched.locator('.cslot-degree')).toHaveText('1');
  await expect(pitched.locator('.cslot-syllable .slot-label')).toHaveText('ta');
  // The note box is above and larger.
  const noteBox = await pitched.locator('.cslot-note').boundingBox();
  const sylBox = await pitched.locator('.cslot-syllable').boundingBox();
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(sylBox.y + 1);
  expect(noteBox.height).toBeGreaterThan(sylBox.height);
  const unpitched = cslot(page, 0, 1);
  await expect(unpitched).toHaveClass(/unpitched/);
  await expect(unpitched.locator('.cslot-empty')).toBeVisible();
  await expect(unpitched.locator('.cslot-name')).toHaveCount(0);
  await expect(unpitched.locator('.cslot-syllable .slot-label')).toHaveText('ta');
  const silent = cslot(page, 0, 0, 1);
  await expect(silent.locator('.cslot-note')).toHaveAttribute('aria-disabled', 'true');
  await expect(silent.locator('.cslot-name, .cslot-empty')).toHaveCount(0);
  await expect(silent.locator('.slot-label')).toHaveAttribute('data-rest', 'true');
});

test("AC-19.5.1/2 — A counting system control sits among the Composer's controls, and the syllables follow it exactly as the grid's do (US-5.6)", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(cslot(page, 0, 1).locator('.slot-label')).toHaveText('ta');
  await page.locator('.composer-controls .composer-counting').selectOption('one-e-and-a');
  await expect(cslot(page, 0, 1).locator('.slot-label')).toHaveText('2');
  await expect(cslot(page, 0, 1, 2).locator('.slot-label')).toHaveAttribute('data-syllable', '&');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).countingSystem)).toBe('one-e-and-a');
});

test('AC-19.5.1/3 — The playback cursor, the record target and the selection are each marked differently, so all three can be read at once', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await cslot(page, 0, 0).locator('.cslot-note').click();
  await fret(page, 1, 1).click();
  await expect(cslot(page, 0, 0)).toHaveClass(/selected/);
  await expect(cslot(page, 0, 0)).toHaveAttribute('data-selected', 'true');
  await page.locator('.record').click();
  await expect(cslot(page, 0, 1)).toHaveClass(/target/);
  await expect(cslot(page, 0, 1)).toHaveAttribute('data-target', 'true');
  await expect(page.locator('.composer-grid .slot.selected')).toHaveCount(0);
  await page.locator('.transport').first().click();
  await expect(page.locator('.composer-grid .slot.playing')).toHaveCount(1);
  await expect(page.locator('.composer-grid .slot.target')).toHaveCount(1);
  const [t, p] = await Promise.all([
    page.locator('.composer-grid .slot.target').evaluate((e) => getComputedStyle(e).outlineStyle),
    page.locator('.composer-grid .slot.playing').evaluate((e) => getComputedStyle(e).backgroundColor),
  ]);
  expect(t).toBe('dashed');
  expect(p).not.toBe('rgba(0, 0, 0, 0)');
  await page.locator('.transport').first().click();
});

// --- AC-19.5.2: select and replace --------------------------------------------------

test("AC-19.5.2/1 — Tapping a sounding Slot's note box selects it, and only one Slot is selected at a time", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await cslot(page, 0, 1).locator('.cslot-note').click();
  expect((await composerState(page)).selected).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  await expect(cslot(page, 0, 1)).toHaveClass(/selected/);
  await cslot(page, 0, 3).locator('.cslot-note').click();
  await expect(page.locator('.composer-grid .slot.selected')).toHaveCount(1);
  await expect(cslot(page, 0, 3)).toHaveClass(/selected/);
});

test("AC-19.5.2/2 — A tap on a fret or key replaces the selected Slot's note, sounds it, and leaves the Slot selected", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await cslot(page, 0, 1).locator('.cslot-note').click();
  await fret(page, 0, 3).click(); // G4
  expect(await noteAt(page, 1)).toEqual({ degree: '5', octaveOffset: 0 });
  await expect(cslot(page, 0, 1).locator('.cslot-name')).toHaveText('G4');
  await expect(cslot(page, 0, 1)).toHaveClass(/selected/);
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toMatchObject({ midi: 67 });
  await page.locator('.instrument-switch [data-instrument="piano"]').click();
  await key(page, 69).click();
  expect(await noteAt(page, 1)).toEqual({ degree: '6', octaveOffset: 0 });
  await expect(cslot(page, 0, 1)).toHaveClass(/selected/);
  // The others are untouched.
  expect(await noteAt(page, 0)).toEqual({ degree: '1', octaveOffset: 0 });
  expect(await noteAt(page, 2)).toEqual({ degree: '3', octaveOffset: 0 });
});

test("AC-19.5.2/3 — Delete clears the selected Slot's note, and the Slot sounds percussively until a note is recorded onto it again", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await cslot(page, 0, 2).locator('.cslot-note').click();
  await page.locator('.composer-delete').click();
  expect(await noteAt(page, 2)).toBeNull();
  await expect(cslot(page, 0, 2)).toHaveClass(/unpitched/);
  const events = await page.evaluate(() => window.__rmTimeline.buildTimeline(window.__rm.composer().draft, 0).map((e) => e.pitch));
  expect(events[2]).toBeNull();
  expect(events[0]).not.toBeNull();
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '1');
});

test("AC-19.5.2/4 — Tapping the selected Slot's note box again, or a silent Slot, clears the selection; pressing Record clears it too", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await cslot(page, 0, 1).locator('.cslot-note').click();
  await expect(cslot(page, 0, 1)).toHaveClass(/selected/);
  await cslot(page, 0, 1).locator('.cslot-note').click();
  await expect(page.locator('.composer-grid .slot.selected')).toHaveCount(0);
  await cslot(page, 0, 1).locator('.cslot-note').click();
  // A silent note box says aria-disabled, which Playwright's own actionability
  // check honours; the tap itself still lands, as a finger's would.
  await cslot(page, 0, 1, 1).locator('.cslot-note').click({ force: true });
  await expect(page.locator('.composer-grid .slot.selected')).toHaveCount(0);
  await cslot(page, 0, 1).locator('.cslot-note').click();
  await page.locator('.record').click();
  expect((await composerState(page)).selected).toBeNull();
  await expect(page.locator('.composer-grid .slot.selected')).toHaveCount(0);
});

// --- AC-19.5.3: syllables ---------------------------------------------------------

test("AC-19.5.3/1 — Tapping the syllable box cycles the Slot's Accent Level exactly as the grid does — off, its default, the other two levels, off", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const cell = cslot(page, 0, 0, 2);
  const accents = [];
  for (let i = 0; i < 5; i++) {
    accents.push(await cell.getAttribute('data-accent'));
    await cell.locator('.cslot-syllable').click();
  }
  // Off → default (the "&" of Beat 1 is Weak) → the other two levels → off.
  expect(accents[0]).toBe('0');
  expect(new Set(accents.slice(1, 4))).toEqual(new Set(['1', '2', '3']));
  expect(accents[1]).toBe(await cell.getAttribute('data-metric'));
  // Five taps: round once and back to the default.
  expect(await cell.getAttribute('data-accent')).toBe(await cell.getAttribute('data-metric'));
  await cell.locator('.cslot-syllable').click();
  await cell.locator('.cslot-syllable').click();
  await cell.locator('.cslot-syllable').click();
  expect(await cell.getAttribute('data-accent')).toBe('0');
});

test('AC-19.5.3/2 — A Slot turned on has no note until one is recorded onto it, and sounds percussively meanwhile', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await cslot(page, 0, 0, 2).locator('.cslot-syllable').click();
  await expect(cslot(page, 0, 0, 2)).toHaveClass(/unpitched/);
  expect(await page.evaluate(() => window.__rm.composer().draft.measures[0].beats[0].slots[2].pitch ?? null)).toBeNull();
  const unpitched = await page.evaluate(() => window.__rmTimeline.buildTimeline(window.__rm.composer().draft, 0).filter((e) => e.pitch === null).length);
  expect(unpitched).toBe(1);
  await expect(page.locator('.record')).toBeEnabled();
});

test('AC-19.5.3/3 — A Slot cycled to off loses its note, and the count of syllables without a note follows', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await expect(page.locator('.composer-missing')).toHaveCount(0);
  await cslot(page, 0, 0, 2).locator('.cslot-syllable').click();
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '1');
  const cell = cslot(page, 0, 1);
  for (let i = 0; i < 4 && (await cell.getAttribute('data-accent')) !== '0'; i++) await cell.locator('.cslot-syllable').click();
  expect(await cell.getAttribute('data-accent')).toBe('0');
  expect(await noteAt(page, 1)).toBeNull();
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '1');
});

// --- AC-19.5.4: Double Length ---------------------------------------------------------

test('AC-19.5.4/1 — Double Length appends a copy of every Measure with its notes cleared, and the original Measures keep theirs', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-duplicate').click();
  await expect(page.locator('.composer-grid .measure')).toHaveCount(2);
  for (let b = 0; b < 4; b++) {
    expect(await noteAt(page, b, 0)).not.toBeNull();
    expect(await noteAt(page, b, 1)).toBeNull();
    await expect(cslot(page, 1, b)).toHaveClass(/unpitched/);
  }
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '4');
});

test('AC-19.5.4/2 — Record then targets the first sounding Slot of the copy', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-duplicate').click();
  await page.locator('.record').click();
  expect((await composerState(page)).target).toEqual({ measureIndex: 1, beatIndex: 0, slotIndex: 0 });
  await expect(cslot(page, 1, 0)).toHaveClass(/target/);
});

test('AC-19.5.4/3 — Double Length is disabled when the result would exceed 8 Measures', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(page.locator('.composer-duplicate')).toBeEnabled();
  await page.locator('.composer-duplicate').click(); // 2
  await page.locator('.composer-duplicate').click(); // 4
  await expect(page.locator('.composer-duplicate')).toBeEnabled();
  await page.locator('.composer-duplicate').click(); // 8
  await expect(page.locator('.composer-grid .measure')).toHaveCount(8);
  await expect(page.locator('.composer-duplicate')).toBeDisabled();
});

// --- AC-19.5.5: tempo and swing --------------------------------------------------------

test("AC-19.5.5/1 — The tempo entry sets the composition's tempo, and playback follows it", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-tempo-entry').fill('132');
  await page.locator('.composer-tempo-entry').press('Enter');
  expect((await composerState(page)).draft.tempo).toBe(132);
  await page.locator('.composer-tempo').fill('96');
  expect((await composerState(page)).draft.tempo).toBe(96);
  await page.locator('.transport').first().click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport._snapshot().pattern?.tempo)).toBe(96);
  await page.locator('.transport').first().click();
});

test("AC-19.5.5/2 — The swing amount and feel controls set the composition's swing, and playback follows them", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-swing-feel').selectOption('sixteenth');
  await page.locator('.composer-swing-entry').fill('40');
  await page.locator('.composer-swing-entry').press('Enter');
  const draft = (await composerState(page)).draft;
  expect(draft.swingFeel).toBe('sixteenth');
  expect(draft.swingAmount).toBe(40);
  await page.locator('.transport').first().click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport._snapshot().pattern?.swingAmount)).toBe(40);
  await page.locator('.transport').first().click();
});
