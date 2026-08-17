import { describe, it, expect } from 'vitest';
import { buildTimeline, loopDurationSeconds, buildBeatGrid } from '../../../src/core/timeline.js';
import {
  create,
  addMeasure,
  setTimeSignature,
  setRecipe,
  cycleAccent,
  setGroupSwing,
} from '../../../src/core/pattern.js';
import { MEDIUM, STRONG, WEAK } from '../../../src/core/accents.js';

/** Turn on every Slot of one Beat. */
function fillBeat(pattern, m, b) {
  const n = pattern.measures[m].beats[b].slots.length;
  for (let s = 0; s < n; s++) pattern = cycleAccent(pattern, m, b, s);
  return pattern;
}

describe('core/timeline', () => {
  it('AC-4.1.4 — a mixed-meter Pattern plays each Measure by its own Time Signature', () => {
    let p = { ...create(), tempo: 120 };
    p = addMeasure(p);
    p = setTimeSignature(p, 1, '6/8');
    p = fillBeat(p, 0, 0);
    p = fillBeat(p, 1, 0);

    const beats = buildBeatGrid(p);
    // 4 quarter-note Beats then 6 eighth-note Beats — 10 Beats, not 4 + 2.
    expect(beats).toHaveLength(10);
    expect(beats.filter((b) => b.measureIndex === 0)).toHaveLength(4);
    expect(beats.filter((b) => b.measureIndex === 1)).toHaveLength(6);
    // Measure 2 starts after Measure 1's four 0.5s Beats.
    expect(beats[4].timeSeconds).toBeCloseTo(2.0, 10);
  });

  it('AC-4.1.3 — one loop pass is the sum of every Measure', () => {
    let p = { ...create(), tempo: 120 };
    p = addMeasure(p);
    p = setTimeSignature(p, 1, '6/8');
    // 4 Beats + 6 Beats at 0.5s each.
    expect(loopDurationSeconds(p)).toBeCloseTo(5.0, 10);
  });

  it('AC-4.1.1 — Slot onsets are evenly spaced within a Beat', () => {
    let p = { ...create(), tempo: 120 }; // quarter = 0.5s, 16th = 0.125s
    p = fillBeat(p, 0, 0);
    const times = buildTimeline(p).map((e) => e.timeSeconds);
    expect(times).toHaveLength(4);
    expect(times[0]).toBeCloseTo(0.0, 10);
    expect(times[1]).toBeCloseTo(0.125, 10);
    expect(times[2]).toBeCloseTo(0.25, 10);
    expect(times[3]).toBeCloseTo(0.375, 10);
  });

  it('AC-1.3.4 — a mixed Recipe divides the Beat into two half-Beats, not five equal fifths', () => {
    let p = { ...create(), tempo: 120 }; // quarter = 0.5s, half-beat = 0.25s
    p = setRecipe(p, 0, 0, 'straight-triplet-split');
    p = fillBeat(p, 0, 0);
    const times = buildTimeline(p).map((e) => e.timeSeconds);

    expect(times).toHaveLength(5);
    // Straight pair across the first half-beat: 0.125s apart.
    expect(times[0]).toBeCloseTo(0.0, 10);
    expect(times[1]).toBeCloseTo(0.125, 10);
    // Triplet across the second half-beat: 0.25/3 apart, starting at 0.25s.
    expect(times[2]).toBeCloseTo(0.25, 10);
    expect(times[3]).toBeCloseTo(0.25 + 0.25 / 3, 10);
    expect(times[4]).toBeCloseTo(0.25 + (2 * 0.25) / 3, 10);
    // The failure this guards: five evenly-spaced Slots at 0.1s apart.
    expect(times[1]).not.toBeCloseTo(0.1, 3);
  });

  it('AC-1.3.4 — the reversed split puts the triplet first', () => {
    let p = { ...create(), tempo: 120 };
    p = setRecipe(p, 0, 0, 'triplet-straight-split');
    p = fillBeat(p, 0, 0);
    const times = buildTimeline(p).map((e) => e.timeSeconds);
    expect(times[1]).toBeCloseTo(0.25 / 3, 10);
    expect(times[3]).toBeCloseTo(0.25, 10);
    expect(times[4]).toBeCloseTo(0.375, 10);
  });

  it('AC-3.1.3 — each event carries its effective accent', () => {
    let p = { ...create(), tempo: 120 };
    p = fillBeat(p, 0, 0);
    expect(buildTimeline(p).map((e) => e.accent)).toEqual([STRONG, WEAK, MEDIUM, WEAK]);
  });

  it('AC-4.1.1 — an off Slot produces no event at all', () => {
    let p = create();
    expect(buildTimeline(p)).toHaveLength(0);
    p = cycleAccent(p, 0, 0, 0);
    expect(buildTimeline(p)).toHaveLength(1);
  });

  it('AC-4.4.4 — swing shifts the straight group and leaves the triplet group alone', () => {
    let p = { ...create(), tempo: 120 };
    p = setRecipe(p, 0, 0, 'straight-triplet-split');
    p = fillBeat(p, 0, 0);
    const plain = buildTimeline(p).map((e) => e.timeSeconds);

    p = setGroupSwing(p, 0, 0, 0, 60); // straight group only
    const swung = buildTimeline(p).map((e) => e.timeSeconds);

    expect(swung[0]).toBeCloseTo(plain[0], 10); // unshifted
    expect(swung[1]).toBeGreaterThan(plain[1]); // the "&" is delayed
    expect(swung[2]).toBeCloseTo(plain[2], 10); // triplet untouched
    expect(swung[3]).toBeCloseTo(plain[3], 10);
    expect(swung[4]).toBeCloseTo(plain[4], 10);
  });

  it('AC-4.4.3 — swing set on a triplet group has no effect', () => {
    let p = { ...create(), tempo: 120 };
    p = setRecipe(p, 0, 0, 'triplet-8ths');
    p = fillBeat(p, 0, 0);
    const plain = buildTimeline(p).map((e) => e.timeSeconds);
    p = setGroupSwing(p, 0, 0, 0, 100);
    expect(buildTimeline(p).map((e) => e.timeSeconds)).toEqual(plain);
  });

  it('AC-2.2.1 — melodic events carry a resolved pitch, percussive events carry none', () => {
    let p = { ...create(), tempo: 120 };
    p = cycleAccent(p, 0, 0, 0);
    expect(buildTimeline(p)[0].pitch).toBeNull();

    const melodic = { ...p, soundMode: 'melodic', key: 'C' };
    melodic.measures[0].beats[0].slots[0].pitch = { degree: '1', octaveOffset: 0 };
    expect(buildTimeline(melodic)[0].pitch).toEqual({
      midiNote: 60,
      frequency: expect.closeTo(261.6255653, 6),
    });
  });

  it('AC-2.3.2 — the Pattern Key transposes every resolved event', () => {
    let p = { ...create(), tempo: 120, soundMode: 'melodic', key: 'D' };
    p = cycleAccent(p, 0, 0, 0);
    p.measures[0].beats[0].slots[0].pitch = { degree: '1', octaveOffset: 0 };
    expect(buildTimeline(p)[0].pitch.midiNote).toBe(62);
  });

  it('AC-4.1.1 — events come back in time order even when swing reorders them', () => {
    let p = { ...create(), tempo: 120 };
    p = fillBeat(p, 0, 0);
    p = setGroupSwing(p, 0, 0, 0, 100);
    const times = buildTimeline(p).map((e) => e.timeSeconds);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('AC-4.1.1 — tempo scales every onset proportionally', () => {
    let slow = { ...create(), tempo: 60 };
    slow = fillBeat(slow, 0, 0);
    const fast = { ...slow, tempo: 120 };
    const slowTimes = buildTimeline(slow).map((e) => e.timeSeconds);
    const fastTimes = buildTimeline(fast).map((e) => e.timeSeconds);
    slowTimes.forEach((t, i) => expect(fastTimes[i]).toBeCloseTo(t / 2, 10));
  });

  it('AC-16.1.1 — a Beat whose Slots and Recipe have drifted apart is caught, not played', () => {
    let p = create();
    p = fillBeat(p, 0, 0);
    p.measures[0].beats[0].slots.pop();
    expect(() => buildTimeline(p)).toThrow(/3 Slots for straight-16ths, expected 4/);
  });
});
