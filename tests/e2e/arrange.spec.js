/**
 * Lay Sections and Patterns out as an Arrangement (US-20.1): the Arrange mode,
 * the palette filled from the library, the sequence laid out from it, saving,
 * and the library's Arrangements group — proven in the DOM.
 *
 * Fixtures from the shipped library: Bossa Nova (s_21, percussive) and
 * Djembe 2 (s_108, melodic). The Section is a recorded composition with Bossa
 * Nova under it.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, loadFourBeats, recordAll } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const DJEMBE = 's_108';

const mode = (page, name) => page.locator(`.mode-switch [data-mode="${name}"]`);
const panel = (page) => page.locator('.arrange-panel');
const palette = (page) => panel(page).locator('.arrange-palette-item');
const entries = (page) => panel(page).locator('.arrange-entry');
const heading = (page, group) => page.locator(`.library .library-group-toggle[data-group="${group}"]`);
const stored = (page) => page.evaluate(() => window.__rm.arrangementStore.loadAll());
const current = (page) => page.evaluate(() => window.__rm.getState().arrange.arrangement);
const patternRow = (page, id) => page.locator(`.library .pattern-item[data-pattern-id="${id}"] [data-action="open-pattern"]`);

async function showLibrary(page) {
  if (!(await heading(page, 'patterns').isVisible())) await page.locator('.library-toggle').click();
  await expect(heading(page, 'patterns')).toBeVisible();
}

async function toArrange(page) {
  await mode(page, 'arrange').click();
  await expect(panel(page)).toBeVisible();
}

/** Put a library Pattern in the palette through Add from library. */
async function addPattern(page, id) {
  await panel(page).locator('[data-action="arrange-add"]').click();
  await showLibrary(page);
  await patternRow(page, id).click();
  await expect(panel(page).locator(`.arrange-palette-item[data-kind="pattern"][data-id="${id}"]`)).toBeVisible();
}

async function nameInDialog(page, name) {
  await expect(page.locator('.dialog')).toBeVisible();
  if (name !== undefined) await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
}

/** A saved Section, made in the Composer: a recorded composition with Bossa Nova under it. Ends in Practice. */
async function saveSection(page, name = 'Verse bed') {
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  await page.locator('.layer-add').click();
  await page.locator(`.pattern-item[data-pattern-id="${BOSSA}"] [data-action="open-pattern"]`).click();
  await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${BOSSA}"]`)).toBeVisible();
  await page.locator('.section-save').click();
  await nameInDialog(page, name);
  await mode(page, 'practice').click();
  return page.evaluate(() => window.__rm.sectionStore.loadAll()[0].id);
}

/** An Arrangement of Bossa Nova then Djembe 2, saved under a name. */
async function savedArrangement(page, name = 'Sunday song') {
  await toArrange(page);
  await addPattern(page, BOSSA);
  await addPattern(page, DJEMBE);
  await palette(page).nth(0).locator('[data-action="arrange-lay"]').click();
  await palette(page).nth(1).locator('[data-action="arrange-lay"]').click();
  await panel(page).locator('[data-action="arrange-save"]').click();
  await nameInDialog(page, name);
}

// --- AC-20.1.1: the mode -------------------------------------------------------------

test('AC-20.1.1/1 — Choosing Arrange shows the Arrangement panel — its name, the palette and the sequence — in place of the rhythm band and the work surface, while the library sidebar and its toggle stay', async ({ page }) => {
  await openApp(page);
  await expect(panel(page)).toBeHidden();
  await toArrange(page);
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'arrange');
  await expect(mode(page, 'arrange')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).locator('.arrange-title')).toHaveText('New Arrangement');
  await expect(panel(page).locator('.arrange-palette')).toBeVisible();
  await expect(panel(page).locator('.arrange-sequence')).toBeVisible();
  await expect(panel(page).locator('.arrange-palette-empty')).toBeVisible();
  await expect(panel(page).locator('.arrange-sequence-empty')).toBeVisible();
  // In place of the band and the surface, and of the Composer's panel.
  await expect(page.locator('.rhythm-band')).toBeHidden();
  await expect(page.locator('.work-surface')).toBeHidden();
  await expect(page.locator('.composer-panel')).toBeHidden();
  // The library and its toggle stay.
  await expect(page.locator('.library-toggle')).toBeVisible();
  await showLibrary(page);
  await expect(page.locator('.library .library-search')).toBeVisible();
});

