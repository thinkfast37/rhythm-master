import { describe, it, expect } from 'vitest';
import {
  TIME_SIGNATURES,
  beatCount,
  beatNoteValue,
  isSupported,
  beatDurationSeconds,
  measureDurationSeconds,
} from '../../../src/core/meter.js';

describe('core/meter', () => {
  it('AC-1.2.1 — exactly the supported Time Signatures are offered', () => {
    expect(TIME_SIGNATURES).toEqual([
      '1/4', '2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '6/8', '7/8', '9/8', '12/8',
    ]);
    for (const ts of TIME_SIGNATURES) expect(isSupported(ts)).toBe(true);
    for (const ts of ['3/8', '4/8', '5/8', '8/8', '11/4', '4/2', '', 'x']) {
      expect(isSupported(ts)).toBe(false);
    }
  });

  it('AC-1.2.2 — Beat count always equals the numerator, for every supported meter', () => {
    const expected = {
      '1/4': 1, '2/4': 2, '3/4': 3, '4/4': 4, '5/4': 5, '6/4': 6, '7/4': 7,
      '6/8': 6, '7/8': 7, '9/8': 9, '12/8': 12,
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
    for (const ts of ['6/8', '7/8', '9/8', '12/8']) {
      expect(beatNoteValue(ts), ts).toBe('eighth');
    }
  });

  it('AC-1.2.2 — tempo counts Beats, whatever the Beat is written as', () => {
    expect(beatDurationSeconds('4/4', 120)).toBeCloseTo(0.5, 10);
    expect(beatDurationSeconds('6/8', 120)).toBeCloseTo(0.5, 10);
    expect(measureDurationSeconds('4/4', 120)).toBeCloseTo(2.0, 10);
    expect(measureDurationSeconds('7/8', 120)).toBeCloseTo(3.5, 10);
  });

  it('rejects unsupported meters and non-positive tempo rather than guessing', () => {
    expect(() => beatCount('5/8')).toThrow(/Unsupported/);
    expect(() => beatNoteValue('4/2')).toThrow(/Unsupported/);
    expect(() => beatDurationSeconds('4/4', 0)).toThrow(/positive/);
  });
});
