/**
 * US-2.14 — Roll the dice across the Melody group: the button, where it sits,
 * what one press does to the Pattern, and the No dice toggles (AC-2.14.1,
 * AC-2.14.3). What each roll may land on is proved in
 * tests/unit/core/dice.test.js.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp } from './composer-helpers.js';

test.use(launch);

const CONTROLS = ['key', 'scale', 'register', 'progression', 'change', 'fill', 'voicing'];

/** The Melody tab of the workbench; on a phone the library drawer opens over the panel first (AC-15.1.7/1). */
async function melodyTab(page) {
  const openDrawer = page.locator('.library-toggle[aria-expanded="true"]');
  if (await openDrawer.count()) await openDrawer.click();
  await page.locator('.workbench-tab[data-tab="melody"]').click();
}

/** An owned one-Measure 4/4 melody in C Ionian at Normal with no progression: 1 3 5 2 on each Beat's first Slot. */
async function melody(page, extra = {}) {
  await openApp(page);
  await page.evaluate((more) => {
    const p = window.__rm.loadBlank('4/4');
    const measures = structuredClone(p.measures);
    ['1', '3', '5', '2'].forEach((degree, b) => {
      measures[0].beats[b].slots[0] = { on: true, pitch: { degree, octaveOffset: 0 } };
    });
    window.__rm.loadPattern({ ...p, soundMode: 'melodic', key: 'C', scale: 'ionian', measures, ...more }, { owned: true });
  }, extra);
  await melodyTab(page);
}

/** The same under I–IV–V, Alberti, Root position, changing every pass. */
async function harmonic(page) {
  await melody(page);
  await page.evaluate(async () => {
    await window.__rm.handlers.onProgression('I-IV-V');
    await window.__rm.handlers.onArpeggio('alberti');
    await window.__rm.handlers.onVoicing('root');
    await window.__rm.handlers.onChordChange('pass');
  });
}

const fixRandom = (page, value) => page.evaluate((v) => { Math.random = () => v; }, value);
const roll = (page) => page.locator('.melody-group [data-action="roll-dice"]');
const noDice = (page, id) => page.locator(`.melody-group .nodice[data-control="${id}"]`);
const pattern = (page) => page.evaluate(() => window.__rm.getState().pattern);
const saved = (page) => page.evaluate(() => window.__rm.patternStore.loadAll());
const summary = (p) => ({
  key: p.key,
  scale: p.scale,
  register: p.register ?? 0,
  chords: p.harmony?.chords ?? null,
  change: p.harmony?.change ?? null,
  fill: p.harmony?.arpeggio ?? null,
});

async function markAll(page, ids) {
  for (const id of ids) {
    await noDice(page, id).click();
    await expect(noDice(page, id)).toHaveAttribute('aria-pressed', 'true');
  }
}

// --- AC-2.14.1 ------------------------------------------------------------------------

test('AC-2.14.1/1 — Roll the dice stands at the head of the Melody group wherever the group is shown — Lab, Make it melodic and Combine patterns alike — and is absent with the group in Percussive mode', async ({ page }) => {
  await melody(page);
  const firstRow = page.locator('.melody-group > :first-child');
  await expect(firstRow).toHaveClass(/dice-row/);
  await expect(firstRow.locator('[data-action="roll-dice"]')).toBeVisible();
  await expect(roll(page)).toHaveText('🎲 Roll the dice');

  for (const goal of ['melodic', 'combine']) {
    await page.evaluate((g) => window.__rm.handlers.onGoal(g), goal);
    await melodyTab(page);
    await expect(page.locator('.melody-group > :first-child')).toHaveClass(/dice-row/);
    await expect(roll(page)).toBeVisible();
  }
  await page.evaluate(() => window.__rm.handlers.onGoal('lab'));

  // Percussive: the group is absent, and the button with it.
  await page.evaluate(() => window.__rm.handlers.onSoundMode('percussive'));
  await expect(page.locator('.melody-group')).toBeHidden();
  await expect(roll(page)).toBeHidden();
});

