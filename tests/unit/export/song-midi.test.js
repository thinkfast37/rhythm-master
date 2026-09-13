import { describe, it, expect } from 'vitest';
import { buildMidi, buildSongMidi, midiFilename, songMidiFilename, TICKS_PER_QUARTER } from '../../../src/export/midi.js';
import { create, cycleAccent, setPitch, setSwingAmount } from '../../../src/core/pattern.js';
import { buildTimeline, loopDurationSeconds } from '../../../src/core/timeline.js';
import { setProgression, setChange, cyclePasses, withArpeggio, setArpeggio } from '../../../src/core/harmony.js';
import { createSong, addEntry, totalPasses } from '../../../src/core/song.js';

/** Read a big-endian chunk length and the bytes of the named chunk. */
function findChunk(bytes, id) {
  for (let i = 0; i < bytes.length - 8; i++) {
    const tag = String.fromCharCode(...bytes.slice(i, i + 4));
    if (tag !== id) continue;
    const len = (bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7];
    return bytes.slice(i + 8, i + 8 + len);
  }
  return null;
}

/** Every event in a format-0 track: `{ tick, status, data }`, meta events included. */
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

const noteOns = (bytes) => trackEvents(bytes).filter((e) => e.status === 0x90);
const endOfTrack = (bytes) => trackEvents(bytes).find((e) => e.status === 0xff && e.type === 0x2f);

/** A one-Measure 4/4 melodic Pattern under I–IV–V changing every pass, two sounding Slots, swung. */
function harmonicPattern() {
  let p = { ...create('Harmonic Groove'), id: 'p_1', soundMode: 'melodic', key: 'C', tempo: 120 };
  p = setProgression(p, 'I-IV-V');
  p = setChange(p, 'pass');
  p = cycleAccent(p, 0, 0, 0);
  p = setPitch(p, 0, 0, 0, { tone: 1, octaveOffset: 0 });
  p = cycleAccent(p, 0, 1, 1);
  p = setPitch(p, 0, 1, 1, { tone: 5, octaveOffset: 0 });
  p = setArpeggio(p, 'up');
  return setSwingAmount(p, 40);
}

const library = (...patterns) => (id) => patterns.find((p) => p.id === id) ?? null;

describe('export/midi for a Song (US-18.1)', () => {
  it("AC-18.1.5/1 — The file holds every entry's passes in order — each entry for its repeats, at the tempo, swing and Key in effect — and nothing more: the Section once through, not looped", () => {
    const p = harmonicPattern();
    expect(cyclePasses(p)).toBe(3);
    const byId = library(p);
    let song = createSong('Study', 'p_1');
    song = addEntry(song, 0, 'up', 2);
    song = addEntry(song, 0, 'down', 1);
    const passes = totalPasses(song, byId);
    expect(passes).toBe(9);

    const bytes = buildSongMidi(song, byId);
    const ons = noteOns(bytes);
    const notesPerPass = buildTimeline(p, 0).length;
    expect(notesPerPass).toBe(2);
    expect(ons).toHaveLength(notesPerPass * passes);

    // Each pass's notes are what playback sounds for that pass under the entry's
    // fill, at the Pattern's tempo and swing, offset by the passes before it.
    const passSeconds = loopDurationSeconds(p);
    const spq = 60 / p.tempo;
    const ticks = (s) => Math.round((s / spq) * TICKS_PER_QUARTER);
    const passTicks = ticks(passSeconds);
    for (let loop = 0; loop < passes; loop++) {
      const fill = loop < 6 ? 'up' : 'down';
      const expected = buildTimeline(withArpeggio(p, fill), loop % 3);
      const slice = ons.slice(loop * notesPerPass, (loop + 1) * notesPerPass);
      expect(slice.map((e) => e.data[0]), `pass ${loop} notes`).toEqual(expected.map((e) => e.pitch.midiNote));
      expect(slice.map((e) => e.tick), `pass ${loop} timing`).toEqual(expected.map((e) => loop * passTicks + ticks(e.timeSeconds)));
    }
    // Ascending and descending deal different notes, so the fill change is audible in the file.
    expect(ons.slice(0, 2).map((e) => e.data[0])).not.toEqual(ons.slice(12, 14).map((e) => e.data[0]));

    // Once through, not looped: the track ends where the last pass ends.
    expect(endOfTrack(bytes).tick).toBe(passes * passTicks);
    expect(endOfTrack(bytes).tick).toBe(9 * 4 * TICKS_PER_QUARTER);

    // The tempo in the file is the Pattern's.
    const tempo = trackEvents(bytes).find((e) => e.status === 0xff && e.type === 0x51);
    expect((tempo.data[0] << 16) | (tempo.data[1] << 8) | tempo.data[2]).toBe(500000);

    // An empty Section is an empty file: no notes, ending at the start.
    const empty = buildSongMidi(createSong('Empty', 'p_1'), byId);
    expect(noteOns(empty)).toHaveLength(0);
    expect(endOfTrack(empty).tick).toBe(0);
  });

  it("AC-18.1.5/3 — The Pattern's own MIDI export is unchanged: it carries the Pattern's own arpeggio and never the Section", () => {
    const p = harmonicPattern();
    const before = [...buildMidi(p)];
    const byId = library(p);
    let song = createSong('Study', 'p_1');
    song = addEntry(song, 0, 'alberti', 3);
    song = addEntry(song, 0, 'down', 2);
    const songBytes = buildSongMidi(song, byId);
    expect([...buildMidi(p)]).toEqual(before);
    expect(p.harmony.arpeggio).toBe('up');
    // The Pattern's file spans its own cycle, not the Section's fifteen passes.
    expect(noteOns(buildMidi(p))).toHaveLength(2 * cyclePasses(p));
    expect(noteOns(songBytes)).toHaveLength(2 * 15);
    expect(endOfTrack(buildMidi(p)).tick).toBe(3 * 4 * TICKS_PER_QUARTER);
    // Its notes are the Pattern's own arpeggio, not the Section's first entry.
    const own = buildTimeline(p, 0).map((e) => e.pitch.midiNote);
    expect(noteOns(buildMidi(p)).slice(0, 2).map((e) => e.data[0])).toEqual(own);
  });

  it('AC-18.1.5/2 — The file is named after the Song when it has been saved, and after the Pattern otherwise', () => {
    const p = harmonicPattern();
    const unsaved = createSong('Morning Study!', 'p_1');
    expect(songMidiFilename(unsaved, p)).toBe(midiFilename(p));
    expect(songMidiFilename(unsaved, p)).toBe('harmonic-groove.mid');
    const saved = { ...unsaved, id: 'song_1' };
    expect(songMidiFilename(saved, p)).toBe('morning-study.mid');
    expect(songMidiFilename({ ...saved, name: '   ' }, p)).toBe('harmonic-groove.mid');
  });
});
