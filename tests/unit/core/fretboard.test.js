import { describe, it, expect } from 'vitest';
import {
  STANDARD_TUNING_MIDI,
  STRING_COUNT,
  FRET_COUNT,
  BOARD_WIDTH,
  MARGIN_X,
  OPEN_COL_WIDTH,
  boardWidthFor,
  noteAt,
  isPlayable,
  isMarkerFret,
  rangeAfterCapo,
  clampRange,
  clampCapo,
  layoutFor,
  roleIdFor,
  DEGREE_ROLE_IDS,
} from '../../../src/core/fretboard.js';

/**
 * The board's arithmetic. What the board LOOKS like — strings, dots, numbers,
 * colours, the capo bar, the redraw — is UI and is proven in
 * tests/e2e/composer-guitar.spec.js; this is what those tests stand on.
 */
describe('core/fretboard', () => {
  it('AC-19.2.1/2 — The strings sound standard tuning — E4 B3 G3 D3 A2 E2 from the top — and no tuning control is shown: open strings as MIDI', () => {
    expect(STRING_COUNT).toBe(6);
    expect(STANDARD_TUNING_MIDI).toEqual([64, 59, 55, 50, 45, 40]);
    expect([0, 1, 2, 3, 4, 5].map((s) => noteAt(s, 0))).toEqual([64, 59, 55, 50, 45, 40]);
    // Fret 12 is the octave; fret 24 two.
    expect(noteAt(5, 12)).toBe(52);
    expect(noteAt(0, 24)).toBe(88);
    expect(() => noteAt(6, 0)).toThrow();
    expect(() => noteAt(0, FRET_COUNT + 1)).toThrow();
  });

  it("AC-19.2.2/3 — The capo takes 0 to 12: the frets below it are drawn muted and are inert, a capo bar is drawn at the end of the capo fret's cell, distinct from the nut, and the lower bound of the visible frets follows the capo up: playability and the range", () => {
    expect(clampCapo(-1)).toBe(0);
    expect(clampCapo(13)).toBe(12);
    expect(isPlayable(2, 3)).toBe(false);
    expect(isPlayable(3, 3)).toBe(true);
    expect(isPlayable(0, 0)).toBe(true);
    // The lower bound follows the capo up, the span held where the board allows.
    expect(rangeAfterCapo([0, 12], 3)).toEqual([3, 15]);
    expect(rangeAfterCapo([0, 24], 5)).toEqual([5, 24]);
    // A capo below the lower bound leaves the range alone.
    expect(rangeAfterCapo([7, 19], 3)).toEqual([7, 19]);
  });

  it('AC-19.2.2/4 — The visible frets are a lower and an upper bound, 0 to 24, and the board redraws to the range at its full width, so fewer frets are wider: the layout', () => {
    expect(clampRange([30, -2])).toEqual([0, 24]);
    expect(clampRange([12, 5])).toEqual([5, 12]);
    const whole = layoutFor([0, 24]);
    expect(whole.showOpenColumn).toBe(true);
    expect(whole.firstFret).toBe(1);
    expect(whole.lastFret).toBe(24);
    // Every fret of the whole board shares the width beyond the open column.
    expect(whole.colWidth).toBeCloseTo((BOARD_WIDTH - MARGIN_X * 2 - OPEN_COL_WIDTH) / 24, 6);
    expect(whole.noteX(0)).toBeCloseTo(MARGIN_X + OPEN_COL_WIDTH / 2, 6);
    expect(whole.wireX(24)).toBeCloseTo(BOARD_WIDTH - MARGIN_X, 6);

    const narrow = layoutFor([5, 12]);
    expect(narrow.showOpenColumn).toBe(false);
    expect(narrow.firstFret).toBe(5);
    expect(narrow.lastFret).toBe(12);
    // Eight frets across the full width: each is three times wider than on the whole board.
    expect(narrow.colWidth).toBeCloseTo((BOARD_WIDTH - MARGIN_X * 2) / 8, 6);
    expect(narrow.colWidth).toBeGreaterThan(whole.colWidth * 2.9);
    expect(narrow.isVisible(4)).toBe(false);
    expect(narrow.isVisible(5)).toBe(true);
    expect(narrow.isVisible(12)).toBe(true);
    expect(narrow.isVisible(13)).toBe(false);
    expect(narrow.wireX(12)).toBeCloseTo(BOARD_WIDTH - MARGIN_X, 6);
  });

  it('the board stretches halfway toward filling a wide panel at the height cap, and not at all on a narrow one', () => {
    expect(boardWidthFor(0)).toBe(BOARD_WIDTH);
    expect(boardWidthFor(NaN)).toBe(BOARD_WIDTH);
    // Narrow: the fixed board is already wider than the panel needs.
    expect(boardWidthFor(1000)).toBe(BOARD_WIDTH);
    // Wide: halfway between the fixed board and the width that fills at 420px,
    // which cuts the letterboxed side margin in half.
    const widthPx = 1900;
    const fills = (336 * widthPx) / 420;
    expect(boardWidthFor(widthPx)).toBe(Math.round((BOARD_WIDTH + fills) / 2));
    // The stretch goes to the fret columns, not the margins.
    const stretched = layoutFor([0, 24], boardWidthFor(widthPx));
    expect(stretched.colWidth).toBeGreaterThan(layoutFor([0, 24]).colWidth);
    expect(stretched.wireX(24)).toBeCloseTo(boardWidthFor(widthPx) - MARGIN_X, 6);
  });

  it("marker frets and colour roles are fret-navigator's", () => {
    expect([3, 5, 7, 9, 12, 15, 17, 19, 21, 24].every(isMarkerFret)).toBe(true);
    expect([1, 2, 4, 6, 8, 10, 11, 13, 14].some(isMarkerFret)).toBe(false);
    expect(DEGREE_ROLE_IDS).toHaveLength(12);
    expect(roleIdFor(0)).toBe('1');
    expect(roleIdFor(6)).toBe('4s5b');
    expect(roleIdFor(-1)).toBe('7');
  });
});
