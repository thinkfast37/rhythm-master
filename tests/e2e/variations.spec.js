/*
 * US-10.4 — Vary a loop, proved on the screen: the Add variation dialog, the
 * audition through the loop, Accept and Accept and vary again, the dice, the
 * original and its remembered length, and the chord override as it reaches
 * the grid, the file and the next load. The pure half is proved in
 * tests/unit/core/variations.test.js and tests/unit/core/chord-override.test.js.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, enterComposer, composerState } from './composer-helpers.js';

// The audition starts playback from a dialog, not a Play press: autoplay must be allowed.
test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/**
 * An owned Melodic Pattern in C: one Measure of 4/4 at Straight 16ths with a
 * syllable on each Beat, Am–F–C–G, Ascending. `change` picks when the chord
 * moves; `progression: null` leaves the melody alone (no chords).
 */
async function loop(page, { arpeggio = 'up', progression = 'vi-IV-I-V', change = 'pass', melodic = true } = {}) {
  await page.goto('/');
  await page.evaluate(
    async ({ m }) => {
      window.__rm.loadBlank('4/4');
      if (m) await window.__rm.handlers.onSoundMode('melodic');
      for (let b = 0; b < 4; b++) await window.__rm.handlers.onSlotTap(0, b, 0);
    },
    { m: melodic }
  );
  if (melodic && progression) {
    await page.locator('.progression-picker').selectOption(progression);
    await page.locator('.voicing-picker').selectOption('root');
    if (arpeggio) await page.locator('.arpeggio-picker').selectOption(arpeggio);
    if (change === 'measure') await page.locator('.chord-change-group [data-change="measure"]').click();
  }
}

const dialog = (page) => page.locator('.variation-dialog');
const addButton = (page) => page.locator('.rhythm-group .structure-row [data-action="add-variation"]');
const technique = (page, id) => dialog(page).locator(`.variation-technique[data-technique="${id}"]`);
const entries = (page) => dialog(page).locator('.variation-entry');
const field = (page, index, key) => entries(page).nth(index).locator(`.variation-field[data-key="${key}"]`);
const accept = (page) => dialog(page).locator('.variation-accept');
const again = (page) => dialog(page).locator('.variation-accept-again');
const close = (page) => dialog(page).locator('.variation-close');
const roll = (page) => dialog(page).locator('.variation-roll');
const noDice = (page, group) => dialog(page).locator(`.variation-nodice[data-group="${group}"]`);
const original = (page) => dialog(page).locator('.variation-original-label');
const phrase = (page) => dialog(page).locator('.variation-phrase');
const candidateMeasures = (page) => page.locator('.grid .measure.candidate');
const gridMeasures = (page) => page.locator('.grid .measure');
const state = (page) => page.evaluate(() => window.__rm.getState());
const pattern = (page) => page.evaluate(() => window.__rm.getState().pattern);
const variation = (page) => page.evaluate(() => window.__rm.variation());
const stored = (page) => page.evaluate(() => window.__rm.patternStore.findById('p_test'));
const measureOn = (p, m) => p.measures[m].beats.map((b) => b.slots.map((s) => (s.on ? 1 : 0)).join('')).join(' ');

/** On a Melodic Pattern the Melody group is the one on screen (AC-15.1.7): bring the Rhythm group forward. */
async function showRhythm(page) {
  if (await addButton(page).isVisible()) return;
  const tab = page.locator('.workbench-tab[data-tab="rhythm"]');
  if (await tab.count()) await tab.click();
  await expect(addButton(page)).toBeVisible();
}

async function showMelody(page) {
  const tab = page.locator('.workbench-tab[data-tab="melody"]');
  if (await tab.count()) await tab.click();
}

async function open(page) {
  await showRhythm(page);
  await addButton(page).click();
  await expect(dialog(page)).toBeVisible();
}

/** Feed `Math.random` a fixed sequence in the page, so a roll is the same every time. */
const feed = (page, values) =>
  page.evaluate((v) => {
    let i = 0;
    Math.random = () => v[i++ % v.length];
  }, values);

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

