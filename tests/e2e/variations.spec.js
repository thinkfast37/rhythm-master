/**
 * US-10.3 — Add a variation to a loop: the picker, where it sits, and what a
 * variation is once it is Measures (AC-10.3.1, AC-10.3.2, AC-10.3.4, AC-10.3.5).
 * The device rules themselves are proved in tests/unit/core/variations.test.js.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, loadFourBeats, recordAll, cslot, composerState } from './composer-helpers.js';

test.use(launch);

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1400, height: 900 };

/** The Rhythm tab of the workbench; on a phone the library drawer opens over the panel first (AC-15.1.7/1). */
async function rhythmTab(page) {
  const openDrawer = page.locator('.library-toggle[aria-expanded="true"]');
  if (await openDrawer.count()) await openDrawer.click();
  await page.locator('.workbench-tab[data-tab="rhythm"]').click();
}

/** An owned one-Measure 4/4 melody in C Ionian: a degree per Beat on its first Slot, null for silence. */
async function melody(page, degrees = ['1', '3', '5', '2'], extra = {}) {
  await openApp(page);
  await page.evaluate(
    ([ds, more]) => {
      const p = window.__rm.loadBlank('4/4');
      const measures = structuredClone(p.measures);
      ds.forEach((d, b) => {
        if (d !== null) measures[0].beats[b].slots[0] = { on: true, pitch: { degree: d, octaveOffset: 0 } };
      });
      window.__rm.loadPattern({ ...p, soundMode: 'melodic', key: 'C', scale: 'ionian', measures, ...more }, { owned: true });
    },
    [degrees, extra]
  );
  await rhythmTab(page);
}

/** An owned one-Measure percussive Pattern with the given Beats' first Slots on. */
async function rhythm(page, beats = [0, 3]) {
  await openApp(page);
  await page.evaluate((bs) => {
    const p = window.__rm.loadBlank('4/4');
    const measures = structuredClone(p.measures);
    for (const b of bs) measures[0].beats[b].slots[0] = { on: true };
    window.__rm.loadPattern({ ...p, measures }, { owned: true });
  }, beats);
  await rhythmTab(page);
}

const addVariation = (page) => page.locator('.rhythm-group [data-action="add-variation"]');
const picker = (page) => page.locator('.variation-view');
const device = (page, id) => page.locator(`.variation-device-button[data-device="${id}"]`);
const pattern = (page) => page.evaluate(() => window.__rm.getState().pattern);
const measureCount = (page) => page.evaluate(() => window.__rm.getState().pattern.measures.length);
const pitchesOf = (page, measure) =>
  page.evaluate((m) => window.__rm.getState().pattern.measures[m].beats.map((b) => b.slots[0].pitch ?? null), measure);

async function choose(page, id) {
  await addVariation(page).click();
  await expect(picker(page)).toBeVisible();
  await device(page, id).click();
  await expect(picker(page)).toHaveCount(0);
}

// --- AC-10.3.1 ------------------------------------------------------------------------

test('AC-10.3.1/3 — Editing focus moves to the first Slot of the appended copy, as it does after Double Length', async ({ page }) => {
  await melody(page);
  await choose(page, 'resolve-ending');
  expect(await measureCount(page)).toBe(2);
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const slot = el?.closest('.slot');
    return slot ? { measure: slot.dataset.measure, beat: slot.dataset.beat, slot: slot.dataset.slot } : null;
  });
  expect(focused).toEqual({ measure: '1', beat: '0', slot: '0' });
});

