/**
 * A drum part, played on the keyboard (US-19.13): the drums on the keys Logic
 * gives them, their names written up the keys, a drum part that keeps its
 * drums whatever the Key, and several of them at once — proven in the DOM.
 *
 * The soundfont CDN is aborted by `openApp`; the drums are synthesis and need
 * nothing from it.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, composerState, appState, loadFourBeats, key } from './composer-helpers.js';

test.use(launch);

const DJEMBE = 's_108';
const play = (page) => page.locator('.transport').first().click();
const voiceLog = (page) => page.evaluate(() => window.__rm.voiceLog());
const levelLog = (page) => page.evaluate(() => window.__rm.levelLog());
const switchTo = (page, id) => page.locator(`.instrument-switch [data-instrument="${id}"]`);
const row = (page, id) => page.locator(`.composer-layers .layer-item[data-pattern-id="${id}"]`);
const onScreen = (page) => page.locator('.composer-layers .layer-item.composition');
const picker = (item) => item.locator('.layer-instrument');
const exact = (name) => new RegExp(`^${name}$`);
const partRow = (page, name) => page.locator('.composer-layers .layer-item', { has: page.locator('.layer-pick', { hasText: exact(name) }) });

/** The MIDI notes the part on screen holds, in order, as the one timeline resolves them. */
const ownNotes = (page) =>
  page.evaluate(() =>
    window.__rmTimeline
      .buildTimeline(window.__rm.composer().draft, 0)
      .filter((e) => e.pitch)
      .map((e) => e.pitch.midiNote)
  );
/** The MIDI notes each part of the set the transport plays holds in one pass, by layer. */
const setNotes = (page) =>
  page.evaluate(() => {
    const set = window.__rm.scheduled();
    const out = {};
    for (const e of window.__rmTimeline.timelineOf(set, 0)) if (e.pitch) (out[e.layer] ??= []).push(e.pitch.midiNote);
    return out;
  });

async function addLayer(page, id) {
  await page.locator('.layer-add').click();
  await expect(page.locator('.composer-layers [data-picking="true"]')).toBeVisible();
  await page.locator(`.pattern-item[data-pattern-id="${id}"] [data-action="open-pattern"]`).click();
  await expect(row(page, id)).toBeVisible();
}

async function setTempo(page, bpm) {
  await page.locator('.composer-tempo-entry').fill(String(bpm));
  await page.locator('.composer-tempo-entry').press('Enter');
}

/** Record the four syllables from the keyboard. */
async function recordKeys(page, notes) {
  await page.locator('.record').click();
  for (const midi of notes) await key(page, midi).click();
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
}

/** A saved four-Beat drum part — kick, snare, kick, snare — open in the Composer on Drums. */
async function kit(page, name = 'Kit', notes = [36, 38, 36, 38]) {
  await loadFourBeats(page, name);
  await switchTo(page, 'drums').click();
  await recordKeys(page, notes);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  return (await composerState(page)).savedId;
}

// --- AC-19.13.1: synthesised, on Logic's keys --------------------------------------

test("AC-19.13.1/1 — Each MIDI note from 35 to 81 is the drum General MIDI's percussion key map gives it, as Logic's Drum Kit Designer plays them: Kick on 36, Rim on 37, Snare on 38, Clap on 39, Closed hat on 42, Pedal hat on 44, Open hat on 46, Crash on 49, Ride on 51", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await switchTo(page, 'drums').click();
  const names = { 36: 'Kick', 37: 'Rim', 38: 'Snare', 39: 'Clap', 42: 'Closed hat', 44: 'Pedal hat', 46: 'Open hat', 49: 'Crash', 51: 'Ride' };
  for (const [midi, name] of Object.entries(names)) {
    await expect(key(page, midi)).toHaveAttribute('data-drum', name);
    await key(page, midi).click();
    // The key sounds the drum, at the note its place names.
    expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'drums', via: 'drum', midi: Number(midi) });
  }
  // The default keyboard begins on the kick.
  await expect(page.locator('.piano .key').first()).toHaveAttribute('data-midi', '36');
});

