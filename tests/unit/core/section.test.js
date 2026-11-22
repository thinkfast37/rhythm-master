/**
 * Layers under the composition (US-19.11): lengths, the common loop, the
 * merged timeline, and the Section editors. research.md D-026.
 */
import { describe, it, expect } from 'vitest';
import {
  cycleEighths,
  fitLoop,
  fits,
  refusal,
  layerKind,
  underComposition,
  layered,
  layeredTimeline,
  layeredLoopDuration,
  layeredBeatGrid,
  layeredHasHarmony,
  timelineOf,
  loopDurationOf,
  beatGridOf,
  anyHarmony,
  createSection,
  addLayer,
  removeLayer,
  setLayerMuted,
  validateSection,
  usesPattern,
  joinRefusal,
  setLayerSound,
  soundOf,
  MAX_LAYERS,
  MAX_REPEATS,
} from '../../../src/core/section.js';
import { create, cycleAccent, setPitch, addMeasure, setTimeSignatureAll, setSwingAmount } from '../../../src/core/pattern.js';
import { setProgression, setArpeggio, cyclePasses } from '../../../src/core/harmony.js';
import { buildTimeline, loopDurationSeconds } from '../../../src/core/timeline.js';
import { recordNote } from '../../../src/core/composer.js';

/** A one-Measure 4/4 Pattern, one syllable on each Beat, at `tempo`. */
function fourBeats(name = 'Four', tempo = 120) {
  let p = { ...create(name), id: name.toLowerCase(), tempo };
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
  return p;
}
/** The same, `n` Measures long. */
function measures(n, name = `M${n}`) {
  let p = fourBeats(name);
  for (let i = 1; i < n; i++) {
    p = addMeasure(p);
    for (let b = 0; b < 4; b++) p = cycleAccent(p, i, b, 0);
  }
  return p;
}
/** A melodic one-Measure Pattern in `key`, every Beat on the tonic. */
function melody(name = 'Line', key = 'C') {
  let p = { ...fourBeats(name), soundMode: 'melodic', key, scale: 'ionian' };
  for (let b = 0; b < 4; b++) p = setPitch(p, 0, b, 0, { degree: '1', octaveOffset: 0 });
  return p;
}
/** A melodic one-Measure Pattern over I–IV–V with an arpeggio: three passes to a cycle. */
function chords(name = 'Chords') {
  let p = setProgression(melody(name), 'I-IV-V');
  p = setArpeggio(p, 'up');
  return p;
}
/** A one-Measure 7/8 Pattern, every Beat sounding. */
function sevenEight(name = 'Seven') {
  let p = setTimeSignatureAll({ ...create(name), id: name.toLowerCase(), tempo: 120 }, '7/8');
  for (let b = 0; b < 7; b++) p = cycleAccent(p, 0, b, 0);
  return p;
}

