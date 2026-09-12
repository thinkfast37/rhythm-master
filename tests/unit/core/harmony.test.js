/**
 * Chord progressions and chord-tone Pitches (US-2.6, research.md D-011).
 */
import { describe, it, expect } from 'vitest';
import {
  setProgression,
  clearHarmony,
  setChange,
  setChordQuality,
  setChordDegree,
  addChord,
  removeChord,
  fillChordTones,
  chordAt,
  cyclePasses,
  chordName,
  resolveChordTone,
  chordToneName,
  memberFor,
  MAX_CHORDS,
} from '../../../src/core/harmony.js';
import { create, cycleAccent, setPitch, addMeasure } from '../../../src/core/pattern.js';
import { buildTimeline } from '../../../src/core/timeline.js';

/** A Melodic Pattern in a Key and scale, `measures` Measures of 4/4. */
function melodic({ key = 'C', scale = 'ionian', measures = 1 } = {}) {
  let p = { ...create(), soundMode: 'melodic', key, scale, tempo: 120 };
  for (let i = 1; i < measures; i++) p = addMeasure(p);
  return p;
}

/** Turn on Slot (m, b, s) and give it a Pitch. */
function note(p, m, b, s, pitch) {
  p = cycleAccent(p, m, b, s);
  return setPitch(p, m, b, s, pitch);
}

const names = (p) => p.harmony.chords.map((c) => chordName(c, p.key));
const pitches = (p) =>
  p.measures.flatMap((m) => m.beats.flatMap((b) => b.slots.filter((s) => s.on).map((s) => s.pitch)));

