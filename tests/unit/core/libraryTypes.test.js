import { describe, it, expect } from 'vitest';
import { LIBRARY_TYPES, patternType, chosenTypes, showsType, toggleType } from '../../../src/core/libraryTypes.js';
import { create } from '../../../src/core/pattern.js';
import { setProgression } from '../../../src/core/harmony.js';
import seed from '../../../data/seed-patterns.json';

describe('core/libraryTypes', () => {
  it('AC-5.7.1/4 — A Percussive Pattern is of the type Percussive, a Melodic Pattern that carries a progression is a Chord progression, and a Melodic Pattern without one is a Melodic composition', () => {
    const rhythm = create('Rhythm');
    expect(patternType(rhythm)).toBe('percussive');
    const melody = { ...rhythm, soundMode: 'melodic', key: 'C' };
    expect(patternType(melody)).toBe('melodic');
    const changes = setProgression(melody, 'I-IV-V');
    expect(patternType(changes)).toBe('progression');
    // Worked out from the Pattern each time: back to Percussive, the progression it still carries decides nothing.
    expect(patternType({ ...changes, soundMode: 'percussive' })).toBe('percussive');
    // Every shipped Pattern has exactly one of the three, and the library holds all three.
    const types = seed.patterns.map(patternType);
    expect(types.every((t) => ['percussive', 'melodic', 'progression'].includes(t))).toBe(true);
    expect(new Set(types).size).toBe(3);
    // The types the library names, in the order of its pills.
    expect(LIBRARY_TYPES.map((t) => [t.id, t.label])).toEqual([
      ['percussive', 'Percussive'],
      ['melodic', 'Melodic composition'],
      ['progression', 'Chord progression'],
      ['chain', 'Chain'],
      ['section', 'Section'],
    ]);
  });

  it('AC-5.7.1/2 — Choosing a type shows only the entries of that type in every group, choosing another adds its entries, choosing a pressed one takes its entries away again, and All clears the choice: the rule', () => {
    // Nothing chosen: every type shows.
    for (const { id } of LIBRARY_TYPES) expect(showsType([], id)).toBe(true);
    let chosen = toggleType([], 'section');
    expect(chosen).toEqual(['section']);
    expect(showsType(chosen, 'section')).toBe(true);
    expect(showsType(chosen, 'percussive')).toBe(false);
    expect(showsType(chosen, 'chain')).toBe(false);
    // Another adds to it, kept in the pills' order whatever order they were chosen in.
    chosen = toggleType(chosen, 'percussive');
    expect(chosen).toEqual(['percussive', 'section']);
    expect(showsType(chosen, 'percussive')).toBe(true);
    expect(showsType(chosen, 'progression')).toBe(false);
    // A pressed one is taken away again; the last one gone, everything shows.
    chosen = toggleType(chosen, 'section');
    expect(chosen).toEqual(['percussive']);
    expect(toggleType(chosen, 'percussive')).toEqual([]);
    // All clears the choice, and a type the library does not know chooses nothing.
    expect(toggleType(['chain', 'section'], null)).toEqual([]);
    expect(chosenTypes(['chain', 'opera', 'section'])).toEqual(['chain', 'section']);
    expect(chosenTypes(undefined)).toEqual([]);
  });
});
