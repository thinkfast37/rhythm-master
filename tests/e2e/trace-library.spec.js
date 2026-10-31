import { test, expect } from '@playwright/test';

/*
 * Library, Tags and Rating criteria (US-5.3, US-6.1), each proven through the
 * page itself: the header's Tag chips, the filter pills, the Rating stars and
 * the Rating filter, as the musician sees them.
 */

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

const header = (page) => page.locator('.header-tags');
const headerTags = (page) => header(page).locator('.tag-chip');

/** The Tag chips the open Pattern's header shows, by text. */
async function headerTagNames(page) {
  return (await headerTags(page).allTextContents()).map((t) => t.replace('×', '').trim());
}

/** Starts a fresh owned Pattern through the library's own "+ New Pattern" control. */
async function newPattern(page) {
  await page.locator('[data-action="new-pattern"]').first().click();
  await expect(page.locator('.pattern-title')).toHaveValue('New Pattern');
}

/** Opens the library drawer if loading a Pattern closed it. */
async function openLibrary(page) {
  if (!(await page.locator('.library-search').isVisible())) await page.locator('.library-toggle').click();
  await expect(page.locator('.library-search')).toBeVisible();
}

/** Renames the open Pattern through the header's name field. */
async function rename(page, name) {
  const field = page.locator('input.pattern-title');
  await field.fill(name);
  await field.press('Enter');
  await expect(field).toHaveValue(name);
}

/** Moves the swing control — Pattern-wide (AC-4.4.12) — to `amount`. */
async function setSwing(page, amount) {
  await page.evaluate((n) => {
    const slider = document.querySelector('.swing-slider');
    slider.value = String(n);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, amount);
}

/** Adds a Tag through the header's "+ tag" control and its dialog. */
async function addTagFromHeader(page, name) {
  await header(page).locator('[data-action="add-tag"]').click();
  await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button', { hasText: 'Add' }).click();
}

// --- US-5.3 — automatic Tags ------------------------------------------------

test('AC-5.3.1 — Auto-tags recompute immediately on configuration change', async ({ page }) => {
  await page.goto('/');
  await newPattern(page);
  await rename(page, 'New Groove');

  // Percussive, swing 0 everywhere: `percussive`, and no `swing`.
  expect(await headerTagNames(page)).toContain('percussive');
  expect(await headerTagNames(page)).not.toContain('swing');

  // Switched to Melodic and swung — no tagging action taken.
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await setSwing(page, 40);

  await expect(header(page).locator('.tag-chip.automatic', { hasText: /^melodic$/ })).toBeVisible();
  await expect(header(page).locator('.tag-chip.automatic', { hasText: /^swing$/ })).toBeVisible();
  await expect(header(page).locator('.tag-chip', { hasText: /^percussive$/ })).toHaveCount(0);

  // The library sees the same Tags: the Pattern filters under both.
  await openLibrary(page);
  await page.locator('.tag-filter', { hasText: /^melodic$/ }).click();
  await page.locator('.tag-filter', { hasText: /^swing$/ }).click();
  await expect(page.locator('.pattern-item', { hasText: 'New Groove' })).toHaveCount(1);
});

test('AC-5.3.2 — `custom` is permanent, set once at creation', async ({ page }) => {
  await page.goto('/');
  await newPattern(page);
  await rename(page, 'My Test Pattern');

  const custom = header(page).locator('.tag-chip.automatic', { hasText: /^custom$/ });
  await expect(custom).toBeVisible();

  // Renamed, its rhythm rewritten, and saved — owned Patterns save on every
  // edit — several times over.
  await rename(page, 'Renamed Pattern');
  const slots = page.locator('.slot');
  const n = Math.min(await slots.count(), 6);
  for (let i = 0; i < n; i++) await slots.nth(i).click();
  await rename(page, 'Renamed Again');
  for (let i = 0; i < n; i += 2) await slots.nth(i).click();

  await expect(custom).toBeVisible();
  await expect(header(page).locator('.tag-chip', { hasText: /^built-in$/ })).toHaveCount(0);

  // And it is still there when the saved Pattern is read back.
  await page.reload();
  await openLibrary(page);
  await page.locator('.pattern-item', { hasText: 'Renamed Again' }).locator('.pattern-name').click();
  await expect(header(page).locator('.tag-chip.automatic', { hasText: /^custom$/ })).toBeVisible();
  await expect(
    page.locator('.pattern-item', { hasText: 'Renamed Again' }).locator('.pattern-provenance')
  ).toHaveText('Custom');
});

test('AC-5.3.3 — `percussive`/`melodic` always reflects current Sound Mode', async ({ page }) => {
  await page.goto('/');
  await newPattern(page);
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(header(page).locator('.tag-chip.automatic', { hasText: /^melodic$/ })).toBeVisible();
  await expect(header(page).locator('.tag-chip', { hasText: /^percussive$/ })).toHaveCount(0);

  await page.locator('.sound-mode [data-mode="percussive"]').click();
  await expect(header(page).locator('.tag-chip.automatic', { hasText: /^percussive$/ })).toBeVisible();
  await expect(header(page).locator('.tag-chip', { hasText: /^melodic$/ })).toHaveCount(0);
});

test('AC-5.3.4 — `swing` tracks live swing state: set by the swing control, removed at 0', async ({
  page,
}) => {
  await page.goto('/');
  await newPattern(page);
  const swingChip = header(page).locator('.tag-chip', { hasText: /^swing$/ });
  await expect(swingChip).toHaveCount(0);

  await setSwing(page, 25);
  await expect(swingChip).toHaveCount(1);

  await setSwing(page, 0);
  await expect(swingChip).toHaveCount(0);
});

test('AC-5.3.4 — `swing` tracks live swing state: one Subdivision Group swung carries it, and back to 0 removes it', async ({
  page,
}) => {
  await page.goto('/');
  // A Pattern whose only swing is one Subdivision Group's — per-group amounts
  // are data (AC-4.4.2); the control that reaches them is Pattern-wide and
  // moving it clears them (AC-4.4.12).
  await page.evaluate(() => {
    const p = window.__rm.handlers.onNewPattern();
    const swung = structuredClone(p);
    swung.measures[0].beats[0].swing = { 0: 25 };
    window.__rm.patternStore.upsert(swung);
    window.__rm.loadPattern(swung, { owned: true });
  });
  const swingChip = header(page).locator('.tag-chip', { hasText: /^swing$/ });
  await expect(swingChip).toHaveCount(1);

  await setSwing(page, 0);
  await expect(swingChip).toHaveCount(0);
  const stored = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return window.__rm.patternStore.findById(id).measures.flatMap((m) => m.beats.map((b) => b.swing ?? {}));
  });
  for (const groups of stored) for (const v of Object.values(groups)) expect(v).toBe(0);
});

