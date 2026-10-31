/*
 * US-2.15 — A fill for each chord of the progression. The pure half: the deal
 * reads each chord's own fill at the restart it already makes there, the
 * overlays and the roll reach every chord, and the data model admits the field
 * only under an arpeggio (research.md D-022).
 */
import { describe, it, expect } from 'vitest';
import { create, cycleAccent, addMeasure, validate } from '../../../src/core/pattern.js';
import {
  setProgression as chooseProgression,
  setVoicing,
  setChange,
  setArpeggio,
  setChordFill,
  clearChordFills,
  fillOf,
  clearHarmony,
  addChord,
  removeChord,
  setChordQuality,
  setChordBass,
  withArpeggio,
  arpeggioDeal,
  soundingPitch,
} from '../../../src/core/harmony.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import { rollMelody } from '../../../src/core/dice.js';

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

/** The roles each sounding Slot is dealt in `pass`, Measure by Measure. */
const dealt = (p, pass = 0) => {
  const deal = arpeggioDeal(p, pass);
  const out = [];
  p.measures.forEach((m, mi) =>
    m.beats.forEach((b, bi) =>
      b.slots.forEach((s, si) => {
        if (s.on) out.push(soundingPitch(s, deal, mi, bi, si).step.tone ?? soundingPitch(s, deal, mi, bi, si).step);
      })
    )
  );
  return out;
};
const notesOf = (p, pass = 0) => buildTimeline(p, pass).map((e) => e.pitch.midiNote);

/** I–V–vi–IV in C, Ascending, four Slots a Measure. */
const fourChords = () => setArpeggio(setProgression(melodic(), 'I-V-vi-IV'), 'up');

