import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, leaveComposer, composerState, appState, makeFourBeats, openInComposer, loadFourBeats, recordAll } from './composer-helpers.js';

test.use(launch);

const seedOf = (page, predicate) => page.evaluate((src) => {
  const fn = new Function('p', `return (${src})(p)`);
  const found = window.__rm.seedStore.loadAll().find((p) => fn(p));
  return found ? { id: found.id, name: found.name, measures: found.measures.length, harmony: found.harmony ?? null } : null;
}, predicate.toString());

/** An owned melodic Pattern, four pitched Beats, stored as `p_test`. */
async function makeOwnedMelody(page, register = 0) {
  await makeFourBeats(page, 'Tune');
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  if (register) await page.evaluate((r) => window.__rm.handlers.onRegister(r), register);
  await expect.poll(() => page.evaluate(() => window.__rm.patternStore.findById('p_test')?.soundMode)).toBe('melodic');
}

// --- AC-19.8.1: a percussive Pattern ----------------------------------------------

test(`AC-19.8.1/1 — Opening a percussive Pattern asks for a name, pre-filled with the Pattern's name and "melody" and numbered when that is taken, rejecting a name already in the library`, async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page, 'Fixture');
  await enterComposer(page);
  await openInComposer(page, 'p_test', true, null);
  await expect(page.locator('.dialog-message')).toContainText('Name');
  await expect(page.locator('.dialog-input')).toHaveValue('Fixture melody');
  await page.locator('.dialog-input').fill('fixture');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog-error')).toBeVisible();
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-input').fill('Fixture line');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  // A shipped percussive Pattern asks the same, pre-filled from its own name.
  const shipped = await seedOf(page, (p) => p.soundMode === 'percussive');
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), shipped.id);
  // The unsaved composition asks first (AC-19.1.4/1); then the name.
  await page.locator('.dialog-button[data-value="true"]').click();
  await expect(page.locator('.dialog-input')).toHaveValue(`${shipped.name} melody`);
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  // Taken, case-insensitively: the first free number follows it.
  await page.evaluate(() => {
    const rm = window.__rm;
    const mine = rm.patternStore.findById('p_test');
    rm.patternStore.upsert({ ...structuredClone(mine), id: rm.patternStore.nextId(), name: 'fixture MELODY' });
    rm.patternStore.upsert({ ...structuredClone(mine), id: rm.patternStore.nextId(), name: 'Fixture melody 2' });
  });
  await openInComposer(page, 'p_test', true, null);
  await page.locator('.dialog-button[data-value="true"]').click();
  await expect(page.locator('.dialog-input')).toHaveValue('Fixture melody 3');
  // The suggestion confirms as it stands.
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  expect((await composerState(page)).draft.name).toBe('Fixture melody 3');
});

test('AC-19.8.1/2 — Confirming opens the rhythm as a composition in C Ionian with every sounding Slot unpitched and its accents kept, and the library is unchanged until the first save', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page, 'Fixture');
  await page.locator('.grid .slot[data-beat="1"][data-slot="0"]').click(); // raise Beat 2's accent
  const libraryBefore = await page.evaluate(() => localStorage.getItem('rm.patterns.v1'));
  await enterComposer(page);
  await openInComposer(page, 'p_test', true, 'Fixture line');
  const c = await composerState(page);
  expect(c.draft).toMatchObject({ name: 'Fixture line', soundMode: 'melodic', key: 'C', scale: 'ionian' });
  expect(c.savedId).toBeNull();
  expect(c.draft.measures[0].beats.map((b) => b.slots[0].on)).toEqual([true, true, true, true]);
  expect(c.draft.measures[0].beats.every((b) => !b.slots[0].pitch)).toBe(true);
  expect(c.draft.measures[0].beats[1].slots[0].accent).toBeDefined();
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '4');
  await expect(page.locator('.composer-key')).toHaveValue('C');
  expect(await page.evaluate(() => localStorage.getItem('rm.patterns.v1'))).toBe(libraryBefore);
});

test('AC-19.8.1/3 — Cancelling the prompt opens nothing: whatever composition was open stays, and the original Pattern is untouched', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page, 'First');
  await recordAll(page);
  await page.locator('.composer-save').click();
  const shipped = await seedOf(page, (p) => p.soundMode === 'percussive');
  const before = await page.evaluate((id) => JSON.stringify(window.__rm.seedStore.findById(id)), shipped.id);
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), shipped.id);
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect((await composerState(page)).draft.name).toBe('First');
  expect(await page.evaluate((id) => JSON.stringify(window.__rm.seedStore.findById(id)), shipped.id)).toBe(before);
});

// --- AC-19.8.2: a progression baked ------------------------------------------------

