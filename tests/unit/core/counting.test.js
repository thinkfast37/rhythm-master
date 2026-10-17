import { describe, it, expect } from 'vitest';
import {
  COUNTING_SYSTEMS,
  COUNTING_LABELS,
  labelsFor,
  measureLabels,
  effectiveSystem,
  isForcedNumbered,
} from '../../../src/core/counting.js';
import { create, setRecipe, setTimeSignature, cycleAccent } from '../../../src/core/pattern.js';

/** One Measure at a meter, every Beat on one Recipe (the meter's default when omitted). */
function measureOf(timeSignature, recipe = null) {
  let p = setTimeSignature(create(), 0, timeSignature);
  if (recipe) p.measures[0].beats.forEach((_, b) => { p = setRecipe(p, 0, b, recipe); });
  return p;
}

/** The (Beat, Slot) of a 1-based pulse across the Measure. */
function at(p, pulse) {
  let n = pulse - 1;
  for (let b = 0; b < p.measures[0].beats.length; b++) {
    const slots = p.measures[0].beats[b].slots.length;
    if (n < slots) return [b, n];
    n -= slots;
  }
  throw new Error(`No pulse ${pulse}`);
}

/** Two taps from off: the default, then one level above it — a raised accent. */
function raise(p, ...pulses) {
  for (const pulse of pulses) {
    const [b, s] = at(p, pulse);
    p = cycleAccent(cycleAccent(p, 0, b, s), 0, b, s);
  }
  return p;
}