describe('core/section — the combined loop (AC-19.11.3)', () => {
  it('AC-19.11.3/1 — The combined loop is the shortest length in which the composition and every layer each play a whole number of times, a layer with a progression counting one harmonic cycle as its length, and a muted layer counting as an unmuted one', () => {
    // A bar of 4/4 is eight eighths; three Measures, twenty-four.
    expect(cycleEighths(fourBeats())).toBe(8);
    expect(cycleEighths(measures(3))).toBe(24);
    // A progression layer is as long as its harmonic cycle: I–IV–V over one bar is three bars.
    expect(cyclePasses(chords())).toBe(3);
    expect(cycleEighths(chords())).toBe(24);
    // The least common multiple, with each entry's repeats in it.
    expect(fitLoop([measures(2), chords(), fourBeats()])).toEqual({ eighths: 48, repeats: [3, 2, 6] });
    // Muting changes nothing about the loop.
    const loud = layered(measures(2), [{ pattern: chords() }, { pattern: fourBeats() }]);
    const quiet = layered(measures(2), [{ pattern: chords(), muted: true }, { pattern: fourBeats() }]);
    expect(quiet.loopEighths).toBe(loud.loopEighths);
    expect(quiet.layers.map((l) => l.repeats)).toEqual(loud.layers.map((l) => l.repeats));
    expect(layeredLoopDuration(quiet)).toBeCloseTo(layeredLoopDuration(loud), 9);
    // A repeat of a progression layer is a whole cycle: two repeats of I–IV–V are six passes,
    // walking the chords across them, and the loop is six bars long.
    const events = layeredTimeline(loud);
    expect(events.filter((e) => e.layer === 1)).toHaveLength(24);
    expect(events.filter((e) => e.layer === 1).map((e) => e.repeat)).toEqual([...Array(24).keys()].map((i) => Math.floor(i / 4)));
    expect(layeredLoopDuration(loud)).toBeCloseTo(6 * loopDurationSeconds(fourBeats()), 9);
    const perPass = [0, 1, 2, 3, 4, 5].flatMap((pass) => buildTimeline(loud.layers[1].pattern, pass).map((e) => e.pitch.midiNote));
    expect(events.filter((e) => e.layer === 1).map((e) => e.pitch.midiNote)).toEqual(perPass);
  });

  it('AC-19.11.3/2 — A one-Measure layer under a four-Measure composition plays four times in each loop, and a four-Measure layer under a one-Measure composition makes the composition play four times', () => {
    const underFour = layered(measures(4), [{ pattern: fourBeats() }]);
    expect(underFour.layers.map((l) => l.repeats)).toEqual([1, 4]);
    expect(layeredTimeline(underFour).filter((e) => e.layer === 1)).toHaveLength(16);
    expect(layeredLoopDuration(underFour)).toBeCloseTo(loopDurationSeconds(measures(4)), 9);

    const underOne = layered(fourBeats(), [{ pattern: measures(4) }]);
    expect(underOne.layers.map((l) => l.repeats)).toEqual([4, 1]);
    expect(layeredTimeline(underOne).filter((e) => e.layer === 0)).toHaveLength(16);
    expect(layeredLoopDuration(underOne)).toBeCloseTo(4 * loopDurationSeconds(fourBeats()), 9);
  });

  it('AC-19.11.3/3 — Layers in different meters fit by time: a Measure of 7/8 against a Measure of 4/4 gives a loop of seven Measures of 4/4 in which the 7/8 plays eight times', () => {
    expect(cycleEighths(sevenEight())).toBe(7);
    const set = layered(fourBeats(), [{ pattern: sevenEight() }]);
    expect(set.layers.map((l) => l.repeats)).toEqual([7, 8]);
    expect(set.loopEighths).toBe(56);
    // By time: eight bars of 7/8 at the composition's tempo last exactly seven bars of 4/4.
    const seven = set.layers[1].pattern;
    expect(8 * loopDurationSeconds(seven)).toBeCloseTo(7 * loopDurationSeconds(fourBeats()), 9);
    const events = layeredTimeline(set);
    expect(events.filter((e) => e.layer === 1)).toHaveLength(56);
    expect(events.filter((e) => e.layer === 0)).toHaveLength(28);
    // The last 7/8 event lands inside the loop, the loop ending exactly where the next would start.
    const last = events.at(-1);
    expect(last.timeSeconds).toBeLessThan(layeredLoopDuration(set));
  });

  it('AC-19.11.3/4 — A layer that would need more than 32 repeats in the loop, or would make the composition or another layer need more, is refused with a message, and nothing is added', () => {
    // A bar of 7/8 under 32 bars of 4/4: the 7/8 would play 256 times in one loop.
    const seven = sevenEight('Odd bar');
    const thirtyTwo = measures(32, 'Long even');
    expect(fits([thirtyTwo], seven)).toBe(false);
    const why = refusal([thirtyTwo], seven);
    expect(why).toMatch(/Odd bar/);
    expect(why).toMatch(new RegExp(`more than ${MAX_REPEATS} repeats`));
    // The candidate itself fits the composition, but pushes an existing layer past the cap.
    expect(fits([fourBeats()], measures(31))).toBe(true);
    expect(fits([fourBeats(), measures(31)], measures(2))).toBe(false);
    expect(refusal([fourBeats(), measures(31)], measures(2))).not.toBeNull();
    // Within the cap: nothing to say.
    expect(refusal([fourBeats()], sevenEight())).toBeNull();
    expect(refusal([measures(4)], chords())).toBeNull();
  });
});