test('AC-19.8.2/1 — Opening a Pattern with a progression asks for a name, as a percussive one does', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  const harmonic = await seedOf(page, (p) => p.soundMode === 'melodic' && Boolean(p.harmony));
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), harmonic.id);
  await expect(page.locator('.dialog-input')).toBeVisible();
  await expect(page.locator('.dialog-input')).toHaveValue(`${harmonic.name} melody`);
  await expect(page.locator('.dialog-message')).toContainText('progression');
  await page.locator('.dialog-input').fill('Baked line');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  expect((await composerState(page)).draft.name).toBe('Baked line');
});

test("AC-19.8.2/2 — The composition's Slots carry, as stored degrees, the notes the progression and fill would have sounded, pass by pass, the harmonic cycle unrolled into Measures when it fits within 32 and the first pass alone otherwise, and a notice says which", async ({ page }) => {
  await openApp(page);
  // A one-Measure owned Pattern over I–IV–V, Ascending: three passes, unrolled to three Measures.
  await makeFourBeats(page, 'Tune');
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.evaluate(async () => {
    await window.__rm.handlers.onProgression('I-IV-V');
    await window.__rm.handlers.onArpeggio('up');
  });
  const expected = await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    return [0, 1, 2].map((pass) => window.__rmTimeline.buildTimeline(p, pass).map((e) => e.pitch.midiNote));
  });
  await enterComposer(page);
  await openInComposer(page, 'p_test', true, 'Baked');
  const got = await page.evaluate(() => {
    const d = window.__rm.composer().draft;
    return d.measures.map((_, m) => window.__rmTimeline.buildTimeline(d, 0).filter((e) => e.measureIndex === m).map((e) => e.pitch.midiNote));
  });
  expect(got).toEqual(expected);
  await expect(page.locator('.composer-grid .measure')).toHaveCount(3);
  await expect(page.locator('.composer-notice')).toContainText('3 passes');
  await expect(page.locator('.composer-missing')).toHaveCount(0);
  // Too long to unroll: nine Measures over four chords changing every pass is 36.
  await leaveComposer(page);
  await page.locator('.dialog-button[data-value="true"]').click();
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i++) await window.__rm.handlers.onAddMeasure();
    await window.__rm.handlers.onProgression('I-V-vi-IV');
    await window.__rm.handlers.onChordChange('pass');
  });
  await enterComposer(page);
  await openInComposer(page, 'p_test', true, 'Baked long');
  await expect(page.locator('.composer-grid .measure')).toHaveCount(9);
  await expect(page.locator('.composer-notice')).toContainText('first pass');
});

test('AC-19.8.2/3 — The composition carries no progression and no Register — every note is where it sounds — and the original Pattern is unchanged', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page, 'Tune');
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.evaluate(async () => {
    await window.__rm.handlers.onProgression('I-IV-V');
    await window.__rm.handlers.onArpeggio('up');
    await window.__rm.handlers.onRegister(1);
  });
  const original = await page.evaluate(() => JSON.stringify(window.__rm.patternStore.findById('p_test')));
  const heard = await page.evaluate(() => window.__rmTimeline.buildTimeline(window.__rm.getState().pattern, 0).map((e) => e.pitch.midiNote));
  await enterComposer(page);
  await openInComposer(page, 'p_test', true, 'Baked');
  const draft = (await composerState(page)).draft;
  expect(draft.harmony).toBeUndefined();
  expect(draft.register).toBeUndefined();
  expect(draft.id).toBeUndefined();
  const first = await page.evaluate(() => window.__rmTimeline.buildTimeline(window.__rm.composer().draft, 0).filter((e) => e.measureIndex === 0).map((e) => e.pitch.midiNote));
  expect(first).toEqual(heard);
  expect(await page.evaluate(() => JSON.stringify(window.__rm.patternStore.findById('p_test')))).toBe(original);
  await expect(page.locator('.composer-notice')).toBeVisible();
});

// --- AC-19.8.3: a melody ------------------------------------------------------------

