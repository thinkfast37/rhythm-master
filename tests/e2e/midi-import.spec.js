/**
 * Importing a .mid file as a Melodic Pattern, end to end (US-12.4): the control
 * in the library panel, the file through the real picker, the name prompt, and
 * what the library holds afterwards.
 */
import { test, expect } from '@playwright/test';
import { smf, note } from '../fixtures/midi-bytes.js';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

const Q = 480;

/** A two-Measure file named in its track, with notes early, late and together. */
const melody = (name = 'Blue Line') =>
  smf([
    [
      { tick: 0, kind: 'name', text: name },
      { tick: 0, kind: 'tempo', bpm: 96 },
      { tick: 0, kind: 'timeSignature', numerator: 3, denominator: 4 },
      { tick: 0, kind: 'keySignature', sharps: 1, minor: false },
      ...note(0, 67, 120),
      ...note(Q - 15, 71, 70),
      ...note(2 * Q + 20, 74, 40),
      ...note(3 * Q, 67, 100),
      ...note(3 * Q, 79, 60),
    ],
  ]);

const patterns = (page) => page.evaluate(() => window.__rm.patternStore.loadAll());

/** Press Import MIDI and hand the picker `bytes` under `name`. */
async function pickMidi(page, bytes, name = 'line.mid') {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-action="import-midi"]').click(),
  ]);
  await chooser.setFiles({ name, mimeType: 'audio/midi', buffer: Buffer.from(bytes) });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('AC-12.4.1/1 — An Import MIDI control sits beside Back up library and Restore library in the library panel, under every goal', async ({ page }) => {
  const row = page.locator('.library-backup');
  await expect(row.locator('[data-action="backup-library"]')).toBeVisible();
  await expect(row.locator('[data-action="restore-library"]')).toBeVisible();
  await expect(row.locator('[data-action="import-midi"]')).toHaveText('Import MIDI');

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('[data-action="show-goals"]').click();
  await page.locator('.goal-card[data-goal="practise"]').click();
  await page.locator('.library-toggle').click();
  await expect(page.locator('[data-action="new-pattern"]')).toBeHidden();
  await expect(page.locator('.library-backup [data-action="import-midi"]')).toBeVisible();
});

test('AC-12.4.1/2 — It opens a file picker accepting `.mid` and `.midi` files, and the file is read and turned into a Pattern entirely in the browser', async ({ page }) => {
  const accept = await page.locator('.import-midi-file').getAttribute('accept');
  expect(accept.split(',')).toEqual(expect.arrayContaining(['.mid', '.midi']));

  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await pickMidi(page, melody());
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Import' }).click();
  await expect(page.locator('.dialog-input')).toHaveCount(0);

  const [imported] = await patterns(page);
  expect(imported.soundMode).toBe('melodic');
  expect(requests.filter((u) => !u.startsWith(new URL(page.url()).origin))).toEqual([]);
});

test("AC-12.4.5/1 — The prompt proposes the file's sequence or track name when it has one, otherwise the file name without its extension", async ({ page }) => {
  await pickMidi(page, melody('Blue Line'), 'something-else.mid');
  await expect(page.locator('.dialog-message')).toHaveText('Name the imported Pattern.');
  await expect(page.locator('.dialog-input')).toHaveValue('Blue Line');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();

  await pickMidi(page, smf([[...note(0, 60)]]), 'Walking Bass.midi');
  await expect(page.locator('.dialog-input')).toHaveValue('Walking Bass');
});

test('AC-12.4.5/2 — A name the library already holds, compared case-insensitively as Make Copy compares (AC-7.4.4), is refused with a message and the prompt stays open for another', async ({ page }) => {
  const existing = await page.evaluate(() => window.__rm.seedStore.loadAll()[3].name);
  await pickMidi(page, melody());
  await page.locator('.dialog-input').fill(existing.toUpperCase());
  await page.locator('.dialog-button', { hasText: 'Import' }).click();

  await expect(page.locator('.dialog-error')).toContainText('already exists');
  await expect(page.locator('.dialog-input')).toBeVisible();
  expect(await patterns(page)).toHaveLength(0);

  await page.locator('.dialog-input').fill('Blue Line Imported');
  await page.locator('.dialog-button', { hasText: 'Import' }).click();
  await expect(page.locator('.dialog-input')).toHaveCount(0);
  expect((await patterns(page)).map((p) => p.name)).toEqual(['Blue Line Imported']);
});

