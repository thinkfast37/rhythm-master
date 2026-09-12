import { describe, it, expect } from 'vitest';
import { canHalve, halve, canCondense, condense } from '../../../src/core/condense.js';
import { validate } from '../../../src/core/pattern.js';
import { defaultAccent } from '../../../src/core/accents.js';

/** A Beat with the given Recipe whose Slots are as listed: `on` booleans, or Slot objects. */
function beat(recipe, slots) {
  return { recipe, slots: slots.map((s) => (typeof s === 'boolean' ? { on: s } : s)) };
}

/** A Pattern of the given Measures, each `[timeSignature, beats]`. */
function pattern(measures, extra = {}) {
  return {
    id: 'p_x',
    name: 'Test',
    soundMode: 'percussive',
    tempo: 80,
    tags: [],
    rating: 0,
    measures: measures.map(([timeSignature, beats]) => ({ timeSignature, beats })),
    ...extra,
  };
}

/** Straight 8ths quarter-note Beats on only the first Slot — a "quarter note" as the library writes it. */
const quarter = () => beat('straight-8ths', [true, false]);

const ons = (b) => b.slots.map((s) => s.on);

describe('core/condense — one halving (AC-10.2.1)', () => {
  it('AC-10.2.1/1 — Two 4/4 Measures of Straight 8ths become one 4/4 Measure of Straight 16ths: new Beat 1 holds old Beat 1 then old Beat 2, new Beat 2 holds old Beats 3 and 4, and so on through the eighth old Beat', () => {
    // Eight distinct Beats, each a distinct pair, so the packing order is provable.
    const pairs = [
      [true, false], [false, true], [true, true], [false, false],
      [true, false], [true, true], [false, true], [true, false],
    ];
    const p = pattern([
      ['4/4', pairs.slice(0, 4).map((s) => beat('straight-8ths', s))],
      ['4/4', pairs.slice(4).map((s) => beat('straight-8ths', s))],
    ]);
    const h = halve(p);
    expect(h.measures).toHaveLength(1);
    expect(h.measures[0].timeSignature).toBe('4/4');
    expect(h.measures[0].beats).toHaveLength(4);
    for (const b of h.measures[0].beats) expect(b.recipe).toBe('straight-16ths');
    expect(h.measures[0].beats.map(ons)).toEqual([
      [...pairs[0], ...pairs[1]],
      [...pairs[2], ...pairs[3]],
      [...pairs[4], ...pairs[5]],
      [...pairs[6], ...pairs[7]],
    ]);
    expect(validate(h)).toEqual({ valid: true, errors: [] });
  });

  it('AC-10.2.1/2 — A quarter-note Straight 16ths Beat whose second and fourth Slots are off is halvable, and contributes its first and third Slots', () => {
    const sixteenths = beat('straight-16ths', [true, false, false, false]);
    const andToo = beat('straight-16ths', [false, false, true, false]);
    const p = pattern([
      ['2/4', [sixteenths, andToo]],
      ['2/4', [quarter(), quarter()]],
    ]);
    expect(canHalve(p)).toBe(true);
    const h = halve(p);
    expect(h.measures[0].beats.map(ons)).toEqual([
      [true, false, false, true],
      [true, false, true, false],
    ]);
  });

  it('AC-10.2.1/3 — On an eighth-note Beat, Undivided Beats pack in pairs into Straight 16ths, and a Straight 16ths Beat whose second Slot is off counts as Undivided', () => {
    const und = (on) => beat('undivided', [on]);
    const p = pattern([
      ['6/8', [und(true), und(false), und(true), und(true), und(false), und(false)]],
      ['6/8', [
        beat('straight-16ths', [true, false]), und(true),
        beat('straight-16ths', [false, false]), und(false),
        und(true), beat('straight-16ths', [true, false]),
      ]],
    ]);
    expect(canHalve(p)).toBe(true);
    const h = halve(p);
    expect(h.measures).toHaveLength(1);
    expect(h.measures[0].timeSignature).toBe('6/8');
    expect(h.measures[0].beats).toHaveLength(6);
    for (const b of h.measures[0].beats) {
      expect(b.recipe).toBe('straight-16ths');
      expect(b.slots).toHaveLength(2);
    }
    expect(h.measures[0].beats.map(ons)).toEqual([
      [true, false], [true, true], [false, false],
      [true, true], [false, false], [true, true],
    ]);
    expect(validate(h)).toEqual({ valid: true, errors: [] });
  });

  it("AC-10.2.1/4 — Every Slot's on state, its stored Accent override and its Pitch travel with it to its new position; Accent defaults are computed for the new positions, as always", () => {
    const p = pattern(
      [
        ['2/4', [
          beat('straight-8ths', [{ on: true, accent: 3, pitch: { degree: '5', octaveOffset: 1 } }, false]),
          beat('straight-8ths', [
            { on: true, pitch: { degree: 'b3', octaveOffset: 0 } },
            { on: true, accent: 1, pitch: { degree: '1', octaveOffset: 0 } },
          ]),
        ]],
        ['2/4', [beat('straight-8ths', [{ on: true, pitch: { degree: '1', octaveOffset: 0 } }, false]), beat('straight-8ths', [false, false])]],
      ],
      { soundMode: 'melodic', key: 'C' }
    );
    const h = halve(p);
    const packed = h.measures[0].beats[0].slots;
    expect(packed[0]).toEqual({ on: true, accent: 3, pitch: { degree: '5', octaveOffset: 1 } });
    expect(packed[1]).toEqual({ on: false });
    expect(packed[2]).toEqual({ on: true, pitch: { degree: 'b3', octaveOffset: 0 } });
    expect(packed[3]).toEqual({ on: true, accent: 1, pitch: { degree: '1', octaveOffset: 0 } });
    // Old Beat 2's first Slot is now the "&" of new Beat 1: no stored accent, so
    // its default is Medium as it is for every midpoint Slot (data-model §3).
    expect(defaultAccent(h.measures[0], 0, 2)).toBe(2);
    expect(validate(h)).toEqual({ valid: true, errors: [] });
  });

  it("AC-10.2.1/5 — Per-Group swing overrides are dropped; the Pattern's name, id, tempo, Sound Mode, Key, scale, Pattern-wide swing amount and feel, harmony, Tags and rating are unchanged", () => {
    const swung = { ...quarter(), swing: { 0: 60 } };
    const harmony = { change: 'measure', chords: [{ degree: '1', quality: 'maj7' }, { degree: '4', quality: 'maj7' }] };
    const p = pattern(
      [
        ['4/4', [swung, quarter(), swung, quarter()]],
        ['4/4', [quarter(), swung, quarter(), quarter()]],
      ],
      {
        id: 'p_keep',
        name: 'Keep Me',
        tempo: 132,
        soundMode: 'melodic',
        key: 'Eb',
        scale: 'dorian',
        swingAmount: 40,
        swingFeel: 'sixteenth',
        harmony,
        tags: ['Latin'],
        rating: 4,
      }
    );
    const h = halve(p);
    for (const b of h.measures[0].beats) expect(b.swing).toBeUndefined();
    const withoutMeasures = ({ measures, ...rest }) => (measures, rest);
    expect(withoutMeasures(h)).toEqual(withoutMeasures(p));
    expect(h.harmony).not.toBe(p.harmony); // a copy, never the argument's own object
    // And the argument is untouched.
    expect(p.measures).toHaveLength(2);
    expect(p.measures[0].beats[0].swing).toEqual({ 0: 60 });
  });
});

