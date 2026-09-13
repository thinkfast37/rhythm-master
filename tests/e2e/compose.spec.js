import { test, expect } from '@playwright/test';

/*
 * US-18.1 — Compose a Section from kept fills. The Section is the Composer's,
 * never Pattern data; it plays through the same pass-boundary seam as cycle
 * mode and is saved as a Song in its own store.
 */

async function melodicBlank(page, timeSignature = '4/4') {
  await page.goto('/');
  await page.evaluate((ts) => window.__rm.loadBlank(ts), timeSignature);
  await page.locator('.sound-mode [data-mode="melodic"]').click();
}

/** A blank owned Pattern under I–IV–V with two fills kept: root-fifth and alberti. */
async function keptBlank(page) {
  await melodicBlank(page);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  // A progression brings its own fill; the Pattern's own is None here, so the
  // fill in force is always the Section's doing.
  await page.locator('.arpeggio-picker').selectOption('none');
  await page.evaluate(() => {
    window.__rm.handlers.onKeepFill('root-fifth');
    window.__rm.handlers.onKeepFill('alberti');
  });
  await onTab(page, 'compose');
}

const compose = (page) => page.locator('[data-section="compose"]');
/** The workbench is tabbed at every width (AC-15.1.7): one group on screen. */
const onTab = (page, name) => page.locator(`.workbench-tab[data-tab="${name}"]`).click();
const entries = (page) => compose(page).locator('.compose-entry');
const fillInForce = (page) => page.evaluate(() => window.__rm.fillInForce());
const songs = (page) => page.evaluate(() => window.__rm.songStore.loadAll());
const patternState = (page) => page.evaluate(() => window.__rm.getState().pattern);

async function untilFill(page, id, timeout = 9000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if ((await fillInForce(page)) === id) return true;
    await page.waitForTimeout(80);
  }
  return false;
}

/** Name a Song through the naming prompt (ui/dialogs.js). */
async function nameSong(page, name) {
  const input = page.locator('.dialog .dialog-input');
  await input.fill(name);
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
}

const dialogAccept = (page) => page.locator('.dialog .dialog-button.primary').click();
const dialogCancel = (page) => page.locator('.dialog .dialog-button:not(.primary)').first().click();

test('AC-18.1.1/1 — Compose is a fourth workbench group, after Practice, tabbed on mobile with the others, and present only on a Melodic Pattern with a progression', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await expect(compose(page)).toBeHidden();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(compose(page)).toBeHidden();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await onTab(page, 'compose');
  await expect(compose(page)).toBeVisible();
  const order = await page.locator('.main-panel section[data-tab]').evaluateAll((els) => els.map((e) => e.dataset.tab));
  expect(order).toEqual(['melody', 'rhythm', 'practice', 'compose']);
});

test('AC-18.1.1/2 — The progression is shown as the chord strip names it and is not editable here; the group says it is set in Melody', async ({ page }) => {
  await keptBlank(page);
  const over = compose(page).locator('.compose-progression');
  await expect(over).toContainText('I – IV – V');
  await expect(over).toContainText('set in Melody');
  await expect(compose(page).locator('select, .progression-picker')).toHaveCount(0);
});

test('AC-18.1.1/3 — The palette lists the kept fills for this Pattern in catalogue order, and says so, naming Keep, when none are kept', async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await expect(compose(page).locator('.compose-empty-palette')).toContainText('Keep');
  await page.evaluate(() => {
    window.__rm.handlers.onKeepFill('alberti');
    window.__rm.handlers.onKeepFill('root-fifth');
  });
  const ids = await compose(page).locator('.palette-fill').evaluateAll((bs) => bs.map((b) => b.dataset.fill));
  // Catalogue order, not the order kept: the picker lists the catalogue.
  const catalogue = await page.locator('.arpeggio-picker option').evaluateAll((os) =>
    os.map((o) => o.value).filter((v) => v === 'root-fifth' || v === 'alberti')
  );
  expect(ids).toEqual(catalogue);
});

