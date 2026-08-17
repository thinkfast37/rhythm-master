import { describe, it, expect } from 'vitest';
import {
  metricLevel,
  beatAccent,
  defaultAccent,
  effectiveAccent,
  nextAccentInCycle,
  OFF,
  WEAK,
  MEDIUM,
  STRONG,
} from '../../../src/core/accents.js';
import { createMeasure, setRecipe, create } from '../../../src/core/pattern.js';

/** A Measure at `ts` whose every Beat carries `recipe`. */
function measureWith(ts, recipe) {
  let pattern = { ...create(), measures: [createMeasure(ts)] };
  for (let b = 0; b < pattern.measures[0].beats.length; b++) {
    pattern = setRecipe(pattern, 0, b, recipe);
  }
  return pattern.measures[0];
}

const levels = (measure, beatIndex) =>
  measure.beats[beatIndex].slots.map((_, si) => defaultAccent(measure, beatIndex, si));

describe('core/accents', () => {
  it('AC-3.1.2 — Beat Accent table, every supported meter', () => {
    const S = STRONG, M = MEDIUM, W = WEAK;
    const table = {
      '1/4': [S],
      '2/4': [S, W],
      '3/4': [S, W, W],
      '4/4': [S, W, M, W],
      '5/4': [S, W, W, W, W],
      '6/4': [S, W, W, M, W, W],
      '7/4': [S, W, W, W, W, W, W],
      '6/8': [S, W, W, M, W, W],
      '7/8': [S, W, W, W, W, W, W],
      '9/8': [S, W, W, W, W, W, W, W, W],
      '12/8': [S, W, W, W, W, W, M, W, W, W, W, W],
    };
    for (const [ts, expected] of Object.entries(table)) {
      const actual = expected.map((_, i) => beatAccent(ts, i));
      expect(actual, ts).toEqual(expected);
    }
  });

  it('AC-3.1.3 — 4-Slot Recipe on a Strong Beat', () => {
    const m = measureWith('4/4', 'straight-16ths');
    expect(levels(m, 0)).toEqual([STRONG, WEAK, MEDIUM, WEAK]);
  });

  it('AC-3.1.4 — 4-Slot Recipe on a Weak Beat floors at Weak', () => {
    const m = measureWith('4/4', 'straight-16ths');
    expect(levels(m, 1)).toEqual([WEAK, WEAK, WEAK, WEAK]);
  });

  it('AC-3.1.5 — 4-Slot Recipe on a Medium Beat', () => {
    const m = measureWith('4/4', 'straight-16ths');
    expect(levels(m, 2)).toEqual([MEDIUM, WEAK, WEAK, WEAK]);
  });

  it('AC-3.1.6 — a 2-Slot Recipe never produces a Medium Slot', () => {
    const m = measureWith('2/4', 'straight-8ths');
    expect(levels(m, 0)).toEqual([STRONG, WEAK]);
    expect(levels(m, 0)).not.toContain(MEDIUM);
  });

  it('AC-3.1.7 — a 3-Slot triplet Recipe never produces a Medium Slot', () => {
    const m = measureWith('3/4', 'triplet-8ths');
    expect(levels(m, 0)).toEqual([STRONG, WEAK, WEAK]);
  });

  it('AC-3.1.8 — a 5-Slot mixed Recipe never produces a Medium Slot, across both groups', () => {
    for (const recipe of ['straight-triplet-split', 'triplet-straight-split']) {
      const m = measureWith('4/4', recipe);
      expect(levels(m, 0), recipe).toEqual([STRONG, WEAK, WEAK, WEAK, WEAK]);
    }
  });

  it('AC-3.1.9 — a 1-Slot Undivided Recipe carries the Beat’s own accent', () => {
    const m = measureWith('6/8', 'undivided');
    expect(levels(m, 0)).toEqual([STRONG]); // Beat 1 of 6/8 is Strong
    expect(levels(m, 3)).toEqual([MEDIUM]); // Beat 4 of 6/8 is Medium
    expect(levels(m, 1)).toEqual([WEAK]);
  });

  it('AC-3.1.10 — the default is recomputed from position, never remembered', () => {
    let pattern = { ...create(), measures: [createMeasure('4/4')] };
    // Beat 3 defaults to Medium; churn its Recipe and it must still be Medium.
    expect(defaultAccent(pattern.measures[0], 2, 0)).toBe(MEDIUM);
    pattern = setRecipe(pattern, 0, 2, 'straight-8ths');
    pattern = setRecipe(pattern, 0, 2, 'straight-16ths');
    expect(defaultAccent(pattern.measures[0], 2, 0)).toBe(MEDIUM);
  });

  it('AC-3.1.1 — an off Slot has Accent Level 0, not a default', () => {
    const m = measureWith('4/4', 'straight-16ths');
    expect(effectiveAccent(m, 0, 0)).toBe(OFF);
  });

  it('AC-3.1.1 — an on Slot with no override reports its computed default', () => {
    const m = measureWith('4/4', 'straight-16ths');
    m.beats[1].slots[0] = { on: true };
    expect(effectiveAccent(m, 1, 0)).toBe(WEAK); // Beat 2 is Weak
  });

  it('AC-3.1.1 — a stored override wins over the computed default', () => {
    const m = measureWith('4/4', 'straight-16ths');
    m.beats[1].slots[0] = { on: true, accent: STRONG };
    expect(effectiveAccent(m, 1, 0)).toBe(STRONG);
  });

  it('AC-3.1.11 — override cycle from a Strong default', () => {
    const seq = [];
    let level = STRONG;
    for (let i = 0; i < 4; i++) seq.push((level = nextAccentInCycle(level, STRONG)));
    expect(seq).toEqual([WEAK, MEDIUM, OFF, STRONG]);
  });

  it('AC-3.1.12 — override cycle from a Medium default', () => {
    const seq = [];
    let level = MEDIUM;
    for (let i = 0; i < 4; i++) seq.push((level = nextAccentInCycle(level, MEDIUM)));
    expect(seq).toEqual([STRONG, WEAK, OFF, MEDIUM]);
  });

  it('AC-3.1.13 — override cycle from a Weak default', () => {
    const seq = [];
    let level = WEAK;
    for (let i = 0; i < 4; i++) seq.push((level = nextAccentInCycle(level, WEAK)));
    expect(seq).toEqual([MEDIUM, STRONG, OFF, WEAK]);
  });

  it('AC-3.1.11 — every cycle visits all three levels before switching off', () => {
    for (const def of [WEAK, MEDIUM, STRONG]) {
      const visited = new Set();
      let level = def;
      visited.add(level);
      for (let i = 0; i < 2; i++) visited.add((level = nextAccentInCycle(level, def)));
      expect(visited, `default ${def}`).toEqual(new Set([WEAK, MEDIUM, STRONG]));
      expect(nextAccentInCycle(level, def)).toBe(OFF);
    }
  });

  it('AC-3.1.2 — the positional formula is shared by both levels', () => {
    expect(metricLevel(1, 4)).toBe(STRONG);
    expect(metricLevel(3, 4)).toBe(MEDIUM);
    expect(metricLevel(2, 4)).toBe(WEAK);
    expect(metricLevel(2, 2)).toBe(WEAK); // n not > 2, so no Medium
    expect(metricLevel(2, 3)).toBe(WEAK); // odd n, so no Medium
    expect(() => metricLevel(0, 4)).toThrow();
    expect(() => metricLevel(5, 4)).toThrow();
  });
});