/** The Measure's pulse-tracking labels as groups: '1234 2234'. */
function counted(p) {
  return measureLabels(p.measures[0], 'numbered').flat().join('');
}
function groups(text) {
  return text.replace(/ /g, '');
}

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

  it('a mixed-feel Recipe has no syllable vocabulary, so it counts by pulse whatever the system', () => {
    for (const system of COUNTING_SYSTEMS) {
      expect(labelsFor('straight-triplet-split', 'quarter', system), system).toEqual([
        '1', '2', '2', '2', '3',
      ]);
      expect(labelsFor('triplet-straight-split', 'quarter', system), system).toEqual([
        '1', '2', '3', '2', '2',
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

  it('eighth-note Beats label correctly in every system', () => {
    let p = setTimeSignature(create(), 0, '6/8');
    p = setRecipe(p, 0, 0, 'undivided');
    expect(effectiveSystem(p, 'takadimi')).toBe('takadimi');
    expect(labelsFor('undivided', 'eighth', 'one-e-and-a')).toEqual(['1']);
  });

  it('an unknown system is rejected rather than silently defaulted', () => {
    expect(() => labelsFor('straight-16ths', 'quarter', 'solfege')).toThrow(/Unknown counting system/);
    expect(() => measureLabels(create().measures[0], 'solfege')).toThrow(/Unknown counting system/);
  });

  it('labels always match the Recipe’s Slot count', () => {
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

  it('labels are returned fresh, so a caller cannot corrupt the vocabulary', () => {
    const a = labelsFor('straight-16ths', 'quarter', 'takadimi');
    a[0] = 'XX';
    expect(labelsFor('straight-16ths', 'quarter', 'takadimi')[0]).toBe('ta');
  });

  describe('pulse tracking (AC-5.6.7 … AC-5.6.11)', () => {
    it('the picker shows Numbered as Pulse tracking', () => {
      expect(COUNTING_LABELS.numbered).toBe('Pulse tracking');
    });

    it('AC-5.6.7/1 — A 4/4 Measure of Straight 16ths with default accents reads 1-2-3-4, 2-2-3-4, 3-2-3-4, 4-2-3-4', () => {
      expect(counted(measureOf('4/4'))).toBe(groups('1234 2234 3234 4234'));
      // Sounding every Slot at its default changes nothing: a default is not a stress.
      let p = measureOf('4/4');
      for (let pulse = 1; pulse <= 16; pulse++) {
        const [b, s] = at(p, pulse);
        p = cycleAccent(p, 0, b, s);
      }
      expect(counted(p)).toBe(groups('1234 2234 3234 4234'));
    });

    it('AC-5.6.7/2 — A 4/4 Measure of Straight 8ths reads 1-2-3-4, 2-2-3-4: two-Slot Beats are not counted alone', () => {
      expect(counted(measureOf('4/4', 'straight-8ths'))).toBe(groups('1234 2234'));
    });

    it('AC-5.6.7/3 — A 2/4 Measure of Straight 8ths reads 1-2-3-4, one group across both Beats', () => {
      expect(counted(measureOf('2/4', 'straight-8ths'))).toBe(groups('1234'));
    });

    it('AC-5.6.7/4 — The groups restart at 1 for every Measure', () => {
      const p = measureOf('4/4');
      const second = { ...p.measures[0] };
      expect(measureLabels(second, 'numbered').flat().join('')).toBe(groups('1234 2234 3234 4234'));
      // The syllable systems are untouched by the Measure-level entry point.
      expect(measureLabels(p.measures[0], 'takadimi')[1]).toEqual(['ta', 'ka', 'di', 'mi']);
      expect(measureLabels(p.measures[0], 'one-e-and-a')[1]).toEqual(['2', 'e', '&', 'a']);
    });

    it('AC-5.6.8/1 — A 7/8 Measure of Undivided Beats with nothing stressed reads 1-2-3-4, 2-2-3', () => {
      expect(counted(measureOf('7/8', 'undivided'))).toBe(groups('1234 223'));
    });

    it('AC-5.6.8/2 — A 5/4 Measure of Straight 8ths with nothing stressed reads 1-2-3-4, 2-2-3-4, 3-2', () => {
      expect(counted(measureOf('5/4', 'straight-8ths'))).toBe(groups('1234 2234 32'));
      // And never past 4 in the other long meters: 6/4 and 7/4 in 8ths, 7/4 in 16ths.
      expect(counted(measureOf('6/4', 'straight-8ths'))).toBe(groups('1234 2234 3234'));
      expect(counted(measureOf('7/4', 'straight-8ths'))).toBe(groups('1234 2234 3234 42'));
      expect(counted(measureOf('7/4'))).toBe(groups('1234 2234 3234 4234 5234 6234 7234'));
    });

    it('AC-5.6.8/3 — Which Slots sound does not change the groups: a 4/4 Measure of Straight 16ths sounding only the downbeat and the last 16th still reads 1-2-3-4, 2-2-3-4, 3-2-3-4, 4-2-3-4', () => {
      let p = measureOf('4/4');
      p = cycleAccent(p, 0, 0, 0);
      p = cycleAccent(p, 0, 3, 3);
      expect(counted(p)).toBe(groups('1234 2234 3234 4234'));
    });

    it('AC-5.6.9/1 — A 4/4 Measure of Straight 16ths with pulses 1, 4, 7, 10 and 13 raised reads 1-2-3, 2-2-3, 3-2-3, 4-2-3, 5-2-3-4', () => {
      // Pyramid Song. Pulse 1 is the downbeat and begins a group whatever its accent.
      let p = cycleAccent(measureOf('4/4'), 0, 0, 0);
      p = raise(p, 4, 7, 10, 13);
      expect(counted(p)).toBe(groups('123 223 323 423 5234'));
    });

    it('AC-5.6.9/2 — A 7/8 Measure of Undivided Beats with pulse 4 raised reads 1-2-3, 2-2-3-4', () => {
      expect(counted(raise(measureOf('7/8', 'undivided'), 4))).toBe(groups('123 2234'));
      // A stress one pulse in makes a group of one; the six after it divide evenly.
      expect(counted(raise(measureOf('7/8', 'undivided'), 2))).toBe(groups('1 223 323'));
    });

    it('AC-5.6.9/3 — A raised Slot that is switched off is not a stress: the groups are those of the unstressed Measure', () => {
      const p = raise(measureOf('4/4'), 4);
      // Three pulses, then the thirteen after the stress: the division that
      // misses the fewest Beat starts, in the fewest groups, larger first.
      expect(counted(p)).toBe(groups('123 223 32 4234 5234'));
      p.measures[0].beats[0].slots[3] = { on: false, accent: 2 };
      expect(counted(p)).toBe(groups('1234 2234 3234 4234'));
    });

    it('AC-5.6.9/4 — A lowered accent is not a stress: Beat 3 of a 4/4 Measure of Straight 16ths taken from Medium down to Weak still reads 1-2-3-4, 2-2-3-4, 3-2-3-4, 4-2-3-4', () => {
      // Three taps from off: Medium (the default), Strong, Weak.
      let p = measureOf('4/4');
      for (let i = 0; i < 3; i++) p = cycleAccent(p, 0, 2, 0);
      expect(p.measures[0].beats[2].slots[0].accent).toBe(1);
      expect(counted(p)).toBe(groups('1234 2234 3234 4234'));
    });

    it('AC-5.6.10/1 — 12/8 in Undivided Beats reads 1-2-3, 2-2-3, 3-2-3, 4-2-3; 6/8 reads 1-2-3, 2-2-3; 9/8 reads 1-2-3, 2-2-3, 3-2-3', () => {
      expect(counted(measureOf('12/8', 'undivided'))).toBe(groups('123 223 323 423'));
      expect(counted(measureOf('6/8', 'undivided'))).toBe(groups('123 223'));
      expect(counted(measureOf('9/8', 'undivided'))).toBe(groups('123 223 323'));
    });

    it('AC-5.6.10/2 — A 4/4 Measure of Triplet 8ths reads 1-2-3, 2-2-3, 3-2-3, 4-2-3: the groups break on the Beats, not in fours', () => {
      expect(counted(measureOf('4/4', 'triplet-8ths'))).toBe(groups('123 223 323 423'));
    });

    it('AC-5.6.10/3 — A 3/4 Measure of Straight 16ths reads 1-2-3-4, 2-2-3-4, 3-2-3-4', () => {
      expect(counted(measureOf('3/4'))).toBe(groups('1234 2234 3234'));
    });

    it('AC-5.6.10/4 — A 7/8 Measure of two-Slot Beats reads 1-2-3-4, 2-2-3-4, 3-2-3-4, 4-2', () => {
      expect(counted(measureOf('7/8', 'straight-16ths'))).toBe(groups('1234 2234 3234 42'));
    });

    it('AC-5.6.11 — Pulse tracking counts a mixed-feel Recipe by its halves', () => {
      let p = setRecipe(measureOf('1/4'), 0, 0, 'straight-triplet-split');
      expect(counted(p)).toBe(groups('12 223'));
      expect(measureLabels(p.measures[0], 'takadimi').flat().join('')).toBe(groups('12 223'));
      p = setRecipe(measureOf('1/4'), 0, 0, 'triplet-straight-split');
      expect(counted(p)).toBe(groups('123 22'));
      // In a full Measure the halves still break the count, whatever the preference.
      p = setRecipe(measureOf('4/4'), 0, 1, 'straight-triplet-split');
      expect(measureLabels(p.measures[0], 'one-e-and-a').flat().join('')).toBe(groups('1234 22 323 4234 5234'));
    });
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
