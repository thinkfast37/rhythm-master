/*
 * US-2.16 — Chords with a member left out, and a wider chord catalogue, proved
 * on the screen: the Omit toggles and the quality picker on each chord-editor
 * row, the chord strip, the Bass picker, the grid's note bands and the MIDI
 * file. The pure half is proved in tests/unit/core/chord-omit.test.js.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * An owned Melodic Pattern in C Ionian: one Measure of 4/4 with a note on
 * every Beat, I–IV–V over its roots, Ascending. At rest the grid shows pass 1,
 * the I, so a member struck from the first chord is visible without playing.
 */
async function struck(page, { arpeggio = 'up' } = {}) {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  for (let b = 0; b < 4; b++) await slotAt(page, b, 0).locator('.slot-accent').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await page.locator('.arpeggio-picker').selectOption(arpeggio);
  await page.locator('.voicing-picker').selectOption('root');
}

const slotAt = (page, beat, slot, measure = 0) =>
  page.locator(`.measure[data-measure="${measure}"] .slot[data-beat="${beat}"][data-slot="${slot}"]`);
const namesIn = (page, measure = 0) => page.locator(`.measure[data-measure="${measure}"] .slot-note-name`).allTextContents();
const rolesIn = (page, measure = 0) => page.locator(`.measure[data-measure="${measure}"] .slot-degree`).allTextContents();
const row = (page, chord) => page.locator(`.chord-editor[data-chord="${chord}"]`);
const toggles = (page, chord) => row(page, chord).locator('.chord-omit-toggle');
const toggle = (page, chord, tone) => row(page, chord).locator(`.chord-omit-toggle[data-tone="${tone}"]`);
const toggleLabels = (page, chord) => toggles(page, chord).allTextContents();
const pressed = (page, chord) => toggles(page, chord).evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-pressed')));
const quality = (page, chord) => row(page, chord).locator('.chord-quality');
const bassOptions = (page, chord) => row(page, chord).locator('.chord-bass option').allTextContents();
const readout = (page, chord) => row(page, chord).locator('.chord-editor-name');
const chordNames = (page) => page.locator('.chord-chip .chord-name').allTextContents();
const numerals = (page) => page.locator('.chord-chip .chord-numeral').allTextContents();
const pattern = (page) => page.evaluate(() => window.__rm.getState().pattern);
const chordOmits = async (page) => (await pattern(page)).harmony.chords.map((c) => c.omit ?? null);

/** The IV made Em7: C, Em7, G. */
async function withEm7(page) {
  await row(page, 1).locator('.chord-root').selectOption('3');
  await quality(page, 1).selectOption('m7');
}

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

// --- AC-2.16.1 — Any member of a chord but its root can be left out ---

test("AC-2.16.1/1 — Each chord-editor row carries, after the bass, one Omit toggle per member of the chord but its root, labelled as the member is — 3 and 5 on a triad; 3, 5 and 7 on a seventh chord; 2 or 4 in the 3rd's place on a sus chord and 6 in the 7th's on a sixth chord; 9, 11 and 13 as the chord has them — none pressed until a member is left out", async ({ page }) => {
  await struck(page);
  // After the bass, before the fill.
  const order = await row(page, 0).locator(':scope > *').evaluateAll((els) => els.map((e) => e.className.split(' ')[0]));
  expect(order.indexOf('chord-omit')).toBe(order.indexOf('chord-bass') + 1);
  expect(order.indexOf('chord-omit')).toBeLessThan(order.indexOf('chord-fill'));
  expect(await toggleLabels(page, 0)).toEqual(['3', '5']);
  expect(await pressed(page, 0)).toEqual(['false', 'false']);
  await quality(page, 0).selectOption('m7');
  expect(await toggleLabels(page, 0)).toEqual(['3', '5', '7']);
  await quality(page, 0).selectOption('sus4');
  expect(await toggleLabels(page, 0)).toEqual(['4', '5']);
  await quality(page, 0).selectOption('sus2');
  expect(await toggleLabels(page, 0)).toEqual(['2', '5']);
  await quality(page, 0).selectOption('6');
  expect(await toggleLabels(page, 0)).toEqual(['3', '5', '6']);
  await quality(page, 0).selectOption('13');
  expect(await toggleLabels(page, 0)).toEqual(['3', '5', '7', '9', '13']);
  await quality(page, 0).selectOption('m11');
  expect(await toggleLabels(page, 0)).toEqual(['3', '5', '7', '9', '11']);
  expect(await pressed(page, 0)).toEqual(['false', 'false', 'false', 'false', 'false']);
  // The toggles are named for a reader who cannot see them.
  await expect(toggle(page, 0, 3)).toHaveAttribute('aria-label', 'Chord 1: leave out the 3');
});