test.describe('AC-10.4.1 — Accept appends a variation of the original', () => {
  test('AC-10.4.1/1 — The appended Measures are as many as the original, and every Time Signature, Recipe, Accent Level, Pitch and chord in them is the original’s except where a technique’s rule says otherwise: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'sixteenth-fill').click();
    await accept(page).click();
    await expect(gridMeasures(page)).toHaveCount(2);
    const p = await pattern(page);
    expect(p.measures).toHaveLength(2);
    expect(measureOn(p, 0)).toBe('1000 1000 1000 1000');
    expect(measureOn(p, 1)).toBe('1000 1000 1000 1111');
    expect(p.measures[1].timeSignature).toBe('4/4');
    expect(p.measures[1].beats.slice(0, 3)).toEqual(p.measures[0].beats.slice(0, 3));
    expect(p.harmony.chords).toHaveLength(4);
    expect(p.harmony.overrides).toBeUndefined();
  });

  test('AC-10.4.1/2 — The Measures the Pattern already held are unchanged, however many variations it already has: on the screen', async ({ page }) => {
    await loop(page);
    const before = (await pattern(page)).measures[0];
    for (const id of ['breathe', 'lift', 'invert-chord']) {
      await open(page);
      await technique(page, id).click();
      await accept(page).click();
      await expect(dialog(page)).toHaveCount(0);
    }
    const p = await pattern(page);
    expect(p.measures).toHaveLength(4);
    expect(p.measures[0]).toEqual(before);
    expect(measureOn(p, 1)).toBe('1000 1000 1000 0000');
    expect(p.harmony.overrides).toEqual({ 3: { 3: { inversion: 1 } } });
    await expect(page.locator('.measure[data-measure="0"] .slot[data-accent="0"]')).toHaveCount(12);
  });

  test('AC-10.4.1/3 — Every variation is built from the original, never from the latest copy: three accepted candidates on a one-Measure Pattern give four Measures, each of Measures 2, 3 and 4 differing from Measure 1 only by its own techniques: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'remove-syllable').click();
    await accept(page).click();
    await open(page);
    await technique(page, 'add-syllable').click();
    await field(page, 0, 'slot').selectOption('0.1.2');
    await accept(page).click();
    await open(page);
    await technique(page, 'breathe').click();
    await field(page, 0, 'beat').selectOption('0.2');
    await accept(page).click();
    await expect(gridMeasures(page)).toHaveCount(4);
    const p = await pattern(page);
    expect(measureOn(p, 0)).toBe('1000 1000 1000 1000');
    expect(measureOn(p, 1)).toBe('1000 1000 1000 0000');
    // Built from Measure 1 — Beat 4 still sounds — not from Measure 2.
    expect(measureOn(p, 2)).toBe('1000 1010 1000 1000');
    expect(measureOn(p, 3)).toBe('1000 1000 0000 1000');
  });

  test('AC-10.4.1/4 — Editing focus moves to the first Slot of the appended copy on Accept, as it does after Double Length', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    await accept(page).click();
    await expect(page.locator('.measure[data-measure="1"] .slot[data-beat="0"][data-slot="0"] .slot-accent')).toBeFocused();
  });

  test('AC-10.4.1/5 — Into an owned Pattern the result auto-saves at once as one Undo step; on a shipped Pattern Accept is the first edit and the naming prompt comes before anything is applied, cancelling it leaving the Pattern as it was', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    await technique(page, 'lift').click();
    await accept(page).click();
    expect((await stored(page)).measures).toHaveLength(2);
    expect(await page.evaluate(() => window.__rm.undo())).toBe(true);
    expect((await stored(page)).measures).toHaveLength(1);
    await expect(gridMeasures(page)).toHaveCount(1);

    // A shipped Pattern: the naming prompt first; cancelled, nothing changes and the candidate stays.
    await page.evaluate(() => {
      const p = structuredClone(window.__rm.getState().pattern);
      p.id = 'p_pretend_shipped';
      p.name = 'Pretend Shipped';
      p.measures[0].beats[1].slots[2] = { on: true };
      window.__rm.loadPattern(p, { owned: false });
    });
    await open(page);
    await technique(page, 'breathe').click();
    await accept(page).click();
    await expect(page.locator('.dialog-host .dialog-input')).toBeVisible();
    await page.locator('.dialog-host .dialog-button', { hasText: 'Cancel' }).click();
    await expect(page.locator('.dialog-host .dialog')).toHaveCount(0);
    expect((await state(page)).isOwned).toBe(false);
    expect((await pattern(page)).measures).toHaveLength(1);
    await expect(dialog(page)).toBeVisible();
    await expect(entries(page)).toHaveCount(1);
    await expect(candidateMeasures(page)).toHaveCount(1);
    // Named, the copy takes the variation.
    await accept(page).click();
    await page.locator('.dialog-host .dialog-input').fill('Varied Copy');
    await page.locator('.dialog-host .dialog-button.primary').click();
    await expect(dialog(page)).toHaveCount(0);
    const s = await state(page);
    expect(s.isOwned).toBe(true);
    expect(s.pattern.name).toBe('Varied Copy');
    expect(s.pattern.measures).toHaveLength(2);
    expect(await page.evaluate(() => window.__rm.patternStore.loadAll().some((p) => p.name === 'Varied Copy' && p.measures.length === 2))).toBe(true);
  });

  test('AC-10.4.1/6 — Add variation is enabled only while the Pattern’s length plus the original’s length is within the 32-Measure cap, and says so when it is not', async ({ page }) => {
    await loop(page);
    await showRhythm(page);
    await page.evaluate(async () => {
      for (let i = 1; i < 31; i++) await window.__rm.handlers.onAddMeasure();
    });
    // Nothing remembered: the original is the whole Pattern, and 31 more will not fit.
    await expect(addButton(page)).toBeDisabled();
    await page.evaluate(() => window.__rm.localMetaStore.update('p_test', { phraseLength: 1 }));
    await page.evaluate(() => window.__rm.handlers.onAddMeasure());
    await page.evaluate(() => window.__rm.handlers.onRemoveMeasure());
    await expect(addButton(page)).toBeEnabled();
    await page.evaluate(() => window.__rm.localMetaStore.update('p_test', { phraseLength: 2 }));
    await page.evaluate(() => window.__rm.handlers.onAddMeasure());
    await page.evaluate(() => window.__rm.handlers.onRemoveMeasure());
    await expect(addButton(page)).toBeDisabled();
    await expect(addButton(page)).toHaveAttribute('title', /32 Measures/);
    await page.evaluate(() => window.__rm.localMetaStore.update('p_test', { phraseLength: 1 }));
    await page.evaluate(() => window.__rm.handlers.onAddMeasure());
    await page.evaluate(() => window.__rm.handlers.onRemoveMeasure());
    await expect(addButton(page)).toBeEnabled();
    await page.evaluate(() => window.__rm.handlers.onAddMeasure());
    await expect(addButton(page)).toBeDisabled();
  });

  test('AC-10.4.1/7 — In the Composer the variation keeps the draft’s notes — there is no keep-or-start-percussive question, which belongs to Double Length — and a draft Slot that sounds without a Pitch is copied as it stands', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      window.__rm.loadBlank('4/4');
      await window.__rm.handlers.onSoundMode('melodic');
      for (let b = 0; b < 4; b++) await window.__rm.handlers.onSlotTap(0, b, 0);
      await window.__rm.handlers.onStampPitch?.(0, 0, 0);
    });
    await page.locator('.measure[data-measure="0"] .slot[data-beat="1"][data-slot="0"] .slot-note').click();
    await enterComposer(page, { load: 'none' });
    const vary = page.locator('.composer-add-variation');
    await expect(vary).toBeVisible();
    await vary.click();
    await expect(dialog(page)).toBeVisible();
    await technique(page, 'breathe').click();
    await expect(page.locator('.dialog-host .dialog')).toHaveCount(0);
    await accept(page).click();
    await expect(page.locator('.dialog-host .dialog')).toHaveCount(0);
    const c = await composerState(page);
    expect(c.draft.measures).toHaveLength(2);
    // The note stamped on Beat 2 is kept in the copy; Beat 1, sounding with no Pitch, is copied as it stands.
    expect(c.draft.measures[1].beats[1].slots[0].pitch).toEqual(c.draft.measures[0].beats[1].slots[0].pitch);
    expect(c.draft.measures[1].beats[1].slots[0].pitch).toBeTruthy();
    expect(c.draft.measures[1].beats[0].slots[0]).toEqual(c.draft.measures[0].beats[0].slots[0]);
    expect(measureOn(c.draft, 1)).toBe('1000 1000 1000 0000');
  });
});

