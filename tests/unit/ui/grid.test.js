import { describe, it, expect } from 'vitest';
import { meterProminence } from '../../../src/ui/grid.js';

const measures = (...signatures) => signatures.map((timeSignature) => ({ timeSignature }));

describe('ui/grid — meter label prominence', () => {
  it('AC-1.4.4 — a Measure is prominent when its meter differs from the one before', () => {
    const ms = measures('4/4', '4/4', '3/4', '3/4');
    expect(ms.map((_, i) => meterProminence(ms, i))).toEqual([
      'prominent', // opening meter
      'dimmed', // same as Measure 1
      'prominent', // changed
      'dimmed', // same as Measure 3
    ]);
  });

  it('AC-1.4.5 — a uniform Pattern renders only Measure 1 prominently', () => {
    const ms = measures('4/4', '4/4', '4/4', '4/4');
    expect(ms.map((_, i) => meterProminence(ms, i))).toEqual([
      'prominent',
      'dimmed',
      'dimmed',
      'dimmed',
    ]);
  });

  it('AC-1.4.6 — changing a dimmed label makes it prominent without disturbing the next', () => {
    const before = measures('4/4', '4/4', '3/4');
    expect(before.map((_, i) => meterProminence(before, i))).toEqual([
      'prominent',
      'dimmed',
      'prominent',
    ]);

    const after = measures('4/4', '6/8', '3/4');
    expect(after.map((_, i) => meterProminence(after, i))).toEqual([
      'prominent',
      'prominent', // now differs from Measure 1
      'prominent', // still differs from Measure 2
    ]);
  });

  it('AC-1.4.7 — changing a prominent label can dim it and promote the next', () => {
    const before = measures('4/4', '3/4', '3/4');
    expect(before.map((_, i) => meterProminence(before, i))).toEqual([
      'prominent',
      'prominent',
      'dimmed',
    ]);

    const after = measures('4/4', '4/4', '3/4');
    expect(after.map((_, i) => meterProminence(after, i))).toEqual([
      'prominent',
      'dimmed', // now matches Measure 1
      'prominent', // now differs from Measure 2
    ]);
  });

  it('AC-1.4.3 — prominence is a function of neighbours only, never of position alone', () => {
    const ms = measures('3/4', '4/4', '3/4');
    expect(ms.map((_, i) => meterProminence(ms, i))).toEqual([
      'prominent',
      'prominent',
      'prominent',
    ]);
  });

  it('AC-1.4.4 — a single-Measure Pattern is always prominent', () => {
    const ms = measures('7/8');
    expect(meterProminence(ms, 0)).toBe('prominent');
  });
});
