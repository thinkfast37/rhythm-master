/*
 * US-2.17 — Start a chord progression from scratch, proved on the screen: the
 * progression picker's Custom entry, the one chord it gives, the chord editor
 * that builds the rest, Undo, the naming prompt, a reload and the MIDI file.
 * The pure half is proved in tests/unit/core/progression-scratch.test.js.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** A blank owned Melodic 4/4 Pattern in C Ionian with a note on every Beat and no progression. */
async function melodicBlank(page) {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  for (let b = 0; b < 4; b++) await slotAt(page, b, 0).locator('.slot-accent').click();
}

const slotAt = (page, beat, slot, measure = 0) =>
  page.locator(`.measure[data-measure="${measure}"] .slot[data-beat="${beat}"][data-slot="${slot}"]`);
const namesIn = (page, measure = 0) => page.locator(`.measure[data-measure="${measure}"] .slot-note-name`).allTextContents();
const picker = (page) => page.locator('.progression-picker');
const rows = (page) => page.locator('.chord-editor');
const row = (page, chord) => page.locator(`.chord-editor[data-chord="${chord}"]`);
const chordNames = (page) => page.locator('.chord-chip .chord-name').allTextContents();
const pattern = (page) => page.evaluate(() => window.__rm.getState().pattern);
const chords = async (page) => (await pattern(page)).harmony?.chords ?? null;
const pitches = async (page) => (await pattern(page)).measures.flatMap((m) => m.beats.flatMap((b) => b.slots.map((s) => s.pitch ?? null)));
const stored = (page, id) =>
  page.evaluate((pid) => window.__rm.patternStore.loadAll().find((p) => p.id === pid)?.harmony?.chords ?? null, id);

/** The picker's direct children, as [tag, value or label]. */
const pickerShape = (page) =>
  picker(page)
    .locator(':scope > *')
    .evaluateAll((els) => els.map((e) => [e.tagName, e.tagName === 'OPTION' ? e.value : e.label]));

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

// --- AC-2.17.1 — A progression is started from one chord instead of a catalogue entry ---

test('AC-2.17.1/1 — The picker offers Custom second, after None and before the first catalogue heading, whether or not a progression is in force', async ({ page }) => {
  await melodicBlank(page);
  const expectShape = async () => {
    const shape = await pickerShape(page);
    expect(shape.slice(0, 3)).toEqual([['OPTION', 'none'], ['OPTION', 'custom'], ['OPTGROUP', 'Three chords and repeats']]);
    expect(shape.filter(([tag]) => tag === 'OPTION')).toHaveLength(2);
    await expect(picker(page).locator('option[value="custom"]')).toHaveText('Custom');
  };
  // No progression.
  await expectShape();
  await expect(picker(page)).toHaveValue('none');
  // A catalogue progression in force.
  await picker(page).selectOption('I-IV-V');
  await expectShape();
  await expect(picker(page)).toHaveValue('I-IV-V');
  // Custom in force.
  await picker(page).selectOption('custom');
  await expectShape();
  await expect(picker(page)).toHaveValue('custom');
});

test('AC-2.17.1/2 — Choosing Custom gives the Pattern one chord, the tonic of the Key spelled from the scale as a catalogue pick spells it, over its root: C in C Ionian, Cm in C Aeolian and under C Minor Pentatonic, D in D Mixolydian', async ({ page }) => {
  await melodicBlank(page);
  await picker(page).selectOption('custom');
  expect(await chords(page)).toEqual([{ degree: '1', quality: 'maj' }]);
  expect(await chordNames(page)).toEqual(['C']);
  await expect(row(page, 0).locator('.chord-editor-name')).toHaveText('C');
  await expect(row(page, 0).locator('.chord-bass')).toHaveValue('0');
  // A chord is spelled at the moment of choosing (AC-2.6.2/5), so the scale is
  // set with no progression in force each time.
  for (const [key, scale, name] of [['C', 'aeolian', 'Cm'], ['C', 'minor-pentatonic', 'Cm'], ['D', 'mixolydian', 'D']]) {
    await picker(page).selectOption('none');
    await page.locator('.key-picker').selectOption(key);
    await page.locator('.scale-picker').selectOption(scale);
    await picker(page).selectOption('custom');
    expect(await chordNames(page)).toEqual([name]);
    expect(await chords(page)).toHaveLength(1);
  }
});

