import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  create,
  createMeasure,
  addMeasure,
  setTimeSignature,
  setRecipe,
  cycleAccent,
  setPitch,
} from '../../src/core/pattern.js';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

/*
 * Group-4 traceability: Measures and Time Signatures, Sound Mode, naming / copy /
 * delete, Combine, Double Length, MIDI export and breakpoints — each criterion
 * driven through the real controls.
 */

/** Put a Pattern in the owned store and open it in the editor. */
async function openOwned(page, pattern) {
  await page.evaluate((p) => {
    window.__rm.patternStore.upsert(p);
    window.__rm.loadPattern(structuredClone(p), { owned: true });
  }, pattern);
  await expect(page.locator('.pattern-title')).toHaveValue(pattern.name);
}

const meters = (page) =>
  page.locator('.measure').evaluateAll((els) => els.map((e) => e.dataset.timeSignature));

const state = (page) => page.evaluate(() => structuredClone(window.__rm.getState().pattern));
const stored = (page, id) => page.evaluate((pid) => window.__rm.patternStore.findById(pid), id);

// --- US-1.1 ------------------------------------------------------------------

test("AC-1.1.2 — Appending inherits the preceding Measure's Time Signature", async ({ page }) => {
  await page.goto('/');
  // Two Measures, the last in 3/4 and holding a note, so a copied Measure would show.
  let p = { ...create('Two Measures'), id: 'p_two' };
  p = addMeasure(p);
  p = setTimeSignature(p, 1, '3/4');
  p = cycleAccent(p, 1, 0, 0);
  await openOwned(page, p);

  await page.locator('[data-action="add-measure"]').click();

  // A third Measure at the end, in 3/4 …
  await expect(page.locator('.measure')).toHaveCount(3);
  expect(await meters(page)).toEqual(['4/4', '3/4', '3/4']);
  const third = page.locator('.measure').nth(2);
  await expect(third.locator('.beat')).toHaveCount(3);
  // … with the default Recipe on every Beat, and every Slot off.
  const fresh = createMeasure('3/4');
  expect(await third.locator('.beat').evaluateAll((els) => els.map((e) => e.dataset.recipe))).toEqual(
    fresh.beats.map((b) => b.recipe)
  );
  expect(await third.locator('.slot').evaluateAll((els) => els.map((e) => e.dataset.accent))).toEqual(
    fresh.beats.flatMap((b) => b.slots.map(() => '0'))
  );
  const after = await state(page);
  expect(after.measures[2]).toEqual(fresh);
  // The Measures before it are exactly as they were.
  expect(after.measures.slice(0, 2)).toEqual(p.measures);

  // The only way to add a Measure is the one +Measure control, and it appends.
  await expect(page.locator('[data-action="add-measure"]')).toHaveCount(1);
  await expect(page.locator('[data-action*="insert"]')).toHaveCount(0);
});

test('AC-1.1.4 — Single-Measure Time Signature change applies immediately', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4', 'One Measure'));
  // Some content, so the reset has something to clear.
  await page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]').click();
  await page.locator('.slot[data-measure="0"][data-beat="1"][data-slot="2"]').click();
  expect((await state(page)).measures[0].beats[0].slots[0].on).toBe(true);

  await page.locator('[data-action="change-time-signature"][data-measure="0"]').click();
  await page.locator('.dialog-button[data-value="3/4"]').click();

  // No prompt follows the pick: the change has already landed.
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await meters(page)).toEqual(['3/4']);
  await expect(page.locator('.measure').first().locator('.beat')).toHaveCount(3);
  // The Beats reset to 3/4's default Recipe, every Slot off.
  expect((await state(page)).measures[0]).toEqual(createMeasure('3/4'));
  expect(
    await page.locator('.measure').first().locator('.slot').evaluateAll((els) => els.every((e) => e.dataset.accent === '0'))
  ).toBe(true);
});

// --- US-2.1 ------------------------------------------------------------------

test('AC-2.1.2 — New Pattern defaults to Percussive', async ({ page }) => {
  await page.goto('/');
  // No Pattern of the Composer's own exists yet.
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);

  await page.locator('[data-action="new-pattern"]').click();

  await expect(page.locator('.pattern-title')).toHaveValue('New Pattern');
  const p = await state(page);
  expect(p.soundMode).toBe('percussive');
  expect('key' in p).toBe(false);
  await expect(page.locator('.sound-mode [data-mode="percussive"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sound-mode [data-mode="melodic"]')).toHaveAttribute('aria-pressed', 'false');
});

// --- US-7.3 / US-7.4 / US-7.5 -------------------------------------------------

