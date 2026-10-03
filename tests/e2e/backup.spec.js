/**
 * The whole-library backup, end to end (US-7.6): the controls in the library
 * panel, the file they download, and a restore through the real file picker.
 */
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

const KEYS = ['rm.patterns.v1', 'rm.overlays.v1', 'rm.songs.v1', 'rm.settings.v1', 'rm.localMeta.v1'];

/** Every store as stored, parsed; null where never written. */
const stores = (page) =>
  page.evaluate(
    (keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k) && JSON.parse(localStorage.getItem(k))])),
    KEYS
  );

/** Put something in every store, then reload so the app reads it. Returns the shipped Pattern's id. */
async function fillLibrary(page) {
  await page.goto('/');
  const shippedId = await page.evaluate(() => {
    const rm = window.__rm;
    const shipped = rm.getState().pattern;
    rm.patternStore.upsert({ ...structuredClone(shipped), id: 'p_1', name: 'Backed Up Groove' });
    rm.overlayStore.setRating(shipped.id, 4);
    localStorage.setItem(
      'rm.songs.v1',
      JSON.stringify({ schemaVersion: 1, songs: [{ id: 'song_1', name: 'Verse', sections: [{ patternId: 'p_1', entries: [] }] }] })
    );
    const settings = JSON.parse(localStorage.getItem('rm.settings.v1'));
    localStorage.setItem('rm.settings.v1', JSON.stringify({ ...settings, countingSystem: 'numbered' }));
    // Copies of a shipped Pattern, so answered as duplicates, or the one-time prompt (AC-11.3.5) would be in the way.
    rm.localMetaStore.update('p_1', { submittedAt: '2026-10-01T00:00:00Z', duplicateResolved: true });
    return shipped.id;
  });
  await page.reload();
  return shippedId;
}

/** Press Back up library and return the download and its parsed contents. */
async function backUp(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="backup-library"]').click(),
  ]);
  const path = await download.path();
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(path, 'utf8');
  return { download, text, file: JSON.parse(text) };
}

/** Press Restore library and pick a file with the given text through the real file picker. */
async function pickRestoreFile(page, text, name = 'backup.json') {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-action="restore-library"]').click(),
  ]);
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

test('AC-7.6.1/1 — A Back up library control in the library panel, offered under every goal, downloads one JSON file named for the day it was made', async ({ page }) => {
  await fillLibrary(page);
  const library = page.locator('.library');
  await expect(library.locator('[data-action="backup-library"]')).toHaveText('Back up library');

  const before = await stores(page);
  const { download, file } = await backUp(page);
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  expect(download.suggestedFilename()).toBe(`rhythm-master-backup-${today}.json`);
  expect(file.format).toBe('rhythm-master-backup');
  for (const key of KEYS) expect(file.stores[key]).toEqual(before[key]);
  // Backing up changes nothing.
  expect(await stores(page)).toEqual(before);
});

test('AC-7.6.1/1 — A Back up library control in the library panel, offered under every goal, downloads one JSON file named for the day it was made: under a practice goal too', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.locator('[data-action="show-goals"]').click();
  await page.locator('.goal-card[data-goal="play"]').click();
  await page.locator('.library-toggle').click();
  await expect(page.locator('[data-action="new-pattern"]')).toBeHidden();
  await expect(page.locator('[data-action="backup-library"]')).toBeVisible();
  await expect(page.locator('[data-action="restore-library"]')).toBeVisible();
  const { file } = await backUp(page);
  expect(file.stores['rm.settings.v1'].goal).toBe('play');
});

test('AC-7.6.2/1 — A Restore library control beside Back up library opens a file picker; once a file is picked, a prompt says the current library will be replaced, and Cancel changes nothing', async ({ page }) => {
  await fillLibrary(page);
  const { text } = await backUp(page);
  await page.evaluate(() => window.__rm.overlayStore.setRating('p_1', 2));
  const before = await stores(page);

  const row = page.locator('.library-backup');
  await expect(row.locator('[data-action="restore-library"]')).toHaveText('Restore library');
  await pickRestoreFile(page, text);

  await expect(page.locator('.dialog-message')).toContainText('replaces everything');
  await expect(page.locator('.dialog-button', { hasText: 'Replace library' })).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.dialog-message')).toHaveCount(0);
  expect(await stores(page)).toEqual(before);
});

test('AC-7.6.2/3 — After restoring, the app shows the backed-up library — its custom Patterns, ratings, Songs and settings — and nothing added since the backup', async ({ page }) => {
  const shippedId = await fillLibrary(page);
  const { file, text } = await backUp(page);

  // After the backup: a new Pattern, a changed rating, a changed setting, a Song gone.
  await page.evaluate((id) => {
    const rm = window.__rm;
    rm.patternStore.upsert({ ...structuredClone(rm.getState().pattern), id: 'p_2', name: 'Added Later' });
    rm.localMetaStore.update('p_2', { duplicateResolved: true });
    rm.overlayStore.setRating(id, 1);
    localStorage.removeItem('rm.songs.v1');
    const settings = JSON.parse(localStorage.getItem('rm.settings.v1'));
    localStorage.setItem('rm.settings.v1', JSON.stringify({ ...settings, countingSystem: 'takadimi' }));
  }, shippedId);
  await page.reload();
  await expect(page.locator('.pattern-item', { hasText: 'Added Later' })).toHaveCount(1);

  await pickRestoreFile(page, text);
  await Promise.all([page.waitForEvent('load'), page.locator('.dialog-button', { hasText: 'Replace library' }).click()]);

  await expect(page.locator('.pattern-item', { hasText: 'Backed Up Groove' })).toHaveCount(1);
  await expect(page.locator('.pattern-item', { hasText: 'Added Later' })).toHaveCount(0);
  await expect(page.locator(`.pattern-item[data-pattern-id="${shippedId}"] .rating`)).toHaveAttribute('data-rating', '4');
  const after = await stores(page);
  expect(after['rm.songs.v1']).toEqual(file.stores['rm.songs.v1']);
  expect(after['rm.settings.v1'].countingSystem).toBe('numbered');
  expect(after['rm.localMeta.v1']).toEqual(file.stores['rm.localMeta.v1']);
  expect(after['rm.patterns.v1']).toEqual(file.stores['rm.patterns.v1']);
});

test('AC-7.6.3/1 — A file that is not JSON, or not a Rhythm Master backup, is refused with a message and leaves the library as it was', async ({ page }) => {
  await fillLibrary(page);
  const before = await stores(page);

  for (const text of ['this is not json {', JSON.stringify({ schemaVersion: 1, patterns: [] })]) {
    await pickRestoreFile(page, text, 'notes.json');
    await expect(page.locator('.dialog-message')).toHaveText('This file is not a Rhythm Master backup.');
    await expect(page.locator('.dialog-button', { hasText: 'Replace library' })).toHaveCount(0);
    await page.locator('.dialog-button', { hasText: 'OK' }).click();
    await expect(page.locator('.dialog-message')).toHaveCount(0);
    expect(await stores(page)).toEqual(before);
  }
  await expect(page.locator('.pattern-item', { hasText: 'Backed Up Groove' })).toHaveCount(1);
});
