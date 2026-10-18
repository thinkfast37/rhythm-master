import { describe, it, expect } from 'vitest';
import {
  KEY_COUNTS,
  DEFAULT_KEY_COUNT,
  MIDDLE_C,
  rangeFor,
  keysIn,
  whiteKeyCount,
  splitRows,
  isBlackKey,
  keyName,
  isValidKeyCount,
} from '../../../src/core/piano.js';

/**
 * The keyboard's arithmetic. The rendered keyboard, its rows, colours and
 * labels are proven in tests/e2e/composer-piano.spec.js.
 */
describe('core/piano', () => {
  it('AC-19.3.1/2 — Each count spans its range: 25 keys C3–C5 and 49 keys C2–C6, centred on middle C; 37 keys C3–C6, 61 keys C2–C7, 76 keys E1–G7 and 88 keys A0–C8, as such keyboards are built; every range contains middle C, which is marked C4: the ranges', () => {
    expect(KEY_COUNTS).toEqual([25, 37, 49, 61, 76, 88]);
    expect(DEFAULT_KEY_COUNT).toBe(49);
    const named = (count) => {
      const r = rangeFor(count);
      return [keyName(r.low), keyName(r.high), r.high - r.low + 1];
    };
    expect(named(25)).toEqual(['C3', 'C5', 25]);
    expect(named(37)).toEqual(['C3', 'C6', 37]);
    expect(named(49)).toEqual(['C2', 'C6', 49]);
    expect(named(61)).toEqual(['C2', 'C7', 61]);
    expect(named(76)).toEqual(['E1', 'G7', 76]);
    expect(named(88)).toEqual(['A0', 'C8', 88]);
    // Centred on middle C where the count allows.
    for (const count of [25, 49]) {
      const r = rangeFor(count);
      expect(MIDDLE_C - r.low).toBe(r.high - MIDDLE_C);
    }
    // Every range contains middle C.
    for (const count of KEY_COUNTS) {
      const r = rangeFor(count);
      expect(r.low).toBeLessThanOrEqual(MIDDLE_C);
      expect(r.high).toBeGreaterThanOrEqual(MIDDLE_C);
    }
    expect(isValidKeyCount(50)).toBe(false);
    expect(() => rangeFor(50)).toThrow();
  });

  it('AC-19.3.2/1 — When one row would make a white key narrower than 18 CSS pixels, the keyboard is laid out as two rows, split at the C nearest the middle of the range, the lower half in the upper row: the split rule', () => {
    const r88 = rangeFor(88);
    expect(whiteKeyCount(r88)).toBe(52);
    // 52 white keys at 18px need 936px: wider fits one row, narrower splits.
    expect(splitRows(r88, 1000)).toEqual([r88]);
    const rows = splitRows(r88, 800);
    expect(rows).toHaveLength(2);
    // A0–C8's middle is between E4 and F4; the nearest C is C4 (60).
    expect(rows[0]).toEqual({ low: 21, high: 59 });
    expect(rows[1]).toEqual({ low: 60, high: 108 });
    // 49 keys (29 whites) fit one row at 522px and split at 500px, at C4.
    const r49 = rangeFor(49);
    expect(splitRows(r49, 522)).toEqual([r49]);
    expect(splitRows(r49, 500)).toEqual([
      { low: 36, high: 59 },
      { low: 60, high: 84 },
    ]);
    // An unknown width never splits.
    expect(splitRows(r88, 0)).toEqual([r88]);
  });

  it('keys carry their colour and column', () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
    const keys = keysIn({ low: 60, high: 64 });
    expect(keys.map((k) => [k.midi, k.black, k.whiteIndex])).toEqual([
      [60, false, 0],
      [61, true, 0],
      [62, false, 1],
      [63, true, 1],
      [64, false, 2],
    ]);
    expect(keys[0].isC).toBe(true);
    expect(keyName(60)).toBe('C4');
    expect(keyName(21)).toBe('A0');
  });
});
