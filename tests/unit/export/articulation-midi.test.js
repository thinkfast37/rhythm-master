/**
 * The note-length choice in the files themselves (US-12.5), and an
 * Arrangement's multi-track file (US-20.3).
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildMidi, buildChainMidi, buildSectionMidi, buildArrangementMidi, arrangementMidiFilename, TICKS_PER_QUARTER, VELOCITY } from '../../../src/export/midi.js';
import { create, cycleAccent, setPitch } from '../../../src/core/pattern.js';
import { setProgression, setChange, setArpeggio } from '../../../src/core/harmony.js';
import { createChain, addEntry, totalPasses, entryAt, playingAt } from '../../../src/core/chain.js';
import { layered, arranged, loopDurationOf, passesPerLoop } from '../../../src/core/section.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** Fixtures built from the core, so they change only if the core does. */
function fixtures() {
  let rhythm = { ...create('Rhythm'), id: 'p_r', tempo: 96 };
  for (const [b, s] of [[0, 0], [1, 0], [1, 2], [2, 0], [3, 0], [3, 2]]) rhythm = cycleAccent(rhythm, 0, b, s);
  let melody = { ...create('Melody'), id: 'p_m', soundMode: 'melodic', key: 'D', tempo: 132, swingAmount: 30 };
  [['1', 0], ['3', 0], ['5', 0], ['1', 1]].forEach(([degree, octaveOffset], b) => {
    melody = cycleAccent(melody, 0, b, 0);
    melody = setPitch(melody, 0, b, 0, { degree, octaveOffset });
  });
  let changes = { ...create('Changes'), id: 'p_c', soundMode: 'melodic', key: 'C', tempo: 120 };
  changes = setChange(setProgression(changes, 'I-IV-V'), 'pass');
  for (let b = 0; b < 4; b++) {
    changes = cycleAccent(changes, 0, b, 0);
    changes = setPitch(changes, 0, b, 0, { tone: 1, octaveOffset: 0 });
  }
  changes = setArpeggio(changes, 'up');
  const chain = addEntry(addEntry(createChain('Bed', 'p_c'), 0, 'up', 2), 0, 'down', 1);
  const set = layered(melody, [{ pattern: rhythm, muted: false }, { pattern: changes, muted: true, instrument: 'bass' }], { instrument: 'guitar' });
  return { rhythm, melody, changes, chain, set, byId: (id) => (id === 'p_c' ? changes : null) };
}

/** Every track of a file: its meta events and its notes, each note with where it starts, how long it lasts, its channel and velocity. */
function readMidi(bytes) {
  const u16 = (o) => (bytes[o] << 8) | bytes[o + 1];
  const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const format = u16(8);
  const count = u16(10);
  const tracks = [];
  let offset = 14;
  for (let t = 0; t < count; t++) {
    const length = u32(offset + 4);
    let p = offset + 8;
    const end = p + length;
    let tick = 0;
    const open = new Map();
    const track = { name: null, programs: [], tempos: [], signatures: [], notes: [], endTick: 0 };
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
        let len = 0;
        for (;;) {
          const b = bytes[p++];
          len = (len << 7) | (b & 0x7f);
          if (!(b & 0x80)) break;
        }
        const data = bytes.slice(p, p + len);
        p += len;
        if (type === 0x03) track.name = new TextDecoder().decode(data);
        if (type === 0x51) track.tempos.push({ tick, usPerQuarter: (data[0] << 16) | (data[1] << 8) | data[2] });
        if (type === 0x58) track.signatures.push({ tick, numerator: data[0], denominator: 2 ** data[1] });
        if (type === 0x2f) track.endTick = tick;
      } else if ((status & 0xf0) === 0xc0) {
        track.programs.push({ channel: status & 0x0f, program: bytes[p++] });
      } else {
        const channel = status & 0x0f;
        const pitch = bytes[p++];
        const velocity = bytes[p++];
        const key = `${channel}:${pitch}`;
        if ((status & 0xf0) === 0x90 && velocity > 0) {
          open.set(key, [...(open.get(key) ?? []), { tick, pitch, velocity, channel }]);
        } else {
          const started = open.get(key)?.shift();
          if (started) track.notes.push({ ...started, length: tick - started.tick });
        }
      }
    }
    track.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    tracks.push(track);
    offset = end;
  }
  return { format, tracks };
}
const notesOf = (bytes) => readMidi(bytes).tracks[0].notes;