test('AC-2.16.1/2 — Pressing a toggle leaves that member out of that chord alone and pressing it again restores it, the name and numeral naming what is left out: Em7 with its 3rd struck is Em7(no3) and vi7(no3), with its 5th struck Em7(no5), with both Em7(no3,5); every other chord is unchanged', async ({ page }) => {
  await struck(page);
  await withEm7(page);
  expect(await chordNames(page)).toEqual(['C', 'Em7', 'G']);
  await toggle(page, 1, 3).click();
  await expect(readout(page, 1)).toHaveText('Em7(no3)');
  expect(await chordNames(page)).toEqual(['C', 'Em7(no3)', 'G']);
  // In C the chord is the iii; the numeral carries the omission as the name does.
  expect(await numerals(page)).toEqual(['I', 'iii7(no3)', 'V']);
  expect(await pressed(page, 1)).toEqual(['true', 'false', 'false']);
  await toggle(page, 1, 5).click();
  await expect(readout(page, 1)).toHaveText('Em7(no3,5)');
  await toggle(page, 1, 3).click();
  await expect(readout(page, 1)).toHaveText('Em7(no5)');
  expect(await pressed(page, 1)).toEqual(['false', 'true', 'false']);
  expect(await chordOmits(page)).toEqual([null, [5], null]);
  await toggle(page, 1, 5).click();
  await expect(readout(page, 1)).toHaveText('Em7');
  expect(await chordOmits(page)).toEqual([null, null, null]);
  expect(await pressed(page, 0)).toEqual(['false', 'false']);
});

test('AC-2.16.1/3 — At least two members always remain: a toggle whose press would leave one is disabled, so a triad can lose its 3rd or its 5th but not both, and a seventh chord can be left as its root and 7th', async ({ page }) => {
  await struck(page);
  await toggle(page, 0, 3).click();
  await expect(toggle(page, 0, 5)).toBeDisabled();
  await expect(toggle(page, 0, 3)).toBeEnabled();
  await toggle(page, 0, 3).click();
  await expect(toggle(page, 0, 5)).toBeEnabled();
  await toggle(page, 0, 5).click();
  await expect(toggle(page, 0, 3)).toBeDisabled();
  await expect(readout(page, 0)).toHaveText('C(no5)');
  // A seventh chord down to its shell.
  await quality(page, 2).selectOption('7');
  await toggle(page, 2, 3).click();
  await toggle(page, 2, 5).click();
  await expect(readout(page, 2)).toHaveText('G7(no3,5)');
  await expect(toggle(page, 2, 7)).toBeDisabled();
  expect(await bassOptions(page, 2)).toEqual(['G (root)', 'F']);
});