describe('core/section — layers sound together (AC-19.11.2)', () => {
  it('AC-19.11.2/1 — Play sounds the composition and every unmuted layer at once, from one timeline: two notes falling on the same instant both sound', () => {
    const set = layered(fourBeats('Line'), [{ pattern: fourBeats('Bed') }, { pattern: melody('Tune'), muted: true }]);
    const events = layeredTimeline(set);
    // One list: the composition's four and the unmuted layer's four; the muted layer's none.
    expect(events).toHaveLength(8);
    expect(new Set(events.map((e) => e.layer))).toEqual(new Set([0, 1]));
    // Each Beat has two events at exactly one instant, the composition's first.
    for (let b = 0; b < 4; b++) {
      const at = events.filter((e) => e.beatIndex === b);
      expect(at).toHaveLength(2);
      expect(at[0].timeSeconds).toBe(at[1].timeSeconds);
      expect(at[0].composition).toBe(true);
      expect(at[1].composition).toBe(false);
    }
    // Sorted by time throughout.
    for (let i = 1; i < events.length; i++) expect(events[i].timeSeconds).toBeGreaterThanOrEqual(events[i - 1].timeSeconds);
    // The dispatchers route a layered set here and a Pattern to the one timeline.
    expect(timelineOf(set)).toEqual(events);
    expect(timelineOf(fourBeats())).toEqual(buildTimeline(fourBeats(), 0));
    expect(loopDurationOf(set)).toBe(layeredLoopDuration(set));
    expect(loopDurationOf(fourBeats())).toBe(loopDurationSeconds(fourBeats()));
    expect(beatGridOf(set)).toEqual(layeredBeatGrid(set));
    expect(beatGridOf(set)).toHaveLength(4);
    expect(anyHarmony(set)).toBe(false);
    expect(anyHarmony(layered(fourBeats(), [{ pattern: chords() }]))).toBe(true);
    expect(layeredHasHarmony(layered(fourBeats(), [{ pattern: chords() }]))).toBe(true);
  });

  it("AC-19.11.2/2 — Each part's pitched notes sound with that part's own instrument, on screen or not; a percussive layer, and an unpitched syllable in any part, sounds percussively at its Accent Level", () => {
    // What the timeline carries for the voice decision: which events are the
    // composition's, and which have a pitch at all. A percussive layer's events
    // have no pitch, so the transport plays them percussively as it always has.
    const set = layered(melody('Line'), [{ pattern: fourBeats('Bed') }, { pattern: melody('Tune') }]);
    const events = layeredTimeline(set);
    const own = events.filter((e) => e.composition);
    const bed = events.filter((e) => e.layer === 1);
    const tune = events.filter((e) => e.layer === 2);
    expect(own.every((e) => e.pitch !== null)).toBe(true);
    expect(bed.every((e) => e.pitch === null && e.composition === false && e.accent >= 1)).toBe(true);
    expect(tune.every((e) => e.pitch !== null && e.composition === false)).toBe(true);
    // An unpitched syllable in a melodic layer is percussive too: the one timeline says pitch null.
    const partial = { ...melody('Half'), measures: melody('Half').measures.map((m) => ({ ...m, beats: m.beats.map((b, i) => (i < 2 ? b : { ...b, slots: b.slots.map((s) => ({ ...s, pitch: null })) })) })) };
    const half = layeredTimeline(layered(fourBeats(), [{ pattern: partial }])).filter((e) => e.layer === 1);
    expect(half.map((e) => e.pitch === null)).toEqual([false, false, true, true]);
    // Each layer's instrument and volume ride on its events, so the transport can sound a part its own way (US-19.12).
    const sounded = layeredTimeline(layered(melody('Line'), [{ pattern: melody('Tune'), instrument: 'bass', volume: 55 }, { pattern: fourBeats('Bed'), volume: 30 }]));
    expect(sounded.filter((e) => e.layer === 1).every((e) => e.instrument === 'bass' && e.volume === 55)).toBe(true);
    expect(sounded.filter((e) => e.layer === 2).every((e) => e.instrument === undefined && e.volume === 30)).toBe(true);
    expect(sounded.filter((e) => e.composition).every((e) => e.instrument === undefined)).toBe(true);
  });

  it("AC-19.11.2/3 — Every layer plays at the composition's tempo, tempo unit, swing and Key, whatever its own; a percussive layer takes no Key, and a layer on Drums keeps the notes it was written with", () => {
    const composition = { ...setSwingAmount(melody('Line', 'G'), 40), tempo: 90, tempoUnit: 'eighth', swingFeel: 'sixteenth' };
    const bed = { ...fourBeats('Bed', 200), swingAmount: 0 };
    const tune = { ...melody('Tune', 'C'), tempo: 160 };
    const set = layered(composition, [{ pattern: bed }, { pattern: tune }]);
    for (const layer of set.layers) {
      expect(layer.pattern.tempo).toBe(90);
      expect(layer.pattern.tempoUnit).toBe('eighth');
      expect(layer.pattern.swingAmount).toBe(40);
      expect(layer.pattern.swingFeel).toBe('sixteenth');
    }
    // A composition stating no unit counts its first Measure's Beat, and its layers state that.
    const unstated = layered(fourBeats(), [{ pattern: sevenEight() }]);
    expect(unstated.tempoUnit).toBe('quarter');
    expect(unstated.layers[1].pattern.tempoUnit).toBe('quarter');
    expect(set.layers[2].pattern.key).toBe('G');
    expect('key' in set.layers[1].pattern).toBe(false);
    // The Key moved the layer's notes: the tonic now sounds G, not C.
    const tuneEvents = layeredTimeline(set).filter((e) => e.layer === 2);
    expect(tuneEvents.every((e) => e.pitch.midiNote % 12 === 7)).toBe(true);
    // And every layer's loop is one time: the three share the loop's clock.
    expect(loopDurationSeconds(set.layers[1].pattern)).toBeCloseTo(loopDurationSeconds(set.layers[0].pattern), 9);
    // The library's copies are untouched.
    expect(bed.tempo).toBe(200);
    expect(tune.key).toBe('C');
    expect(tune.tempo).toBe(160);
    expect(underComposition(tune, composition)).not.toBe(tune);
  });
});