test('AC-20.1.1/2 — Choosing Practice or Composer puts that mode back as it was, and the Arrangement being built is kept for the session', async ({ page }) => {
  await openApp(page);
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), DJEMBE);
  const open = await page.evaluate(() => window.__rm.getState().pattern.id);
  await toArrange(page);
  await addPattern(page, BOSSA);
  await palette(page).first().locator('[data-action="arrange-lay"]').click();
  await expect(entries(page)).toHaveCount(1);
  // The Pattern open in Practice was not replaced by the one put in the palette.
  await mode(page, 'practice').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  await expect(page.locator('.rhythm-band')).toBeVisible();
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => window.__rm.getState().pattern.id)).toBe(open);
  // Back in Arrange, never saved, it is as it was left.
  await toArrange(page);
  await expect(palette(page)).toHaveCount(1);
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first().locator('.arrange-entry-name')).toHaveValue('Bossa Nova');
});

test('AC-20.1.1/3 — The mode is a within-session position, not a stored preference: a reload opens in Practice', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  await expect(mode(page, 'practice')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page)).toBeHidden();
  expect(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1') ?? '{}')))).not.toMatch(/arrange/);
});

test('AC-20.1.1/4 — Play is unavailable in Arrange, and says that an Arrangement cannot be played yet', async ({ page }) => {
  await openApp(page);
  const play = page.locator('[data-action="play"]').first();
  await expect(play).toBeEnabled();
  await toArrange(page);
  await expect(play).toBeDisabled();
  await expect(play).toHaveAttribute('title', /cannot be played yet/);
  await expect(panel(page).locator('.arrange-play-note')).toContainText('cannot be played yet');
  // And nothing starts if it is asked for another way.
  await page.evaluate(() => window.__rm.handlers.onPlay());
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(false);
  // Back in Practice it plays as it did.
  await mode(page, 'practice').click();
  await expect(play).toBeEnabled();
});

// --- AC-20.1.2: the palette ----------------------------------------------------------

test('AC-20.1.2/1 — Add from library opens the library to choose from, and choosing a Pattern, a Section or a Chain puts it in the palette and ends the choosing', async ({ page }) => {
  await openApp(page);
  const section = await saveSection(page);
  const chain = await page.evaluate(() => {
    const over = window.__rm.seedStore.loadAll().find((x) => x.soundMode === 'melodic' && x.harmony?.chords?.length);
    return window.__rm.chainStore.upsert({ name: 'Bossa bed', sections: [{ patternId: over.id, entries: [{ fill: 'alberti', repeats: 1 }] }] }).id;
  });
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await toArrange(page);
  const add = panel(page).locator('[data-action="arrange-add"]');

  // A Pattern.
  await add.click();
  await expect(add).toHaveAttribute('aria-pressed', 'true');
  await showLibrary(page);
  await patternRow(page, BOSSA).click();
  await expect(add).toHaveAttribute('aria-pressed', 'false');
  await expect(palette(page)).toHaveCount(1);
  // The Pattern went into the palette and was not opened in Practice.
  expect(await page.evaluate(() => window.__rm.getState().pattern.id)).not.toBe(BOSSA);
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'arrange');

  // A Section, and a Chain.
  await add.click();
  await showLibrary(page);
  await page.locator(`.library .section-entry[data-section-id="${section}"] [data-action="open-section"]`).click();
  await expect(palette(page)).toHaveCount(2);
  await add.click();
  await showLibrary(page);
  await page.locator(`.library .chain-entry[data-chain-id="${chain}"] [data-action="open-chain"]`).click();
  await expect(palette(page)).toHaveCount(3);
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'arrange');
  expect((await current(page)).palette).toEqual([
    { kind: 'pattern', id: BOSSA },
    { kind: 'section', id: section },
    { kind: 'chain', id: chain },
  ]);
});

