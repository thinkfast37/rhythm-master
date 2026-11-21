import { describe, it, expect } from 'vitest';
import { buildBeatGrid } from '../../../src/core/timeline.js';
import { clickIntervalSeconds, CLICK_VALUES, isValidClickValue, TIME_SIGNATURES } from '../../../src/core/meter.js';
import { create, setTimeSignature, addMeasure } from '../../../src/core/pattern.js';

/** A Pattern of the given meters at the given tempo, its unit from the first Measure. */
function meters(tss, tempo = 120) {
  let p = { ...create(), tempo };
  p = setTimeSignature(p, 0, tss[0]);
  for (let i = 1; i < tss.length; i++) {
    p = addMeasure(p);
    p = setTimeSignature(p, i, tss[i]);
  }
  return p;
}

const times = (grid) => grid.map((c) => Math.round(c.timeSeconds * 1e6) / 1e6);

describe('core/meter + core/timeline — what the click counts (AC-4.3.7)', () => {
  it('the click values are the Beat, five note values and the Measure', () => {
    expect(CLICK_VALUES).toEqual(['beat', 'sixteenth', 'eighth', 'quarter', 'half', 'whole', 'measure']);
    expect(isValidClickValue('half')).toBe(true);
    expect(isValidClickValue('dotted-quarter')).toBe(false);
  });

  it('AC-4.3.7/2 — Beat clicks every Beat of each Measure at its own length: four clicks in a 4/4 Measure, six in a 6/8 one: the grid', () => {
    const p = meters(['4/4', '6/8']);
    expect(times(buildBeatGrid(p, 'beat'))).toEqual([0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.25]);
    // No value given is the Beat, as every caller before AC-4.3.7 asked.
    expect(buildBeatGrid(p)).toEqual(buildBeatGrid(p, 'beat'));
  });

  it('AC-4.3.7/3 — A note value clicks at its written length against the tempo: at ♩ = 120 in 4/4, 16ths every 0.125 s, 8ths every 0.25 s, quarters every 0.5 s, halves every 1 s and wholes every 2 s: the interval', () => {
    for (const [value, seconds] of [
      ['sixteenth', 0.125],
      ['eighth', 0.25],
      ['quarter', 0.5],
      ['half', 1],
      ['whole', 2],
    ]) {
      expect(clickIntervalSeconds('4/4', 120, 'quarter', value), value).toBeCloseTo(seconds, 12);
      expect(buildBeatGrid(meters(['4/4']), value), value).toHaveLength(2 / seconds);
    }
    // Against an eighth-note tempo a quarter is two of its Beats.
    expect(clickIntervalSeconds('6/8', 120, 'eighth', 'quarter')).toBeCloseTo(1, 12);
  });

  it('AC-4.3.7/4 — Measure clicks once in every Measure, on its downbeat: the grid', () => {
    const grid = buildBeatGrid(meters(['4/4', '3/4', '5/8']), 'measure');
    expect(times(grid)).toEqual([0, 2, 3.5]);
    expect(grid.every((c) => c.isDownbeat)).toBe(true);
  });

  it('AC-4.3.7/5 — The click starts again at every bar line: the first click of each Measure is on its downbeat and accented, and a value that does not fill the Measure evenly stops at the bar line — a half-note click in 3/4 sounds on Beats 1 and 3, a quarter-note click in 7/8 on Beats 1, 3, 5 and 7, a whole-note click in 3/4 once: the grid', () => {
    const halves = buildBeatGrid(meters(['3/4', '3/4']), 'half');
    expect(times(halves)).toEqual([0, 1, 1.5, 2.5]);
    expect(halves.map((c) => c.isDownbeat)).toEqual([true, false, true, false]);
    // 7/8 at ♪ = 120: eighths of 0.5 s, so quarters on eighths 1, 3, 5, 7.
    const sevens = buildBeatGrid(meters(['7/8', '7/8']), 'quarter');
    expect(times(sevens)).toEqual([0, 1, 2, 3, 3.5, 4.5, 5.5, 6.5]);
    expect(sevens.map((c) => c.measureIndex)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(times(buildBeatGrid(meters(['3/4', '3/4']), 'whole'))).toEqual([0, 1.5]);
    // Every supported meter, every value: the first click of each Measure is
    // its downbeat, and none falls on or past its bar line.
    for (const ts of TIME_SIGNATURES) {
      const p = meters([ts, ts]);
      const bar = buildBeatGrid(p, 'measure')[1].timeSeconds;
      for (const value of CLICK_VALUES) {
        const grid = buildBeatGrid(p, value);
        const second = grid.findIndex((c) => c.measureIndex === 1);
        expect(grid[0].isDownbeat && grid[second].isDownbeat, `${ts} ${value}`).toBe(true);
        expect(grid[second].timeSeconds, `${ts} ${value}`).toBeCloseTo(bar, 9);
        expect(grid.slice(0, second).every((c) => c.timeSeconds < bar - 1e-9), `${ts} ${value}`).toBe(true);
      }
    }
  });
});