describe('core/section — the Section (AC-19.11.1, AC-19.11.4)', () => {
  it('AC-19.11.1/3 — Remove takes a layer out; the same Pattern is never layered twice; at most 8 layers, Add layer saying so at the cap', () => {
    let a = createSection('Bed', 'p_1');
    a = addLayer(a, 's_1');
    a = addLayer(a, 's_2');
    expect(a.layers).toEqual([
      { patternId: 's_1', muted: false },
      { patternId: 's_2', muted: false },
    ]);
    expect(() => addLayer(a, 's_1')).toThrow(/already a layer/);
    expect(() => addLayer(a, 'p_1')).toThrow(/itself/);
    expect(removeLayer(a, 0).layers).toEqual([{ patternId: 's_2', muted: false }]);
    expect(() => removeLayer(a, 5)).toThrow(/No layer/);
    for (let i = 3; i <= MAX_LAYERS; i++) a = addLayer(a, `s_${i}`);
    expect(a.layers).toHaveLength(MAX_LAYERS);
    expect(() => addLayer(a, 's_99')).toThrow(new RegExp(`At most ${MAX_LAYERS}`));
    expect(validateSection({ ...a, layers: [...a.layers, { patternId: 's_99', muted: false }] })).toContain(`At most ${MAX_LAYERS} layers`);
    // Mute is a flag on the layer, nothing more.
    expect(setLayerMuted(a, 1, true).layers[1]).toEqual({ patternId: 's_2', muted: true });
    expect(setLayerMuted(setLayerMuted(a, 1, true), 1, false).layers[1].muted).toBe(false);
    // Kinds, for the list.
    expect(layerKind(fourBeats())).toBe('rhythm');
    expect(layerKind(melody())).toBe('melody');
    expect(layerKind(chords())).toBe('chords');
  });

  it(`AC-19.11.4/1 — Save section asks a name, pre-filled with the composition's name and "section", unique among Sections, and stores the composition's id, its layers in order, which are muted, each part's instrument and volume (AC-19.12.4), and which part is on screen; a Section may hold the composition alone; and while a part is not yet in the library the name is held and the Section is stored as soon as every part is saved: a Section of the composition alone is sound`, () => {
    // Revised 2026-11-21, T562: this read "A Section needs at least one layer".
    const alone = createSection('Verse', 'p_1');
    expect(alone.layers).toEqual([]);
    expect(validateSection(alone)).toEqual([]);
    expect(validateSection({ ...alone, layers: undefined })).toContain('A Section needs its layers as a list');
  });

  const T5 = 'AC-19.11.10/5 — Add to section is unavailable, saying why, while the part on screen is not saved to the library, while the Section in hand has layers or a name, and while no Section is saved; a Section that already holds the Pattern, is at 8 layers or whose loop the part does not fit is refused with a message';
  it(`${T5}: a Section that already holds the Pattern`, () => {
    const verse = addLayer(createSection('Verse', 'p_1'), 's_1');
    const riff = { name: 'Riff' };
    expect(joinRefusal(verse, [], riff, 'p_1')).toBe('"Riff" is already a part of "Verse".');
    expect(joinRefusal(verse, [], riff, 's_1')).toBe('"Riff" is already a part of "Verse".');
  });

  it(`${T5}: a Section at 8 layers`, () => {
    let full = createSection('Verse', 'p_1');
    for (let i = 0; i < MAX_LAYERS; i++) full = addLayer(full, `s_${i}`);
    expect(joinRefusal(full, [], { name: 'Riff' }, 'p_9')).toBe('"Verse" already has 8 layers, the most a Section holds.');
  });

  it(`${T5}: a Section whose loop the part does not fit`, () => {
    // A bar of 7/8 against 32 bars of 4/4 would play 256 times in one loop.
    const long = createSection('Verse', 'long even');
    const why = joinRefusal(long, [measures(32, 'Long even')], sevenEight('Odd bar'), 'odd bar');
    expect(why).toMatch(/Odd bar/);
    expect(why).toMatch(new RegExp(`more than ${MAX_REPEATS} repeats`));
    // A part that fits, in a Section with room, that does not hold it: nothing to say.
    expect(joinRefusal(createSection('Verse', 'four'), [fourBeats()], sevenEight(), 'seven')).toBeNull();
  });

  it('AC-19.11.4/5 — Deleting a Pattern that a Section uses, as its composition or as a layer, is refused with a message naming the Section or Sections, until they are deleted: usesPattern', () => {
    const a = addLayer(addLayer(createSection('Bed', 'p_1'), 's_1'), 'p_2');
    expect(usesPattern(a, 'p_1')).toBe(true);
    expect(usesPattern(a, 's_1')).toBe(true);
    expect(usesPattern(a, 'p_2')).toBe(true);
    expect(usesPattern(a, 'p_3')).toBe(false);
    expect(validateSection(a)).toEqual([]);
    expect(validateSection({ ...a, name: '' })).toContain('A Section needs a name');
    expect(validateSection({ ...a, layers: [{ patternId: 's_1' }, { patternId: 's_1' }] })).toContain('"s_1" is layered twice');
  });

  it("AC-19.13.3/2 — A Drums part that is not on screen sounds the MIDI notes it was written with, whatever the Section's Key", () => {
    // A kick-and-snare line written in C, under a composition in G.
    let kit = { ...fourBeats('Kit'), soundMode: 'melodic', key: 'C', scale: 'ionian' };
    [36, 38, 36, 38].forEach((midi, b) => (kit = recordNote(kit, { measureIndex: 0, beatIndex: b, slotIndex: 0 }, midi)));
    const composition = melody('Line', 'G');
    const set = layered(composition, [{ pattern: kit, instrument: 'drums' }, { pattern: kit, instrument: 'bass' }, { pattern: kit }]);
    const notesOf = (layer) => layeredTimeline(set).filter((e) => e.layer === layer).map((e) => e.pitch.midiNote);
    // On Drums: the notes as written, and the part's own Key kept.
    expect(notesOf(1)).toEqual([36, 38, 36, 38]);
    expect(set.layers[1].pattern.key).toBe('C');
    // Any other instrument, or none: moved with the section's Key, a fifth up.
    expect(notesOf(2)).toEqual([43, 45, 43, 45]);
    expect(notesOf(3)).toEqual([43, 45, 43, 45]);
    expect(set.layers[2].pattern.key).toBe('G');
    // Tempo and swing are still the section's (AC-19.11.2/3).
    expect(set.layers[1].pattern.tempo).toBe(composition.tempo);
    expect(underComposition(kit, composition, { keepKey: true }).key).toBe('C');
    expect(underComposition(kit, composition).key).toBe('G');
  });

  it("AC-19.12.4/1 — Save section stores each part's instrument and volume, and opening the Section restores them: the Section's shape carries them, and refuses what is neither an instrument nor a volume", () => {
    const a = createSection('Band', 'p_1', [{ patternId: 's_1', volume: 60 }, { patternId: 'p_2', muted: true, instrument: 'bass', volume: 90 }], 1, { instrument: 'sax', volume: 70 });
    expect(a).toEqual({
      id: null,
      name: 'Band',
      compositionId: 'p_1',
      instrument: 'sax',
      volume: 70,
      layers: [
        { patternId: 's_1', muted: false, volume: 60 },
        { patternId: 'p_2', muted: true, instrument: 'bass', volume: 90 },
      ],
      active: 1,
    });
    expect(validateSection(a)).toEqual([]);
    // A layer added on an instrument, and a layer's sound set afterwards.
    const b = addLayer(a, 'p_3', { instrument: 'trumpet' });
    expect(b.layers[2]).toEqual({ patternId: 'p_3', muted: false, instrument: 'trumpet' });
    expect(setLayerSound(b, 2, { volume: 40 }).layers[2]).toEqual({ patternId: 'p_3', muted: false, instrument: 'trumpet', volume: 40 });
    expect(setLayerSound(b, 0, { instrument: 'electric' }).layers[0]).toEqual({ patternId: 's_1', muted: false, volume: 60, instrument: 'electric' });
    expect(() => setLayerSound(b, 9, { volume: 40 })).toThrow();
    // Mute and removal leave a part's sound alone.
    expect(setLayerMuted(a, 1, false).layers[1]).toEqual({ patternId: 'p_2', muted: false, instrument: 'bass', volume: 90 });
    expect(validateSection({ ...a, instrument: 'harpsichord' })).toContain('"harpsichord" is not an instrument');
    expect(validateSection({ ...a, layers: [{ patternId: 's_1', muted: false, volume: 0 }] })).toContain('A volume must be a whole number from 1 to 100');
    expect(validateSection({ ...a, volume: 101 })).toContain('A volume must be a whole number from 1 to 100');
    expect(validateSection({ ...a, volume: 50.5 })).toContain('A volume must be a whole number from 1 to 100');
  });

  it("AC-19.12.4/3 — A Section saved before parts had instruments or volumes opens with the part on screen on the Composer's remembered instrument, every other part on the voice Practice remembers for its Pattern or on Piano when there is none, and every volume at 80: such a Section is still sound, and reads back with nothing added", () => {
    const old = { id: 'arr_1', name: 'Bed', compositionId: 'p_1', layers: [{ patternId: 's_1', muted: false }], active: 0 };
    expect(validateSection(old)).toEqual([]);
    expect(soundOf(old)).toEqual({});
    expect(soundOf(old.layers[0])).toEqual({});
    // Made again from its own parts, it is the same record: nothing is stamped on it.
    expect({ ...createSection(old.name, old.compositionId, old.layers, old.active, old), id: old.id }).toEqual(old);
  });

  it('AC-19.11.6/6 — Leaving the Composer, or opening another rhythm, with any part unsaved asks first, naming every unsaved part; a saved Section remembers which part was on screen and opens on it: the part on screen is stored as a position among the parts', () => {
    const a = addLayer(addLayer(createSection('Bed', 'p_1'), 's_1'), 'p_2');
    expect(a.active).toBe(0);
    expect(createSection('Bed', 'p_1', [{ patternId: 's_1' }], 1).active).toBe(1);
    expect(validateSection({ ...a, active: 2 })).toEqual([]);
    expect(validateSection({ ...a, active: 3 })).toContain('The part on screen must be one of the parts');
    expect(validateSection({ ...a, active: -1 })).toContain('The part on screen must be one of the parts');
    expect(validateSection({ ...a, active: 1.5 })).toContain('The part on screen must be one of the parts');
    // A Section saved before the field existed opens on its composition.
    const old = { ...a };
    delete old.active;
    expect(validateSection(old)).toEqual([]);
  });
});