test('AC-20.1.2/2 — A palette entry shows its name and its type, a Percussive Pattern saying that it plays on the drum kit, and nothing is in the palette twice', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  await addPattern(page, BOSSA);
  await addPattern(page, DJEMBE);
  const bossa = panel(page).locator(`.arrange-palette-item[data-id="${BOSSA}"]`);
  await expect(bossa.locator('.arrange-palette-add')).toHaveText('Bossa Nova');
  await expect(bossa.locator('.arrange-palette-type')).toHaveText('Percussive · drum kit');
  const djembe = panel(page).locator(`.arrange-palette-item[data-id="${DJEMBE}"]`);
  await expect(djembe.locator('.arrange-palette-type')).toHaveText(/^(Chord progression|Melodic composition)$/);
  await expect(djembe.locator('.arrange-palette-type')).not.toContainText('drum kit');
  // Chosen again, it is not there twice.
  await panel(page).locator('[data-action="arrange-add"]').click();
  await showLibrary(page);
  await patternRow(page, BOSSA).click();
  await expect(palette(page)).toHaveCount(2);
});

test('AC-20.1.2/3 — Remove takes an entry out of the palette and leaves every sequence entry made from it', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  await addPattern(page, BOSSA);
  await addPattern(page, DJEMBE);
  await palette(page).nth(0).locator('[data-action="arrange-lay"]').click();
  await palette(page).nth(1).locator('[data-action="arrange-lay"]').click();
  await palette(page).nth(0).locator('[data-action="arrange-palette-remove"]').click();
  await expect(palette(page)).toHaveCount(1);
  await expect(palette(page).first()).toHaveAttribute('data-id', DJEMBE);
  await expect(entries(page)).toHaveCount(2);
  await expect(entries(page).nth(0).locator('.arrange-entry-source')).toContainText('Bossa Nova');
});

test('AC-20.1.2/4 — Edit on a Pattern or a Section in the palette opens it in the Composer, and a Chain has no Edit, saying it is written out as a Pattern first', async ({ page }) => {
  await openApp(page);
  const section = await saveSection(page);
  const chain = await page.evaluate(() => {
    const over = window.__rm.seedStore.loadAll().find((x) => x.soundMode === 'melodic' && x.harmony?.chords?.length);
    return window.__rm.chainStore.upsert({ name: 'Bossa bed', sections: [{ patternId: over.id, entries: [{ fill: 'alberti', repeats: 1 }] }] }).id;
  });
  const mine = await page.evaluate(() => window.__rm.sectionStore.loadAll()[0].compositionId);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await toArrange(page);
  for (const [group, attr, id, action] of [
    ['section', 'section-id', section, 'open-section'],
    ['chain', 'chain-id', chain, 'open-chain'],
  ]) {
    await panel(page).locator('[data-action="arrange-add"]').click();
    await showLibrary(page);
    await page.locator(`.library .${group}-entry[data-${attr}="${id}"] [data-action="${action}"]`).click();
  }
  await addPattern(page, mine);
  await expect(palette(page)).toHaveCount(3);

  // A Chain: no Edit, and why.
  const chainRow = panel(page).locator('.arrange-palette-item[data-kind="chain"]');
  await expect(chainRow.locator('[data-action="arrange-edit"]')).toHaveCount(0);
  await expect(chainRow.locator('.arrange-palette-note')).toContainText('Write it out as a Pattern');

  // A Section: the Composer, on that Section.
  await panel(page).locator('.arrange-palette-item[data-kind="section"] [data-action="arrange-edit"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'composer');
  await expect(page.locator('.composer-grid')).toBeVisible();
  expect(await page.evaluate(() => window.__rm.composer().section.id)).toBe(section);
  // Back in Arrange, the palette is as it was left.
  await toArrange(page);
  await expect(palette(page)).toHaveCount(3);

  // A Pattern of the Composer's own: the Composer, on that Pattern.
  await panel(page).locator(`.arrange-palette-item[data-kind="pattern"][data-id="${mine}"] [data-action="arrange-edit"]`).click();
  if (await page.locator('.dialog').isVisible()) await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'composer');
  expect(await page.evaluate(() => window.__rm.composer().savedId)).toBe(mine);
});