describe('core/condense — as far as it can go (AC-10.2.2)', () => {
  it('AC-10.2.2 — Condense halves as far as it can in one press', () => {
    const p = pattern([
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
    ]);
    const c = condense(p);
    expect(c.measures).toHaveLength(1);
    expect(c.measures[0].timeSignature).toBe('4/4');
    for (const b of c.measures[0].beats) {
      expect(b.recipe).toBe('straight-16ths');
      expect(ons(b)).toEqual([true, true, true, true]);
    }
    expect(canCondense(c)).toBe(false);
    expect(validate(c)).toEqual({ valid: true, errors: [] });
  });

  it('AC-10.2.2 — Condense halves as far as it can in one press: a Pattern that cannot be halved is returned unchanged', () => {
    const p = pattern([['4/4', [quarter(), quarter(), quarter(), quarter()]]]);
    const c = condense(p);
    expect(c).toEqual(p);
    expect(c).not.toBe(p);
  });

  it('AC-10.2.2 — Condense halves as far as it can in one press: stops at the first Beat that is no longer halvable', () => {
    // Two halvings would need every sixteenth off after the first; Beat 1 of
    // Measure 1 turns Slot 2 on with the first halving, so only one happens.
    const p = pattern([
      ['4/4', [beat('straight-8ths', [true, true]), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
    ]);
    const c = condense(p);
    expect(c.measures).toHaveLength(2);
    expect(ons(c.measures[0].beats[0])).toEqual([true, true, true, false]);
  });
});

describe('core/condense — when a halving is possible (AC-10.2.3)', () => {
  const twoOfEighths = () =>
    pattern([
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
    ]);

  it('AC-10.2.3/1 — Enabled for two 4/4 Measures of Straight 8ths: the core rule', () => {
    expect(canHalve(twoOfEighths())).toBe(true);
    expect(canCondense(twoOfEighths())).toBe(true);
  });

  it('AC-10.2.3/2 — Disabled for an odd number of Measures, a single Measure included: the core rule', () => {
    const one = pattern([['4/4', [quarter(), quarter(), quarter(), quarter()]]]);
    expect(canHalve(one)).toBe(false);
    const three = pattern([...twoOfEighths().measures, one.measures[0]].map((m) => [m.timeSignature, m.beats]));
    expect(three.measures).toHaveLength(3);
    expect(canHalve(three)).toBe(false);
    expect(() => halve(three)).toThrow(/cannot be halved/);
  });

  it('AC-10.2.3/3 — Disabled when any Beat carries a triplet or split Recipe: the core rule', () => {
    for (const recipe of ['triplet-8ths', 'straight-triplet-split', 'triplet-straight-split']) {
      const p = twoOfEighths();
      const n = recipe === 'triplet-8ths' ? 3 : 5;
      p.measures[1].beats[2] = beat(recipe, Array(n).fill(false));
      expect(canHalve(p), recipe).toBe(false);
    }
  });

  it('AC-10.2.3/4 — Disabled when any quarter-note Straight 16ths Beat has its second or fourth Slot on, or any eighth-note Straight 16ths Beat its second: the core rule', () => {
    const second = twoOfEighths();
    second.measures[0].beats[0] = beat('straight-16ths', [true, true, false, false]);
    expect(canHalve(second)).toBe(false);
    const fourth = twoOfEighths();
    fourth.measures[0].beats[3] = beat('straight-16ths', [false, false, false, true]);
    expect(canHalve(fourth)).toBe(false);
    const und = (on) => beat('undivided', [on]);
    const eighths = pattern([
      ['6/8', [und(true), und(false), und(true), und(true), und(false), beat('straight-16ths', [false, true])]],
      ['6/8', [und(true), und(false), und(true), und(true), und(false), und(false)]],
    ]);
    expect(canHalve(eighths)).toBe(false);
  });

  it('AC-10.2.3/5 — Disabled when the two Measures of any pair differ in Time Signature: the core rule', () => {
    const p = twoOfEighths();
    p.measures[1] = { timeSignature: '3/4', beats: [quarter(), quarter(), quarter()] };
    expect(canHalve(p)).toBe(false);
    // Pairs are (1,2) and (3,4): a change of meter between Measures 2 and 3 is fine.
    const q = pattern([
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['3/4', [quarter(), quarter(), quarter()]],
      ['3/4', [quarter(), quarter(), quarter()]],
    ]);
    expect(canHalve(q)).toBe(true);
    const h = halve(q);
    expect(h.measures.map((m) => m.timeSignature)).toEqual(['4/4', '3/4']);
  });
});