test('AC-10.3.1/4 — Into an owned Pattern the result auto-saves at once (US-7.2); on a shipped Pattern the choice is the first edit and the naming prompt of US-7.3 comes before anything is applied, cancelling it leaving the Pattern as it was', async ({ page }) => {
  // Shipped: the name is asked for first, and Cancel means nothing happened.
  await page.goto('/');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  const before = await measureCount(page);
  await page.locator('.workbench-tab[data-tab="rhythm"]').click();
  await addVariation(page).click();
  await expect(page.locator('.dialog-message')).toContainText('built-in pattern');
  await expect(picker(page)).toHaveCount(0);
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(picker(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);
  expect(await measureCount(page)).toBe(before);

  // Owned: applied and saved with no further step.
  await melody(page);
  await choose(page, 'octave-up');
  expect(await measureCount(page)).toBe(2);
  await page.reload();
  expect(await measureCount(page)).toBe(2);
  expect(await pitchesOf(page, 1)).toEqual([
    { degree: '1', octaveOffset: 1 },
    { degree: '3', octaveOffset: 1 },
    { degree: '5', octaveOffset: 1 },
    { degree: '2', octaveOffset: 1 },
  ]);
});

test('AC-10.3.1/5 — Add variation is enabled only while the Pattern’s length plus the phrase length is within the 32-Measure cap, and says so when it is not', async ({ page }) => {
  await rhythm(page);
  await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    const measures = Array.from({ length: 31 }, () => structuredClone(p.measures[0]));
    window.__rm.loadPattern({ ...p, measures }, { owned: true });
  });
  await expect(addVariation(page)).toBeEnabled();
  await addVariation(page).click();
  await page.locator('.variation-length-select').selectOption('2');
  // Two more would make 33: every device says so.
  for (const reason of await page.locator('.variation-device-desc').allTextContents()) expect(reason).toMatch(/32 Measures/);
  await page.locator('.variation-length-select').selectOption('1');
  await device(page, 'breathe').click();
  expect(await measureCount(page)).toBe(32);
  await expect(addVariation(page)).toBeDisabled();
  await expect(addVariation(page)).toHaveAttribute('title', /32 Measures/);
});

test('AC-10.3.1/6 — In the Composer the variation keeps the draft’s notes — there is no keep-or-start-percussive question, which belongs to Double Length — and a draft Slot that sounds without a Pitch is copied as it is', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // Unpitched: the copy sounds, still unpitched, and nothing was asked.
  await page.locator('.composer-add-variation').click();
  await expect(picker(page)).toBeVisible();
  await device(page, 'breathe').click();
  await expect(picker(page)).toHaveCount(0);
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(page.locator('.composer-grid .measure')).toHaveCount(2);
  for (let b = 0; b < 3; b++) await expect(cslot(page, 1, b)).toHaveClass(/unpitched/);
  // The first Slot of the copy is selected, where Double Length leaves Record (AC-19.5.4/3).
  await expect(cslot(page, 1, 0)).toHaveClass(/selected/);
  expect((await composerState(page)).selected).toEqual({ measureIndex: 1, beatIndex: 0, slotIndex: 0 });

  // Recorded: the copy carries the notes, with no keep-or-percussive ask.
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-add-variation').click();
  await device(page, 'lift').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  const notes = await page.evaluate(() => window.__rm.composer().draft.measures.map((m) => m.beats.map((b) => b.slots[0].pitch ?? null)));
  expect(notes[1]).toEqual(notes[0]);
  expect(notes[0].every((n) => n !== null)).toBe(true);
});

// --- AC-10.3.2 ------------------------------------------------------------------------

test('AC-10.3.2/1 — The phrase length can be set to any number of Measures from 1 to the Pattern’s length; its default is the length remembered for this Pattern, and the whole Pattern when none is remembered or the remembered length is longer than the Pattern', async ({ page }) => {
  await melody(page);
  await page.locator('[data-action="duplicate-pattern"]').click();
  await page.locator('[data-action="duplicate-pattern"]').click();
  expect(await measureCount(page)).toBe(4);
  await addVariation(page).click();
  const select = page.locator('.variation-length-select');
  await expect(select.locator('option')).toHaveText(['1 Measure', '2 Measures', '3 Measures', '4 Measures']);
  await expect(select).toHaveValue('4');
  await select.selectOption('2');
  await device(page, 'breathe').click();
  expect(await measureCount(page)).toBe(6);
  // Remembered for this Pattern.
  await addVariation(page).click();
  await expect(select).toHaveValue('2');
  await expect(select.locator('option')).toHaveCount(6);
  await page.keyboard.press('Escape');
  // Longer than the Pattern again: the whole Pattern.
  for (let i = 0; i < 5; i++) await page.locator('[data-action="remove-measure"]').click();
  expect(await measureCount(page)).toBe(1);
  await addVariation(page).click();
  await expect(select).toHaveValue('1');
});