// --- AC-20.1.3: the sequence ---------------------------------------------------------

test('AC-20.1.3/1 — Tapping a palette entry appends it to the sequence as an entry named after it, played once', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  await addPattern(page, BOSSA);
  await addPattern(page, DJEMBE);
  await palette(page).nth(1).locator('[data-action="arrange-lay"]').click();
  await palette(page).nth(0).locator('[data-action="arrange-lay"]').click();
  await expect(entries(page)).toHaveCount(2);
  await expect(entries(page).nth(0).locator('.arrange-entry-name')).toHaveValue('Djembe 2');
  await expect(entries(page).nth(1).locator('.arrange-entry-name')).toHaveValue('Bossa Nova');
  await expect(entries(page).nth(1).locator('.arrange-entry-repeats')).toHaveValue('1');
  expect((await current(page)).entries).toEqual([
    { kind: 'pattern', id: DJEMBE, name: 'Djembe 2', repeats: 1 },
    { kind: 'pattern', id: BOSSA, name: 'Bossa Nova', repeats: 1 },
  ]);
});

test('AC-20.1.3/2 — The name of a sequence entry can be changed in place, and its repeats set from 1 to 16', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  await addPattern(page, BOSSA);
  await palette(page).first().locator('[data-action="arrange-lay"]').click();
  const row = entries(page).first();
  await row.locator('.arrange-entry-name').fill('Intro');
  await row.locator('.arrange-entry-name').press('Enter');
  await row.locator('.arrange-entry-name').blur();
  await expect(row.locator('.arrange-entry-name')).toHaveValue('Intro');
  // What it plays is still named beside it.
  await expect(row.locator('.arrange-entry-source')).toContainText('Bossa Nova');
  // An emptied name goes back to the one it had.
  await row.locator('.arrange-entry-name').fill('');
  await row.locator('.arrange-entry-name').blur();
  await expect(entries(page).first().locator('.arrange-entry-name')).toHaveValue('Intro');
  for (const [typed, held] of [
    ['4', '4'],
    ['16', '16'],
    ['40', '16'],
    ['0', '1'],
  ]) {
    await entries(page).first().locator('.arrange-entry-repeats').fill(typed);
    await entries(page).first().locator('.arrange-entry-repeats').blur();
    await expect(entries(page).first().locator('.arrange-entry-repeats')).toHaveValue(held);
  }
  expect((await current(page)).entries[0]).toEqual({ kind: 'pattern', id: BOSSA, name: 'Intro', repeats: 1 });
});

