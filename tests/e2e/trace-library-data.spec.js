/**
 * The shipped library on first run, auto-save, and the one-time prompt when a library
 * update duplicates a Pattern of the musician's own (US-16.1, US-7.2, US-11.3).
 *
 * Each of these is something a person sees or does — a library list and its counter,
 * an edit that is still there after the app was closed, a prompt on load — so each is
 * proved through the page rather than through the stores alone.
 */
import { test, expect } from '@playwright/test';
import { SEED_PATTERN_COUNT } from '../seed-count.js';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

/** The owned Pattern with this id, exactly as localStorage holds it. */
const stored = (page, id) =>
  page.evaluate((pid) => {
    const raw = localStorage.getItem(window.__rm.patternStore.KEY);
    return raw ? (JSON.parse(raw).patterns.find((p) => p.id === pid) ?? null) : null;
  }, id);

/** The on/off and accent state of every Slot, for comparing two copies of a Pattern. */
const shape = (p) =>
  p.measures.map((m) => m.beats.map((b) => b.slots.map((s) => (s.on ? (s.accent ?? 'on') : 0))));

/**
 * Store an owned Pattern note-for-note identical to the first shipped one, as though it
 * had been written before a library update shipped that same Pattern, and reload so
 * the app goes through its load-time check.
 */
async function ownedTwinOfShipped(page, { name, id = 'p_dupe', change = null, rating = 0, tags = [] }) {
  await page.evaluate(
    ({ name: n, id: pid, change: c, rating: r, tags: t }) => {
      const shipped = window.__rm.seedStore.loadAll()[0];
      const mine = { ...structuredClone(shipped), id: pid, name: n, rating: r, tags: t };
      if (c === 'swing') mine.swingAmount = 20;
      if (c === 'melodic') {
        mine.soundMode = 'melodic';
        mine.key = 'C';
        for (const m of mine.measures) {
          for (const b of m.beats) {
            for (const s of b.slots) if (s.on) s.pitch = { degree: '1', octaveOffset: 0 };
          }
        }
      }
      window.__rm.patternStore.upsert(mine);
    },
    { name, id, change, rating, tags }
  );
  await page.reload();
}

/** Open a Pattern from the library list by its name. */
const openFromLibrary = (page, name) =>
  page.locator('.pattern-item', { hasText: name }).locator('[data-action="open-pattern"]').click();

/** Set the Pattern-wide swing from the Practice tab's preset. */
async function presetSwing(page, amount) {
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  await page.locator(`[data-action="preset-swing"][data-amount="${amount}"]`).click();
}

const libraryPrompt = (page) =>
  page.locator('.dialog-message', { hasText: 'is now in the library' });

// --- US-16.1: the shipped library -----------------------------------------------

test('AC-16.1.1 — Shipped library present on first run', async ({ page }) => {
  await page.goto('/');
  // Nothing of the musician's is stored: everything listed is shipped.
  expect(await page.evaluate(() => localStorage.getItem(window.__rm.patternStore.KEY))).toBeNull();

  await expect(page.locator('.pattern-item')).toHaveCount(SEED_PATTERN_COUNT);
  await expect(page.locator('.library-count')).toHaveText(`${SEED_PATTERN_COUNT} patterns`);

  // Each is selectable and playable: open one from the list and play it.
  const item = page.locator('.pattern-item').nth(5);
  const name = (await item.locator('.pattern-name').textContent()).trim();
  await item.locator('[data-action="open-pattern"]').click();
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe(name);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await page.locator('[data-action="play"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
});

test('AC-16.1.2 — Shipped Patterns are not marked as user-authored', async ({ page }) => {
  await page.goto('/');
  // No shipped Pattern carries `custom`, whether stored or derived.
  const marked = await page.evaluate(() =>
    window.__rm.seedStore.loadAll().filter((p) => p.tags.map((t) => String(t).toLowerCase()).includes('custom'))
  );
  expect(marked).toEqual([]);

  // On screen: the open shipped Pattern shows no `custom` Tag …
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  const tags = page.locator('.header-tags .tag-chip');
  await expect(tags.first()).toBeVisible();
  await expect(page.locator('.header-tags .tag-chip', { hasText: /^custom$/ })).toHaveCount(0);
  // … offers no Delete (AC-7.5.3) …
  await expect(page.locator('[data-action="delete-pattern"]')).toHaveCount(0);
  // … and an edit asks for a new name first (US-7.3).
  await page.locator('.slot').first().click();
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
});

// --- US-7.2: auto-save ----------------------------------------------------------

test('AC-7.2.2 — Each edit in a sequence saves individually', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4', 'My Custom Fill'));
  await page.evaluate(() => window.__rm.patternStore.upsert(window.__rm.getState().pattern));
  const id = await page.evaluate(() => window.__rm.getState().pattern.id);

  // Count every write of the Pattern store from here on.
  await page.evaluate((key) => {
    window.__writes = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) window.__writes += 1;
      return original.call(this, k, v);
    };
  }, await page.evaluate(() => window.__rm.patternStore.KEY));

  const slots = [
    '.slot[data-beat="0"][data-slot="1"]',
    '.slot[data-beat="1"][data-slot="2"]',
    '.slot[data-beat="2"][data-slot="3"]',
  ];
  for (const [i, selector] of slots.entries()) {
    await page.locator(selector).click();
    // Saved as it happens: the store already holds this edit, before the next one.
    const onScreen = await page.evaluate(() => window.__rm.getState().pattern);
    expect(shape(await stored(page, id))).toEqual(shape(onScreen));
    expect(await page.evaluate(() => window.__writes)).toBe(i + 1);
  }

  await presetSwing(page, 15);
  expect((await stored(page, id)).swingAmount).toBe(15);
  expect(await page.evaluate(() => window.__writes)).toBe(4);
});

