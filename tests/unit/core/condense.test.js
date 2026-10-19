import { describe, it, expect } from 'vitest';
import { canHalve, halve, canCondense, condense, condenseTargets } from '../../../src/core/condense.js';
import { validate } from '../../../src/core/pattern.js';
import { defaultAccent, effectiveAccent, STRONG } from '../../../src/core/accents.js';

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

  it("AC-10.2.1/4 — Every Slot's on state, the Accent it sounded with and its Pitch travel with it to its new position; the Accent is stored as an override only where it differs from the new position's computed default", () => {
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
    const before = (m, b, s) => effectiveAccent(p.measures[m], b, s);
    const h = halve(p);
    const m0 = h.measures[0];
    const packed = m0.beats[0].slots;
    // Old Beat 1 Slot 1 sounded Strong and lands on Beat 1 Slot 1, whose default
    // is Strong: the same Accent, so no override is kept.
    expect(packed[0]).toEqual({ on: true, pitch: { degree: '5', octaveOffset: 1 } });
    expect(packed[1]).toEqual({ on: false });
    // Old Beat 2's first Slot sounded Weak (Beat 2 of 2/4) and is now the "&" of
    // new Beat 1, whose default is Medium: it keeps Weak as an override.
    expect(before(0, 1, 0)).toBe(1);
    expect(defaultAccent(m0, 0, 2)).toBe(2);
    expect(packed[2]).toEqual({ on: true, accent: 1, pitch: { degree: 'b3', octaveOffset: 0 } });
    // Its stored Weak lands where the default is Weak: dropped as redundant.
    expect(packed[3]).toEqual({ on: true, pitch: { degree: '1', octaveOffset: 0 } });
    // Old Measure 2's downbeat sounded Strong; it is now new Beat 2's first Slot.
    expect(before(1, 0, 0)).toBe(STRONG);
    expect(effectiveAccent(m0, 1, 0)).toBe(STRONG);
    // Every sounding Slot sounds as it did.
    expect([0, 2, 3].map((i) => effectiveAccent(m0, 0, i))).toEqual([before(0, 0, 0), before(0, 1, 0), before(0, 1, 1)]);
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

  it('AC-10.2.3/5 — When the Measures differ in Time Signature, enabled exactly when they can be halved as written or some Time Signature can regroup them, and disabled for a 3/8 Measure followed by a 4/4 one, which neither can: the core rule', () => {
    const und = () => beat('undivided', [true]);
    const stuck = pattern([
      ['3/8', [und(), und(), und()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
    ]);
    expect(canHalve(stuck)).toBe(false);
    expect(condenseTargets(stuck)).toEqual([]);
    expect(canCondense(stuck)).toBe(false);
    // Regroupable only: 3/4 then 1/4 make one 4/4.
    const regroup = pattern([
      ['3/4', [quarter(), quarter(), quarter()]],
      ['1/4', [quarter()]],
    ]);
    expect(canHalve(regroup)).toBe(false);
    expect(canCondense(regroup)).toBe(true);
    // Halvable as written: pairs are (1,2) and (3,4), so a change of meter
    // between Measures 2 and 3 halves each pair in its own meter.
    const q = pattern([
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['4/4', [quarter(), quarter(), quarter(), quarter()]],
      ['3/4', [quarter(), quarter(), quarter()]],
      ['3/4', [quarter(), quarter(), quarter()]],
    ]);
    expect(canHalve(q)).toBe(true);
    expect(canCondense(q)).toBe(true);
    expect(halve(q).measures.map((m) => m.timeSignature)).toEqual(['4/4', '3/4']);
    expect(condense(q).measures.map((m) => m.timeSignature)).toEqual(['4/4', '3/4']);
  });
});

describe('core/condense — regrouping mixed meters (AC-10.2.6)', () => {
  const und = (on = true) => beat('undivided', [on]);
  const measure = (ts, n, make = quarter) => [ts, Array.from({ length: n }, make)];
  /** 3+3+3+3+2+2 as quarter-note Measures — sixteen quarters, one 4/4 bar of sixteenths. */
  const groupings = (make) =>
    pattern([measure('3/4', 3, make), measure('3/4', 3, make), measure('3/4', 3, make), measure('3/4', 3, make), measure('2/4', 2, make), measure('2/4', 2, make)]);
  const sounding = (m) => m.beats.flatMap((b) => b.slots.map((s) => s.on));
  const at = (onIndices, n) => Array.from({ length: n }, (_, i) => onIndices.includes(i + 1));
  const GROUP_STARTS = [1, 4, 7, 10, 13, 15];

  it("AC-10.2.6/1 — Condense asks which Time Signature to land in, listing only those that fit, 4/4 first when it fits, and — when the Measures can be halved as written — an option to keep each Measure's meter; cancelling leaves the Pattern untouched: the core list", () => {
    expect(condenseTargets(groupings(quarter))[0]).toBe('4/4');
    // 3/4 then 2/4: five quarters fill no 4/4 Measure.
    const five = pattern([measure('3/4', 3), measure('2/4', 2)]);
    expect(condenseTargets(five)).not.toContain('4/4');
    expect(condenseTargets(five)).toContain('5/4');
    // A Pattern of one meter is condensed in that meter; nothing to pick.
    expect(condenseTargets(pattern([measure('4/4', 4), measure('4/4', 4)]))).toEqual([]);
    // The pick is the Composer's: without one, Condense halves as written.
    const paired = pattern([measure('2/4', 2), measure('2/4', 2), measure('4/4', 4), measure('4/4', 4)]);
    expect(condense(paired).measures.map((m) => m.timeSignature)).toEqual(['2/4', '4/4']);
    // Twelve quarters: three 4/4 Measures, which cannot halve.
    expect(condense(paired, '4/4').measures.map((m) => m.timeSignature)).toEqual(['4/4', '4/4', '4/4']);
  });

  it("AC-10.2.6/2 — 3/4, 3/4, 3/4, 3/4, 2/4, 2/4 of Straight 8ths with only each Measure's first Slot on become one 4/4 Measure of Straight 16ths with Slots 1, 4, 7, 10, 13 and 15 on", () => {
    const p = groupings(() => beat('straight-8ths', [false, false]));
    for (const m of p.measures) m.beats[0].slots[0].on = true;
    const c = condense(p, '4/4');
    expect(c.measures).toHaveLength(1);
    expect(c.measures[0].timeSignature).toBe('4/4');
    expect(c.measures[0].beats.map((b) => b.recipe)).toEqual(Array(4).fill('straight-16ths'));
    expect(sounding(c.measures[0])).toEqual(at(GROUP_STARTS, 16));
    expect(validate(c)).toEqual({ valid: true, errors: [] });
  });

  it('AC-10.2.6/3 — With the first Slot of every Beat on instead, every Slot of the result is on and Slots 1, 4, 7, 10, 13 and 15 are Strong, so the 3+3+3+3+2+2 grouping is still accented', () => {
    const c = condense(groupings(quarter), '4/4');
    const m = c.measures[0];
    expect(sounding(m)).toEqual(Array(16).fill(true));
    const accents = m.beats.flatMap((b, bi) => b.slots.map((_, si) => effectiveAccent(m, bi, si)));
    accents.forEach((a, i) => expect(a === STRONG, `Slot ${i + 1}`).toBe(GROUP_STARTS.includes(i + 1)));
    expect(validate(c)).toEqual({ valid: true, errors: [] });
  });

  it('AC-10.2.6/4 — Eighth-note Beats pair into quarter-note Beats: two Undivided Beats into Straight 8ths, otherwise into Straight 16ths with an Undivided Beat contributing its Slot then an off one — so 3/8 then 5/8 become one 4/4 Measure, and 4/4, 3/8, 5/8 become two before any halving', () => {
    const p = pattern([measure('3/8', 3, und), measure('5/8', 5, und)]);
    const c = condense(p, '4/4');
    expect(c.measures).toHaveLength(1);
    expect(c.measures[0].beats.map((b) => b.recipe)).toEqual(Array(4).fill('straight-8ths'));
    expect(sounding(c.measures[0])).toEqual(Array(8).fill(true));

    const mixedRecipes = pattern([
      ['3/8', [und(), beat('straight-16ths', [true, true]), und()]],
      measure('5/8', 5, und),
    ]);
    const m = condense(mixedRecipes, '4/4');
    expect(m.measures[0].beats[0]).toMatchObject({ recipe: 'straight-16ths' });
    expect(ons(m.measures[0].beats[0])).toEqual([true, false, true, true]);
    expect(m.measures[0].beats[1].recipe).toBe('straight-8ths');

    // A sounding sixteenth stops the halving, so the regroup itself shows.
    const busy = () => beat('straight-16ths', [true, true, false, false]);
    const three = pattern([measure('4/4', 4, busy), measure('3/8', 3, und), measure('5/8', 5, und)]);
    const t = condense(three, '4/4');
    expect(t.measures.map((x) => x.timeSignature)).toEqual(['4/4', '4/4']);
    expect(validate(t)).toEqual({ valid: true, errors: [] });
  });

  it('AC-10.2.6/5 — Into an eighth-note meter a quarter-note Beat splits in two: Straight 8ths into two Undivided Beats, Straight 16ths into two Straight 16ths Beats', () => {
    // 2/4 then 3/8: seven eighths, one 7/8 Measure.
    const lone = pattern([['2/4', [beat('straight-8ths', [true, false]), beat('straight-16ths', [true, true, false, true])]], ['3/8', [und(), und(false), und()]]]);
    expect(condenseTargets(lone)).toContain('7/8');
    const seven = condense(lone, '7/8');
    expect(validate(seven)).toEqual({ valid: true, errors: [] });
    expect(seven.measures).toHaveLength(1);
    expect(seven.measures[0].beats.map((b) => b.recipe)).toEqual([
      'undivided', 'undivided', 'straight-16ths', 'straight-16ths', 'undivided', 'undivided', 'undivided',
    ]);
    expect(sounding(seven.measures[0])).toEqual([true, false, true, true, false, true, true, false, true]);
  });

  it('AC-10.2.6/6 — A Time Signature fits only when the Beats fill whole Measures of it, every run of eighth-note Beats pairs evenly between quarter-note Beats, no triplet or split Beat must split, and the result holds fewer Measures than the Pattern did — so 3/4 then 2/4 offer 5/4 and not 4/4, and 4/4, 4/4, 2/4, 2/4, 2/4 offer no 2/4, which would make seven', () => {
    expect(condenseTargets(pattern([measure('3/4', 3), measure('2/4', 2)]))).toContain('5/4');
    expect(condenseTargets(pattern([measure('3/4', 3), measure('2/4', 2)]))).not.toContain('4/4');
    // An odd run of eighths before a quarter-note Beat has no partner.
    expect(condenseTargets(pattern([measure('3/8', 3, und), measure('4/4', 4)]))).toEqual([]);
    // A triplet cannot split into eighth-note Beats.
    const triplet = pattern([['3/4', [quarter(), beat('triplet-8ths', [true, false, true]), quarter()]], measure('3/8', 3, und), measure('3/8', 3, und)]);
    expect(condenseTargets(triplet).filter((ts) => ts.endsWith('/8'))).toEqual([]);
    const long = pattern([measure('4/4', 4), measure('4/4', 4), measure('2/4', 2), measure('2/4', 2), measure('2/4', 2)]);
    expect(condenseTargets(long)).not.toContain('2/4');
    expect(condenseTargets(long)).toContain('7/4');
    for (const ts of condenseTargets(long)) expect(condense(long, ts).measures.length).toBeLessThan(5);
  });

  it('AC-10.2.6/7 — Triplet and split Beats travel unchanged into a quarter-note meter: 3/4 then 1/4 holding a Triplet 8ths Beat become one 4/4 Measure holding it, and halving stops there, as a triplet Beat always stops it', () => {
    const triplet = beat('triplet-8ths', [true, false, true]);
    const p = pattern([['3/4', [quarter(), triplet, quarter()]], ['1/4', [beat('straight-triplet-split', [true, false, true, false, true])]]]);
    expect(condenseTargets(p)).toEqual(['4/4']);
    const c = condense(p, '4/4');
    expect(c.measures).toHaveLength(1);
    expect(c.measures[0].beats.map((b) => b.recipe)).toEqual(['straight-8ths', 'triplet-8ths', 'straight-8ths', 'straight-triplet-split']);
    expect(ons(c.measures[0].beats[1])).toEqual([true, false, true]);
    expect(canHalve(c)).toBe(false);
    expect(validate(c)).toEqual({ valid: true, errors: [] });
  });
});