test('AC-5.3.5 — Auto-tags are not user-removable and render distinctly', async ({ page }) => {
  await page.goto('/');

  // A Pattern carrying `swing` because one Subdivision Group has swing 25,
  // and a user-typed "warmup".
  await page.evaluate(() => {
    const p = window.__rm.handlers.onNewPattern();
    const swung = { ...structuredClone(p), tags: ['warmup'] };
    swung.measures[0].beats[0].swing = { 0: 25 };
    window.__rm.patternStore.upsert(swung);
    window.__rm.loadPattern(swung, { owned: true });
  });

  const swing = header(page).locator('.tag-chip', { hasText: /^swing$/ });
  const warmup = header(page).locator('.tag-chip', { hasText: 'warmup' });
  await expect(swing).toBeVisible();
  await expect(warmup).toBeVisible();

  // No removal control on the automatic Tag; the user Tag carries one.
  await expect(swing.locator('.tag-remove')).toHaveCount(0);
  await expect(warmup.locator('.tag-remove')).toHaveCount(1);
  await expect(warmup.locator('.tag-remove')).toHaveText('×');

  // Outlined versus filled: told apart by chip treatment, not colour alone.
  const look = (loc) =>
    loc.evaluate((n) => {
      const s = getComputedStyle(n);
      return { bg: s.backgroundColor, border: s.borderTopStyle };
    });
  const auto = await look(swing);
  const user = await look(warmup);
  expect(auto.bg).toBe('rgba(0, 0, 0, 0)');
  expect(auto.border).toBe('solid');
  expect(user.bg).not.toBe('rgba(0, 0, 0, 0)');

  // Nor does it gain one at any point — after the user Tag is removed, after a
  // reload — and the provenance reads as an automatic Tag.
  await warmup.locator('.tag-remove').click();
  await expect(header(page).locator('.tag-chip', { hasText: 'warmup' })).toHaveCount(0);
  await expect(swing.locator('.tag-remove')).toHaveCount(0);
  await expect(header(page).locator('.tag-chip.automatic', { hasText: /^custom$/ })).toBeVisible();
  await expect(header(page).locator('.tag-chip.automatic .tag-remove')).toHaveCount(0);
});