test("AC-19.8.3/1 — An owned melodic Pattern asks Edit or Save as new; Edit opens it as a saved composition that auto-saves (US-19.9), and Save as new asks a name, pre-filled as a percussive one's is, and opens a copy, unsaved", async ({ page }) => {
  await openApp(page);
  await makeOwnedMelody(page);
  await enterComposer(page);
  await page.evaluate(() => window.__rm.handlers.onOpen('p_test', true));
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog-button[data-value="edit"]')).toBeVisible();
  await expect(page.locator('.dialog-button[data-value="copy"]')).toBeVisible();
  await page.locator('.dialog-button[data-value="edit"]').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  let c = await composerState(page);
  expect(c.savedId).toBe('p_test');
  expect(c.draft.name).toBe('Tune');
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  await expect(page.locator('.composer-unsaved')).toHaveCount(0);
  // A change saves at once.
  await page.locator('.composer-grid .slot[data-beat="0"][data-slot="0"] .cslot-note').click();
  await page.locator('.fretboard .note[data-string="0"][data-fret="3"]').click();
  expect((await page.evaluate(() => window.__rm.patternStore.findById('p_test'))).measures[0].beats[0].slots[0].pitch).toEqual({ degree: '5', octaveOffset: 0 });
  // Save as new.
  await page.evaluate(() => window.__rm.handlers.onOpen('p_test', true));
  await page.locator('.dialog-button[data-value="copy"]').click();
  await expect(page.locator('.dialog-input')).toHaveValue('Tune melody');
  await page.locator('.dialog-input').fill('Tune two');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  c = await composerState(page);
  expect(c.savedId).toBeNull();
  expect(c.draft.name).toBe('Tune two');
  expect(c.draft.id).toBeUndefined();
  await expect(page.locator('.composer-unsaved')).toHaveAttribute('data-unsaved', 'new');
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().some((p) => p.name === 'Tune two'))).toBe(false);
});

test("AC-19.8.3/2 — A shipped melodic Pattern asks a name only, pre-filled as a percussive one's is, and opens a copy, unsaved", async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  const shipped = await seedOf(page, (p) => p.soundMode === 'melodic' && !p.harmony);
  expect(shipped).not.toBeNull();
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), shipped.id);
  await expect(page.locator('.dialog-input')).toBeVisible();
  await expect(page.locator('.dialog-button[data-value="edit"]')).toHaveCount(0);
  await expect(page.locator('.dialog-input')).toHaveValue(`${shipped.name} melody`);
  await page.locator('.dialog-input').fill('Shipped copy');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  const c = await composerState(page);
  expect(c.savedId).toBeNull();
  expect(c.draft.name).toBe('Shipped copy');
  expect(c.draft.id).toBeUndefined();
  await expect(page.locator('.composer-missing')).toHaveCount(0);
  await expect(page.locator('.composer-save')).toBeEnabled();
});

test("AC-19.8.3/3 — A Pattern with a Register opens with the Register folded into each note's octave, so the grid, the instrument and playback agree, and the saved composition carries no Register", async ({ page }) => {
  await openApp(page);
  await makeOwnedMelody(page, -1);
  const heard = await page.evaluate(() => window.__rmTimeline.buildTimeline(window.__rm.getState().pattern, 0).map((e) => e.pitch.midiNote));
  expect(heard).toEqual([48, 48, 48, 48]);
  await enterComposer(page);
  await page.evaluate(() => window.__rm.handlers.onOpen('p_test', true));
  await page.locator('.dialog-button[data-value="edit"]').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  const c = await composerState(page);
  expect(c.draft.register).toBeUndefined();
  expect(c.draft.measures[0].beats.map((b) => b.slots[0].pitch.octaveOffset)).toEqual([-1, -1, -1, -1]);
  expect(await page.evaluate(() => window.__rmTimeline.buildTimeline(window.__rm.composer().draft, 0).map((e) => e.pitch.midiNote))).toEqual(heard);
  await expect(page.locator('.composer-grid .slot[data-beat="0"][data-slot="0"] .cslot-name')).toHaveText('C3');
  const stored = await page.evaluate(() => window.__rm.patternStore.findById('p_test'));
  expect(stored.register).toBeUndefined();
  expect(stored.measures[0].beats[0].slots[0].pitch.octaveOffset).toBe(-1);
});

// --- AC-19.8.4: an ordinary melodic Pattern ----------------------------------------------

test('AC-19.8.4 — A saved composition is a melodic Pattern like any other', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page, 'Finished');
  await recordAll(page);
  await page.locator('.composer-save').click();
  await leaveComposer(page);
  const state = await appState(page);
  expect(state.pattern.name).toBe('Finished');
  expect(state.pattern.soundMode).toBe('melodic');
  expect(state.pattern).not.toHaveProperty('voice');
  expect(state.pattern).not.toHaveProperty('instrument');
  await expect(page.locator('.sound-mode [data-mode="melodic"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.grid .slot[data-beat="0"][data-slot="0"] .slot-pitch')).toHaveAttribute('data-note-name', 'C4');
  await expect(page.locator('.pitch-strip')).toBeVisible();
  // Reopened from the library, it is the same.
  await page.locator('.library-toggle').click();
  await page.locator('.sidebar li.current [data-action="open-pattern"]').click();
  expect((await appState(page)).pattern.name).toBe('Finished');
  const melodic = await page.evaluate(() => window.__rm.voiceLog().length);
  await page.locator('.transport').first().click();
  await expect.poll(() => page.evaluate(() => window.__rm.voiceLog().length), { timeout: 8000 }).toBeGreaterThan(melodic);
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toMatchObject({ instrument: 'piano', via: 'synth' });
  await page.locator('.transport').first().click();
});