test('AC-7.3.2 — Confirming the naming prompt creates a new owned Pattern', async ({ page }) => {
  await page.goto('/');
  const shipped = await page.evaluate(() => {
    const p = window.__rm.seedStore.loadAll().find((x) => x.name === 'Bossa Nova');
    window.__rm.loadPattern(structuredClone(p), { owned: false });
    return structuredClone(p);
  });
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);

  // The edit that triggers the prompt: Measure 1, Beat 1, Slot 2.
  await page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="1"]').click();
  await page.locator('.dialog-input').fill('Bossa Groove (Melodic)');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  // A new Pattern by that name, owned, and the editor is on it.
  await expect(page.locator('.pattern-title')).toHaveValue('Bossa Groove (Melodic)');
  const after = await page.evaluate(() => ({
    pattern: structuredClone(window.__rm.getState().pattern),
    owned: window.__rm.getState().isOwned,
    store: window.__rm.patternStore.loadAll(),
  }));
  expect(after.owned).toBe(true);
  expect(after.store).toHaveLength(1);
  expect(after.store[0].name).toBe('Bossa Groove (Melodic)');
  expect(after.store[0].id).not.toBe(shipped.id);
  // The shipped content plus the triggering edit — and nothing else changed.
  expect(after.pattern.measures).toEqual(cycleAccent(shipped, 0, 0, 1).measures);
  expect(after.store[0].measures).toEqual(after.pattern.measures);
  // It carries the `custom` Tag.
  await expect(page.locator('.header-tags .tag-chip.automatic', { hasText: /^custom$/ })).toHaveCount(1);
  await expect(page.locator('.header-tags .tag-chip.automatic', { hasText: /^built-in$/ })).toHaveCount(0);

  // The shipped Pattern itself is completely unchanged.
  const original = await page.evaluate(
    (id) => window.__rm.seedStore.loadAll().find((x) => x.id === id),
    shipped.id
  );
  expect(original).toEqual(shipped);
});

test('AC-7.4.2 — Confirming Make Copy creates an independent Pattern', async ({ page }) => {
  await page.goto('/');
  let fill = { ...create('My Custom Fill'), id: 'p_fill' };
  fill = cycleAccent(fill, 0, 0, 0);
  fill = cycleAccent(fill, 0, 2, 2);
  await openOwned(page, fill);

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('My Custom Fill (Melodic)');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  // Note-for-note identical at this moment, so the duplicate warning asks first.
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();

  // The editor now targets the copy …
  await expect(page.locator('.pattern-title')).toHaveValue('My Custom Fill (Melodic)');
  const copy = await state(page);
  expect(copy.id).not.toBe('p_fill');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(true);
  // … which carries the original's content as it stood.
  expect(copy.measures).toEqual(fill.measures);
  expect((await stored(page, copy.id)).measures).toEqual(fill.measures);

  // Editing the copy leaves the original as it was.
  await page.locator('.slot[data-measure="0"][data-beat="1"][data-slot="0"]').click();
  expect((await stored(page, 'p_fill')).measures).toEqual(fill.measures);
  const copyEdited = (await stored(page, copy.id)).measures;
  expect(copyEdited).not.toEqual(fill.measures);

  // The original keeps auto-saving on its own: edit it, and the copy does not move.
  await page.evaluate(() =>
    window.__rm.loadPattern(window.__rm.patternStore.findById('p_fill'), { owned: true })
  );
  await expect(page.locator('.pattern-title')).toHaveValue('My Custom Fill');
  await page.locator('.slot[data-measure="0"][data-beat="3"][data-slot="0"]').click();
  expect((await stored(page, 'p_fill')).measures[0].beats[3].slots[0].on).toBe(true);
  expect((await stored(page, copy.id)).measures).toEqual(copyEdited);
});

test('AC-7.5.1 — Delete requires a naming confirmation', async ({ page }) => {
  await page.goto('/');
  await openOwned(page, { ...create('My Custom Fill'), id: 'p_fill' });

  await page.locator('[data-action="delete-pattern"]').click();
  // A confirmation naming the Pattern stands between the choice and the removal.
  await expect(page.locator('.dialog-message')).toContainText('My Custom Fill');
  expect(await stored(page, 'p_fill')).not.toBeNull();

  // Backing out removes nothing.
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await stored(page, 'p_fill')).not.toBeNull();
  await expect(page.locator('.pattern-title')).toHaveValue('My Custom Fill');

  // Only confirming it removes the Pattern.
  await page.locator('[data-action="delete-pattern"]').click();
  await expect(page.locator('.dialog-message')).toContainText('My Custom Fill');
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();
  expect(await stored(page, 'p_fill')).toBeFalsy();
});

// --- US-8.1 ------------------------------------------------------------------