describe('US-2.15 — A fill for each chord of the progression', () => {
  it("AC-2.15.2/1 — Under I–IV–V–I changing every pass with the Arpeggio at Ascending and the fourth chord at Descending, four sounding Slots a Measure deal Root 3rd 5th Root in the first three passes and 5th 3rd Root 5th in the fourth; under every-Measure changes the same holds Measure by Measure, each chord's span dealt from its own fill's first step", () => {
    const p = setChordFill(fourChords(), 3, 'down');
    expect(p.harmony.arpeggio).toBe('up');
    expect(fillOf(p, 0)).toBe('up');
    expect(fillOf(p, 3)).toBe('down');
    for (const pass of [0, 1, 2]) expect(dealt(p, pass)).toEqual([1, 3, 5, 1]);
    expect(dealt(p, 3)).toEqual([5, 3, 1, 5]);
    // The notes follow: pass 4 is the IV (F) from its 5th down — C5 A4 F4 C5.
    expect(notesOf(p, 0)).toEqual([60, 64, 67, 60]);
    expect(notesOf(p, 3)).toEqual([72, 69, 65, 72]);

    // Every Measure, four Measures: the fourth Measure is the fourth chord's.
    let perMeasure = setChange(setArpeggio(setProgression(melodic({ measures: 4 }), 'I-V-vi-IV'), 'up'), 'measure');
    perMeasure = setChordFill(perMeasure, 3, 'down');
    expect(dealt(perMeasure)).toEqual([1, 3, 5, 1, 1, 3, 5, 1, 1, 3, 5, 1, 5, 3, 1, 5]);
    // Its own first step: a two-chord span opens Descending on the 5th even mid-pass.
    const alberti = setChordFill(perMeasure, 1, 'alberti');
    expect(dealt(alberti).slice(4, 8)).toEqual([1, 5, 3, 5]);
  });

  it("AC-2.15.2/3 — A chord whose own fill walks into the next chord aims its approach at the next chord's bass exactly as that fill does as the Arpeggio, whatever fill the next chord carries", () => {
    // Every Measure, two Measures over I–IV–V: Measure 1 under the I walks into the IV.
    let p = setChange(setArpeggio(setProgression(melodic({ measures: 2 }), 'I-IV-V'), 'up'), 'measure');
    const asArpeggio = notesOf(setArpeggio(p, 'walk-next-below'));
    p = setChordFill(p, 0, 'walk-next-below');
    const asChordFill = notesOf(p);
    // Measure 1 is note for note what the fill deals as the Arpeggio: C E G, then E — a semitone under F.
    expect(asChordFill.slice(0, 4)).toEqual(asArpeggio.slice(0, 4));
    expect(asChordFill[3]).toBe(64);
    // Measure 2, the IV, deals the Pattern's Ascending: F A C F — no approach of its own.
    expect(asChordFill.slice(4)).toEqual([65, 69, 72, 65]);
    // The next chord's own fill changes nothing about where the walk aims.
    expect(notesOf(setChordFill(p, 1, 'down')).slice(0, 4)).toEqual(asChordFill.slice(0, 4));
  });

  it("AC-2.15.2/4 — Choosing Progression None bakes the first pass as it sounded, a chord's own fill included, so the first pass sounds exactly as before", () => {
    // Every Measure, so the first pass hears the fourth chord's Descending in Measure 4.
    let p = setChange(setArpeggio(setProgression(melodic({ measures: 4 }), 'I-V-vi-IV'), 'up'), 'measure');
    p = setChordFill(p, 3, 'down');
    const before = notesOf(p);
    const baked = clearHarmony(p);
    expect(baked.harmony).toBeUndefined();
    expect(notesOf(baked)).toEqual(before);
    expect(before.slice(12)).toEqual([72, 69, 65, 72]);
  });

  it("AC-2.15.3/3 — Rolling the Fill control sets the Arpeggio to the rolled fill and clears every chord's own fill, as one edit that one Undo takes back whole; with Fill marked No dice each chord's own fill is as it was", () => {
    const p = setChordFill(setChordFill(fourChords(), 1, 'alberti'), 3, 'down');
    const everythingElse = ['key', 'scale', 'register', 'progression', 'change', 'voicing'];
    const { pattern: rolled, rolled: picks } = rollMelody(p, { noDice: everythingElse, random: () => 0.5 });
    expect(picks.fill).toBeDefined();
    expect(picks.fill).not.toBe('up');
    expect(rolled.harmony.arpeggio).toBe(picks.fill);
    expect(rolled.harmony.chords.every((c) => !('fill' in c))).toBe(true);
    // A roll is one new Pattern; the one before is untouched, which is what Undo returns to.
    expect(p.harmony.chords[3].fill).toBe('down');

    const kept = rollMelody(p, { noDice: [...everythingElse, 'fill'], random: () => 0.5 }).pattern;
    expect(kept.harmony.arpeggio).toBe('up');
    expect(kept.harmony.chords.map((c) => c.fill ?? null)).toEqual([null, 'alberti', null, 'down']);
  });

  it("AC-2.15.3/1 — While Cycle fills has a fill in force it deals every chord, each chord's own fill suspended; turning cycle mode off, or stopping where stopping returns the Pattern's own fill, returns the Arpeggio and each chord's own fill together, and the Pattern's JSON is unchanged throughout: the overlay", () => {
    const p = setChordFill(fourChords(), 3, 'down');
    const inForce = withArpeggio(p, 'alberti');
    expect(inForce.harmony.arpeggio).toBe('alberti');
    expect(inForce.harmony.chords.every((c) => !('fill' in c))).toBe(true);
    expect(dealt(inForce, 3)).toEqual([1, 5, 3, 5]);
    // The fill in force is the Pattern's own: the overlay still suspends the chord's fill.
    expect(dealt(withArpeggio(p, 'up'), 3)).toEqual([1, 3, 5, 1]);
    // The overlay wrote nothing.
    expect(p.harmony.chords[3].fill).toBe('down');
    expect(dealt(p, 3)).toEqual([5, 3, 1, 5]);
    // A Pattern with nothing to suspend and that fill already is returned as it is.
    const plain = fourChords();
    expect(withArpeggio(plain, 'up')).toBe(plain);
  });

  it("AC-2.15.1/2 — The picker is absent from every row while the Arpeggio is None, and setting the Arpeggio to None drops every chord's own fill, so setting it again afterwards finds every row at As above: the data", () => {
    const p = setChordFill(fourChords(), 3, 'down');
    const none = setArpeggio(p, 'none');
    expect(none.harmony.chords.every((c) => !('fill' in c))).toBe(true);
    expect(setArpeggio(none, 'up').harmony.chords.every((c) => !('fill' in c))).toBe(true);
    expect(() => setChordFill(none, 3, 'down')).toThrow(/needs an arpeggio/);
    // Choosing another arpeggio keeps them (AC-2.15.1/4).
    expect(setArpeggio(p, 'alberti').harmony.chords[3].fill).toBe('down');
  });

  it("AC-2.15.1/6 — Choosing a progression from the picker gives fresh chords with no fill of their own, a chord added with + Chord has none, editing a chord's root, quality or bass keeps its fill, and removing a chord takes its fill with it: the data", () => {
    const p = setChordFill(fourChords(), 3, 'down');
    expect(setProgression(p, 'I-IV-V').harmony.chords.every((c) => !('fill' in c))).toBe(true);
    expect(addChord(p).harmony.chords[4].fill).toBeUndefined();
    expect(setChordQuality(p, 3, 'maj7').harmony.chords[3].fill).toBe('down');
    expect(setChordBass(p, 3, 1).harmony.chords[3].fill).toBe('down');
    expect(setVoicing(p, 'closest').harmony.chords[3].fill).toBe('down');
    expect(removeChord(p, 3).harmony.chords.every((c) => !('fill' in c))).toBe(true);
    expect(setChordFill(p, 3, null).harmony.chords[3].fill).toBeUndefined();
    expect(clearChordFills(p).harmony.chords.every((c) => !('fill' in c))).toBe(true);
    expect(() => setChordFill(p, 3, 'sideways')).toThrow(/Unknown arpeggio/);
  });

  it("data-model §7 rule 14 — a chord's fill is a catalogue id and is present only under an arpeggio", () => {
    const p = setChordFill(fourChords(), 3, 'down');
    // The fixture's Slots carry no Pitch (rule 6); only the fill's own errors are read.
    const fillErrors = (q) => validate(q).errors.filter((e) => /fill/.test(e));
    expect(fillErrors(p)).toEqual([]);
    const bad = structuredClone(p);
    bad.harmony.chords[3].fill = 'sideways';
    expect(fillErrors(bad).join(' ')).toMatch(/fill "sideways" unsupported/);
    const orphan = structuredClone(p);
    delete orphan.harmony.arpeggio;
    expect(fillErrors(orphan).join(' ')).toMatch(/fill "down" without an arpeggio/);
  });
});
