import { describe, it, expect } from 'vitest';
import { swungOffsets, isValidSwing, MIN_SWING, MAX_SWING } from '../../../src/core/swing.js';

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
});