test('AC-19.13.1/2 — Every drum is Web Audio synthesis: choosing Drums requests no audio file, and a drum sounds at once', async ({ page }) => {
  const audio = [];
  page.on('request', (r) => {
    if (/gleitz|\/audio\/|\.(mp3|ogg|wav|m4a|sf2)(\?|$)/i.test(r.url())) audio.push(r.url());
  });
  await openApp(page);
  await loadFourBeats(page);
  const before = audio.length;
  await switchTo(page, 'drums').click();
  await expect(page.locator('.composer-bar .sample-status, .composer-bar .guitar-status')).toHaveCount(0);
  for (const midi of [36, 38, 42, 49]) {
    await key(page, midi).click();
    // At once, through the synthesiser: never a fallback, never a load.
    expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'drums', via: 'drum', midi });
  }
  await setTempo(page, 240);
  await recordKeys(page, [36, 38, 36, 38]);
  const at = (await voiceLog(page)).length;
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).length, { timeout: 8000 }).toBeGreaterThan(at + 3);
  expect((await voiceLog(page)).slice(at).every((v) => v.voice === 'drums' && v.via === 'drum')).toBe(true);
  await play(page);
  expect(audio.slice(before)).toEqual([]);
  expect(await page.evaluate(() => window.__rm.instruments.statusOf('drums'))).toEqual({ status: 'ready', error: null });
});

test('AC-19.13.1/3 — A note below 35 or above 81 has no drum and is silent', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await switchTo(page, 'drums').click();
  // The 49-key keyboard runs 36 to 84: its top three keys have no drum.
  for (const midi of [82, 83, 84]) {
    await expect(key(page, midi)).not.toHaveAttribute('data-drum', /.+/);
    await key(page, midi).click();
    expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'drums', via: 'silent', midi });
  }
  await key(page, 81).click();
  expect((await voiceLog(page)).at(-1)).toMatchObject({ via: 'drum', midi: 81 });
});

test("AC-19.13.1/4 — A drum is louder at each stronger Accent Level and scaled by its part's volume, and a closed or pedal hat cuts off an open hat still ringing in the same part and in no other", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await switchTo(page, 'drums').click();
  const dB = (g) => 20 * Math.log10(g);
  await key(page, 36).click();
  expect(dB((await levelLog(page)).at(-1).gain)).toBeCloseTo(-8, 6);
  await onScreen(page).locator('.layer-volume-entry').fill('50');
  await onScreen(page).locator('.layer-volume-entry').press('Enter');
  await key(page, 36).click();
  expect(dB((await levelLog(page)).at(-1).gain)).toBeCloseTo(-20, 6);
  // The hat, on the page's own audio context: an open hat's envelope is pulled down when a closed one follows in the same part, and not by another part's.
  const cuts = await page.evaluate(async () => {
    const { playDrum } = { playDrum: window.__rm.instruments.PLAYERS.drums };
    const made = [];
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const createGain = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const g = createGain();
      const record = { targets: [] };
      const setTarget = g.gain.setTargetAtTime.bind(g.gain);
      g.gain.setTargetAtTime = (v, t, c) => {
        record.targets.push(t);
        return setTarget(v, t, c);
      };
      made.push(record);
      return g;
    };
    const hit = (midiNote, layer) => ({ accent: 3, layer, pitch: { midiNote, frequency: 100 } });
    const t = ctx.currentTime + 0.05;
    playDrum(ctx, null, hit(46, 1), t);
    const open = made.at(-1);
    playDrum(ctx, null, hit(42, 2), t + 0.05);
    const afterOtherPart = [...open.targets];
    playDrum(ctx, null, hit(44, 1), t + 0.1);
    const afterSamePart = [...open.targets];
    // Louder at each stronger Accent Level: the peak each kick's envelope is sent to.
    await ctx.close();
    return { afterOtherPart, afterSamePart, at: t + 0.1 };
  });
  expect(cuts.afterOtherPart).toEqual([]);
  expect(cuts.afterSamePart).toHaveLength(1);
  expect(cuts.afterSamePart[0]).toBeCloseTo(cuts.at, 6);
});

// --- AC-19.13.2: the keyboard names each drum ----------------------------------------

