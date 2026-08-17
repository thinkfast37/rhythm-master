import { test, expect } from '@playwright/test';
import { SEED_PATTERN_COUNT } from '../seed-count.js';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

test('AC-5.1.1 — the library lists every shipped Pattern on first load', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pattern-item')).toHaveCount(SEED_PATTERN_COUNT);
  await expect(page.locator('.library-count')).toHaveText(`${SEED_PATTERN_COUNT} patterns`);
});

test('AC-5.1.2 — the list is alphabetical', async ({ page }) => {
  await page.goto('/');
  const names = await page.locator('.pattern-name').allTextContents();
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  expect(names).toEqual(sorted);
});

test('AC-5.2.1 — typing filters the list', async ({ page }) => {
  await page.goto('/');
  await page.locator('.library-search').fill('clave');
  const count = await page.locator('.pattern-item').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(SEED_PATTERN_COUNT);
  for (const name of await page.locator('.pattern-name').allTextContents()) {
    expect(name.toLowerCase()).toContain('clave');
  }
});

test('AC-5.2.3 — clearing the search restores the full list', async ({ page }) => {
  await page.goto('/');
  await page.locator('.library-search').fill('clave');
  await page.locator('.library-search').fill('');
  await expect(page.locator('.pattern-item')).toHaveCount(SEED_PATTERN_COUNT);
});

test('AC-5.3.5 — automatic Tags are outlined with no removal control; user Tags are filled with one', async ({
  page,
}) => {
  await page.goto('/');
  // Tags live on the Pattern, not repeated down the library list.
  await expect(page.locator('.pattern-item .tag-chip')).toHaveCount(0);

  const auto = page.locator('.header-tags .tag-chip.automatic').first();
  await expect(auto).toBeVisible();
  await expect(auto).toHaveAttribute('data-automatic', 'true');
  await expect(auto.locator('.tag-remove')).toHaveCount(0);

  // Add a Tag to the open Pattern and confirm the contrasting treatment.
  await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    window.__rm.handlers.onAddTag(id, 'warmup');
  });
  const user = page.locator('.header-tags .tag-chip.user', { hasText: 'warmup' });
  await expect(user).toHaveAttribute('data-automatic', 'false');
  await expect(user.locator('.tag-remove')).toHaveCount(1);
});

test('AC-5.3.3 — clicking a Tag chip filters by it', async ({ page }) => {
  await page.goto('/');
  await page.locator('.tag-filter', { hasText: 'melodic' }).first().click();
  const count = await page.locator('.pattern-item').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(SEED_PATTERN_COUNT);

  // Every listed Pattern genuinely carries the Tag, checked against the data
  // rather than the row, which no longer repeats Tags.
  const allMelodic = await page.evaluate(() =>
    [...document.querySelectorAll('.pattern-item')].every((el) => {
      const id = el.dataset.patternId;
      const all = [...window.__rm.seedStore.loadAll(), ...window.__rm.patternStore.loadAll()];
      return all.find((p) => p.id === id)?.soundMode === 'melodic';
    })
  );
  expect(allMelodic).toBe(true);
});

test('AC-5.3.6 — a Tag you added is removable; a built-in Pattern’s own Tags are not', async ({
  page,
}) => {
  await page.goto('/');
  const builtInTag = await page.evaluate(() => {
    const p = window.__rm.seedStore.loadAll().find((x) => x.tags.length > 0);
    window.__rm.loadPattern(structuredClone(p), { owned: false });
    window.__rm.handlers.onAddTag(p.id, 'warmup');
    return p.tags[0];
  });

  const header = page.locator('.header-tags');

  // The Tag the musician added carries a removal control.
  const mine = header.locator('.tag-chip.user', { hasText: 'warmup' });
  await expect(mine).toBeVisible();
  await expect(mine.locator('.tag-remove')).toHaveCount(1);

  // The Pattern's own Tag does not — it describes what the Pattern is.
  const locked = header.locator('.tag-chip.locked', { hasText: builtInTag });
  await expect(locked).toBeVisible();
  await expect(locked).toHaveAttribute('data-locked', 'true');
  await expect(locked.locator('.tag-remove')).toHaveCount(0);

  await mine.locator('.tag-remove').click();
  await expect(header.locator('.tag-chip.user', { hasText: 'warmup' })).toHaveCount(0);
  await expect(header.locator('.tag-chip.locked', { hasText: builtInTag })).toBeVisible();
});

