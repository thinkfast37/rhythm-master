import { describe, it, expect } from 'vitest';
import {
  create,
  createMeasure,
  addMeasure,
  removeMeasure,
  setTimeSignature,
  setTimeSignatureAll,
  setRecipe,
  cycleAccent,
  countActiveSlots,
  append,
  duplicate,
  automaticTags,
  validate,
  MAX_MEASURES,
} from '../../../src/core/pattern.js';
import { effectiveAccent, MEDIUM, STRONG, WEAK } from '../../../src/core/accents.js';

describe('core/pattern — construction', () => {
  it('AC-1.1.1 — a new Pattern is one 4/4 Measure with every Slot off', () => {
    const p = create();
    expect(p.measures).toHaveLength(1);
    expect(p.measures[0].timeSignature).toBe('4/4');
    expect(p.measures[0].beats).toHaveLength(4);
    for (const beat of p.measures[0].beats) {
      expect(beat.recipe).toBe('straight-16ths');
      expect(beat.slots).toHaveLength(4);
      expect(beat.slots.every((s) => s.on === false)).toBe(true);
    }
  });

  it('AC-1.3.3 — Slots from a default Recipe start off, with no stored accent', () => {
    const beat = create().measures[0].beats[0];
    for (const slot of beat.slots) {
      expect(slot.on).toBe(false);
      expect('accent' in slot).toBe(false);
    }
  });

  it('AC-1.1.4 — a Measure holds exactly its numerator in Beats, for every meter', () => {
    const expected = {
      '1/4': 1, '2/4': 2, '3/4': 3, '4/4': 4, '5/4': 5, '6/4': 6, '7/4': 7,
      '6/8': 6, '7/8': 7, '9/8': 9, '12/8': 12,
    };
    for (const [ts, beats] of Object.entries(expected)) {
      expect(createMeasure(ts).beats, ts).toHaveLength(beats);
    }
  });
});

describe('core/pattern — Measures', () => {
  it('AC-1.1.2 — an added Measure inherits the previous Measure’s meter', () => {
    let p = create();
    p = setTimeSignature(p, 0, '7/8');
    p = addMeasure(p);
    expect(p.measures[1].timeSignature).toBe('7/8');
    expect(p.measures[1].beats).toHaveLength(7);
  });

  it('AC-1.1.3 — 8-Measure cap disables +Measure: core refuses the ninth Measure', () => {
    let p = create();
    for (let i = 1; i < MAX_MEASURES; i++) p = addMeasure(p);
    expect(p.measures).toHaveLength(8);
    expect(() => addMeasure(p)).toThrow(/at most 8 Measures/);
  });

  it('AC-1.1.6 — changing one Measure’s meter resets only that Measure', () => {
    let p = addMeasure(create());
    p = cycleAccent(p, 1, 0, 0); // put a note in Measure 2
    expect(countActiveSlots(p, 1, 0)).toBe(1);

    p = setTimeSignature(p, 0, '3/4');
    expect(p.measures[0].beats).toHaveLength(3);
    expect(p.measures[1].timeSignature).toBe('4/4');
    expect(countActiveSlots(p, 1, 0)).toBe(1);
  });

  it('AC-1.1.5 — apply-to-all sets every Measure’s meter and clears every Slot', () => {
    let p = addMeasure(addMeasure(create()));
    p = cycleAccent(p, 2, 0, 0);
    p = setTimeSignatureAll(p, '6/8');
    expect(p.measures).toHaveLength(3);
    for (const m of p.measures) {
      expect(m.timeSignature).toBe('6/8');
      expect(m.beats).toHaveLength(6);
      expect(m.beats.every((b) => b.slots.every((s) => !s.on))).toBe(true);
    }
  });

  it('AC-1.1.8 — a Measure can be removed, but never the last one', () => {
    let p = addMeasure(create());
    p = removeMeasure(p, 0);
    expect(p.measures).toHaveLength(1);
    expect(() => removeMeasure(p, 0)).toThrow(/at least one Measure/);
  });

  it('AC-1.1.9 — no mutator touches its argument', () => {
    const p = create();
    const before = structuredClone(p);
    addMeasure(p);
    setTimeSignature(p, 0, '3/4');
    setRecipe(p, 0, 0, 'triplet-8ths');
    cycleAccent(p, 0, 0, 0);
    duplicate(p);
    expect(p).toEqual(before);
  });
});

