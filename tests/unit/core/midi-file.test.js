/**
 * MIDI import, the arithmetic (US-12.4, research.md D-027): the file read, the
 * export table read backwards, the 16th-note grid.
 */
import { describe, it, expect } from 'vitest';
import { patternFromMidi, readMidiFile, IMPORT_RECIPE } from '../../../src/core/midi-file.js';
import { smf, note } from '../../fixtures/midi-bytes.js';
import { buildMidi } from '../../../src/export/midi.js';
import { create, cycleAccent, setPitch, setRecipe, setTimeSignature, addMeasure } from '../../../src/core/pattern.js';
import { resolve } from '../../../src/core/pitch.js';
import { defaultAccent } from '../../../src/core/accents.js';
import { KEYS } from '../../../src/core/pitch.js';

const Q = 480; // ticks per quarter at the default division
const S = Q / 4; // one 16th

/** Import, asserting it worked. */
function imported(tracks, options, name = 'test.mid') {
  const result = patternFromMidi(smf(tracks, options), { fileName: name });
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** The sounding Slots of a Pattern as [measure, beat, slot, accent, degree, octaveOffset]. */
function onSlots(pattern) {
  const out = [];
  pattern.measures.forEach((m, mi) =>
    m.beats.forEach((b, bi) =>
      b.slots.forEach((s, si) => {
        if (s.on) out.push([mi, bi, si, s.accent ?? defaultAccent(m, bi, si), s.pitch.degree, s.pitch.octaveOffset]);
      })
    )
  );
  return out;
}

describe('AC-12.4.2 — Each note lands on the syllable nearest its start', () => {
  it('AC-12.4.2/1 — Every Beat of the imported Pattern is Straight 16ths, on a quarter-note Beat and on an eighth-note Beat alike, so the syllables are the 16th-note grid throughout', () => {
    const { pattern } = imported([
      [
        { tick: 0, kind: 'timeSignature', numerator: 4, denominator: 4 },
        { tick: 4 * Q, kind: 'timeSignature', numerator: 6, denominator: 8 },
        ...note(0, 60),
        ...note(4 * Q + 5 * (Q / 2), 62), // the last eighth of the 6/8 Measure
      ],
    ]);
    expect(pattern.measures.map((m) => m.timeSignature)).toEqual(['4/4', '6/8']);
    for (const m of pattern.measures) for (const b of m.beats) expect(b.recipe).toBe(IMPORT_RECIPE);
    expect(pattern.measures[0].beats.map((b) => b.slots.length)).toEqual([4, 4, 4, 4]);
    expect(pattern.measures[1].beats.map((b) => b.slots.length)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(onSlots(pattern)).toEqual([
      [0, 0, 0, 2, '1', 0],
      [1, 5, 0, 2, '2', 0],
    ]);
  });

  it('AC-12.4.2/2 — A note that starts before its nearest 16th and one that starts after it both turn on that 16th; a note exactly halfway between two 16ths goes to the earlier; a note snapped past the end of one Beat lands on the first syllable of the next', () => {
    const { pattern } = imported([
      [
        ...note(2 * S - 20, 60), // early for the third 16th
        ...note(5 * S + 30, 62), // late for the sixth
        ...note(8 * S + S / 2, 64), // halfway between the ninth and the tenth
        ...note(4 * Q - 10, 65), // just before the end of the Measure: nearest is Measure 2's first
      ],
    ]);
    expect(onSlots(pattern).map(([m, b, s]) => [m, b, s])).toEqual([
      [0, 0, 2],
      [0, 1, 1],
      [0, 2, 0],
      [1, 0, 0],
    ]);
    expect(pattern.measures).toHaveLength(2);
  });

  it("AC-12.4.2/3 — A note's duration changes nothing: a note held for a whole Measure turns on one Slot, and the syllables it sounded across stay as the other notes left them", () => {
    const { pattern } = imported([[...note(0, 60, 80, { length: 4 * Q }), ...note(2 * Q, 67)]]);
    expect(onSlots(pattern).map(([m, b, s, , d]) => [m, b, s, d])).toEqual([
      [0, 0, 0, '1'],
      [0, 2, 0, '5'],
    ]);
  });

  it("AC-12.4.2/4 — When two or more notes land on one syllable the Slot takes the highest pitch and that note's velocity, whichever track or order they arrived in", () => {
    const { pattern } = imported([
      [...note(Q, 72, 120), ...note(Q, 60, 40)],
      [...note(Q + 10, 64, 100)],
    ]);
    expect(onSlots(pattern)).toEqual([[0, 1, 0, 3, '1', 1]]);
    const lowLoudLater = imported([[...note(0, 60, 120), ...note(5, 55, 30)]]).pattern;
    expect(onSlots(lowLoudLater)).toEqual([[0, 0, 0, 3, '1', 0]]);
  });

  it('AC-12.4.2/5 — The Pattern has as many Measures as the file spans, each with the Time Signature in force in the file at its start, and the tempo the file sets at its start, rounded to a whole number; a file that says neither is 4/4 at 120 bpm', () => {
    const { pattern } = imported([
      [
        { tick: 0, kind: 'tempo', bpm: 95.6 },
        { tick: 0, kind: 'timeSignature', numerator: 3, denominator: 4 },
        { tick: 3 * Q, kind: 'timeSignature', numerator: 7, denominator: 8 },
        ...note(0, 60),
        ...note(3 * Q + 7 * (Q / 2) + 2 * Q, 60), // Measure 3, which is 7/8 still
      ],
    ]);
    expect(pattern.tempo).toBe(96);
    expect(pattern.measures.map((m) => m.timeSignature)).toEqual(['3/4', '7/8', '7/8']);

    const bare = imported([[...note(Q * 4 + Q, 60)]]).pattern;
    expect(bare.tempo).toBe(120);
    expect(bare.measures.map((m) => m.timeSignature)).toEqual(['4/4', '4/4']);
  });

  it("AC-12.4.2/6 — Every track's notes are taken together, except notes on the drum channel (channel 10), which are ignored", () => {
    const { pattern } = imported([
      [{ tick: 0, kind: 'name', text: 'Lead' }, ...note(0, 60)],
      [...note(Q, 64, 80, { channel: 3 })],
      [...note(2 * Q, 38, 127, { channel: 9 }), ...note(0, 36, 127, { channel: 9 })],
    ]);
    expect(onSlots(pattern).map(([m, b, s, , d]) => [m, b, s, d])).toEqual([
      [0, 0, 0, '1'],
      [0, 1, 0, '3'],
    ]);
  });
});

describe('AC-12.4.3 — Velocity maps to the nearest Accent Level', () => {
  const accentOf = (velocity) => {
    const { pattern } = imported([[...note(0, 60, velocity)]]);
    return onSlots(pattern)[0][3];
  };

  it('AC-12.4.3/1 — Velocity 1 to 63 is Weak (Accent Level 1)', () => {
    expect([1, 48, 63].map(accentOf)).toEqual([1, 1, 1]);
  });

  it('AC-12.4.3/2 — Velocity 64 to 95 is Medium (Accent Level 2)', () => {
    expect([64, 80, 95].map(accentOf)).toEqual([2, 2, 2]);
  });

  it('AC-12.4.3/3 — Velocity 96 to 127 is Strong (Accent Level 3)', () => {
    expect([96, 112, 127].map(accentOf)).toEqual([3, 3, 3]);
  });

  it('AC-12.4.3/4 — A note-on at velocity 0 turns no Slot on', () => {
    const result = patternFromMidi(smf([[{ tick: 0, kind: 'on', note: 60, velocity: 0 }, ...note(Q, 62)]]));
    expect(result.ok).toBe(true);
    expect(onSlots(result.pattern).map(([m, b, s]) => [m, b, s])).toEqual([[0, 1, 0]]);
    const silent = patternFromMidi(smf([[{ tick: 0, kind: 'on', note: 60, velocity: 0 }]]));
    expect(silent.ok).toBe(false);
  });
});

describe("AC-12.4.4 — Pitches are stored against the file's Key", () => {
  it('AC-12.4.4/1 — A key signature sets the Key to its tonic — a major key signature with the Ionian scale, a minor one with the Aeolian scale on the minor tonic — and a file with none is in C, Ionian', () => {
    const keyed = (sharps, minor) => {
      const { pattern } = imported([[{ tick: 0, kind: 'keySignature', sharps, minor }, ...note(0, 60)]]);
      return [pattern.key, pattern.scale];
    };
    expect(keyed(1, false)).toEqual(['G', 'ionian']);
    expect(keyed(-3, false)).toEqual(['Eb', 'ionian']);
    expect(keyed(0, true)).toEqual(['A', 'aeolian']);
    expect(keyed(2, true)).toEqual(['B', 'aeolian']);
    expect(keyed(-1, true)).toEqual(['D', 'aeolian']);
    const bare = imported([[...note(0, 60)]]).pattern;
    expect([bare.key, bare.scale]).toEqual(['C', 'ionian']);
    expect(bare.soundMode).toBe('melodic');
  });

  it("AC-12.4.4/2 — Each note is stored as the degree and octave that resolve to its MIDI note in that Key, a note outside the scale as a chromatic degree (b3, #4, …), so the imported Pattern sounds the file's notes", () => {
    const notes = [60, 63, 66, 71, 72, 74, 59, 48];
    const { pattern } = imported([[...notes.flatMap((n, i) => note(i * S, n))]]);
    const slots = onSlots(pattern);
    expect(slots.map(([, , , , d, o]) => [d, o])).toEqual([
      ['1', 0],
      ['b3', 0],
      ['#4', 0],
      ['7', 0],
      ['1', 1],
      ['2', 1],
      ['7', -1],
      ['1', -1],
    ]);
    slots.forEach(([, , , , degree, octaveOffset], i) => {
      expect(resolve({ degree, octaveOffset }, 'C').midiNote).toBe(notes[i]);
    });

    // In G: the same MIDI notes come back from degrees spelled against G.
    const inG = imported([[{ tick: 0, kind: 'keySignature', sharps: 1, minor: false }, ...notes.flatMap((n, i) => note(i * S, n))]]).pattern;
    onSlots(inG).forEach(([, , , , degree, octaveOffset], i) => {
      expect(resolve({ degree, octaveOffset }, 'G').midiNote).toBe(notes[i]);
    });
    expect(onSlots(inG)[0].slice(4)).toEqual(['4', -1]); // C4 is the 4th of G, an octave below G4's
  });

  it('AC-12.4.4/3 — A note above octave 7 or below octave 1 is held at that end of the octave range, as the stepper holds it (AC-2.2.3)', () => {
    const { pattern } = imported([[...note(0, 12), ...note(S, 24), ...note(2 * S, 108), ...note(3 * S, 96)]]);
    expect(onSlots(pattern).map(([, , , , d, o]) => [d, o])).toEqual([
      ['1', -3], // C0 is held at octave 1
      ['1', -3], // C1 is octave 1
      ['1', 3], // C8 is held at octave 7
      ['1', 3], // C7 is octave 7
    ]);
  });

  it('AC-12.4.4/4 — A Pattern in C exported as MIDI (US-12.1) and imported again holds the same Slots — on, Accent Level and Pitch — as the Pattern it came from, with every Beat Straight 16ths; one in another Key comes back in C sounding the same notes, since the file carries no key signature', () => {
    let p = { ...create('Round Trip'), soundMode: 'melodic', key: 'C', scale: 'ionian', tempo: 100 };
    p = addMeasure(p);
    p = setTimeSignature(p, 1, '6/8');
    for (let b = 0; b < 4; b++) p = setRecipe(p, 0, b, 'straight-16ths');
    for (let b = 0; b < 6; b++) p = setRecipe(p, 1, b, 'straight-16ths');
    const stamp = (m, b, s, accent, degree, octaveOffset) => {
      p = cycleAccent(p, m, b, s);
      p.measures[m].beats[b].slots[s].accent = accent;
      p = setPitch(p, m, b, s, { degree, octaveOffset });
    };
    stamp(0, 0, 0, 3, '1', 0); // Strong is the default on the downbeat, so it is not stored
    stamp(0, 1, 2, 1, 'b3', 0);
    stamp(0, 3, 3, 2, '#4', 1);
    stamp(1, 0, 1, 2, '5', -1);
    stamp(1, 5, 1, 3, '7', 0);

    const back = patternFromMidi(buildMidi(p, 1));
    expect(back.ok).toBe(true);
    expect(onSlots(back.pattern)).toEqual(onSlots(p));
    expect(back.pattern.measures.map((m) => [m.timeSignature, m.beats.map((b) => b.recipe)])).toEqual(
      p.measures.map((m) => [m.timeSignature, m.beats.map((b) => b.recipe)])
    );
    // A default Accent is computed, not stored, on the import as in the grid (FR-003).
    expect(back.pattern.measures[0].beats[0].slots[0]).toEqual({ on: true, pitch: { degree: '1', octaveOffset: 0 } });
    expect(back.pattern.key).toBe('C');
    expect(back.pattern.tempo).toBe(100);

    const inEb = patternFromMidi(buildMidi({ ...p, key: 'Eb' }, 1));
    expect(inEb.pattern.key).toBe('C');
    expect(onSlots(inEb.pattern).map(([m, b, s, a]) => [m, b, s, a])).toEqual(onSlots(p).map(([m, b, s, a]) => [m, b, s, a]));
    onSlots(inEb.pattern).forEach(([, , , , degree, octaveOffset], i) => {
      const [, , , , d0, o0] = onSlots(p)[i];
      expect(resolve({ degree, octaveOffset }, 'C').midiNote).toBe(resolve({ degree: d0, octaveOffset: o0 }, 'Eb').midiNote);
    });
  });
});

describe('AC-12.4.5 — The import is named, and the name must be free', () => {
  it("AC-12.4.5/1 — The prompt proposes the file's sequence or track name when it has one, otherwise the file name without its extension: the name the conversion proposes", () => {
    const named = imported([[{ tick: 0, kind: 'name', text: 'Blue Monk' }, ...note(0, 60)]], {}, 'export.mid');
    expect(named.name).toBe('Blue Monk');
    const trackNamed = imported([[{ tick: 0, kind: 'tempo', bpm: 100 }], [{ tick: 0, kind: 'name', text: 'Melody' }, ...note(0, 60)]], {}, 'x.mid');
    expect(trackNamed.name).toBe('Melody');
    expect(imported([[...note(0, 60)]], {}, 'My Line.midi').name).toBe('My Line');
    expect(imported([[...note(0, 60)]], {}, '').name).toBe('Imported MIDI');
  });
});

describe('AC-12.4.6 — A file that cannot be imported changes nothing, and a long one is cut to the cap', () => {
  it('AC-12.4.6/1 — A file that is not a Standard MIDI File is refused with a message and nothing is written', () => {
    const textFile = Uint8Array.from([...'{"format":"rhythm-master-backup"}'].map((c) => c.charCodeAt(0)));
    expect(patternFromMidi(textFile)).toEqual({ ok: false, error: expect.stringContaining('not a MIDI file') });
    expect(patternFromMidi(new Uint8Array(0)).ok).toBe(false);
    expect(readMidiFile(textFile)).toBeNull();
    const smpte = smf([[...note(0, 60)]]);
    smpte[12] = 0xe7; // SMPTE timing, not ticks per quarter
    expect(patternFromMidi(smpte).ok).toBe(false);
  });

  it('AC-12.4.6/2 — A file with no note-on off the drum channel is refused with a message and nothing is written', () => {
    const drums = patternFromMidi(smf([[...note(0, 36, 100, { channel: 9 }), ...note(Q, 38, 100, { channel: 9 })]]));
    expect(drums).toEqual({ ok: false, error: expect.stringContaining('no notes') });
    expect(patternFromMidi(smf([[{ tick: 0, kind: 'tempo', bpm: 120 }]])).ok).toBe(false);
  });

  it("AC-12.4.6/3 — A file whose Time Signature at any Measure is not one the app offers (data-model §2's list) is refused with a message naming it, and nothing is written", () => {
    const cut = patternFromMidi(smf([[{ tick: 0, kind: 'timeSignature', numerator: 2, denominator: 2 }, ...note(0, 60)]]));
    expect(cut).toEqual({ ok: false, error: expect.stringContaining('2/2') });
    const later = patternFromMidi(
      smf([[{ tick: 4 * Q, kind: 'timeSignature', numerator: 3, denominator: 16 }, ...note(0, 60), ...note(4 * Q, 60)]])
    );
    expect(later).toEqual({ ok: false, error: expect.stringContaining('3/16') });
  });

  it('AC-12.4.6/4 — A file longer than 32 Measures imports its first 32 Measures, and a message says how many were left out', () => {
    const long = imported([[...note(0, 60), ...note(32 * 4 * Q, 62)]]);
    expect(long.pattern.measures).toHaveLength(32);
    expect(long.droppedMeasures).toBe(1);
    const longer = imported([[...note(0, 60), ...note(39 * 4 * Q + 2 * Q, 62)]]);
    expect(longer.pattern.measures).toHaveLength(32);
    expect(longer.droppedMeasures).toBe(8);
    expect(imported([[...note(31 * 4 * Q, 60)]]).droppedMeasures).toBe(0);
  });
});

describe('the reader', () => {
  it('honours running status and skips what it does not read', () => {
    const bytes = smf([
      [
        { tick: 0, kind: 'raw', bytes: [0xf0, 0x02, 0x7e, 0xf7] }, // a sysex, skipped
        { tick: 0, kind: 'raw', bytes: [0x90, 60, 100] },
        { tick: Q, kind: 'raw', bytes: [62, 100] }, // running status: another note-on
        { tick: 2 * Q, kind: 'raw', bytes: [0xc0, 5] }, // a program change
        { tick: 2 * Q, kind: 'raw', bytes: [0xb0, 7, 100] }, // a controller
      ],
    ]);
    const { tracks } = readMidiFile(bytes);
    expect(tracks[0].filter((e) => e.noteOn !== undefined).map((e) => [e.tick, e.noteOn])).toEqual([
      [0, 60],
      [Q, 62],
    ]);
    expect(KEYS).toContain(patternFromMidi(bytes).pattern.key);
  });
});