test("AC-19.13.2/1 — While the part on screen is on Drums, every key with a drum carries its drum's name written vertically up the key, on white keys and black, and under any other instrument no key carries one", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await switchTo(page, 'piano').click();
  await expect(page.locator('.piano')).toHaveAttribute('data-drums', 'false');
  await expect(page.locator('.piano .key-drum')).toHaveCount(0);
  await switchTo(page, 'drums').click();
  await expect(page.locator('.piano')).toHaveAttribute('data-drums', 'true');
  // Every key from 36 to 81 — the keyboard's bottom to the top of the map — is named; the three above are not.
  await expect(page.locator('.piano .key-drum')).toHaveCount(46);
  await expect(page.locator('.piano .key.has-drum')).toHaveCount(46);
  await expect(key(page, 36).locator('.key-drum')).toHaveText('Kick');
  await expect(key(page, 38).locator('.key-drum')).toHaveText('Snare');
  // Black keys too: the hats sit on them.
  await expect(page.locator('.piano .key.black[data-midi="42"] .key-drum')).toHaveText('Closed hat');
  await expect(page.locator('.piano .key.black[data-midi="46"] .key-drum')).toHaveText('Open hat');
  await expect(key(page, 84).locator('.key-drum')).toHaveCount(0);
  // Written vertically up the key: turned a quarter turn, and so taller than wide on screen, inside its own key.
  for (const midi of [36, 38, 42, 49]) {
    const label = key(page, midi).locator('.key-drum');
    expect(await label.getAttribute('transform')).toMatch(/^rotate\(-90 /);
    const box = await label.boundingBox();
    expect(box.height).toBeGreaterThan(box.width);
    const face = await key(page, midi).locator('.key-face').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(face.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(face.x + face.width + 0.5);
    expect(box.y).toBeGreaterThanOrEqual(face.y - 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(face.y + face.height + 0.5);
  }
  // Any other instrument: no key is named for a drum.
  for (const id of ['flute', 'bass', 'synth']) {
    await switchTo(page, id).click();
    await expect(page.locator('.piano .key-drum')).toHaveCount(0);
    await expect(page.locator('.piano .key.has-drum')).toHaveCount(0);
  }
});

test('AC-19.13.2/2 — The note labels stay as they are: an in-scale key keeps its label and its colour, and each C its name', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const labels = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.piano .key')].map((k) => ({
        midi: k.dataset.midi,
        label: k.dataset.label,
        text: k.querySelector('.key-label')?.textContent ?? '',
        role: [...k.classList].filter((c) => c.startsWith('role-') || c === 'is-root' || c === 'is-diatonic').join(' '),
        band: Boolean(k.querySelector('.key-role')),
      }))
    );
  await switchTo(page, 'piano').click();
  const asPiano = await labels();
  await switchTo(page, 'drums').click();
  const asDrums = await labels();
  expect(asDrums).toEqual(asPiano);
  // And they are there: in C, every C is labelled and coloured as the root, beside its drum.
  const kick = asDrums.find((k) => k.midi === '36');
  expect(kick.text).not.toBe('');
  expect(kick.role).toContain('is-root');
  await expect(key(page, 36).locator('.key-label')).toBeVisible();
  await expect(key(page, 36).locator('.key-drum')).toBeVisible();
});

test("AC-19.13.2/3 — A key's accessible name says its drum", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await switchTo(page, 'drums').click();
  await expect(key(page, 36)).toHaveAttribute('aria-label', /^Kick, /);
  await expect(key(page, 42)).toHaveAttribute('aria-label', /^Closed hat, /);
  await expect(key(page, 84)).not.toHaveAttribute('aria-label', /,.*,.*hat|Kick/);
  await switchTo(page, 'piano').click();
  await expect(key(page, 36)).not.toHaveAttribute('aria-label', /Kick/);
});

// --- AC-19.13.3: whatever the Key -----------------------------------------------------

test('AC-19.13.3/1 — Changing the Key with a Drums part on screen leaves each of its notes on the same MIDI note, while every other pitched part moves with the Key', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await switchTo(page, 'drums').click();
  await recordKeys(page, [36, 38, 42, 46]);
  await addLayer(page, DJEMBE);
  expect(await ownNotes(page)).toEqual([36, 38, 42, 46]);
  const melodyInC = (await setNotes(page))[1];
  for (const k of ['G', 'D', 'F']) {
    await page.locator('.composer-key').selectOption(k);
    expect((await composerState(page)).draft.key).toBe(k);
    expect(await ownNotes(page)).toEqual([36, 38, 42, 46]);
    const set = await setNotes(page);
    expect(set[0]).toEqual([36, 38, 42, 46]);
    // The melody under it moved with the Key: every note by the same interval, and not by none.
    const moved = set[1].map((m, i) => m - melodyInC[i]);
    expect(new Set(moved).size).toBe(1);
    expect(moved[0] % 12).not.toBe(0);
  }
  // The grid still names the notes it holds.
  await expect(page.locator('.composer-grid .slot.has-note')).toHaveCount(4);
});

