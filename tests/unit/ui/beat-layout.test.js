import { describe, it, expect } from 'vitest';
import { balancedColumns } from '../../../src/ui/beat-layout.js';

/**
 * The arithmetic behind AC-15.1.14/3, on its own.
 *
 * These are unit tests of the column count, and they do not prove the criterion:
 * AC-15.1.14 is UI-level, and what it asserts is what a Measure looks like on a
 * screen. `tests/e2e/grid.spec.js` carries the criterion tests; these pin the
 * edges that are awkward to reach through a browser — a Beat wider than the
 * viewport, a Measure of one Beat — and would otherwise go unexercised.
 */
describe('ui/beat-layout — how many Beats go on a line', () => {
  const GAP = 6;

  it('divides four Beats into two lines of two when only three fit', () => {
    // The reported case: 341px available, a 110px minimum, three fit.
    expect(balancedColumns(4, 341, 110, GAP)).toBe(2);
  });

  it('puts every Beat on one line when every Beat fits', () => {
    expect(balancedColumns(4, 1302, 110, GAP)).toBe(4);
    expect(balancedColumns(12, 1302, 56, GAP)).toBe(12);
  });

  it('never returns more columns than fit, so no line can overflow', () => {
    for (let beats = 2; beats <= 12; beats++) {
      for (const available of [200, 285, 341, 500, 802, 1302]) {
        for (const min of [40, 56, 110, 180]) {
          const cols = balancedColumns(beats, available, min, GAP);
          const perLine = Math.max(1, Math.floor((available + GAP) / (min + GAP)));
          expect(cols, `${beats} Beats, ${available}px, min ${min}px`).toBeLessThanOrEqual(
            Math.min(beats, Math.max(perLine, 1))
          );
        }
      }
    }
  });

  it('fills its lines evenly: the last line is never shorter than it has to be', () => {
    // Seven Beats where four fit is 4 and 3, not 4 and 3 by accident of overflow.
    expect(balancedColumns(7, 500, 110, GAP)).toBe(4);
    // Twelve where five fit is three lines, so four each rather than 5, 5 and 2.
    expect(balancedColumns(12, 341, 56, GAP)).toBe(4);
    // Five where three fit is two lines of at most three.
    expect(balancedColumns(5, 400, 110, GAP)).toBe(3);
    // And five where only two fit is three lines of two, not 2, 2, 1 by
    // remainder — the last line carries one either way, but the first two are
    // then no wider than they have to be.
    expect(balancedColumns(5, 341, 110, GAP)).toBe(2);
  });

  it('falls back to one column when a single Beat is wider than the space', () => {
    // A Beat cannot be split (AC-15.1.10), so one per line is the floor. The
    // Beat then overflows its own track rather than being squeezed below 24px
    // Slots — but nothing can be done about that in a Measure of one Beat.
    expect(balancedColumns(4, 100, 300, GAP)).toBe(1);
    expect(balancedColumns(1, 100, 300, GAP)).toBe(1);
  });

  it('treats an unmeasured Measure as fitting, rather than collapsing it to one column', () => {
    // A zero minimum means the probe found nothing — a Measure with no Beats
    // rendered yet. One line is the same fallback the CSS carries.
    expect(balancedColumns(4, 341, 0, GAP)).toBe(4);
  });
});