test('AC-8.1.1 — Combine has no meter-matching restriction', async ({ page }) => {
  await page.goto('/');
  let take2 = { ...create('Bossa Take 2'), id: 'p_take2' };
  take2 = addMeasure(take2);
  take2 = setTimeSignature(take2, 0, '6/8');
  take2 = setTimeSignature(take2, 1, '7/8');
  take2 = cycleAccent(take2, 1, 6, 0);
  await page.evaluate((p) => window.__rm.patternStore.upsert(p), take2);
  const grooveA = cycleAccent({ ...create('Groove A'), id: 'p_groove' }, 0, 0, 0);
  await openOwned(page, grooveA);

  await page.locator('[data-action="append-pattern"]').click();
  await page.locator('.dialog-button', { hasText: /^Bossa Take 2$/ }).click();

  // The concatenation succeeds: no refusal, and every Measure keeps its own meter.
  await expect(page.locator('.measure')).toHaveCount(3);
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await meters(page)).toEqual(['4/4', '6/8', '7/8']);
  const p = await state(page);
  expect(p.measures).toEqual([...grooveA.measures, ...take2.measures]);
});

// --- US-10.1 -----------------------------------------------------------------

test('AC-10.1.1 — Duplicate copies the full Measure sequence exactly', async ({ page }) => {
  await page.goto('/');
  // "Groove A": three Measures in three meters, Melodic, with non-default
  // Recipes, an Accent override and a Pitch on every sounding Slot.
  let p = { ...create('Groove A'), id: 'p_groove', soundMode: 'melodic', key: 'D', scale: 'ionian' };
  p = addMeasure(addMeasure(p));
  p = setTimeSignature(p, 1, '6/8');
  p = setTimeSignature(p, 2, '3/4');
  p = setRecipe(p, 0, 1, 'triplet-8ths');
  p = setRecipe(p, 1, 0, 'undivided');
  p = setRecipe(p, 2, 2, 'straight-8ths');
  const notes = [
    [0, 0, 0, { degree: '1', octaveOffset: 0 }],
    [0, 1, 2, { degree: 'b3', octaveOffset: 0 }],
    [1, 0, 0, { degree: '5', octaveOffset: -1 }],
    [1, 4, 1, { degree: '2', octaveOffset: 1 }],
    [2, 2, 1, { degree: '7', octaveOffset: 0 }],
  ];
  for (const [m, b, s, pitch] of notes) {
    p = cycleAccent(p, m, b, s);
    p = setPitch(p, m, b, s, pitch);
  }
  p = cycleAccent(p, 0, 0, 0); // an explicit Accent override, not the computed default
  expect(p.measures[0].beats[0].slots[0].accent).toBeDefined();
  await openOwned(page, p);

  // A Melodic Pattern opens on the Melody tab; Double Length sits with the
  // Measure controls on Rhythm (AC-15.1.7/3).
  await page.locator('.workbench-tab[data-tab="rhythm"]').click();
  await page.locator('.rhythm-group [data-action="duplicate-pattern"]').click();

  await expect(page.locator('.measure')).toHaveCount(6);
  expect(await meters(page)).toEqual(['4/4', '6/8', '3/4', '4/4', '6/8', '3/4']);
  const after = await state(page);
  expect(after.measures).toHaveLength(6);
  // The first half is the original, untouched; the second is an exact copy of it.
  expect(after.measures.slice(0, 3)).toEqual(p.measures);
  expect(after.measures.slice(3)).toEqual(p.measures);
});

// --- US-12.1 -----------------------------------------------------------------

test('AC-12.1.1 — MIDI generation is entirely client-side', async ({ page, context }) => {
  await page.goto('/');
  await openOwned(page, cycleAccent({ ...create('Samba Break'), id: 'p_samba' }, 0, 0, 0));
  await page.waitForLoadState('networkidle');

  // Watch every request from here on, and take the browser off the network
  // altogether: a server round-trip would either show up or fail.
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await context.setOffline(true);

  const downloading = page.waitForEvent('download');
  await page.locator('[data-action="export-midi"]').click();
  const file = await downloading;
  await context.setOffline(false);

  // Offered as a download, a .mid …
  expect(file.suggestedFilename()).toBe('samba-break.mid');
  expect(await file.failure()).toBeNull();
  const bytes = await readFile(await file.path());
  // … that is a real Standard MIDI File, built in the page.
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('MThd');
  expect(bytes.includes(Buffer.from('MTrk', 'latin1'))).toBe(true);
  // And nothing left the browser to make it.
  expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
});

// --- US-15.1 -----------------------------------------------------------------

test('AC-15.1.1 — Breakpoint definitions', async ({ page }) => {
  for (const [width, layout] of [
    [767, 'mobile'],
    [768, 'tablet'],
    [1100, 'tablet'],
    [1101, 'desktop'],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.shell'), `${width}px`).toHaveAttribute('data-viewport', layout);
  }
});