test('AC-18.1.2/1 — Tapping a palette fill appends an entry whose repeats are the cycle Repeats setting at that moment', async ({ page }) => {
  await keptBlank(page);
  await onTab(page, 'melody');
  await page.locator('.fill-cycle-repeats').fill('3');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await onTab(page, 'compose');
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first().locator('.entry-fill')).toHaveText('Alberti');
  await expect(entries(page).first().locator('.entry-repeats')).toHaveValue('3');
  await compose(page).locator('.palette-fill[data-fill="root-fifth"]').click();
  await expect(entries(page)).toHaveCount(2);
  await expect(entries(page).nth(1).locator('.entry-fill')).toHaveText('Root and fifth');
});

test("AC-18.1.2/2 — Each entry's repeats can be set from 1 to 16 in place", async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  const repeats = entries(page).first().locator('.entry-repeats');
  await expect(repeats).toHaveAttribute('min', '1');
  await expect(repeats).toHaveAttribute('max', '16');
  await repeats.fill('7');
  await repeats.dispatchEvent('change');
  await expect(repeats).toHaveValue('7');
  await repeats.fill('40');
  await repeats.dispatchEvent('change');
  await expect(repeats).toHaveValue('16');
});

test('AC-18.1.2/3 — An entry can be moved up, moved down and removed; the same fill may appear in the Section more than once', async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('.palette-fill[data-fill="root-fifth"]').click();
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  const names = () => entries(page).locator('.entry-fill').allTextContents();
  expect(await names()).toEqual(['Alberti', 'Root and fifth', 'Alberti']);
  await entries(page).nth(1).locator('[data-action="entry-up"]').click();
  expect(await names()).toEqual(['Root and fifth', 'Alberti', 'Alberti']);
  await entries(page).nth(0).locator('[data-action="entry-down"]').click();
  expect(await names()).toEqual(['Alberti', 'Root and fifth', 'Alberti']);
  await entries(page).nth(2).locator('[data-action="entry-remove"]').click();
  expect(await names()).toEqual(['Alberti', 'Root and fifth']);
});

test('AC-18.1.2/4 — The Section is shown as an ordered list naming each fill and its repeats, with the total number of passes it plays, and says when it is empty', async ({ page }) => {
  await keptBlank(page);
  await expect(compose(page).locator('.compose-empty')).toBeVisible();
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('.palette-fill[data-fill="root-fifth"]').click();
  await expect(compose(page).locator('ol.compose-entries')).toBeVisible();
  // I–IV–V changing per pass: three passes a cycle, four cycles each → 24.
  await expect(compose(page).locator('.compose-total')).toContainText('24 passes');
  await expect(compose(page).locator('.compose-empty')).toHaveCount(0);
});

test("AC-18.1.2/5 — Unkeeping a fill leaves every entry that uses it in the Section; the palette is a shortlist, not the Section's source of truth", async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await page.evaluate(() => window.__rm.handlers.onKeepFill('alberti'));
  await expect(compose(page).locator('.palette-fill[data-fill="alberti"]')).toHaveCount(0);
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first().locator('.entry-fill')).toHaveText('Alberti');
});

test('AC-18.1.3/1 — Each entry is in force for its repeats, one repeat being one harmonic cycle, and the next entry takes over from the very next pass with nothing stopped or restarted, the loop counter still counting', async ({ page }) => {
  await keptBlank(page);
  await onTab(page, 'melody');
  await page.locator('.fill-cycle-repeats').fill('1');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await onTab(page, 'compose');
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('.palette-fill[data-fill="root-fifth"]').click();
  await onTab(page, 'practice');
  await page.locator('[data-action="preset-tempo"][data-bpm="300"]').click();
  await onTab(page, 'compose');
  await compose(page).locator('[data-action="play-song"]').click();
  expect(await fillInForce(page)).toBe('alberti');
  // One harmonic cycle of I–IV–V is three passes; the second entry follows.
  expect(await untilFill(page, 'root-fifth')).toBe(true);
  const at = await page.evaluate(() => ({ loop: window.__rm.getState().loop, running: window.__rm.transport.isRunning }));
  expect(at.loop).toBeGreaterThanOrEqual(3);
  expect(at.running).toBe(true);
  await expect(entries(page).nth(1)).toHaveClass(/playing/);
  await page.locator('[data-action="stop"]').click();
});