test('AC-5.3.5 — Auto-tags are not user-removable and render distinctly: a built-in Pattern’s own Tags are locked, Tags added to it are not', async ({
  page,
}) => {
  await page.goto('/');
  const own = await page.evaluate(() => {
    const p = window.__rm.seedStore.loadAll().find((x) => x.tags.includes('Latin'));
    window.__rm.loadPattern(structuredClone(p), { owned: false });
    return p.name;
  });
  expect(own).toBeTruthy();

  const latin = header(page).locator('.tag-chip.locked', { hasText: /^Latin$/ });
  await expect(latin).toBeVisible();
  await expect(latin.locator('.tag-remove')).toHaveCount(0);
  expect(await latin.evaluate((n) => getComputedStyle(n).backgroundColor)).toBe('rgba(0, 0, 0, 0)');

  await addTagFromHeader(page, 'warmup');
  const mine = header(page).locator('.tag-chip.user', { hasText: 'warmup' });
  await expect(mine.locator('.tag-remove')).toHaveCount(1);

  // Provenance is an automatic Tag, and filters like any other.
  await expect(header(page).locator('.tag-chip.automatic', { hasText: /^built-in$/ })).toBeVisible();
  await openLibrary(page);
  await page.locator('.tag-filter', { hasText: /^built-in$/ }).click();
  const owned = await page.locator('.pattern-item[data-owned="true"]').count();
  expect(owned).toBe(0);
  await expect(page.locator('.pattern-item').first()).toBeVisible();
});

// --- US-5.3 — user Tags -----------------------------------------------------

test('AC-5.3.6 — User Tag de-duplication is case-insensitive', async ({ page }) => {
  await page.goto('/');
  await newPattern(page);
  await addTagFromHeader(page, 'Warmup');
  await expect(header(page).locator('.tag-chip.user', { hasText: 'Warmup' })).toHaveCount(1);

  await addTagFromHeader(page, 'warmup');

  const users = (await header(page).locator('.tag-chip.user').allTextContents()).map((t) =>
    t.replace('×', '').trim()
  );
  expect(users.filter((t) => t.toLowerCase() === 'warmup')).toEqual(['Warmup']);
  const stored = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return window.__rm.patternStore.findById(id).tags;
  });
  expect(stored).toEqual(['Warmup']);
});

test('AC-5.3.8 — Tag-filter pill ordering', async ({ page }) => {
  await page.goto('/');
  // Bring `custom`, `melodic` and `swing` into use alongside the shipped
  // library's `percussive`, and the user Tags "hard" and "warmup".
  await newPattern(page);
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await setSwing(page, 30);
  await addTagFromHeader(page, 'warmup');
  await addTagFromHeader(page, 'hard');

  const pills = page.locator('.tag-filter');
  const names = await pills.allTextContents();
  const automatic = await pills.evaluateAll((ns) => ns.map((n) => n.dataset.automatic === 'true'));

  const wanted = ['custom', 'melodic', 'percussive', 'swing', 'hard', 'warmup'];
  expect(names.filter((n) => wanted.includes(n))).toEqual(wanted);

  // Every automatic pill comes before every user pill, each run alphabetical.
  const firstUser = automatic.indexOf(false);
  expect(automatic.slice(firstUser).every((a) => !a)).toBe(true);
  const auto = names.slice(0, firstUser);
  expect(auto).toEqual([...auto].sort((a, b) => a.localeCompare(b)));
  const user = names.slice(firstUser);
  expect(user).toEqual([...user].sort((a, b) => a.localeCompare(b)));
});

// --- US-6.1 — Rating --------------------------------------------------------

test('AC-6.1.1 — New Pattern defaults to Rating 0', async ({ page }) => {
  await page.goto('/');
  await newPattern(page);
  await openLibrary(page);

  const row = page.locator('.pattern-item.current');
  await expect(row.locator('.pattern-name')).toHaveText('New Pattern');
  await expect(row.locator('.rating')).toHaveAttribute('data-rating', '0');
  await expect(row.locator('.star.on')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.getState().pattern.rating)).toBe(0);
});

test('AC-6.1.2 — Rating filter defaults to All', async ({ page }) => {
  await page.goto('/');
  const on = page.locator('.rating-filter .rating-option.on');
  await expect(on).toHaveCount(1);
  await expect(on).toHaveText('All');

  // And with nothing previously selected, a reload still lands on All.
  await page.reload();
  await expect(page.locator('.rating-filter .rating-option.on')).toHaveText('All');
});