describe('core/harmony', () => {
  // --- AC-2.6.1 — A progression is chosen from a catalogue of named progressions ---

  it("AC-2.6.1/2 — Choosing a progression gives the Pattern one chord per step, each named in the Pattern's Key: I–IV–V in C is C, F and G", () => {
    const p = setProgression(melodic(), 'I-IV-V');
    expect(p.harmony.chords).toHaveLength(3);
    expect(names(p)).toEqual(['C', 'F', 'G']);
    expect(p.harmony.chords).toEqual([
      { degree: '1', quality: 'maj' },
      { degree: '4', quality: 'maj' },
      { degree: '5', quality: 'maj' },
    ]);
  });

  it('AC-2.6.1/3 — Qualities are diatonic to the scale at the moment of choosing: i–iv–v in C Aeolian is Cm, Fm and Gm, and ii–V–I in C Ionian is Dm7, G7 and Cmaj7', () => {
    expect(names(setProgression(melodic({ scale: 'aeolian' }), 'i-iv-v'))).toEqual(['Cm', 'Fm', 'Gm']);
    expect(names(setProgression(melodic({ scale: 'aeolian' }), 'I-IV-V'))).toEqual(['Cm', 'Fm', 'Gm']);
    expect(names(setProgression(melodic(), 'ii-V-I'))).toEqual(['Dm7', 'G7', 'Cmaj7']);
  });

  it('AC-2.6.1/4 — A pentatonic or blues scale spells its chords from the parallel Ionian, or from Aeolian when the scale has ♭3 and no 3: I–IV–V under C Minor Pentatonic is Cm, Fm and Gm', () => {
    expect(names(setProgression(melodic({ scale: 'minor-pentatonic' }), 'I-IV-V'))).toEqual(['Cm', 'Fm', 'Gm']);
    expect(names(setProgression(melodic({ scale: 'minor-blues' }), 'I-IV-V'))).toEqual(['Cm', 'Fm', 'Gm']);
    expect(names(setProgression(melodic({ scale: 'major-pentatonic' }), 'I-IV-V'))).toEqual(['C', 'F', 'G']);
    // Major Blues has both ♭3 and 3, so it stacks from Ionian.
    expect(names(setProgression(melodic({ scale: 'major-blues' }), 'I-IV-V'))).toEqual(['C', 'F', 'G']);
  });

  it('AC-2.6.1/5 — A step whose root lies outside the scale takes the quality the catalogue names for it, or a major triad: ♭VII in C Ionian is B♭', () => {
    expect(names(setProgression(melodic(), 'I-bVII-IV'))).toEqual(['C', 'Bb', 'F']);
    // The Andalusian names its V major explicitly, whatever the scale would say.
    expect(names(setProgression(melodic({ scale: 'aeolian' }), 'andalusian'))).toEqual(['Cm', 'Bb', 'Ab', 'G']);
  });

  it('AC-2.6.1/6 — Choosing None removes the progression, and every chord-tone Pitch becomes the scale degree it sounded under the first chord, so the first pass sounds exactly as before', () => {
    let p = setProgression(melodic(), 'ii-V-I'); // Dm7 first
    p = setChordQuality(p, 0, 'm9');
    p = note(p, 0, 0, 0, { tone: 1, octaveOffset: 0 });
    p = note(p, 0, 1, 0, { tone: 3, octaveOffset: 0 });
    p = note(p, 0, 2, 0, { tone: 9, octaveOffset: 0 });
    const before = buildTimeline(p, 0).map((e) => e.pitch.midiNote);

    const cleared = clearHarmony(p);
    expect('harmony' in cleared).toBe(false);
    expect(pitches(cleared)).toEqual([
      { degree: '2', octaveOffset: 0 },
      { degree: '4', octaveOffset: 0 },
      // The 9th of Dm9 is E5: degree 3, an octave up.
      { degree: '3', octaveOffset: 1 },
    ]);
    expect(buildTimeline(cleared, 0).map((e) => e.pitch.midiNote)).toEqual(before);
  });

  // --- AC-2.6.2 — Each chord's root and quality are adjusted individually ---

  it("AC-2.6.2/2 — Changing one chord's quality changes that chord alone: I–IV–V in C with the I set to maj7 reads Cmaj7, F, G", () => {
    const p = setChordQuality(setProgression(melodic(), 'I-IV-V'), 0, 'maj7');
    expect(names(p)).toEqual(['Cmaj7', 'F', 'G']);
  });

  it("AC-2.6.2/3 — A chord's root can be changed to any of the twelve chromatic degrees, and it is renamed accordingly", () => {
    let p = setProgression(melodic(), 'I-IV-V');
    for (const token of ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7']) {
      p = setChordDegree(p, 1, token);
      expect(p.harmony.chords[1].degree).toBe(token);
    }
    expect(names(setChordDegree(p, 1, 'b3'))).toEqual(['C', 'Eb', 'G']);
    expect(() => setChordDegree(p, 1, 'x')).toThrow();
  });

  it('AC-2.6.2/4 — A chord can be added, up to sixteen, and removed, down to one', () => {
    let p = setProgression(melodic(), 'I-IV');
    while (p.harmony.chords.length < MAX_CHORDS) p = addChord(p);
    expect(p.harmony.chords).toHaveLength(16);
    // The added chord starts as a copy of the last one.
    expect(p.harmony.chords[15]).toEqual(p.harmony.chords[1]);
    expect(() => addChord(p)).toThrow(/at most 16/);
    while (p.harmony.chords.length > 1) p = removeChord(p, 0);
    expect(p.harmony.chords).toHaveLength(1);
    expect(() => removeChord(p, 0)).toThrow(/at least one/);
  });

  it("AC-2.6.2/5 — Changing the scale afterwards changes no chord: a quality is the Composer's data once chosen", () => {
    const p = setChordQuality(setProgression(melodic(), 'I-IV-V'), 2, '7');
    const rescaled = { ...p, scale: 'aeolian' };
    expect(rescaled.harmony).toEqual(p.harmony);
    expect(names(rescaled)).toEqual(['C', 'F', 'G7']);
    expect(buildTimeline(note(rescaled, 0, 0, 0, { tone: 3, octaveOffset: 0 }), 0)[0].pitch.midiNote).toBe(64);
  });

  // --- AC-2.6.3 — The chord changes every pass or every Measure ---

  it('AC-2.6.3/1 — Every pass: pass p sounds chord p mod n throughout, so a four-chord progression over a four-Measure Pattern takes four passes to come round', () => {
    const p = setProgression(melodic({ measures: 4 }), 'I-V-vi-IV');
    for (let pass = 0; pass < 8; pass++) {
      for (let m = 0; m < 4; m++) expect(chordAt(p, pass, m)).toBe(pass % 4);
    }
    expect(cyclePasses(p)).toBe(4);
  });

  it('AC-2.6.3/2 — Every Measure: Measure m of pass p sounds chord (p × M + m) mod n, continuing across passes rather than restarting each one — the twelve-bar blues over eight Measures comes round after three passes', () => {
    const p = setChange(setProgression(melodic({ measures: 8 }), 'twelve-bar-blues'), 'measure');
    expect(p.harmony.chords).toHaveLength(12);
    expect(chordAt(p, 0, 0)).toBe(0);
    expect(chordAt(p, 0, 7)).toBe(7);
    expect(chordAt(p, 1, 0)).toBe(8);
    expect(chordAt(p, 1, 3)).toBe(11);
    expect(chordAt(p, 1, 4)).toBe(0);
    expect(chordAt(p, 2, 7)).toBe(11);
    expect(chordAt(p, 3, 0)).toBe(0);
    expect(cyclePasses(p)).toBe(3);
    // Four chords over four Measures under the same setting: one pass.
    expect(cyclePasses(setChange(setProgression(melodic({ measures: 4 }), 'I-V-vi-IV'), 'measure'))).toBe(1);
  });

  it('AC-2.6.3/3 — Every pass is the setting a newly chosen progression starts with', () => {
    expect(setProgression(melodic(), 'I-IV-V').harmony.change).toBe('pass');
    expect(() => setChange(setProgression(melodic(), 'I-IV-V'), 'bar')).toThrow();
  });

  // --- AC-2.6.4 — A chord-tone Pitch sounds the member of the chord in force ---

  it("AC-2.6.4/1 — Root, 3rd, 5th, 7th and 9th resolve to the chord's members above its root, which sits at the armed octave: in C at octave 4 the 3rd of G is B4 and its 5th is D5", () => {
    const G = { degree: '5', quality: 'maj' };
    expect(resolveChordTone({ tone: 1, octaveOffset: 0 }, G, 'C').midiNote).toBe(67);
    expect(resolveChordTone({ tone: 3, octaveOffset: 0 }, G, 'C').midiNote).toBe(71);
    expect(resolveChordTone({ tone: 5, octaveOffset: 0 }, G, 'C').midiNote).toBe(74);
    expect(chordToneName({ tone: 3, octaveOffset: 0 }, G, 'C').text).toBe('B4');
    expect(chordToneName({ tone: 5, octaveOffset: 0 }, G, 'C').text).toBe('D5');
    const G9 = { degree: '5', quality: '9' };
    expect(chordToneName({ tone: 7, octaveOffset: 0 }, G9, 'C').text).toBe('F5');
    expect(chordToneName({ tone: 9, octaveOffset: 0 }, G9, 'C').text).toBe('A5');
    // An octave down moves the whole chord down.
    expect(resolveChordTone({ tone: 3, octaveOffset: -1 }, G, 'C').midiNote).toBe(59);
    // Spelling follows the chord's letters: the 3rd of D♭ is F, its 5th A♭.
    expect(chordToneName({ tone: 3, octaveOffset: 0 }, { degree: 'b2', quality: 'maj' }, 'C').text).toBe('F4');
    expect(chordToneName({ tone: 5, octaveOffset: 0 }, { degree: 'b2', quality: 'maj' }, 'C').text).toBe('Ab4');
  });

  it("AC-2.6.4/2 — A role the chord lacks sounds the chord's next-lower member: the 7th of a C major triad sounds its 5th, and the 9th of Cmaj7 sounds its 7th", () => {
    const C = { degree: '1', quality: 'maj' };
    const Cmaj7 = { degree: '1', quality: 'maj7' };
    expect(memberFor(C, 7)).toEqual({ interval: 7, tone: 5 });
    expect(resolveChordTone({ tone: 7, octaveOffset: 0 }, C, 'C').midiNote).toBe(67);
    expect(memberFor(Cmaj7, 9)).toEqual({ interval: 11, tone: 7 });
    expect(resolveChordTone({ tone: 9, octaveOffset: 0 }, Cmaj7, 'C').midiNote).toBe(71);
    expect(chordToneName({ tone: 9, octaveOffset: 0 }, Cmaj7, 'C').text).toBe('B4');
    // The 9th of a triad falls all the way to the 5th.
    expect(memberFor(C, 9)).toEqual({ interval: 7, tone: 5 });
  });

  it('AC-2.6.4/3 — The same Slot sounds a different note under each chord: a Root under I–IV–V in C sounds C, then F, then G', () => {
    const p = note(setProgression(melodic(), 'I-IV-V'), 0, 0, 0, { tone: 1, octaveOffset: 0 });
    expect([0, 1, 2, 3].map((pass) => buildTimeline(p, pass)[0].pitch.midiNote)).toEqual([60, 65, 67, 60]);
    expect(buildTimeline(p, 1)[0].chordIndex).toBe(1);
    expect(buildTimeline(p, 1)[0].pass).toBe(1);
  });

  it('AC-2.6.4/4 — A scale-degree Pitch is unaffected by the progression, so fixed notes and chord tones mix in one Pattern', () => {
    let p = setProgression(melodic(), 'I-IV-V');
    p = note(p, 0, 0, 0, { degree: '5', octaveOffset: 0 });
    p = note(p, 0, 1, 0, { tone: 1, octaveOffset: 0 });
    const notes = (pass) => buildTimeline(p, pass).map((e) => e.pitch.midiNote);
    expect(notes(0)).toEqual([67, 60]);
    expect(notes(1)).toEqual([67, 65]);
    expect(notes(2)).toEqual([67, 67]);
  });

  it('AC-2.6.4/5 — Changing the Key transposes every chord and chord tone with it, altering no stored role, degree or octave', () => {
    const inC = note(setProgression(melodic(), 'I-IV-V'), 0, 0, 0, { tone: 3, octaveOffset: 0 });
    const inG = { ...inC, key: 'G' };
    expect(names(inG)).toEqual(['G', 'C', 'D']);
    expect(inG.harmony).toEqual(inC.harmony);
    expect(pitches(inG)).toEqual(pitches(inC));
    for (const pass of [0, 1, 2]) {
      expect(buildTimeline(inG, pass)[0].pitch.midiNote).toBe(buildTimeline(inC, pass)[0].pitch.midiNote + 7);
    }
  });

  // --- AC-2.6.6 — Fill deals chord tones across the sounding Slots ---

  /** Slot (b, s) of each of two Measures on: Measure 1 Beats 1–2, Measure 2 Beats 1–2. */
  function twoMeasures(p) {
    for (const m of [0, 1]) for (const b of [0, 1]) p = cycleAccent(p, m, b, 0);
    return p;
  }

  it('AC-2.6.6/2 — The deal restarts at every Measure, so each Measure opens on the Root', () => {
    const p = fillChordTones(twoMeasures(setProgression(melodic({ measures: 2 }), 'ii-V-I')), 'up');
    expect(pitches(p).map((x) => x.tone)).toEqual([1, 3, 1, 3]);
  });

  it('AC-2.6.6/3 — Ascending deals the roles in order and repeats: over four roles, five sounding Slots take Root, 3rd, 5th, 7th, Root', () => {
    let p = setProgression(melodic(), 'ii-V-I');
    for (let s = 0; s < 4; s++) p = cycleAccent(p, 0, 0, s);
    p = cycleAccent(p, 0, 1, 0);
    expect(pitches(fillChordTones(p, 'up')).map((x) => x.tone)).toEqual([1, 3, 5, 7, 1]);
  });

  it('AC-2.6.6/4 — Alberti deals Root, 5th, 3rd, 5th; Descending deals from the highest role down; Up and down rises then falls without repeating the turn', () => {
    let p = setProgression(melodic(), 'ii-V-I');
    for (let b = 0; b < 4; b++) for (let s = 0; s < 2; s++) p = cycleAccent(p, 0, b, s);
    const dealt = (order) => pitches(fillChordTones(p, order)).map((x) => x.tone);
    expect(dealt('alberti')).toEqual([1, 5, 3, 5, 1, 5, 3, 5]);
    expect(dealt('down')).toEqual([7, 5, 3, 1, 7, 5, 3, 1]);
    expect(dealt('up-down')).toEqual([1, 3, 5, 7, 5, 3, 1, 3]);
    expect(dealt('root')).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(dealt('root-fifth')).toEqual([1, 5, 1, 5, 1, 5, 1, 5]);
  });

  it("AC-2.6.6/5 — The roles dealt are the members of the progression's fullest chord, so a progression of triads deals Root, 3rd and 5th only", () => {
    let p = setProgression(melodic(), 'I-IV-V');
    for (let s = 0; s < 4; s++) p = cycleAccent(p, 0, 0, s);
    expect(pitches(fillChordTones(p, 'up')).map((x) => x.tone)).toEqual([1, 3, 5, 1]);
    // One seventh chord in the progression brings the 7th into the deal.
    expect(pitches(fillChordTones(setChordQuality(p, 2, '7'), 'up')).map((x) => x.tone)).toEqual([1, 3, 5, 7]);
  });

  it('AC-2.6.6/6 — Fill replaces the Pitch of every sounding Slot at the armed octave and nothing else: no Slot turns on or off and no Accent Level changes', () => {
    let p = setProgression(melodic(), 'I-IV-V');
    p = cycleAccent(p, 0, 0, 0);
    p = cycleAccent(p, 0, 0, 0); // a second tap: an explicit override
    p = note(p, 0, 2, 1, { degree: '5', octaveOffset: 0 });
    const before = p.measures[0].beats.map((b) => b.slots.map(({ on, accent }) => ({ on, accent })));

    const filled = fillChordTones(p, 'up', 1);
    expect(filled.measures[0].beats.map((b) => b.slots.map(({ on, accent }) => ({ on, accent })))).toEqual(before);
    expect(pitches(filled)).toEqual([
      { tone: 1, octaveOffset: 1 },
      { tone: 3, octaveOffset: 1 },
    ]);
    expect(p.measures[0].beats[2].slots[1].pitch).toEqual({ degree: '5', octaveOffset: 0 }); // the input is untouched
  });
});