test("AC-2.16.1/4 — Changing the chord's quality keeps every omission the new chord has a member for, and drops them all when together they would leave it fewer than two members; changing the root keeps them: G6(no5) made a 7 is G7(no5), Em7(no3) made minor is Em(no3), Em7(no3,5) made minor is Em", async ({ page }) => {
  await struck(page);
  await withEm7(page);
  await quality(page, 2).selectOption('6');
  await toggle(page, 2, 5).click();
  await expect(readout(page, 2)).toHaveText('G6(no5)');
  await quality(page, 2).selectOption('7');
  await expect(readout(page, 2)).toHaveText('G7(no5)');
  await toggle(page, 1, 3).click();
  await quality(page, 1).selectOption('min');
  await expect(readout(page, 1)).toHaveText('Em(no3)');
  await quality(page, 1).selectOption('m7');
  await toggle(page, 1, 5).click();
  await expect(readout(page, 1)).toHaveText('Em7(no3,5)');
  await quality(page, 1).selectOption('min');
  await expect(readout(page, 1)).toHaveText('Em');
  expect(await chordOmits(page)).toEqual([null, null, [5]]);
  // The root keeps them.
  await row(page, 2).locator('.chord-root').selectOption('6');
  await expect(readout(page, 2)).toHaveText('A7(no5)');
});

test('AC-2.16.1/5 — The Bass picker offers the remaining members alone, and the bass stays on its member while the member remains and returns to the root when the member is struck: Em7/B with its 3rd struck is Em7(no3)/B and offers E, B and D; with its 5th struck instead it sits over E', async ({ page }) => {
  await struck(page);
  await withEm7(page);
  expect(await bassOptions(page, 1)).toEqual(['E (root)', 'G', 'B', 'D']);
  await row(page, 1).locator('.chord-bass').selectOption('2');
  await expect(readout(page, 1)).toHaveText('Em7/B');
  await toggle(page, 1, 3).click();
  await expect(readout(page, 1)).toHaveText('Em7(no3)/B');
  expect(await bassOptions(page, 1)).toEqual(['E (root)', 'B', 'D']);
  await expect(row(page, 1).locator('.chord-bass')).toHaveValue('1');
  // Restore the 3rd: still over B, now member 2 again.
  await toggle(page, 1, 3).click();
  await expect(readout(page, 1)).toHaveText('Em7/B');
  await expect(row(page, 1).locator('.chord-bass')).toHaveValue('2');
  // Strike the 5th, the member in the bass: back to the root.
  await toggle(page, 1, 5).click();
  await expect(readout(page, 1)).toHaveText('Em7(no5)');
  expect(await bassOptions(page, 1)).toEqual(['E (root)', 'G', 'D']);
  await expect(row(page, 1).locator('.chord-bass')).toHaveValue('0');
});

test("AC-2.16.1/6 — An omission is Pattern content: it is saved with the Pattern and survives a reload, auto-saves into an owned Pattern, is one Undo step, is carried by the Pattern's JSON export and its submission, tells two otherwise identical Patterns apart, and on a shipped Pattern goes through the naming prompt, cancelling it leaving the Pattern as it was; a Pattern whose chords leave nothing out is exactly as it was before", async ({ page }) => {
  await struck(page);
  const id = (await pattern(page)).id;
  const stored = () => page.evaluate((pid) => window.__rm.patternStore.loadAll().find((p) => p.id === pid)?.harmony.chords.map((c) => c.omit ?? null), id);
  // Nothing struck, nothing written: the chords are as they always were.
  expect(JSON.stringify(await pattern(page))).not.toContain('omit');
  await toggle(page, 0, 5).click();
  expect(await stored()).toEqual([[5], null, null]);
  await page.reload();
  expect(await stored()).toEqual([[5], null, null]);
  await page.evaluate((pid) => window.__rm.loadPattern(window.__rm.patternStore.loadAll().find((p) => p.id === pid), { owned: true }), id);
  await expect(readout(page, 0)).toHaveText('C(no5)');
  await toggle(page, 1, 3).click();
  await page.evaluate(() => window.__rm.undo());
  await expect(readout(page, 1)).toHaveText('F');
  await expect(readout(page, 0)).toHaveText('C(no5)');
  expect(JSON.stringify(await pattern(page))).toContain('"omit":[5]');

  // A shipped Pattern: the naming prompt first; cancelled, nothing changes.
  await page.evaluate(() => {
    const p = structuredClone(window.__rm.getState().pattern);
    p.id = 'p_pretend_shipped';
    p.name = 'Pretend Shipped';
    p.measures[0].beats[3].slots[1] = { on: true, pitch: { degree: '5', octaveOffset: 0 } };
    window.__rm.loadPattern(p, { owned: false });
  });
  await toggle(page, 2, 3).click();
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button:not(.primary)', { hasText: 'Cancel' }).click();
  expect(await chordOmits(page)).toEqual([[5], null, null]);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await expect(readout(page, 2)).toHaveText('G');
});