test('AC-20.1.3/3 — A sequence entry can be moved up, moved down and removed, and the same palette entry may be in the sequence more than once', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  await addPattern(page, BOSSA);
  await addPattern(page, DJEMBE);
  const lay = (i) => palette(page).nth(i).locator('[data-action="arrange-lay"]').click();
  await lay(0);
  await lay(1);
  await lay(0);
  const names = () => entries(page).locator('.arrange-entry-source').allTextContents();
  expect(await names()).toEqual(['← Bossa Nova', '← Djembe 2', '← Bossa Nova']);
  await entries(page).nth(1).locator('[data-action="arrange-entry-up"]').click();
  expect(await names()).toEqual(['← Djembe 2', '← Bossa Nova', '← Bossa Nova']);
  await entries(page).nth(0).locator('[data-action="arrange-entry-down"]').click();
  expect(await names()).toEqual(['← Bossa Nova', '← Djembe 2', '← Bossa Nova']);
  // The ends cannot move past the ends.
  await expect(entries(page).nth(0).locator('[data-action="arrange-entry-up"]')).toBeDisabled();
  await expect(entries(page).nth(2).locator('[data-action="arrange-entry-down"]')).toBeDisabled();
  await entries(page).nth(1).locator('[data-action="arrange-entry-remove"]').click();
  expect(await names()).toEqual(['← Bossa Nova', '← Bossa Nova']);
  // The palette is untouched by any of it.
  await expect(palette(page)).toHaveCount(2);
});

test('AC-20.1.3/4 — The sequence is an ordered, numbered list showing each entry by its name, what it plays and its repeats, and says when it is empty', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  await expect(panel(page).locator('.arrange-sequence-empty')).toContainText('The sequence is empty');
  await expect(panel(page).locator('ol.arrange-entries')).toHaveCount(0);
  await addPattern(page, BOSSA);
  await addPattern(page, DJEMBE);
  await palette(page).nth(0).locator('[data-action="arrange-lay"]').click();
  await palette(page).nth(1).locator('[data-action="arrange-lay"]').click();
  await expect(panel(page).locator('.arrange-sequence-empty')).toHaveCount(0);
  await expect(panel(page).locator('ol.arrange-entries')).toHaveCount(1);
  await expect(entries(page).locator('.arrange-entry-number')).toHaveText(['1.', '2.']);
  await expect(entries(page).nth(1).locator('.arrange-entry-name')).toHaveValue('Djembe 2');
  await expect(entries(page).nth(1).locator('.arrange-entry-source')).toHaveText('← Djembe 2');
  await expect(entries(page).nth(1).locator('.arrange-entry-repeats')).toHaveValue('1');
  await expect(panel(page).locator('.arrange-count')).toHaveText('2 entries');
});

// --- AC-20.1.4: saving ---------------------------------------------------------------

test('AC-20.1.4/1 — Save asks a name, unique among Arrangements, and stores the name, the palette and the sequence in order; it is unavailable while the sequence is empty', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  const save = panel(page).locator('[data-action="arrange-save"]');
  await expect(save).toBeDisabled();
  await addPattern(page, BOSSA);
  await addPattern(page, DJEMBE);
  // A palette alone is not yet a piece.
  await expect(save).toBeDisabled();
  await palette(page).nth(1).locator('[data-action="arrange-lay"]').click();
  await palette(page).nth(0).locator('[data-action="arrange-lay"]').click();
  await expect(save).toBeEnabled();
  await expect(panel(page).locator('.arrange-state')).toHaveText('Not saved');
  await save.click();
  await nameInDialog(page, 'Sunday song');
  await expect(panel(page).locator('.arrange-title')).toHaveText('Arrangement — Sunday song');
  await expect(panel(page).locator('.arrange-state')).toContainText('Saved');
  expect(await stored(page)).toEqual([
    {
      id: 'arrg_1',
      name: 'Sunday song',
      palette: [
        { kind: 'pattern', id: BOSSA },
        { kind: 'pattern', id: DJEMBE },
      ],
      entries: [
        { kind: 'pattern', id: DJEMBE, name: 'Djembe 2', repeats: 1 },
        { kind: 'pattern', id: BOSSA, name: 'Bossa Nova', repeats: 1 },
      ],
    },
  ]);
  // A second one cannot take the same name.
  await panel(page).locator('[data-action="arrange-new"]').click();
  await addPattern(page, BOSSA);
  await palette(page).first().locator('[data-action="arrange-lay"]').click();
  await panel(page).locator('[data-action="arrange-save"]').click();
  await page.locator('.dialog-input').fill('sunday SONG');
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog .dialog-error')).toBeVisible();
  await page.locator('.dialog-input').fill('Monday song');
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect((await stored(page)).map((a) => a.name)).toEqual(['Sunday song', 'Monday song']);
});

