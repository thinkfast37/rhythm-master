import { describe, it, expect } from 'vitest';
import {
  TIME_SIGNATURES,
  beatCount,
  beatNoteValue,
  isSupported,
  beatDurationSeconds,
  measureDurationSeconds,
  tempoUnitOf,
} from '../../../src/core/meter.js';

describe('core/meter', () => {
  it('AC-1.2.1 — exactly the supported Time Signatures are offered', () => {
    expect(TIME_SIGNATURES).toEqual([
      '1/4', '2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '2/8', '3/8', '5/8', '6/8', '7/8', '9/8', '12/8',
    ]);
    for (const ts of TIME_SIGNATURES) expect(isSupported(ts)).toBe(true);
    for (const ts of ['1/8', '4/8', '8/8', '11/4', '4/2', '', 'x']) {
      expect(isSupported(ts)).toBe(false);
    }
  });

  it('AC-1.2.2 — Beat count always equals the numerator, for every supported meter', () => {
    const expected = {
      '1/4': 1, '2/4': 2, '3/4': 3, '4/4': 4, '5/4': 5, '6/4': 6, '7/4': 7,
      '2/8': 2, '3/8': 3, '5/8': 5, '6/8': 6, '7/8': 7, '9/8': 9, '12/8': 12,
    };
    for (const [ts, beats] of Object.entries(expected)) {
      expect(beatCount(ts), ts).toBe(beats);
    }
  });

  it('AC-1.2.3 — 7/8 is seven eighth-note Beats, never grouped 2+2+3', () => {
    expect(beatCount('7/8')).toBe(7);
    expect(beatNoteValue('7/8')).toBe('eighth');
    // The failure mode this guards: a "3 Beats grouped 2+2+3" reading.
    expect(beatCount('7/8')).not.toBe(3);
  });

  it('AC-1.2.4 — 6/8 is six eighth-note Beats, never two dotted quarters', () => {
    expect(beatCount('6/8')).toBe(6);
    expect(beatNoteValue('6/8')).toBe('eighth');
    expect(beatCount('6/8')).not.toBe(2);
  });

  it('AC-1.2.1 — Beat note value derives from the denominator alone', () => {
    for (const ts of ['1/4', '2/4', '3/4', '4/4', '5/4', '6/4', '7/4']) {
      expect(beatNoteValue(ts), ts).toBe('quarter');
    }
    for (const ts of ['2/8', '3/8', '5/8', '6/8', '7/8', '9/8', '12/8']) {
      expect(beatNoteValue(ts), ts).toBe('eighth');
    }
  });

  it('AC-4.2.7/2 — At ♩ = 120 a quarter-note Beat lasts 0.5 s and an eighth-note Beat 0.25 s; at ♪ = 120 an eighth-note Beat lasts 0.5 s and a quarter-note Beat 1 s', () => {
    expect(beatDurationSeconds('4/4', 120, 'quarter')).toBeCloseTo(0.5, 10);
    expect(beatDurationSeconds('6/8', 120, 'quarter')).toBeCloseTo(0.25, 10);
    expect(beatDurationSeconds('6/8', 120, 'eighth')).toBeCloseTo(0.5, 10);
    expect(beatDurationSeconds('4/4', 120, 'eighth')).toBeCloseTo(1, 10);
    expect(measureDurationSeconds('7/8', 120, 'eighth')).toBeCloseTo(3.5, 10);
    expect(measureDurationSeconds('7/8', 120, 'quarter')).toBeCloseTo(1.75, 10);
  });

  it('AC-4.2.7/3 — A 3/8 Measure and a 5/8 Measure together last exactly as long as one 4/4 Measure at the same tempo, in playback and in the exported MIDI file: the arithmetic', () => {
    for (const unit of ['quarter', 'eighth']) {
      const split = measureDurationSeconds('3/8', 90, unit) + measureDurationSeconds('5/8', 90, unit);
      expect(split, unit).toBeCloseTo(measureDurationSeconds('4/4', 90, unit), 10);
    }
  });

  it("AC-4.2.7/5 — A Pattern that does not state a unit counts the note value of its first Measure's Beat, so one saved before the unit existed plays as it did whenever its Measures share a note value; opening it in the editor states that unit, so changing the first Measure's meter later does not retime it: the default", () => {
    const of = (...tss) => ({ measures: tss.map((timeSignature) => ({ timeSignature })) });
    expect(tempoUnitOf(of('4/4'))).toBe('quarter');
    expect(tempoUnitOf(of('6/8', '7/8'))).toBe('eighth');
    expect(tempoUnitOf({ ...of('6/8'), tempoUnit: 'quarter' })).toBe('quarter');
    // A saved 6/8 Pattern at 80: each eighth-note Beat lasts 60/80 s, as it did
    // when tempo counted Beats.
    expect(beatDurationSeconds('6/8', 80, tempoUnitOf(of('6/8')))).toBeCloseTo(60 / 80, 10);
  });

  it('rejects unsupported meters and non-positive tempo rather than guessing', () => {
    expect(() => beatCount('4/8')).toThrow(/Unsupported/);
    expect(() => beatNoteValue('4/2')).toThrow(/Unsupported/);
    expect(() => beatDurationSeconds('4/4', 0)).toThrow(/positive/);
  });
});