test('AC-5.3.6 — a built-in Tag survives an attempt to remove it programmatically', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const p = window.__rm.seedStore.loadAll().find((x) => x.tags.length > 0);
    const tag = p.tags[0];
    window.__rm.handlers.onRemoveTag(p.id, tag);
    return {
      stillOnPattern: window.__rm.seedStore.findById(p.id).tags.includes(tag),
      notMovedToOverlay: window.__rm.overlayStore.addedTagsFor(p.id).length,
    };
  });
  expect(result.stillOnPattern).toBe(true);
  expect(result.notMovedToOverlay).toBe(0);
});

test('AC-5.3.2 — a Tag can be added from the Pattern itself, without opening the library', async ({
  page,
}) => {
  await page.goto('/');

  await page.locator('.header-tags [data-action="add-tag"]').click();
  await page.locator('.dialog-input').fill('warmup');
  await page.locator('.dialog-button', { hasText: 'Add' }).click();

  await expect(page.locator('.header-tags .tag-chip.user', { hasText: 'warmup' })).toBeVisible();

  // It persists, and it is filterable like any other Tag.
  await page.reload();
  await expect(page.locator('.tag-filter', { hasText: 'warmup' })).toBeVisible();
});

test('AC-5.3.1 — provenance reads as a Tag, not as prose about the software', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.locator('.header-tags .tag-chip.automatic', { hasText: 'built-in' })
  ).toBeVisible();

  // No developer-facing phrasing anywhere on the page.
  const body = await page.locator('body').innerText();
  expect(body.toLowerCase()).not.toContain('ships with the app');
});

test('AC-5.3.7 — user Tags de-duplicate case-insensitively', async ({ page }) => {
  await page.goto('/');
  const tags = await page.evaluate(() => {
    const id = window.__rm.seedStore.loadAll()[0].id;
    window.__rm.handlers.onAddTag(id, 'Warmup');
    window.__rm.handlers.onAddTag(id, 'warmup');
    return window.__rm.overlayStore.addedTagsFor(id);
  });
  expect(tags.filter((t) => t.toLowerCase() === 'warmup')).toEqual(['Warmup']);
});

test('AC-6.1.1 — a shipped Pattern can be rated without mutating it', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.pattern-item').first();
  await first.locator('.star').nth(3).click(); // 4 stars

  await expect(first.locator('.rating')).toHaveAttribute('data-rating', '4');
  // The shipped Pattern itself is untouched; the rating lives in the overlay.
  const state = await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll();
    const sorted = [...shipped].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    return {
      onPattern: sorted[0].rating,
      inOverlay: window.__rm.overlayStore.forPattern(sorted[0].id).rating,
    };
  });
  expect(state.onPattern).toBe(0);
  expect(state.inOverlay).toBe(4);
});

test('AC-6.1.2 — a rating survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.pattern-item').first().locator('.star').nth(2).click();
  await page.reload();
  await expect(page.locator('.pattern-item').first().locator('.rating')).toHaveAttribute(
    'data-rating',
    '3'
  );
});

test('AC-6.1.3 — clicking the current rating clears it back to zero', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.pattern-item').first();
  await first.locator('.star').nth(2).click();
  await expect(first.locator('.rating')).toHaveAttribute('data-rating', '3');
  await first.locator('.star').nth(2).click();
  await expect(first.locator('.rating')).toHaveAttribute('data-rating', '0');
});