test('AC-2.14.1/2 — One press gives every control not marked No dice a value different from the one in force, chosen at random from what that control offers, as one edit that one Undo takes back whole', async ({ page }) => {
  await melody(page);
  const before = await pattern(page);
  expect(before.harmony).toBeUndefined();
  await fixRandom(page, 0);
  await roll(page).click();
  const after = await pattern(page);
  // Each of the three pitch-strip controls moved, and the Pattern gained a progression with its own three rolled.
  expect(after.key).not.toBe(before.key);
  expect(after.scale).not.toBe(before.scale);
  expect(after.register ?? 0).not.toBe(before.register ?? 0);
  expect(after.harmony.chords.length).toBeGreaterThan(0);
  expect(after.harmony.arpeggio).toBeTruthy();
  // The pickers show what was rolled.
  await expect(page.locator('.key-picker')).toHaveValue(after.key);
  await expect(page.locator('.scale-picker')).toHaveValue(after.scale);
  await expect(page.locator('.register-picker')).toHaveValue(String(after.register));
  await expect(page.locator('.arpeggio-picker')).toHaveValue(after.harmony.arpeggio);

  // A second press moves every one of them again — never the value in force.
  await fixRandom(page, 0.5);
  await roll(page).click();
  const again = await pattern(page);
  expect(again.key).not.toBe(after.key);
  expect(again.scale).not.toBe(after.scale);
  expect(again.register ?? 0).not.toBe(after.register ?? 0);
  expect(again.harmony.arpeggio).not.toBe(after.harmony.arpeggio);
  expect(again.harmony.change).not.toBe(after.harmony.change);
  expect(again.harmony.chords).not.toEqual(after.harmony.chords);

  // One edit: one Undo takes the whole second roll back, and one more the first.
  await page.evaluate(() => window.__rm.undo());
  expect(summary(await pattern(page))).toEqual(summary(after));
  await page.evaluate(() => window.__rm.undo());
  expect(summary(await pattern(page))).toEqual(summary(before));
});

test('AC-2.14.1/3 — A control marked No dice keeps its value, whatever the roll gives the others', async ({ page }) => {
  await harmonic(page);
  const before = await pattern(page);
  await markAll(page, ['key', 'fill']);
  await fixRandom(page, 0);
  await roll(page).click();
  const after = await pattern(page);
  expect(after.key).toBe('C');
  expect(after.harmony.arpeggio).toBe('alberti');
  expect(after.scale).not.toBe(before.scale);
  expect(after.register ?? 0).not.toBe(before.register ?? 0);
  expect(after.harmony.chords).not.toEqual(before.harmony.chords);
  expect(after.harmony.change).toBe('measure');

  // The other way round: everything but the Key marked, and only the Key moves.
  await markAll(page, ['scale', 'register', 'progression', 'change', 'voicing']);
  await noDice(page, 'key').click();
  await expect(noDice(page, 'key')).toHaveAttribute('aria-pressed', 'false');
  await fixRandom(page, 0.999);
  await roll(page).click();
  const last = await pattern(page);
  expect(last.key).toBe('B');
  expect({ ...summary(last), key: null }).toEqual({ ...summary(after), key: null });
});

test('AC-2.14.1/4 — Into an owned Pattern the result auto-saves at once (US-7.2); on a shipped Pattern the roll is the first edit and the naming prompt of US-7.3 comes before anything is rolled, cancelling it leaving the Pattern as it was', async ({ page }) => {
  // Shipped: the name is asked for first, and Cancel means nothing happened.
  await openApp(page);
  await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll().find((p) => p.soundMode === 'melodic');
    window.__rm.loadPattern(shipped, { owned: false });
  });
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await melodyTab(page);
  const before = await pattern(page);
  await fixRandom(page, 0);
  await roll(page).click();
  await expect(page.locator('.dialog-message')).toContainText('built-in pattern');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
  expect(await pattern(page)).toEqual(before);
  expect(await saved(page)).toHaveLength(0);

  // Owned: rolled and saved with no further step, and there after a reload.
  await melody(page);
  await fixRandom(page, 0);
  await roll(page).click();
  const rolled = await pattern(page);
  expect(rolled.key).not.toBe('C');
  const stored = (await saved(page)).find((p) => p.id === rolled.id);
  expect(summary(stored)).toEqual(summary(rolled));
  await page.reload();
  expect(summary(await pattern(page))).toEqual(summary(rolled));
});