test.describe('AC-10.4.2 — The original is the Pattern’s first Measures, and is remembered', () => {
  test('AC-10.4.2/1 — The original’s length is the length remembered for this Pattern, and the whole Pattern when none is remembered or the remembered length exceeds the Pattern’s; it can be set to any number of Measures from 1 to the Pattern’s length before a candidate is built, and changing it discards the candidate', async ({ page }) => {
    await loop(page);
    await open(page);
    await expect(original(page)).toContainText('Original: Measure 1');
    await close(page).click();
    await page.evaluate(async () => {
      await window.__rm.handlers.onAddMeasure();
      await window.__rm.handlers.onAddMeasure();
    });
    await open(page);
    await expect(original(page)).toContainText('Original: Measures 1–3');
    await expect(phrase(page).locator('option')).toHaveCount(3);
    await close(page).click();
    await page.evaluate(() => window.__rm.localMetaStore.update('p_test', { phraseLength: 2 }));
    await open(page);
    await expect(original(page)).toContainText('Original: Measures 1–2');
    await technique(page, 'breathe').click();
    await expect(entries(page)).toHaveCount(1);
    await expect(gridMeasures(page)).toHaveCount(5);
    // Changing the length discards the candidate.
    await phrase(page).selectOption('1');
    await expect(original(page)).toContainText('Original: Measure 1');
    await expect(entries(page)).toHaveCount(0);
    await expect(gridMeasures(page)).toHaveCount(3);
    await close(page).click();
    await page.evaluate(() => window.__rm.localMetaStore.update('p_test', { phraseLength: 5 }));
    await open(page);
    await expect(original(page)).toContainText('Original: Measures 1–3');
  });

  test('AC-10.4.2/2 — The length is remembered per Pattern in `rm.localMeta.v1` when a candidate is accepted, is in force after a reload, and like all Local Metadata is in no Pattern export or submission: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    await accept(page).click();
    expect(await page.evaluate(() => window.__rm.localMetaStore.forPattern('p_test').phraseLength)).toBe(1);
    expect(JSON.stringify(await stored(page))).not.toContain('phraseLength');
    await page.reload();
    await page.evaluate(() => window.__rm.loadPattern(window.__rm.patternStore.findById('p_test'), { owned: true }));
    await expect(gridMeasures(page)).toHaveCount(2);
    await open(page);
    await expect(original(page)).toContainText('Original: Measure 1');
    await technique(page, 'lift').click();
    await expect(gridMeasures(page)).toHaveCount(3);
  });

  test('AC-10.4.2/3 — Under a progression that changes every Measure, the copy’s Measures fall over the chords that follow the original’s in the cycle, and the dialog says so; under one that changes every pass, every Measure of a pass shares its chord and the pass simply lengthens', async ({ page }) => {
    await loop(page, { change: 'measure' });
    await open(page);
    await expect(dialog(page).locator('.variation-note')).toContainText('Chords change every Measure');
    await technique(page, 'breathe').click();
    // Measure 1 is over Am and the copy over F in the first pass.
    await expect(page.locator('.measure[data-measure="0"] .measure-chord')).toHaveText('Am');
    await expect(page.locator('.measure[data-measure="1"] .measure-chord')).toHaveText('F');
    await close(page).click();
    await showMelody(page);
    await page.locator('.chord-change-group [data-change="pass"]').click();
    await open(page);
    await expect(dialog(page).locator('.variation-note')).toHaveCount(0);
    await technique(page, 'breathe').click();
    await expect(page.locator('.measure .measure-chord')).toHaveCount(0);
    await expect(page.locator('.chord-chip.now .chord-name')).toHaveText('Am');
  });

  test('AC-10.4.2/4 — Removing Measures from the end past the original’s length shortens the original to the Pattern’s length, so the next candidate is built from what is left', async ({ page }) => {
    await loop(page);
    await page.evaluate(() => window.__rm.handlers.onAddMeasure());
    await open(page);
    await technique(page, 'breathe').click();
    await accept(page).click();
    expect(await page.evaluate(() => window.__rm.localMetaStore.forPattern('p_test').phraseLength)).toBe(2);
    await page.locator('[data-action="remove-measure"]').click();
    await page.locator('[data-action="remove-measure"]').click();
    await page.locator('[data-action="remove-measure"]').click();
    await expect(gridMeasures(page)).toHaveCount(1);
    await open(page);
    await expect(original(page)).toContainText('Original: Measure 1');
    await technique(page, 'breathe').click();
    await expect(gridMeasures(page)).toHaveCount(2);
  });
});