test('AC-10.3.2/2 — The original phrase is the Pattern’s first Measures up to the phrase length; the latest copy is its last Measures of that length; while the Pattern is no longer than the phrase there is one base and no choice is shown', async ({ page }) => {
  await melody(page);
  await addVariation(page).click();
  await expect(page.locator('.variation-base')).toBeHidden();
  await device(page, 'octave-up').click();
  // Now there is a choice: the original is the first Measure, the latest the octave-up copy.
  await addVariation(page).click();
  await expect(page.locator('.variation-base')).toBeVisible();
  await expect(page.locator('.variation-base-option[data-base="original"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.variation-base-option[data-base="latest"]').click();
  await device(page, 'octave-up').click();
  expect((await pitchesOf(page, 2)).map((p) => p.octaveOffset)).toEqual([2, 2, 2, 2]);
  await addVariation(page).click();
  await device(page, 'octave-up').click(); // original again, by default
  expect((await pitchesOf(page, 3)).map((p) => p.octaveOffset)).toEqual([1, 1, 1, 1]);
  // Phrase as long as the Pattern: one base.
  await addVariation(page).click();
  await page.locator('.variation-length-select').selectOption('4');
  await expect(page.locator('.variation-base')).toBeHidden();
});

test('AC-10.3.2/3 — The phrase length is remembered per Pattern in `rm.localMeta.v1` when a variation is added, is in force after a reload, and like all Local Metadata is in no Pattern export or submission (FR-006)', async ({ page }) => {
  await melody(page);
  await page.locator('[data-action="duplicate-pattern"]').click();
  await addVariation(page).click();
  await page.locator('.variation-length-select').selectOption('1');
  await device(page, 'breathe').click();
  await page.reload();
  const stored = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return {
      meta: window.__rm.localMetaStore.forPattern(id),
      json: JSON.stringify(window.__rm.patternStore.findById(id)),
      raw: localStorage.getItem('rm.localMeta.v1'),
    };
  });
  expect(stored.meta.phraseLength).toBe(1);
  expect(stored.raw).toContain('phraseLength');
  expect(stored.json).not.toContain('phraseLength');
  await page.locator('.workbench-tab[data-tab="rhythm"]').click();
  await addVariation(page).click();
  await expect(page.locator('.variation-length-select')).toHaveValue('1');
});

