/*
 * US-2.16 — Chords with a member left out, and a wider chord catalogue. The
 * pure half: a struck member is gone from every reading of the chord, the
 * catalogue's new qualities spell as a chart spells them, the 11th and 13th are
 * roles, positional fills meet a two-member stack, and the data model admits
 * `omit` only as roles the chord has (research.md D-023).
 */
import { describe, it, expect } from 'vitest';
import { create, cycleAccent, addMeasure, validate } from '../../../src/core/pattern.js';
import {
  PROGRESSIONS,
  QUALITIES,
  setProgression as chooseProgression,
  spellProgression,
  setVoicing,
  setArpeggio,
  setChordQuality,
  setChordDegree,
  setChordBass,
  setChordOmit,
  omitOptions,
  addChord,
  removeChord,
  clearHarmony,
  chordName,
  chordNumeral,
  chordStack,
  bassOptions,
  arpeggioSequence,
} from '../../../src/core/harmony.js';
import { SCALES } from '../../../src/core/scales.js';
import { buildTimeline } from '../../../src/core/timeline.js';

const setProgression = (p, id) => setVoicing(chooseProgression(p, id), 'root');

/** A Melodic Pattern in C Ionian, `measures` Measures of 4/4, with `slots` sounding Slots a Measure on the Beats. */
function melodic({ measures = 1, slots = 4 } = {}) {
  let p = { ...create(), soundMode: 'melodic', key: 'C', scale: 'ionian', tempo: 120 };
  for (let i = 1; i < measures; i++) p = addMeasure(p);
  p.measures.forEach((m, mi) => {
    for (let b = 0; b < slots; b++) p = cycleAccent(p, mi, b, 0);
  });
  return p;
}

const notes = (p, pass = 0) => buildTimeline(p, pass).map((e) => e.pitch.midiNote);
const members = (chord) => bassOptions(chord, 'C').map((o) => o.name);

const ORIGINAL = ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '6', 'm6', 'maj7', 'm7', '7', 'm7b5', 'dim7', 'mMaj7', '7sus4', 'add9', '9', 'maj9', 'm9'];

