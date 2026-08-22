import { describe, it, expect } from 'vitest';
import {
  swungOffsets,
  isValidSwing,
  isValidSwingFeel,
  MIN_SWING,
  MAX_SWING,
  SWING_FEELS,
  DEFAULT_SWING_FEEL,
} from '../../../src/core/swing.js';

describe('core/swing', () => {
  it('AC-4.4.1 — swing runs 0–100 in integer steps', () => {
    expect(MIN_SWING).toBe(0);
    expect(MAX_SWING).toBe(100);
    expect(isValidSwing(0)).toBe(true);
    expect(isValidSwing(100)).toBe(true);
    expect(isValidSwing(-1)).toBe(false);
    expect(isValidSwing(101)).toBe(false);
    expect(isValidSwing(50.5)).toBe(false);
    expect(() => swungOffsets(4, 101, 0.125)).toThrow(/0–100/);
  });

  it('AC-4.4.1 — swing 0 leaves every Slot at its nominal onset', () => {
    expect(swungOffsets(2, 0, 0.25)).toEqual([0, 0]);
    expect(swungOffsets(4, 0, 0.125)).toEqual([0, 0, 0, 0]);
  });

  it('AC-4.4.5 — only the Slot at position N/2 + 1 is delayed', () => {
    const four = swungOffsets(4, 67, 0.125);
    expect(four[0]).toBe(0);
    expect(four[1]).toBe(0);
    expect(four[2]).toBeGreaterThan(0);
    expect(four[3]).toBe(0);

    const two = swungOffsets(2, 50, 0.25);
    expect(two[0]).toBe(0);
    expect(two[1]).toBeGreaterThan(0);
  });

  it('AC-4.4.5 — worked example: 4/4 at 120 BPM, Straight 16ths, swing 67', () => {
    // quarter = 0.5s, so d = 0.125s per 16th. Slot 3 delays by 0.67 x 0.125 = 0.08375s.
    const offsets = swungOffsets(4, 67, 0.125);
    expect(offsets[2]).toBeCloseTo(0.08375, 10);
    // Nominal onset 0.250s becomes 0.33375s.
    expect(0.25 + offsets[2]).toBeCloseTo(0.33375, 10);
  });

  it('AC-4.4.5 — the delay is capped at 0.95 of a Slot so it never reaches the next one', () => {
    const d = 0.125;
    const offsets = swungOffsets(4, 100, d);
    expect(offsets[2]).toBeCloseTo(0.95 * d, 10);
    expect(offsets[2]).toBeLessThan(d);
  });

  it('AC-4.4.3 — an odd-length group has no midpoint and cannot swing', () => {
    // Triplet groups are never passed here, but a 1-Slot Undivided group is
    // straight-feel and must still come back unshifted.
    expect(swungOffsets(3, 100, 0.1)).toEqual([0, 0, 0]);
    expect(swungOffsets(1, 100, 0.25)).toEqual([0]);
  });

  it('AC-4.4.2 — offsets depend only on this group’s own arguments', () => {
    expect(swungOffsets(2, 40, 0.25)).toEqual(swungOffsets(2, 40, 0.25));
    expect(swungOffsets(2, 40, 0.25)).not.toEqual(swungOffsets(2, 60, 0.25));
  });

  it('AC-4.4.7/1 — The Swing feel control offers Quarters, 8ths, and 16ths, with 8ths selected by default: the three levels and the default, at the source', () => {
    expect(SWING_FEELS).toEqual(['quarter', 'eighth', 'sixteenth']);
    expect(DEFAULT_SWING_FEEL).toBe('eighth');
    expect(isValidSwingFeel('eighth')).toBe(true);
    expect(isValidSwingFeel('shuffle')).toBe(false);
    expect(() => swungOffsets(4, 50, 0.125, 'shuffle')).toThrow(/quarter, eighth, sixteenth/);
    // Omitting the feel is the default feel — Patterns from before the field existed keep their timing.
    expect(swungOffsets(4, 67, 0.125)).toEqual(swungOffsets(4, 67, 0.125, 'eighth'));
  });

  it('AC-4.4.8/1 — In a 4-Slot straight group, the Slots at positions 2 and 4 each onset later by min(S / 100 × d, 0.95 × d) seconds, while positions 1 and 3 keep their nominal onsets', () => {
    const d = 0.125;
    const offsets = swungOffsets(4, 67, d, 'sixteenth');
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeCloseTo(0.67 * d, 10);
    expect(offsets[2]).toBe(0);
    expect(offsets[3]).toBeCloseTo(0.67 * d, 10);
    // The same 0.95 cap as the default feel, on each pair.
    const capped = swungOffsets(4, 100, d, 'sixteenth');
    expect(capped[1]).toBeCloseTo(0.95 * d, 10);
    expect(capped[3]).toBeCloseTo(0.95 * d, 10);
    expect(capped[1]).toBeLessThan(d);
  });

  it('AC-4.4.8/2 — A 2-Slot straight group keeps every nominal onset at the 16ths feel', () => {
    // Its Slots land on the first half of each 16th pair — nothing to delay.
    expect(swungOffsets(2, 100, 0.25, 'sixteenth')).toEqual([0, 0]);
    expect(swungOffsets(1, 100, 0.5, 'sixteenth')).toEqual([0]);
  });
});