test('AC-2.14.1/5 — With every control taking part marked No dice the button is disabled saying nothing is left to roll', async ({ page }) => {
  // Without a progression, four toggles are on screen; marking all four leaves
  // nothing — the harmonic three cannot roll until a Progression roll gives them a progression.
  await melody(page);
  await expect(page.locator('.melody-group .nodice')).toHaveCount(4);
  await markAll(page, ['key', 'scale', 'register']);
  await expect(roll(page)).toBeEnabled();
  await markAll(page, ['progression']);
  await expect(roll(page)).toBeDisabled();
  await expect(roll(page)).toContainText('nothing left to roll');
  // Unmark one and the dice are back.
  await noDice(page, 'scale').click();
  await expect(roll(page)).toBeEnabled();
  await expect(roll(page)).toHaveText('🎲 Roll the dice');

  // Under a progression, all seven.
  await harmonic(page);
  await expect(page.locator('.melody-group .nodice')).toHaveCount(7);
  await markAll(page, CONTROLS);
  await expect(roll(page)).toBeDisabled();
  await expect(roll(page)).toContainText('nothing left to roll');
});

test('AC-2.14.1/6 — A rolled fill or progression is where its cycle begins again while that cycle is on, as choosing it in its picker is', async ({ page }) => {
  await harmonic(page);
  await page.locator('.fill-cycle').click();
  await page.locator('.progression-cycle').click();
  expect((await page.evaluate(() => window.__rm.getState().fillCycle)).on).toBe(true);
  expect((await page.evaluate(() => window.__rm.getState().progressionCycle)).on).toBe(true);

  await markAll(page, ['key', 'scale', 'register', 'change', 'voicing']);
  await fixRandom(page, 0.5);
  await roll(page).click();
  const after = await pattern(page);
  const state = await page.evaluate(() => {
    const s = window.__rm.getState();
    return { fill: s.fillCycle, progression: s.progressionCycle, fillInForce: window.__rm.fillInForce(), progressionInForce: window.__rm.progressionInForce() };
  });
  const fillIndex = await page.evaluate((id) => window.__rm.catalogues().fills.indexOf(id), after.harmony.arpeggio);
  expect(state.fill.on).toBe(true);
  expect(state.fill.start).toBe(fillIndex);
  expect(state.fillInForce).toBe(after.harmony.arpeggio);
  const progressionIndex = await page.evaluate((id) => window.__rm.catalogues().progressions.indexOf(id), state.progressionInForce);
  expect(state.progression.on).toBe(true);
  expect(state.progression.start).toBe(progressionIndex);
  expect(progressionIndex).toBeGreaterThan(-1);
});

// --- AC-2.14.3 ------------------------------------------------------------------------