test('AC-2.17.1/3 — The Arpeggio already chosen stays and Ascending is set only when it is None, as a catalogue pick does; a progression begun with none in force changes every pass, and one begun over a progression keeps its change setting', async ({ page }) => {
  await melodicBlank(page);
  // Begun with no progression: Ascending, every pass.
  await picker(page).selectOption('custom');
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up');
  await expect(page.locator('.chord-change[data-change="pass"]')).toHaveAttribute('aria-pressed', 'true');
  // Begun over a progression under Alberti changing every Measure: both stay.
  await picker(page).selectOption('I-IV-V');
  await page.locator('.arpeggio-picker').selectOption('alberti');
  await page.locator('.chord-change[data-change="measure"]').click();
  await picker(page).selectOption('custom');
  expect(await chords(page)).toHaveLength(1);
  await expect(page.locator('.arpeggio-picker')).toHaveValue('alberti');
  await expect(page.locator('.chord-change[data-change="measure"]')).toHaveAttribute('aria-pressed', 'true');
  // Begun over a progression with the Arpeggio put back to None: Ascending again.
  await picker(page).selectOption('I-IV-V');
  await page.locator('.arpeggio-picker').selectOption('none');
  await picker(page).selectOption('custom');
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up');
});

test('AC-2.17.1/4 — Choosing Custom while a catalogue progression is in force replaces its chords with the one chord, and every stored Pitch is left exactly as it was', async ({ page }) => {
  await melodicBlank(page);
  await picker(page).selectOption('I-V-vi-IV');
  // A written melody of roles and fixed degrees, stored under the progression.
  await page.evaluate(() => {
    const p = structuredClone(window.__rm.getState().pattern);
    p.measures[0].beats[0].slots[0].pitch = { tone: 3, octaveOffset: 0 };
    p.measures[0].beats[1].slots[0].pitch = { degree: '5', octaveOffset: -1 };
    p.measures[0].beats[2].slots[0].pitch = { tone: 5, octaveOffset: 1 };
    window.__rm.loadPattern(p, { owned: true });
  });
  const before = await pitches(page);
  expect((await chords(page)).length).toBe(4);
  await picker(page).selectOption('custom');
  expect(await chords(page)).toEqual([{ degree: '1', quality: 'maj' }]);
  expect(await pitches(page)).toEqual(before);
  expect(await chordNames(page)).toEqual(['C']);
});

test('AC-2.17.1/5 — Under Cycle progressions, choosing Custom turns the cycle off, as None does, so the one chord is what sounds', async ({ page }) => {
  await melodicBlank(page);
  await picker(page).selectOption('I-IV-V');
  await page.locator('.progression-cycle').click();
  expect(await page.evaluate(() => window.__rm.getState().progressionCycle.on)).toBe(true);
  expect(await page.evaluate(() => window.__rm.progressionInForce())).toBe('I-IV-V');
  await picker(page).selectOption('custom');
  expect(await page.evaluate(() => window.__rm.getState().progressionCycle.on)).toBe(false);
  expect(await page.evaluate(() => window.__rm.progressionInForce())).toBeNull();
  await expect(page.locator('.progression-cycle')).toHaveAttribute('aria-pressed', 'false');
  expect(await chordNames(page)).toEqual(['C']);
  await expect(picker(page)).toHaveValue('custom');
});

test('AC-2.17.1/6 — Starting from scratch is a Pattern edit: it is one Undo step, auto-saves into an owned Pattern, and on a shipped Pattern goes through the naming prompt, cancelling it leaving the Pattern as it was', async ({ page }) => {
  await melodicBlank(page);
  const id = (await pattern(page)).id;
  expect(await stored(page, id)).toBeNull();
  await picker(page).selectOption('custom');
  expect(await stored(page, id)).toEqual([{ degree: '1', quality: 'maj' }]);
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up');
  // One Undo: the progression and the Ascending set with it go together.
  await page.evaluate(() => window.__rm.undo());
  expect('harmony' in (await pattern(page))).toBe(false);
  await expect(picker(page)).toHaveValue('none');
  await expect(rows(page)).toHaveCount(0);
  expect(await stored(page, id)).toBeNull();
  // Auto-saved: still there after a reload.
  await picker(page).selectOption('custom');
  await page.reload();
  expect(await stored(page, id)).toEqual([{ degree: '1', quality: 'maj' }]);
  await page.evaluate((pid) => window.__rm.loadPattern(window.__rm.patternStore.loadAll().find((p) => p.id === pid), { owned: true }), id);
  await expect(picker(page)).toHaveValue('custom');
  await expect(rows(page)).toHaveCount(1);
  await picker(page).selectOption('none');

  // A shipped Pattern: the naming prompt first; cancelled, nothing changes.
  await page.evaluate(() => {
    const p = structuredClone(window.__rm.getState().pattern);
    p.id = 'p_pretend_shipped';
    p.name = 'Pretend Shipped';
    p.measures[0].beats[3].slots[1] = { on: true, pitch: { degree: '5', octaveOffset: 0 } };
    window.__rm.loadPattern(p, { owned: false });
  });
  await picker(page).selectOption('custom');
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button:not(.primary)', { hasText: 'Cancel' }).click();
  expect('harmony' in (await pattern(page))).toBe(false);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await expect(picker(page)).toHaveValue('none');
  await expect(rows(page)).toHaveCount(0);
});

