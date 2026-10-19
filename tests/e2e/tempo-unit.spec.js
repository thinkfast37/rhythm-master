import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

/*
 * US-4.2 / AC-4.2.7 — A Pattern says which note its tempo counts, and every
 * note lasts its written length. Driven through the ♩/♪ toggle, the real
 * transport (its own snapshot of what it is playing), the MIDI download and
 * the editor's load path.
 */

const toggle = (page) => page.locator('[data-action="toggle-tempo-unit"]');
const snapshot = (page) => page.evaluate(() => window.__rm.transport._snapshot());
const pattern = (page) => page.evaluate(() => window.__rm.getState().pattern);

/** Measures of the given meters, one sounding Slot each, loaded as owned or shipped. */
async function loadMeters(page, meters, { tempo = 120, tempoUnit, owned = true, id = 'p_unit' } = {}) {
  await page.evaluate(
    ({ meters, tempo, tempoUnit, owned, id }) => {
      const beat = (eighth) => (eighth ? { recipe: 'undivided', slots: [{ on: false }] } : { recipe: 'straight-8ths', slots: [{ on: false }, { on: false }] });
      const measures = meters.map((ts) => {
        const [n, d] = ts.split('/').map(Number);
        const beats = Array.from({ length: n }, () => beat(d === 8));
        beats[0].slots[0].on = true;
        return { timeSignature: ts, beats };
      });
      const p = { id, name: owned ? 'Unit Test' : 'Shipped Unit', soundMode: 'percussive', tempo, tags: [], rating: 0, measures };
      if (tempoUnit) p.tempoUnit = tempoUnit;
      window.__rm.loadPattern(p, { owned });
    },
    { meters, tempo, tempoUnit, owned, id }
  );
}

/** Play, read what the transport is running, stop. */
async function played(page) {
  await page.locator('[data-action="play"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  const snap = await snapshot(page);
  await page.locator('[data-action="stop"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
  return snap;
}

/** Time Signature meta events' absolute ticks, and the first tempo in µs per quarter. */
function readMidi(bytes) {
  const division = (bytes[12] << 8) | bytes[13];
  let i = bytes.indexOf(0x4d, 14); // 'M' of MTrk
  i += 8;
  const meters = [];
  let tempo = null;
  let tick = 0;
  while (i < bytes.length) {
    let delta = 0;
    let b;
    do {
      b = bytes[i++];
      delta = (delta << 7) | (b & 0x7f);
    } while (b & 0x80);
    tick += delta;
    if (bytes[i] === 0xff) {
      const type = bytes[i + 1];
      const len = bytes[i + 2];
      if (type === 0x58) meters.push(tick);
      if (type === 0x51 && tempo === null) tempo = (bytes[i + 3] << 16) | (bytes[i + 4] << 8) | bytes[i + 5];
      i += 3 + len;
    } else {
      i += 3;
    }
  }
  return { division, meters, tempo };
}

test('AC-4.2.7/1 — A tempo-unit control beside the BPM entry reads ♩ or ♪ and switches between them; on a shipped Pattern it asks for a name first, as any edit does', async ({ page }) => {
  await page.goto('/');
  await loadMeters(page, ['4/4']);
  // Beside the BPM entry, in the pinned bar.
  const pinned = page.locator('.tempo-pinned');
  await expect(pinned.locator('[data-action="toggle-tempo-unit"]')).toHaveText('♩');
  await expect(pinned.locator('.tempo-entry')).toBeVisible();

  await toggle(page).click();
  await expect(toggle(page)).toHaveText('♪');
  const saved = await page.evaluate(() => window.__rm.patternStore.findById('p_unit').tempoUnit);
  expect(saved).toBe('eighth');
  await toggle(page).click();
  await expect(toggle(page)).toHaveText('♩');

  // Shipped: the naming prompt first; cancelling changes nothing.
  // A different meter, so the copy duplicates nothing already owned (AC-11.1.3).
  await loadMeters(page, ['3/4'], { owned: false, id: 's_unit' });
  await toggle(page).click();
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(toggle(page)).toHaveText('♩');
  expect((await pattern(page)).tempoUnit).toBe('quarter');
  await toggle(page).click();
  await page.locator('.dialog-input').fill('My Eighths');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await expect(toggle(page)).toHaveText('♪');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(true);
});

test('AC-4.2.7/2 — At ♩ = 120 a quarter-note Beat lasts 0.5 s and an eighth-note Beat 0.25 s; at ♪ = 120 an eighth-note Beat lasts 0.5 s and a quarter-note Beat 1 s', async ({ page }) => {
  await page.goto('/');
  await loadMeters(page, ['1/4', '2/8'], { tempoUnit: 'quarter' });
  let snap = await played(page);
  expect(snap.beatTimes).toEqual([0, 0.5, 0.75]);
  expect(snap.loopDuration).toBeCloseTo(1, 10);

  await toggle(page).click();
  await expect(toggle(page)).toHaveText('♪');
  snap = await played(page);
  expect(snap.beatTimes).toEqual([0, 1, 1.5]);
  expect(snap.loopDuration).toBeCloseTo(2, 10);
});

test('AC-4.2.7/3 — A 3/8 Measure and a 5/8 Measure together last exactly as long as one 4/4 Measure at the same tempo, in playback and in the exported MIDI file', async ({ page }) => {
  await page.goto('/');
  await loadMeters(page, ['4/4'], { tempo: 100 });
  const bar = (await played(page)).loopDuration;

  await loadMeters(page, ['4/4', '3/8', '5/8'], { tempo: 100, id: 'p_split' });
  const split = await played(page);
  expect(split.loopDuration).toBeCloseTo(2 * bar, 10);
  // The 5/8 starts three eighths after the 3/8.
  expect(split.beatTimes[4 + 3] - split.beatTimes[4]).toBeCloseTo((3 / 8) * bar, 10);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-midi"]').click()]);
  const midi = readMidi(readFileSync(await download.path()));
  const q = midi.division;
  expect(midi.meters).toEqual([0, 4 * q, 5.5 * q]);
  // 100 quarters a minute: 600,000 µs per quarter.
  expect(midi.tempo).toBe(600000);
});

test("AC-4.2.7/4 — The metronome clicks every Beat at its own length, and the count-in counts the first Measure's Beats at their length", async ({ page }) => {
  await page.goto('/');
  // The click and count-in toggles are in the Practice group (AC-15.1.7).
  await page.evaluate(() => window.__rm.handlers.onWorkbenchTab('practice'));
  await page.locator('[data-action="toggle-metronome"]').click();
  await page.locator('[data-action="toggle-count-in"]').click();
  // 6/8 then 4/4 at ♩ = 120: eighths of 0.25 s, then quarters of 0.5 s.
  await loadMeters(page, ['6/8', '4/4'], { tempoUnit: 'quarter' });
  const snap = await played(page);
  expect(snap.beatTimes).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]);
  // Six eighth-note Beats of count-in, not six of the loop's average Beat.
  expect(snap.countInSeconds).toBeCloseTo(1.5, 10);
});

