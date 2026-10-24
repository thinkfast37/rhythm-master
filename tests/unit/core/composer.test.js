import { describe, it, expect } from 'vitest';
import {
  pitchFromMidi,
  describeNote,
  labelFor,
  soundingSlots,
  missingCount,
  isComplete,
  recordTarget,
  nextTarget,
  previousSounding,
  recordNote,
  clearNote,
  cycleSyllable,
  duplicateUnpitched,
  hasAnyNote,
  canDuplicate,
  loadKind,
  fromPercussive,
  bakeHarmony,
  foldRegister,
  copyMelody,
} from '../../../src/core/composer.js';
import { resolve, KEYS } from '../../../src/core/pitch.js';
import { SCALES } from '../../../src/core/scales.js';
import { create, setPitch, cycleAccent, validate, addMeasure, duplicate } from '../../../src/core/pattern.js';
import { setProgression, setArpeggio, setChange } from '../../../src/core/harmony.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import { noteAt, STRING_COUNT, FRET_COUNT } from '../../../src/core/fretboard.js';
import { rangeFor } from '../../../src/core/piano.js';

/** A one-Measure 4/4 draft with one syllable per Beat, in C Ionian, unpitched. */
function blankDraft(key = 'C', scale = 'ionian') {
  let p = { ...create('Draft'), soundMode: 'melodic', key, scale };
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
  return p;
}
const at = (measureIndex, beatIndex, slotIndex = 0) => ({ measureIndex, beatIndex, slotIndex });
const pitchAt = (p, a) => p.measures[a.measureIndex].beats[a.beatIndex].slots[a.slotIndex].pitch;

describe('core/composer — a tapped note as a Pitch of the Key (AC-19.4.4)', () => {
  it('AC-19.4.4/1 — For every fret of the board and every key of the keyboard, the stored Pitch resolves through `core/pitch.js` to exactly the MIDI note tapped — a round trip with no loss', () => {
    const midis = new Set();
    for (let s = 0; s < STRING_COUNT; s++) for (let f = 0; f <= FRET_COUNT; f++) midis.add(noteAt(s, f));
    const r88 = rangeFor(88);
    for (let m = r88.low; m <= r88.high; m++) midis.add(m);
    expect(midis.size).toBe(88); // the board's E2–E6 lies within the 88 keys
    // Every case is checked; the misses are gathered and asserted once, because
    // 33,792 separate expect() calls cost thirty times the arithmetic they guard
    // and timed out on a busy machine (T415). An empty list is all 16,896 passing.
    const lossy = [];
    let checked = 0;
    for (const key of KEYS) {
      for (const scale of SCALES) {
        for (const midi of midis) {
          const pitch = pitchFromMidi(midi, key, scale.id);
          const back = resolve(pitch, key).midiNote;
          if (back !== midi || !Number.isInteger(pitch.octaveOffset)) lossy.push({ key, scale: scale.id, midi, pitch, back });
          checked++;
        }
      }
    }
    expect(checked).toBe(KEYS.length * SCALES.length * 88);
    expect(lossy).toEqual([]);
  });

  it("AC-19.4.4/2 — An in-scale note takes the scale's own degree token — `b5` in Locrian and `#4` in Lydian for the same semitone — and an out-of-scale note the default chromatic token of its semitone above the root", () => {
    // F# above C: the tritone, spelled by the scale.
    expect(pitchFromMidi(66, 'C', 'lydian')).toEqual({ degree: '#4', octaveOffset: 0 });
    expect(pitchFromMidi(66, 'C', 'locrian')).toEqual({ degree: 'b5', octaveOffset: 0 });
    expect(pitchFromMidi(66, 'C', 'minor-blues')).toEqual({ degree: 'b5', octaveOffset: 0 });
    // Out of scale in Ionian: the default chromatic token.
    expect(pitchFromMidi(66, 'C', 'ionian')).toEqual({ degree: '#4', octaveOffset: 0 });
    expect(pitchFromMidi(63, 'C', 'ionian')).toEqual({ degree: 'b3', octaveOffset: 0 });
    expect(pitchFromMidi(61, 'C', 'ionian')).toEqual({ degree: 'b2', octaveOffset: 0 });
    // In Dorian the same note is the scale's own b3.
    expect(pitchFromMidi(63, 'C', 'dorian')).toEqual({ degree: 'b3', octaveOffset: 0 });
    // Octaves: middle C in C is offset 0, A0 in B is the b7 five octaves down.
    expect(pitchFromMidi(60, 'C')).toEqual({ degree: '1', octaveOffset: 0 });
    expect(pitchFromMidi(21, 'B')).toEqual({ degree: 'b7', octaveOffset: -5 });
    expect(() => pitchFromMidi(60.5, 'C')).toThrow();
    expect(() => pitchFromMidi(60, 'H')).toThrow();
  });

  it('describes a note for the board, the keyboard and the grid', () => {
    const e = describeNote(64, 'C', 'ionian');
    expect(e).toMatchObject({ semitoneFromRoot: 4, inScale: true, isRoot: false, roleId: '3', degree: '3', name: 'E', fullName: 'E4', interval: 'M3' });
    expect(labelFor(e, 'notes')).toBe('E');
    expect(labelFor(e, 'degrees')).toBe('3');
    expect(labelFor(e, 'intervals')).toBe('M3');
    const out = describeNote(61, 'C', 'ionian');
    expect(out.inScale).toBe(false);
    expect(labelFor(out, 'degrees')).toBe(out.name);
    expect(describeNote(60, 'C').isRoot).toBe(true);
    // Spelled against the Key, diatonically: the 3 of Db is F.
    expect(describeNote(65, 'Db').name).toBe('F');
  });
});

