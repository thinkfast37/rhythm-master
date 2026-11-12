/**
 * Layers under the composition (US-19.11): lengths, the common loop, the
 * merged timeline, and the Arrangement editors. research.md D-026.
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
  createArrangement,
  addLayer,
  removeLayer,
  setLayerMuted,
  validateArrangement,
  usesPattern,
  MAX_LAYERS,
  MAX_REPEATS,
} from '../../../src/core/arrangement.js';
import { create, cycleAccent, setPitch, addMeasure, setTimeSignatureAll, setSwingAmount } from '../../../src/core/pattern.js';
import { setProgression, setArpeggio, cyclePasses } from '../../../src/core/harmony.js';
import { buildTimeline, loopDurationSeconds } from '../../../src/core/timeline.js';

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

describe('core/arrangement — the combined loop (AC-19.11.3)', () => {
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

describe('core/arrangement — layers sound together (AC-19.11.2)', () => {
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

  it('AC-19.11.2/2 — The composition sounds with the instrument shown; a melodic layer sounds with the melodic voice Practice would use; a percussive layer, and an unpitched syllable in any layer, sounds percussively at its Accent Level', () => {
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
  });

  it("AC-19.11.2/3 — Every layer plays at the composition's tempo, tempo unit, swing and Key, whatever its own; a percussive layer takes no Key", () => {
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

describe('core/arrangement — the Arrangement (AC-19.11.1, AC-19.11.4)', () => {
  it('AC-19.11.1/3 — Remove takes a layer out; the same Pattern is never layered twice; at most 8 layers, Add layer saying so at the cap', () => {
    let a = createArrangement('Bed', 'p_1');
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
    expect(validateArrangement({ ...a, layers: [...a.layers, { patternId: 's_99', muted: false }] })).toContain(`At most ${MAX_LAYERS} layers`);
    // Mute is a flag on the layer, nothing more.
    expect(setLayerMuted(a, 1, true).layers[1]).toEqual({ patternId: 's_2', muted: true });
    expect(setLayerMuted(setLayerMuted(a, 1, true), 1, false).layers[1].muted).toBe(false);
    // Kinds, for the list.
    expect(layerKind(fourBeats())).toBe('rhythm');
    expect(layerKind(melody())).toBe('melody');
    expect(layerKind(chords())).toBe('chords');
  });

  it('AC-19.11.4/5 — Deleting a Pattern that an Arrangement uses, as its composition or as a layer, is refused with a message naming the Arrangement or Arrangements, until they are deleted: usesPattern', () => {
    const a = addLayer(addLayer(createArrangement('Bed', 'p_1'), 's_1'), 'p_2');
    expect(usesPattern(a, 'p_1')).toBe(true);
    expect(usesPattern(a, 's_1')).toBe(true);
    expect(usesPattern(a, 'p_2')).toBe(true);
    expect(usesPattern(a, 'p_3')).toBe(false);
    expect(validateArrangement(a)).toEqual([]);
    expect(validateArrangement({ ...a, name: '' })).toContain('An Arrangement needs a name');
    expect(validateArrangement({ ...a, layers: [] })).toContain('An Arrangement needs at least one layer');
    expect(validateArrangement({ ...a, layers: [{ patternId: 's_1' }, { patternId: 's_1' }] })).toContain('"s_1" is layered twice');
  });
});