test("AC-2.16.1/7 — Choosing a progression from the picker gives chords leaving nothing out, a chord added with + Chord copies the last chord's omissions with its quality, and removing a chord takes them with it", async ({ page }) => {
  await struck(page);
  await toggle(page, 2, 3).click();
  await page.locator('.progression-picker').selectOption('I-V-vi-IV');
  expect(await chordOmits(page)).toEqual([null, null, null, null]);
  await toggle(page, 3, 5).click();
  await page.locator('[data-action="add-chord"]').click();
  expect(await chordOmits(page)).toEqual([null, null, null, [5], [5]]);
  await expect(readout(page, 4)).toHaveText('F(no5)');
  await page.locator('[data-action="remove-chord"][data-chord="4"]').click();
  await page.locator('[data-action="remove-chord"][data-chord="3"]').click();
  expect(await chordOmits(page)).toEqual([null, null, null]);
});

// --- AC-2.16.2 — A member left out is gone from every reading of the chord ---

test('AC-2.16.2/3 — A stored chord-tone Pitch naming a struck member sounds the next-lower member, in playback, the note band, the score and the MIDI file alike: a 5th under C(no5) sounds E4 and its band reads 5 · E4', async ({ page }) => {
  await struck(page, { arpeggio: 'none' });
  // A stored 5th on the first Beat, the first chord's 5th struck.
  await page.evaluate(() => {
    const p = structuredClone(window.__rm.getState().pattern);
    p.measures[0].beats[0].slots[0].pitch = { tone: 5, octaveOffset: 0 };
    p.harmony.chords[0].omit = [5];
    window.__rm.loadPattern(p, { owned: true });
  });
  await expect(slotAt(page, 0, 0).locator('.slot-degree')).toHaveText('5');
  await expect(slotAt(page, 0, 0).locator('.slot-note-name')).toHaveText('E4');
  // The MIDI file's first note is that E4; the timeline is the one playback and the score read.
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-midi"]').click()]);
  expect(midiNoteOns(readFileSync(await download.path()))[0]).toBe(64);
  // Dealt, the same: Ascending over C(no5) deals Root 3rd Root 3rd as C4 E4 C4 E4 — no step for the struck 5th.
  await page.locator('.arpeggio-picker').selectOption('up');
  expect(await rolesIn(page)).toEqual(['R', '3', 'R', '3']);
  expect(await namesIn(page)).toEqual(['C4', 'E4', 'C4', 'E4']);
  // Restored, the 5th is G4 again.
  await toggle(page, 0, 5).click();
  expect(await namesIn(page)).toEqual(['C4', 'E4', 'G4', 'C4']);
});

// --- AC-2.16.3 — The quality picker offers the chords a chart names, in groups ---

