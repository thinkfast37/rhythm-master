/**
 * Filter the library by type (US-5.7): the type pills, what they leave in each
 * group, and saved Chains as a group of the library — proven in the DOM.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, loadFourBeats, recordAll, leaveComposer } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const pill = (page, type) => page.locator(`.library .type-row [data-type="${type}"]`);
const heading = (page, group) => page.locator(`.library .library-group-toggle[data-group="${group}"]`);
const count = (page, group) => heading(page, group).locator('.library-group-count');
const rows = (page) => page.locator('.library .pattern-list .pattern-item');
const rowIds = (page) => rows(page).evaluateAll((els) => els.map((e) => e.dataset.patternId));

/** The shipped Patterns' ids by type, as the app's own library reads them. */
const shippedByType = (page) =>
  page.evaluate(() => {
    const out = { percussive: [], melodic: [], progression: [] };
    for (const p of window.__rm.seedStore.loadAll()) {
      const type = p.soundMode !== 'melodic' ? 'percussive' : p.harmony?.chords?.length ? 'progression' : 'melodic';
      out[type].push(p.id);
    }
    return out;
  });

async function showLibrary(page) {
  if (!(await heading(page, 'patterns').isVisible())) await page.locator('.library-toggle').click();
  await expect(heading(page, 'patterns')).toBeVisible();
}

/** A saved Section: a recorded composition with Bossa Nova under it. Leaves the Composer. */
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
  await leaveComposer(page);
}

/** A saved Chain over the first shipped Pattern that carries a progression. Reloads so the library reads it. */
async function saveChain(page, name = 'Bossa bed') {
  const over = await page.evaluate((n) => {
    const p = window.__rm.seedStore.loadAll().find((x) => x.soundMode === 'melodic' && x.harmony?.chords?.length);
    window.__rm.chainStore.upsert({ name: n, sections: [{ patternId: p.id, entries: [{ fill: 'alberti', repeats: 1 }] }] });
    return { id: p.id, name: p.name };
  }, name);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await showLibrary(page);
  return over;
}

// --- AC-5.7.1: the pills -----------------------------------------------------------

test('AC-5.7.1/1 — The library shows a row of type pills — All, Percussive, Melodic composition, Chord progression, Chain, Section and Arrangement — above the rating and Tag filters, with All pressed while no type is chosen', async ({ page }) => {
  await openApp(page);
  await showLibrary(page);
  const row = page.locator('.library .type-row');
  await expect(row.locator('button')).toHaveText(['All', 'Percussive', 'Melodic composition', 'Chord progression', 'Chain', 'Section', 'Arrangement']);
  await expect(pill(page, 'all')).toHaveAttribute('aria-pressed', 'true');
  await expect(row.locator('[aria-pressed="true"]')).toHaveCount(1);
  // Above the rating filter and the Tag filters.
  const y = async (selector) => (await page.locator(selector).first().boundingBox()).y;
  expect(await y('.library .type-row')).toBeLessThan(await y('.library .rating-filter'));
  expect(await y('.library .rating-filter')).toBeLessThanOrEqual(await y('.library .tag-row'));
  // A type chosen: All is no longer pressed.
  await pill(page, 'percussive').click();
  await expect(pill(page, 'percussive')).toHaveAttribute('aria-pressed', 'true');
  await expect(pill(page, 'all')).toHaveAttribute('aria-pressed', 'false');
});

