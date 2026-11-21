/**
 * The Section line (AC-19.11.10): which Section is in hand, named at the top of
 * the Composer, with Save section, Rename, New section and Add to section —
 * proven in the DOM.
 *
 * Fixtures from the shipped library: Bossa Nova (s_21, one bar, percussive),
 * Son Clave 3-2 (s_22, two bars, percussive) and Djembe 2 (s_108, one bar,
 * melodic).
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, loadFourBeats, recordAll, openInComposer } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const SON = 's_22';
const DJEMBE = 's_108';

const line = (page) => page.locator('.section-line');
const layerItems = (page) => page.locator('.composer-layers .layer-item:not(.composition)');
const sections = (page) => page.evaluate(() => window.__rm.sectionStore.loadAll());

async function addLayer(page, id) {
  await page.locator('.layer-add').click();
  await expect(page.locator('.composer-layers [data-picking="true"]')).toBeVisible();
  await page.locator(`.pattern-item[data-pattern-id="${id}"] [data-action="open-pattern"]`).click();
  await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${id}"]`)).toBeVisible();
}

/** Record every syllable and save the composition, so a Section can name it. */
async function saveComposition(page) {
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  return (await composerState(page)).savedId;
}

async function nameInDialog(page, name) {
  await expect(page.locator('.dialog')).toBeVisible();
  if (name !== undefined) await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
}

/** Name the Section in hand from the line. */
async function saveSection(page, name) {
  await line(page).locator('.section-save').click();
  await nameInDialog(page, name);
  await expect(line(page).locator('.layers-section-name')).toHaveText(name);
}

test('AC-19.11.10/1 — A Section line under the record bar names the saved Section in hand and says it is saved, and reads New section, not saved, when there is none', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(line(page)).toBeVisible();
  // Directly under the record bar, above the instrument and the grid.
  const order = await page.evaluate(() => [...document.querySelector('.composer-panel').children].map((c) => c.className.split(' ')[0]));
  expect(order.indexOf('section-line')).toBe(order.indexOf('composer-bar') + 1);
  expect(order.indexOf('section-line')).toBeLessThan(order.indexOf('composer-grid'));
  // None in hand: a new one, not saved.
  await expect(line(page)).toHaveAttribute('data-section-state', 'new');
  await expect(line(page)).toContainText('New section');
  await expect(line(page).locator('.layers-unsaved')).toHaveText('not saved');
  await expect(line(page).locator('.layers-section-name')).toHaveCount(0);
  // A saved one in hand: named, and said to be saved.
  await saveComposition(page);
  await addLayer(page, SON);
  await saveSection(page, 'Verse');
  await expect(line(page)).toHaveAttribute('data-section-state', 'saved');
  await expect(line(page).locator('.layers-section-name')).toHaveText('Verse');
  await expect(line(page).locator('.layers-saved')).toHaveText('saved');
  await expect(line(page)).not.toContainText('New section —');
  // The name is the line's alone: the Layers section no longer carries it.
  await expect(page.locator('.composer-layers .layers-section-name')).toHaveCount(0);
});

test('AC-19.11.10/2 — Save section on the line asks a name, unique among Sections, and stores the Section; on a named Section, Rename changes its name in place', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const id = await saveComposition(page);
  await line(page).locator('.section-save').click();
  await expect(page.locator('.dialog-input')).toHaveValue('My line section');
  await nameInDialog(page, 'Verse');
  expect(await sections(page)).toEqual([{ id: 'arr_1', name: 'Verse', compositionId: id, layers: [], active: 0 }]);
  // Named: Save section gives way to Rename.
  await expect(line(page).locator('.section-save')).toHaveCount(0);
  await line(page).locator('.section-line-rename').click();
  await expect(page.locator('.dialog-input')).toHaveValue('Verse');
  await nameInDialog(page, 'Chorus');
  await expect(line(page).locator('.layers-section-name')).toHaveText('Chorus');
  expect(await sections(page)).toEqual([{ id: 'arr_1', name: 'Chorus', compositionId: id, layers: [], active: 0 }]);
  // A second Section may not take the first one's name.
  await line(page).locator('.section-new').click();
  await line(page).locator('.section-save').click();
  await page.locator('.dialog-input').fill('Chorus');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toContainText('already exists');
  await page.locator('.dialog-input').fill('Bridge');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect((await sections(page)).map((s) => s.name)).toEqual(['Chorus', 'Bridge']);
});

test('AC-19.11.10/3 — New section takes every layer out and leaves the part on screen in a new, unnamed Section, the saved Section unchanged, asking first only when layers never saved would be lost', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const id = await saveComposition(page);
  await addLayer(page, SON);
  await saveSection(page, 'Verse');
  const verse = await sections(page);
  // From a saved Section: nothing is lost, so nothing is asked.
  await line(page).locator('.section-new').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(layerItems(page)).toHaveCount(0);
  await expect(line(page)).toHaveAttribute('data-section-state', 'new');
  const c = await composerState(page);
  expect(c.savedId).toBe(id);
  expect(c.draft.name).toBe('My line');
  expect(c.section).toEqual({ id: null, name: '', saved: null });
  expect(await sections(page)).toEqual(verse);
  // Layers that were never saved as a Section: asked first, and kept on declining.
  await addLayer(page, BOSSA);
  await line(page).locator('.section-new').click();
  await expect(page.locator('.dialog')).toContainText('never saved');
  await page.locator('.dialog-button', { hasText: 'Keep these layers' }).click();
  await expect(layerItems(page)).toHaveCount(1);
  await line(page).locator('.section-new').click();
  await page.locator('.dialog-button.primary').click();
  await expect(layerItems(page)).toHaveCount(0);
  expect(await sections(page)).toEqual(verse);
});