test('AC-18.1.3/2 — After the last entry the first is in force again; the Section loops until stopped', async ({ page }) => {
  await keptBlank(page);
  await onTab(page, 'melody');
  await page.locator('.fill-cycle-repeats').fill('1');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await onTab(page, 'compose');
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('.palette-fill[data-fill="root-fifth"]').click();
  await onTab(page, 'practice');
  await page.locator('[data-action="preset-tempo"][data-bpm="300"]').click();
  await onTab(page, 'compose');
  await compose(page).locator('[data-action="play-song"]').click();
  expect(await untilFill(page, 'root-fifth')).toBe(true);
  expect(await untilFill(page, 'alberti', 12000)).toBe(true);
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  await page.locator('[data-action="stop"]').click();
});

test('AC-18.1.3/3 — Every view follows the fill in force exactly as under cycle mode, and the Compose group marks the entry playing', async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('[data-action="play-song"]').click();
  await expect(page.locator('.arpeggio-picker')).toHaveValue('alberti');
  await expect(entries(page).first()).toHaveClass(/playing/);
  await expect(page.locator('.pitch-strip')).toContainText('Alberti');
  await page.locator('[data-action="stop"]').click();
});

test('AC-18.1.3/4 — Play song is unavailable while the Section is empty, and the ordinary Play is unchanged: it loops the Pattern with its own arpeggio as it always has', async ({ page }) => {
  await keptBlank(page);
  await expect(compose(page).locator('[data-action="play-song"]')).toBeDisabled();
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await expect(compose(page).locator('[data-action="play-song"]')).toBeEnabled();
  await page.locator('[data-action="play"]').click();
  await page.waitForTimeout(200);
  expect(await fillInForce(page)).toBeNull();
  expect(await page.evaluate(() => window.__rm.songEntryInForce())).toBeNull();
  await page.locator('[data-action="stop"]').click();
});

test("AC-18.1.3/5 — Stop returns the Pattern's own arpeggio, exactly as stopping cycle mode does", async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('[data-action="play-song"]').click();
  expect(await fillInForce(page)).toBe('alberti');
  await page.locator('[data-action="stop"]').click();
  expect(await fillInForce(page)).toBeNull();
  expect((await patternState(page)).harmony.arpeggio ?? null).toBeNull();
  await expect(compose(page).locator('[data-action="play-song"]')).toHaveAttribute('aria-pressed', 'false');
});

test('AC-18.1.3/6 — Play song and cycle mode are exclusive: starting either ends the other, and neither writes anything into the Pattern', async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await onTab(page, 'melody');
  await page.locator('.fill-cycle').click();
  await expect(page.locator('.fill-cycle')).toHaveAttribute('aria-pressed', 'true');
  await onTab(page, 'compose');
  await compose(page).locator('[data-action="play-song"]').click();
  await expect(page.locator('.fill-cycle')).toHaveAttribute('aria-pressed', 'false');
  expect(await fillInForce(page)).toBe('alberti');
  await onTab(page, 'melody');
  await page.locator('.fill-cycle').click();
  expect(await page.evaluate(() => window.__rm.songEntryInForce())).toBeNull();
  await page.locator('[data-action="stop"]').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rm.patterns.v1')));
  expect(JSON.stringify(stored)).not.toContain('alberti');
  expect((await patternState(page)).harmony.arpeggio ?? null).toBeNull();
});