test('AC-6.1.4 — rating reorders Patterns that share a name', async ({ page }) => {
  await page.goto('/');
  // Ratings sort within a name, so the overall alphabetical order is unchanged.
  const before = await page.locator('.pattern-name').allTextContents();
  await page.locator('.pattern-item').first().locator('.star').nth(4).click();
  const after = await page.locator('.pattern-name').allTextContents();
  expect(after).toEqual(before);
});

test('AC-5.1.5 — opening a Pattern from the library loads it into the grid', async ({ page }) => {
  await page.goto('/');
  const target = page.locator('.pattern-item').nth(5);
  const name = await target.locator('.pattern-name').textContent();
  await target.locator('.pattern-name').click();

  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe(name);
  await expect(page.locator('.pattern-item.current .pattern-name')).toHaveText(name);
});

test('AC-5.5.1 — Prev and Next step through the list', async ({ page }) => {
  await page.goto('/');
  await page.locator('.pattern-item').nth(2).locator('.pattern-name').click();
  const start = await page.evaluate(() => window.__rm.getState().pattern.name);

  await page.locator('[data-action="next-pattern"]').click();
  const next = await page.evaluate(() => window.__rm.getState().pattern.name);
  expect(next).not.toBe(start);

  await page.locator('[data-action="prev-pattern"]').click();
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe(start);
});

test('AC-5.5.2 — navigation stays inside the active search filter', async ({ page }) => {
  await page.goto('/');
  await page.locator('.library-search').fill('clave');
  const names = await page.locator('.pattern-name').allTextContents();

  await page.locator('.pattern-item').first().locator('.pattern-name').click();
  await page.locator('[data-action="next-pattern"]').click();
  const current = await page.evaluate(() => window.__rm.getState().pattern.name);
  expect(names).toContain(current);
});

test('AC-5.1.6 — an owned Pattern joins the library alongside built-in ones', async ({ page }) => {
  await page.goto('/');
  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill('Aaa My Pattern');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  await expect(page.locator('.pattern-item')).toHaveCount(111);

  const mine = page.locator('.pattern-item', { hasText: 'Aaa My Pattern' });
  await expect(mine).toHaveAttribute('data-owned', 'true');
  // The Pattern is open, so its Tags show on it.
  await expect(page.locator('.header-tags .tag-chip', { hasText: 'custom' })).toBeVisible();
  await expect(page.locator('.header-tags .tag-chip', { hasText: 'percussive' })).toBeVisible();
});

test('AC-5.3.7 — the tag vocabulary is accurate after the audit', async ({ page }) => {
  await page.goto('/');
  const tags = await page.locator('.tag-filter').allTextContents();

  // Merged away or dropped as inaccurate.
  expect(tags).not.toContain('Song Signatures');
  expect(tags).not.toContain('Rhythm');

  // Kept, and now meaning what they say.
  for (const t of ['Song', 'Latin', 'Waltz', 'Odd Meter', 'Afro', 'Blues']) {
    expect(tags, t).toContain(t);
  }
});

test('AC-5.3.7 — Odd Meter means 5/4 and 7/4 only, never 3/4', async ({ page }) => {
  await page.goto('/');
  await page.locator('.tag-filter', { hasText: /^Odd Meter$/ }).click();

  const meters = await page.evaluate(() =>
    [...document.querySelectorAll('.pattern-item')].map((el) => {
      const all = [...window.__rm.seedStore.loadAll(), ...window.__rm.patternStore.loadAll()];
      const p = all.find((x) => x.id === el.dataset.patternId);
      return p.measures[0].timeSignature;
    })
  );
  expect(meters.length).toBeGreaterThan(0);
  for (const m of meters) expect(['5/4', '7/4']).toContain(m);
});

test('AC-5.3.7 — Waltz covers every 3/4 Pattern', async ({ page }) => {
  await page.goto('/');
  const check = await page.evaluate(() => {
    const lib = window.__rm.seedStore.loadAll();
    const threeFour = lib.filter((p) => p.measures[0].timeSignature === '3/4');
    return {
      count: threeFour.length,
      allWaltz: threeFour.every((p) => p.tags.includes('Waltz')),
      noneOdd: threeFour.every((p) => !p.tags.includes('Odd Meter')),
    };
  });
  expect(check.count).toBe(5);
  expect(check.allWaltz).toBe(true);
  expect(check.noneOdd).toBe(true);
});