test('AC-5.7.1/2 — Choosing a type shows only the entries of that type in every group, choosing another adds its entries, choosing a pressed one takes its entries away again, and All clears the choice', async ({ page }) => {
  await openApp(page);
  await saveSection(page);
  await saveChain(page);
  const shipped = await shippedByType(page);
  const everything = await rows(page).count();
  await expect(count(page, 'sections')).toHaveText('1');
  await expect(count(page, 'chains')).toHaveText('1');

  // Chord progression: exactly the Patterns that carry one, and no Section or Chain.
  await pill(page, 'progression').click();
  const shown = await rowIds(page);
  expect(shown.filter((id) => id.startsWith('s_')).sort()).toEqual([...shipped.progression].sort());
  expect(shown.some((id) => shipped.percussive.includes(id) || shipped.melodic.includes(id))).toBe(false);
  await expect(count(page, 'patterns')).toHaveText(String(shown.length));
  await expect(count(page, 'sections')).toHaveText('0');
  await expect(count(page, 'chains')).toHaveText('0');
  await expect(page.locator('.library-sections .section-entry-name')).toHaveCount(0);

  // Section added: the Section is back beside the progressions.
  await pill(page, 'section').click();
  await expect(count(page, 'sections')).toHaveText('1');
  await expect(count(page, 'chains')).toHaveText('0');
  expect(await rowIds(page)).toEqual(shown);

  // Chord progression taken away again: Sections alone, and no Pattern.
  await pill(page, 'progression').click();
  await expect(pill(page, 'progression')).toHaveAttribute('aria-pressed', 'false');
  await expect(rows(page)).toHaveCount(0);
  await expect(count(page, 'patterns')).toHaveText('0');
  await expect(count(page, 'sections')).toHaveText('1');

  // Chain alone.
  await pill(page, 'section').click();
  await pill(page, 'chain').click();
  await expect(count(page, 'chains')).toHaveText('1');
  await expect(count(page, 'sections')).toHaveText('0');
  await expect(rows(page)).toHaveCount(0);

  // All: everything back, and nothing else pressed.
  await pill(page, 'all').click();
  await expect(page.locator('.library .type-row [aria-pressed="true"]')).toHaveCount(1);
  await expect(rows(page)).toHaveCount(everything);
  await expect(count(page, 'sections')).toHaveText('1');
  await expect(count(page, 'chains')).toHaveText('1');
});

test('AC-5.7.1/3 — The type choice narrows together with the search, the rating filter and the Tag filters, and Prev/Next step through the Patterns it leaves: in the library pane', async ({ page }) => {
  await openApp(page);
  await showLibrary(page);
  const shipped = await shippedByType(page);
  await pill(page, 'progression').click();
  const progressions = await rowIds(page);
  expect(progressions.length).toBe(shipped.progression.length);
  // With a Tag: fewer still, every one a progression carrying the Tag.
  const tag = page.locator('.library .tag-filter[data-tag="melodic"]');
  await tag.click();
  expect(await rowIds(page)).toEqual(progressions);
  await tag.click();
  // With the search.
  const first = await rows(page).first().locator('[data-action="open-pattern"]').textContent();
  await page.locator('.library-search').fill(first.trim());
  const found = await rowIds(page);
  expect(found.length).toBeGreaterThan(0);
  expect(found.every((id) => progressions.includes(id))).toBe(true);
  await page.locator('.library-search').fill('');
  // With the rating filter: nothing shipped is rated five stars.
  await page.locator('.library .rating-option[data-min="5"]').click();
  await expect(rows(page)).toHaveCount(0);
  await page.locator('.library .rating-option[data-min="0"]').click();
  expect(await rowIds(page)).toEqual(progressions);

  // Next steps through the progressions alone, in the order listed.
  await rows(page).first().locator('[data-action="open-pattern"]').click();
  const visited = [await page.evaluate(() => window.__rm.getState().pattern.id)];
  for (let i = 0; i < Math.min(3, progressions.length - 1); i++) {
    await page.locator('[data-action="next-pattern"]').first().click();
    visited.push(await page.evaluate(() => window.__rm.getState().pattern.id));
  }
  expect(visited).toEqual(progressions.slice(0, visited.length));
});

// --- AC-5.7.2: Chains in the library -------------------------------------------------