describe('US-2.16 — a member left out', () => {
  it("AC-2.16.1/4 — Changing the chord's quality keeps every omission the new chord has a member for, and drops them all when together they would leave it fewer than two members; changing the root keeps them: G6(no5) made a 7 is G7(no5), Em7(no3) made minor is Em(no3), Em7(no3,5) made minor is Em: the data", () => {
    // I–IV–V with the IV made Em7: C, Em7, G.
    let p = setChordQuality(setChordDegree(setProgression(melodic(), 'I-IV-V'), 1, '3'), 1, 'm7');
    // G6(no5) made a 7 is G7(no5).
    p = setChordOmit(setChordQuality(p, 2, '6'), 2, 5, true);
    expect(chordName(p.harmony.chords[2], 'C')).toBe('G6(no5)');
    p = setChordQuality(p, 2, '7');
    expect(chordName(p.harmony.chords[2], 'C')).toBe('G7(no5)');
    expect(p.harmony.chords[2].omit).toEqual([5]);
    // Em7(no3) made minor is Em(no3); with the 5th struck too it is Em, nothing left to strike.
    p = setChordOmit(p, 1, 3, true);
    expect(chordName(setChordQuality(p, 1, 'min').harmony.chords[1], 'C')).toBe('Em(no3)');
    p = setChordOmit(p, 1, 5, true);
    expect(chordName(p.harmony.chords[1], 'C')).toBe('Em7(no3,5)');
    const em = setChordQuality(p, 1, 'min');
    expect(chordName(em.harmony.chords[1], 'C')).toBe('Em');
    expect(em.harmony.chords[1].omit).toBeUndefined();
    // A root change keeps them.
    expect(setChordDegree(p, 1, '2').harmony.chords[1].omit).toEqual([3, 5]);
    expect(chordName(setChordDegree(p, 1, '2').harmony.chords[1], 'C')).toBe('Dm7(no3,5)');
  });

  it("AC-2.16.1/7 — Choosing a progression from the picker gives chords leaving nothing out, a chord added with + Chord copies the last chord's omissions with its quality, and removing a chord takes them with it: the data", () => {
    let p = setProgression(melodic(), 'I-IV-V');
    expect(p.harmony.chords.every((c) => !('omit' in c))).toBe(true);
    p = setChordOmit(p, 2, 3, true);
    const added = addChord(p);
    expect(added.harmony.chords[3]).toEqual({ degree: '5', quality: 'maj', omit: [3] });
    expect(removeChord(added, 3).harmony.chords).toEqual(p.harmony.chords);
    // A fresh progression starts clean again.
    expect(setProgression(p, 'I-V-vi-IV').harmony.chords.every((c) => !('omit' in c))).toBe(true);
  });

  it("AC-2.16.2/1 — A fill deals the remaining members: with every chord of I–IV–V struck to root and 5th, Ascending over four Slots a Measure deals Root 5th Root 5th — C4 G4 C4 G4 — and where another chord of the progression still has the member, the struck member's step falls to the chord's next-lower member, so Cm7(no3) among triads deals C4 C4 G4 B♭4", () => {
    let p = setArpeggio(setProgression(melodic(), 'I-IV-V'), 'up');
    expect(notes(p)).toEqual([60, 64, 67, 60]);
    let bare = p;
    for (let i = 0; i < 3; i++) bare = setChordOmit(bare, i, 3, true);
    expect(notes(bare)).toEqual([60, 67, 60, 67]);
    expect(notes(bare, 1)).toEqual([65, 72, 65, 72]);
    // Among triads that keep their 3rd, Cm7(no3)'s 3rd step falls to its root.
    p = setChordOmit(setChordQuality(p, 0, 'm7'), 0, 3, true);
    expect(notes(p)).toEqual([60, 60, 67, 70]);
  });

  it('AC-2.16.2/2 — The stack is the remaining members from the bass up and the bass is counted among them: Em7(no3) over its 5th in C at octave 4 sounds B4, D5, E5 as 5th, 7th, Root', () => {
    // I–IV–V with the IV made Em7: C, Em7, G.
    let p = setChordQuality(setChordDegree(setProgression(melodic(), 'I-IV-V'), 1, '3'), 1, 'm7');
    p = setChordOmit(p, 1, 3, true);
    expect(members(p.harmony.chords[1])).toEqual(['E', 'B', 'D']);
    p = setChordBass(p, 1, 1);
    expect(p.harmony.chords[1]).toEqual({ degree: '3', quality: 'm7', omit: [3], inversion: 1 });
    expect(chordName(p.harmony.chords[1], 'C')).toBe('Em7(no3)/B');
    expect(chordStack(p.harmony.chords[1])).toEqual([
      { tone: 5, interval: 7, offset: 11 },
      { tone: 7, interval: 10, offset: 14 },
      { tone: 1, interval: 0, offset: 16 },
    ]);
    // The bass stays on its member while it remains, and returns to the root when it is struck (AC-2.16.1/5).
    expect(setChordOmit(p, 1, 3, false).harmony.chords[1]).toEqual({ degree: '3', quality: 'm7', inversion: 2 });
    expect(setChordOmit(p, 1, 5, true).harmony.chords[1]).toEqual({ degree: '3', quality: 'm7', omit: [3, 5] });
    // No fourth member to strike: a chord keeps two.
    expect(() => setChordOmit(setChordOmit(p, 1, 5, true), 1, 7, true)).toThrow(/at least 2/);
    expect(() => setChordOmit(p, 1, 1, true)).toThrow(/no member 1/);
    expect(() => setChordOmit(p, 0, 7, true)).toThrow(/no member 7/);
    // The toggles say the same (AC-2.16.1/1, /3).
    expect(omitOptions(p.harmony.chords[1])).toEqual([
      { tone: 3, label: '3', omitted: true, disabled: false },
      { tone: 5, label: '5', omitted: false, disabled: false },
      { tone: 7, label: '7', omitted: false, disabled: false },
    ]);
    const shell = setChordOmit(p, 1, 5, true).harmony.chords[1];
    expect(omitOptions(shell).map((o) => o.disabled)).toEqual([false, false, true]);
    expect(omitOptions({ degree: '1', quality: 'sus4' }).map((o) => o.label)).toEqual(['4', '5']);
    expect(omitOptions({ degree: '1', quality: '6' }).map((o) => o.label)).toEqual(['3', '5', '6']);
  });

  it('AC-2.16.2/4 — Choosing Progression None bakes the first pass as it sounded, the struck members gone from it, so the first pass sounds exactly as before', () => {
    let p = setArpeggio(setProgression(melodic(), 'I-IV-V'), 'up');
    p = setChordOmit(p, 0, 5, true);
    expect(notes(p)).toEqual([60, 64, 64, 60]);
    const baked = clearHarmony(p);
    expect(baked.harmony).toBeUndefined();
    expect(notes(baked)).toEqual([60, 64, 64, 60]);
  });
});

