import { describe, it, expect } from 'vitest';
import {
  recipesFor,
  slotCount,
  subdivisionGroups,
  isMixedFeel,
  isOffered,
  defaultRecipeFor,
} from '../../../src/core/recipes.js';

describe('core/recipes', () => {
  it('AC-1.3.4 — a quarter-note Beat offers exactly five Recipes', () => {
    const ids = recipesFor('quarter').map((r) => r.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids)).toEqual(
      new Set([
        'straight-8ths',
        'straight-16ths',
        'triplet-8ths',
        'straight-triplet-split',
        'triplet-straight-split',
      ])
    );
    // Deliberately absent: a quarter-note Beat cannot be Undivided.
    expect(ids).not.toContain('undivided');
  });

  it('AC-1.3.4 — quarter-note Recipe Slot counts and Subdivision Groups', () => {
    const table = [
      ['straight-16ths', 4, [['straight', [0, 1, 2, 3]]]],
      ['straight-8ths', 2, [['straight', [0, 1]]]],
      ['triplet-8ths', 3, [['triplet', [0, 1, 2]]]],
      ['straight-triplet-split', 5, [['straight', [0, 1]], ['triplet', [2, 3, 4]]]],
      ['triplet-straight-split', 5, [['triplet', [0, 1, 2]], ['straight', [3, 4]]]],
    ];
    for (const [id, slots, groups] of table) {
      expect(slotCount(id, 'quarter'), id).toBe(slots);
      expect(
        subdivisionGroups(id, 'quarter').map((g) => [g.feel, g.slotIndices]),
        id
      ).toEqual(groups);
    }
  });

  it('AC-1.3.5 — an eighth-note Beat offers exactly two Recipes, neither triplet nor mixed', () => {
    const ids = recipesFor('eighth').map((r) => r.id);
    expect(ids).toEqual(['undivided', 'straight-16ths']);
    expect(ids).not.toContain('triplet-8ths');
    for (const id of ids) expect(isMixedFeel(id)).toBe(false);
  });

  it('AC-1.3.5 — eighth-note Recipe Slot counts', () => {
    expect(slotCount('undivided', 'eighth')).toBe(1);
    expect(slotCount('straight-16ths', 'eighth')).toBe(2);
    expect(subdivisionGroups('undivided', 'eighth')).toEqual([
      { feel: 'straight', slotIndices: [0] },
    ]);
  });

  it('AC-1.3.4 — straight-16ths resolves per Beat note value, not per id', () => {
    expect(slotCount('straight-16ths', 'quarter')).toBe(4);
    expect(slotCount('straight-16ths', 'eighth')).toBe(2);
  });

  it('AC-1.3.4 — only the two split Recipes are mixed-feel', () => {
    expect(isMixedFeel('straight-triplet-split')).toBe(true);
    expect(isMixedFeel('triplet-straight-split')).toBe(true);
    for (const id of ['straight-16ths', 'straight-8ths', 'triplet-8ths', 'undivided']) {
      expect(isMixedFeel(id), id).toBe(false);
    }
  });

  it('AC-1.3.1 — a quarter-note Beat defaults to Straight 16ths, four Slots', () => {
    expect(defaultRecipeFor('quarter')).toBe('straight-16ths');
    expect(slotCount(defaultRecipeFor('quarter'), 'quarter')).toBe(4);
  });

  it('AC-1.3.2 — an eighth-note Beat defaults to Straight 16ths, two Slots', () => {
    expect(defaultRecipeFor('eighth')).toBe('straight-16ths');
    expect(slotCount(defaultRecipeFor('eighth'), 'eighth')).toBe(2);
  });

  it('AC-1.3.5 — a Recipe from the wrong menu is rejected, not silently accepted', () => {
    expect(isOffered('undivided', 'quarter')).toBe(false);
    expect(isOffered('triplet-8ths', 'eighth')).toBe(false);
    expect(() => slotCount('undivided', 'quarter')).toThrow(/not offered/);
    expect(() => slotCount('triplet-8ths', 'eighth')).toThrow(/not offered/);
  });
});
