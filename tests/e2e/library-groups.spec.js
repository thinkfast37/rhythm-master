/**
 * The library's groups (AC-5.1.8): Sections ahead of Patterns, each under a
 * heading that counts its entries and folds it away — proven in the DOM.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, appState, loadFourBeats, recordAll, leaveComposer } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const heading = (page, group) => page.locator(`.library .library-group-toggle[data-group="${group}"]`);
const rows = (page) => page.locator('.library .pattern-list .pattern-item');
const settings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1') ?? '{}'));

/** A saved Section: a recorded composition with Bossa Nova under it. */
async function saveSection(page, name = 'Evening bed') {
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  await page.locator('.layer-add').click();
  await page.locator(`.pattern-item[data-pattern-id="${BOSSA}"] [data-action="open-pattern"]`).click();
  await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${BOSSA}"]`)).toBeVisible();
  await page.locator('.section-save').click();
  await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await showLibrary(page);
}

/** The library pane closes when a layer is picked from it: open it again. */
async function showLibrary(page) {
  if (!(await page.locator('.library .library-group-toggle[data-group="patterns"]').isVisible())) await page.locator('.library-toggle').click();
  await expect(page.locator('.library .library-group-toggle[data-group="patterns"]')).toBeVisible();
}

test('AC-5.1.8/1 — The library list is in groups, Sections ahead of Chains ahead of Patterns, each under a heading naming the group and how many entries it shows, and the Sections group and the Chains group are each absent while none is saved', async ({ page }) => {
  await openApp(page);
  // No Section saved: the Patterns group alone, counting its rows.
  await expect(heading(page, 'sections')).toHaveCount(0);
  await expect(heading(page, 'patterns')).toBeVisible();
  await expect(heading(page, 'patterns').locator('.library-group-name')).toHaveText('Patterns');
  const total = await rows(page).count();
  expect(total).toBeGreaterThan(50);
  await expect(heading(page, 'patterns').locator('.library-group-count')).toHaveText(String(total));

  await saveSection(page);
  await expect(heading(page, 'sections')).toBeVisible();
  await expect(heading(page, 'sections').locator('.library-group-name')).toHaveText('Sections');
  await expect(heading(page, 'sections').locator('.library-group-count')).toHaveText('1');
  await expect(page.locator('.library-sections .section-entry-name')).toHaveText(['Evening bed']);
  // Sections first, then Patterns: both headings in the pane, in that order.
  const order = await page.locator('.library .library-group-toggle').evaluateAll((els) => els.map((e) => e.dataset.group));
  expect(order).toEqual(['sections', 'patterns']);
  // Revised 2026-11-20 with US-5.7: no Chain saved, no Chains group; one saved, it sits between the two.
  await expect(heading(page, 'chains')).toHaveCount(0);
  await page.evaluate(() => {
    const over = window.__rm.seedStore.loadAll().find((x) => x.soundMode === 'melodic' && x.harmony?.chords?.length);
    window.__rm.chainStore.upsert({ name: 'Bed', sections: [{ patternId: over.id, entries: [{ fill: 'alberti', repeats: 1 }] }] });
  });
  await leaveComposer(page);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await showLibrary(page);
  await expect(heading(page, 'chains').locator('.library-group-count')).toHaveText('1');
  expect(await page.locator('.library .library-group-toggle').evaluateAll((els) => els.map((e) => e.dataset.group))).toEqual(['sections', 'chains', 'patterns']);
  const s = await heading(page, 'sections').boundingBox();
  const p = await heading(page, 'patterns').boundingBox();
  expect(s.y).toBeLessThan(p.y);
  // The Patterns' count is the rows under it: the composition joined the library.
  await expect(heading(page, 'patterns').locator('.library-group-count')).toHaveText(String(await rows(page).count()));
});

test("AC-5.1.8/2 — Tapping a group's heading folds the group, hiding its entries and leaving the heading, and tapping it again opens it; the heading says which it is", async ({ page }) => {
  await openApp(page);
  await saveSection(page);
  const total = await rows(page).count();

  await expect(heading(page, 'patterns')).toHaveAttribute('aria-expanded', 'true');
  await heading(page, 'patterns').click();
  await expect(heading(page, 'patterns')).toHaveAttribute('aria-expanded', 'false');
  await expect(heading(page, 'patterns').locator('.library-group-state')).toHaveText('hidden');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('.library .pattern-list')).toBeHidden();
  await expect(heading(page, 'patterns')).toBeVisible();
  // The other group is untouched.
  await expect(page.locator('.library-sections .section-entry')).toHaveCount(1);

  await heading(page, 'sections').click();
  await expect(heading(page, 'sections')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.library-sections .section-entry')).toHaveCount(0);
  await expect(heading(page, 'sections')).toBeVisible();
  await expect(heading(page, 'sections').locator('.library-group-count')).toHaveText('1');

  await heading(page, 'patterns').click();
  await expect(heading(page, 'patterns')).toHaveAttribute('aria-expanded', 'true');
  await expect(heading(page, 'patterns').locator('.library-group-state')).toHaveText('');
  await expect(rows(page)).toHaveCount(total);
  await heading(page, 'sections').click();
  await expect(page.locator('.library-sections .section-entry-name')).toHaveText(['Evening bed']);
});