describe('core/pattern — Recipes', () => {
  it('AC-1.3.6 — a Recipe change resets that Beat only', () => {
    let p = create();
    p = cycleAccent(p, 0, 0, 1); // note on Beat 1
    p = cycleAccent(p, 0, 1, 0); // note on Beat 2
    p = setRecipe(p, 0, 0, 'triplet-8ths');

    expect(p.measures[0].beats[0].slots).toHaveLength(3);
    expect(countActiveSlots(p, 0, 0)).toBe(0);
    expect(countActiveSlots(p, 0, 1)).toBe(1);
  });

  it('AC-1.3.7 — shrinking a Recipe clears the Beat, and the count is reportable first', () => {
    let p = create();
    p = cycleAccent(p, 0, 0, 0);
    p = cycleAccent(p, 0, 0, 1);
    p = cycleAccent(p, 0, 0, 3);
    expect(countActiveSlots(p, 0, 0)).toBe(3);

    p = setRecipe(p, 0, 0, 'straight-8ths');
    expect(p.measures[0].beats[0].slots).toHaveLength(2);
    expect(countActiveSlots(p, 0, 0)).toBe(0);
  });

  it('AC-1.3.8 — growing a Recipe clears the Beat too, which is why both directions prompt', () => {
    let p = create();
    p = setRecipe(p, 0, 0, 'straight-8ths');
    p = cycleAccent(p, 0, 0, 0);
    p = cycleAccent(p, 0, 0, 1);
    expect(countActiveSlots(p, 0, 0)).toBe(2);

    p = setRecipe(p, 0, 0, 'straight-16ths');
    expect(p.measures[0].beats[0].slots).toHaveLength(4);
    expect(countActiveSlots(p, 0, 0)).toBe(0);
  });

  it('AC-1.3.10 — a Recipe change on an empty Beat loses nothing', () => {
    let p = create();
    expect(countActiveSlots(p, 0, 0)).toBe(0);
    p = setRecipe(p, 0, 0, 'triplet-8ths');
    expect(countActiveSlots(p, 0, 0)).toBe(0);
  });

  it('AC-1.3.5 — a Recipe from the wrong menu is refused', () => {
    let p = setTimeSignature(create(), 0, '6/8');
    expect(() => setRecipe(p, 0, 0, 'triplet-8ths')).toThrow(/not offered/);
    p = setTimeSignature(p, 0, '4/4');
    expect(() => setRecipe(p, 0, 0, 'undivided')).toThrow(/not offered/);
  });
});

describe('core/pattern — accents', () => {
  it('AC-3.1.1 — the first tap lands on the computed default and stores no override', () => {
    const p = cycleAccent(create(), 0, 2, 0); // Beat 3 of 4/4 is Medium
    const slot = p.measures[0].beats[2].slots[0];
    expect(slot.on).toBe(true);
    expect('accent' in slot).toBe(false);
    expect(effectiveAccent(p.measures[0], 2, 0)).toBe(MEDIUM);
  });

  it('AC-3.1.12 — tapping on from a Medium default walks Medium → Strong → Weak → off', () => {
    let p = cycleAccent(create(), 0, 2, 0);
    const read = () => effectiveAccent(p.measures[0], 2, 0);
    expect(read()).toBe(MEDIUM);
    p = cycleAccent(p, 0, 2, 0);
    expect(read()).toBe(STRONG);
    p = cycleAccent(p, 0, 2, 0);
    expect(read()).toBe(WEAK);
    p = cycleAccent(p, 0, 2, 0);
    expect(p.measures[0].beats[2].slots[0].on).toBe(false);
    p = cycleAccent(p, 0, 2, 0);
    expect(read()).toBe(MEDIUM);
  });

  it('AC-3.1.11 — switching a Slot off drops its override too', () => {
    let p = create();
    for (let i = 0; i < 4; i++) p = cycleAccent(p, 0, 0, 0);
    const slot = p.measures[0].beats[0].slots[0];
    expect(slot.on).toBe(false);
    expect('accent' in slot).toBe(false);
  });
});