test('AC-2.16.3/1 — The quality picker offers, under group headings: Triads — major, minor, diminished, augmented, 5; Suspended — sus2, sus4, 7sus4, 7sus2, 9sus4; Sixths — 6, m6, 6/9, m6/9; Sevenths — maj7, m7, 7, m7♭5, dim7, mMaj7, 7♭5, 7♯5, maj7♯5; Added — add9, madd9, add11, madd11; Ninths — 9, maj9, m9, 7♭9, 7♯9; Elevenths — 11, m11, maj7♯11, 7♯11, maj9♯11; Thirteenths — 13, maj13, m13, 7♭13', async ({ page }) => {
  await struck(page);
  const groups = await quality(page, 0)
    .locator('optgroup')
    .evaluateAll((gs) => gs.map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.textContent)]));
  expect(groups).toEqual([
    ['Triads', ['major', 'minor', 'diminished', 'augmented', '5']],
    ['Suspended', ['sus2', 'sus4', '7sus4', '7sus2', '9sus4']],
    ['Sixths', ['6', 'm6', '6/9', 'm6/9']],
    ['Sevenths', ['maj7', 'm7', '7', 'm7♭5', 'dim7', 'mMaj7', '7♭5', '7♯5', 'maj7♯5']],
    ['Added', ['add9', 'madd9', 'add11', 'madd11']],
    ['Ninths', ['9', 'maj9', 'm9', '7♭9', '7♯9']],
    ['Elevenths', ['11', 'm11', 'maj7♯11', '7♯11', 'maj9♯11']],
    ['Thirteenths', ['13', 'maj13', 'm13', '7♭13']],
  ]);
  // No option outside a group.
  expect(await quality(page, 0).locator(':scope > option').count()).toBe(0);
  // One chosen is named as a chart names it, on the row and the strip.
  await quality(page, 0).selectOption('69');
  await expect(readout(page, 0)).toHaveText('C6/9');
  expect(await chordNames(page)).toEqual(['C6/9', 'F', 'G']);
});

test("AC-2.16.3/2 — Each new quality's members are its root and the intervals its name says, spelled from the root's letter: C5 is C G; C7sus2 is C D G B♭; C9sus4 is C F G B♭ D; C6/9 is C E G A D; Cm6/9 is C E♭ G A D; C7♭5 is C E G♭ B♭; C7♯5 is C E G♯ B♭; Cmaj7♯5 is C E G♯ B; Cmadd9 is C E♭ G D; Cadd11 is C E G F; Cmadd11 is C E♭ G F; C7♭9 is C E G B♭ D♭; C7♯9 is C E G B♭ D♯; C11 is C E G B♭ D F; Cm11 is C E♭ G B♭ D F; Cmaj7♯11 is C E G B F♯; C7♯11 is C E G B♭ F♯; Cmaj9♯11 is C E G B D F♯; C13 is C E G B♭ D A; Cmaj13 is C E G B D A; Cm13 is C E♭ G B♭ D A; C7♭13 is C E G B♭ A♭ — the 13ths leaving the 11th out as a chart does: on the screen", async ({ page }) => {
  await struck(page);
  // The Bass picker lists a chord's members by name (AC-2.11.1/1), so it is where the spelling shows.
  const expected = {
    5: ['C5', ['C (root)', 'G']],
    69: ['C6/9', ['C (root)', 'E', 'G', 'A', 'D']],
    '7b9': ['C7♭9', ['C (root)', 'E', 'G', 'Bb', 'Db']],
    '7#9': ['C7♯9', ['C (root)', 'E', 'G', 'Bb', 'D#']],
    'maj7#11': ['Cmaj7♯11', ['C (root)', 'E', 'G', 'B', 'F#']],
    13: ['C13', ['C (root)', 'E', 'G', 'Bb', 'D', 'A']],
    '7b13': ['C7♭13', ['C (root)', 'E', 'G', 'Bb', 'Ab']],
  };
  for (const [id, [name, spelled]] of Object.entries(expected)) {
    await quality(page, 0).selectOption(id);
    await expect(readout(page, 0)).toHaveText(name);
    expect(await bassOptions(page, 0), id).toEqual(spelled);
  }
  // The grid deals them: C6/9 Ascending over four Slots is C4 E4 G4 A4.
  await quality(page, 0).selectOption('69');
  expect(await namesIn(page)).toEqual(['C4', 'E4', 'G4', 'A4']);
});