describe('core/section — one pass of an Arrangement, as the transport is handed it (US-20.2)', () => {
  it('AC-20.2.1/3 — A progression starts from its first chord each time an entry begins, whatever was sounding before it: the pass is fixed by the entry, not by the transport', async () => {
    const { arranged, isArranged, timelineOf: tl, loopDurationOf: dur, beatGridOf: grid, anyHarmony: harm } = await import('../../../src/core/section.js');
    const { setProgression, setChange, setArpeggio } = await import('../../../src/core/harmony.js');
    const { create, cycleAccent, setPitch } = await import('../../../src/core/pattern.js');
    let p = { ...create('Changes'), id: 'p_1', soundMode: 'melodic', key: 'C', tempo: 120 };
    p = setChange(setProgression(p, 'I-IV-V'), 'pass');
    p = setArpeggio(setPitch(cycleAccent(p, 0, 0, 0), 0, 0, 0, { tone: 1, octaveOffset: 0 }), 'up');
    const notes = (events) => events.filter((e) => e.pitch).map((e) => e.pitch.midiNote);
    // Alone, the chord walks with the pass.
    expect(new Set([0, 1, 2].map((k) => notes(tl(p, k)).join())).size).toBeGreaterThan(1);

    // Arranged on its first pass, it sounds the first chord whatever pass the transport is on.
    const first = arranged(p, 0, { voice: 'guitar', kit: false });
    expect(isArranged(first)).toBe(true);
    for (const transportPass of [0, 1, 7, 40]) expect(notes(tl(first, transportPass))).toEqual(notes(tl(p, 0)));
    for (const k of [1, 2]) for (const transportPass of [0, 5]) expect(notes(tl(arranged(p, k), transportPass))).toEqual(notes(tl(p, k)));
    // Every event says it is arranged and carries how it sounds.
    expect(tl(first, 3).every((e) => e.arranged === true && e.voice === 'guitar' && e.kit === false)).toBe(true);
    // The length and the Beats are the Pattern's own, and it is never taken for the pass before it.
    expect(dur(first)).toBe(dur(p));
    expect(grid(first)).toEqual(grid(p));
    expect(harm(first)).toBe(true);
    expect(harm(arranged({ ...create('Plain'), tempo: 100 }, 0))).toBe(true);
    // What the transport reads off a Pattern is there.
    expect(first).toMatchObject({ name: 'Changes', tempo: 120, soundMode: 'melodic' });
    expect(first.measures).toBe(p.measures);
  });
});

