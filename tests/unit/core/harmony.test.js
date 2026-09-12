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
  setArpeggio,
  arpeggioDeal,
  soundingPitch,
  dealKey,
  ARPEGGIOS,
  stepLabel,
  chordAt,
  cyclePasses,
  chordName,
  resolveChordTone,
  chordToneName,
  memberFor,
  degreeAsTone,
  MAX_CHORDS,
} from '../../../src/core/harmony.js';
import { create, cycleAccent, setPitch, addMeasure } from '../../../src/core/pattern.js';
import { fillIndexFor, fillIndexOf, withArpeggio } from '../../../src/core/harmony.js';
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

    // Under an arpeggio what sounded was the deal, so that is what bakes.
    const arp = setArpeggio(p, 'up'); // Dm9: Root, 3rd, 5th, dealt over three Slots
    const heard = buildTimeline(arp, 0).map((e) => e.pitch.midiNote);
    const baked = clearHarmony(arp);
    expect(pitches(baked)).toEqual([
      { degree: '2', octaveOffset: 0 },
      { degree: '4', octaveOffset: 0 },
      { degree: '6', octaveOffset: 0 },
    ]);
    expect(buildTimeline(baked, 0).map((e) => e.pitch.midiNote)).toEqual(heard);
  });

  it('AC-2.6.1/7 — Choosing a progression re-reads each fixed degree that is a member of the first chord as that role, leaves every other degree fixed, and re-reads the armed pitch the same way, so a Pattern of tonics follows the progression at once: tonics become Roots', () => {
    // What a Pattern turned Melodic looks like: every sounding Slot on degree 1.
    let p = melodic();
    for (const b of [0, 1, 2, 3]) p = note(p, 0, b, 0, { degree: '1', octaveOffset: 0 });
    p = setProgression(p, 'I-IV-V');
    expect(pitches(p)).toEqual(Array(4).fill({ tone: 1, octaveOffset: 0 }));
    // And so it is heard: C, then F, then G.
    expect([0, 1, 2].map((pass) => buildTimeline(p, pass)[0].pitch.midiNote)).toEqual([60, 65, 67]);
  });

  it('AC-2.6.1/7 — Choosing a progression re-reads each fixed degree that is a member of the first chord as that role, leaves every other degree fixed, and re-reads the armed pitch the same way, so a Pattern of tonics follows the progression at once: members become roles at their own octave, non-members stay fixed', () => {
    let p = melodic();
    p = note(p, 0, 0, 0, { degree: '3', octaveOffset: 0 }); // the 3rd of C
    p = note(p, 0, 1, 0, { degree: '5', octaveOffset: -1 }); // the 5th of C, an octave down
    p = note(p, 0, 2, 0, { degree: '2', octaveOffset: 0 }); // not in a C triad
    p = note(p, 0, 3, 0, { degree: '7', octaveOffset: 0 }); // not in a C triad, is in Cmaj7
    const before = buildTimeline(p, 0).map((e) => e.pitch.midiNote);

    const triads = setProgression(p, 'I-IV-V');
    expect(pitches(triads)).toEqual([
      { tone: 3, octaveOffset: 0 },
      { tone: 5, octaveOffset: -1 },
      { degree: '2', octaveOffset: 0 },
      { degree: '7', octaveOffset: 0 },
    ]);
    // The first pass sounds exactly as it did.
    expect(buildTimeline(triads, 0).map((e) => e.pitch.midiNote)).toEqual(before);

    // Under a progression whose first chord has a 7th, the 7 is a member too.
    const sevenths = setProgression(p, 'I-vi-ii-V');
    expect(pitches(sevenths)[3]).toEqual({ tone: 7, octaveOffset: 0 });

    // Read against a chord on another root: degree 7 is the 3rd of G.
    expect(degreeAsTone({ degree: '7', octaveOffset: 0 }, { degree: '5', quality: 'maj' })).toEqual({ tone: 3, octaveOffset: 0 });
    // Degree 2 at octave 4 is the 5th of a G chord rooted an octave lower.
    expect(degreeAsTone({ degree: '2', octaveOffset: 0 }, { degree: '5', quality: 'maj' })).toEqual({ tone: 5, octaveOffset: -1 });
    expect(degreeAsTone({ degree: 'b2', octaveOffset: 0 }, { degree: '1', quality: 'maj' })).toBeNull();
  });

  it('AC-2.6.1/7 — Choosing a progression re-reads each fixed degree that is a member of the first chord as that role, leaves every other degree fixed, and re-reads the armed pitch the same way, so a Pattern of tonics follows the progression at once: None and a fresh choice round-trip', () => {
    let p = melodic();
    for (const b of [0, 1]) p = note(p, 0, b, 0, { degree: '1', octaveOffset: 0 });
    let chosen = setProgression(p, 'I-IV-V');
    chosen = note(chosen, 0, 2, 0, { tone: 5, octaveOffset: 0 }); // stamped after choosing
    const again = setProgression(clearHarmony(chosen), 'I-IV-V');
    expect(pitches(again)).toEqual(pitches(chosen));
    expect(again.harmony).toEqual(chosen.harmony);
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

  // --- AC-2.6.6 — An arpeggio deals chord tones across the sounding Slots ---

  /** The roles every sounding Slot sounds, in time order (chord-tone steps only). */
  const dealt = (p, pass = 0) => {
    const deal = arpeggioDeal(p, pass);
    const out = [];
    p.measures.forEach((m, mi) =>
      m.beats.forEach((b, bi) =>
        b.slots.forEach((s, si) => {
          if (s.on) out.push(soundingPitch(s, deal, mi, bi, si).step.tone);
        })
      )
    );
    return out;
  };
  /** The note numbers a pass sounds. */
  const notesOf = (p, pass = 0) => buildTimeline(p, pass).map((e) => e.pitch.midiNote);
  /** `count` Slots on in each of the Pattern's Measures, Beat by Beat. */
  const sounding = (p, count) => {
    p.measures.forEach((m, mi) => {
      for (let i = 0; i < count; i++) p = cycleAccent(p, mi, Math.floor(i / m.beats[0].slots.length), i % m.beats[0].slots.length);
    });
    return p;
  };

  it('AC-2.6.6/2 — The deal runs continuously through the pass over every sounding Slot, restarting at the top of each pass and whenever the chord changes: four Slots a Measure under Ascending triads sound Root 3rd 5th Root, then 3rd 5th Root 3rd; under every-Measure changes each new chord starts on its Root', () => {
    let p = setProgression(melodic({ measures: 2 }), 'I-IV-V');
    for (const m of [0, 1]) for (const b of [0, 1, 2, 3]) p = cycleAccent(p, m, b, 0);
    p = setArpeggio(p, 'up');
    expect(dealt(p)).toEqual([1, 3, 5, 1, 3, 5, 1, 3]);
    // Every pass deals the same line: pass 2 starts on the Root again, under the IV.
    expect(notesOf(p, 0)).toEqual([60, 64, 67, 60, 64, 67, 60, 64]);
    expect(notesOf(p, 1)).toEqual([65, 69, 72, 65, 69, 72, 65, 69]);

    // Every Measure: the chord changes at the bar line and the deal restarts on its Root.
    const perMeasure = setChange(p, 'measure');
    expect(dealt(perMeasure)).toEqual([1, 3, 5, 1, 1, 3, 5, 1]);
    expect(notesOf(perMeasure, 0)).toEqual([60, 64, 67, 60, 65, 69, 72, 65]);
    // A chord that repeats itself (I I under the blues) is no change, so no restart.
    const blues = setChange(setArpeggio(setProgression(p, 'twelve-bar-blues'), 'up'), 'measure');
    expect(dealt(blues)).toEqual([1, 3, 5, 7, 1, 3, 5, 7]);
    // Pass 1 of the blues opens on chord 3 (I7), then chord 4 (IV7): a restart at the bar line.
    expect(dealt(blues, 1)).toEqual([1, 3, 5, 7, 1, 3, 5, 7]);
    expect(notesOf(blues, 2)).toEqual([65, 69, 72, 75, 65, 69, 72, 75]); // IV7 IV7
  });

  it('AC-2.6.6/3 — Ascending deals the roles in order and repeats: over four roles, five sounding Slots take Root, 3rd, 5th, 7th, Root', () => {
    let p = setProgression(melodic(), 'ii-V-I');
    for (let s = 0; s < 4; s++) p = cycleAccent(p, 0, 0, s);
    p = cycleAccent(p, 0, 1, 0);
    expect(dealt(setArpeggio(p, 'up'))).toEqual([1, 3, 5, 7, 1]);
  });

  it('AC-2.6.6/4 — Alberti deals Root, 5th, 3rd, 5th; Descending deals from the highest role down; Up and down rises then falls without repeating the turn', () => {
    let p = setProgression(melodic(), 'ii-V-I');
    for (let b = 0; b < 4; b++) for (let s = 0; s < 2; s++) p = cycleAccent(p, 0, b, s);
    const under = (order) => dealt(setArpeggio(p, order));
    expect(under('alberti')).toEqual([1, 5, 3, 5, 1, 5, 3, 5]);
    expect(under('down')).toEqual([7, 5, 3, 1, 7, 5, 3, 1]);
    expect(under('up-down')).toEqual([1, 3, 5, 7, 5, 3, 1, 3]);
    expect(under('root')).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(under('root-fifth')).toEqual([1, 5, 1, 5, 1, 5, 1, 5]);
    // Up and down over a triad: c e g e c e g e.
    let t = setProgression(melodic(), 'I-IV-V');
    for (let b = 0; b < 4; b++) for (let s = 0; s < 2; s++) t = cycleAccent(t, 0, b, s);
    expect(buildTimeline(setArpeggio(t, 'up-down'), 0).map((e) => e.pitch.midiNote)).toEqual([60, 64, 67, 64, 60, 64, 67, 64]);
    expect(() => setArpeggio(p, 'sideways')).toThrow(/Unknown arpeggio/);
  });

  it("AC-2.6.6/5 — The roles dealt are the members of the progression's fullest chord, so a progression of triads deals Root, 3rd and 5th only", () => {
    let p = setProgression(melodic(), 'I-IV-V');
    for (let s = 0; s < 4; s++) p = cycleAccent(p, 0, 0, s);
    expect(dealt(setArpeggio(p, 'up'))).toEqual([1, 3, 5, 1]);
    // One seventh chord in the progression brings the 7th into the deal.
    expect(dealt(setArpeggio(setChordQuality(p, 2, '7'), 'up'))).toEqual([1, 3, 5, 7]);
  });

  it('AC-2.6.6/6 — The deal follows the rhythm: a Slot turned on or off re-deals the line, and no stored Pitch, Slot or Accent Level changes — each Slot keeps its own octave', () => {
    let p = setProgression(melodic(), 'I-IV-V');
    p = note(p, 0, 0, 0, { degree: '5', octaveOffset: 0 }); // a fixed note, kept underneath
    p = note(p, 0, 1, 0, { tone: 1, octaveOffset: 1 }); // a role an octave up
    p = cycleAccent(p, 0, 1, 0); // a second tap: an explicit override
    const stored = structuredClone(p.measures);

    const arp = setArpeggio(p, 'up');
    expect(dealt(arp)).toEqual([1, 3]);
    expect(arp.measures).toEqual(stored); // nothing stored changed
    // The dealt role sounds at the Slot's own octave: the 3rd of C an octave up is E5.
    expect(buildTimeline(arp, 0).map((e) => e.pitch.midiNote)).toEqual([60, 76]);

    // Turning another Slot on re-deals the line from the top.
    const more = cycleAccent(arp, 0, 0, 1);
    expect(dealt(more)).toEqual([1, 3, 5]);
    // Turning the first off re-deals it too.
    let fewer = arp;
    for (let i = 0; i < 3; i++) fewer = cycleAccent(fewer, 0, 0, 0);
    expect(fewer.measures[0].beats[0].slots[0].on).toBe(false);
    expect(dealt(fewer)).toEqual([1]);
    expect(dealKey(0, 1, 0)).toBe('0:1:0');
  });

  it('AC-2.6.6/9 — A step is a chord tone at an octave, a drone, or a scale step rooted on the chord: Up to the octave sounds Root 3rd 5th then the Root an octave up, Down from the octave the reverse, Up over and down rises through the octave Root and falls without repeating it, and Up and down repeating the turn sounds Root 3rd 5th 5th 3rd Root', () => {
    const p = sounding(setProgression(melodic(), 'I-IV-V'), 12); // twelve Slots: one bar of 16ths, three Beats
    const under = (id) => notesOf(setArpeggio(p, id));
    expect(under('up-octave')).toEqual([60, 64, 67, 72, 60, 64, 67, 72, 60, 64, 67, 72]);
    expect(under('down-octave')).toEqual([72, 67, 64, 60, 72, 67, 64, 60, 72, 67, 64, 60]);
    expect(under('up-over-down')).toEqual([60, 64, 67, 72, 67, 64, 60, 64, 67, 72, 67, 64]);
    expect(under('up-down-turn')).toEqual([60, 64, 67, 67, 64, 60, 60, 64, 67, 67, 64, 60]);
    // Over a seventh chord the octave shapes reach through the 7th.
    const sevenths = sounding(setProgression(melodic(), 'ii-V-I'), 5); // Dm7
    expect(notesOf(setArpeggio(sevenths, 'up-octave'))).toEqual([62, 65, 69, 72, 74]);
    // The step's own octave rides on the Slot's octave.
    let low = setArpeggio(setProgression(melodic(), 'I-IV-V'), 'up-octave');
    low = note(low, 0, 0, 0, { tone: 1, octaveOffset: -1 });
    for (let s = 1; s < 4; s++) low = note(low, 0, 0, s, { tone: 1, octaveOffset: -1 });
    expect(notesOf(low)).toEqual([48, 52, 55, 60]);
    // The band names them with an octave mark.
    expect(stepLabel({ tone: 1, octave: 1 })).toBe('R↑');
    expect(stepLabel({ tone: 3 })).toBe('3');
    expect(ARPEGGIOS.map((a) => a.id)).toEqual([
      'up', 'down', 'up-down', 'up-down-turn', 'alberti', 'root', 'root-fifth', 'up-octave', 'down-octave', 'up-over-down',
      'drone-above', 'drone-below', 'root-drone',
      'scale-up-major', 'scale-up-minor', 'scale-up-major-pentatonic', 'scale-up-minor-pentatonic', 'scale-up-pattern',
      'scale-up-down-major', 'scale-up-down-minor', 'scale-up-down-major-pentatonic', 'scale-up-down-minor-pentatonic', 'scale-up-down-pattern',
    ]);
  });

  it("AC-2.6.6/10 — Drone above alternates rising chord tones with the Key's tonic an octave up whatever the chord — C C′ E C′ G C′ then F C′ A C′ C C′ — Drone below uses the tonic an octave down, and Chord root drone uses the chord's own root an octave up", () => {
    // Three Measures, six sounding Slots each, one chord per Measure: C, F, G.
    let p = setChange(setProgression(melodic({ measures: 3 }), 'I-IV-V'), 'measure');
    p = sounding(p, 6);
    expect(notesOf(setArpeggio(p, 'drone-above'))).toEqual([
      60, 72, 64, 72, 67, 72,
      65, 72, 69, 72, 72, 72,
      67, 72, 71, 72, 74, 72,
    ]);
    expect(notesOf(setArpeggio(p, 'drone-below')).slice(0, 6)).toEqual([60, 48, 64, 48, 67, 48]);
    expect(notesOf(setArpeggio(p, 'root-drone')).slice(6, 12)).toEqual([65, 77, 69, 77, 72, 77]);
    // The drone follows the Key, not the chord: in G the tonic drone is G5.
    expect(notesOf({ ...setArpeggio(p, 'drone-above'), key: 'G' }).slice(0, 2)).toEqual([67, 79]);
    expect(stepLabel({ drone: 'tonic', octave: 1 })).toBe('T↑');
    expect(stepLabel({ drone: 'tonic', octave: -1 })).toBe('T↓');
    expect(stepLabel({ drone: 'root', octave: 1 })).toBe('R↑');
  });

  it("AC-2.6.6/11 — A scale walk steps up the chosen scale from the chord's root, one octave and round again: Scale up in major under F sounds F G A B♭ C D E then F; Scale up and down turns without repeating the turn; the Pattern's scale walks the scale the Pattern carries", () => {
    const p = sounding(setProgression(melodic(), 'I-IV-V'), 12);
    // Under the IV (pass 1): F major from F.
    expect(notesOf(setArpeggio(p, 'scale-up-major'), 1)).toEqual([65, 67, 69, 70, 72, 74, 76, 65, 67, 69, 70, 72]);
    // Natural minor and the pentatonics, from the chord root.
    expect(notesOf(setArpeggio(p, 'scale-up-minor')).slice(0, 7)).toEqual([60, 62, 63, 65, 67, 68, 70]);
    expect(notesOf(setArpeggio(p, 'scale-up-major-pentatonic')).slice(0, 6)).toEqual([60, 62, 64, 67, 69, 60]);
    expect(notesOf(setArpeggio(p, 'scale-up-minor-pentatonic')).slice(0, 6)).toEqual([60, 63, 65, 67, 70, 60]);
    // Up and down: C D E F G A B A G F E D, then C again.
    expect(notesOf(setArpeggio(p, 'scale-up-down-major'))).toEqual([60, 62, 64, 65, 67, 69, 71, 69, 67, 65, 64, 62]);
    // The Pattern's own scale: Dorian from C is C D E♭ F G A B♭.
    expect(notesOf(setArpeggio({ ...p, scale: 'dorian' }, 'scale-up-pattern')).slice(0, 7)).toEqual([60, 62, 63, 65, 67, 69, 70]);
    expect(stepLabel({ scale: 'major', step: 3 })).toBe('s3');
    // And every walk bakes back to fixed degrees that sound the same (AC-2.6.1/6).
    const walked = setArpeggio(p, 'scale-up-major');
    expect(notesOf(clearHarmony(walked))).toEqual(notesOf(walked));
  });

  it('AC-2.6.6/7 — Setting the arpeggio to None returns every Slot to the Pitch it holds; while an arpeggio is set the degree and role chips are absent, the note bands are inert, and the pitch strip says the notes follow the arpeggio: the Pitches come back', () => {
    let p = setProgression(melodic(), 'I-IV-V');
    p = note(p, 0, 0, 0, { degree: '5', octaveOffset: 0 });
    p = note(p, 0, 1, 0, { tone: 3, octaveOffset: 0 });
    const before = buildTimeline(p, 0).map((e) => e.pitch.midiNote);
    const arp = setArpeggio(p, 'up'); // deals Root, 3rd over the two Slots: C4, E4 — not G4, E4
    expect(arp.harmony.arpeggio).toBe('up');
    expect(buildTimeline(arp, 0).map((e) => e.pitch.midiNote)).not.toEqual(before);
    const back = setArpeggio(arp, 'none');
    expect('arpeggio' in back.harmony).toBe(false);
    expect(arpeggioDeal(back)).toBeNull();
    expect(buildTimeline(back, 0).map((e) => e.pitch.midiNote)).toEqual(before);
    expect(back.measures).toEqual(p.measures);
  });
});

