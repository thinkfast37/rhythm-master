/**
 * US-19.10 — Play a MIDI instrument into the Composer.
 *
 * Web MIDI is replaced by a fake installed before the app loads, so a test can
 * connect and disconnect devices and send raw MIDI bytes from them exactly as
 * a keyboard would. `mode` 'unsupported' removes the API altogether, as Safari
 * has it; 'denied' refuses access.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, leaveComposer, composerState, loadFourBeats, fret, cslot } from './composer-helpers.js';

test.use(launch);

async function fakeMidi(page, { devices = [['kbd', 'Keystation 49']], mode = 'ok' } = {}) {
  await page.addInitScript(
    ({ devices, mode }) => {
      if (mode === 'unsupported') {
        delete Navigator.prototype.requestMIDIAccess;
        return;
      }
      const f = { requests: 0, options: null, inputs: new Map(), access: null };
      const make = (id, name) => ({ id, name, type: 'input', state: 'connected', onmidimessage: null });
      for (const [id, name] of devices) f.inputs.set(id, make(id, name));
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        configurable: true,
        value: async (options) => {
          f.requests += 1;
          f.options = options;
          if (mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
          f.access = { inputs: f.inputs, outputs: new Map(), onstatechange: null };
          return f.access;
        },
      });
      f.send = (id, ...messages) => {
        for (const data of messages) f.inputs.get(id).onmidimessage?.({ data: new Uint8Array(data) });
      };
      f.connect = (id, name) => {
        f.inputs.set(id, make(id, name));
        f.access?.onstatechange?.({ port: f.inputs.get(id) });
      };
      f.disconnect = (id) => {
        const port = f.inputs.get(id);
        port.state = 'disconnected';
        f.inputs.delete(id);
        f.access?.onstatechange?.({ port });
      };
      window.__fakeMidi = f;
    },
    { devices, mode }
  );
}

/** Note-ons, at a middling velocity, from one device. */
const play = (page, notes, device = 'kbd') =>
  page.evaluate(([d, ns]) => window.__fakeMidi.send(d, ...ns.map((n) => [0x90, n, 96])), [device, notes]);
const sendRaw = (page, messages, device = 'kbd') => page.evaluate(([d, ms]) => window.__fakeMidi.send(d, ...ms), [device, messages]);
const heard = (page, midi) => page.evaluate((m) => window.__rm.voiceLog().filter((v) => v.midi === m).length, midi);
/*
 * What is lit, read in one snapshot. A note stays lit for 350 ms (AC-19.10.2),
 * so separate checks one after another can straddle it going out; one
 * snapshot asserts the whole lit set at a single instant.
 */
const litKeys = (page) => page.locator('.piano .key.lit').evaluateAll((ks) => ks.map((k) => Number(k.dataset.midi)));
const litFrets = (page) =>
  page.locator('.fretboard .note.lit').evaluateAll((ns) => ns.map((n) => `${n.dataset.string}:${n.dataset.fret}`).sort());
const pitches = (page) => page.evaluate(() => window.__rm.composer().draft.measures[0].beats.map((b) => b.slots[0].pitch ?? null));
const target = async (page) => (await composerState(page)).target;
const toPiano = (page) => page.locator('.instrument-switch [data-instrument="piano"]').click();
const picker = (page) => page.locator('.midi-input-picker');

// --- AC-19.10.1: a MIDI note is a tap ---------------------------------------------

test("AC-19.10.1/1 — A note-on sounds that note with the instrument view's voice, at rest, while the composition plays and while recording, as a tap on it does", async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await play(page, [69]); // A4, at rest, nothing selected: heard, nothing recorded
  expect(await heard(page, 69)).toBe(1);
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1).instrument).toBe('guitar');
  expect(await pitches(page)).toEqual([null, null, null, null]);
  await page.locator('.transport').first().click();
  await play(page, [69]);
  expect(await heard(page, 69)).toBe(2);
  await page.locator('.record').click();
  await play(page, [69]);
  expect(await heard(page, 69)).toBe(3);
  await page.locator('.transport').first().click();
  // The Piano view's voice, as a key tap has it.
  await toPiano(page);
  await play(page, [72]);
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toMatchObject({ instrument: 'piano', midi: 72 });
});

