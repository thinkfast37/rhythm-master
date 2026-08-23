import { describe, it, expect } from 'vitest';
import { SCALES, DEFAULT_SCALE, isValidScale, chromaticStrip } from '../../../src/core/scales.js';
import { degreeSemitones } from '../../../src/core/pitch.js';

/**
 * Catalogue mechanics. The picker's contents and the strip's marking are
 * UI criteria (AC-2.5.1, AC-2.5.2, AC-2.5.3) and are proven in
 * tests/e2e/melodic.spec.js; what belongs here is the arithmetic those
 * tests stand on.
 */
describe('core/scales', () => {
  it('every catalogue entry is well-formed and unique', () => {
    expect(SCALES).toHaveLength(16);
    expect(new Set(SCALES.map((s) => s.id)).size).toBe(16);
    for (const s of SCALES) {
      expect(s.label).toBeTruthy();
      expect(s.category).toBeTruthy();
      // Formulas start on the tonic and stay within one octave, no repeats.
      expect(s.degrees[0]).toBe('1');
      const semitones = s.degrees.map(degreeSemitones);
      expect(new Set(semitones).size).toBe(semitones.length);
      for (const st of semitones) {
        expect(st).toBeGreaterThanOrEqual(0);
        expect(st).toBeLessThan(12);
      }
    }
  });

  it('isValidScale accepts exactly the catalogue', () => {
    for (const s of SCALES) expect(isValidScale(s.id)).toBe(true);
    for (const bad of ['major', 'IONIAN', '', null, undefined, 'chromatic']) {
      expect(isValidScale(bad)).toBe(false);
    }
    expect(isValidScale(DEFAULT_SCALE)).toBe(true);
  });

  it('chromaticStrip covers all twelve semitones once, in order, for every scale', () => {
    for (const s of SCALES) {
      const strip = chromaticStrip(s.id);
      expect(strip).toHaveLength(12);
      strip.forEach(({ token }, semitone) => {
        expect(degreeSemitones(token), `${s.id} semitone ${semitone}`).toBe(semitone);
      });
      // Exactly the formula's degrees are marked in-scale, spelled its way.
      expect(strip.filter((c) => c.inScale).map((c) => c.token)).toEqual(s.degrees);
    }
    expect(() => chromaticStrip('nope')).toThrow(/Unknown scale/);
  });
});
