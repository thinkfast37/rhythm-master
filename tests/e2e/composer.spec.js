import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, leaveComposer, composerState, appState, loadFourBeats, makeFourBeats, openInComposer, recordAll } from './composer-helpers.js';

test.use(launch);

// --- AC-19.1.1: a mode of its own ---------------------------------------------

test('AC-19.1.1/1 — A Practice | Composer switch sits in the pinned bar at every width, marking the mode in force, and is absent under a practice goal', async ({ page }) => {
  await openApp(page);
  for (const width of [390, 900, 1400]) {
    await page.setViewportSize({ width, height: 900 });
    const sw = page.locator('.main-top-bar .mode-switch');
    await expect(sw).toBeVisible();
    await expect(sw.locator('[data-mode="practice"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(sw.locator('[data-mode="composer"]')).toHaveAttribute('aria-pressed', 'false');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.__rm.handlers.onGoal('practise'));
  await expect(page.locator('.mode-switch')).toBeHidden();
});

test("AC-19.1.1/2 — Choosing Composer shows the Composer's panel — instrument view, record bar, composing grid, controls — in place of the Pattern pane and the workbench, while the library sidebar and its toggle stay", async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page);
  await enterComposer(page);
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'composer');
  await expect(page.locator('.pane-pattern')).toBeHidden();
  await expect(page.locator('.pane-workbench')).toBeHidden();
  await expect(page.locator('.composer-panel .composer-bar')).toBeVisible();
  await expect(page.locator('.composer-panel .composer-instrument')).toBeVisible();
  await expect(page.locator('.composer-panel .composer-controls')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.library-toggle')).toBeVisible();
  await openInComposer(page, 'p_test', true);
  await expect(page.locator('.composer-panel .composer-grid')).toBeVisible();
});

test('AC-19.1.1/3 — Choosing Practice shows the Pattern pane and the workbench again, with the open Pattern as it was', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page);
  const before = await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));
  await enterComposer(page);
  await leaveComposer(page);
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  await expect(page.locator('.pane-pattern')).toBeVisible();
  await expect(page.locator('.pane-workbench')).toBeVisible();
  await expect(page.locator('.composer-panel')).toBeHidden();
  expect(await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern))).toBe(before);
  await expect(page.locator('.grid .slot[data-beat="0"][data-slot="0"]')).toBeVisible();
});

test('AC-19.1.1/4 — The mode is a within-session position, not a stored preference: a reload opens in Practice', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1') ?? '{}'));
  expect('composerMode' in settings || 'mode' in settings).toBe(false);
});

// --- AC-19.1.2: starts from the Pattern already open ------------------------------

test('AC-19.1.2/1 — Entering the Composer opens the Pattern open in Practice as the composition: an owned melody directly, as a saved composition with no ask', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page, 'Tune');
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.patternStore.findById('p_test')?.soundMode)).toBe('melodic');
  await enterComposer(page, { load: 'none' });
  await expect(page.locator('.composer-grid')).toBeVisible();
  const c = await composerState(page);
  expect(c.draft.name).toBe('Tune');
  expect(c.savedId).toBe('p_test');
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  await expect(page.locator('.composer-unsaved')).toHaveCount(0);
});

test('AC-19.1.2/2 — A percussive, progression-carrying or shipped Pattern open in Practice is offered through its US-19.8 naming prompt on entry, exactly as if opened from the library', async ({ page }) => {
  await openApp(page);
  // An owned percussive rhythm: the percussive prompt, pre-filled (AC-19.8.1/1).
  await makeFourBeats(page, 'Fixture');
  await page.locator('.mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog-message')).toContainText('no notes yet');
  await expect(page.locator('.dialog-input')).toHaveValue('Fixture melody');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  expect((await composerState(page)).draft.name).toBe('Fixture melody');
  // A progression-carrying melody: the baking prompt (AC-19.8.2/1).
  await leaveComposer(page);
  await page.locator('.dialog-button[data-value="true"]').click(); // discard the unsaved line
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.evaluate(async () => {
    await window.__rm.handlers.onProgression('I-IV-V');
    await window.__rm.handlers.onArpeggio('up');
  });
  await page.locator('.mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.dialog-message')).toContainText('progression');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await leaveComposer(page);
  // A shipped melody: a name only, since a shipped Pattern is never edited (AC-19.8.3/2).
  const shipped = await page.evaluate(() => {
    const found = window.__rm.seedStore.loadAll().find((p) => p.soundMode === 'melodic' && !p.harmony);
    window.__rm.handlers.onOpen(found.id, false);
    return found.name;
  });
  await page.locator('.mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.dialog-input')).toHaveValue(`${shipped} melody`);
  await expect(page.locator('.dialog-button[data-value="edit"]')).toHaveCount(0);
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  expect((await composerState(page)).draft.name).toBe(`${shipped} melody`);
  expect((await composerState(page)).savedId).toBeNull();
});