test('AC-20.1.4/2 — Once an Arrangement is saved, every change to its palette or its sequence saves it in place at once', async ({ page }) => {
  await openApp(page);
  await savedArrangement(page);
  expect((await stored(page))[0].entries).toHaveLength(2);
  // The sequence: a repeat, a name, an order, a removal.
  await entries(page).nth(0).locator('.arrange-entry-repeats').fill('3');
  await entries(page).nth(0).locator('.arrange-entry-repeats').blur();
  expect((await stored(page))[0].entries[0].repeats).toBe(3);
  await entries(page).nth(1).locator('.arrange-entry-name').fill('Outro');
  await entries(page).nth(1).locator('.arrange-entry-name').blur();
  expect((await stored(page))[0].entries[1].name).toBe('Outro');
  await entries(page).nth(1).locator('[data-action="arrange-entry-up"]').click();
  expect((await stored(page))[0].entries.map((e) => e.name)).toEqual(['Outro', 'Bossa Nova']);
  await palette(page).nth(0).locator('[data-action="arrange-lay"]').click();
  expect((await stored(page))[0].entries).toHaveLength(3);
  await entries(page).nth(2).locator('[data-action="arrange-entry-remove"]').click();
  expect((await stored(page))[0].entries).toHaveLength(2);
  // The palette.
  await palette(page).nth(1).locator('[data-action="arrange-palette-remove"]').click();
  expect((await stored(page))[0].palette).toEqual([{ kind: 'pattern', id: BOSSA }]);
  // One Arrangement throughout, with no Save pressed again.
  expect(await stored(page)).toHaveLength(1);
  await expect(panel(page).locator('[data-action="arrange-save"]')).toHaveCount(0);
});

test('AC-20.1.4/3 — A saved Arrangement survives a reload, and can be renamed and deleted, deletion asking first', async ({ page }) => {
  await openApp(page);
  await savedArrangement(page);
  const before = await stored(page);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await showLibrary(page);
  await page.locator('.library [data-action="open-arrangement"]').click();
  await expect(panel(page).locator('.arrange-title')).toHaveText('Arrangement — Sunday song');
  // Renamed, the same Arrangement.
  await panel(page).locator('[data-action="arrange-rename"]').click();
  await nameInDialog(page, 'Monday song');
  await expect(panel(page).locator('.arrange-title')).toHaveText('Arrangement — Monday song');
  expect((await stored(page)).map((a) => [a.id, a.name])).toEqual([['arrg_1', 'Monday song']]);
  // Deletion asks first: declined, it stays.
  await panel(page).locator('[data-action="arrange-delete"]').click();
  await expect(page.locator('.dialog')).toContainText('Monday song');
  await page.locator('.dialog .dialog-button:not(.primary)').first().click();
  expect(await stored(page)).toHaveLength(1);
  await panel(page).locator('[data-action="arrange-delete"]').click();
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await stored(page)).toEqual([]);
  await expect(panel(page).locator('.arrange-title')).toHaveText('New Arrangement');
  // What it was made of is still in the library.
  expect(await page.evaluate((id) => Boolean(window.__rm.seedStore.findById(id)), BOSSA)).toBe(true);
});