describe('core/composer — the record cursor', () => {
  it('AC-19.4.1/1 — Pressing Record marks the first sounding Slot with no note, in playing order, as the target, shown in the composing grid by a mark that is neither the playback cursor nor the selection: the first unpitched sounding Slot', () => {
    let p = blankDraft();
    expect(soundingSlots(p)).toEqual([at(0, 0), at(0, 1), at(0, 2), at(0, 3)]);
    expect(recordTarget(p)).toEqual(at(0, 0));
    p = recordNote(p, at(0, 0), 60);
    p = recordNote(p, at(0, 1), 62);
    expect(recordTarget(p)).toEqual(at(0, 2));
    // A silent Slot is never a target, whatever sits before it.
    p = cycleSyllable(p, at(0, 0, 2)); // turns Beat 1 Slot 3 on, unpitched
    expect(recordTarget(p)).toEqual(at(0, 0, 2));
  });

  it('AC-19.4.2/2 — The target then moves to the next sounding Slot after it that has no note, in playing order: nextTarget', () => {
    let p = blankDraft();
    p = recordNote(p, at(0, 2), 67);
    expect(nextTarget(p, at(0, 0))).toEqual(at(0, 1));
    // Beat 3 already has a note, so from Beat 2 the next target is Beat 4.
    expect(nextTarget(p, at(0, 1))).toEqual(at(0, 3));
  });

  it('AC-19.4.2/3 — Recording the last sounding Slot without a note leaves record mode, with no target marked: no next target after the last', () => {
    let p = blankDraft();
    for (let b = 0; b < 3; b++) p = recordNote(p, at(0, b), 60 + b);
    expect(nextTarget(p, at(0, 3))).toBeNull();
    p = recordNote(p, at(0, 3), 65);
    expect(recordTarget(p)).toBeNull();
    expect(isComplete(p)).toBe(true);
  });

  it('AC-19.4.3/1 — Delete clears the note of the nearest sounding Slot before the target and makes that Slot the target: previousSounding and clearNote', () => {
    let p = blankDraft();
    p = recordNote(p, at(0, 0), 60);
    p = recordNote(p, at(0, 1), 62);
    const before = previousSounding(p, at(0, 2));
    expect(before).toEqual(at(0, 1));
    p = clearNote(p, before);
    expect(pitchAt(p, at(0, 1))).toBeUndefined();
    expect(pitchAt(p, at(0, 0))).toEqual({ degree: '1', octaveOffset: 0 });
    expect(recordTarget(p)).toEqual(at(0, 1));
  });

  it('AC-19.4.3/2 — With the target on the first sounding Slot, Delete changes nothing: no Slot before the first', () => {
    const p = blankDraft();
    expect(previousSounding(p, at(0, 0))).toBeNull();
  });

  it("AC-19.4.2/1 — A tap on a fret or key gives the target that note, shown in the Slot's note box, and sounds it with the instrument's voice: recordNote stores the Key's degree", () => {
    // F4 in G Mixolydian: the scale's own b7, an octave under the strip's F5.
    const p = recordNote(blankDraft('G', 'mixolydian'), at(0, 0), 65);
    expect(pitchAt(p, at(0, 0))).toEqual({ degree: 'b7', octaveOffset: -1 });
    expect(resolve(pitchAt(p, at(0, 0)), 'G').midiNote).toBe(65);
    expect(() => recordNote(blankDraft(), at(0, 0, 1), 60)).toThrow();
  });
});