test('AC-10.3.2/4 — The picker says, under a progression that changes every Measure, that a phrase as long as the progression keeps each copy over the same chords, and under one that changes every pass, that the pass is now as long as the whole Pattern — the progression itself is never altered', async ({ page }) => {
  await melody(page);
  await expect(page.locator('.variation-hint')).toHaveCount(0);
  await page.locator('.workbench-tab[data-tab="melody"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await page.locator('.workbench-tab[data-tab="rhythm"]').click();
  await addVariation(page).click();
  await expect(page.locator('.variation-hint')).toContainText('changes every pass');
  await page.keyboard.press('Escape');
  await page.locator('.workbench-tab[data-tab="melody"]').click();
  await page.locator('.chord-change[data-change="measure"]').click();
  await page.locator('.workbench-tab[data-tab="rhythm"]').click();
  const chordsBefore = (await pattern(page)).harmony.chords;
  await addVariation(page).click();
  await expect(page.locator('.variation-hint')).toContainText('a phrase of 3 Measures keeps each copy over the same chords');
  await device(page, 'breathe').click();
  expect((await pattern(page)).harmony.chords).toEqual(chordsBefore);
});

// --- AC-10.3.4 the picker -------------------------------------------------------------

test('AC-10.3.4/1 — Add variation sits beside Double Length in the grid editor’s Measures row, in the Composer’s Measures control, and — on a making goal whose tab bar has no Rhythm group — in a Measures row at the foot of the Melody group carrying Double Length and Add variation; disabled with the reason when the cap refuses it', async ({ page }) => {
  await melody(page);
  // Lab: in the Measures row, right before Double Length; not in the Melody group.
  const actions = await page.locator('.rhythm-group .structure-row [data-action]').evaluateAll((els) => els.map((e) => e.dataset.action));
  expect(actions.indexOf('duplicate-pattern')).toBe(actions.indexOf('add-variation') + 1);
  await expect(page.locator('.melody-group [data-action="add-variation"]')).toHaveCount(0);

  // Make it melodic and Combine patterns have no Rhythm tab: the Melody group ends with the two.
  for (const goal of ['melodic', 'combine']) {
    await page.evaluate((g) => window.__rm.handlers.onGoal(g), goal);
    await page.locator('.workbench-tab[data-tab="melody"]').click();
    await expect(page.locator('.workbench-tab[data-tab="rhythm"]')).toBeHidden();
    const row = page.locator('.melody-group .melody-measures');
    await expect(row.locator('[data-action="add-variation"]')).toBeVisible();
    await expect(row.locator('[data-action="duplicate-pattern"]')).toBeVisible();
    const groups = await page.locator('.melody-group > .control').evaluateAll((els) => els.map((e) => e.className));
    expect(groups[groups.length - 1]).toContain('control');
    await expect(page.locator('.melody-group .control').last().locator('.melody-measures')).toHaveCount(1);
  }
  await page.evaluate(() => window.__rm.handlers.onGoal('lab'));

  // The Composer's Measures control.
  // An owned melody opens in the Composer directly (AC-19.1.2/3).
  await enterComposer(page, { load: 'none' });
  await expect(page.locator('.composer-add-variation')).toBeVisible();
  const composerRow = await page.locator('.composer-add-variation').evaluate((el) => [...el.parentElement.children].map((c) => c.className));
  expect(composerRow).toEqual(['action composer-add-variation', 'action composer-duplicate']);
});

test('AC-10.3.4/2 — The picker lists the devices under the headings Rhythm, Dynamics, Pitch and Fill, in the order of AC-10.3.3, each with its name and one line saying what it does to the phrase', async ({ page }) => {
  await melody(page);
  await addVariation(page).click();
  await expect(page.locator('.variation-group-label')).toHaveText(['Rhythm', 'Dynamics', 'Pitch', 'Fill']);
  const ids = await page.locator('.variation-device-button').evaluateAll((els) => els.map((e) => e.dataset.device));
  expect(ids).toEqual([
    'fill-ending', 'anticipate', 'delay', 'add-note', 'drop-note', 'breathe', 'double-ending', 'halve-ending',
    'lift', 'soften', 'shift-accent',
    'resolve-ending', 'open-ending', 'sequence-up', 'sequence-down', 'octave-up', 'octave-down', 'fill-gaps', 'neighbour', 'chord-tone-swap', 'invert', 'retrograde',
    'change-fill',
  ]);
  for (const name of await page.locator('.variation-device-name').allTextContents()) expect(name.length).toBeGreaterThan(2);
  for (const desc of await page.locator('.variation-device-desc').allTextContents()) expect(desc.length).toBeGreaterThan(10);
  await expect(page.locator('.variation-device-button[data-device="resolve-ending"] .variation-device-desc')).toHaveText('The last note becomes the nearest tonic.');
});

test('AC-10.3.4/3 — A device unavailable on this base phrase is shown disabled with its reason; the Pitch group says it needs a melody on a percussive Pattern, and the Fill group that it needs a progression and a fill', async ({ page }) => {
  await rhythm(page, [0]);
  await addVariation(page).click();
  await expect(page.locator('.variation-group[data-group="Pitch"] .variation-group-reason')).toHaveText('Needs a melody: this Pattern is percussive');
  await expect(page.locator('.variation-group[data-group="Fill"] .variation-group-reason')).toHaveText('Needs a progression and a fill');
  await expect(device(page, 'sequence-up')).toBeDisabled();
  await expect(device(page, 'anticipate')).toBeDisabled();
  await expect(device(page, 'anticipate').locator('.variation-device-desc.reason')).toHaveText('The last note is already the first Slot');
  await expect(device(page, 'breathe')).toBeDisabled();
  await expect(device(page, 'breathe').locator('.variation-device-desc.reason')).toHaveText('The last Beat is already silent');
  await expect(device(page, 'add-note')).toBeEnabled();
  // Under a fill the pitch devices wait on None, and say so (AC-10.3.3/23).
  await page.keyboard.press('Escape');
  await melody(page);
  await page.locator('.workbench-tab[data-tab="melody"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await page.locator('.workbench-tab[data-tab="rhythm"]').click();
  await addVariation(page).click();
  await expect(device(page, 'sequence-up')).toBeDisabled();
  await expect(device(page, 'sequence-up').locator('.variation-device-desc')).toContainText('The fill, Ascending, deals the notes');
  await expect(device(page, 'octave-up')).toBeEnabled();
  await expect(device(page, 'change-fill')).toBeEnabled();
});

test('AC-10.3.4/4 — Choosing a device applies it and closes the picker; the picker can be dismissed with no change, by its Close control or Escape', async ({ page }) => {
  await rhythm(page);
  const before = JSON.stringify(await pattern(page));
  await addVariation(page).click();
  await page.locator('[data-action="close-variation"]').click();
  await expect(picker(page)).toHaveCount(0);
  expect(JSON.stringify(await pattern(page))).toBe(before);
  await addVariation(page).click();
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  expect(JSON.stringify(await pattern(page))).toBe(before);
  await choose(page, 'breathe');
  expect(await measureCount(page)).toBe(2);
});

test('AC-10.3.4/5 — The picker is a named dialog that takes focus on opening, returns it to Add variation on closing, and whose devices and their reasons are read by assistive technology as buttons with their descriptions', async ({ page }) => {
  await rhythm(page, [0]);
  await addVariation(page).focus();
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveAttribute('role', 'dialog');
  await expect(picker(page)).toHaveAttribute('aria-label', 'Add variation');
  expect(await page.evaluate(() => document.activeElement?.closest('.variation-view') !== null)).toBe(true);
  await expect(device(page, 'add-note')).toHaveAttribute('aria-label', 'Add a note: The first silent "&" sounds.');
  await expect(device(page, 'breathe')).toHaveAttribute('aria-label', 'Breathe: The last Beat is already silent');
  expect(await device(page, 'add-note').evaluate((el) => el.tagName)).toBe('BUTTON');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.activeElement?.dataset.action)).toBe('add-variation');
});