test('AC-20.1.4/4 — New starts an empty Arrangement, asking first when the one on screen has never been saved and is not empty', async ({ page }) => {
  await openApp(page);
  await toArrange(page);
  const fresh = panel(page).locator('[data-action="arrange-new"]');
  // Empty: nothing to ask about.
  await fresh.click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await addPattern(page, BOSSA);
  // Never saved and not empty: asked, and declining keeps it.
  await fresh.click();
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog .dialog-button:not(.primary)').first().click();
  await expect(palette(page)).toHaveCount(1);
  await fresh.click();
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(palette(page)).toHaveCount(0);
  // Saved: nothing would be lost, so nothing is asked.
  await addPattern(page, BOSSA);
  await palette(page).first().locator('[data-action="arrange-lay"]').click();
  await panel(page).locator('[data-action="arrange-save"]').click();
  await nameInDialog(page, 'Sunday song');
  await fresh.click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(panel(page).locator('.arrange-title')).toHaveText('New Arrangement');
  expect(await stored(page)).toHaveLength(1);
});

test('AC-20.1.4/5 — Deleting a Pattern, a Section or a Chain that an Arrangement uses is refused with a message naming the Arrangement or Arrangements, until they no longer use it', async ({ page }) => {
  await openApp(page);
  const section = await saveSection(page);
  const mine = await page.evaluate(() => window.__rm.sectionStore.loadAll()[0].compositionId);
  // A second Pattern of the Composer's own, with a Chain over it, neither part of the Section.
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.grid .slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  const loose = await page.evaluate(() => window.__rm.getState().pattern.id);
  const chain = await page.evaluate((id) => window.__rm.chainStore.upsert({ name: 'Bed', sections: [{ patternId: id, entries: [{ fill: 'alberti', repeats: 1 }] }] }).id, loose);
  expect(loose).not.toBe(mine);
  await page.evaluate(
    ([s, c]) =>
      window.__rm.arrangementStore.upsert({
        name: 'Sunday song',
        palette: [
          { kind: 'section', id: s },
          { kind: 'chain', id: c },
        ],
        entries: [{ kind: 'section', id: s, name: 'Verse', repeats: 1 }],
      }),
    [section, chain]
  );
  const refused = async (what) => {
    await expect(page.locator('.dialog')).toContainText("can't be deleted");
    await expect(page.locator('.dialog')).toContainText('Sunday song');
    await expect(page.locator('.dialog')).toContainText(what);
    await page.locator('.dialog .dialog-button.primary').click();
    await expect(page.locator('.dialog')).toHaveCount(0);
  };
  // The Chain, in the palette alone.
  await page.evaluate((id) => void window.__rm.handlers.onChainDelete(id), chain);
  await refused('Bed');
  expect(await page.evaluate(() => window.__rm.chainStore.loadAll().length)).toBe(1);
  // The Section.
  await page.evaluate((id) => void window.__rm.handlers.onSectionDelete(id), section);
  await refused('Verse bed');
  expect(await page.evaluate(() => window.__rm.sectionStore.loadAll().length)).toBe(1);
  // A Pattern named by an Arrangement.
  await page.evaluate((id) => {
    const a = window.__rm.arrangementStore.loadAll()[0];
    window.__rm.arrangementStore.upsert({ ...a, palette: [...a.palette, { kind: 'pattern', id }] });
  }, loose);
  await page.evaluate(() => void window.__rm.handlers.onDelete());
  await refused('Sunday song');
  expect(await page.evaluate((id) => Boolean(window.__rm.patternStore.findById(id)), loose)).toBe(true);
  // The Arrangement gone, the Chain can go.
  await page.evaluate(() => window.__rm.arrangementStore.remove('arrg_1'));
  await page.evaluate((id) => void window.__rm.handlers.onChainDelete(id), chain);
  await expect(page.locator('.dialog')).toContainText('Delete the Chain');
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.chainStore.loadAll().length)).toBe(0);
});

// --- AC-20.1.5: the library ----------------------------------------------------------