describe('core/section — the cursor on every Slot of the part on screen (AC-19.6.4)', () => {
  it('AC-19.6.4/2 — Under layers the cursor walks every Slot of the part on screen through each of its repeats, and a silent Slot of any other part moves nothing: the combined timeline holds the silent Slots of the composition alone, once per repeat', () => {
    const composition = fourBeats('Line');
    const set = layered(composition, [{ pattern: measures(2, 'Under') }]);
    const slots = composition.measures[0].beats.reduce((n, b) => n + b.slots.length, 0);
    const every = layeredTimeline(set, 0, { everySlot: true });
    const silent = every.filter((e) => e.silent);
    expect(silent.length).toBe((slots - 4) * 2);
    expect(silent.every((e) => e.composition === true && e.layer === 0)).toBe(true);
    // The composition's entries, sounding and silent, walk every Slot in order on each repeat.
    const own = every.filter((e) => e.composition);
    const once = loopDurationSeconds(composition);
    for (const k of [0, 1]) {
      const pass = own.filter((e) => e.repeat === k);
      expect(pass).toHaveLength(slots);
      expect(pass.map((e) => e.timeSeconds)).toEqual(buildTimeline(composition, 0, { everySlot: true }).map((e) => e.timeSeconds + k * once));
    }
    // Unasked, and through an Arrangement, nothing silent is there.
    expect(layeredTimeline(set, 0).some((e) => e.silent)).toBe(false);
    expect(timelineOf(set, 0, { everySlot: true })).toEqual(every);
    expect(timelineOf({ arranged: true, inner: set, pass: 0, mark: {} }, 0, { everySlot: true }).some((e) => e.silent)).toBe(false);
  });
});