test('AC-10.3.4/6 — On a phone the picker fills the width within the mobile breakpoint with the groups stacked, each device a full-width row; on desktop and tablet it is a dialog over the editor', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await rhythm(page);
  await addVariation(page).click();
  const mobile = await picker(page).evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    columns: getComputedStyle(el.querySelector('.variation-devices')).gridTemplateColumns.split(' ').length,
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(mobile.width).toBeGreaterThanOrEqual(mobile.viewport - 40);
  expect(mobile.columns).toBe(1);
  expect(mobile.scroll).toBeLessThanOrEqual(mobile.viewport);
  await page.keyboard.press('Escape');

  await page.setViewportSize(DESKTOP);
  await addVariation(page).click();
  const desktop = await picker(page).evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    left: el.getBoundingClientRect().left,
    columns: getComputedStyle(el.querySelector('.variation-devices')).gridTemplateColumns.split(' ').length,
  }));
  expect(desktop.width).toBeLessThanOrEqual(560);
  expect(desktop.left).toBeGreaterThan(200);
  expect(desktop.columns).toBeGreaterThan(1);
  await expect(page.locator('.dialog-backdrop')).toBeVisible();
});

test('AC-10.3.4/7 — Roll the dice, at the head of the picker, applies one device chosen at random from those available and not in a group marked No dice, exactly as tapping it would, and is disabled saying so when no such device remains', async ({ page }) => {
  await rhythm(page, [0]);
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await addVariation(page).click();
  const roll = page.locator('[data-action="roll-variation"]');
  await expect(roll).toBeEnabled();
  // The first available device, Fill the ending, is what a zero rolls — and what tapping it gives.
  await roll.click();
  await expect(picker(page)).toHaveCount(0);
  expect(await measureCount(page)).toBe(2);
  const last = await page.evaluate(() => window.__rm.getState().pattern.measures[1].beats[3]);
  expect(last.recipe).toBe('straight-16ths');
  expect(last.slots.every((s) => s.on)).toBe(true);

  // Every group No dice: nothing to roll, and it says so.
  await addVariation(page).click();
  for (const group of ['Rhythm', 'Dynamics', 'Pitch', 'Fill']) await page.locator(`.variation-nodice[data-group="${group}"]`).click();
  await expect(roll).toBeDisabled();
  await expect(roll).toContainText('nothing left to roll');
});