test.describe('AC-10.4.3 — A candidate stacks techniques, each with its choice offered', () => {
  test('AC-10.4.3/1 — Adding a technique applies it to the candidate as the earlier techniques left it, so a syllable added on Beat 4 after Sixteenth fill on Beat 4 chooses among that Beat’s 16th Slots: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'sixteenth-fill').click();
    await expect(field(page, 0, 'beat')).toHaveValue('0.3');
    await technique(page, 'add-syllable').click();
    // Beat 4 is full after the fill: the syllable's Slots are the other Beats'.
    const offered = await field(page, 1, 'slot').locator('option').evaluateAll((os) => os.map((o) => o.value));
    expect(offered.length).toBe(9);
    expect(offered.every((v) => !v.startsWith('0.3.'))).toBe(true);
    expect(measureOn((await variation(page)).candidate, 0)).toBe('1000 1000 1001 1111');
  });

  test('AC-10.4.3/4 — The same technique can be in the stack more than once with different choices — two syllables added, two chords inverted: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'add-syllable').click();
    await field(page, 0, 'slot').selectOption('0.0.2');
    await technique(page, 'add-syllable').click();
    await field(page, 1, 'slot').selectOption('0.2.2');
    await technique(page, 'invert-chord').click();
    await field(page, 2, 'chord').selectOption('0');
    await technique(page, 'invert-chord').click();
    await field(page, 3, 'chord').selectOption('2');
    await expect(entries(page)).toHaveCount(4);
    const v = await variation(page);
    expect(measureOn(v.candidate, 0)).toBe('1010 1000 1010 1000');
    expect(v.candidate.harmony.overrides).toEqual({ 0: { 0: { inversion: 1 }, 2: { inversion: 1 } } });
  });

  test('AC-10.4.3/5 — Applying the same stack with the same choices to the same original gives the same Measures every time: nothing about a technique is random: on the screen', async ({ page }) => {
    await loop(page);
    const build = async () => {
      await open(page);
      await technique(page, 'rotate').click();
      await field(page, 0, 'k').selectOption('3');
      await technique(page, 'change-quality').click();
      await field(page, 1, 'chord').selectOption('0');
      await technique(page, 'lift').click();
      const v = await variation(page);
      await close(page).click();
      return v;
    };
    const first = await build();
    const second = await build();
    expect(second.stack).toEqual(first.stack);
    expect(second.candidate).toEqual(first.candidate);
    expect(first.stack).toHaveLength(3);
  });

  test('AC-10.4.3/2 — Every technique carries a choice with a default, listed with the technique in the stack; changing the choice rebuilds the candidate from the original with the whole stack and is heard at once: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    await technique(page, 'remove-syllable').click();
    await expect(entries(page)).toHaveCount(2);
    await expect(field(page, 0, 'beat')).toHaveValue('0.3');
    await expect(field(page, 1, 'slot')).toHaveValue('0.2.0');
    expect(measureOn((await variation(page)).candidate, 0)).toBe('1000 1000 0000 0000');
    await field(page, 0, 'beat').selectOption('0.1');
    expect(measureOn((await variation(page)).candidate, 0)).toBe('1000 0000 0000 1000');
    await expect(page.locator('.measure.candidate .slot[data-beat="1"][data-slot="0"]')).toHaveAttribute('data-accent', '0');
    expect((await state(page)).isPlaying).toBe(true);
  });

  test('AC-10.4.3/3 — A technique can be removed from the stack, and the candidate is rebuilt from the remaining ones; a later technique whose rule no longer applies after the change is dropped from the stack, saying so: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    await technique(page, 'remove-syllable').click();
    await expect(field(page, 1, 'slot')).toHaveValue('0.2.0');
    // Breathe moved onto Beat 3: the syllable it was to remove is gone.
    await field(page, 0, 'beat').selectOption('0.2');
    await expect(entries(page)).toHaveCount(1);
    await expect(dialog(page).locator('.variation-dropped')).toContainText('Remove a syllable was dropped: its choice is no longer offered');
    expect(measureOn((await variation(page)).candidate, 0)).toBe('1000 1000 0000 1000');
    await entries(page).nth(0).locator('.variation-remove').click();
    await expect(entries(page)).toHaveCount(0);
    await expect(dialog(page).locator('.variation-dropped')).toHaveCount(0);
    await expect(candidateMeasures(page)).toHaveCount(0);
  });

  test('AC-10.4.3/6 — A technique whose rule would change nothing on the candidate as it stands, or that needs what the candidate lacks, is unavailable with its reason, and the Chord group says it needs a progression, the Pitch group that it needs a melody: on the screen', async ({ page }) => {
    await loop(page, { melodic: false });
    await open(page);
    await expect(dialog(page).locator('.variation-group[data-group="Chord"] .variation-group-reason')).toHaveText('Needs a progression');
    await expect(dialog(page).locator('.variation-group[data-group="Pitch"] .variation-group-reason')).toHaveText('Needs a melody');
    await expect(technique(page, 'invert-chord')).toBeDisabled();
    await expect(technique(page, 'invert-chord').locator('.variation-technique-reason')).toHaveText('Needs a progression');
    await expect(technique(page, 'octave-up')).toBeDisabled();
    await expect(technique(page, 'triplet')).toBeDisabled();
    await expect(technique(page, 'triplet').locator('.variation-technique-reason')).toHaveText('No quarter-note Beat is on Straight 8ths');
    await expect(technique(page, 'add-syllable')).toBeEnabled();
  });
});