test("AC-4.2.7/5 — A Pattern that does not state a unit counts the note value of its first Measure's Beat, so one saved before the unit existed plays as it did whenever its Measures share a note value; opening it in the editor states that unit, so changing the first Measure's meter later does not retime it", async ({ page }) => {
  await page.goto('/');
  // Saved before the unit existed: 6/8 at 80, no tempoUnit.
  await page.evaluate(() => {
    const beats = Array.from({ length: 6 }, () => ({ recipe: 'undivided', slots: [{ on: true }] }));
    window.__rm.patternStore.upsert({ id: 'p_old', name: 'Old Six Eight', soundMode: 'percussive', tempo: 80, tags: [], rating: 0, measures: [{ timeSignature: '6/8', beats }] });
    window.__rm.loadPattern(window.__rm.patternStore.findById('p_old'), { owned: true });
  });
  await expect(toggle(page)).toHaveText('♪');
  // As it played before: each eighth-note Beat lasts 60/80 s.
  const snap = await played(page);
  expect(snap.beatTimes[1]).toBeCloseTo(60 / 80, 10);
  expect((await pattern(page)).tempoUnit).toBe('eighth');

  // Change Measure 1 to 4/4: still ♪, so a quarter-note Beat now lasts two eighths.
  await page.locator('[data-action="change-time-signature"][data-measure="0"]').click();
  await page.locator('.dialog-button', { hasText: '4/4' }).click();
  await expect(toggle(page)).toHaveText('♪');
  const stored = await page.evaluate(() => window.__rm.patternStore.findById('p_old'));
  expect(stored.measures[0].timeSignature).toBe('4/4');
  expect(stored.tempoUnit).toBe('eighth');
  const after = await played(page);
  expect(after.beatTimes[1]).toBeCloseTo(2 * (60 / 80), 10);
});