describe('core/composer — editing a draft', () => {
  it('AC-19.5.3/3 — A Slot cycled to off loses its note, and the count of syllables without a note follows', () => {
    let p = blankDraft();
    p = recordNote(p, at(0, 0), 60);
    expect(missingCount(p)).toBe(3);
    // Off → default → medium? The cycle from the default runs through the other
    // two levels and back to off; follow it until the Slot is silent.
    let q = p;
    for (let i = 0; i < 4 && q.measures[0].beats[0].slots[0].on; i++) q = cycleSyllable(q, at(0, 0));
    expect(q.measures[0].beats[0].slots[0].on).toBe(false);
    expect(q.measures[0].beats[0].slots[0].pitch).toBeUndefined();
    expect(missingCount(q)).toBe(3);
    // A Slot turned on has no note and raises the count.
    const r = cycleSyllable(p, at(0, 0, 1));
    expect(r.measures[0].beats[0].slots[1]).toMatchObject({ on: true });
    expect(r.measures[0].beats[0].slots[1].pitch).toBeUndefined();
    expect(missingCount(r)).toBe(4);
  });

  it('AC-19.5.4/1 — With a note recorded, Double Length asks whether the new Measures keep the notes or start percussive, and cancelling leaves the composition unchanged: hasAnyNote decides whether there is anything to ask about', () => {
    let p = blankDraft();
    expect(hasAnyNote(p)).toBe(false);
    p = recordNote(p, at(0, 0), 60);
    expect(hasAnyNote(p)).toBe(true);
  });

  it('AC-19.5.4/2 — Starting percussive appends a copy of every Measure with its notes cleared, and the original Measures keep theirs', () => {
    let p = blankDraft();
    for (let b = 0; b < 4; b++) p = recordNote(p, at(0, b), 60 + b);
    const d = duplicateUnpitched(p);
    expect(d.measures).toHaveLength(2);
    expect(d.measures[0].beats.map((b) => b.slots[0].pitch?.degree)).toEqual(['1', 'b2', '2', 'b3']);
    expect(d.measures[1].beats.map((b) => b.slots[0].on)).toEqual([true, true, true, true]);
    expect(d.measures[1].beats.map((b) => b.slots[0].pitch)).toEqual([undefined, undefined, undefined, undefined]);
    expect(missingCount(d)).toBe(4);
    expect(recordTarget(d)).toEqual(at(1, 0));
  });

  it('AC-19.5.4/4 — Keeping the notes appends a copy of every Measure carrying the same notes as the originals: duplicate from core/pattern.js', () => {
    let p = blankDraft();
    for (let b = 0; b < 4; b++) p = recordNote(p, at(0, b), 60 + b);
    const d = duplicate(p);
    expect(d.measures).toHaveLength(2);
    expect(d.measures[1]).toEqual(d.measures[0]);
    expect(d.measures[1].beats.map((b) => b.slots[0].pitch?.degree)).toEqual(['1', 'b2', '2', 'b3']);
    expect(missingCount(d)).toBe(0);
  });

  it('AC-19.5.4/6 — Double Length is disabled when the result would exceed 32 Measures: canDuplicate', () => {
    let p = blankDraft();
    expect(canDuplicate(p)).toBe(true);
    for (let i = 0; i < 15; i++) p = addMeasure(p);
    expect(p.measures).toHaveLength(16);
    expect(canDuplicate(p)).toBe(true); // doubling to exactly 32
    p = addMeasure(p);
    expect(p.measures).toHaveLength(17);
    expect(canDuplicate(p)).toBe(false);
    expect(() => duplicateUnpitched(p)).toThrow();
  });
});