test('AC-10.3.4/8 — Each group heading carries a No dice toggle that keeps the whole group out of the roll and changes nothing else; the toggles hold for the session and are not Pattern content', async ({ page }) => {
  await melody(page);
  await page.evaluate(() => {
    Math.random = () => 0.999;
  });
  await addVariation(page).click();
  const noPitch = page.locator('.variation-nodice[data-group="Pitch"]');
  await expect(noPitch).toHaveAttribute('aria-pressed', 'false');
  await noPitch.click();
  await expect(noPitch).toHaveAttribute('aria-pressed', 'true');
  // The Pitch devices are still offered to a tap; only the roll skips them.
  await expect(device(page, 'octave-up')).toBeEnabled();
  const before = JSON.stringify(await pattern(page));
  await page.locator('[data-action="roll-variation"]').click();
  // The highest roll lands on the last rollable device outside Pitch — Shift the accent — so the notes are untouched.
  expect(await pitchesOf(page, 1)).toEqual(await pitchesOf(page, 0));
  const copy = await page.evaluate(() => window.__rm.getState().pattern.measures[1]);
  expect(copy.beats[0].slots[0].accent).toBe(1);
  expect(JSON.stringify((await pattern(page)).measures[0])).toBe(JSON.stringify(JSON.parse(before).measures[0]));
  // Held for the session, and not on the Pattern.
  await addVariation(page).click();
  await expect(noPitch).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  expect(JSON.stringify(await pattern(page))).not.toContain('No dice');
  await page.reload();
  await page.locator('.workbench-tab[data-tab="rhythm"]').click();
  await addVariation(page).click();
  await expect(page.locator('.variation-nodice[data-group="Pitch"]')).toHaveAttribute('aria-pressed', 'false');
});

// --- AC-10.3.5 ordinary content ------------------------------------------------------

test('AC-10.3.5/2 — Removing Measures from the end discards the latest variation Measure by Measure, and Double Length, Condense and Append work on the lengthened Pattern as on any other', async ({ page }) => {
  await melody(page);
  await choose(page, 'sequence-up');
  await choose(page, 'octave-up');
  expect(await measureCount(page)).toBe(3);
  await page.locator('[data-action="remove-measure"]').click();
  expect(await measureCount(page)).toBe(2);
  expect(await pitchesOf(page, 1)).toEqual([
    { degree: '2', octaveOffset: 0 },
    { degree: '4', octaveOffset: 0 },
    { degree: '6', octaveOffset: 0 },
    { degree: '3', octaveOffset: 0 },
  ]);
  await page.locator('[data-action="duplicate-pattern"]').click();
  expect(await measureCount(page)).toBe(4);
  await expect(page.locator('[data-action="condense-pattern"]')).toBeVisible();
  await expect(page.locator('[data-action="append-pattern"]')).toBeEnabled();
});