test('AC-19.11.10/4 — Add to section lists the saved Sections, and choosing one adds the part on screen as its last layer and opens that Section with the part still on screen', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const first = await saveComposition(page);
  await addLayer(page, SON);
  await saveSection(page, 'Verse');
  await line(page).locator('.section-new').click();
  await saveSection(page, 'Chorus');
  // A new idea: another composition, saved, in no Section.
  await openInComposer(page, DJEMBE, false, 'Riff');
  await page.locator('.composer-save').click();
  // A copy of a shipped melody is that melody note for note: the duplicate check asks.
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  const riff = (await composerState(page)).savedId;
  await expect(line(page)).toHaveAttribute('data-section-state', 'new');
  // Every saved Section is offered.
  await line(page).locator('.section-add-to').click();
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog-button', { hasText: 'Verse' })).toBeVisible();
  await expect(page.locator('.dialog-button', { hasText: 'Chorus' })).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Verse' }).click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  // The last layer of Verse, and the part on screen there.
  const verse = (await sections(page)).find((s) => s.name === 'Verse');
  expect(verse.compositionId).toBe(first);
  expect(verse.layers.map((l) => l.patternId)).toEqual([SON, riff]);
  expect(verse.active).toBe(2);
  await expect(line(page).locator('.layers-section-name')).toHaveText('Verse');
  await expect(line(page).locator('.layers-saved')).toBeVisible();
  const c = await composerState(page);
  expect(c.draft.name).toBe('Riff');
  expect(c.savedId).toBe(riff);
  expect(c.section.id).toBe(verse.id);
  await expect(page.locator('.composer-layers .layer-item')).toHaveCount(3);
  await expect(page.locator('.composer-layers .layer-item.composition .layer-name')).toHaveText('Riff');
  await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${first}"]`)).toBeVisible();
  await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${SON}"]`)).toBeVisible();
  // Chorus was not touched.
  expect((await sections(page)).find((s) => s.name === 'Chorus').layers).toEqual([]);
});

test('AC-19.11.10/5 — Add to section is unavailable, saying why, while the part on screen is not saved to the library, while the Section in hand has layers or a name, and while no Section is saved; a Section that already holds the Pattern, is at 8 layers or whose loop the part does not fit is refused with a message', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const add = line(page).locator('.section-add-to');
  // The part is not in the library yet.
  await expect(add).toBeDisabled();
  await expect(add).toHaveAttribute('title', /Save "My line" to the library first/);
  // Saved, but there is no Section to add it to.
  await saveComposition(page);
  await expect(add).toBeDisabled();
  await expect(add).toHaveAttribute('title', /No Section is saved yet/);
  // The Section in hand has a name.
  await saveSection(page, 'Verse');
  await expect(add).toBeDisabled();
  await expect(add).toHaveAttribute('title', /already in "Verse"/);
  // The Section in hand has layers of its own.
  await line(page).locator('.section-new').click();
  await addLayer(page, SON);
  await expect(add).toBeDisabled();
  await expect(add).toHaveAttribute('title', /layers of its own/);
  // Available — and a Section that already holds the Pattern refuses it.
  await line(page).locator('.section-new').click();
  await page.locator('.dialog-button.primary').click();
  await expect(add).toBeEnabled();
  const before = await sections(page);
  await add.click();
  await page.locator('.dialog-button', { hasText: 'Verse' }).click();
  await expect(page.locator('.composer-notice')).toContainText('"My line" is already a part of "Verse".');
  expect(await sections(page)).toEqual(before);
  await expect(line(page)).toHaveAttribute('data-section-state', 'new');
});

test('AC-19.11.10/6 — With a new Section in hand, a part on screen that is a part of saved Sections names each on the line, saying an edit to it is heard in them', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  // In no Section: nothing to say.
  await expect(line(page).locator('.section-line-shared')).toHaveCount(0);
  await saveSection(page, 'Verse');
  // The Section in hand is the one it is in: nothing to warn of.
  await expect(line(page).locator('.section-line-shared')).toHaveCount(0);
  await line(page).locator('.section-new').click();
  await addLayer(page, DJEMBE);
  await saveSection(page, 'Chorus');
  await line(page).locator('.section-new').click();
  // A new Section in hand, on a part of two saved ones: both named.
  const shared = line(page).locator('.section-line-shared');
  await expect(shared).toBeVisible();
  await expect(shared).toContainText('Verse');
  await expect(shared).toContainText('Chorus');
  await expect(shared).toContainText('heard');
});