test('AC-19.10.1/2 — In record mode a note-on gives the target that note and moves it to the next syllable without one, leaving record mode after the last; out of record mode it re-pitches the selected Slot and moves nothing', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await play(page, [60]);
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  await expect(cslot(page, 0, 0).locator('.cslot-name')).toHaveText('C4');
  await play(page, [62, 64, 65]);
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
  expect(await pitches(page)).toEqual([
    { degree: '1', octaveOffset: 0 },
    { degree: '2', octaveOffset: 0 },
    { degree: '3', octaveOffset: 0 },
    { degree: '4', octaveOffset: 0 },
  ]);
  // Out of record mode: the selection takes the note, and nothing moves.
  await cslot(page, 0, 1).locator('.cslot-note').click();
  await play(page, [67]);
  await expect(cslot(page, 0, 1).locator('.cslot-name')).toHaveText('G4');
  const c = await composerState(page);
  expect(c.recording).toBe(false);
  expect(c.selected).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  expect((await pitches(page))[0]).toEqual({ degree: '1', octaveOffset: 0 });
  expect((await pitches(page))[2]).toEqual({ degree: '3', octaveOffset: 0 });
});

test('AC-19.10.1/3 — Input is monophonic: each note-on is one note, notes played together are taken one after another in the order they arrive, a note-off or a note-on at velocity 0 does nothing, and how hard a key is struck does not change the note taken', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  // A C major chord struck at once, each key at a different velocity, on channel 3.
  await sendRaw(page, [
    [0x92, 60, 127],
    [0x92, 64, 1],
    [0x92, 67, 64],
  ]);
  expect(await pitches(page)).toEqual([
    { degree: '1', octaveOffset: 0 },
    { degree: '3', octaveOffset: 0 },
    { degree: '5', octaveOffset: 0 },
    null,
  ]);
  // Releasing keys, either way MIDI says it, takes nothing and sounds nothing.
  await sendRaw(page, [
    [0x82, 60, 0],
    [0x90, 62, 0],
    [0x80, 62, 64],
  ]);
  expect(await heard(page, 62)).toBe(0);
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 3, slotIndex: 0 });
  expect((await pitches(page))[3]).toBeNull();
});

test('AC-19.10.1/4 — Taps and MIDI notes can be mixed freely in one recording, with no setting to change between them', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await fret(page, 1, 1).click(); // C4, tapped
  await play(page, [62]); // D4, played
  await fret(page, 0, 0).click(); // E4, tapped
  await play(page, [65]); // F4, played
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
  expect((await pitches(page)).map((p) => p?.degree)).toEqual(['1', '2', '3', '4']);
});

test('AC-19.10.1/5 — Outside the Composer a MIDI note does nothing: no sound, and no change to any Pattern', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await enterComposer(page); // access is asked for here
  await expect(picker(page)).toHaveAttribute('data-status', 'ready');
  await leaveComposer(page);
  await expect(page.locator('.composer-panel')).toBeHidden();
  const before = await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));
  const voices = await page.evaluate(() => window.__rm.voiceLog().length);
  await play(page, [60, 64, 67]);
  expect(await page.evaluate(() => window.__rm.voiceLog().length)).toBe(voices);
  expect(await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern))).toBe(before);
});

// --- AC-19.10.2: where it landed --------------------------------------------------

test('AC-19.10.2/1 — In the Piano view the key for the note lights, and goes out again within a second', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await toPiano(page);
  await play(page, [67]);
  // The key for the note, and no other.
  await expect.poll(() => litKeys(page)).toEqual([67]);
  await expect.poll(() => litKeys(page), { timeout: 1000 }).toEqual([]);
});

test('AC-19.10.2/2 — In the Guitar view every visible, playable fret that sounds the note lights, and goes out again within a second', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  // E4 is open on the top string and at 5, 9, 14, 19 and 24 below it.
  await play(page, [64]);
  await expect.poll(() => litFrets(page)).toEqual(['0:0', '1:5', '2:9', '3:14', '4:19', '5:24']);
  await expect.poll(() => litFrets(page), { timeout: 1000 }).toEqual([]);
  // With frets 5–12 visible, only the two places on screen light.
  await page.locator('.fret-lower').fill('5');
  await page.locator('.fret-lower').press('Enter');
  await page.locator('.fret-upper').fill('12');
  await page.locator('.fret-upper').press('Enter');
  await play(page, [64]);
  await expect.poll(() => litFrets(page)).toEqual(['1:5', '2:9']);
});