test('AC-5.7.2/1 — Saved Chains are a group of the library between Sections and Patterns, under a heading with its count that folds as the other groups do, and the group is not shown in the Composer', async ({ page }) => {
  await openApp(page);
  await showLibrary(page);
  await expect(heading(page, 'chains')).toHaveCount(0);
  await saveSection(page);
  await saveChain(page);
  await expect(heading(page, 'chains').locator('.library-group-name')).toHaveText('Chains');
  await expect(count(page, 'chains')).toHaveText('1');
  expect(await page.locator('.library .library-group-toggle').evaluateAll((els) => els.map((e) => e.dataset.group))).toEqual(['sections', 'chains', 'patterns']);
  // It folds as the others do, and is remembered.
  await heading(page, 'chains').click();
  await expect(heading(page, 'chains')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.library-chains .chain-entry')).toHaveCount(0);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')))).libraryFolded).toContain('chains');
  await heading(page, 'chains').click();
  await expect(page.locator('.library-chains .chain-entry')).toHaveCount(1);
  // Not in the Composer.
  await page.locator('.mode-switch [data-mode="composer"]').click();
  if (await page.locator('.dialog').isVisible()) await page.locator('.dialog .dialog-button:not(.primary)').first().click();
  await showLibrary(page);
  await expect(heading(page, 'chains')).toHaveCount(0);
  await expect(heading(page, 'sections')).toBeVisible();
});

test('AC-5.7.2/2 — A Chain is listed by its name with the name of the Pattern it plays over, and the search matches either', async ({ page }) => {
  await openApp(page);
  const over = await saveChain(page, 'Zebra crossing');
  const entry = page.locator('.library-chains .chain-entry');
  await expect(entry.locator('.chain-entry-name')).toHaveText('Zebra crossing');
  await expect(entry.locator('.chain-entry-pattern')).toContainText(over.name);
  await page.locator('.library-search').fill('zebra');
  await expect(entry).toHaveCount(1);
  await page.locator('.library-search').fill(over.name);
  await expect(entry).toHaveCount(1);
  await page.locator('.library-search').fill('no such thing anywhere');
  await expect(entry).toHaveCount(0);
  await expect(count(page, 'chains')).toHaveText('0');
});

test('AC-5.7.2/3 — Choosing a Chain opens the Pattern it plays over with the Chain loaded in the Compose group', async ({ page }) => {
  await openApp(page);
  const over = await saveChain(page, 'Bossa bed');
  expect(await page.evaluate(() => window.__rm.getState().pattern.id)).not.toBe(over.id);
  await page.locator('.library-chains [data-action="open-chain"]').click();
  expect(await page.evaluate(() => window.__rm.getState().pattern.id)).toBe(over.id);
  const compose = page.locator('[data-section="compose"]');
  await expect(compose).toBeVisible();
  await expect(compose.locator('.compose-section-head')).toContainText('Bossa bed');
  await expect(compose.locator('.compose-entry')).toHaveCount(1);
  await expect(compose.locator('.chain-item.current')).toHaveCount(1);
});

test('AC-5.7.1/4 — A Percussive Pattern is of the type Percussive, a Melodic Pattern that carries a progression is a Chord progression, and a Melodic Pattern without one is a Melodic composition: as the library lists them', async ({ page }) => {
  await openApp(page);
  await showLibrary(page);
  const shipped = await shippedByType(page);
  for (const type of ['percussive', 'melodic', 'progression']) {
    await pill(page, type).click();
    const shown = (await rowIds(page)).filter((id) => id.startsWith('s_'));
    expect(shown.sort(), type).toEqual([...shipped[type]].sort());
    await pill(page, type).click();
  }
  // One Pattern of the musician's own, moving between the three as it changes.
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.grid .slot[data-beat="0"][data-slot="0"]').click();
  const id = await page.evaluate(() => window.__rm.getState().pattern.id);
  const listedUnder = async (type) => {
    await showLibrary(page);
    await pill(page, 'all').click();
    await pill(page, type).click();
    return (await rowIds(page)).includes(id);
  };
  expect(await listedUnder('percussive')).toBe(true);
  expect(await listedUnder('melodic')).toBe(false);
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  expect(await listedUnder('melodic')).toBe(true);
  expect(await listedUnder('percussive')).toBe(false);
  expect(await listedUnder('progression')).toBe(false);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  expect(await listedUnder('progression')).toBe(true);
  expect(await listedUnder('melodic')).toBe(false);
});