describe('US-2.16 — the wider catalogue', () => {
  it("AC-2.16.3/2 — Each new quality's members are its root and the intervals its name says, spelled from the root's letter: C5 is C G; C7sus2 is C D G B♭; C9sus4 is C F G B♭ D; C6/9 is C E G A D; Cm6/9 is C E♭ G A D; C7♭5 is C E G♭ B♭; C7♯5 is C E G♯ B♭; Cmaj7♯5 is C E G♯ B; Cmadd9 is C E♭ G D; Cadd11 is C E G F; Cmadd11 is C E♭ G F; C7♭9 is C E G B♭ D♭; C7♯9 is C E G B♭ D♯; C11 is C E G B♭ D F; Cm11 is C E♭ G B♭ D F; Cmaj7♯11 is C E G B F♯; C7♯11 is C E G B♭ F♯; Cmaj9♯11 is C E G B D F♯; C13 is C E G B♭ D A; Cmaj13 is C E G B D A; Cm13 is C E♭ G B♭ D A; C7♭13 is C E G B♭ A♭ — the 13ths leaving the 11th out as a chart does", () => {
    const expected = {
      5: ['C5', 'C G'],
      '7sus2': ['C7sus2', 'C D G Bb'],
      '9sus4': ['C9sus4', 'C F G Bb D'],
      69: ['C6/9', 'C E G A D'],
      m69: ['Cm6/9', 'C Eb G A D'],
      '7b5': ['C7♭5', 'C E Gb Bb'],
      '7#5': ['C7♯5', 'C E G# Bb'],
      'maj7#5': ['Cmaj7♯5', 'C E G# B'],
      madd9: ['Cmadd9', 'C Eb G D'],
      add11: ['Cadd11', 'C E G F'],
      madd11: ['Cmadd11', 'C Eb G F'],
      '7b9': ['C7♭9', 'C E G Bb Db'],
      '7#9': ['C7♯9', 'C E G Bb D#'],
      11: ['C11', 'C E G Bb D F'],
      m11: ['Cm11', 'C Eb G Bb D F'],
      'maj7#11': ['Cmaj7♯11', 'C E G B F#'],
      '7#11': ['C7♯11', 'C E G Bb F#'],
      'maj9#11': ['Cmaj9♯11', 'C E G B D F#'],
      13: ['C13', 'C E G Bb D A'],
      maj13: ['Cmaj13', 'C E G B D A'],
      m13: ['Cm13', 'C Eb G Bb D A'],
      '7b13': ['C7♭13', 'C E G Bb Ab'],
    };
    const added = QUALITIES.map((q) => q.id).filter((id) => !ORIGINAL.includes(id));
    expect(added.sort()).toEqual(Object.keys(expected).sort());
    for (const [id, [name, spelled]] of Object.entries(expected)) {
      const chord = { degree: '1', quality: id };
      expect(chordName(chord, 'C'), id).toBe(name);
      expect(members(chord).join(' '), id).toBe(spelled);
    }
    // Forty-one in all, no quality with two members in one role (D-023).
    expect(QUALITIES).toHaveLength(41);
    for (const q of QUALITIES) {
      const roles = chordStack({ degree: '1', quality: q.id }).map((m) => m.tone);
      expect(new Set(roles).size, q.id).toBe(roles.length);
    }
  });

  it('AC-2.16.3/4 — Nothing already written changes: every catalogue progression spells the chords it did, a stored quality is unchanged, and the numeral is lowercase from a minor third as before — ii11 and I5', () => {
    // Under the seven modes every stacked third is a quality the catalogue always had,
    // so no progression picks up a new one (the originals come first in the catalogue).
    const modes = SCALES.map((s) => s.id).filter((id) => ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'].includes(id));
    expect(modes).toHaveLength(7);
    for (const scale of modes) {
      for (const entry of PROGRESSIONS) {
        for (const chord of spellProgression(entry.id, scale)) {
          expect(ORIGINAL, `${entry.id} under ${scale}`).toContain(chord.quality);
        }
      }
    }
    // The originals keep their intervals.
    expect(QUALITIES.find((q) => q.id === 'maj').intervals).toEqual([0, 4, 7]);
    expect(QUALITIES.find((q) => q.id === 'm9').intervals).toEqual([0, 3, 7, 10, 14]);
    expect(chordNumeral({ degree: '2', quality: 'm11' })).toBe('ii11');
    expect(chordNumeral({ degree: '1', quality: '5' })).toBe('I5');
    expect(chordNumeral({ degree: '6', quality: 'm7', omit: [3] })).toBe('vi7(no3)');
  });

  it('AC-2.16.4/1 — Alberti over C5 deals Root 5th Root 5th, Root and fifth deals Root 5th, Travis picking deals Root Root↑ 5th Root↑, and Up and down deals Root 5th as it does over two roles', () => {
    let p = setProgression(melodic(), 'I-IV-V');
    for (let i = 0; i < 3; i++) p = setChordQuality(p, i, '5');
    const tones = (id) => arpeggioSequence(id, p).map((s) => (s.octave ? `${s.tone}↑` : String(s.tone)));
    expect(tones('alberti')).toEqual(['1', '5', '1', '5']);
    expect(tones('root-fifth')).toEqual(['1', '5']);
    expect(tones('travis')).toEqual(['1', '1↑', '5', '1↑']);
    expect(tones('up-down')).toEqual(['1', '5']);
    // Every fill in the catalogue still deals over two members.
    p = setArpeggio(p, 'sweep');
    expect(notes(p)).toHaveLength(4);
  });
});

describe('US-2.16 — the data model', () => {
  it('rule 14 — omit lists distinct roles the chord has, other than the root, ascending, leaving two members, and inversion indexes the remaining members', () => {
    const base = setProgression(melodic(), 'I-IV-V');
    const omitErrors = (chord) => {
      const p = structuredClone(base);
      p.harmony.chords[0] = chord;
      return validate(p).errors.filter((e) => /omit|inversion/.test(e));
    };
    expect(omitErrors({ degree: '1', quality: 'maj', omit: [3] })).toEqual([]);
    expect(omitErrors({ degree: '1', quality: 'm7', omit: [3, 5], inversion: 1 })).toEqual([]);
    expect(omitErrors({ degree: '1', quality: 'maj', omit: [1] })).toHaveLength(1);
    expect(omitErrors({ degree: '1', quality: 'maj', omit: [7] })).toHaveLength(1);
    expect(omitErrors({ degree: '1', quality: 'maj', omit: [5, 3] })).toHaveLength(1);
    expect(omitErrors({ degree: '1', quality: 'maj', omit: [] })).toHaveLength(1);
    expect(omitErrors({ degree: '1', quality: 'maj', omit: 3 })).toHaveLength(1);
    expect(omitErrors({ degree: '1', quality: 'maj', omit: [3, 5] })).toHaveLength(1);
    // Two members left: inversion 2 names a member C(no3) no longer has.
    expect(omitErrors({ degree: '1', quality: 'maj', omit: [3], inversion: 2 })).toHaveLength(1);
    expect(omitErrors({ degree: '1', quality: 'maj', omit: [3], inversion: 1 })).toEqual([]);
  });
});