test.describe('AC-10.4.4 — A candidate is heard before it is written', () => {
  test('AC-10.4.4/1 — While a candidate exists the loop plays the original Measures followed by the candidate’s, through the playback overlay that cycle mode uses, which writes nothing; the Pattern’s JSON is unchanged throughout', async ({ page }) => {
    await loop(page);
    const before = JSON.stringify(await stored(page));
    await open(page);
    await technique(page, 'change-quality').click();
    await technique(page, 'sixteenth-fill').click();
    await expect(gridMeasures(page)).toHaveCount(2);
    expect((await state(page)).isPlaying).toBe(true);
    expect(JSON.stringify(await stored(page))).toBe(before);
    expect((await pattern(page)).measures).toHaveLength(1);
    expect(await page.evaluate(() => window.__rm.getState().pattern.harmony.overrides)).toBeUndefined();
  });

  test('AC-10.4.4/2 — The grid shows the candidate’s Measures after the Pattern’s own, marked as the candidate, and the playback cursor runs through them', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    await expect(candidateMeasures(page)).toHaveCount(1);
    await expect(candidateMeasures(page)).toHaveAttribute('data-measure', '1');
    await expect(candidateMeasures(page).locator('.measure-candidate')).toHaveText('Candidate');
    await expect(page.locator('.measure[data-measure="0"]')).not.toHaveClass(/candidate/);
    await expect.poll(() => page.evaluate(() => window.__rm.getState().transportPosition?.measureIndex ?? -1), { timeout: 8000 }).toBe(1);
  });

  test('AC-10.4.4/3 — Changing, adding, removing or rolling replaces the candidate — one candidate at a time, never a second copy — and the change is heard from the next pass, the loop counter keeps counting and nothing stops or restarts', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    await expect(gridMeasures(page)).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => window.__rm.getState().loop), { timeout: 8000 }).toBeGreaterThan(0);
    const loopBefore = (await state(page)).loop;
    await technique(page, 'lift').click();
    await expect(gridMeasures(page)).toHaveCount(2);
    await roll(page).click();
    await expect(gridMeasures(page)).toHaveCount(2);
    await entries(page).nth(0).locator('.variation-remove').click();
    const s = await state(page);
    expect(s.isPlaying).toBe(true);
    expect(s.loop).toBeGreaterThanOrEqual(loopBefore);
  });

  test('AC-10.4.4/4 — When the transport was stopped, opening the dialog starts the loop, so the original is heard before anything is built and the candidate from its first pass; closing the dialog without accepting returns a transport the dialog started to stopped; when it was playing it plays on', async ({ page }) => {
    await loop(page);
    expect((await state(page)).isPlaying).toBe(false);
    await open(page);
    // Opening starts it, with nothing built: the original is the baseline.
    await expect.poll(() => page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
    await expect(dialog(page).locator('.variation-playing')).toHaveText(/Playing the original\. Add a technique/);
    await expect(entries(page)).toHaveCount(0);
    await technique(page, 'breathe').click();
    await expect(dialog(page).locator('.variation-playing')).toHaveText(/Playing the original, then the candidate/);
    // The dialog's own Stop holds the loop through a change; its Play starts it again.
    await dialog(page).locator('.variation-play').click();
    await expect.poll(() => page.evaluate(() => window.__rm.getState().isPlaying)).toBe(false);
    await expect(dialog(page).locator('.variation-playing')).toHaveText(/^Stopped/);
    await technique(page, 'lift').click();
    expect((await state(page)).isPlaying).toBe(false);
    await dialog(page).locator('.variation-play').click();
    await expect.poll(() => page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
    await close(page).click();
    await expect.poll(() => page.evaluate(() => window.__rm.getState().isPlaying)).toBe(false);
    await page.locator('.transport').click();
    await expect.poll(() => page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
    await open(page);
    await technique(page, 'breathe').click();
    await close(page).click();
    expect((await state(page)).isPlaying).toBe(true);
  });

  test('AC-10.4.4/5 — Accept appends the candidate and closes the dialog; Accept and vary again appends it and opens a fresh, empty candidate from the same original over the lengthened Pattern; Close or Escape discards the candidate', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    await accept(page).click();
    await expect(dialog(page)).toHaveCount(0);
    expect((await pattern(page)).measures).toHaveLength(2);
    await open(page);
    await technique(page, 'lift').click();
    await again(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(entries(page)).toHaveCount(0);
    await expect(original(page)).toContainText('Original: Measure 1');
    expect((await pattern(page)).measures).toHaveLength(3);
    await expect(gridMeasures(page)).toHaveCount(3);
    await technique(page, 'soften').click();
    await expect(gridMeasures(page)).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    expect((await pattern(page)).measures).toHaveLength(3);
    await expect(gridMeasures(page)).toHaveCount(3);
    await open(page);
    await technique(page, 'soften').click();
    await close(page).click();
    expect((await pattern(page)).measures).toHaveLength(3);
  });

  test('AC-10.4.4/6 — A candidate’s chord overrides are heard in the audition exactly as they will sound once accepted: the deal, the note bands, the score and the chord names follow them for the candidate’s Measures', async ({ page }) => {
    await loop(page, { change: 'measure' });
    await open(page);
    await technique(page, 'change-quality').click();
    await field(page, 0, 'chord').selectOption('1');
    await expect(field(page, 0, 'quality')).toHaveValue('maj7');
    // In the first pass the copy is over F, now Fmaj7: the chord name and the dealt E.
    await expect(page.locator('.measure[data-measure="1"] .measure-chord')).toHaveText('Fmaj7');
    await expect(page.locator('.measure[data-measure="0"] .measure-chord')).toHaveText('Am');
    const names = await page.locator('.measure[data-measure="1"] .slot-note-name').allTextContents();
    expect(names.map((n) => n.replace(/\d/g, ''))).toEqual(['F', 'A', 'C', 'E']);
    await accept(page).click();
    await expect(page.locator('.measure[data-measure="1"] .measure-chord')).toHaveText('Fmaj7');
    expect(await page.locator('.measure[data-measure="1"] .slot-note-name').allTextContents()).toEqual(names);
  });
});

test.describe('AC-10.4.6 — Roll the dice builds a candidate', () => {
  test('AC-10.4.6/1 — The roll draws how many techniques — one, two or three — then each technique from those available on the candidate as the earlier draws left it, in a group not marked No dice, and each technique’s choice from the options its rule offers; a drawn technique that is unavailable at its turn is passed over: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    await feed(page, [0]);
    await roll(page).click();
    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page).nth(0)).toHaveAttribute('data-technique', 'add-syllable');
    await expect(field(page, 0, 'slot')).toHaveValue('0.0.1');
    await noDice(page, 'Rhythm').click();
    await feed(page, [0]);
    await roll(page).click();
    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page).nth(0)).toHaveAttribute('data-technique', 'lift');
    await feed(page, [0.99]);
    await roll(page).click();
    await expect(entries(page)).toHaveCount(3);
  });

  test('AC-10.4.6/2 — The rolled candidate always differs from the original: every technique in it changed something, by its rule: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    for (let i = 0; i < 6; i++) {
      await roll(page).click();
      await expect(candidateMeasures(page)).toHaveCount(1);
      const v = await variation(page);
      const p = await pattern(page);
      const differs = JSON.stringify(v.candidate.measures[0]) !== JSON.stringify(p.measures[0]) || Boolean(v.candidate.harmony.overrides);
      expect(differs, `roll ${i + 1}: ${v.stack.map((e) => e.id).join(', ')}`).toBe(true);
      expect(v.stack.length).toBeGreaterThan(0);
    }
  });

  test('AC-10.4.6/3 — The rolled stack is listed with each technique’s drawn choice, and can be added to, changed or trimmed exactly as a stack built by hand', async ({ page }) => {
    await loop(page);
    await open(page);
    await feed(page, [0.5, 0.1, 0.9, 0.3, 0.2]);
    await roll(page).click();
    const n = await entries(page).count();
    expect(n).toBeGreaterThan(0);
    const v = await variation(page);
    for (let i = 0; i < n; i++) {
      const entry = v.stack[i];
      for (const [key, value] of Object.entries(entry.choice)) await expect(field(page, i, key)).toHaveValue(value);
    }
    await technique(page, 'lift').click();
    await expect(entries(page)).toHaveCount(n + 1);
    await entries(page).nth(0).locator('.variation-remove').click();
    await expect(entries(page)).toHaveCount(n);
  });

  test('AC-10.4.6/4 — Rolling again replaces the whole candidate; the dice are disabled, saying so, when no technique is available outside the groups marked No dice', async ({ page }) => {
    await loop(page);
    await open(page);
    await feed(page, [0]);
    await roll(page).click();
    await expect(entries(page)).toHaveCount(1);
    await feed(page, [0.99]);
    await roll(page).click();
    await expect(entries(page)).toHaveCount(3);
    for (const g of ['Rhythm', 'Dynamics', 'Chord', 'Pitch']) await noDice(page, g).click();
    await expect(roll(page)).toBeDisabled();
    await expect(roll(page)).toHaveAttribute('title', /Nothing left to roll/);
    await noDice(page, 'Rhythm').click();
    await expect(roll(page)).toBeEnabled();
  });

  test('AC-10.4.6/5 — Each technique group carries a No dice toggle that keeps the group out of the roll and changes nothing else; the toggles hold for the session and are not Pattern content', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'breathe').click();
    const before = JSON.stringify(await stored(page));
    for (const g of ['Rhythm', 'Dynamics', 'Chord', 'Pitch']) await expect(noDice(page, g)).toHaveAttribute('aria-pressed', 'false');
    await noDice(page, 'Chord').click();
    await expect(noDice(page, 'Chord')).toHaveAttribute('aria-pressed', 'true');
    await expect(entries(page)).toHaveCount(1);
    expect(JSON.stringify(await stored(page))).toBe(before);
    for (let i = 0; i < 5; i++) {
      await roll(page).click();
      const v = await variation(page);
      expect(v.stack.some((e) => ['invert-chord', 'change-quality', 'change-fill', 'omit-member'].includes(e.id))).toBe(false);
    }
    expect(JSON.stringify(await stored(page))).not.toContain('noDice');
    await close(page).click();
    await open(page);
    await expect(noDice(page, 'Chord')).toHaveAttribute('aria-pressed', 'false');
  });

  test('AC-10.4.6/6 — The roll draws no random number of its own inside the musical rules: given the same draws it builds the same candidate: on the screen', async ({ page }) => {
    await loop(page);
    await open(page);
    const draws = [0.6, 0.3, 0.8, 0.1, 0.9, 0.4, 0.2];
    await feed(page, draws);
    await roll(page).click();
    const first = await variation(page);
    await feed(page, draws);
    await roll(page).click();
    const second = await variation(page);
    expect(second.stack).toEqual(first.stack);
    expect(second.candidate).toEqual(first.candidate);
  });
});