// --- AC-19.10.3: out of range -----------------------------------------------------

test("AC-19.10.3/1 — In the Piano view a note outside the key count's range is neither heard nor recorded, and the record bar shows its name, out of range for that many keys", async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await toPiano(page); // 49 keys, C2–C6
  await page.locator('.record').click();
  await play(page, [96]); // C7
  expect(await heard(page, 96)).toBe(0);
  expect(await pitches(page)).toEqual([null, null, null, null]);
  await expect(page.locator('.midi-out-of-range')).toHaveText('C7 — out of range for 49 keys');
  // On 88 keys it is there.
  await page.locator('.keys-picker').selectOption('88');
  await play(page, [96]);
  expect(await heard(page, 96)).toBe(1);
  expect((await pitches(page))[0]).not.toBeNull();
});

test('AC-19.10.3/2 — In the Guitar view a note with no visible, playable fret — below the capo, beyond the lowest or highest note of the board, or outside the visible frets — is neither heard nor recorded, and the record bar shows its name, not on the visible frets', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  const flash = page.locator('.midi-out-of-range');
  await play(page, [39]); // D#2, a semitone under the open low E
  await expect(flash).toHaveText('D#2 — not on the visible frets');
  await play(page, [89]); // F6, a semitone over fret 24 on the top string
  await expect(flash).toHaveText('F6 — not on the visible frets');
  await page.locator('.capo-picker').selectOption('3');
  await play(page, [41]); // F2: only low E, fret 1, under the capo
  await expect(flash).toHaveText('F2 — not on the visible frets');
  await page.locator('.capo-picker').selectOption('0');
  await page.locator('.fret-lower').fill('5');
  await page.locator('.fret-lower').press('Enter');
  await play(page, [40]); // open low E, off the visible frets
  await expect(flash).toHaveText('E2 — not on the visible frets');
  for (const m of [39, 89, 41, 40]) expect(await heard(page, m)).toBe(0);
  expect(await pitches(page)).toEqual([null, null, null, null]);
});

test('AC-19.10.3/3 — An out-of-range note leaves the target, the selection and every recorded note as they were, and the flash clears on its own', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.record').click();
  await play(page, [60]);
  await play(page, [20]); // under the board
  expect(await target(page)).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  expect((await pitches(page))[0]).toEqual({ degree: '1', octaveOffset: 0 });
  await page.locator('.record').click(); // off
  await cslot(page, 0, 0).locator('.cslot-note').click();
  await play(page, [120]);
  const c = await composerState(page);
  expect(c.selected).toEqual({ measureIndex: 0, beatIndex: 0, slotIndex: 0 });
  expect((await pitches(page))[0]).toEqual({ degree: '1', octaveOffset: 0 });
  await expect(page.locator('.midi-out-of-range')).toBeVisible();
  await expect(page.locator('.midi-out-of-range')).toHaveCount(0, { timeout: 4000 });
});

// --- AC-19.10.4: the device picker ------------------------------------------------

test('AC-19.10.4/1 — With no device connected the picker is disabled and says none is connected; with one it is disabled and names that device, whose notes are taken', async ({ page }) => {
  await fakeMidi(page, { devices: [] });
  await openApp(page);
  await loadFourBeats(page);
  await expect(picker(page)).toBeDisabled();
  await expect(picker(page).locator('option')).toHaveText(['No device connected']);
  await page.evaluate(() => window.__fakeMidi.connect('kbd', 'Keystation 49'));
  await expect(picker(page)).toBeDisabled();
  await expect(picker(page).locator('option')).toHaveText(['Keystation 49']);
  await play(page, [69]);
  expect(await heard(page, 69)).toBe(1);
});