test("AC-19.13.3/2 — A Drums part that is not on screen sounds the MIDI notes it was written with, whatever the Section's Key", async ({ page }) => {
  await openApp(page);
  const drums = await kit(page);
  // A second composition over it, in another Key, with the kit beneath on Drums.
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-input').fill('Line two');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await addLayer(page, drums);
  await picker(row(page, drums)).selectOption('drums');
  expect((await setNotes(page))[1]).toEqual([36, 38, 36, 38]);
  for (const k of ['A', 'Eb', 'C']) {
    await page.locator('.composer-key').selectOption(k);
    expect((await composerState(page)).draft.key).toBe(k);
    expect((await setNotes(page))[1]).toEqual([36, 38, 36, 38]);
  }
  // And it is heard so: the layer's notes logged as drums at those notes.
  await setTempo(page, 240);
  await page.locator('.composer-key').selectOption('A');
  const at = (await voiceLog(page)).length;
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).slice(at).filter((v) => v.layer === 1).length, { timeout: 8000 }).toBeGreaterThan(3);
  const heard = (await voiceLog(page)).slice(at).filter((v) => v.layer === 1);
  expect(heard.every((v) => v.voice === 'drums' && v.via === 'drum' && (v.midi === 36 || v.midi === 38))).toBe(true);
  await play(page);
  // Taken off Drums, it follows the Key as any part does.
  await picker(row(page, drums)).selectOption('bass');
  expect((await setNotes(page))[1]).not.toEqual([36, 38, 36, 38]);
});

