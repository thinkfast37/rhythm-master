/**
 * Choose how long exported notes last (US-12.5), and an Arrangement's
 * multi-track MIDI file (US-20.3) — the controls and the downloaded files,
 * proven in the DOM. The lengths themselves are proven on the exporter in
 * tests/unit/export/articulation-midi.test.js.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, loadFourBeats, recordAll } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const DJEMBE = 's_108';
const option = (scope, id) => scope.locator(`.midi-articulation-option[data-articulation="${id}"]`);
const chosen = (scope) => scope.locator('.midi-articulation-switch');
const settings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1') ?? '{}'));

/** The bytes of whatever a click downloads, with the name it is offered under. */
async function downloadFrom(page, locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), locator.click()]);
  const { readFile } = await import('node:fs/promises');
  return { name: download.suggestedFilename(), bytes: new Uint8Array(await readFile(await download.path())) };
}

/** Each track's name, programs and notes (start, length, pitch, channel), read from a MIDI file. */
function readMidi(bytes) {
  const u16 = (o) => (bytes[o] << 8) | bytes[o + 1];
  const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const tracks = [];
  let offset = 14;
  for (let t = 0; t < u16(10); t++) {
    const end = offset + 8 + u32(offset + 4);
    let p = offset + 8;
    let tick = 0;
    const open = new Map();
    const track = { name: null, programs: [], notes: [], endTick: 0 };
    while (p < end) {
      let delta = 0;
      for (;;) {
        const b = bytes[p++];
        delta = (delta << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      tick += delta;
      const status = bytes[p++];
      if (status === 0xff) {
        const type = bytes[p++];
        const len = bytes[p++];
        if (type === 0x03) track.name = new TextDecoder().decode(bytes.slice(p, p + len));
        if (type === 0x2f) track.endTick = tick;
        p += len;
      } else if ((status & 0xf0) === 0xc0) {
        track.programs.push({ channel: status & 0x0f, program: bytes[p++] });
      } else {
        const key = `${status & 0x0f}:${bytes[p]}`;
        const pitch = bytes[p++];
        const velocity = bytes[p++];
        if ((status & 0xf0) === 0x90 && velocity > 0) open.set(key, [...(open.get(key) ?? []), { tick, pitch, channel: status & 0x0f }]);
        else {
          const started = open.get(key)?.shift();
          if (started) track.notes.push({ ...started, length: tick - started.tick });
        }
      }
    }
    tracks.push(track);
    offset = end;
  }
  return { format: u16(8), tracks };
}

async function nameInDialog(page, name) {
  await expect(page.locator('.dialog')).toBeVisible();
  if (name !== undefined) await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog .dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
}

/** An owned four-Beat Melodic Pattern, one note on each Beat, open in Practice. */
async function melodicPattern(page) {
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  for (let b = 0; b < 4; b++) await page.locator(`.grid .slot[data-beat="${b}"][data-slot="0"]`).click();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(page.locator('.voice-switch')).toBeVisible();
}

/** Save an Arrangement straight to its store and open it in Arrange. */
async function openArrangement(page, sequence, { tempo = 120, name = 'Sunday song' } = {}) {
  const id = await page.evaluate(
    ([n, t, seq]) => {
      const seen = new Set();
      const palette = seq.filter((e) => !seen.has(`${e.kind}:${e.id}`) && seen.add(`${e.kind}:${e.id}`)).map(({ kind, id }) => ({ kind, id }));
      return window.__rm.arrangementStore.upsert({ name: n, tempo: t, palette, entries: seq }).id;
    },
    [name, tempo, sequence]
  );
  await page.evaluate((i) => window.__rm.handlers.onOpenArrangement(i), id);
  await expect(page.locator('.arrange-panel')).toBeVisible();
}

// --- AC-12.5.1: the choice -------------------------------------------------------------

test('AC-12.5.1/1 — Beside each MIDI export — of a Pattern, a Chain, a Section and an Arrangement — a note-length choice offers Staccato and Legato, with Staccato chosen until Legato is', async ({ page }) => {
  await openApp(page);
  const beside = async (exportButton, what) => {
    const choice = exportButton.locator('xpath=following-sibling::*[contains(@class, "midi-articulation")][1]');
    await expect(choice, what).toBeVisible();
    await expect(choice.locator('.midi-articulation-option'), what).toHaveText(['Staccato', 'Legato']);
    await expect(option(choice, 'staccato'), what).toHaveAttribute('aria-pressed', 'true');
    await expect(option(choice, 'legato'), what).toHaveAttribute('aria-pressed', 'false');
    // The export and its choice share a parent: it is the export's own.
    expect(await exportButton.evaluate((b) => b.parentElement === b.parentElement.querySelector('.midi-articulation')?.parentElement), what).toBe(true);
  };

  // A Pattern's, among the Pattern actions.
  await beside(page.locator('[data-action="export-midi"]'), 'Pattern');

  // A Chain's, in the Compose group of a Pattern with a progression.
  await melodicPattern(page);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await page.locator('.workbench-tab[data-tab="compose"]').click();
  await beside(page.locator('[data-section="compose"] [data-action="chain-export"]'), 'Chain');

  // A Section's, in the Composer's Layers section.
  await loadFourBeats(page);
  await beside(page.locator('.composer-layers .section-export'), 'Section');

  // An Arrangement's, in Arrange.
  await page.locator('.mode-switch [data-mode="arrange"]').click();
  await beside(page.locator('.arrange-panel [data-action="arrange-export"]'), 'Arrangement');
});

test('AC-12.5.1/2 — The note-length choice is one setting for every export, remembered in `rm.settings.v1` and in force after a reload', async ({ page }) => {
  await openApp(page);
  expect((await settings(page)).midiArticulation ?? 'staccato').toBe('staccato');
  // Chosen in Arrange …
  await page.locator('.mode-switch [data-mode="arrange"]').click();
  await option(page.locator('.arrange-panel'), 'legato').click();
  expect((await settings(page)).midiArticulation).toBe('legato');
  // … it is what the Pattern's export shows, and the Composer's.
  await page.locator('.mode-switch [data-mode="practice"]').click();
  await expect(chosen(page.locator('details[data-section="actions"]'))).toHaveAttribute('data-articulation', 'legato');
  await loadFourBeats(page);
  await expect(chosen(page.locator('.composer-layers'))).toHaveAttribute('data-articulation', 'legato');
  // And after a reload.
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  expect((await settings(page)).midiArticulation).toBe('legato');
  await expect(chosen(page.locator('details[data-section="actions"]'))).toHaveAttribute('data-articulation', 'legato');
  // Back to Staccato from the Pattern's export: one setting, either way.
  await option(page.locator('details[data-section="actions"]'), 'staccato').click();
  await page.locator('.mode-switch [data-mode="arrange"]').click();
  await expect(chosen(page.locator('.arrange-panel'))).toHaveAttribute('data-articulation', 'staccato');
});

test('AC-12.5.1/3 — On Staccato every exported note is a thirty-second note long, sixty ticks, and the file is byte for byte what it was before the choice existed: the file a press downloads', async ({ page }) => {
  await openApp(page);
  await melodicPattern(page);
  const exportButton = page.locator('[data-action="export-midi"]');
  const staccato = await downloadFrom(page, exportButton);
  expect(readMidi(staccato.bytes).tracks[0].notes.map((n) => n.length)).toEqual([60, 60, 60, 60]);
  // Legato chosen: the same notes, longer; Staccato again: the same bytes as before.
  await option(page.locator('details[data-section="actions"]'), 'legato').click();
  const legato = await downloadFrom(page, exportButton);
  const longer = readMidi(legato.bytes).tracks[0].notes;
  expect(longer.map((n) => [n.tick, n.pitch])).toEqual(readMidi(staccato.bytes).tracks[0].notes.map((n) => [n.tick, n.pitch]));
  expect(longer.every((n) => n.length > 60)).toBe(true);
  await option(page.locator('details[data-section="actions"]'), 'staccato').click();
  const again = await downloadFrom(page, exportButton);
  expect([...again.bytes]).toEqual([...staccato.bytes]);
  expect(again.name).toBe(staccato.name);
});

test('AC-12.5.2/6 — A Pattern and a Chain are lengthened by the voice Practice remembers for the Pattern, Piano when there is none, and each part of a Section or an Arrangement by its own instrument: the Pattern open in Practice', async ({ page }) => {
  await openApp(page);
  await melodicPattern(page);
  // Four different notes, so none is cut short by its own pitch coming round again.
  await page.evaluate(async () => {
    const h = window.__rm.handlers;
    for (const [beat, degree] of [[0, '1'], [1, '3'], [2, '5'], [3, '2']]) {
      await h.onArmDegree(degree);
      await h.onStampPitch(0, beat, 0);
    }
    h.onTempo(60);
  });
  await option(page.locator('details[data-section="actions"]'), 'legato').click();
  const exportButton = page.locator('[data-action="export-midi"]');
  const firstLength = async () => readMidi((await downloadFrom(page, exportButton)).bytes).tracks[0].notes[0].length;
  // No voice chosen for this Pattern: Piano's ring after the quarter to the next note.
  const piano = await firstLength();
  expect(piano).toBeGreaterThan(480);
  // Sax is held to its next note and no longer; Guitar rings longer than the piano.
  await page.locator('.voice-switch [data-voice="sax"]').click();
  expect(await firstLength()).toBe(480);
  await page.locator('.voice-switch [data-voice="guitar"]').click();
  expect(await firstLength()).toBeGreaterThan(piano);
});

// --- AC-20.3.1: the Arrangement's file -------------------------------------------------

test('AC-20.3.1/1 — Export MIDI in Arrange downloads one MIDI file named after the Arrangement, and is unavailable while nothing in the sequence can play', async ({ page }) => {
  await openApp(page);
  await page.locator('.mode-switch [data-mode="arrange"]').click();
  const exportButton = page.locator('.arrange-panel [data-action="arrange-export"]');
  await expect(exportButton).toBeDisabled();
  await openArrangement(page, [{ kind: 'pattern', id: 'p_404', name: 'Gone', repeats: 1 }], { name: 'Nothing left' });
  await expect(exportButton).toBeDisabled();
  await openArrangement(page, [{ kind: 'pattern', id: BOSSA, name: 'Intro', repeats: 1 }]);
  await expect(exportButton).toBeEnabled();
  const file = await downloadFrom(page, exportButton);
  expect(file.name).toBe('sunday-song.mid');
  // A MIDI file, Format 1.
  expect(String.fromCharCode(...file.bytes.slice(0, 4))).toBe('MThd');
  expect(readMidi(file.bytes).format).toBe(1);
});

test('AC-20.3.1/3 — Each Pattern laid in the sequence, each part of each Section and each Chain has one track named for it, carrying its notes wherever in the sequence it sounds, so a Pattern laid twice is one track: the file Arrange downloads', async ({ page }) => {
  await openApp(page);
  // A Section in the Composer: a recorded line on Sax with Djembe 2 under it on Bass.
  await loadFourBeats(page);
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  await page.locator('.instrument-switch [data-instrument="sax"]').click();
  await page.locator('.layer-add').click();
  await page.locator(`.pattern-item[data-pattern-id="${DJEMBE}"] [data-action="open-pattern"]`).click();
  const layer = page.locator(`.composer-layers .layer-item[data-pattern-id="${DJEMBE}"]`);
  await expect(layer).toBeVisible();
  await layer.locator('.layer-instrument').selectOption('bass');
  await page.locator('.section-save').click();
  await nameInDialog(page, 'Verse');
  const section = await page.evaluate(() => window.__rm.sectionStore.loadAll()[0].id);

  // Bossa Nova twice, the Section once, Bossa Nova once more.
  await openArrangement(page, [
    { kind: 'pattern', id: BOSSA, name: 'Intro', repeats: 2 },
    { kind: 'section', id: section, name: 'Verse', repeats: 1 },
    { kind: 'pattern', id: BOSSA, name: 'Outro', repeats: 1 },
  ]);
  const file = readMidi((await downloadFrom(page, page.locator('.arrange-panel [data-action="arrange-export"]'))).bytes);
  // The tempo track, the rhythm once, and the Section's two parts.
  expect(file.tracks.map((t) => t.name)).toEqual([null, 'Bossa Nova', 'Verse — My line', 'Verse — Djembe 2']);
  const [conductor, rhythm, line, under] = file.tracks;
  expect(conductor.notes).toEqual([]);
  // One 4/4 Measure at 120 is 1920 ticks: four passes in all.
  expect(rhythm.endTick).toBe(1920 * 4);
  const inPass = (track, k) => track.notes.filter((n) => n.tick >= 1920 * k && n.tick < 1920 * (k + 1)).length;
  expect([inPass(rhythm, 0), inPass(rhythm, 1), inPass(rhythm, 3)].every((n) => n > 0)).toBe(true);
  expect(inPass(rhythm, 2)).toBe(0);
  // The rhythm is the drums it plays, on the drum channel.
  expect(rhythm.notes.every((n) => n.channel === 9 && [36, 38, 43].includes(n.pitch))).toBe(true);
  // The Section's parts sound only under the Section, each on its own channel with its instrument's program.
  for (const part of [line, under]) expect(part.notes.every((n) => n.tick >= 1920 * 2 && n.tick < 1920 * 3)).toBe(true);
  expect(line.notes.map((n) => n.pitch)).toEqual([60, 62, 64, 65]);
  expect(line.programs).toEqual([{ channel: 0, program: 65 }]);
  expect(under.programs).toEqual([{ channel: 1, program: 33 }]);
});
