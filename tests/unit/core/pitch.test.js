import { describe, it, expect } from 'vitest';
import { KEYS, resolve, degreeSemitones, isSupportedKey, midiToFrequency } from '../../../src/core/pitch.js';

describe('core/pitch', () => {
  it('AC-2.3.1 — exactly twelve Keys are supported', () => {
    expect(KEYS).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']);
    for (const k of KEYS) expect(isSupportedKey(k)).toBe(true);
    for (const k of ['H', 'C#m', '', 'db']) expect(isSupportedKey(k)).toBe(false);
    expect(() => resolve({ degree: '1', octaveOffset: 0 }, 'H')).toThrow(/Unsupported Key/);
  });

  it('AC-2.2.1 — major-scale degrees resolve to the right semitones', () => {
    const expected = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
    for (const [degree, semis] of Object.entries(expected)) {
      expect(degreeSemitones(degree), `degree ${degree}`).toBe(semis);
    }
  });

  it('AC-2.2.2 — accidentals alter a degree by one semitone', () => {
    expect(degreeSemitones('b3')).toBe(3);
    expect(degreeSemitones('#4')).toBe(6);
    expect(degreeSemitones('b7')).toBe(10);
  });

  it('AC-2.2.3 — degrees beyond 7 continue upward by octave', () => {
    expect(degreeSemitones('8')).toBe(12);
    expect(degreeSemitones('9')).toBe(14);
    expect(degreeSemitones('13')).toBe(21);
    expect(degreeSemitones('b10')).toBe(15);
  });

  it('AC-2.2.4 — degree 1 in C at offset 0 is middle C', () => {
    expect(resolve({ degree: '1', octaveOffset: 0 }, 'C').midiNote).toBe(60);
  });

  it('AC-2.2.5 — octaveOffset shifts by exactly twelve semitones per step', () => {
    const base = resolve({ degree: '1', octaveOffset: 0 }, 'C').midiNote;
    expect(resolve({ degree: '1', octaveOffset: -1 }, 'C').midiNote).toBe(base - 12);
    expect(resolve({ degree: '1', octaveOffset: 1 }, 'C').midiNote).toBe(base + 12);
    expect(resolve({ degree: '1', octaveOffset: -2 }, 'C').midiNote).toBe(base - 24);
  });

  it('AC-2.3.2 — changing Key transposes every degree by the same interval', () => {
    for (const [i, key] of KEYS.entries()) {
      for (const degree of ['1', '3', '5', 'b7']) {
        const inC = resolve({ degree, octaveOffset: 0 }, 'C').midiNote;
        expect(resolve({ degree, octaveOffset: 0 }, key).midiNote, `${degree} in ${key}`).toBe(inC + i);
      }
    }
  });

  it('AC-2.2.6 — every degree resolves across the full octave range in all twelve Keys', () => {
    const degrees = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
    for (const key of KEYS) {
      for (const octaveOffset of [-3, -2, -1, 0, 1, 2, 3]) {
        for (const degree of degrees) {
          const { midiNote, frequency } = resolve({ degree, octaveOffset }, key);
          expect(Number.isInteger(midiNote), `${degree} ${key} ${octaveOffset}`).toBe(true);
          expect(frequency).toBeGreaterThan(0);
        }
      }
    }
  });

  it('AC-2.2.7 — frequency is equal temperament with A4 = 440 Hz', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 10);
    expect(midiToFrequency(60)).toBeCloseTo(261.6255653, 6);
    expect(midiToFrequency(81)).toBeCloseTo(880, 10);
  });

  it('AC-2.2.8 — an invalid degree or octave is rejected rather than guessed', () => {
    expect(() => degreeSemitones('0')).toThrow(/Invalid scale degree/);
    expect(() => degreeSemitones('x')).toThrow(/Invalid scale degree/);
    expect(() => degreeSemitones('')).toThrow(/Invalid scale degree/);
    expect(() => resolve({ degree: '1', octaveOffset: 0.5 }, 'C')).toThrow(/integer/);
  });

  it('AC-2.2.9 — resolution is pure: the same input always gives the same pitch', () => {
    const a = resolve({ degree: 'b3', octaveOffset: -1 }, 'Eb');
    const b = resolve({ degree: 'b3', octaveOffset: -1 }, 'Eb');
    expect(a).toEqual(b);
  });
});