test('AC-20.1.5/1 — Saved Arrangements are the first group of the library, ahead of Sections, under a heading with its count that folds as the other groups do, each listed with how many entries its sequence has', async ({ page }) => {
  await openApp(page);
  await showLibrary(page);
  await expect(heading(page, 'arrangements')).toHaveCount(0);
  await saveSection(page);
  await savedArrangement(page);
  await showLibrary(page);
  await expect(heading(page, 'arrangements').locator('.library-group-name')).toHaveText('Arrangements');
  await expect(heading(page, 'arrangements').locator('.library-group-count')).toHaveText('1');
  const order = await page.locator('.library .library-group-toggle').evaluateAll((els) => els.map((e) => e.dataset.group));
  expect(order.slice(0, 2)).toEqual(['arrangements', 'sections']);
  expect(order.at(-1)).toBe('patterns');
  const entry = page.locator('.library-arrangements .arrangement-entry');
  await expect(entry.locator('.arrangement-entry-name')).toHaveText('Sunday song');
  await expect(entry.locator('.arrangement-entry-length')).toHaveText('2 entries');
  // It folds as the others do, and is remembered.
  await heading(page, 'arrangements').click();
  await expect(heading(page, 'arrangements')).toHaveAttribute('aria-expanded', 'false');
  await expect(entry).toHaveCount(0);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')))).libraryFolded).toContain('arrangements');
  await heading(page, 'arrangements').click();
  await expect(entry).toHaveCount(1);
});

test('AC-20.1.5/2 — Arrangement is the last of the type pills, and choosing it shows the Arrangements and hides the entries of every type not chosen', async ({ page }) => {
  await openApp(page);
  await saveSection(page);
  await savedArrangement(page);
  await showLibrary(page);
  const pills = page.locator('.library .type-row button');
  expect((await pills.allTextContents()).at(-1)).toBe('Arrangement');
  await page.locator('.library .type-row [data-type="arrangement"]').click();
  await expect(heading(page, 'arrangements').locator('.library-group-count')).toHaveText('1');
  await expect(heading(page, 'sections').locator('.library-group-count')).toHaveText('0');
  await expect(heading(page, 'patterns').locator('.library-group-count')).toHaveText('0');
  await expect(page.locator('.library .pattern-list .pattern-item')).toHaveCount(0);
  // Section chosen instead: the Arrangement is hidden as any other type is.
  await page.locator('.library .type-row [data-type="arrangement"]').click();
  await page.locator('.library .type-row [data-type="section"]').click();
  await expect(heading(page, 'arrangements').locator('.library-group-count')).toHaveText('0');
  await expect(heading(page, 'sections').locator('.library-group-count')).toHaveText('1');
});

test('AC-20.1.5/3 — Choosing an Arrangement in the library opens it in Arrange as it was saved, asking first when an Arrangement never saved would be lost', async ({ page }) => {
  await openApp(page);
  await savedArrangement(page);
  const saved = (await stored(page))[0];
  // From Practice: the mode changes, and the Arrangement is on screen as saved.
  await mode(page, 'practice').click();
  await showLibrary(page);
  await page.locator('.library [data-action="open-arrangement"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'arrange');
  await expect(panel(page).locator('.arrange-title')).toHaveText('Arrangement — Sunday song');
  expect(await current(page)).toEqual(saved);
  await expect(entries(page)).toHaveCount(2);
  // A new one, never saved, with something in it: opening the saved one asks first.
  await panel(page).locator('[data-action="arrange-new"]').click();
  await addPattern(page, DJEMBE);
  await showLibrary(page);
  await page.locator('.library [data-action="open-arrangement"]').click();
  await expect(page.locator('.dialog')).toContainText('has not been saved');
  await page.locator('.dialog .dialog-button:not(.primary)').first().click();
  await expect(panel(page).locator('.arrange-title')).toHaveText('New Arrangement');
  await expect(palette(page)).toHaveCount(1);
  await showLibrary(page);
  await page.locator('.library [data-action="open-arrangement"]').click();
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(panel(page).locator('.arrange-title')).toHaveText('Arrangement — Sunday song');
  expect(await current(page)).toEqual(saved);
});
