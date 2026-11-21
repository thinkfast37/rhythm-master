import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

/*
 * US-4.2 / AC-4.2.7 — The tempo counts the first Measure's Beat, and every
 * note lasts its written length. Driven through the ♩/♪ mark, the real
 * transport (its own snapshot of what it is playing), the MIDI download, the
 * store and the editor's load path.
 */

const mark = (page) => page.locator('.tempo-pinned .tempo-unit-mark');
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

test('AC-4.2.7/1 — Beside the BPM entry a mark reads ♩ or ♪ for the note the tempo counts; it is not a control, and pressing it changes nothing', async ({ page }) => {
  await page.goto('/');
  await loadMeters(page, ['4/4']);
  // Beside the BPM entry, in the pinned bar.
  const pinned = page.locator('.tempo-pinned');
  await expect(mark(page)).toHaveText('♩');
  await expect(pinned.locator('.tempo-entry')).toBeVisible();
  // Not a control: no button, nothing to switch it with.
  await expect(pinned.locator('button')).toHaveCount(0);
  await expect(page.locator('[data-action="toggle-tempo-unit"]')).toHaveCount(0);
  await mark(page).click();
  await expect(mark(page)).toHaveText('♩');
  expect((await pattern(page)).tempoUnit).toBeUndefined();
  expect((await played(page)).beatTimes).toEqual([0, 0.5, 1, 1.5]);

  // A /8 first Measure reads ♪.
  await loadMeters(page, ['6/8'], { id: 'p_six' });
  await expect(mark(page)).toHaveText('♪');
});

test('AC-4.2.7/2 — At ♩ = 120 a quarter-note Beat lasts 0.5 s and an eighth-note Beat 0.25 s; at ♪ = 120 an eighth-note Beat lasts 0.5 s and a quarter-note Beat 1 s', async ({ page }) => {
  await page.goto('/');
  // A /4 first Measure: the tempo counts quarters.
  await loadMeters(page, ['1/4', '2/8']);
  await expect(mark(page)).toHaveText('♩');
  let snap = await played(page);
  expect(snap.beatTimes).toEqual([0, 0.5, 0.75]);
  expect(snap.loopDuration).toBeCloseTo(1, 10);

  // A /8 first Measure: the tempo counts eighths.
  await loadMeters(page, ['2/8', '1/4'], { id: 'p_eighths' });
  await expect(mark(page)).toHaveText('♪');
  snap = await played(page);
  expect(snap.beatTimes).toEqual([0, 0.5, 1]);
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

test("AC-4.2.7/4 — With the click counting the Beat, the metronome clicks every Beat at its own length, and the count-in counts the first Measure's Beats at their length", async ({ page }) => {
  await page.goto('/');
  // The click and count-in toggles are in the Practice group (AC-15.1.7).
  await page.evaluate(() => window.__rm.handlers.onWorkbenchTab('practice'));
  await page.locator('[data-action="toggle-metronome"]').click();
  await page.locator('[data-action="toggle-count-in"]').click();
  await expect(page.locator('[data-action="set-click-value"]').first()).toHaveValue('beat');
  // 4/4 then 6/8 at ♩ = 120: quarters of 0.5 s, then eighths of 0.25 s.
  await loadMeters(page, ['4/4', '6/8']);
  let snap = await played(page);
  expect(snap.beatTimes).toEqual([0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.25]);
  expect(snap.countInSeconds).toBeCloseTo(2, 10);
  // 6/8 then 4/4 at ♪ = 120: eighths of 0.5 s, then quarters of 1 s; six
  // eighth-note Beats of count-in, not six of the loop's average Beat.
  await loadMeters(page, ['6/8', '4/4'], { id: 'p_six_four' });
  snap = await played(page);
  expect(snap.beatTimes).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]);
  expect(snap.countInSeconds).toBeCloseTo(3, 10);
});

test("AC-4.2.7/5 — A Pattern saved with a tempo unit of its own counts its first Measure's Beat instead, and the stored unit is not written back when it is saved", async ({ page }) => {
  await page.goto('/');
  // Saved by the old ♩/♪ control: 4/4 at 80, switched to ♪ by hand.
  await page.evaluate(() => {
    const beats = Array.from({ length: 4 }, () => ({ recipe: 'straight-8ths', slots: [{ on: true }, { on: false }] }));
    const p = { id: 'p_old', name: 'Old Switched', soundMode: 'percussive', tempo: 80, tempoUnit: 'eighth', tags: [], rating: 0, measures: [{ timeSignature: '4/4', beats }] };
    // Written raw, as the old control wrote it: saveAll stamps the schema and nothing else.
    window.__rm.patternStore.saveAll([p]);
  });
  await page.reload();
  await page.evaluate(() => window.__rm.loadPattern(window.__rm.patternStore.findById('p_old'), { owned: true }));
  await expect(mark(page)).toHaveText('♩');
  // A quarter-note Beat lasts 60/80 s, as ♩ = 80.
  const snap = await played(page);
  expect(snap.beatTimes[1]).toBeCloseTo(60 / 80, 10);
  expect((await pattern(page)).tempoUnit).toBeUndefined();

  // An edit saves it, and the old unit is gone from the store.
  await page.locator('[data-action="change-time-signature"][data-measure="0"]').click();
  await page.locator('.dialog-button', { hasText: '3/4' }).click();
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('rm.patterns.v1')).patterns.find((p) => p.id === 'p_old'));
  expect(raw.measures[0].timeSignature).toBe('3/4');
  expect('tempoUnit' in raw).toBe(false);
});

test('AC-4.2.7/6 — Changing the first Measure between a /4 and a /8 meter changes the note the tempo counts, the number staying as it was', async ({ page }) => {
  await page.goto('/');
  await loadMeters(page, ['4/4'], { tempo: 80 });
  await expect(mark(page)).toHaveText('♩');
  expect((await played(page)).beatTimes[1]).toBeCloseTo(60 / 80, 10);

  await page.locator('[data-action="change-time-signature"][data-measure="0"]').click();
  await page.locator('.dialog-button', { hasText: '6/8' }).click();
  await expect(mark(page)).toHaveText('♪');
  expect((await pattern(page)).tempo).toBe(80);
  // Now ♪ = 80: each eighth-note Beat lasts 60/80 s.
  expect((await played(page)).beatTimes[1]).toBeCloseTo(60 / 80, 10);
});
