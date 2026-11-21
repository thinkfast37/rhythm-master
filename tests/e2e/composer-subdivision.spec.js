import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, appState, enterComposer, loadFourBeats, fret, cslot, recordAll } from './composer-helpers.js';

test.use(launch);

// --- AC-19.5.7: subdivisions edited in the Composer (T512) -----------------------

const strip = (page) => page.locator('.composer-panel .recipe-strip');
const chip = (page, label) => strip(page).locator('.recipe-chip', { hasText: new RegExp(`^${label}$`) });
const beat = (page, measure, b) => page.locator(`.composer-grid .measure[data-measure="${measure}"] .beat[data-beat="${b}"]`);
const recipeOf = (page, measure, b) => beat(page, measure, b).getAttribute('data-recipe');
const draftBeat = (page, measure, b) => page.evaluate(([m, i]) => window.__rm.composer().draft.measures[m].beats[i], [measure, b]);
const draftJson = (page) => page.evaluate(() => JSON.stringify(window.__rm.composer().draft));

async function arm(page, label) {
  await chip(page, label).click();
  await expect(chip(page, label)).toHaveAttribute('aria-pressed', 'true');
}

/** A 4/4 Measure and a 6/8 Measure, one syllable on the first Beat of each, open in the Composer. */
async function loadTwoMeters(page) {
  await page.evaluate(() => {
    const base = window.__rm.loadBlank('4/4');
    window.__rm.loadPattern(
      { ...structuredClone(base), id: 'p_meters', name: 'Meters', measures: [structuredClone(base.measures[0]), structuredClone(base.measures[0])] },
      { owned: true }
    );
  });
  await page.locator('[data-action="change-time-signature"][data-measure="1"]').click();
  await page.locator('.dialog-button[data-value="6/8"]').click();
  await expect(page.locator('.grid .measure[data-measure="1"]')).toHaveAttribute('data-time-signature', '6/8');
  await page.evaluate(async () => {
    await window.__rm.handlers.onSlotTap(0, 0, 0);
    await window.__rm.handlers.onSlotTap(1, 0, 0);
  });
  await enterComposer(page, { load: 'accept', name: 'Two meters' });
  await expect(page.locator('.composer-grid')).toBeVisible();
}

test('AC-19.5.7/1 — A Subdivision strip among the Composer controls offers the Recipes the open meters can take, one armed at a time, tapping the armed chip disarms it, and every chip is disabled in the Score view', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // Among the Composer's controls, and the same catalogue Practice's strip holds for 4/4.
  await expect(page.locator('.composer-controls .recipe-strip')).toBeVisible();
  const labels = await strip(page).locator('.recipe-chip').allTextContents();
  expect(labels).toEqual(expect.arrayContaining(['Straight 8ths', 'Straight 16ths', 'Triplet 8ths']));
  // A Recipe no Measure of a 4/4 part can take is there, and disabled.
  await expect(chip(page, 'Triplet 8ths')).toBeEnabled();
  await expect(strip(page).locator('.recipe-chip:disabled')).not.toHaveCount(0);
  await expect(strip(page).locator('.recipe-chip[aria-pressed="true"]')).toHaveCount(0);

  await arm(page, 'Triplet 8ths');
  await arm(page, 'Straight 8ths');
  await expect(strip(page).locator('.recipe-chip[aria-pressed="true"]')).toHaveCount(1);
  expect((await appState(page)).armedRecipe).toBe('straight-8ths');
  await chip(page, 'Straight 8ths').click();
  await expect(strip(page).locator('.recipe-chip[aria-pressed="true"]')).toHaveCount(0);
  expect((await appState(page)).armedRecipe).toBeNull();

  await page.locator('.composer-view-switch [data-view="score"]').click();
  await expect(page.locator('.composer-scores')).toBeVisible();
  const chips = strip(page).locator('.recipe-chip');
  const count = await chips.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await expect(chips.nth(i)).toBeDisabled();
});

