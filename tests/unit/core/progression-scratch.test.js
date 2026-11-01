/*
 * US-2.17 — Start a chord progression from scratch. The pure half: one chord,
 * the tonic spelled from the scale, with the change setting, the arpeggio and
 * every stored Pitch carried as a catalogue pick carries them; built up and
 * down with the chord editor's own mutations; matched back to the catalogue
 * when the chords reach an entry (research.md D-024). What the Composer sees
 * is proved in tests/e2e/progression-scratch.spec.js.
 */
import { describe, it, expect } from 'vitest';
import { create, cycleAccent, validate } from '../../../src/core/pattern.js';
import {
  MAX_CHORDS,
  startProgression,
  setProgression,
  setArpeggio,
  setChange,
  setChordDegree,
  addChord,
  removeChord,
  matchProgression,
  chordName,
} from '../../../src/core/harmony.js';
import { buildTimeline } from '../../../src/core/timeline.js';

/** A Melodic Pattern, one Measure of 4/4 with a note on every Beat. */
function melodic({ key = 'C', scale = 'ionian' } = {}) {
  let p = { ...create(), soundMode: 'melodic', key, scale, tempo: 120 };
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
  return p;
}

/** The Pattern with one Slot's Pitch set. */
function note(p, b, pitch) {
  const next = structuredClone(p);
  next.measures[0].beats[b].slots[0].pitch = pitch;
  return next;
}

const pitches = (p) => p.measures.flatMap((m) => m.beats.flatMap((b) => b.slots.map((s) => s.pitch ?? null)));
const names = (p) => p.harmony.chords.map((c) => chordName(c, p.key));

describe('US-2.17 — start a chord progression from scratch', () => {
  it('AC-2.17.1/2 — Choosing Custom gives the Pattern one chord, the tonic of the Key spelled from the scale as a catalogue pick spells it, over its root: C in C Ionian, Cm in C Aeolian and under C Minor Pentatonic, D in D Mixolydian: the data', () => {
    const ionian = startProgression(melodic());
    expect(ionian.harmony.chords).toEqual([{ degree: '1', quality: 'maj' }]);
    expect(names(ionian)).toEqual(['C']);
    expect(() => validate(ionian)).not.toThrow();
    expect(names(startProgression(melodic({ scale: 'aeolian' })))).toEqual(['Cm']);
    expect(names(startProgression(melodic({ scale: 'minor-pentatonic' })))).toEqual(['Cm']);
    expect(names(startProgression(melodic({ key: 'D', scale: 'mixolydian' })))).toEqual(['D']);
    // Over its root: no inversion is written, so nothing re-voices it later.
    expect(ionian.harmony.chords[0].inversion).toBeUndefined();
  });

  it('AC-2.17.1/3 — The Arpeggio already chosen stays and Ascending is set only when it is None, as a catalogue pick does; a progression begun with none in force changes every pass, and one begun over a progression keeps its change setting: the data', () => {
    // Begun with no progression: every pass, and the arpeggio is left for the
    // app to set as it does after a catalogue pick (AC-2.6.1/7).
    const fresh = startProgression(melodic());
    expect(fresh.harmony.change).toBe('pass');
    expect(fresh.harmony.arpeggio).toBeUndefined();
    // Begun over a progression changing every Measure under Alberti: both stay.
    const over = startProgression(setChange(setArpeggio(setProgression(melodic(), 'I-IV-V'), 'alberti'), 'measure'));
    expect(over.harmony.change).toBe('measure');
    expect(over.harmony.arpeggio).toBe('alberti');
    expect(over.harmony.chords).toHaveLength(1);
  });

  it('AC-2.17.1/4 — Choosing Custom while a catalogue progression is in force replaces its chords with the one chord, and every stored Pitch is left exactly as it was: the data', () => {
    let p = setProgression(melodic(), 'I-V-vi-IV');
    p = note(p, 0, { tone: 3, octaveOffset: 0 });
    p = note(p, 1, { degree: '5', octaveOffset: -1 });
    p = note(p, 2, { tone: 5, octaveOffset: 1 });
    p = note(p, 3, { degree: '1', octaveOffset: 0 });
    const before = pitches(p);
    const started = startProgression(p);
    expect(started.harmony.chords).toEqual([{ degree: '1', quality: 'maj' }]);
    expect(pitches(started)).toEqual(before);
    // The roles still resolve, now through the one chord in every pass.
    const heard = (pass) => buildTimeline(started, pass).map((e) => e.pitch.midiNote);
    expect(heard(0)).toEqual(heard(3));
    expect(heard(0)[0]).toBe(64);
    // And the original is untouched.
    expect(p.harmony.chords).toHaveLength(4);
  });

  it('AC-2.17.2/1 — The chord editor opens with one row; + Chord adds a copy of the last chord, up to sixteen, and a chord is removed down to one, never to none: the data', () => {
    let p = startProgression(melodic({ scale: 'aeolian' }));
    expect(p.harmony.chords).toHaveLength(1);
    for (let n = 2; n <= MAX_CHORDS; n++) {
      p = addChord(p);
      expect(p.harmony.chords).toHaveLength(n);
      expect(p.harmony.chords[n - 1]).toEqual(p.harmony.chords[0]);
    }
    expect(() => addChord(p)).toThrow();
    for (let n = MAX_CHORDS; n > 1; n--) {
      p = removeChord(p, n - 1);
      expect(p.harmony.chords).toHaveLength(n - 1);
    }
    expect(() => removeChord(p, 0)).toThrow();
    expect(names(p)).toEqual(['Cm']);
  });

  it('AC-2.17.2/2 — The picker reads Custom while the chords match no catalogue entry and names the entry when they do: one chord built into C, F and G reads I–IV–V, and that progression with its second root set to ♭6 reads Custom again: the data', () => {
    let p = startProgression(melodic());
    expect(matchProgression(p)).toBeNull();
    p = addChord(addChord(p));
    expect(matchProgression(p)).toBeNull();
    p = setChordDegree(setChordDegree(p, 1, '4'), 2, '5');
    expect(names(p)).toEqual(['C', 'F', 'G']);
    expect(matchProgression(p)).toBe('I-IV-V');
    const edited = setChordDegree(p, 1, 'b6');
    expect(names(edited)).toEqual(['C', 'Ab', 'G']);
    expect(matchProgression(edited)).toBeNull();
  });
});