test.describe('AC-10.4.7 — A chord override is Pattern content that travels with its Measure', () => {
  test('AC-10.4.7/1 — An override is saved with the Pattern and survives a reload, is carried by the Pattern’s JSON export and its submission, and a Pattern saved before overrides existed loads unchanged, with none: on the screen', async ({ page }) => {
    await loop(page, { change: 'measure' });
    await open(page);
    await technique(page, 'change-quality').click();
    await field(page, 0, 'chord').selectOption('1');
    await accept(page).click();
    expect((await stored(page)).harmony.overrides).toEqual({ 1: { 1: { quality: 'maj7' } } });
    await page.reload();
    await page.evaluate(() => window.__rm.loadPattern(window.__rm.patternStore.findById('p_test'), { owned: true }));
    await expect(page.locator('.measure[data-measure="1"] .measure-chord')).toHaveText('Fmaj7');
    expect((await pattern(page)).harmony.overrides).toEqual({ 1: { 1: { quality: 'maj7' } } });
    // A Pattern from before: no overrides, nothing rewritten.
    await page.evaluate(() => {
      const p = structuredClone(window.__rm.getState().pattern);
      delete p.harmony.overrides;
      p.id = 'p_old';
      window.__rm.loadPattern(p, { owned: true });
    });
    await expect(page.locator('.measure[data-measure="1"] .measure-chord')).toHaveText('F');
    expect((await pattern(page)).harmony.overrides).toBeUndefined();
  });

  test('AC-10.4.7/2 — Removing the last Measure drops that Measure’s overrides with it; Double Length copies each Measure’s overrides onto its mirrored Measure; Condense and Append keep every override with the Measure it was on: on the screen', async ({ page }) => {
    await loop(page, { change: 'measure' });
    await open(page);
    await technique(page, 'change-quality').click();
    await field(page, 0, 'chord').selectOption('1');
    await accept(page).click();
    await page.locator('.rhythm-group [data-action="duplicate-pattern"]').click();
    await expect(gridMeasures(page)).toHaveCount(4);
    expect((await pattern(page)).harmony.overrides).toEqual({ 1: { 1: { quality: 'maj7' } }, 3: { 1: { quality: 'maj7' } } });
    await page.locator('[data-action="remove-measure"]').click();
    expect((await pattern(page)).harmony.overrides).toEqual({ 1: { 1: { quality: 'maj7' } } });
    await page.locator('[data-action="remove-measure"]').click();
    await page.locator('[data-action="remove-measure"]').click();
    expect((await pattern(page)).harmony.overrides).toBeUndefined();
  });

  test('AC-10.4.7/5 — Playback, the grid’s note bands and chord names, the score and MIDI export all follow the override for its Measures, from the one timeline; the MIDI file and the JSON carry no technique name, stack or original length: on the screen', async ({ page }) => {
    await loop(page, { change: 'measure' });
    await open(page);
    await technique(page, 'change-quality').click();
    await field(page, 0, 'chord').selectOption('1');
    await accept(page).click();
    const names = await page.locator('.measure[data-measure="1"] .slot-note-name').allTextContents();
    expect(names.map((n) => n.replace(/\d/g, ''))).toEqual(['F', 'A', 'C', 'E']);
    await page.locator('[data-action="view-sheet"]').click();
    await expect(page.locator('.score .chord-name', { hasText: 'Fmaj7' }).first()).toBeVisible();
    await page.locator('[data-action="view-grid"]').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-midi"]').click()]);
    const bytes = readFileSync(await download.path());
    const ons = midiNoteOns(bytes);
    // Pass 1, Measure 2 over Fmaj7: F A C E — the E is 76 or 64 depending on octave, and it is there.
    expect(ons.slice(4, 8).map((n) => n % 12)).toEqual([5, 9, 0, 4]);
    const text = Buffer.from(bytes).toString('latin1');
    for (const word of ['technique', 'stack', 'phraseLength', 'change-quality']) expect(text).not.toContain(word);
    const json = JSON.stringify(await stored(page));
    for (const word of ['technique', 'stack', 'phraseLength', 'change-quality']) expect(json).not.toContain(word);
  });
});

