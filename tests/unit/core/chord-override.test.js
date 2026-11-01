/*
 * US-10.4 — Vary a loop. A chord's changes in one Measure as Pattern content
 * (AC-10.4.7): the override travels with its Measure through every Measure
 * edit, counts as a difference between Patterns, follows the chord editor's
 * bounds, bakes with Progression None and reaches the MIDI file from the one
 * timeline (research.md D-025).
 */
import { describe, it, expect } from 'vitest';
import { create, cycleAccent, addMeasure, removeMeasure, duplicate, append, setPitch } from '../../../src/core/pattern.js';
import { condense } from '../../../src/core/condense.js';
import {
  setProgression as chooseProgression,
  setVoicing,
  setArpeggio,
  setChordOverride,
  chordInMeasure,
  chordName,
  removeChord,
  setChordQuality,
  setChordOmit,
  setChordBass,
  setChordFill,
  clearHarmony,
} from '../../../src/core/harmony.js';
import { isDuplicate, isSameFamily } from '../../../src/core/similarity.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import { buildMidi } from '../../../src/export/midi.js';
import { toSubmissionShape } from '../../../src/export/submit.js';
import { validate } from '../../../src/core/pattern.js';

const setProgression = (p, id) => setVoicing(chooseProgression(p, id), 'root');

/** Em–C–G–D in G changing every pass, Ascending, two Measures of downbeats; Measure 2 plays Em as Em7. */
function varied() {
  let p = { ...create(), soundMode: 'melodic', key: 'G', scale: 'ionian', tempo: 120 };
  p = addMeasure(p);
  for (let m = 0; m < 2; m++) for (let b = 0; b < 4; b++) p = cycleAccent(p, m, b, 0);
  p.measures.forEach((m, mi) => m.beats.forEach((_, b) => (p = setPitch(p, mi, b, 0, { degree: '1', octaveOffset: 0 }))));
  p = setArpeggio(setProgression(p, 'vi-IV-I-V'), 'up');
  return setChordOverride(p, 1, 0, { quality: 'm7' });
}
const notes = (p, pass = 0) => buildTimeline(p, pass).map((e) => e.pitch.midiNote);