describe('core/composer — from the library (US-19.8)', () => {
  it('AC-19.8.1/2 — Confirming opens the rhythm as a composition in C Ionian with every sounding Slot unpitched and its accents kept, and the library is unchanged until the first save: fromPercussive', () => {
    let p = { ...create('Bossa'), id: 'p_1' };
    p = cycleAccent(p, 0, 0, 0);
    p = cycleAccent(p, 0, 2, 0);
    p = cycleAccent(p, 0, 2, 0); // an override above the default
    expect(loadKind(p)).toBe('percussive');
    const d = fromPercussive(p, 'My line');
    expect(d).toMatchObject({ name: 'My line', soundMode: 'melodic', key: 'C', scale: 'ionian', rating: 0 });
    expect(d.id).toBeUndefined();
    expect(d.measures[0].beats[0].slots[0]).toMatchObject({ on: true });
    expect(d.measures[0].beats[2].slots[0].accent).toBe(p.measures[0].beats[2].slots[0].accent);
    expect(missingCount(d)).toBe(2);
    // The original is a different object, untouched.
    expect(p.soundMode).toBe('percussive');
    expect(p.measures[0].beats[0].slots[0].pitch).toBeUndefined();
  });

  it("AC-19.8.2/2 — The composition's Slots carry, as stored degrees, the notes the progression and fill would have sounded, pass by pass, the harmonic cycle unrolled into Measures when it fits within 32 and the first pass alone otherwise, and a notice says which", () => {
    let p = { ...blankDraft('C', 'ionian'), id: 'p_h' };
    p = setProgression(p, 'I-IV-V');
    p = setArpeggio(p, 'up');
    expect(loadKind(p)).toBe('harmonic');
    const { pattern: baked, unrolled, passes } = bakeHarmony(p, 'Baked');
    expect(unrolled).toBe(true);
    expect(passes).toBe(3);
    expect(baked.measures).toHaveLength(3);
    // Each Measure carries what that pass sounded, note for note.
    for (let pass = 0; pass < 3; pass++) {
      const expected = buildTimeline(p, pass).map((e) => e.pitch.midiNote);
      const got = baked.measures[pass].beats.map((b) => resolve(b.slots[0].pitch, 'C').midiNote);
      expect(got).toEqual(expected);
    }
    // The IV's root is heard somewhere in pass 1 — the melody really did move.
    expect(buildTimeline(baked, 0).map((e) => e.pitch.midiNote)).not.toEqual(buildTimeline(p, 1).map((e) => e.pitch.midiNote));
    expect(validate(baked).valid).toBe(true);

    // Fits: a 3-Measure Pattern over four chords changing every pass is 12 Measures, within 32.
    let mid = addMeasure(addMeasure(p));
    mid = setProgression(mid, 'I-V-vi-IV');
    mid = setChange(mid, 'pass');
    const whole = bakeHarmony(mid, 'Mid');
    expect(whole.unrolled).toBe(true);
    expect(whole.passes).toBe(4);
    expect(whole.pattern.measures).toHaveLength(12);

    // Too long to unroll: a 9-Measure Pattern over the same four chords is 36 Measures.
    let long = p;
    for (let i = 0; i < 8; i++) long = addMeasure(long);
    long = setProgression(long, 'I-V-vi-IV');
    long = setChange(long, 'pass');
    const truncated = bakeHarmony(long, 'Long');
    expect(truncated.unrolled).toBe(false);
    expect(truncated.passes).toBe(4);
    expect(truncated.pattern.measures).toHaveLength(9);
  });

  it('AC-19.8.2/3 — The composition carries no progression and no Register — every note is where it sounds — and the original Pattern is unchanged', () => {
    let p = { ...blankDraft('D', 'ionian'), id: 'p_h', register: 1 };
    p = setProgression(p, 'I-IV-V');
    p = setArpeggio(p, 'up');
    const before = JSON.stringify(p);
    const { pattern: baked } = bakeHarmony(p, 'Baked');
    expect(baked.harmony).toBeUndefined();
    expect(baked.register).toBeUndefined();
    expect(baked.id).toBeUndefined();
    expect(baked.key).toBe('D');
    // The Register was heard an octave up, and that is what is stored now.
    expect(resolve(baked.measures[0].beats[0].slots[0].pitch, 'D').midiNote).toBe(buildTimeline(p, 0)[0].pitch.midiNote);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("AC-19.8.3/3 — A Pattern with a Register opens with the Register folded into each note's octave, so the grid, the instrument and playback agree, and the saved composition carries no Register: foldRegister", () => {
    let p = { ...blankDraft(), id: 'p_m', register: -2 };
    for (let b = 0; b < 4; b++) p = setPitch(p, 0, b, 0, { degree: '1', octaveOffset: b - 1 });
    const heard = buildTimeline(p, 0).map((e) => e.pitch.midiNote);
    const folded = foldRegister(p);
    expect(folded.register).toBeUndefined();
    expect(folded.measures[0].beats.map((b) => b.slots[0].pitch.octaveOffset)).toEqual([-3, -2, -1, 0]);
    expect(buildTimeline(folded, 0).map((e) => e.pitch.midiNote)).toEqual(heard);
    // Without a Register nothing moves.
    expect(foldRegister({ ...p, register: 0 }).measures).toEqual(p.measures);
    const copy = copyMelody(p, 'Copy');
    expect(copy).toMatchObject({ name: 'Copy', rating: 0 });
    expect(copy.id).toBeUndefined();
    expect(loadKind(p)).toBe('melodic');
  });
});

describe('core/composer — saving (US-19.9)', () => {
  it('AC-19.9.1/1 — Save is disabled while any sounding Slot has no note, with the number missing shown beside it: missingCount and isComplete', () => {
    let p = blankDraft();
    expect(missingCount(p)).toBe(4);
    expect(isComplete(p)).toBe(false);
    for (let b = 0; b < 3; b++) p = recordNote(p, at(0, b), 60);
    expect(missingCount(p)).toBe(1);
    expect(isComplete(p)).toBe(false);
    p = recordNote(p, at(0, 3), 60);
    expect(missingCount(p)).toBe(0);
    expect(isComplete(p)).toBe(true);
  });

  it('AC-19.9.1/2 — With every sounding Slot pitched, Save is enabled, and pressing it adds the composition to the library as an owned Melodic Pattern under its name, carrying the `custom` Tag: a complete draft is a valid Pattern and an incomplete one is not', () => {
    let p = blankDraft();
    expect(validate(p).valid).toBe(false);
    for (let b = 0; b < 4; b++) p = recordNote(p, at(0, b), 60 + b);
    expect(validate(p)).toEqual({ valid: true, errors: [] });
  });
});