describe('export/midi — Staccato is the file it always was (AC-12.5.1/3)', () => {
  it('AC-12.5.1/3 — On Staccato every exported note is a thirty-second note long, sixty ticks, and the file is byte for byte what it was before the choice existed', () => {
    const f = fixtures();
    // Hashes of what the exporter wrote for these fixtures before the note-length
    // choice existed (main at 2026-11-20), taken by running that exporter.
    expect(sha(buildMidi(f.rhythm))).toBe('550019ffa635df27');
    expect(sha(buildMidi(f.melody))).toBe('eabd98208abcee7b');
    expect(sha(buildMidi(f.changes))).toBe('4cc821df2cfb2de0');
    expect(sha(buildChainMidi(f.chain, f.byId))).toBe('c09b3e02d8689834');
    expect(buildSectionMidi(f.set).map((x) => `${x.name}:${sha(x.bytes)}`)).toEqual(['01-melody.mid:911848cfd41c595c', '02-rhythm.mid:3f5f596868738f95', '03-changes.mid:5cda6e4d39933ee3']);
    // Asked for by name, Staccato is the same file as asking for nothing.
    expect(sha(buildMidi(f.melody, 1, { articulation: 'staccato', voice: 'guitar' }))).toBe('eabd98208abcee7b');
    expect(sha(buildChainMidi(f.chain, f.byId, { articulation: 'staccato' }))).toBe('c09b3e02d8689834');
    // Sixty ticks, a thirty-second note at 480 to the quarter, every one.
    expect(TICKS_PER_QUARTER / 8).toBe(60);
    for (const bytes of [buildMidi(f.rhythm), buildMidi(f.melody), buildMidi(f.changes), buildChainMidi(f.chain, f.byId)]) {
      const notes = notesOf(bytes);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.every((n) => n.length === 60)).toBe(true);
    }
  });
});