describe('US-10.4 — Vary a loop: a chord override is Pattern content that travels with its Measure', () => {
  it('AC-10.4.7/1 — An override is saved with the Pattern and survives a reload, is carried by the Pattern’s JSON export and its submission, and a Pattern saved before overrides existed loads unchanged, with none: the Pattern’s own shape', () => {
    const p = varied();
    expect(validate(p).errors).toEqual([]);
    const reloaded = JSON.parse(JSON.stringify(p));
    expect(reloaded.harmony.overrides).toEqual({ 1: { 0: { quality: 'm7' } } });
    expect(chordName(chordInMeasure(reloaded, 1, 0), 'G')).toBe('Em7');
    expect(toSubmissionShape(p).harmony.overrides).toEqual({ 1: { 0: { quality: 'm7' } } });
    const before = JSON.parse(JSON.stringify({ ...p, harmony: { ...p.harmony, overrides: undefined } }));
    expect(before.harmony.overrides).toBeUndefined();
    expect(chordName(chordInMeasure(before, 1, 0), 'G')).toBe('Em');
    expect(validate(before).errors).toEqual([]);
  });

  it('AC-10.4.7/2 — Removing the last Measure drops that Measure’s overrides with it; Double Length copies each Measure’s overrides onto its mirrored Measure; Condense and Append keep every override with the Measure it was on', () => {
    const p = varied();
    const shorter = removeMeasure(p, 1);
    expect(shorter.harmony.overrides).toBeUndefined();
    // Removing an earlier Measure moves the later one's override down with it.
    const first = removeMeasure(p, 0);
    expect(first.harmony.overrides).toEqual({ 0: { 0: { quality: 'm7' } } });
    const doubled = duplicate(p);
    expect(doubled.harmony.overrides).toEqual({ 1: { 0: { quality: 'm7' } }, 3: { 0: { quality: 'm7' } } });
    // Condense joins Measures in pairs: the joined Measure takes both's overrides, the first's where they clash.
    const twoOverrides = setChordOverride(setChordOverride(p, 0, 1, { inversion: 1 }), 1, 1, { inversion: 2 });
    const halved = condense(twoOverrides);
    expect(halved.measures).toHaveLength(1);
    expect(halved.harmony.overrides).toEqual({ 0: { 0: { quality: 'm7' }, 1: { inversion: 1 } } });
    // Append keeps this Pattern's overrides on its own Measures; the other Pattern's key into its own chords and do not come.
    const other = setChordOverride(varied(), 0, 2, { inversion: 1 });
    const joined = append(p, other);
    expect(joined.harmony.overrides).toEqual({ 1: { 0: { quality: 'm7' } } });
    expect(joined.measures).toHaveLength(4);
  });

  it('AC-10.4.7/3 — Two Patterns whose Measures are the same but whose overrides differ are not duplicates; they are the same Family, as two Patterns with one rhythm and different notes are', () => {
    const a = varied();
    const b = setChordOverride(a, 1, 0, { quality: null });
    expect(a.measures).toEqual(b.measures);
    expect(isDuplicate(a, b)).toBe(false);
    expect(isSameFamily(a, b)).toBe(true);
    const c = setChordOverride(b, 1, 0, { inversion: 1 });
    expect(isDuplicate(a, c)).toBe(false);
    expect(isDuplicate(a, structuredClone(a))).toBe(true);
  });

  it('AC-10.4.7/4 — Setting the Arpeggio to None drops every fill override as it drops every chord’s own fill; removing a chord drops its overrides and the overrides of the chords after it move with their chords; editing a chord’s root, quality, bass, omitted members or fill in the chord editor leaves its overrides in place, each read through the same bounds as the chord’s own fields so none can name a member the chord lacks', () => {
    const p = setChordOverride(varied(), 1, 1, { fill: 'down' });
    const none = setArpeggio(p, null);
    expect(none.harmony.overrides).toEqual({ 1: { 0: { quality: 'm7' } } });
    expect(setArpeggio(setChordOverride(varied(), 1, 0, { quality: null, fill: 'down' }), null).harmony.overrides).toBeUndefined();
    // Removing chord 1 (C): its override goes, and Em's stays at index 0; removing Em re-keys C's to 0.
    expect(removeChord(p, 1).harmony.overrides).toEqual({ 1: { 0: { quality: 'm7' } } });
    expect(removeChord(p, 0).harmony.overrides).toEqual({ 1: { 0: { fill: 'down' } } });
    // The editor's edits leave the overrides in place.
    const edited = setChordFill(setChordOmit(setChordBass(setChordQuality(p, 0, 'maj'), 0, 1), 0, 5, true), 0, 'down');
    expect(edited.harmony.overrides).toEqual(p.harmony.overrides);
    // An override's bass beyond the members the chord now has is clamped; an omission the quality lacks is dropped.
    const inverted = setChordOverride(varied(), 1, 0, { quality: null, inversion: 3, omit: [7] });
    const as = chordInMeasure(inverted, 1, 0);
    expect(as.omit).toBeUndefined();
    expect(chordName(as, 'G')).toBe('Em/B');
    const power = setChordQuality(inverted, 0, '5');
    expect(chordName(chordInMeasure(power, 1, 0), 'G')).toBe('E5/B');
  });

  it('AC-10.4.7/5 — Playback, the grid’s note bands and chord names, the score and MIDI export all follow the override for its Measures, from the one timeline; the MIDI file and the JSON carry no technique name, stack or original length: the timeline and the files', () => {
    const p = varied();
    // Measure 2 sounds Em7's seventh (D) where Measure 1 repeats the root.
    expect(notes(p, 0).slice(0, 4)).toEqual([64, 67, 71, 64]);
    expect(notes(p, 0).slice(4)).toEqual([64, 67, 71, 74]);
    const bytes = buildMidi(p);
    const text = Buffer.from(bytes).toString('latin1');
    for (const word of ['technique', 'stack', 'phraseLength', 'change-quality']) expect(text).not.toContain(word);
    const json = JSON.stringify(p);
    for (const word of ['technique', 'stack', 'phraseLength', 'change-quality']) expect(json).not.toContain(word);
    expect(json).toContain('"overrides"');
  });

  it('AC-10.4.7/6 — Choosing Progression None bakes the first pass as it sounded, overrides included, and drops them with the progression', () => {
    const p = varied();
    const before = notes(p, 0);
    const baked = clearHarmony(p);
    expect(baked.harmony).toBeUndefined();
    expect(notes(baked, 0)).toEqual(before);
    // Em7 sits at E4 in G as in C (AC-2.6.4/7); its seventh, stacked above the root, is D5 — degree 5 of G at octave-offset 0.
    expect(baked.measures[1].beats[3].slots[0].pitch).toEqual({ degree: '5', octaveOffset: 0 });
  });
});