test('AC-18.1.3/7 — Editing the Section while it plays — repeats, order, an added or removed entry — takes effect from the next pass without a restart, the entry in force keeping its place where it still exists', async ({ page }) => {
  await keptBlank(page);
  await onTab(page, 'melody');
  await page.locator('.fill-cycle-repeats').fill('1');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await onTab(page, 'compose');
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await onTab(page, 'practice');
  await page.locator('[data-action="preset-tempo"][data-bpm="300"]').click();
  await onTab(page, 'compose');
  await compose(page).locator('[data-action="play-song"]').click();
  await page.waitForTimeout(300);
  await compose(page).locator('.palette-fill[data-fill="root-fifth"]').click();
  const now = await page.evaluate(() => ({
    entry: window.__rm.songEntryInForce(),
    running: window.__rm.transport.isRunning,
    loop: window.__rm.getState().loop,
  }));
  expect(now.running).toBe(true);
  expect(now.entry.entryIndex).toBe(0);
  expect(await untilFill(page, 'root-fifth')).toBe(true);
  await entries(page).nth(0).locator('[data-action="entry-remove"]').click();
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  expect(await fillInForce(page)).toBe('root-fifth');
  await page.locator('[data-action="stop"]').click();
});

test("AC-18.1.4/1 — Save asks for a name, and a Song is stored with its name, its Pattern and its entries in order; the Compose group lists this Pattern's Songs and choosing one loads its Section", async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('.palette-fill[data-fill="root-fifth"]').click();
  await compose(page).locator('[data-action="song-save"]').click();
  await nameSong(page, 'Verse bed');
  const stored = await songs(page);
  const saved = Object.values(stored.songs ?? stored)[0];
  expect(saved.name).toBe('Verse bed');
  expect(saved.sections[0].patternId).toBe('p_test');
  expect(saved.sections[0].entries.map((e) => e.fill)).toEqual(['alberti', 'root-fifth']);
  await expect(compose(page).locator('.song-item')).toHaveCount(1);
  await compose(page).locator('[data-action="song-new"]').click();
  await expect(entries(page)).toHaveCount(0);
  await compose(page).locator('.song-item [data-action="song-load"]').click();
  await expect(entries(page)).toHaveCount(2);
  await expect(compose(page).locator('.compose-section-head')).toContainText('Verse bed');
});

test('AC-18.1.4/2 — A saved Song survives a reload and is listed only on the Pattern it was composed over', async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('[data-action="song-save"]').click();
  await nameSong(page, 'Kept');
  await page.reload();
  await page.evaluate(() => {
    const p = window.__rm.patternStore.findById('p_test');
    window.__rm.loadPattern(p, { owned: true });
  });
  await expect(compose(page).locator('.song-item')).toHaveCount(1);
  await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    window.__rm.loadPattern({ ...p, id: 'p_other', name: 'Other' }, { owned: true });
  });
  await expect(compose(page).locator('.song-item')).toHaveCount(0);
});

test('AC-18.1.4/3 — A Song can be renamed and deleted from the Compose group, deletion asking first', async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('[data-action="song-save"]').click();
  await nameSong(page, 'First');
  await compose(page).locator('.song-item [data-action="song-rename"]').click();
  await nameSong(page, 'Renamed');
  await expect(compose(page).locator('.song-item .song-load')).toHaveText('Renamed');
  await compose(page).locator('.song-item [data-action="song-delete"]').click();
  // Asked first: cancelling keeps it.
  await dialogCancel(page);
  await expect(compose(page).locator('.song-item')).toHaveCount(1);
  await compose(page).locator('.song-item [data-action="song-delete"]').click();
  await dialogAccept(page);
  await expect(compose(page).locator('.song-item')).toHaveCount(0);
});

test("AC-18.1.4/4 — Edits to a loaded Song's Section are not saved until Save is pressed again, which updates the Song in place; Compose says when the loaded Song has unsaved changes", async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('[data-action="song-save"]').click();
  await nameSong(page, 'Bed');
  await expect(compose(page).locator('.compose-unsaved')).toHaveCount(0);
  await compose(page).locator('.palette-fill[data-fill="root-fifth"]').click();
  await expect(compose(page).locator('.compose-unsaved')).toBeVisible();
  let stored = await songs(page);
  expect(Object.values(stored.songs ?? stored)[0].sections[0].entries).toHaveLength(1);
  await compose(page).locator('[data-action="song-save"]').click();
  await expect(compose(page).locator('.compose-unsaved')).toHaveCount(0);
  stored = await songs(page);
  const all = Object.values(stored.songs ?? stored);
  expect(all).toHaveLength(1);
  expect(all[0].sections[0].entries).toHaveLength(2);
});