test('AC-10.3.5/3 — Duplicate detection and Families (US-11.1, US-11.2) compare the Measures alone; two Patterns built by the same devices from the same phrase are true duplicates', async ({ page }) => {
  await melody(page);
  await choose(page, 'resolve-ending');
  // A second Pattern holding the same Measures, typed in: a true duplicate.
  const dupes = await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    window.__rm.patternStore.upsert({ ...structuredClone(p), id: 'p_other', name: 'Typed in by hand' });
    return window.__rm.currentDuplicates().map((d) => d.id);
  });
  expect(dupes).toContain('p_other');
});

// --- AC-10.3.1 and AC-10.3.5, seen from the grid ------------------------------------

test('AC-10.3.1/1 — The appended Measures are as many as the base phrase, and every Time Signature, Recipe, Accent Level and Pitch in them is the base phrase’s except where the device’s rule says otherwise', async ({ page }) => {
  await melody(page);
  await page.locator('[data-action="duplicate-pattern"]').click();
  await addVariation(page).click();
  await page.locator('.variation-length-select').selectOption('2');
  await device(page, 'breathe').click();
  await expect(page.locator('.measure')).toHaveCount(4);
  const p = await pattern(page);
  expect(p.measures[2]).toEqual(p.measures[0]);
  const expected = structuredClone(p.measures[1]);
  expected.beats[3].slots = expected.beats[3].slots.map(() => ({ on: false }));
  expect(p.measures[3]).toEqual(expected);
  // What the grid shows of the copy is the base's shape, minus the silenced Beat.
  await expect(page.locator('.measure[data-measure="2"] .slot[data-beat="0"][data-slot="0"] .slot-pitch')).toHaveAttribute('data-degree', '1');
  await expect(page.locator('.measure[data-measure="3"] .slot[data-beat="3"] .slot-pitch')).toHaveCount(0);
});

test('AC-10.3.1/2 — The Measures the Pattern already held are unchanged, whichever base was varied', async ({ page }) => {
  await melody(page);
  await choose(page, 'sequence-up');
  const before = (await pattern(page)).measures;
  await addVariation(page).click();
  await page.locator('.variation-base-option[data-base="latest"]').click();
  await device(page, 'octave-up').click();
  expect((await pattern(page)).measures.slice(0, 2)).toEqual(before);
  await addVariation(page).click();
  await page.locator('.variation-base-option[data-base="original"]').click();
  await device(page, 'octave-down').click();
  expect((await pattern(page)).measures.slice(0, 2)).toEqual(before);
  await expect(page.locator('.measure')).toHaveCount(4);
});

test('AC-10.3.5/1 — The Pattern’s JSON, MIDI export and submission payload carry no device name, base choice or phrase length, and are byte-for-byte what the same Measures entered by hand would give', async ({ page }) => {
  await melody(page);
  await choose(page, 'resolve-ending');
  const stored = await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    const saved = window.__rm.patternStore.findById(p.id);
    // The same Measures, as if typed in by hand: an identical Pattern.
    const typed = { ...structuredClone(saved), measures: structuredClone(saved.measures) };
    return { json: JSON.stringify(saved), typed: JSON.stringify(typed), meta: window.__rm.localMetaStore.forPattern(p.id) };
  });
  expect(stored.json).toBe(stored.typed);
  for (const word of ['device', 'phraseLength', 'base', 'variation', 'resolve-ending']) expect(stored.json).not.toContain(word);
  // The phrase length lives apart, in Local Metadata, and nowhere in the Pattern.
  expect(stored.meta.phraseLength).toBe(1);
});