test('AC-19.5.7/2 — With a subdivision armed, a tap on either box of any Slot gives that Beat alone the armed Recipe and stays armed, and with none armed the boxes select and cycle as before', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.composer-add-measure').click();
  await expect(page.locator('.composer-grid .measure')).toHaveCount(2);

  // Unarmed: the note box selects, the syllable box cycles, and no Beat changes shape.
  await cslot(page, 0, 0).locator('.cslot-note').click();
  await expect(cslot(page, 0, 0)).toHaveClass(/selected/);
  await cslot(page, 0, 0).locator('.cslot-note').click();
  await cslot(page, 1, 3, 2).locator('.cslot-syllable').click();
  expect((await draftBeat(page, 1, 3)).slots[2].on).toBe(true);
  await cslot(page, 1, 3, 2).locator('.cslot-syllable').click();
  await cslot(page, 1, 3, 2).locator('.cslot-syllable').click();
  await cslot(page, 1, 3, 2).locator('.cslot-syllable').click();
  expect((await draftBeat(page, 1, 3)).slots[2].on).toBe(false);
  for (const [m, b] of [[0, 0], [1, 3]]) expect(await recipeOf(page, m, b)).toBe('straight-16ths');

  await arm(page, 'Triplet 8ths');
  // A syllable box, in the last Beat of the second Measure — an empty Beat, so no ask.
  await cslot(page, 1, 3, 1).locator('.cslot-syllable').click();
  await expect(beat(page, 1, 3)).toHaveAttribute('data-recipe', 'triplet-8ths');
  await expect(beat(page, 1, 3).locator('.slot')).toHaveCount(3);
  // A note box, in another Beat: still armed. A silent note box is aria-disabled, and the tap still lands.
  await cslot(page, 1, 1, 0).locator('.cslot-note').click({ force: true });
  await expect(beat(page, 1, 1)).toHaveAttribute('data-recipe', 'triplet-8ths');
  await expect(chip(page, 'Triplet 8ths')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.composer-grid .slot.selected')).toHaveCount(0);

  // Those two Beats alone: every other Beat is as it was.
  for (let m = 0; m < 2; m++) {
    for (let b = 0; b < 4; b++) {
      const changed = m === 1 && (b === 1 || b === 3);
      expect(await recipeOf(page, m, b)).toBe(changed ? 'triplet-8ths' : 'straight-16ths');
    }
  }
  expect((await draftBeat(page, 1, 3)).slots).toEqual([{ on: false }, { on: false }, { on: false }]);
});

test('AC-19.5.7/3 — A Beat with sounding syllables asks before it is cleared, cancelling leaves the Beat and its notes as they were, and an empty Beat changes with no ask', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-add-measure').click();
  await arm(page, 'Triplet 8ths');
  const before = await draftJson(page);

  await cslot(page, 0, 1).locator('.cslot-note').click();
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog')).toContainText('Changing subdivision will clear 1 note on this beat');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await draftJson(page)).toBe(before);
  await expect(cslot(page, 0, 1).locator('.cslot-name')).toHaveText('D4');

  await cslot(page, 0, 1).locator('.cslot-note').click();
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(beat(page, 0, 1)).toHaveAttribute('data-recipe', 'triplet-8ths');
  expect((await draftBeat(page, 0, 1)).slots).toEqual([{ on: false }, { on: false }, { on: false }]);
  // The other Beats keep their notes.
  await expect(cslot(page, 0, 0).locator('.cslot-name')).toHaveText('C4');
  await expect(cslot(page, 0, 2).locator('.cslot-name')).toHaveText('E4');

  // An empty Beat: no ask.
  await cslot(page, 1, 0).locator('.cslot-syllable').click();
  await expect(beat(page, 1, 0)).toHaveAttribute('data-recipe', 'triplet-8ths');
  await expect(page.locator('.dialog')).toHaveCount(0);
});

test('AC-19.5.7/4 — A Recipe the tapped Beat cannot take in its meter leaves that Beat unchanged', async ({ page }) => {
  await openApp(page);
  await loadTwoMeters(page);
  // Triplet feel is offered on a quarter-note Beat and not on an eighth-note one.
  await arm(page, 'Triplet 8ths');
  const before = await draftJson(page);
  const was = await recipeOf(page, 1, 0);
  await cslot(page, 1, 0).locator('.cslot-syllable').click();
  await cslot(page, 1, 3).locator('.cslot-note').click({ force: true });
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await recipeOf(page, 1, 0)).toBe(was);
  expect(await draftJson(page)).toBe(before);
  // The same armed Recipe lands on the 4/4 Measure.
  await cslot(page, 0, 2).locator('.cslot-syllable').click();
  await expect(beat(page, 0, 2)).toHaveAttribute('data-recipe', 'triplet-8ths');
});