test('AC-7.2.3 — Auto-saved edits survive an app close mid-edit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4', 'My Custom Fill'));
  await page.evaluate(() => window.__rm.patternStore.upsert(window.__rm.getState().pattern));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.slot[data-beat="1"][data-slot="2"]').click();
  await page.locator('.slot[data-beat="2"][data-slot="1"]').click();
  await presetSwing(page, 15);
  const before = await page.evaluate(() => window.__rm.getState().pattern);

  // Close the app mid-edit: no navigation, no unload handshake beyond the tab going away.
  await page.close({ runBeforeUnload: false });

  const reopened = await context.newPage();
  await reopened.goto('/');
  await openFromLibrary(reopened, 'My Custom Fill');
  const after = await reopened.evaluate(() => window.__rm.getState().pattern);
  expect(after.name).toBe('My Custom Fill');
  expect(shape(after)).toEqual(shape(before));
  expect(after.swingAmount).toBe(15);
});

// --- US-11.3: a library update duplicates your own Pattern ----------------------

test('AC-11.3.1 — Trigger: app load after a library update', async ({ page }) => {
  await page.goto('/');
  // A true duplicate of a shipped Pattern is found when the app loads …
  await ownedTwinOfShipped(page, { name: 'Twin' });
  await expect(libraryPrompt(page)).toContainText("'Twin'");
  await page.locator('.dialog-button', { hasText: 'Keep' }).click();
});

test('AC-11.3.1 — Trigger: app load after a library update: only a true duplicate is found', async ({
  page,
}) => {
  await page.goto('/');
  // The same Measures with a different swing, or in the other Sound Mode: neither is
  // a true duplicate, so neither is prompted.
  await ownedTwinOfShipped(page, { name: 'Swung', id: 'p_swung', change: 'swing' });
  await ownedTwinOfShipped(page, { name: 'Sung', id: 'p_sung', change: 'melodic' });
  await expect(page.locator('.pattern-item', { hasText: 'Sung' })).toHaveCount(1);
  await expect(libraryPrompt(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.unresolvedLibraryDuplicates().length)).toBe(0);
});

test('AC-11.3.2 — One-time Remove/Keep prompt, with data-loss callout', async ({ page }) => {
  await page.goto('/');
  await ownedTwinOfShipped(page, { name: 'Samba Break', rating: 4, tags: ['warmup'] });

  await expect(page.locator('.dialog-message')).toHaveText(
    "Your custom pattern 'Samba Break' is now in the library — remove your copy? (Your Rating and Tags on it won't carry over.)"
  );
  await expect(page.locator('.dialog-host .dialog-button')).toHaveText(['Remove', 'Keep']);

  // One-time: once answered, the next load asks nothing.
  await page.locator('.dialog-button', { hasText: 'Keep' }).click();
  await page.reload();
  await expect(page.locator('.pattern-item').first()).toBeVisible();
  await expect(libraryPrompt(page)).toHaveCount(0);
});

test('AC-11.3.4 — Keep retains both, no repeat prompt for that pair', async ({ page }) => {
  await page.goto('/');
  await ownedTwinOfShipped(page, { name: 'Samba Break' });
  const shippedName = await page.evaluate(() => window.__rm.seedStore.loadAll()[0].name);
  await page.locator('.dialog-button', { hasText: 'Keep' }).click();

  // Both copies remain.
  expect(await page.evaluate(() => window.__rm.patternStore.findById('p_dupe')?.name)).toBe('Samba Break');
  expect(await page.evaluate(() => window.__rm.seedStore.loadAll().length)).toBe(SEED_PATTERN_COUNT);

  // Never prompted again for this pair.
  await page.reload();
  await expect(page.locator('.pattern-item').first()).toBeVisible();
  await expect(libraryPrompt(page)).toHaveCount(0);

  // Still in the standing possible-duplicates view (AC-11.1.4).
  await openFromLibrary(page, 'Samba Break');
  await page.locator('[data-action="show-duplicates"]').click();
  await expect(page.locator('.duplicates-view')).toContainText('Samba Break');
  await expect(page.locator('.duplicates-view')).toContainText(shippedName);
});

test('AC-11.3.5 — Resolved-pair tracking is Local Metadata', async ({ page }) => {
  await page.goto('/');
  await ownedTwinOfShipped(page, { name: 'Samba Break' });
  await page.locator('.dialog-button', { hasText: 'Keep' }).click();

  // A later load does not ask again.
  await page.reload();
  await expect(page.locator('.pattern-item').first()).toBeVisible();
  await expect(libraryPrompt(page)).toHaveCount(0);

  // The resolution is Local Metadata, under its own store …
  const meta = await page.evaluate(() => JSON.parse(localStorage.getItem(window.__rm.localMetaStore.KEY)));
  expect(JSON.stringify(meta)).toContain('duplicateResolved');
  // … and not part of the Pattern's own definition.
  expect(await stored(page, 'p_dupe')).not.toHaveProperty('duplicateResolved');

  // Nor of what is submitted (US-13.1).
  await page.context().route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>stubbed</p>' })
  );
  await openFromLibrary(page, 'Samba Break');
  await page.locator('[data-action="submit-pattern"]').click();
  const href = await page.locator('[data-action="open-submission"]').getAttribute('href');
  const body = new URL(href).searchParams.get('body');
  expect(body).toContain('Samba Break');
  expect(body).not.toContain('duplicateResolved');
});