test.describe('AC-10.4.8 — The Add variation dialog', () => {
  test('AC-10.4.8/1 — Add variation sits beside Double Length in the grid editor’s Measures row, in the Composer’s Measures control, and on every making goal in a Measures row at the foot of the Melody group carrying Add variation and Double Length; disabled with the reason when the cap refuses it', async ({ page }) => {
    await loop(page);
    const row = page.locator('.rhythm-group .structure-row');
    const actions = await row.locator('button').evaluateAll((bs) => bs.map((b) => b.dataset.action));
    expect(actions.indexOf('add-variation')).toBe(actions.indexOf('duplicate-pattern') - 1);
    // Lab has a Rhythm group, and the Melody group still ends with the pair (revised 2026-11-01).
    await showMelody(page);
    const labPair = page.locator('.melody-group .melody-measures');
    await expect(labPair).toBeVisible();
    expect(await labPair.locator('button').evaluateAll((bs) => bs.map((b) => b.dataset.action))).toEqual(['add-variation', 'duplicate-pattern']);
    expect(await page.locator('.melody-group > *').last().evaluate((e) => Boolean(e.querySelector('.melody-measures')) || e.classList.contains('control'))).toBe(true);
    // Make it melodic: no Rhythm group, and the Melody group ends with the pair all the same.
    await page.evaluate(() => window.__rm.handlers.onGoal('melodic'));
    await expect(page.locator('.workbench-tab[data-tab="rhythm"]')).toBeHidden();
    await showMelody(page);
    const pair = page.locator('.melody-group .melody-measures');
    await expect(pair).toBeVisible();
    expect(await pair.locator('button').evaluateAll((bs) => bs.map((b) => b.dataset.action))).toEqual(['add-variation', 'duplicate-pattern']);
    expect(await page.locator('.melody-group > *').last().evaluate((e) => Boolean(e.querySelector('.melody-measures')) || e.classList.contains('control'))).toBe(true);
    // The cap refuses, with the reason.
    await page.evaluate(async () => {
      for (let i = 1; i < 32; i++) await window.__rm.handlers.onAddMeasure();
    });
    await expect(pair.locator('[data-action="add-variation"]')).toBeDisabled();
    await expect(pair.locator('[data-action="add-variation"]')).toHaveAttribute('title', /32 Measures/);
    // The Composer's Measures control.
    await page.locator('.mode-switch [data-mode="composer"]').click();
    await expect(page.locator('.composer-panel')).toBeVisible();
    // Entering may offer the open Pattern (AC-19.1.2); take it, so the draft and its Measures control are there.
    await page.locator('.dialog-host .dialog').waitFor({ timeout: 1500 }).catch(() => {});
    if (await page.locator('.dialog-host .dialog').count()) await page.locator('.dialog-host .dialog-button.primary').click();
    await expect(page.locator('.composer-panel .composer-add-variation')).toBeVisible();
    await expect(page.locator('.composer-panel .composer-duplicate')).toBeVisible();
  });

  test('AC-10.4.8/2 — The dialog opens with a Play/Stop line saying what the loop plays — the original, then the candidate once there is one — then names the original as Measures 1 to N with a control to change N, then the candidate’s stack — each technique with its choice as a control, and a remove control — then Roll the dice with its No dice toggles, then the techniques under the headings Rhythm, Dynamics, Chord and Pitch in the order of AC-10.4.5, each with its name and one line saying what it does', async ({ page }) => {
    await loop(page);
    await page.evaluate(() => window.__rm.handlers.onAddMeasure());
    await open(page);
    // The Play/Stop line is the first thing after the title, and says what plays.
    expect(await dialog(page).locator('.dialog-title + *').evaluate((e) => e.className)).toBe('variation-transport');
    await expect(dialog(page).locator('.variation-transport .variation-play')).toHaveText('■ Stop');
    await expect(dialog(page).locator('.variation-transport .variation-playing')).toHaveText(/Playing the original/);
    await expect(original(page)).toContainText('Original: Measures 1–2');
    await expect(phrase(page)).toBeVisible();
    await technique(page, 'add-syllable').click();
    await expect(dialog(page).locator('.variation-playing')).toHaveText(/then the candidate/);
    await expect(entries(page).nth(0).locator('.variation-entry-label')).toHaveText('Add a syllable');
    await expect(field(page, 0, 'slot')).toBeVisible();
    await expect(entries(page).nth(0).locator('.variation-remove')).toBeVisible();
    const order = await dialog(page)
      .locator('.variation-original, .variation-stack, .variation-dice, .variation-groups, .variation-actions')
      .evaluateAll((els) => els.map((e) => e.className.split(' ').find((c) => c.startsWith('variation-'))));
    expect(order).toEqual(['variation-original', 'variation-stack', 'variation-dice', 'variation-groups', 'variation-actions']);
    expect(await dialog(page).locator('.variation-group').evaluateAll((els) => els.map((e) => e.dataset.group))).toEqual(['Rhythm', 'Dynamics', 'Chord', 'Pitch']);
    expect(await dialog(page).locator('.variation-technique').evaluateAll((els) => els.map((e) => e.dataset.technique))).toEqual([
      'add-syllable', 'remove-syllable', 'move-syllable', 'triplet', 'sixteenth-fill', 'breathe', 'halve-beat', 'rotate',
      'lift', 'soften', 'shift-accent',
      'invert-chord', 'change-quality', 'change-fill', 'omit-member',
      'octave-up', 'octave-down',
    ]);
    for (const b of await dialog(page).locator('.variation-technique').all()) {
      expect((await b.locator('.variation-technique-name').textContent()).length).toBeGreaterThan(2);
      expect((await b.locator('.variation-technique-describe').textContent()).length).toBeGreaterThan(10);
    }
    await expect(dialog(page).locator('.variation-nodice')).toHaveCount(4);
    await expect(roll(page)).toBeVisible();
  });

  test('AC-10.4.8/3 — Tapping a technique adds it to the stack with its default choice; an unavailable technique is shown disabled with its reason', async ({ page }) => {
    await loop(page);
    await open(page);
    await technique(page, 'change-fill').click();
    await expect(entries(page)).toHaveCount(1);
    await expect(field(page, 0, 'chord')).toHaveValue('3');
    await expect(field(page, 0, 'fill')).toHaveValue('down');
    await expect(technique(page, 'octave-up')).toBeDisabled();
    await expect(technique(page, 'octave-up').locator('.variation-technique-reason')).toHaveText('The Ascending fill deals the notes');
  });

  test('AC-10.4.8/4 — The dialog carries Accept, Accept and vary again, and Close; Accept and Accept and vary again are disabled while the stack is empty', async ({ page }) => {
    await loop(page);
    await open(page);
    await expect(accept(page)).toBeDisabled();
    await expect(again(page)).toBeDisabled();
    await expect(close(page)).toBeEnabled();
    await technique(page, 'breathe').click();
    await expect(accept(page)).toBeEnabled();
    await expect(again(page)).toBeEnabled();
    await entries(page).nth(0).locator('.variation-remove').click();
    await expect(accept(page)).toBeDisabled();
  });

  test('AC-10.4.8/5 — The dialog is a named dialog that takes focus on opening, returns it to Add variation on closing, and whose techniques, choices and reasons are read by assistive technology as buttons and selects with their descriptions', async ({ page }) => {
    await loop(page);
    await showRhythm(page);
    await addButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAttribute('role', 'dialog');
    await expect(dialog(page)).toHaveAttribute('aria-label', 'Add variation');
    expect(await page.evaluate(() => document.querySelector('.variation-dialog').contains(document.activeElement))).toBe(true);
    const t = technique(page, 'triplet');
    expect(await t.evaluate((b) => b.tagName)).toBe('BUTTON');
    const described = await t.getAttribute('aria-describedby');
    await expect(page.locator(`#${described}`)).toHaveText('No quarter-note Beat is on Straight 8ths');
    await technique(page, 'invert-chord').click();
    await expect(field(page, 0, 'chord')).toHaveAttribute('aria-label', 'Invert a chord: Chord');
    await expect(field(page, 0, 'bass')).toHaveAttribute('aria-label', 'Invert a chord: Bass');
    await expect(phrase(page)).toHaveAttribute('aria-label', /Length of the original/);
    await close(page).click();
    await expect(addButton(page)).toBeFocused();
  });

  test('AC-10.4.8/6 — On a phone the dialog fills the width within the mobile breakpoint with the groups stacked, each technique a full-width row; on desktop and tablet it is a dialog over the editor', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await loop(page);
    // The layout is what is under test; the dialog is opened through its handler.
    await page.evaluate(() => window.__rm.handlers.onAddVariation());
    await expect(dialog(page)).toBeVisible();
    const box = await dialog(page).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(375 - 2 * 16);
    const columns = await dialog(page).locator('.variation-techniques').first().evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(1);
    const groups = await dialog(page).locator('.variation-group').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    for (let i = 1; i < groups.length; i++) expect(groups[i]).toBeGreaterThan(groups[i - 1]);
    await close(page).click();
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.evaluate(() => window.__rm.handlers.onAddVariation());
    await expect(dialog(page)).toBeVisible();
    const wide = await dialog(page).boundingBox();
    expect(wide.width).toBeLessThanOrEqual(640);
    expect(wide.width).toBeGreaterThan(500);
    await expect(page.locator('.variation-backdrop')).toBeVisible();
    expect(await dialog(page).locator('.variation-techniques').first().evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(2);
  });

  test('AC-10.4.8/7 — Help gains an entry for Add variation naming the original, the stack, the dice and the chord override', async ({ page }) => {
    await loop(page);
    await showRhythm(page);
    await page.locator('.goal-strip [data-action="toggle-help"]').click();
    const tip = page.locator('[data-section="rhythm"] .help-tip[data-help-for="Add variation"]');
    await expect(tip).toBeVisible();
    expect(await tip.evaluate((t) => t.previousElementSibling?.matches('[data-action="add-variation"]'))).toBe(true);
    await tip.click();
    const text = await page.locator('.help-pop .help-pop-text').textContent();
    for (const word of ['original', 'techniques', 'dice', 'inversion']) expect(text).toContain(word);
  });
});