test('AC-6.1.4 — Tapping the current star clears Rating', async ({ page }) => {
  await page.goto('/');
  await newPattern(page);
  await rename(page, 'Samba Break');

  await openLibrary(page);
  const row = page.locator('.pattern-item', { hasText: 'Samba Break' });
  await row.locator('.star').nth(3).click();
  await expect(row.locator('.rating')).toHaveAttribute('data-rating', '4');

  await row.locator('.star').nth(3).click();
  await expect(row.locator('.rating')).toHaveAttribute('data-rating', '0');
  await expect(row.locator('.star.on')).toHaveCount(0);
  const stored = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return window.__rm.patternStore.findById(id).rating;
  });
  expect(stored).toBe(0);
});

// --- US-5.1 / US-5.2 — the list order ------------------------------------------

/**
 * Owned Patterns with the names, Ratings and Tags given, stored through the app's own
 * store and the page reloaded so the library is built from them as it would be on any
 * visit. Each gets a known id so its row can be found among the shipped ones.
 */
async function seedOwned(page, specs) {
  await page.goto('/');
  await page.evaluate((list) => {
    const blank = window.__rm.loadBlank('4/4', 'Seed');
    list.forEach(([name, rating, tags], i) => {
      window.__rm.patternStore.upsert({ ...structuredClone(blank), id: `p_order_${i}`, name, rating, tags });
    });
  }, specs);
  await page.reload();
  await openLibrary(page);
}

/** The owned rows, in the order the library renders them, as "name rating". */
async function ownedOrder(page) {
  return page.locator('.pattern-item[data-owned="true"]').evaluateAll((rows) =>
    rows
      .filter((r) => r.dataset.patternId.startsWith('p_order_'))
      .map((r) => {
        const p = window.__rm.patternStore.findById(r.dataset.patternId);
        return `${p.name} ${p.rating}`;
      })
  );
}

const LIBRARY = [
  ['Zebra Beat', 5, ['warmup']],
  ['Apple Groove', 5, ['warmup']],
  ['Mango Fill', 3, []],
  ['banana Riff', 3, ['warmup']],
  ['Date Loop', 0, ['warmup']],
  ['Samba Break', 2, ['warmup']],
  ['Samba Break', 4, []],
];

test('AC-5.1.4 — Default sort order: alphabetical by name, then Rating descending between equal names', async ({ page }) => {
  await seedOwned(page, LIBRARY);
  expect(await ownedOrder(page)).toEqual([
    'Apple Groove 5',
    'banana Riff 3',
    'Date Loop 0',
    'Mango Fill 3',
    'Samba Break 4',
    'Samba Break 2',
    'Zebra Beat 5',
  ]);
});

test('AC-5.1.5 — Sort order applies on top of Tag filtering', async ({ page }) => {
  await seedOwned(page, LIBRARY);
  await page.locator('.tag-filter', { hasText: /^warmup$/ }).click();
  // Only the "warmup" Patterns remain, and in the same alphabetical-then-Rating order.
  const names = await page.locator('.pattern-item').evaluateAll((rows) =>
    rows.map((r) => {
      const p = window.__rm.patternStore.findById(r.dataset.patternId);
      return p ? `${p.name} ${p.rating}` : `shipped:${r.dataset.patternId}`;
    })
  );
  expect(names).toEqual(['Apple Groove 5', 'banana Riff 3', 'Date Loop 0', 'Samba Break 2', 'Zebra Beat 5']);
});

test('AC-5.1.6 — "List order" elsewhere in the doc means this sort order', async ({ page }) => {
  await seedOwned(page, LIBRARY);
  await page.locator('.tag-filter', { hasText: /^warmup$/ }).click();
  const rendered = await page.locator('.pattern-item').evaluateAll((rows) => rows.map((r) => r.dataset.patternId));
  // Open the first row, then Next walks the rows exactly as they are rendered.
  await page.locator(`.pattern-item[data-pattern-id="${rendered[0]}"] [data-action="open-pattern"]`).click();
  const walked = [await page.evaluate(() => window.__rm.getState().pattern.id)];
  for (let i = 1; i < rendered.length; i++) {
    await page.locator('[data-action="next-pattern"]').click();
    walked.push(await page.evaluate(() => window.__rm.getState().pattern.id));
  }
  expect(walked).toEqual(rendered);
});

test("AC-5.2.3 — Search results keep the library's default sort order", async ({ page }) => {
  await seedOwned(page, [
    ['Zebra Groove', 5, []],
    ['Apple Groove', 5, []],
  ]);
  await page.locator('.library-search').fill('groove');
  expect(await ownedOrder(page)).toEqual(['Apple Groove 5', 'Zebra Groove 5']);
  // And the whole result list is in the library's order, shipped matches included.
  const shown = await page.locator('.pattern-name').allTextContents();
  const sorted = [...shown].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  expect(shown).toEqual(sorted);
});