test('AC-19.10.4/2 — With two or more devices the picker is enabled, offering All devices and each device by name, All devices on first use; with one device chosen, notes from the others are ignored', async ({ page }) => {
  await fakeMidi(page, { devices: [['kbd', 'Keystation 49'], ['gtr', 'TriplePlay']] });
  await openApp(page);
  await loadFourBeats(page);
  await expect(picker(page)).toBeEnabled();
  await expect(picker(page).locator('option')).toHaveText(['All devices', 'Keystation 49', 'TriplePlay']);
  await expect(picker(page)).toHaveValue('all');
  await play(page, [69], 'kbd');
  await play(page, [71], 'gtr');
  expect([await heard(page, 69), await heard(page, 71)]).toEqual([1, 1]);
  await picker(page).selectOption('TriplePlay');
  await play(page, [69], 'kbd');
  await play(page, [71], 'gtr');
  expect([await heard(page, 69), await heard(page, 71)]).toEqual([1, 2]);
});

test('AC-19.10.4/3 — The choice is remembered in `rm.settings.v1` and is in force after a reload; while the chosen device is not connected, notes from every device are taken', async ({ page }) => {
  await fakeMidi(page, { devices: [['kbd', 'Keystation 49'], ['gtr', 'TriplePlay']] });
  await openApp(page);
  await enterComposer(page);
  await picker(page).selectOption('Keystation 49');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).composerMidiInput)).toBe('Keystation 49');
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await loadFourBeats(page);
  await expect(picker(page)).toHaveValue('Keystation 49');
  await play(page, [71], 'gtr');
  expect(await heard(page, 71)).toBe(0);
  // The chosen keyboard unplugged: the guitar's notes are taken.
  await page.evaluate(() => window.__fakeMidi.disconnect('kbd'));
  await play(page, [71], 'gtr');
  expect(await heard(page, 71)).toBe(1);
});

test('AC-19.10.4/4 — A device connected or disconnected while the Composer is open is added to or removed from the picker at once, with no reload', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  await loadFourBeats(page);
  await expect(picker(page)).toBeDisabled();
  await page.evaluate(() => window.__fakeMidi.connect('gtr', 'TriplePlay'));
  await expect(picker(page)).toBeEnabled();
  await expect(picker(page).locator('option')).toHaveText(['All devices', 'Keystation 49', 'TriplePlay']);
  await page.evaluate(() => window.__fakeMidi.disconnect('kbd'));
  await expect(picker(page)).toBeDisabled();
  await expect(picker(page).locator('option')).toHaveText(['TriplePlay']);
});

// --- AC-19.10.5: access ----------------------------------------------------------

test('AC-19.10.5/1 — Entering the Composer asks the browser for MIDI access, without system-exclusive messages; leaving and entering again in the same page load does not ask again', async ({ page }) => {
  await fakeMidi(page);
  await openApp(page);
  expect(await page.evaluate(() => window.__fakeMidi.requests)).toBe(0);
  await enterComposer(page);
  await expect(picker(page)).toHaveAttribute('data-status', 'ready');
  expect(await page.evaluate(() => window.__fakeMidi.requests)).toBe(1);
  expect(await page.evaluate(() => Boolean(window.__fakeMidi.options?.sysex))).toBe(false);
  await leaveComposer(page);
  await enterComposer(page);
  expect(await page.evaluate(() => window.__fakeMidi.requests)).toBe(1);
});

test('AC-19.10.5/2 — Where the browser has no Web MIDI — Safari, and every browser on iPhone and iPad — the picker is disabled and says MIDI input needs Chrome, Edge or Firefox, and tapping records as before', async ({ page }) => {
  await fakeMidi(page, { mode: 'unsupported' });
  await openApp(page);
  expect(await page.evaluate(() => 'requestMIDIAccess' in navigator)).toBe(false);
  await loadFourBeats(page);
  await expect(picker(page)).toBeDisabled();
  await expect(page.locator('.midi-input-reason')).toHaveText('MIDI input needs Chrome, Edge or Firefox');
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  expect((await pitches(page))[0]).toEqual({ degree: '1', octaveOffset: 0 });
});

test('AC-19.10.5/3 — Where access is refused, the picker is disabled and says MIDI access was not allowed, and tapping records as before', async ({ page }) => {
  await fakeMidi(page, { mode: 'denied' });
  await openApp(page);
  await loadFourBeats(page);
  await expect(picker(page)).toBeDisabled();
  await expect(page.locator('.midi-input-reason')).toHaveText('MIDI access was not allowed');
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  expect((await pitches(page))[0]).toEqual({ degree: '1', octaveOffset: 0 });
});