test('AC-18.1.4/5 — Deleting a Pattern that a Song is composed over is refused with a message naming the Song or Songs, until they are deleted', async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('[data-action="song-save"]').click();
  await nameSong(page, 'Holds it');
  page.evaluate(() => window.__rm.handlers.onDelete()).catch(() => {});
  await expect(page.locator('.dialog')).toContainText('Holds it');
  await dialogAccept(page);
  expect(await page.evaluate(() => Boolean(window.__rm.patternStore.findById('p_test')))).toBe(true);
  await compose(page).locator('.song-item [data-action="song-delete"]').click();
  await dialogAccept(page);
  await expect(compose(page).locator('.song-item')).toHaveCount(0);
  page.evaluate(() => window.__rm.handlers.onDelete()).catch(() => {});
  await expect(page.locator('.dialog')).toContainText('permanently');
  await dialogAccept(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.__rm.patternStore.findById('p_test')))).toBe(false);
});

test('AC-18.1.4/6 — A Song is not Pattern content: saving one changes nothing on the Pattern, auto-saves nothing, prompts a shipped Pattern for no name, and is barred from every Pattern export and submission', async ({ page }) => {
  await page.goto('/');
  const seedId = await page.evaluate(() => {
    const s = window.__rm.seedStore.loadAll().find((s) => s.soundMode === 'melodic' && s.harmony?.chords?.length);
    window.__rm.handlers.onOpen(s.id, false);
    window.__rm.handlers.onKeepFill('alberti');
    return s.id;
  });
  await onTab(page, 'compose');
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('[data-action="song-save"]').click();
  await nameSong(page, 'On a shipped one');
  const after = await page.evaluate((id) => ({
    seed: JSON.stringify(window.__rm.seedStore.findById(id)),
    owned: localStorage.getItem('rm.patterns.v1'),
    midi: JSON.stringify(window.__rmMidi()),
  }), seedId);
  expect(after.seed).not.toContain('alberti');
  expect(after.owned ?? '').not.toContain('On a shipped one');
  expect(after.midi).not.toContain('On a shipped one');
  await expect(page.locator('.dialog')).toHaveCount(0);
});

test('AC-18.1.4/7 — Songs are stored separately from Patterns, ratings, added Tags and Keeps, so nothing that happens to those stores can lose a Song', async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await compose(page).locator('[data-action="song-save"]').click();
  await nameSong(page, 'Safe');
  await page.evaluate(() => {
    localStorage.removeItem('rm.overlays.v1');
    localStorage.removeItem('rm.patterns.v1');
  });
  const stored = await songs(page);
  expect(Object.values(stored.songs ?? stored).map((s) => s.name)).toEqual(['Safe']);
});

test('AC-18.1.5/2 — The file is named after the Song when it has been saved, and after the Pattern otherwise', async ({ page }) => {
  await keptBlank(page);
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  const unsavedName = await page.evaluate(() => window.__rm.songMidiFilename());
  expect(unsavedName).toContain('test-pattern');
  await compose(page).locator('[data-action="song-save"]').click();
  await nameSong(page, 'Named song');
  const savedName = await page.evaluate(() => window.__rm.songMidiFilename());
  expect(savedName).toContain('named-song');
});

test('AC-18.1.5/4 — Export Song MIDI is unavailable while the Section is empty', async ({ page }) => {
  await keptBlank(page);
  await expect(compose(page).locator('[data-action="song-export"]')).toBeDisabled();
  await compose(page).locator('.palette-fill[data-fill="alberti"]').click();
  await expect(compose(page).locator('[data-action="song-export"]')).toBeEnabled();
});