test('AC-19.5.7/5 — A line under the composing grid names the armed subdivision while one is armed, and pressing Record disarms it', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const hint = page.locator('.composer-panel .composer-brush-hint');
  await expect(hint).toHaveCount(0);
  await arm(page, 'Triplet 8ths');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Subdivision — Triplet 8ths');
  await expect(hint).toHaveAttribute('data-brush', 'subdivision');
  // Under the grid.
  const gridBox = await page.locator('.composer-grid').boundingBox();
  const hintBox = await hint.boundingBox();
  expect(hintBox.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height - 1);
  await arm(page, 'Straight 8ths');
  await expect(hint).toContainText('Subdivision — Straight 8ths');

  await page.locator('.record').click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'true');
  expect((await appState(page)).armedRecipe).toBeNull();
  await expect(hint).toHaveCount(0);
  await expect(strip(page).locator('.recipe-chip[aria-pressed="true"]')).toHaveCount(0);
  // The grid is the grid again: a syllable tap cycles, and the Beat keeps its shape.
  await cslot(page, 0, 0, 2).locator('.cslot-syllable').click();
  expect(await recipeOf(page, 0, 0)).toBe('straight-16ths');
  expect((await draftBeat(page, 0, 0)).slots[2].on).toBe(true);
});

test('AC-19.5.7/6 — A selection or record target on the changed Beat does not survive it: the selection is dropped and the target moves to the first syllable without a note', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // A selection on Beat 2, then that Beat repainted.
  await cslot(page, 0, 1).locator('.cslot-note').click();
  await expect(cslot(page, 0, 1)).toHaveClass(/selected/);
  await arm(page, 'Straight 8ths');
  await cslot(page, 0, 1).locator('.cslot-syllable').click();
  await page.locator('.dialog-button.primary').click();
  await expect(beat(page, 0, 1)).toHaveAttribute('data-recipe', 'straight-8ths');
  expect((await composerState(page)).selected).toBeNull();
  await expect(page.locator('.composer-grid .slot.selected')).toHaveCount(0);

  // Recording targets Beat 1; armed while recording, that Beat is repainted.
  await page.locator('.record').click();
  expect((await composerState(page)).target).toEqual({ measureIndex: 0, beatIndex: 0, slotIndex: 0 });
  await arm(page, 'Straight 8ths');
  await cslot(page, 0, 0).locator('.cslot-syllable').click();
  await page.locator('.dialog-button.primary').click();
  await expect(beat(page, 0, 0)).toHaveAttribute('data-recipe', 'straight-8ths');
  // Beats 1 and 2 are silent now: the first syllable without a note is Beat 3's.
  const c = await composerState(page);
  expect(c.recording).toBe(true);
  expect(c.target).toEqual({ measureIndex: 0, beatIndex: 2, slotIndex: 0 });
  await expect(cslot(page, 0, 2)).toHaveClass(/target/);
});

test('AC-19.5.7/7 — The new Slots are turned on and recorded onto like any others, and a saved composition keeps the changed subdivision', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await arm(page, 'Triplet 8ths');
  await cslot(page, 0, 3).locator('.cslot-syllable').click();
  await page.locator('.dialog-button.primary').click();
  await expect(beat(page, 0, 3).locator('.slot')).toHaveCount(3);
  await chip(page, 'Triplet 8ths').click();

  // All three triplet syllables on, each unpitched until recorded.
  for (let s = 0; s < 3; s++) await cslot(page, 0, 3, s).locator('.cslot-syllable').click();
  for (let s = 0; s < 3; s++) await expect(cslot(page, 0, 3, s)).toHaveClass(/unpitched/);
  await expect(page.locator('.composer-save')).toBeDisabled();
  await page.locator('.record').click();
  expect((await composerState(page)).target).toEqual({ measureIndex: 0, beatIndex: 3, slotIndex: 0 });
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await fret(page, 0, 0).click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
  await expect(cslot(page, 0, 3, 0).locator('.cslot-name')).toHaveText('C4');
  await expect(cslot(page, 0, 3, 1).locator('.cslot-name')).toHaveText('D4');
  await expect(cslot(page, 0, 3, 2).locator('.cslot-name')).toHaveText('E4');

  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  const saved = await page.evaluate(() => window.__rm.patternStore.loadAll().find((p) => p.name === 'My line') ?? null);
  expect(saved).not.toBeNull();
  expect(saved.measures[0].beats[3].recipe).toBe('triplet-8ths');
  expect(saved.measures[0].beats[3].slots.map((s) => s.pitch.degree)).toEqual(['1', '2', '3']);
  expect(saved.measures[0].beats[0].recipe).toBe('straight-16ths');
});
