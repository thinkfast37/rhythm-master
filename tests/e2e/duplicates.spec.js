/**
 * The possible-duplicates view and the Family members panel. US-11.1, US-11.2.
 *
 * These criteria describe things a person sees and clicks, so they are proved here
 * rather than in `tests/unit/core/similarity.test.js` — which computes the underlying
 * relationships correctly and, for a long time, was mistaken for proof that the views
 * existed. They did not (T145, T147).
 */
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

/** Create an owned Pattern by editing a shipped one and naming the copy. */
async function makeOwned(page, name = 'Mine') {
  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
}

/** Seed a second owned Pattern straight into the store, then re-render. */
async function seedTwin(page, { name, melodic = false }) {
  return page.evaluate(
    ({ name: n, melodic: mel }) => {
      const rm = window.__rm;
      const twin = structuredClone(rm.getState().pattern);
      twin.id = rm.patternStore.nextId();
      twin.name = n;
      twin.rating = 0;
      if (mel) {
        twin.soundMode = 'melodic';
        twin.key = 'C';
        for (const measure of twin.measures) {
          for (const beat of measure.beats) {
            for (const slot of beat.slots) {
              if (slot.on) slot.pitch = { degree: '1', octaveOffset: 0 };
            }
          }
        }
      }
      rm.patternStore.upsert(twin);
      // Reload the current Pattern so the render picks the new library up.
      rm.loadPattern(rm.getState().pattern, { owned: true });
      return twin.id;
    },
    { name, melodic }
  );
}

// --- US-11.1: the possible-duplicates view ---------------------------------

test('AC-11.1.3 — Duplicate warning fires only at Pattern-creation moments: the forced-naming flow', async ({
  page,
}) => {
  await page.goto('/');
  // An owned Pattern that already matches the shipped one exactly. Editing the shipped
  // Pattern then names a copy, and that copy — which is still unedited at naming time —
  // duplicates the one already owned.
  await page.evaluate(() => {
    const rm = window.__rm;
    const shipped = rm.seedStore.loadAll()[0];
    rm.patternStore.upsert({
      ...structuredClone(shipped),
      id: rm.patternStore.nextId(),
      name: 'Already Mine',
      rating: 0,
    });
    rm.loadPattern(structuredClone(shipped), { owned: false });
  });

  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill('Second Copy');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  await expect(page.locator('.dialog-message')).toContainText('note-for-note identical');
  await expect(page.locator('.dialog-message')).toContainText('Already Mine');
});

test('AC-11.1.3 — Duplicate warning fires only at Pattern-creation moments: declining returns to the naming prompt', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'Original');

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('Same Notes');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await expect(page.locator('.dialog-message')).toContainText('note-for-note identical');

  await page.locator('.dialog-button', { hasText: 'Choose another name' }).click();

  // Back on the naming prompt, not dropped out of the copy entirely — and the name
  // just typed is still there to edit rather than retype.
  await expect(page.locator('.dialog-input')).toBeVisible();
  await expect(page.locator('.dialog-input')).toHaveValue('Same Notes');
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(1);
});

test('AC-11.1.4/1 — The view lists a duplicate that no warning ever fired for', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'My Custom Fill');
  // A twin created without ever passing a naming prompt — the shape a duplicate takes
  // when it emerges from ongoing auto-saved edits, which no warning ever fires for.
  await seedTwin(page, { name: 'Old Fill' });

  await page.locator('[data-action="show-duplicates"]').click();

  const rows = page.locator('.duplicates-view .duplicate-row');
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.duplicates-view')).toContainText('My Custom Fill');
  await expect(page.locator('.duplicates-view')).toContainText('Old Fill');
});

test('AC-11.1.4/2 — The view covers the whole library, not only the loaded Pattern', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'Pair A');
  await seedTwin(page, { name: 'Pair B' });

  // Move the editor onto something that is NOT part of the duplicate pair, so the only
  // way the pair can appear is if the view looks across the whole library.
  await page.evaluate(() => {
    const rm = window.__rm;
    rm.loadPattern(structuredClone(rm.seedStore.loadAll()[3]), { owned: false });
  });

  await page.locator('[data-action="show-duplicates"]').click();

  await expect(page.locator('.duplicates-view')).toContainText('Pair A');
  await expect(page.locator('.duplicates-view')).toContainText('Pair B');
});

test('AC-11.1.5/1 — Confirming removal deletes that Pattern and leaves its twin', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Samba Break');
  await seedTwin(page, { name: 'Samba Break copy' });

  await page.locator('[data-action="show-duplicates"]').click();
  await page
    .locator('.duplicate-row')
    .filter({ has: page.getByText('Samba Break copy', { exact: true }) })
    .locator('[data-action="remove-duplicate"]')
    .click();

  // The confirmation names the one being deleted and the one that survives.
  await expect(page.locator('.dialog-message')).toContainText('Samba Break copy');
  await expect(page.locator('.dialog-message')).toContainText('Samba Break');
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();

  const names = await page.evaluate(() => window.__rm.patternStore.loadAll().map((p) => p.name));
  expect(names).toEqual(['Samba Break']);
});

