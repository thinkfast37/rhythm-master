import { describe, it, expect, beforeEach } from 'vitest';
import { useBackingStore } from '../../../src/storage/keyValue.js';
import * as sections from '../../../src/storage/sections.js';
import * as songs from '../../../src/storage/songs.js';
import * as patterns from '../../../src/storage/patterns.js';
import * as overlays from '../../../src/storage/overlays.js';
import { createSection, addLayer } from '../../../src/core/section.js';
import { create } from '../../../src/core/pattern.js';

let backing;
beforeEach(() => {
  backing = new Map();
  useBackingStore(backing);
});

const bed = (name, compositionId, layerIds) => layerIds.reduce((a, id) => addLayer(a, id), createSection(name, compositionId));

describe('storage/sections', () => {
  it('AC-19.11.4/7 — Sections are stored in `rm.sections.v1`, apart from Patterns, overlays, Songs, settings and Local Metadata, and the whole-library backup carries the store as it does every other', () => {
    expect(sections.KEY).toBe('rm.sections.v1');
    const saved = sections.upsert(bed('Morning bed', 'p_1', ['s_1', 'p_2']));
    expect(saved.id).toBe('arr_1');
    expect(saved.layers).toEqual([
      { patternId: 's_1', muted: false },
      { patternId: 'p_2', muted: false },
    ]);
    // Its own key, and nothing in any other store.
    expect([...backing.keys()]).toEqual([sections.KEY]);
    patterns.upsert({ ...create('Mine'), id: 'p_1' });
    overlays.setRating('s_1', 4);
    songs.upsert({ name: 'Verse', sections: [{ patternId: 'p_1', entries: [] }] });
    expect(JSON.parse(backing.get(sections.KEY)).sections).toHaveLength(1);
    // A reload is a fresh read of the same backing store.
    useBackingStore(backing);
    expect(sections.findById('arr_1')).toEqual(saved);
    // Removing a Pattern or a Song touches no Section.
    patterns.remove('p_1');
    songs.remove('song_1');
    expect(sections.loadAll()).toHaveLength(1);
    // upsert replaces in place; ids are never reused; rename keeps the id.
    sections.upsert({ ...saved, name: 'Evening bed' });
    expect(sections.loadAll()).toHaveLength(1);
    expect(sections.rename('arr_1', 'Night bed').name).toBe('Night bed');
    expect(sections.findById('arr_1').name).toBe('Night bed');
    expect(sections.upsert(bed('Other', 'p_3', ['s_2'])).id).toBe('arr_2');
    sections.remove('arr_1');
    expect(sections.loadAll().map((a) => a.id)).toEqual(['arr_2']);
    expect(sections.upsert(bed('Third', 'p_4', ['s_3'])).id).toBe('arr_3');
    expect(() => sections.rename('arr_9', 'x')).toThrow(/No Section/);
  });

  it('AC-19.11.4/5 — Deleting a Pattern that a Section uses, as its composition or as a layer, is refused with a message naming the Section or Sections, until they are deleted: the store names them', () => {
    sections.upsert(bed('Bed A', 'p_1', ['s_1']));
    sections.upsert(bed('Bed B', 'p_2', ['s_1', 'p_1']));
    expect(sections.referencingPattern('p_1')).toEqual(['Bed A', 'Bed B']);
    expect(sections.referencingPattern('s_1')).toEqual(['Bed A', 'Bed B']);
    expect(sections.referencingPattern('p_2')).toEqual(['Bed B']);
    expect(sections.referencingPattern('p_9')).toEqual([]);
    sections.remove('arr_1');
    expect(sections.referencingPattern('p_1')).toEqual(['Bed B']);
  });

  it('AC-19.11.4/8 — What was saved under `rm.arrangements.v1` is moved to `rm.sections.v1` on load with every entry kept as it was and the old store cleared, and a backup made before the move restores its entries as Sections', () => {
    const old = [
      { id: 'arr_1', name: 'Morning bed', compositionId: 'p_1', instrument: 'sax', volume: 60, active: 1, layers: [{ patternId: 's_1', muted: true, instrument: 'bass', volume: 50 }] },
      { id: 'arr_4', name: 'Evening bed', compositionId: 'p_2', layers: [] },
    ];
    backing.set(sections.LEGACY_KEY, JSON.stringify({ schemaVersion: 1, arrangements: old }));
    expect(sections.LEGACY_KEY).toBe('rm.arrangements.v1');
    // The first read moves it: every entry as it was, under the new key alone.
    expect(sections.loadAll()).toEqual(old);
    expect([...backing.keys()]).toEqual([sections.KEY]);
    expect(JSON.parse(backing.get(sections.KEY))).toEqual({ schemaVersion: 1, sections: old });
    // A reload reads the same, and the next id carries on past the old ones.
    useBackingStore(backing);
    expect(sections.findById('arr_4').name).toBe('Evening bed');
    expect(sections.upsert(bed('Third', 'p_3', ['s_2'])).id).toBe('arr_3');
  });

  it('AC-19.11.4/8 — What was saved under `rm.arrangements.v1` is moved to `rm.sections.v1` on load with every entry kept as it was and the old store cleared, and a backup made before the move restores its entries as Sections: an entry is never dropped', () => {
    // Both stores present, sharing an id: the old entry is kept under the next free one.
    sections.upsert(bed('New one', 'p_9', ['s_9']));
    backing.set(sections.LEGACY_KEY, JSON.stringify({ schemaVersion: 1, arrangements: [{ id: 'arr_1', name: 'Old one', compositionId: 'p_1', layers: [] }] }));
    const all = sections.loadAll();
    expect(all.map((a) => a.name)).toEqual(['New one', 'Old one']);
    expect(new Set(all.map((a) => a.id)).size).toBe(2);
    expect(backing.has(sections.LEGACY_KEY)).toBe(false);
    // An old store that cannot be read is left exactly where it is.
    backing.set(sections.LEGACY_KEY, '{not json');
    expect(sections.loadAll()).toHaveLength(2);
    expect(backing.get(sections.LEGACY_KEY)).toBe('{not json');
  });
});