test('AC-12.4.5/3 — Cancel creates nothing: the library and the loaded Pattern are as they were', async ({ page }) => {
  const loadedBefore = await page.evaluate(() => window.__rm.getState().pattern.id);
  await pickMidi(page, melody());
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.dialog-input')).toHaveCount(0);

  expect(await patterns(page)).toHaveLength(0);
  expect(await page.evaluate(() => window.__rm.getState().pattern.id)).toBe(loadedBefore);
});

test('AC-12.4.5/4 — Confirming creates an owned Melodic Pattern under that name in `rm.patterns.v1`, loads it, and shows it in the library at once', async ({ page }) => {
  await pickMidi(page, melody());
  await page.locator('.dialog-input').fill('Blue Line');
  await page.locator('.dialog-button', { hasText: 'Import' }).click();
  await expect(page.locator('.dialog-input')).toHaveCount(0);

  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('rm.patterns.v1')));
  const list = Array.isArray(stored) ? stored : stored.patterns;
  expect(list.map((p) => p.name)).toEqual(['Blue Line']);

  const state = await page.evaluate(() => {
    const s = window.__rm.getState();
    return { name: s.pattern.name, owned: s.isOwned, soundMode: s.pattern.soundMode, key: s.pattern.key, tempo: s.pattern.tempo, meters: s.pattern.measures.map((m) => m.timeSignature) };
  });
  expect(state).toEqual({ name: 'Blue Line', owned: true, soundMode: 'melodic', key: 'G', tempo: 96, meters: ['3/4', '3/4'] });

  // In the library list, as the current Pattern.
  await expect(page.locator('.pattern-item.current .pattern-name')).toHaveText('Blue Line');

  // What the file held, on the grid: early and late notes on their nearest 16ths,
  // the shared syllable holding the higher note, velocities as Accent Levels.
  const slots = await page.evaluate(() => {
    const out = [];
    window.__rm.getState().pattern.measures.forEach((m, mi) =>
      m.beats.forEach((b, bi) =>
        b.slots.forEach((s, si) => {
          if (s.on) out.push([mi, bi, si, s.accent ?? null, s.pitch.degree, s.pitch.octaveOffset]);
        })
      )
    );
    return out;
  });
  expect(slots).toEqual([
    [0, 0, 0, null, '1', 0], // G4 at 120: Strong is the downbeat's default
    [0, 1, 0, 2, '3', 0], // B4, early, at 70
    [0, 2, 0, null, '5', 0], // D5, late, at 40: Weak is the third Beat's default, so not stored
    [1, 0, 0, 1, '1', 1], // G5 over G4 on the same syllable, at 60
  ]);
});

test('AC-12.4.6/1 — A file that is not a Standard MIDI File is refused with a message and nothing is written', async ({ page }) => {
  await pickMidi(page, Buffer.from('{"format":"rhythm-master-backup"}'), 'backup.json');
  await expect(page.locator('.dialog-message')).toContainText('not a MIDI file');
  await expect(page.locator('.dialog-input')).toHaveCount(0);
  await page.locator('.dialog-button', { hasText: 'OK' }).click();
  expect(await patterns(page)).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('rm.patterns.v1'))).toBeNull();
});

test('AC-12.4.6/4 — A file longer than 32 Measures imports its first 32 Measures, and a message says how many were left out', async ({ page }) => {
  await pickMidi(page, smf([[...note(0, 60), ...note(34 * 4 * Q, 64)]]), 'long.mid');
  await expect(page.locator('.dialog-message')).toContainText('longer than 32 Measures');
  await expect(page.locator('.dialog-message')).toContainText('3 Measures are left out');
  await page.locator('.dialog-button', { hasText: 'OK' }).click();
  await expect(page.locator('.dialog-input')).toHaveValue('long');
  await page.locator('.dialog-button', { hasText: 'Import' }).click();
  await expect(page.locator('.dialog-input')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.getState().pattern.measures.length)).toBe(32);
});