describe('core/pattern — whole-Pattern operations', () => {
  it('AC-8.1.1 — append concatenates Measures, each keeping its own meter', () => {
    const a = setTimeSignature(create(), 0, '3/4');
    const b = setTimeSignature(create(), 0, '6/8');
    const joined = append(a, b);
    expect(joined.measures.map((m) => m.timeSignature)).toEqual(['3/4', '6/8']);
  });

  it('AC-8.1.2 — Combine picker excludes Patterns that would exceed the 8-Measure cap: append refuses the combination the picker would have hidden', () => {
    let a = create();
    for (let i = 1; i < 4; i++) a = addMeasure(a); // 4 Measures
    let b = create();
    for (let i = 1; i < 6; i++) b = addMeasure(b); // 6 Measures — one over the room left
    expect(() => append(a, b)).toThrow(/over the 8 cap/);
  });

  it('AC-10.1.1 — duplicate doubles a Pattern’s length with its own Measures', () => {
    let p = addMeasure(create());
    p = cycleAccent(p, 0, 0, 0);
    const d = duplicate(p);
    expect(d.measures).toHaveLength(4);
    expect(d.measures[2]).toEqual(d.measures[0]);
    expect(d.measures[3]).toEqual(d.measures[1]);
  });

  it('AC-10.1.2 — editing a duplicated half leaves the other untouched', () => {
    let d = duplicate(create());
    d = cycleAccent(d, 1, 0, 0);
    expect(countActiveSlots(d, 1, 0)).toBe(1);
    expect(countActiveSlots(d, 0, 0)).toBe(0);
  });
});

describe('core/pattern — derived Tags', () => {
  it('AC-5.3.1 — Sound Mode and provenance produce automatic Tags', () => {
    const p = create();
    // Provenance reads as a Tag rather than as prose about the software.
    expect(automaticTags(p, false)).toEqual(['built-in', 'percussive']);
    expect(automaticTags(p, true)).toEqual(['custom', 'percussive']);
    expect(automaticTags({ ...p, soundMode: 'melodic' }, false)).toEqual(['built-in', 'melodic']);
  });

  it('AC-5.3.2 — the swing Tag is derived from actual swing, not stored', () => {
    const p = create();
    expect(automaticTags(p, true)).not.toContain('swing');
    p.measures[0].beats[0].swing = { 0: 40 };
    expect(automaticTags(p, true)).toContain('swing');
    p.measures[0].beats[0].swing = { 0: 0 };
    expect(automaticTags(p, true)).not.toContain('swing');
  });
});

describe('core/pattern — validation', () => {
  it('AC-16.2.1 — a well-formed Pattern validates', () => {
    expect(validate(create())).toEqual({ valid: true, errors: [] });
  });

  it('AC-16.2.2 — a Beat count that disagrees with the meter is rejected', () => {
    const p = create();
    p.measures[0].beats.pop();
    const { valid, errors } = validate(p);
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/3 Beats in 4\/4, expected 4/);
  });

  it('AC-16.2.3 — out-of-range tempo, rating, and stored automatic Tags are rejected', () => {
    // 301: one past the AC-4.2.1 ceiling (18–300 since its 2026-08-22 revision).
    expect(validate({ ...create(), tempo: 301 }).errors.join(' ')).toMatch(/tempo 301/);
    expect(validate({ ...create(), rating: 9 }).errors.join(' ')).toMatch(/rating 9/);
    expect(validate({ ...create(), tags: ['custom'] }).errors.join(' ')).toMatch(/automatic/);
  });

  it('AC-16.2.4 — key must be present exactly when the Pattern is melodic', () => {
    expect(validate({ ...create(), key: 'C' }).errors.join(' ')).toMatch(/key must be present iff/);
    expect(validate({ ...create(), soundMode: 'melodic' }).errors.join(' ')).toMatch(
      /key must be present iff/
    );
  });
});