test('AC-2.16.3/4 — Nothing already written changes: every catalogue progression spells the chords it did, a stored quality is unchanged, and the numeral is lowercase from a minor third as before — ii11 and I5: on the screen', async ({ page }) => {
  await struck(page);
  // The progression as chosen is what it always was, on the strip and in the rows.
  expect(await chordNames(page)).toEqual(['C', 'F', 'G']);
  expect(await numerals(page)).toEqual(['I', 'IV', 'V']);
  await page.locator('.progression-picker').selectOption('ii-V-I');
  // Chosen, it is voiced Closest (AC-2.11.3/7); over the roots it reads as it always did.
  await page.locator('.voicing-picker').selectOption('root');
  expect(await numerals(page)).toEqual(['ii7', 'V7', 'Imaj7']);
  await quality(page, 0).selectOption('m11');
  await quality(page, 2).selectOption('5');
  expect(await numerals(page)).toEqual(['ii11', 'V7', 'I5']);
  expect(await chordNames(page)).toEqual(['Dm11', 'G7', 'C5']);
});

test('AC-2.16.3/3 — The 11th and 13th are roles beside the 9th: the Bass picker of C13 lists C, E, G, B♭, D and A, a dealt or stored 11th or 13th reads 11 or 13 in its note band, and on a chord lacking the role it falls to the next-lower member as the 9th does', async ({ page }) => {
  await struck(page);
  // Two Measures of eight notes, the chord changing every Measure: C13 then F.
  await page.evaluate(() => window.__rm.handlers.onAddMeasure());
  for (let m = 0; m < 2; m++) for (let b = 0; b < 4; b++) {
    if (m === 1) await slotAt(page, b, 0, m).locator('.slot-accent').click();
    await slotAt(page, b, 1, m).locator('.slot-accent').click();
  }
  await page.locator('.chord-change[data-change="measure"]').click();
  await quality(page, 0).selectOption('13');
  expect(await bassOptions(page, 0)).toEqual(['C (root)', 'E', 'G', 'Bb', 'D', 'A']);
  // Ascending over six roles: the sixth note is the 13th, A5.
  expect(await rolesIn(page, 0)).toEqual(['R', '3', '5', '7', '9', '13', 'R', '3']);
  expect(await namesIn(page, 0)).toEqual(['C4', 'E4', 'G4', 'Bb4', 'D5', 'A5', 'C4', 'E4']);
  // Over the F, which has no 13th, the step falls to the 5th, C5 — as its 9th falls to it too.
  expect(await rolesIn(page, 1)).toEqual(['R', '3', '5', '7', '9', '13', 'R', '3']);
  expect(await namesIn(page, 1)).toEqual(['F4', 'A4', 'C5', 'C5', 'C5', 'C5', 'F4', 'A4']);
  // An 11th chord reads 11.
  await quality(page, 0).selectOption('11');
  expect(await rolesIn(page, 0)).toEqual(['R', '3', '5', '7', '9', '11', 'R', '3']);
  expect(await namesIn(page, 0)).toEqual(['C4', 'E4', 'G4', 'Bb4', 'D5', 'F5', 'C4', 'E4']);
});

test("AC-2.16.3/5 — Changing a chord's quality on a shipped Pattern still goes through the naming prompt, and a quality the picker gained can be chosen there as any other", async ({ page }) => {
  await struck(page);
  await page.evaluate(() => {
    const p = structuredClone(window.__rm.getState().pattern);
    p.id = 'p_pretend_shipped';
    p.name = 'Pretend Shipped';
    p.measures[0].beats[3].slots[1] = { on: true, pitch: { degree: '5', octaveOffset: 0 } };
    window.__rm.loadPattern(p, { owned: false });
  });
  await quality(page, 0).selectOption('7b9');
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button:not(.primary)', { hasText: 'Cancel' }).click();
  await expect(readout(page, 0)).toHaveText('C');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  // Named, the copy takes the new quality.
  await quality(page, 0).selectOption('7b9');
  await page.locator('.dialog-input').fill('Struck copy');
  await page.locator('.dialog-button.primary').click();
  await expect(readout(page, 0)).toHaveText('C7♭9');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(true);
  expect(await bassOptions(page, 0)).toEqual(['C (root)', 'E', 'G', 'Bb', 'Db']);
});