describe('core/harmony — cycle mode: the fill in force (US-2.7)', () => {
  it('AC-2.7.2/1 — One repeat is one harmonic cycle — the passes the progression needs to return to its first chord at Measure 1 — so with the count at 4 under I–IV–V a fill is in force for twelve passes, and under the twelve-bar blues over eight Measures for twelve passes of eight Measures', () => {
    const p = setProgression(melodic(), 'I-IV-V');
    expect(cyclePasses(p)).toBe(3);
    const four = { start: 0, baseLoop: 0, repeats: 4 };
    for (let loop = 0; loop < 12; loop++) expect(fillIndexFor(p, four, loop), `pass ${loop}`).toBe(0);
    expect(fillIndexFor(p, four, 12)).toBe(1);
    expect(fillIndexFor(p, four, 23)).toBe(1);
    expect(fillIndexFor(p, four, 24)).toBe(2);

    let blues = melodic({ measures: 8 });
    blues = setProgression(blues, 'twelve-bar-blues');
    blues = setChange(blues, 'measure');
    expect(cyclePasses(blues)).toBe(3);
    expect(fillIndexFor(blues, four, 11)).toBe(0);
    expect(fillIndexFor(blues, four, 12)).toBe(1);

    // Counted from the base pass and the starting fill, with one repeat.
    const one = { start: 5, baseLoop: 7, repeats: 1 };
    expect(fillIndexFor(p, one, 7)).toBe(5);
    expect(fillIndexFor(p, one, 9)).toBe(5);
    expect(fillIndexFor(p, one, 10)).toBe(6);
    // Before the base pass nothing has advanced.
    expect(fillIndexFor(p, one, 2)).toBe(5);
  });

  it("AC-2.7.2/3 — The order is the catalogue's, through all three groups, wrapping from the last fill to the first; None is never in the cycle", () => {
    const p = setProgression(melodic(), 'I-IV-V');
    const n = ARPEGGIOS.length;
    expect(n).toBe(23);
    const one = { start: 0, baseLoop: 0, repeats: 1 };
    const sequence = Array.from({ length: n + 2 }, (_, k) => ARPEGGIOS[fillIndexFor(p, one, k * cyclePasses(p))].id);
    expect(sequence.slice(0, n)).toEqual(ARPEGGIOS.map((a) => a.id));
    expect(sequence[n]).toBe(ARPEGGIOS[0].id);
    expect(sequence[n + 1]).toBe(ARPEGGIOS[1].id);
    expect(sequence).not.toContain('none');
    expect([...new Set(ARPEGGIOS.map((a) => a.group))]).toEqual(['Chord tones', 'Drones', 'Scale walks']);

    // A Pattern's own fill is where the cycle starts; none means the first.
    expect(fillIndexOf(p)).toBe(0);
    const alberti = ARPEGGIOS.findIndex((a) => a.id === 'alberti');
    expect(fillIndexOf(setArpeggio(p, 'alberti'))).toBe(alberti);
    expect(ARPEGGIOS[fillIndexFor(setArpeggio(p, 'alberti'), { start: alberti, baseLoop: 0, repeats: 1 }, 3)].id).toBe(ARPEGGIOS[alberti + 1].id);

    // The overlay: the fill in force substituted, the Pattern itself untouched.
    const over = withArpeggio(p, 'alberti');
    expect(over.harmony.arpeggio).toBe('alberti');
    expect('arpeggio' in p.harmony).toBe(false);
    expect(over.measures).toBe(p.measures);
    const plain = melodic();
    expect(withArpeggio(plain, 'alberti')).toBe(plain);
    const already = setArpeggio(p, 'alberti');
    expect(withArpeggio(already, 'alberti')).toBe(already);
  });
});
