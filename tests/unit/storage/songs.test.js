import { describe, it, expect, beforeEach } from 'vitest';
import { useBackingStore, readStore } from '../../../src/storage/keyValue.js';
import * as songs from '../../../src/storage/songs.js';
import * as patterns from '../../../src/storage/patterns.js';
import * as overlays from '../../../src/storage/overlays.js';
import { createSong, addEntry } from '../../../src/core/song.js';
import { create } from '../../../src/core/pattern.js';

let backing;
beforeEach(() => {
  backing = new Map();
  useBackingStore(backing);
});

const study = (name, patternId) => addEntry(addEntry(createSong(name, patternId), 0, 'up', 2), 0, 'down', 1);

describe('storage/songs', () => {
  it('AC-18.1.4/2 — A saved Song survives a reload and is listed only on the Pattern it was composed over', () => {
    const saved = songs.upsert(study('Morning study', 'p_1'));
    expect(saved.id).toBe('song_1');
    expect(saved.sections[0].entries).toEqual([
      { fill: 'up', repeats: 2 },
      { fill: 'down', repeats: 1 },
    ]);

    // A reload is a fresh read of the same backing store: nothing is cached in memory.
    useBackingStore(backing);
    expect(songs.findById('song_1')).toEqual(saved);
    expect(JSON.parse(backing.get(songs.KEY)).songs).toHaveLength(1);

    expect(songs.forPattern('p_1').map((s) => s.name)).toEqual(['Morning study']);
    expect(songs.forPattern('p_2')).toEqual([]);
    expect(songs.forPattern('seed:bossa')).toEqual([]);

    // upsert replaces in place; ids are never reused.
    songs.upsert({ ...saved, name: 'Evening study' });
    expect(songs.loadAll()).toHaveLength(1);
    expect(songs.findById('song_1').name).toBe('Evening study');
    const second = songs.upsert(study('Other', 'p_2'));
    expect(second.id).toBe('song_2');
    songs.remove('song_1');
    expect(songs.upsert(study('Third', 'p_2')).id).not.toBe('song_2');

    songs.rename('song_2', 'Renamed');
    expect(songs.findById('song_2').name).toBe('Renamed');
    expect(() => songs.rename('song_99', 'x')).toThrow();
  });

  it('AC-18.1.4/7 — Songs are stored separately from Patterns, ratings, added Tags and Keeps, so nothing that happens to those stores can lose a Song', () => {
    expect(songs.KEY).toBe('rm.songs.v1');
    expect(songs.KEY).not.toBe(patterns.KEY);
    expect(songs.KEY).not.toBe(overlays.KEY);

    const saved = songs.upsert(study('Study', 'p_1'));
    const raw = backing.get(songs.KEY);

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

    expect(backing.get(songs.KEY)).toBe(raw);
    expect(songs.findById(saved.id)).toEqual(saved);
    // And the Song store carries no Pattern, rating, Tag or Keep of its own.
    const stored = readStore(songs.KEY, { songs: [] });
    expect(Object.keys(stored).sort()).toEqual(['schemaVersion', 'songs']);
  });

  it('AC-18.1.4/5 — Deleting a Pattern that a Song is composed over is refused with a message naming the Song or Songs, until they are deleted: the store', () => {
    expect(songs.referencingPattern('p_1')).toEqual([]);
    const a = songs.upsert(study('First study', 'p_1'));
    const b = songs.upsert(study('Second study', 'p_1'));
    songs.upsert(study('Elsewhere', 'p_2'));

    expect(songs.referencingPattern('p_1')).toEqual(['First study', 'Second study']);
    songs.remove(a.id);
    expect(songs.referencingPattern('p_1')).toEqual(['Second study']);
    songs.remove(b.id);
    expect(songs.referencingPattern('p_1')).toEqual([]);
    expect(songs.referencingPattern('p_2')).toEqual(['Elsewhere']);
  });
});
