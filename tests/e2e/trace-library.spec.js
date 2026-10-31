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