test('AC-2.14.3/1 — Each of Key, Scale, Register, Progression, Chord changes, Fill and Voicing carries a No dice toggle beside it, shown with the control and pressed while the control is kept out of the roll; toggling it changes no Pattern content', async ({ page }) => {
  await harmonic(page);
  // Each toggle is the next thing after its control.
  const beside = {
    key: '.key-picker',
    scale: '.scale-picker',
    register: '.register-picker',
    progression: '.progression-picker',
    change: '.chord-change-group .chord-change:nth-child(2)',
    fill: '.arpeggio-picker',
    voicing: '.voicing-picker',
  };
  for (const [id, selector] of Object.entries(beside)) {
    const next = await page.locator(`.melody-group ${selector}`).evaluate((el) => ({ className: el.nextElementSibling?.className, control: el.nextElementSibling?.dataset.control }));
    expect(next, id).toEqual({ className: 'nodice', control: id });
    await expect(noDice(page, id)).toBeVisible();
    await expect(noDice(page, id)).toHaveAttribute('aria-pressed', 'false');
    await expect(noDice(page, id)).toHaveAttribute('aria-label', expect.stringContaining('No dice'));
  }
  const before = JSON.stringify(await pattern(page));
  const stored = JSON.stringify(await saved(page));
  for (const id of CONTROLS) {
    await noDice(page, id).click();
    await expect(noDice(page, id)).toHaveAttribute('aria-pressed', 'true');
    await expect(noDice(page, id)).toHaveClass(/on/);
  }
  expect(JSON.stringify(await pattern(page))).toBe(before);
  expect(JSON.stringify(await saved(page))).toBe(stored);
  await noDice(page, 'key').click();
  await expect(noDice(page, 'key')).toHaveAttribute('aria-pressed', 'false');
  expect(JSON.stringify(await pattern(page))).toBe(before);

  // Without a progression the harmonic three are absent with their controls, and the other four stand.
  await melody(page);
  await expect(page.locator('.melody-group .nodice')).toHaveCount(4);
  for (const id of ['key', 'scale', 'register', 'progression']) await expect(noDice(page, id)).toBeVisible();
});

test('AC-2.14.3/2 — The marks hold for the session and a reload clears them; they are neither Pattern content nor a setting: nothing auto-saves, a shipped Pattern is never prompted for a name, and no export carries them', async ({ page }) => {
  await harmonic(page);
  const storedBefore = JSON.stringify(await saved(page));
  await markAll(page, ['key', 'fill']);
  // Nothing of the marks in the Pattern, its store, or any store at all.
  expect(JSON.stringify(await pattern(page))).not.toMatch(/noDice|No dice/);
  expect(JSON.stringify(await saved(page))).toBe(storedBefore);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/noDice|No dice/);
  // They hold while the session lasts: still pressed after other edits.
  await page.evaluate(() => window.__rm.handlers.onScale('dorian'));
  await expect(noDice(page, 'key')).toHaveAttribute('aria-pressed', 'true');
  await expect(noDice(page, 'fill')).toHaveAttribute('aria-pressed', 'true');
  // A reload clears them.
  await page.reload();
  await melodyTab(page);
  for (const id of CONTROLS) await expect(noDice(page, id)).toHaveAttribute('aria-pressed', 'false');

  // On a shipped Pattern, a toggle is not an edit: no naming prompt, nothing saved.
  await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll().find((p) => p.soundMode === 'melodic');
    window.__rm.loadPattern(shipped, { owned: false });
  });
  await melodyTab(page);
  await noDice(page, 'key').click();
  await expect(noDice(page, 'key')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  expect(await saved(page)).toHaveLength(1);
});

test('AC-2.14.3/3 — The marks are the same on every Pattern in the session: a mark set on one Pattern holds when another is loaded', async ({ page }) => {
  await harmonic(page);
  await markAll(page, ['scale', 'voicing']);
  // Another Pattern, loaded fresh: the same marks.
  await page.evaluate(() => {
    const p = window.__rm.loadBlank('3/4', 'Another');
    window.__rm.loadPattern({ ...p, id: 'p_other', soundMode: 'melodic', key: 'G', scale: 'dorian' }, { owned: true });
  });
  await melodyTab(page);
  await expect(noDice(page, 'scale')).toHaveAttribute('aria-pressed', 'true');
  await expect(noDice(page, 'key')).toHaveAttribute('aria-pressed', 'false');
  // And a shipped one.
  await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll().find((p) => p.soundMode === 'melodic' && p.harmony?.chords?.length);
    window.__rm.loadPattern(shipped, { owned: false });
  });
  await melodyTab(page);
  await expect(noDice(page, 'scale')).toHaveAttribute('aria-pressed', 'true');
  await expect(noDice(page, 'voicing')).toHaveAttribute('aria-pressed', 'true');
  await expect(noDice(page, 'key')).toHaveAttribute('aria-pressed', 'false');
});