test('AC-5.1.8/3 — Which groups are folded is remembered in `rm.settings.v1` and is in force after a reload', async ({ page }) => {
  await openApp(page);
  await saveSection(page);
  expect((await settings(page)).libraryFolded ?? []).toEqual([]);
  await heading(page, 'sections').click();
  await expect(heading(page, 'sections')).toHaveAttribute('aria-expanded', 'false');
  expect((await settings(page)).libraryFolded).toEqual(['sections']);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await showLibrary(page);
  await expect(heading(page, 'sections')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.library-sections .section-entry')).toHaveCount(0);
  await expect(heading(page, 'patterns')).toHaveAttribute('aria-expanded', 'true');
  expect(await rows(page).count()).toBeGreaterThan(50);

  await heading(page, 'patterns').click();
  await heading(page, 'sections').click();
  expect((await settings(page)).libraryFolded).toEqual(['patterns']);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await showLibrary(page);
  await expect(heading(page, 'patterns')).toHaveAttribute('aria-expanded', 'false');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator('.library-sections .section-entry')).toHaveCount(1);
});

test("AC-5.1.8/4 — Folding hides and never filters: the search and the Tag filters change a folded group's count as they do an open one's, and Prev/Next step through the Patterns whether or not their group is folded", async ({ page }) => {
  await openApp(page);
  await saveSection(page);
  await leaveComposer(page);
  await expect(page.locator('.composer-panel')).toBeHidden();
  await showLibrary(page);
  const count = async (group) => Number(await heading(page, group).locator('.library-group-count').textContent());
  const total = await count('patterns');

  // Open: what the search and a Tag leave.
  await page.locator('.library-search').fill('bossa');
  const searched = await count('patterns');
  expect(searched).toBeGreaterThan(0);
  expect(searched).toBeLessThan(total);
  await expect(rows(page)).toHaveCount(searched);
  await page.locator('.library-search').fill('');
  await page.locator('.library .tag-filter[data-tag="percussive"]').click();
  const tagged = await count('patterns');
  expect(tagged).toBeLessThan(total);
  await expect(rows(page)).toHaveCount(tagged);
  await page.locator('.library .tag-clear').click();
  expect(await count('patterns')).toBe(total);

  // Folded: the same counts, with no row shown.
  await heading(page, 'patterns').click();
  await heading(page, 'sections').click();
  await expect(rows(page)).toHaveCount(0);
  expect(await count('patterns')).toBe(total);
  await page.locator('.library-search').fill('bossa');
  await expect(heading(page, 'patterns').locator('.library-group-count')).toHaveText(String(searched));
  // A Section is searched by its parts' names: Bossa Nova is one of this one's.
  await expect(heading(page, 'sections').locator('.library-group-count')).toHaveText('1');
  await page.locator('.library-search').fill('no such thing');
  await expect(heading(page, 'patterns').locator('.library-group-count')).toHaveText('0');
  await expect(heading(page, 'sections').locator('.library-group-count')).toHaveText('0');
  await page.locator('.library-search').fill('');
  await page.locator('.library .tag-filter[data-tag="percussive"]').click();
  await expect(heading(page, 'patterns').locator('.library-group-count')).toHaveText(String(tagged));
  await expect(rows(page)).toHaveCount(0);

  // Prev/Next still step through the filtered Patterns, folded as they are.
  const first = (await appState(page)).pattern.id;
  await page.locator('[data-action="next-pattern"]').click();
  const second = (await appState(page)).pattern;
  expect(second.id).not.toBe(first);
  expect(second.soundMode).toBe('percussive');
  await page.locator('[data-action="next-pattern"]').click();
  const third = (await appState(page)).pattern;
  expect(third.id).not.toBe(second.id);
  expect(third.soundMode).toBe('percussive');
  await page.locator('[data-action="prev-pattern"]').click();
  expect((await appState(page)).pattern.id).toBe(second.id);
  // Unfolded, the rows are the ones the count named.
  await heading(page, 'patterns').click();
  await expect(rows(page)).toHaveCount(tagged);
});