// --- US-5.5 / US-5.2 / US-5.3 — wrapping, Tag search, Tag limits -------------------

/** The filtered list as the library renders it: the "warmup" Patterns. */
async function warmupList(page) {
  await page.locator('.tag-filter', { hasText: /^warmup$/ }).click();
  return page.locator('.pattern-item').evaluateAll((rows) => rows.map((r) => r.dataset.patternId));
}
const loadedId = (page) => page.evaluate(() => window.__rm.getState().pattern.id);

test('AC-5.5.2/1 — Next on the last Pattern of the list loads the first', async ({ page }) => {
  await seedOwned(page, LIBRARY);
  const rows = await warmupList(page);
  await page.locator(`.pattern-item[data-pattern-id="${rows[rows.length - 1]}"] [data-action="open-pattern"]`).click();
  await expect(page.locator('[data-action="next-pattern"]')).toBeEnabled();
  await page.locator('[data-action="next-pattern"]').click();
  expect(await loadedId(page)).toBe(rows[0]);
});

test('AC-5.5.2/2 — Prev on the first Pattern of the list loads the last', async ({ page }) => {
  await seedOwned(page, LIBRARY);
  const rows = await warmupList(page);
  await page.locator(`.pattern-item[data-pattern-id="${rows[0]}"] [data-action="open-pattern"]`).click();
  await expect(page.locator('[data-action="prev-pattern"]')).toBeEnabled();
  await page.locator('[data-action="prev-pattern"]').click();
  expect(await loadedId(page)).toBe(rows[rows.length - 1]);
});

test('AC-5.2.1 — Search matches name and Tags', async ({ page }) => {
  await seedOwned(page, [
    ['Bossa Nova Groove', 0, []],
    ['Samba Break', 0, ['bossa-feel']],
    ['Plain Groove', 0, []],
  ]);
  await page.locator('.library-search').fill('BOSSA');
  // Both of these match — one by name, one by its Tag — and the third does not.
  expect(await ownedOrder(page)).toEqual(['Bossa Nova Groove 0', 'Samba Break 0']);
  // Every row shown, shipped ones included, matches by name or Tag.
  const unmatched = await page.locator('.pattern-item').evaluateAll((rows) =>
    rows
      .map((r) => {
        const id = r.dataset.patternId;
        const p = window.__rm.patternStore.findById(id) ?? window.__rm.seedStore.findById(id);
        const added = window.__rm.overlayStore.addedTagsFor?.(id) ?? [];
        const text = [p.name, ...(p.tags ?? []), ...added].join(' ').toLowerCase();
        return text.includes('bossa') ? null : p.name;
      })
      .filter(Boolean)
  );
  expect(unmatched).toEqual([]);
});

test('AC-5.3.11/1 — A 21st Tag of the user’s own is refused, saying why, and the Pattern keeps its 20', async ({ page }) => {
  const twenty = Array.from({ length: 20 }, (_, i) => `tag ${i + 1}`);
  await seedOwned(page, [['Full Up', 0, twenty]]);
  await page.locator('.pattern-item[data-pattern-id="p_order_0"] [data-action="open-pattern"]').click();
  await header(page).locator('[data-action="add-tag"]').click();
  // No prompt for a Tag that would be refused: the reason, at once.
  await expect(page.locator('.dialog-message')).toHaveText('A Pattern can carry at most 20 Tags of your own.');
  await expect(page.locator('.dialog-input')).toHaveCount(0);
  await page.locator('.dialog-button', { hasText: 'OK' }).click();
  expect(await page.evaluate(() => window.__rm.patternStore.findById('p_order_0').tags.length)).toBe(20);
});

test('AC-5.3.11/2 — A Tag over 30 characters is refused, saying why, while one of exactly 30 is added', async ({ page }) => {
  await seedOwned(page, [['Long Tags', 0, []]]);
  await page.locator('.pattern-item[data-pattern-id="p_order_0"] [data-action="open-pattern"]').click();
  await addTagFromHeader(page, 'x'.repeat(31));
  await expect(page.locator('.dialog-message')).toHaveText('A Tag can be at most 30 characters.');
  await page.locator('.dialog-button', { hasText: 'OK' }).click();
  expect(await page.evaluate(() => window.__rm.patternStore.findById('p_order_0').tags)).toEqual([]);

  await addTagFromHeader(page, 'y'.repeat(30));
  expect(await page.evaluate(() => window.__rm.patternStore.findById('p_order_0').tags)).toEqual(['y'.repeat(30)]);
});

