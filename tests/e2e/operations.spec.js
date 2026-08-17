import { test, expect } from '@playwright/test';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

/** Create an owned Pattern by editing a shipped one and naming the copy. */
async function makeOwned(page, name = 'Mine') {
  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
}

test('AC-7.4.1 — Make Copy creates a second, independent Pattern', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Original');

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('The Copy');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  // The copy is note-for-note identical, so the duplicate warning fires first.
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();

  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('The Copy');
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(2);
});

test('AC-7.4.2 — editing a copy leaves the original untouched', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Original');
  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('The Copy');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();

  await page.locator('.slot[data-beat="0"][data-slot="1"]').click();

  const both = await page.evaluate(() => {
    const all = window.__rm.patternStore.loadAll();
    return all.map((p) => ({
      name: p.name,
      on: p.measures[0].beats[0].slots[1].on,
    }));
  });
  expect(both.find((p) => p.name === 'Original').on).toBe(false);
  expect(both.find((p) => p.name === 'The Copy').on).toBe(true);
});

test('AC-11.1.3 — Duplicate warning fires only at Pattern-creation moments: Make Copy', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Original');

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('Same Notes');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  await expect(page.locator('.dialog-message')).toContainText('note-for-note identical');
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(2);
});

test('AC-7.5.1 — Delete removes an owned Pattern permanently', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Doomed');

  await page.locator('[data-action="delete-pattern"]').click();
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();

  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);
  await page.reload();
  await expect(page.locator('.pattern-item', { hasText: 'Doomed' })).toHaveCount(0);
});

test('AC-7.5.2 — a shipped Pattern offers no Delete control at all', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await expect(page.locator('[data-action="delete-pattern"]')).toHaveCount(0);
});

test('AC-7.5.3 — deleting a Pattern drops its Local Metadata with it', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Doomed');
  await page.locator('[data-action="submit-pattern"]').click();

  const before = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return Boolean(window.__rm.localMetaStore.forPattern(id).submittedAt);
  });
  expect(before).toBe(true);

  const id = await page.evaluate(() => window.__rm.getState().pattern.id);
  await page.locator('[data-action="delete-pattern"]').click();
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();

  const after = await page.evaluate((pid) => window.__rm.localMetaStore.forPattern(pid), id);
  expect(after).toEqual({});
});

test('AC-10.1.1 — Double Length duplicates the Pattern’s own Measures', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Doubler');
  const before = await page.evaluate(() => window.__rm.getState().pattern.measures.length);

  await page.locator('[data-action="duplicate-pattern"]').click();
  const after = await page.evaluate(() => window.__rm.getState().pattern.measures.length);
  expect(after).toBe(before * 2);
  await expect(page.locator('.measure')).toHaveCount(after);
});

test('AC-10.1.2 — Double Length is unavailable when it would exceed the Measure cap', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Big');
  // Grow to 4 Measures; doubling would make 8, over the cap of 6.
  for (let i = 0; i < 3; i++) await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('.measure')).toHaveCount(4);
  await expect(page.locator('[data-action="duplicate-pattern"]')).toBeDisabled();
});

test('AC-8.1.1 — Append adds another Pattern’s Measures after this one', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Base');
  const before = await page.evaluate(() => window.__rm.getState().pattern.measures.length);

  await page.locator('[data-action="append-pattern"]').click();
  // The first option in the list is a real Pattern.
  await page.locator('.dialog-button').first().click();

  const after = await page.evaluate(() => window.__rm.getState().pattern.measures.length);
  expect(after).toBeGreaterThan(before);
});

test('AC-8.1.2 — Append is unavailable once the Pattern is at the Measure cap', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Full');
  for (let i = 0; i < 5; i++) await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('.measure')).toHaveCount(6);
  await expect(page.locator('[data-action="append-pattern"]')).toBeDisabled();
  await expect(page.locator('[data-action="add-measure"]')).toBeDisabled();
});

test('AC-12.1.1 — Export MIDI produces a downloadable .mid named after the Pattern', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Export Me');

  const download = page.waitForEvent('download');
  await page.locator('[data-action="export-midi"]').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('export-me.mid');
});

test('AC-13.1.1 — Submit builds a GitHub issue URL and records the submission locally', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Contribute Me');

  const result = await page.evaluate(() => window.__rm.handlers.onSubmit());
  expect(result.url).toContain('https://github.com/');
  expect(result.url).toContain('labels=new-pattern');
  expect(result.body).toContain('### Pattern: Contribute Me');

  const meta = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return window.__rm.localMetaStore.forPattern(id);
  });
  expect(meta.submittedAt).toBeTruthy();
  // Submission history is Local Metadata, never Pattern data (FR-006).
  const pattern = await page.evaluate(() => window.__rm.getState().pattern);
  expect(pattern).not.toHaveProperty('submittedAt');
});

test('AC-11.2.1 — Family match criteria: a melodic variant surfaces as a Family, not a duplicate', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'Rhythm');
  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('Melodic Version');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();
  await page.locator('.sound-mode').selectOption('melodic');

  const result = await page.evaluate(() => ({
    family: window.__rm.currentFamily().map((p) => p.name),
    duplicates: window.__rm.currentDuplicates().map((p) => p.name),
  }));
  expect(result.family).toContain('Rhythm');
  expect(result.duplicates).not.toContain('Rhythm');
});

test('AC-11.3.1 — a Pattern the library has since duplicated prompts once, then never again', async ({ page }) => {
  await page.goto('/');
  // Make an owned Pattern note-for-note identical to a shipped one.
  await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll()[0];
    const mine = { ...structuredClone(shipped), id: 'p_dupe', name: 'My Copy' };
    window.__rm.patternStore.upsert(mine);
  });

  const pending = await page.evaluate(() =>
    window.__rm.unresolvedLibraryDuplicates().map((d) => d.owned.name)
  );
  expect(pending).toEqual(['My Copy']);

  // Answering the prompt records the resolution as Local Metadata.
  await page.evaluate(() => window.__rm.localMetaStore.update('p_dupe', { duplicateResolved: true }));
  const after = await page.evaluate(() => window.__rm.unresolvedLibraryDuplicates().length);
  expect(after).toBe(0);

  // And the resolution never becomes part of the Pattern (FR-006).
  const stored = await page.evaluate(() => window.__rm.patternStore.findById('p_dupe'));
  expect(stored).not.toHaveProperty('duplicateResolved');
});