describe('export/midi — Legato (AC-12.5.2)', () => {
  it('AC-12.5.2/1 — On Legato a pitched note lasts until the next note of its part begins and then for the ring of its instrument, the ring turned from seconds into ticks at the tempo of the file', () => {
    // Four quarter notes, all Strong-or-computed accents, on the piano, at two tempos.
    const { melody } = fixtures();
    const even = { ...melody, swingAmount: 0 };
    for (const tempo of [60, 120]) {
      const p = { ...even, tempo };
      const notes = notesOf(buildMidi(p, 1, { articulation: 'legato', voice: 'piano' }));
      const staccato = notesOf(buildMidi(p, 1));
      expect(notes).toHaveLength(4);
      const ticksPerSecond = (TICKS_PER_QUARTER * tempo) / 60;
      const accentOf = (velocity) => Number(Object.entries(VELOCITY).find(([, v]) => v === velocity)[0]);
      // Every note but the last: one quarter to the next note, then the piano's hold for its accent.
      for (const n of notes.slice(0, 3)) {
        const ring = Math.round({ 1: 0.8, 2: 1.2, 3: 1.6 }[accentOf(n.velocity)] * ticksPerSecond);
        const wanted = Math.min(480 + ring, 1920 - n.tick);
        expect(n.length, `tempo ${tempo}, note at ${n.tick}`).toBe(wanted);
      }
      // The same ring is twice the ticks at twice the tempo: the same stretch of time.
      expect(notes[0].length).toBeGreaterThan(staccato[0].length);
    }
    // A held instrument has no ring: each note ends exactly where the next begins.
    const held = notesOf(buildMidi({ ...even, tempo: 120 }, 1, { articulation: 'legato', voice: 'sax' }));
    expect(held.map((n) => n.length)).toEqual([480, 480, 480, 480]);
  });

  it('AC-12.5.2/2 — A note ends one tick before the same pitch is struck again in its part, the last note of a part lasts to the end of the file and then its ring, and no note runs past the end of the file', () => {
    // D, F#, D, F#: each pitch is struck again two notes later.
    let p = { ...create('Repeats'), soundMode: 'melodic', key: 'D', tempo: 60 };
    ['1', '3', '1', '3'].forEach((degree, b) => {
      p = cycleAccent(p, 0, b, 0);
      p = setPitch(p, 0, b, 0, { degree, octaveOffset: 0 });
    });
    const notes = notesOf(buildMidi(p, 1, { articulation: 'legato', voice: 'guitar' }));
    expect(notes.map((n) => n.tick)).toEqual([0, 480, 960, 1440]);
    // At 60 the guitar's ring is far longer than two quarters: the first two are cut at their repeats.
    expect(notes[0].length).toBe(959);
    expect(notes[1].length).toBe(959);
    // The last two run to the end of the file and no further.
    expect(notes[2].tick + notes[2].length).toBe(1920);
    expect(notes[3].tick + notes[3].length).toBe(1920);
    expect(readMidi(buildMidi(p, 1, { articulation: 'legato', voice: 'guitar' })).tracks[0].endTick).toBe(1920);
  });

  it('AC-12.5.2/4 — Percussive notes and parts on Drums are the same length on Legato as on Staccato', () => {
    const f = fixtures();
    // A Percussive Pattern: the same file, byte for byte.
    expect(sha(buildMidi(f.rhythm, 1, { articulation: 'legato', voice: 'piano' }))).toBe(sha(buildMidi(f.rhythm)));
    // A part on Drums, written on the drum channel: every note still sixty ticks.
    const drums = notesOf(buildMidi(f.melody, 1, { channel: 9, articulation: 'legato', voice: 'drums' }));
    expect(drums.every((n) => n.length === 60 && n.channel === 9)).toBe(true);
    // In a Section's archive the rhythm's file is unchanged and the melody's is not.
    const staccato = buildSectionMidi(f.set);
    const legato = buildSectionMidi(f.set, { articulation: 'legato' });
    expect(sha(legato[1].bytes)).toBe(sha(staccato[1].bytes));
    expect(sha(legato[0].bytes)).not.toBe(sha(staccato[0].bytes));
  });

  it('AC-12.5.2/5 — Legato changes no note’s start, pitch, velocity or channel', () => {
    const f = fixtures();
    const strip = (notes) => notes.map(({ tick, pitch, velocity, channel }) => ({ tick, pitch, velocity, channel }));
    for (const [staccato, legato] of [
      [buildMidi(f.melody), buildMidi(f.melody, 1, { articulation: 'legato', voice: 'guitar' })],
      [buildMidi(f.changes), buildMidi(f.changes, undefined, { articulation: 'legato', voice: 'piano' })],
      [buildChainMidi(f.chain, f.byId), buildChainMidi(f.chain, f.byId, { articulation: 'legato', voice: 'synth' })],
    ]) {
      const a = readMidi(staccato).tracks[0];
      const b = readMidi(legato).tracks[0];
      expect(strip(b.notes)).toEqual(strip(a.notes));
      // Only lengths differ: tempo, time signatures and where the file ends are the same.
      expect(b.tempos).toEqual(a.tempos);
      expect(b.signatures).toEqual(a.signatures);
      expect(b.endTick).toBe(a.endTick);
      expect(b.notes.some((n, i) => n.length !== a.notes[i].length)).toBe(true);
    }
  });

  it('AC-12.5.2/6 — A Pattern and a Chain are lengthened by the voice Practice remembers for the Pattern, Piano when there is none, and each part of a Section or an Arrangement by its own instrument: the voice decides the ring', () => {
    const f = fixtures();
    // At 60 a quarter is a second, so every ring fits inside the Measure and none is clipped by the end of the file.
    const even = { ...f.melody, swingAmount: 0, tempo: 60 };
    const first = (options) => notesOf(buildMidi(even, 1, { articulation: 'legato', ...options }))[0].length;
    // No voice given is Piano; the guitar rings longer, the synth shorter, the sax not at all.
    expect(first({})).toBe(first({ voice: 'piano' }));
    expect(first({ voice: 'guitar' })).toBeGreaterThan(first({ voice: 'piano' }));
    expect(first({ voice: 'synth' })).toBeLessThan(first({ voice: 'piano' }));
    expect(first({ voice: 'sax' })).toBe(480);
    // A Chain the same.
    const chainFirst = (voice) => notesOf(buildChainMidi(f.chain, f.byId, { articulation: 'legato', voice }))[0].length;
    expect(chainFirst('guitar')).toBeGreaterThan(chainFirst('synth'));
    // A Section: its own part is on Guitar, so its file is the Pattern's on Guitar and not on Piano.
    const own = buildSectionMidi(f.set, { articulation: 'legato' })[0].bytes;
    // (The Section's loop is as many passes of the melody as its longest part needs.)
    const part = f.set.layers[0];
    const loops = passesPerLoop(part);
    expect(sha(own)).toBe(sha(buildMidi(part.pattern, loops, { articulation: 'legato', voice: 'guitar' })));
    expect(sha(own)).not.toBe(sha(buildMidi(part.pattern, loops, { articulation: 'legato', voice: 'piano' })));
  });
});