test('AC-11.1.5/2 — A shipped Pattern offers no Remove control in this view', async ({ page }) => {
  await page.goto('/');
  // An owned Pattern that duplicates a shipped one: the pair is one of each.
  await page.evaluate(() => {
    const rm = window.__rm;
    const shipped = rm.seedStore.loadAll()[0];
    const mine = { ...structuredClone(shipped), id: rm.patternStore.nextId(), name: 'My Version', rating: 0 };
    rm.patternStore.upsert(mine);
    rm.loadPattern(mine, { owned: true });
  });

  await page.locator('[data-action="show-duplicates"]').click();

  const mine = page.locator('.duplicate-row', { hasText: 'My Version' });
  await expect(mine.locator('[data-action="remove-duplicate"]')).toHaveCount(1);

  const shippedRow = page.locator('.duplicate-row').filter({ hasText: 'ships with the app' });
  await expect(shippedRow).toHaveCount(1);
  await expect(shippedRow.locator('[data-action="remove-duplicate"]')).toHaveCount(0);
});

test('AC-11.1.6/1 — Removing the open Pattern loads its surviving twin', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'My Custom Fill');
  await seedTwin(page, { name: 'My Custom Fill copy' });

  // "My Custom Fill" is the one loaded in the editor.
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('My Custom Fill');

  await page.locator('[data-action="show-duplicates"]').click();
  await page
    .locator('.duplicate-row')
    .filter({ has: page.getByText('My Custom Fill', { exact: true }) })
    .locator('[data-action="remove-duplicate"]')
    .click();
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();
  await page.locator('[data-action="close-duplicates"]').click();

  // The editor lands on the surviving twin, never on a Pattern that is gone.
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('My Custom Fill copy');
  const remaining = await page.evaluate(() => window.__rm.patternStore.loadAll().map((p) => p.name));
  expect(remaining).toEqual(['My Custom Fill copy']);
});

test('AC-11.1.6/2 — Removing a Pattern that is not open leaves the editor where it was', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'My Custom Fill');
  await seedTwin(page, { name: 'My Custom Fill copy' });

  await page.locator('[data-action="show-duplicates"]').click();
  await page
    .locator('.duplicate-row')
    .filter({ has: page.getByText('My Custom Fill copy', { exact: true }) })
    .locator('[data-action="remove-duplicate"]')
    .click();
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();
  await page.locator('[data-action="close-duplicates"]').click();

  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('My Custom Fill');
});

// --- US-11.2: the Family members panel -------------------------------------

test('AC-11.2.2 — Family detection recomputes on every edit, not just creation', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  // A known 4/4 shape, so the Beat this edits is certain to exist whatever the
  // shipped library happens to open with.
  await page.evaluate(() => window.__rm.loadBlank('4/4', 'Groove'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await seedTwin(page, { name: 'Groove (Melodic)', melodic: true });

  // A Family exists right now.
  await expect(page.locator('.family-members .family-link')).toHaveCount(1);

  // An ordinary auto-saved edit changes the rhythm, so the relationship breaks —
  // with no creation moment anywhere in sight.
  await page.locator('.slot[data-beat="2"][data-slot="0"]').click();

  await expect(page.locator('.family-members .family-link')).toHaveCount(0);
});

test('AC-11.2.4 — Family members are discoverable via normal Tag/name listing', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await makeOwned(page, 'Groove');
  await seedTwin(page, { name: 'Groove (Melodic)', melodic: true });

  // Both members appear in the ordinary library list — there is no separate
  // family-grouped view, and none is needed.
  await expect(page.locator('.pattern-item', { hasText: 'Groove (Melodic)' })).toHaveCount(1);
  await expect(page.locator('.pattern-item', { hasText: 'Groove' }).first()).toBeVisible();

  // And searching by name reaches the member like any other Pattern.
  await page.locator('.library-search').fill('Melodic');
  await expect(page.locator('.pattern-item', { hasText: 'Groove (Melodic)' })).toHaveCount(1);
});

test('AC-11.2.5/2 — At 768px and wider the editor lists family members as links', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await makeOwned(page, 'Groove');
  const twinId = await seedTwin(page, { name: 'Groove (Melodic)', melodic: true });

  // A compact area at the bottom of the editor, listing members by name.
  const panel = page.locator('.family-members');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.family-link')).toHaveText([/Groove \(Melodic\)/]);

  // It is the last section of the main panel (AC-15.1.8).
  const isLast = await page.evaluate(() => {
    const el = document.querySelector('.family-members');
    return el.parentElement.lastElementChild === el;
  });
  expect(isLast).toBe(true);

  // Each one is a link that loads that member into the editor.
  await panel.locator('.family-link').click();
  expect(await page.evaluate(() => window.__rm.getState().pattern.id)).toBe(twinId);
});

test('AC-11.2.5/1 — Below 768px no family information is shown', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await makeOwned(page, 'Groove');
  await seedTwin(page, { name: 'Groove (Melodic)', melodic: true });
  await expect(page.locator('.family-members')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('.family-members')).toBeHidden();
});
