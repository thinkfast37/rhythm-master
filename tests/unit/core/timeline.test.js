import { describe, it, expect } from 'vitest';
import { buildTimeline, loopDurationSeconds, buildBeatGrid } from '../../../src/core/timeline.js';
import {
  create,
  addMeasure,
  setTimeSignature,
  setRecipe,
  cycleAccent,
  setGroupSwing,
  setSwingFeel,
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

  it('AC-4.4.8/3 — Triplet-feel groups keep their unshifted timing at the 16ths feel', () => {
    let p = { ...create(), tempo: 120 };
    p = setRecipe(p, 0, 0, 'straight-triplet-split');
    p = fillBeat(p, 0, 0);
    const plain = buildTimeline(p).map((e) => e.timeSeconds);

    p = setSwingFeel(p, 'sixteenth');
    p = setGroupSwing(p, 0, 0, 0, 80); // the straight pair
    const swung = buildTimeline(p).map((e) => e.timeSeconds);

    // The straight pair is 2 Slots, which the 16ths feel leaves unshifted too
    // (AC-4.4.8/2) — and the triplet half never moves under any feel.
    expect(swung[2]).toBeCloseTo(plain[2], 10);
    expect(swung[3]).toBeCloseTo(plain[3], 10);
    expect(swung[4]).toBeCloseTo(plain[4], 10);

    // A full 4-Slot straight Beat under the same feel, for contrast: the "e"
    // and the "a" swing while the triplet Beat above did not.
    let q = { ...create(), tempo: 120 };
    q = fillBeat(q, 0, 0);
    q = setSwingFeel(q, 'sixteenth');
    q = setGroupSwing(q, 0, 0, 0, 80);
    const sixteenths = buildTimeline(q).map((e) => e.timeSeconds);
    expect(sixteenths[1]).toBeCloseTo(0.125 + 0.8 * 0.125, 10);
    expect(sixteenths[3]).toBeCloseTo(0.375 + 0.8 * 0.125, 10);
    expect(sixteenths[0]).toBeCloseTo(0.0, 10);
    expect(sixteenths[2]).toBeCloseTo(0.25, 10);
  });

  it("AC-4.4.9/1 — Every sounding Slot in the second Beat of a pair onsets later by min(S / 100 × D, 0.95 × D) seconds, with the Beat's internal spacing unchanged", () => {
    let p = { ...create(), tempo: 120 }; // D = 0.5s
    p = fillBeat(p, 0, 0);
    p = fillBeat(p, 0, 1);
    p = setSwingFeel(p, 'quarter');
    p = setGroupSwing(p, 0, 0, 0, 50); // the pair's first Beat carries the amount

    const times = buildTimeline(p).map((e) => e.timeSeconds);
    const delay = 0.5 * 0.5; // min(50/100 × D, 0.95 × D)

    // Beat 1's four 16ths keep their nominal onsets — Quarters never swings within a group.
    [0, 0.125, 0.25, 0.375].forEach((t, i) => expect(times[i]).toBeCloseTo(t, 10));
    // Beat 2's four 16ths all shift by the same delay, spacing intact.
    [0.5, 0.625, 0.75, 0.875].forEach((t, i) => expect(times[4 + i]).toBeCloseTo(t + delay, 10));

    // The cap: at swing 100 the whole Beat delays by 0.95 × D, never a full Beat.
    let capped = setGroupSwing(p, 0, 0, 0, 100);
    capped = buildTimeline(capped).map((e) => e.timeSeconds);
    expect(capped[4]).toBeCloseTo(0.5 + 0.95 * 0.5, 10);
  });

  it('AC-4.4.9/2 — The first Beat of each pair, and the unpaired final Beat of an odd-numerator Measure, keep their nominal onsets', () => {
    let p = { ...create(), tempo: 120 };
    p = setTimeSignature(p, 0, '3/4'); // Beats pair (1,2); Beat 3 is unpaired
    p = fillBeat(p, 0, 0);
    p = fillBeat(p, 0, 1);
    p = fillBeat(p, 0, 2);
    // Events by identity, not list position — the delayed Beat 2 interleaves
    // with Beat 3 in the sorted timeline.
    const onsets = (pattern) =>
      new Map(buildTimeline(pattern).map((e) => [`${e.beatIndex}.${e.slotIndex}`, e.timeSeconds]));
    const plain = onsets(p);

    p = setSwingFeel(p, 'quarter');
    p = setGroupSwing(p, 0, 0, 0, 60);
    p = setGroupSwing(p, 0, 2, 0, 60); // an amount on the unpaired Beat changes nothing at this feel
    const swung = onsets(p);

    // Beat 1 (the pair's first) and Beat 3 (unpaired) at nominal onsets; Beat 2 delayed.
    for (const [key, time] of swung) {
      const [beat] = key.split('.').map(Number);
      const shift = beat === 1 ? 0.6 * 0.5 : 0;
      expect(time).toBeCloseTo(plain.get(key) + shift, 10);
    }
  });

  it("AC-4.4.9/3 — Pairing restarts at each Measure's first Beat", () => {
    let p = { ...create(), tempo: 120 };
    p = setTimeSignature(p, 0, '3/4');
    p = addMeasure(p); // inherits 3/4 — continuous pairing would pair M1's Beat 3 with M2's Beat 1
    p = fillBeat(p, 0, 0);
    p = fillBeat(p, 1, 0);
    p = fillBeat(p, 1, 1);
    const plain = buildTimeline(p).map((e) => e.timeSeconds);

    p = setSwingFeel(p, 'quarter');
    p = setGroupSwing(p, 0, 2, 0, 80); // M1's last Beat leads no pair once pairing restarts
    p = setGroupSwing(p, 1, 0, 0, 40); // M2's own first Beat leads its second

    const swung = buildTimeline(p).map((e) => e.timeSeconds);
    // M1 Beat 1 and M2 Beat 1 at nominal onsets; M2 Beat 2 delayed by M2 Beat 1's amount.
    for (let i = 0; i < 8; i++) expect(swung[i]).toBeCloseTo(plain[i], 10);
    for (let i = 8; i < 12; i++) expect(swung[i]).toBeCloseTo(plain[i] + 0.4 * 0.5, 10);
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
