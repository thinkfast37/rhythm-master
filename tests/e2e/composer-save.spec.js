import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, leaveComposer, appState, loadFourBeats, fret, cslot, recordAll } from './composer-helpers.js';

test.use(launch);

const stored = (page, name) => page.evaluate((n) => window.__rm.patternStore.loadAll().find((p) => p.name === n) ?? null, name);
const missingStored = (p) => p.measures.reduce((n, m) => n + m.beats.reduce((k, b) => k + b.slots.filter((s) => s.on && !s.pitch).length, 0), 0);

// --- AC-19.9.1: Save only when complete ------------------------------------------

test('AC-19.9.1/1 — Save is disabled while any sounding Slot has no note, with the number missing shown beside it', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(page.locator('.composer-save')).toBeDisabled();
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '4');
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await fret(page, 0, 0).click();
  await expect(page.locator('.composer-save')).toBeDisabled();
  await expect(page.locator('.composer-missing')).toHaveText('1 note missing');
  expect(await stored(page, 'My line')).toBeNull();
});

test('AC-19.9.1/2 — With every sounding Slot pitched, Save is enabled, and pressing it adds the composition to the library as an owned Melodic Pattern under its name, carrying the `custom` Tag', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await expect(page.locator('.composer-save')).toBeEnabled();
  await expect(page.locator('.composer-missing')).toHaveCount(0);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  const saved = await stored(page, 'My line');
  expect(saved).not.toBeNull();
  expect(saved.soundMode).toBe('melodic');
  expect(saved.key).toBe('C');
  expect(saved.measures[0].beats.map((b) => b.slots[0].pitch.degree)).toEqual(['1', '2', '3', '4']);
  await expect(page.locator('.sidebar li.current').first()).toContainText('My line');
  await expect(page.locator('.sidebar li.current').first()).toContainText('custom', { ignoreCase: true });
  expect((await appState(page)).isOwned).toBe(true);
});

test('AC-19.9.1/3 — After saving, the composition is the open Pattern — Practice shows it, and Prev/Next count from it', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-save').click();
  const state = await appState(page);
  expect(state.pattern.name).toBe('My line');
  expect(state.isOwned).toBe(true);
  expect(state.view.currentId).toBe(state.pattern.id);
  await leaveComposer(page);
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(page.locator('.pattern-header input').first()).toHaveValue('My line');
  await expect(page.locator('.sound-mode [data-mode="melodic"]')).toHaveAttribute('aria-pressed', 'true');
});

// --- AC-19.9.2: auto-save after the first save --------------------------------------

test('AC-19.9.2/1 — Replacing a note, clearing and re-recording one, changing tempo, swing, Key or scale, or turning a syllable off saves immediately while every sounding Slot is pitched', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-save').click();
  // Replace a note.
  await cslot(page, 0, 1).locator('.cslot-note').click();
  await fret(page, 0, 3).click();
  expect((await stored(page, 'My line')).measures[0].beats[1].slots[0].pitch).toEqual({ degree: '5', octaveOffset: 0 });
  // Clear and re-record one.
  await page.locator('.composer-delete').click();
  await fret(page, 0, 5).click();
  expect((await stored(page, 'My line')).measures[0].beats[1].slots[0].pitch).toEqual({ degree: '6', octaveOffset: 0 });
  // Tempo, swing, Key, scale.
  await page.locator('.composer-tempo-entry').fill('150');
  await page.locator('.composer-tempo-entry').press('Enter');
  expect((await stored(page, 'My line')).tempo).toBe(150);
  await page.locator('.composer-swing-entry').fill('25');
  await page.locator('.composer-swing-entry').press('Enter');
  expect((await stored(page, 'My line')).swingAmount).toBe(25);
  await page.locator('.composer-key').selectOption('G');
  expect((await stored(page, 'My line')).key).toBe('G');
  await page.locator('.composer-scale').selectOption('dorian');
  expect((await stored(page, 'My line')).scale).toBe('dorian');
  // Turning a syllable off.
  const cell = cslot(page, 0, 3);
  for (let i = 0; i < 4 && (await cell.getAttribute('data-accent')) !== '0'; i++) await cell.locator('.cslot-syllable').click();
  expect((await stored(page, 'My line')).measures[0].beats[3].slots[0].on).toBe(false);
  await expect(page.locator('.composer-unsaved')).toHaveCount(0);
});

test('AC-19.9.2/2 — Turning a syllable on, clearing a note or doubling the length leaves the stored Pattern as it was, and an unsaved mark with the number of missing notes is shown', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-save').click();
  const before = JSON.stringify(await stored(page, 'My line'));
  await cslot(page, 0, 0, 2).locator('.cslot-syllable').click();
  expect(JSON.stringify(await stored(page, 'My line'))).toBe(before);
  await expect(page.locator('.composer-unsaved')).toHaveAttribute('data-unsaved', 'changes');
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '1');
  await cslot(page, 0, 2).locator('.cslot-note').click();
  await page.locator('.composer-delete').click();
  expect(JSON.stringify(await stored(page, 'My line'))).toBe(before);
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '2');
  await page.locator('.composer-duplicate').click();
  await page.locator('.dialog-button[data-value="percussive"]').click();
  expect(JSON.stringify(await stored(page, 'My line'))).toBe(before);
  // Two missing, and the copy's five sounding Slots all unpitched.
  await expect(page.locator('.composer-missing')).toHaveAttribute('data-missing', '7');
  expect(missingStored(await stored(page, 'My line'))).toBe(0);
});

test('AC-19.9.2/3 — Recording the missing notes saves the composition again, and the unsaved mark goes', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-save').click();
  await cslot(page, 0, 0, 2).locator('.cslot-syllable').click();
  await expect(page.locator('.composer-unsaved')).toBeVisible();
  await page.locator('.record').click();
  await fret(page, 0, 3).click();
  await expect(page.locator('.composer-unsaved')).toHaveCount(0);
  await expect(page.locator('.composer-missing')).toHaveCount(0);
  const saved = await stored(page, 'My line');
  expect(saved.measures[0].beats[0].slots[2]).toMatchObject({ on: true, pitch: { degree: '5', octaveOffset: 0 } });
});

// --- AC-19.9.3: unsaved syllables do not survive a reload -----------------------------

test('AC-19.9.3 — Unsaved syllables do not survive a reload', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-save').click();
  await cslot(page, 0, 0, 2).locator('.cslot-syllable').click();
  await expect(page.locator('.composer-unsaved')).toBeVisible();
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  const saved = await stored(page, 'My line');
  expect(saved.measures[0].beats[0].slots[2]).toEqual({ on: false });
  expect(saved.measures[0].beats[0].slots[0].pitch).toEqual({ degree: '1', octaveOffset: 0 });
  expect(saved.measures[0].beats.filter((b) => b.slots[0].on && !b.slots[0].pitch)).toHaveLength(0);
  await enterComposer(page);
  await expect(page.locator('.composer-empty')).toBeVisible();
});