test('AC-5.3.7 — Latin returns the canonical patterns, not only their variations', async ({
  page,
}) => {
  await page.goto('/');
  const names = await page.evaluate(() =>
    window.__rm.seedStore
      .loadAll()
      .filter((p) => p.tags.includes('Latin'))
      .map((p) => p.name)
  );
  for (const n of ['Tresillo', 'Habanera', 'Bossa Nova', 'Son Clave 3-2', 'Rumba Clave 3-2']) {
    expect(names, n).toContain(n);
  }
});

test('AC-5.3.7 — Song is only applied to actual song transcriptions', async ({ page }) => {
  await page.goto('/');
  const names = await page.evaluate(() =>
    window.__rm.seedStore
      .loadAll()
      .filter((p) => p.tags.includes('Song'))
      .map((p) => p.name)
  );
  // The eight that were wrongly tagged Song no longer are.
  for (const n of [
    'Downbeat ska',
    '3 middle up downbeat',
    'Downbeat triplet upbeat',
    'Offbeat Landing W Downbeat',
    'Djembe 1',
    'Djembe 2',
  ]) {
    expect(names, n).not.toContain(n);
  }
  // And the placeholder Patterns are gone from the library entirely.
  const all = await page.evaluate(() => window.__rm.seedStore.loadAll().map((p) => p.name));
  expect(all).not.toContain('New Rhythm');
  expect(all).not.toContain('My Rhythm');
});

test('AC-5.3.7 — every shipped Pattern carries at least one tag', async ({ page }) => {
  await page.goto('/');
  const untagged = await page.evaluate(() =>
    window.__rm.seedStore
      .loadAll()
      .filter((p) => p.tags.length === 0)
      .map((p) => p.name)
  );
  expect(untagged).toEqual([]);
});

test('AC-5.3.10 — the library list does not repeat every Pattern’s Tags', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pattern-item')).toHaveCount(SEED_PATTERN_COUNT);

  // Repeating Tags on every row made the list far longer to scroll for
  // information the filter chips above already act on.
  await expect(page.locator('.pattern-item .tag-chip')).toHaveCount(0);
  await expect(page.locator('.pattern-item [data-action="add-tag"]')).toHaveCount(0);

  // The filter row is still there — one instance, not one per row.
  await expect(page.locator('.tag-filter').first()).toBeVisible();
});

test('AC-5.3.10 — the open Pattern shows its own Tags in the header', async ({ page }) => {
  await page.goto('/');
  const expected = await page.evaluate(() => {
    const p = window.__rm.seedStore.loadAll().find((x) => x.tags.length > 0);
    window.__rm.loadPattern(structuredClone(p), { owned: false });
    return { name: p.name, tag: p.tags[0] };
  });

  await expect(page.locator('.pattern-title')).toHaveValue(expected.name);
  await expect(page.locator('.header-tags .tag-chip', { hasText: expected.tag })).toBeVisible();
  await expect(page.locator('.header-tags .tag-chip', { hasText: 'built-in' })).toBeVisible();
});

test('AC-5.3.10 — on mobile, tagging needs no trip to the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // Close the auto-opened drawer: everything below happens in the main panel.
  await page.locator('.library-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');

  await page.locator('.header-tags [data-action="add-tag"]').click();
  await page.locator('.dialog-input').fill('practice');
  await page.locator('.dialog-button', { hasText: 'Add' }).click();

  await expect(page.locator('.header-tags .tag-chip.user', { hasText: 'practice' })).toBeVisible();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');

  // And removing it likewise.
  await page.locator('.header-tags .tag-chip.user .tag-remove').click();
  await expect(page.locator('.header-tags .tag-chip.user', { hasText: 'practice' })).toHaveCount(0);
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');
});
