import { describe, it, expect } from 'vitest';
import { balancedColumns, beatsMaxWidth } from '../../../src/ui/beat-layout.js';

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

/**
 * The arithmetic behind AC-15.2.7's cap, on its own — the same standing as the
 * column tests above: the criterion is proved on a screen in
 * `tests/e2e/grid.spec.js`, and these pin the edges.
 */
describe('ui/beat-layout — the most width a Measure’s Beat lines may take', () => {
  it('AC-15.2.7/4 — Where every Beat fits one line at the preferred size, the Beats occupy the start of the line and no cell is wider than the preferred size: the cap is the columns at the preferred Beat width, plus the gaps between them', () => {
    // A 4/4 Measure at Straight 16ths on desktop: four 191px Beats, 22px apart.
    expect(beatsMaxWidth(4, 191, 22)).toBe(830);
    // One Beat: its own preferred width, and no gap at all.
    expect(beatsMaxWidth(1, 191, 22)).toBe(191);
    // Two lines of two: the cap is the LINE, not the Measure.
    expect(beatsMaxWidth(2, 191, 12)).toBe(394);
  });

  it('AC-15.2.7/5 — Where the Beats do not fit at the preferred size, cells shrink and Beats wrap as before, and the grid still never scrolls sideways: an unknown preferred width means no cap, never a zero one', () => {
    // A zero measurement is a Measure with no Beats rendered yet; a cap of 0px
    // would collapse the grid, where `null` leaves the fill-the-line fallback.
    expect(beatsMaxWidth(4, 0, 22)).toBeNull();
    expect(beatsMaxWidth(0, 191, 22)).toBeNull();
    expect(beatsMaxWidth(4, NaN, 22)).toBeNull();
    // A missing gap is no gap, not NaN.
    expect(beatsMaxWidth(4, 191, NaN)).toBe(764);
  });
});
