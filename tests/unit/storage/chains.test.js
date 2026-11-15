import { describe, it, expect, beforeEach } from 'vitest';
import { useBackingStore, readStore } from '../../../src/storage/keyValue.js';
import * as chains from '../../../src/storage/chains.js';
import * as patterns from '../../../src/storage/patterns.js';
import * as overlays from '../../../src/storage/overlays.js';
import { createChain, addEntry } from '../../../src/core/chain.js';
import { create } from '../../../src/core/pattern.js';

let backing;
beforeEach(() => {
  backing = new Map();
  useBackingStore(backing);
});

const study = (name, patternId) => addEntry(addEntry(createChain(name, patternId), 0, 'up', 2), 0, 'down', 1);

describe('storage/chains', () => {
  it('AC-18.1.4/2 — A saved Chain survives a reload and is listed only on the Pattern it was composed over', () => {
    const saved = chains.upsert(study('Morning study', 'p_1'));
    expect(saved.id).toBe('song_1');
    expect(saved.sections[0].entries).toEqual([
      { fill: 'up', repeats: 2 },
      { fill: 'down', repeats: 1 },
    ]);

    // A reload is a fresh read of the same backing store: nothing is cached in memory.
    useBackingStore(backing);
    expect(chains.findById('song_1')).toEqual(saved);
    expect(JSON.parse(backing.get(chains.KEY)).songs).toHaveLength(1);

    expect(chains.forPattern('p_1').map((s) => s.name)).toEqual(['Morning study']);
    expect(chains.forPattern('p_2')).toEqual([]);
    expect(chains.forPattern('seed:bossa')).toEqual([]);

    // upsert replaces in place; ids are never reused.
    chains.upsert({ ...saved, name: 'Evening study' });
    expect(chains.loadAll()).toHaveLength(1);
    expect(chains.findById('song_1').name).toBe('Evening study');
    const second = chains.upsert(study('Other', 'p_2'));
    expect(second.id).toBe('song_2');
    chains.remove('song_1');
    expect(chains.upsert(study('Third', 'p_2')).id).not.toBe('song_2');

    chains.rename('song_2', 'Renamed');
    expect(chains.findById('song_2').name).toBe('Renamed');
    expect(() => chains.rename('song_99', 'x')).toThrow();
  });

  it('AC-18.1.4/7 — Chains are stored separately from Patterns, ratings, added Tags and Keeps, so nothing that happens to those stores can lose a Chain', () => {
    expect(chains.KEY).toBe('rm.songs.v1');
    expect(chains.KEY).not.toBe(patterns.KEY);
    expect(chains.KEY).not.toBe(overlays.KEY);

    const saved = chains.upsert(study('Study', 'p_1'));
    const raw = backing.get(chains.KEY);

    // Everything that can happen to the other stores.
    patterns.upsert({ ...create('A'), id: 'p_1' });
    patterns.upsert({ ...create('B'), id: 'p_2' });
    overlays.setRating('p_1', 5);
    overlays.setAddedTags('p_1', ['Latin']);
    overlays.setKeptFills('p_1', ['up', 'down']);
    overlays.setKeptFills('p_1', []);
    patterns.remove('p_1');
    patterns.saveAll([]);
    backing.delete(patterns.KEY);
    backing.delete(overlays.KEY);

    expect(backing.get(chains.KEY)).toBe(raw);
    expect(chains.findById(saved.id)).toEqual(saved);
    // And the Chain store carries no Pattern, rating, Tag or Keep of its own.
    const stored = readStore(chains.KEY, { songs: [] });
    expect(Object.keys(stored).sort()).toEqual(['schemaVersion', 'songs']);
  });

  it('AC-18.1.4/5 — Deleting a Pattern that a Chain is composed over is refused with a message naming the Chain or Chains, until they are deleted: the store', () => {
    expect(chains.referencingPattern('p_1')).toEqual([]);
    const a = chains.upsert(study('First study', 'p_1'));
    const b = chains.upsert(study('Second study', 'p_1'));
    chains.upsert(study('Elsewhere', 'p_2'));

    expect(chains.referencingPattern('p_1')).toEqual(['First study', 'Second study']);
    chains.remove(a.id);
    expect(chains.referencingPattern('p_1')).toEqual(['Second study']);
    chains.remove(b.id);
    expect(chains.referencingPattern('p_1')).toEqual([]);
    expect(chains.referencingPattern('p_2')).toEqual(['Elsewhere']);
  });
});