// --- AC-2.17.2 — The chords are built from the one chord, and the picker says what they are ---

test('AC-2.17.2/1 — The chord editor opens with one row; + Chord adds a copy of the last chord, up to sixteen, and a chord is removed down to one, never to none', async ({ page }) => {
  await melodicBlank(page);
  await expect(rows(page)).toHaveCount(0);
  await picker(page).selectOption('custom');
  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('[data-action="remove-chord"][data-chord="0"]')).toBeDisabled();
  await row(page, 0).locator('.chord-quality').selectOption('m7');
  for (let n = 2; n <= 16; n++) {
    await page.locator('[data-action="add-chord"]').click();
    await expect(rows(page)).toHaveCount(n);
  }
  await expect(page.locator('[data-action="add-chord"]')).toBeDisabled();
  expect((await chords(page)).every((c) => c.degree === '1' && c.quality === 'm7')).toBe(true);
  for (let n = 16; n > 1; n--) {
    await page.locator(`[data-action="remove-chord"][data-chord="${n - 1}"]`).click();
    await expect(rows(page)).toHaveCount(n - 1);
  }
  await expect(page.locator('[data-action="remove-chord"][data-chord="0"]')).toBeDisabled();
  expect(await chordNames(page)).toEqual(['Cm7']);
});

test('AC-2.17.2/2 — The picker reads Custom while the chords match no catalogue entry and names the entry when they do: one chord built into C, F and G reads I–IV–V, and that progression with its second root set to ♭6 reads Custom again', async ({ page }) => {
  await melodicBlank(page);
  await picker(page).selectOption('custom');
  await expect(picker(page)).toHaveValue('custom');
  await page.locator('[data-action="add-chord"]').click();
  await page.locator('[data-action="add-chord"]').click();
  await expect(picker(page)).toHaveValue('custom');
  await row(page, 1).locator('.chord-root').selectOption('4');
  await expect(picker(page)).toHaveValue('custom');
  await row(page, 2).locator('.chord-root').selectOption('5');
  expect(await chordNames(page)).toEqual(['C', 'F', 'G']);
  await expect(picker(page)).toHaveValue('I-IV-V');
  await expect(picker(page).locator('option:checked')).toHaveText('I–IV–V');
  await row(page, 1).locator('.chord-root').selectOption('b6');
  expect(await chordNames(page)).toEqual(['C', 'Ab', 'G']);
  await expect(picker(page)).toHaveValue('custom');
});

test("AC-2.17.2/3 — Chords begun from scratch are the Pattern's as a catalogue entry's are: saved with it and surviving a reload, dealt by the Arpeggio on the grid, and carried into the MIDI file", async ({ page }) => {
  await melodicBlank(page);
  const id = (await pattern(page)).id;
  await picker(page).selectOption('custom');
  await page.locator('[data-action="add-chord"]').click();
  await row(page, 1).locator('.chord-root').selectOption('5');
  expect(await chordNames(page)).toEqual(['C', 'G']);
  // Saved, and still there after a reload.
  await page.reload();
  expect(await stored(page, id)).toEqual([{ degree: '1', quality: 'maj' }, { degree: '5', quality: 'maj' }]);
  await page.evaluate((pid) => window.__rm.loadPattern(window.__rm.patternStore.loadAll().find((p) => p.id === pid), { owned: true }), id);
  expect(await chordNames(page)).toEqual(['C', 'G']);
  // Dealt by Ascending on the grid: the first pass under the C.
  expect(await namesIn(page)).toEqual(['C4', 'E4', 'G4', 'C4']);
  // And both passes reach the MIDI file.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-midi"]').click()]);
  expect(midiNoteOns(readFileSync(await download.path())).slice(0, 8)).toEqual([60, 64, 67, 60, 67, 71, 74, 67]);
});