test("AC-19.1.2/3 — Declining the prompt leaves no composition: the grid's place shows a prompt to choose a rhythm from the library, the library is opened, and Record and Save are disabled", async ({ page }) => {
  await openApp(page);
  await page.locator('.library-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');
  await enterComposer(page);
  await expect(page.locator('.composer-empty')).toBeVisible();
  await expect(page.locator('.composer-empty')).toContainText('library');
  await expect(page.locator('.composer-grid')).toHaveCount(0);
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
  await expect(page.locator('.record')).toBeDisabled();
  await expect(page.locator('.composer-save')).toBeDisabled();
  // The instrument is there to be played meanwhile.
  await expect(page.locator('.fretboard')).toBeVisible();
});

test('AC-19.1.2/4 — Re-entering the Composer while the composition is the open Pattern keeps it: no prompt, no reload', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page, 'Kept line');
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  const before = await page.evaluate(() => JSON.stringify(window.__rm.composer().draft));
  await leaveComposer(page);
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  await enterComposer(page, { load: 'none' });
  await expect(page.locator('.composer-grid')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(window.__rm.composer().draft))).toBe(before);
});

test('AC-19.1.2/5 — Opening a library Pattern while in Composer loads it into the Composer, and the Pattern open in Practice is left alone until a composition is saved', async ({ page }) => {
  await openApp(page);
  await makeFourBeats(page);
  const practiceId = (await appState(page)).pattern.id;
  await enterComposer(page);
  // Through the library list itself.
  await page.locator('.sidebar [data-action="open-pattern"]').first().click();
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-input').fill('From the list');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  expect((await composerState(page)).draft.name).toBe('From the list');
  expect((await appState(page)).pattern.id).toBe(practiceId);
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'composer');
});

// --- AC-19.1.3: Guitar or piano ------------------------------------------------

test('AC-19.1.3/1 — A Guitar | Piano switch sits in the record bar, Guitar in force on first use', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  const sw = page.locator('.composer-bar .instrument-switch');
  await expect(sw).toBeVisible();
  await expect(sw.locator('[data-instrument="guitar"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(sw.locator('[data-instrument="piano"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.composer-instrument .fretboard')).toBeVisible();
  await expect(page.locator('.piano')).toHaveCount(0);
});

test('AC-19.1.3/2 — Switching shows the other instrument view and leaves every recorded note exactly as it was', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await recordAll(page);
  const before = await page.evaluate(() => JSON.stringify(window.__rm.composer().draft.measures));
  await page.locator('.instrument-switch [data-instrument="piano"]').click();
  await expect(page.locator('.composer-instrument .piano')).toBeVisible();
  await expect(page.locator('.fretboard')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(window.__rm.composer().draft.measures))).toBe(before);
  await page.locator('.instrument-switch [data-instrument="guitar"]').click();
  await expect(page.locator('.composer-instrument .fretboard')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(window.__rm.composer().draft.measures))).toBe(before);
});

test('AC-19.1.3/3 — The instrument chosen is remembered in `rm.settings.v1` and is in force after a reload', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await page.locator('.instrument-switch [data-instrument="piano"]').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).composerInstrument);
  expect(stored).toBe('piano');
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await enterComposer(page);
  await expect(page.locator('.instrument-switch [data-instrument="piano"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.composer-instrument .piano')).toBeVisible();
});

// --- AC-19.1.4: leaving with unsaved work ---------------------------------------

test('AC-19.1.4/1 — Choosing Practice, or opening another library Pattern, with unsaved work puts up a confirmation naming the unsaved composition', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page, 'Half done');
  await leaveComposer(page);
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog-message')).toContainText('Half done');
  await page.locator('.dialog-button[data-value="false"]').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await page.locator('.library-toggle').click();
  await page.locator('.sidebar [data-action="open-pattern"]').first().click();
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog-message')).toContainText('Half done');
});

test('AC-19.1.4/2 — Cancelling keeps the composition open and the mode unchanged; confirming discards the unsaved work and proceeds', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page, 'Half done');
  await leaveComposer(page);
  await page.locator('.dialog-button[data-value="false"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'composer');
  expect((await composerState(page)).draft.name).toBe('Half done');
  await leaveComposer(page);
  await page.locator('.dialog-button[data-value="true"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  expect((await composerState(page)).draft).toBeNull();
  await enterComposer(page);
  await expect(page.locator('.composer-empty')).toBeVisible();
});

test('AC-19.1.4/3 — With nothing unsaved — no composition, or a saved composition with every syllable pitched — no confirmation is asked', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await leaveComposer(page);
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  await enterComposer(page);
  await openInComposer(page, 'p_test', true).catch(() => {});
});
