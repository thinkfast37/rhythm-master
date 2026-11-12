/**
 * An Arrangement's MIDI export (AC-19.11.5): one file per layer, each one
 * combined loop long, in one archive.
 */
import { describe, it, expect } from 'vitest';
import { buildMidi, buildSongMidi, buildArrangementMidi, arrangementZipFilename, midiFilename, TICKS_PER_QUARTER } from '../../../src/export/midi.js';
import { buildZip } from '../../../src/core/zip.js';
import { readZip } from '../../zip-reader.js';
import { layered, layeredLoopDuration } from '../../../src/core/arrangement.js';
import { create, cycleAccent, setPitch, addMeasure, setTimeSignatureAll } from '../../../src/core/pattern.js';
import { setProgression, setArpeggio, setChange, cyclePasses } from '../../../src/core/harmony.js';
import { buildTimeline, loopDurationSeconds } from '../../../src/core/timeline.js';
import { createSong, addEntry } from '../../../src/core/song.js';

function findChunk(bytes, id) {
  for (let i = 0; i < bytes.length - 8; i++) {
    if (String.fromCharCode(...bytes.slice(i, i + 4)) !== id) continue;
    const len = (bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7];
    return bytes.slice(i + 8, i + 8 + len);
  }
  return null;
}
function trackEvents(bytes) {
  const track = findChunk(bytes, 'MTrk');
  const events = [];
  let i = 0;
  let tick = 0;
  while (i < track.length) {
    let delta = 0;
    for (;;) {
      const b = track[i++];
      delta = (delta << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    tick += delta;
    const status = track[i++];
    if (status === 0xff) {
      const type = track[i++];
      const len = track[i++];
      events.push({ tick, status, type, data: [...track.slice(i, i + len)] });
      i += len;
    } else {
      events.push({ tick, status, data: [track[i], track[i + 1]] });
      i += 2;
    }
  }
  return events;
}
const noteOns = (bytes) => trackEvents(bytes).filter((e) => e.status === 0x90 || e.status === 0x99);
const endTick = (bytes) => trackEvents(bytes).find((e) => e.status === 0xff && e.type === 0x2f).tick;
const tempoOf = (bytes) => trackEvents(bytes).find((e) => e.status === 0xff && e.type === 0x51).data;

function fourBeats(name, tempo = 120) {
  let p = { ...create(name), id: name.toLowerCase().replace(/\s/g, '-'), tempo };
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
  return p;
}
function melody(name, key = 'C') {
  let p = { ...fourBeats(name), soundMode: 'melodic', key, scale: 'ionian' };
  for (let b = 0; b < 4; b++) p = setPitch(p, 0, b, 0, { degree: '1', octaveOffset: 0 });
  return p;
}
function chords(name) {
  let p = setProgression(melody(name), 'I-IV-V');
  p = setChange(p, 'pass');
  return setArpeggio(p, 'up');
}
function twoBars(name) {
  let p = addMeasure(fourBeats(name));
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 1, b, 0);
  return p;
}

describe('export/midi for an Arrangement (AC-19.11.5)', () => {
  it("AC-19.11.5/1 — Export arrangement MIDI downloads one ZIP holding one `.mid` per layer, the composition first and the rest in their order, each named with its position and the Pattern's name; muted layers are included", () => {
    const set = layered(melody('My Line'), [{ pattern: twoBars('Son Clave 3-2') }, { pattern: fourBeats('Bossa Nova!'), muted: true }]);
    const files = buildArrangementMidi(set);
    expect(files.map((f) => f.name)).toEqual(['01-my-line.mid', '02-son-clave-3-2.mid', '03-bossa-nova.mid']);
    for (const f of files) expect(String.fromCharCode(...f.bytes.slice(0, 4))).toBe('MThd');
    // The muted layer is a file like any other, with its notes.
    expect(noteOns(files[2].bytes).length).toBeGreaterThan(0);
    // One archive, the files in order and intact.
    const back = readZip(buildZip(files));
    expect(back.map((e) => e.name)).toEqual(files.map((f) => f.name));
    back.forEach((e, i) => expect([...e.bytes]).toEqual([...files[i].bytes]));
  });

  it("AC-19.11.5/2 — Each file spans one combined loop: the layer's own timeline for each of its repeats, a progression walking its chords across them, at the composition's tempo, tempo unit, swing and Key, so every file in the archive has the same length", () => {
    const composition = { ...melody('Line', 'G'), tempo: 90, swingAmount: 30 };
    const set = layered(composition, [{ pattern: twoBars('Bed') }, { pattern: { ...chords('Changes'), tempo: 200 } }]);
    // Loop: the composition (1 bar) × 6, the bed (2 bars) × 3, the progression (3 bars) × 2.
    expect(set.layers.map((l) => l.repeats)).toEqual([6, 3, 2]);
    const files = buildArrangementMidi(set);
    const ends = files.map((f) => endTick(f.bytes));
    expect(new Set(ends).size).toBe(1);
    // Six bars of 4/4 at 480 ticks a quarter.
    expect(ends[0]).toBe(6 * 4 * TICKS_PER_QUARTER);
    // At the composition's tempo in every file — 90 BPM is 666,667 µs a quarter.
    for (const f of files) expect(tempoOf(f.bytes)).toEqual([0x0a, 0x2c, 0x2b]);
    // The composition's notes: four a bar, six bars; in G, every one a G.
    const own = noteOns(files[0].bytes);
    expect(own).toHaveLength(24);
    expect(own.every((e) => e.data[0] % 12 === 7)).toBe(true);
    // The progression walks I–IV–V across its repeats: six passes, two cycles, as the transport plays it.
    const changes = noteOns(files[2].bytes).map((e) => e.data[0]);
    const expected = [];
    const under = set.layers[2].pattern;
    for (let pass = 0; pass < 6; pass++) for (const e of buildTimeline(under, pass)) expected.push(e.pitch.midiNote);
    expect(changes).toEqual(expected);
    expect(cyclePasses(under)).toBe(3);
    // Every file is built from its layer under the composition's settings — the swing among them.
    expect(set.layers.map((l) => l.pattern.swingAmount)).toEqual([30, 30, 30]);
    expect(set.layers.slice(1).map((l) => l.pattern.tempoUnit)).toEqual(['quarter', 'quarter']);
    // The file's length is the combined loop's.
    expect(endTick(files[1].bytes) / TICKS_PER_QUARTER).toBeCloseTo(layeredLoopDuration(set) / (60 / 90), 6);
  });

  it('AC-19.11.5/3 — The archive is named after the Arrangement once it has been saved, and after the composition otherwise', () => {
    const composition = melody('My Line');
    expect(arrangementZipFilename({ id: 'arr_1', name: 'Evening Bed' }, composition)).toBe('evening-bed.zip');
    expect(arrangementZipFilename({ id: null, name: '' }, composition)).toBe('my-line.zip');
    expect(arrangementZipFilename(null, composition)).toBe('my-line.zip');
    expect(arrangementZipFilename({ id: 'arr_2', name: '   ' }, composition)).toBe('my-line.zip');
  });

  it("AC-19.11.5/4 — Export arrangement MIDI is unavailable without a layer, and the Pattern's own MIDI export and a Song's are unchanged", () => {
    // The Pattern's own file: one harmonic cycle, as before, however it is layered.
    const changes = chords('Changes');
    const alone = buildMidi(changes);
    expect(endTick(alone)).toBe(3 * 4 * TICKS_PER_QUARTER);
    expect(noteOns(alone)).toHaveLength(12);
    layered(melody('Line'), [{ pattern: changes }]);
    expect([...buildMidi(changes)]).toEqual([...alone]);
    expect(midiFilename(changes)).toBe('changes.mid');
    // A Song's file: its entries' passes, untouched by the pass-count parameter.
    const song = addEntry(createSong('Bed', changes.id), 0, 'down', 2);
    const songFile = buildSongMidi(song, (id) => (id === changes.id ? changes : null));
    expect(endTick(songFile)).toBe(6 * 4 * TICKS_PER_QUARTER);
    expect(noteOns(songFile)).toHaveLength(24);
    // 7/8 under 4/4 exports eight bars against seven, both the same length.
    let seven = setTimeSignatureAll({ ...create('Seven'), id: 'seven', tempo: 120 }, '7/8');
    for (let b = 0; b < 7; b++) seven = cycleAccent(seven, 0, b, 0);
    const files = buildArrangementMidi(layered(fourBeats('Four'), [{ pattern: seven }]));
    expect(endTick(files[0].bytes)).toBe(endTick(files[1].bytes));
    expect(noteOns(files[1].bytes)).toHaveLength(56);
  });
});