describe('export/midi — an Arrangement as one multi-track file (AC-20.3.1)', () => {
  /** The passes Play is handed for: the rhythm twice, a two-part Section once, the rhythm once more. All at 120. */
  function passes() {
    const f = fixtures();
    const at = (p) => ({ ...p, tempo: 120, tempoUnit: 'quarter' });
    const rhythmMark = { voice: 'piano', kit: true, tracks: [{ key: 'pattern:p_r', name: 'Rhythm', voice: 'piano', kit: true }] };
    const set = layered(at(f.melody), [{ pattern: f.changes, muted: false, instrument: 'bass', volume: 60 }, { pattern: f.rhythm, muted: true, instrument: 'piano', volume: 80 }], { instrument: 'guitar' });
    const sectionMark = {
      voice: 'guitar',
      tracks: [
        { key: 'section:arr_1:p_m', name: 'Verse — Melody', voice: 'guitar' },
        { key: 'section:arr_1:p_c', name: 'Verse — Changes', voice: 'bass' },
        { key: 'section:arr_1:p_r', name: 'Verse — Rhythm', voice: 'piano' },
      ],
    };
    const rhythm = (pass) => arranged(at(f.rhythm), pass, rhythmMark);
    return { f, list: [rhythm(0), rhythm(0), arranged(set, 0, sectionMark), rhythm(0)], set };
  }

  it('AC-20.3.1/2 — The file is a Format 1 file holding the sequence once through, every entry for its repeats, at the tempo of the Arrangement, with the tempo and the time signature of every Measure in a first track of their own', () => {
    const { list } = passes();
    const file = readMidi(buildArrangementMidi(list));
    expect(file.format).toBe(1);
    const conductor = file.tracks[0];
    // The first track: the tempo once, a time signature for every Measure, and no note.
    expect(conductor.notes).toEqual([]);
    expect(conductor.tempos).toEqual([{ tick: 0, usPerQuarter: 500000 }]);
    const totalSeconds = list.reduce((sum, p) => sum + loopDurationOf(p), 0);
    const endTick = Math.round((totalSeconds / 0.5) * TICKS_PER_QUARTER);
    // One 4/4 Measure is 1920 ticks; the Section's loop is three of the melody's Measures.
    expect(endTick).toBe(1920 * 6);
    expect(conductor.signatures.map((s) => s.tick)).toEqual([0, 1920, 3840, 5760, 7680, 9600]);
    expect(conductor.signatures.every((s) => s.numerator === 4 && s.denominator === 4)).toBe(true);
    // Every track ends where the sequence does.
    expect(file.tracks.every((t) => t.endTick === endTick)).toBe(true);
  });

  it('AC-20.3.1/3 — Each Pattern laid in the sequence, each part of each Section and each Chain has one track named for it, carrying its notes wherever in the sequence it sounds, so a Pattern laid twice is one track', () => {
    const { list } = passes();
    const file = readMidi(buildArrangementMidi(list));
    // The tempo track, the rhythm laid three times as ONE track, and the Section's two sounding parts.
    expect(file.tracks.map((t) => t.name)).toEqual([null, 'Rhythm', 'Verse — Melody', 'Verse — Changes']);
    const [, rhythm, melody, changes] = file.tracks;
    const inPass = (track, from, to) => track.notes.filter((n) => n.tick >= from && n.tick < to).length;
    // The rhythm: in the first two passes and the last, and silent under the Section.
    expect(inPass(rhythm, 0, 1920)).toBe(6);
    expect(inPass(rhythm, 1920, 3840)).toBe(6);
    expect(inPass(rhythm, 3840, 9600)).toBe(0);
    expect(inPass(rhythm, 9600, 11520)).toBe(6);
    // The Section's parts: only where the Section is.
    for (const part of [melody, changes]) {
      expect(part.notes.length).toBeGreaterThan(0);
      expect(part.notes.every((n) => n.tick >= 3840 && n.tick < 9600)).toBe(true);
    }
  });

  it('AC-20.3.1/4 — Each pitched track is on a channel of its own with the General MIDI program of its instrument, and a rhythm, a percussive part and a part on Drums are on the drum channel', () => {
    const { list } = passes();
    const [, rhythm, melody, changes] = readMidi(buildArrangementMidi(list)).tracks;
    // Guitar and bass, each on its own channel, neither the drums'.
    expect(melody.programs).toEqual([{ channel: 0, program: 25 }]);
    expect(changes.programs).toEqual([{ channel: 1, program: 33 }]);
    expect(melody.notes.every((n) => n.channel === 0)).toBe(true);
    expect(changes.notes.every((n) => n.channel === 1)).toBe(true);
    // The rhythm: the drum channel, and no program.
    expect(rhythm.programs).toEqual([]);
    expect(rhythm.notes.every((n) => n.channel === 9)).toBe(true);
    // A part on Drums is on the drum channel at the notes it was written with.
    const f = fixtures();
    const kit = arranged({ ...f.melody, tempo: 120, tempoUnit: 'quarter' }, 0, { voice: 'drums', tracks: [{ key: 'pattern:p_m', name: 'Kit', voice: 'drums' }] });
    const drums = readMidi(buildArrangementMidi([kit])).tracks[1];
    expect(drums.programs).toEqual([]);
    expect(drums.notes.every((n) => n.channel === 9)).toBe(true);
    expect(drums.notes.map((n) => n.pitch)).toEqual(notesOf(buildMidi(f.melody)).map((n) => n.pitch));
    // Seventeen pitched tracks still get a channel each, none of them the drums'.
    const many = Array.from({ length: 17 }, (_, i) => arranged({ ...f.melody, tempo: 120, tempoUnit: 'quarter' }, 0, { voice: 'piano', tracks: [{ key: `pattern:${i}`, name: `P${i}`, voice: 'piano' }] }));
    const channels = readMidi(buildArrangementMidi(many)).tracks.slice(1).map((t) => t.programs[0].channel);
    expect(channels.includes(9)).toBe(false);
    expect(new Set(channels.slice(0, 15)).size).toBe(15);
  });

  it('AC-20.3.1/5 — A Percussive Pattern laid in the sequence is written as the drums it plays — Kick, Snare and Floor tom by Accent Level — and a muted part of a Section is left out', () => {
    const { list } = passes();
    const file = readMidi(buildArrangementMidi(list));
    const rhythm = file.tracks[1];
    // Kick on Strong, Snare on Medium, Floor tom on Weak, by the velocity each accent is written at.
    const drumFor = { [VELOCITY[3]]: 36, [VELOCITY[2]]: 38, [VELOCITY[1]]: 43 };
    expect(rhythm.notes.every((n) => n.pitch === drumFor[n.velocity])).toBe(true);
    expect(new Set(rhythm.notes.map((n) => n.pitch)).size).toBeGreaterThan(1);
    // The Section's muted rhythm has no track, and no note of it is anywhere under the Section.
    expect(file.tracks.map((t) => t.name)).not.toContain('Verse — Rhythm');
    expect(file.tracks.flatMap((t) => t.notes).filter((n) => n.channel === 9 && n.tick >= 3840 && n.tick < 9600)).toEqual([]);
  });

  it('AC-20.3.1/6 — The notes of the file are the notes Play sounds, pass for pass, and the file follows the note-length choice as every MIDI export does', async () => {
    const { timelineOf } = await import('../../../src/core/section.js');
    const { list } = passes();
    const file = readMidi(buildArrangementMidi(list));
    // What the transport is handed for each pass, turned into (tick, pitch) by nothing but the tempo.
    const heard = [];
    let start = 0;
    for (const pass of list) {
      for (const e of timelineOf(pass)) if (e.pitch) heard.push([start + Math.round((e.timeSeconds / 0.5) * TICKS_PER_QUARTER), e.pitch.midiNote]);
      start += Math.round((loopDurationOf(pass) / 0.5) * TICKS_PER_QUARTER);
    }
    const written = file.tracks.flatMap((t) => t.notes.filter((n) => n.channel !== 9).map((n) => [n.tick, n.pitch]));
    const order = (a, b) => a[0] - b[0] || a[1] - b[1];
    expect(written.sort(order)).toEqual(heard.sort(order));
    // Staccato by default; Legato lengthens the pitched tracks by their own instruments and leaves the drums.
    const legato = readMidi(buildArrangementMidi(list, { articulation: 'legato' }));
    expect(file.tracks.flatMap((t) => t.notes).every((n) => n.length === 60)).toBe(true);
    expect(legato.tracks[1].notes.every((n) => n.length === 60)).toBe(true);
    expect(legato.tracks[2].notes.some((n) => n.length > 60)).toBe(true);
    // The bass is held to its next note and no further; the guitar rings past it.
    const bass = legato.tracks[3].notes;
    const onsets = [...new Set(bass.map((n) => n.tick))];
    for (const n of bass.slice(0, -1)) {
      const next = onsets.find((t) => t > n.tick);
      if (next !== undefined) expect(n.tick + n.length).toBeLessThanOrEqual(next);
    }
    // Starts, pitches and velocities are the same in both.
    const strip = (f2) => f2.tracks.map((t) => t.notes.map(({ tick, pitch, velocity, channel }) => [tick, pitch, velocity, channel]));
    expect(strip(legato)).toEqual(strip(file));
  });

  it('AC-20.3.1/1 — Export MIDI in Arrange downloads one MIDI file named after the Arrangement, and is unavailable while nothing in the sequence can play: the name of the file', () => {
    expect(arrangementMidiFilename({ name: 'Sunday song' })).toBe('sunday-song.mid');
    expect(arrangementMidiFilename({ name: "  Mum's Tune!  " })).toBe('mums-tune.mid');
    // Never saved, it has no name of its own yet.
    expect(arrangementMidiFilename({ name: '' })).toBe('arrangement.mid');
    // A Chain inside an Arrangement uses the same machinery: its fills in order, on one track.
    const f = fixtures();
    const byId = (id) => (id === 'p_c' ? { ...f.changes, tempoUnit: 'quarter' } : null);
    const mark = { voice: 'synth', tracks: [{ key: 'chain:song_1', name: 'Bed', voice: 'synth' }] };
    const chainPasses = Array.from({ length: totalPasses(f.chain, byId) }, (_, loop) => arranged(playingAt(f.chain, byId, loop), entryAt(f.chain, byId, loop).passInEntry, mark));
    const file = readMidi(buildArrangementMidi(chainPasses));
    expect(file.tracks.map((t) => t.name)).toEqual([null, 'Bed']);
    expect(file.tracks[1].programs).toEqual([{ channel: 0, program: 88 }]);
    expect(file.tracks[1].notes.map((n) => n.pitch)).toEqual(notesOf(buildChainMidi(f.chain, f.byId)).map((n) => n.pitch));
  });
});
