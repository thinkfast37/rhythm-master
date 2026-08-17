import { describe, it, expect } from 'vitest';
import {
  COUNTING_SYSTEMS,
  labelsFor,
  effectiveSystem,
  isForcedNumbered,
} from '../../../src/core/counting.js';
import { create, setRecipe, setTimeSignature } from '../../../src/core/pattern.js';

describe('core/counting', () => {
  it('AC-5.6.1 — three counting systems are offered', () => {
    expect(COUNTING_SYSTEMS).toEqual(['takadimi', 'one-e-and-a', 'numbered']);
  });

  it('AC-5.6.4 — Takadimi labels per Recipe', () => {
    expect(labelsFor('straight-16ths', 'quarter', 'takadimi')).toEqual(['ta', 'ka', 'di', 'mi']);
    expect(labelsFor('straight-8ths', 'quarter', 'takadimi')).toEqual(['ta', 'di']);
    expect(labelsFor('triplet-8ths', 'quarter', 'takadimi')).toEqual(['ta', 'ki', 'da']);
    expect(labelsFor('undivided', 'eighth', 'takadimi')).toEqual(['ta']);
    expect(labelsFor('straight-16ths', 'eighth', 'takadimi')).toEqual(['ta', 'di']);
  });

  it('AC-5.6.5 — 1-e-&-a labels per Recipe', () => {
    expect(labelsFor('straight-16ths', 'quarter', 'one-e-and-a')).toEqual(['1', 'e', '&', 'a']);
    expect(labelsFor('straight-8ths', 'quarter', 'one-e-and-a')).toEqual(['1', '&']);
    expect(labelsFor('triplet-8ths', 'quarter', 'one-e-and-a')).toEqual(['1', 'trip', 'let']);
  });

  it('AC-5.6.6 — Numbered labels every Slot by ordinal', () => {
    expect(labelsFor('straight-16ths', 'quarter', 'numbered')).toEqual(['1', '2', '3', '4']);
    expect(labelsFor('triplet-8ths', 'quarter', 'numbered')).toEqual(['1', '2', '3']);
    expect(labelsFor('undivided', 'eighth', 'numbered')).toEqual(['1']);
  });

  it('AC-5.6.7 — a mixed-feel Recipe has no syllable vocabulary, so it numbers', () => {
    for (const system of COUNTING_SYSTEMS) {
      expect(labelsFor('straight-triplet-split', 'quarter', system), system).toEqual([
        '1', '2', '3', '4', '5',
      ]);
      expect(labelsFor('triplet-straight-split', 'quarter', system), system).toEqual([
        '1', '2', '3', '4', '5',
      ]);
    }
  });

  it('AC-5.6.2 — a Pattern with a mixed-feel Recipe renders Numbered regardless of preference', () => {
    let p = create();
    expect(effectiveSystem(p, 'takadimi')).toBe('takadimi');
    expect(isForcedNumbered(p)).toBe(false);

    p = setRecipe(p, 0, 1, 'triplet-straight-split');
    expect(effectiveSystem(p, 'takadimi')).toBe('numbered');
    expect(effectiveSystem(p, 'one-e-and-a')).toBe('numbered');
    expect(isForcedNumbered(p)).toBe(true);
  });

  it('AC-5.6.3 — the override is per Pattern and does not change the stored preference', () => {
    const mixed = setRecipe(create(), 0, 0, 'straight-triplet-split');
    const plain = create();
    const preference = 'takadimi';

    expect(effectiveSystem(mixed, preference)).toBe('numbered');
    // The preference itself is untouched, so the next Pattern still uses it.
    expect(preference).toBe('takadimi');
    expect(effectiveSystem(plain, preference)).toBe('takadimi');
  });

  it('AC-5.6.8 — eighth-note Beats label correctly in every system', () => {
    let p = setTimeSignature(create(), 0, '6/8');
    p = setRecipe(p, 0, 0, 'undivided');
    expect(effectiveSystem(p, 'takadimi')).toBe('takadimi');
    expect(labelsFor('undivided', 'eighth', 'one-e-and-a')).toEqual(['1']);
  });

  it('AC-5.6.9 — an unknown system is rejected rather than silently defaulted', () => {
    expect(() => labelsFor('straight-16ths', 'quarter', 'solfege')).toThrow(/Unknown counting system/);
  });

  it('AC-5.6.10 — labels always match the Recipe’s Slot count', () => {
    const cases = [
      ['straight-16ths', 'quarter', 4], ['straight-8ths', 'quarter', 2],
      ['triplet-8ths', 'quarter', 3], ['straight-triplet-split', 'quarter', 5],
      ['triplet-straight-split', 'quarter', 5], ['undivided', 'eighth', 1],
      ['straight-16ths', 'eighth', 2],
    ];
    for (const system of COUNTING_SYSTEMS) {
      for (const [recipe, noteValue, n] of cases) {
        expect(labelsFor(recipe, noteValue, system), `${recipe}/${system}`).toHaveLength(n);
      }
    }
  });

  it('AC-5.6.11 — labels are returned fresh, so a caller cannot corrupt the vocabulary', () => {
    const a = labelsFor('straight-16ths', 'quarter', 'takadimi');
    a[0] = 'XX';
    expect(labelsFor('straight-16ths', 'quarter', 'takadimi')[0]).toBe('ta');
  });

  it("AC-5.6.12 — 1-e-&-a scheme, the leading digit is the Beat's own number", () => {
    const measure = [0, 1, 2, 3].map((beatIndex) =>
      labelsFor('straight-8ths', 'quarter', 'one-e-and-a', beatIndex)
    );
    expect(measure).toEqual([
      ['1', '&'],
      ['2', '&'],
      ['3', '&'],
      ['4', '&'],
    ]);
    // Restarts fresh at 1 for the next Measure.
    expect(labelsFor('straight-8ths', 'quarter', 'one-e-and-a', 0)).toEqual(['1', '&']);
    // Every other system is untouched by beatIndex.
    expect(labelsFor('straight-8ths', 'quarter', 'takadimi', 2)).toEqual(['ta', 'di']);
    expect(labelsFor('straight-8ths', 'quarter', 'numbered', 2)).toEqual(['1', '2']);
  });

  it('AC-5.6.13 — 1-e-&-a scheme, restart per Beat even at eighth-note-Beat granularity', () => {
    const measure = Array.from({ length: 7 }, (_, beatIndex) =>
      labelsFor('straight-16ths', 'eighth', 'one-e-and-a', beatIndex)
    );
    expect(measure).toEqual([
      ['1', '&'], ['2', '&'], ['3', '&'], ['4', '&'],
      ['5', '&'], ['6', '&'], ['7', '&'],
    ]);
  });
});