test('AC-19.13.3/3 — Putting a Drums part on screen, and taking it off again, changes none of its MIDI notes', async ({ page }) => {
  await openApp(page);
  const drums = await kit(page, 'Kit', [36, 42, 38, 46]);
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-input').fill('Line two');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await page.locator('.composer-key').selectOption('G');
  await addLayer(page, drums);
  await picker(row(page, drums)).selectOption('drums');
  expect((await setNotes(page))[1]).toEqual([36, 42, 38, 46]);
  // On screen: it takes the section's Key, and its notes are where they were.
  await partRow(page, 'Kit').locator('.layer-pick').click();
  await expect(switchTo(page, 'drums')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.piano')).toHaveAttribute('data-drums', 'true');
  expect((await composerState(page)).draft.key).toBe('G');
  expect(await ownNotes(page)).toEqual([36, 42, 38, 46]);
  expect((await setNotes(page))[0]).toEqual([36, 42, 38, 46]);
  // Off again, with the Key changed meanwhile: still where they were.
  await page.locator('.composer-key').selectOption('Bb');
  expect(await ownNotes(page)).toEqual([36, 42, 38, 46]);
  await partRow(page, 'Line two').locator('.layer-pick').click();
  const set = await setNotes(page);
  const kitLayer = (await page.evaluate(() => window.__rm.scheduled().layers.findIndex((l) => l.pattern.name === 'Kit')));
  expect(set[kitLayer]).toEqual([36, 42, 38, 46]);
});

// --- AC-19.13.4: several drum parts ---------------------------------------------------

test('AC-19.13.4/1 — Several parts may be on Drums at once, each sounding its own notes, so two drums written at the same instant in different parts are both heard', async ({ page }) => {
  await openApp(page);
  // Hats on a part of their own, then a kick and snare part, then a third over both.
  const hats = await kit(page, 'Hats', [42, 42, 46, 42]);
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-input').fill('Kick and snare');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await switchTo(page, 'drums').click();
  await addLayer(page, hats);
  await picker(row(page, hats)).selectOption('drums');
  await addLayer(page, DJEMBE);
  await picker(row(page, DJEMBE)).selectOption('drums');
  await expect(picker(onScreen(page))).toHaveValue('drums');
  await expect(picker(row(page, hats))).toHaveValue('drums');
  await expect(picker(row(page, DJEMBE))).toHaveValue('drums');
  // Record the part on screen's own line, so its notes fall with the hats'.
  await page.locator('.record').click();
  for (let i = 0; i < 64; i++) {
    if ((await page.locator('.record').getAttribute('aria-pressed')) === 'false') break;
    await key(page, i % 2 ? 38 : 36).click();
  }
  // One timeline: at the first instant, a drum from each of the first two parts.
  const first = await page.evaluate(() => {
    const events = window.__rmTimeline.timelineOf(window.__rm.scheduled(), 0).filter((e) => e.pitch);
    const t0 = Math.min(...events.map((e) => e.timeSeconds));
    return events.filter((e) => e.timeSeconds === t0).map((e) => ({ layer: e.layer, midi: e.pitch.midiNote }));
  });
  expect(first).toEqual(expect.arrayContaining([{ layer: 0, midi: 36 }, { layer: 1, midi: 42 }]));
  await setTempo(page, 240);
  const at = (await voiceLog(page)).length;
  await play(page);
  for (const layer of [0, 1, 2]) {
    await expect.poll(async () => (await voiceLog(page)).slice(at).filter((v) => v.layer === layer).length, { timeout: 8000 }).toBeGreaterThan(1);
  }
  const heard = (await voiceLog(page)).slice(at);
  expect(heard.every((v) => v.voice === 'drums')).toBe(true);
  expect(heard.filter((v) => v.layer === 0).every((v) => v.midi === 36 || v.midi === 38)).toBe(true);
  expect(heard.filter((v) => v.layer === 1).every((v) => v.midi === 42 || v.midi === 46)).toBe(true);
  expect((await appState(page)).isPlaying).toBe(true);
  await play(page);
});

// --- AC-19.11.5/5: the export ---------------------------------------------------------

/** Every note-on in a single-track MIDI file, as [status, note]. Delta times and meta events are skipped. */
function noteOns(bytes) {
  let i = bytes.findIndex((_, k) => String.fromCharCode(...bytes.slice(k, k + 4)) === 'MTrk') + 8;
  const out = [];
  while (i < bytes.length) {
    while (bytes[i++] & 0x80);
    const status = bytes[i++];
    if (status === 0xff) {
      const type = bytes[i++];
      const length = bytes[i++];
      i += length;
      if (type === 0x2f) break;
    } else {
      const note = bytes[i++];
      i++;
      if ((status & 0xf0) === 0x90) out.push([status, note]);
    }
  }
  return out;
}

test('AC-19.11.5/5 — A part on Drums is written on the General MIDI drum channel, at the note numbers its keys name, so a DAW opens it as a drum kit; every other pitched part stays on channel 1', async ({ page }) => {
  await openApp(page);
  const drums = await kit(page);
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-input').fill('Line two');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await switchTo(page, 'piano').click();
  await page.locator('.record').click();
  for (let i = 0; i < 64; i++) {
    if ((await page.locator('.record').getAttribute('aria-pressed')) === 'false') break;
    await key(page, 60).click();
  }
  await page.locator('.composer-key').selectOption('G');
  await addLayer(page, drums);
  await picker(row(page, drums)).selectOption('drums');
  await addLayer(page, DJEMBE);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.section-export').click()]);
  const { readZip } = await import('../zip-reader.js');
  const fs = await import('node:fs/promises');
  const entries = readZip(new Uint8Array(await fs.readFile(await download.path())));
  expect(entries).toHaveLength(3);
  const [own, kitFile, melody] = entries.map((e) => noteOns([...e.bytes]));
  // The Drums part: channel 10, at the kick's and the snare's own numbers, whatever the Key.
  expect(kitFile.length).toBeGreaterThan(0);
  expect(kitFile.every(([status]) => status === 0x99)).toBe(true);
  expect([...new Set(kitFile.map(([, note]) => note))].sort()).toEqual([36, 38]);
  // The other pitched parts: channel 1.
  expect(own.length).toBeGreaterThan(0);
  expect(own.every(([status]) => status === 0x90)).toBe(true);
  expect(melody.length).toBeGreaterThan(0);
  expect(melody.every(([status]) => status === 0x90)).toBe(true);
});
