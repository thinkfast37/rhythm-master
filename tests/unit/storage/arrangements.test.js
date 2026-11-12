import { describe, it, expect, beforeEach } from 'vitest';
import { useBackingStore } from '../../../src/storage/keyValue.js';
import * as arrangements from '../../../src/storage/arrangements.js';
import * as songs from '../../../src/storage/songs.js';
import * as patterns from '../../../src/storage/patterns.js';
import * as overlays from '../../../src/storage/overlays.js';
import { createArrangement, addLayer } from '../../../src/core/arrangement.js';
import { create } from '../../../src/core/pattern.js';

let backing;
beforeEach(() => {
  backing = new Map();
  useBackingStore(backing);
});

const bed = (name, compositionId, layerIds) => layerIds.reduce((a, id) => addLayer(a, id), createArrangement(name, compositionId));

describe('storage/arrangements', () => {
  it('AC-19.11.4/7 — Arrangements are stored in `rm.arrangements.v1`, apart from Patterns, overlays, Songs, settings and Local Metadata, and the whole-library backup carries the store as it does every other', () => {
    expect(arrangements.KEY).toBe('rm.arrangements.v1');
    const saved = arrangements.upsert(bed('Morning bed', 'p_1', ['s_1', 'p_2']));
    expect(saved.id).toBe('arr_1');
    expect(saved.layers).toEqual([
      { patternId: 's_1', muted: false },
      { patternId: 'p_2', muted: false },
    ]);
    // Its own key, and nothing in any other store.
    expect([...backing.keys()]).toEqual([arrangements.KEY]);
    patterns.upsert({ ...create('Mine'), id: 'p_1' });
    overlays.setRating('s_1', 4);
    songs.upsert({ name: 'Verse', sections: [{ patternId: 'p_1', entries: [] }] });
    expect(JSON.parse(backing.get(arrangements.KEY)).arrangements).toHaveLength(1);
    // A reload is a fresh read of the same backing store.
    useBackingStore(backing);
    expect(arrangements.findById('arr_1')).toEqual(saved);
    // Removing a Pattern or a Song touches no Arrangement.
    patterns.remove('p_1');
    songs.remove('song_1');
    expect(arrangements.loadAll()).toHaveLength(1);
    // upsert replaces in place; ids are never reused; rename keeps the id.
    arrangements.upsert({ ...saved, name: 'Evening bed' });
    expect(arrangements.loadAll()).toHaveLength(1);
    expect(arrangements.rename('arr_1', 'Night bed').name).toBe('Night bed');
    expect(arrangements.findById('arr_1').name).toBe('Night bed');
    expect(arrangements.upsert(bed('Other', 'p_3', ['s_2'])).id).toBe('arr_2');
    arrangements.remove('arr_1');
    expect(arrangements.loadAll().map((a) => a.id)).toEqual(['arr_2']);
    expect(arrangements.upsert(bed('Third', 'p_4', ['s_3'])).id).toBe('arr_3');
    expect(() => arrangements.rename('arr_9', 'x')).toThrow(/No Arrangement/);
  });

  it('AC-19.11.4/5 — Deleting a Pattern that an Arrangement uses, as its composition or as a layer, is refused with a message naming the Arrangement or Arrangements, until they are deleted: the store names them', () => {
    arrangements.upsert(bed('Bed A', 'p_1', ['s_1']));
    arrangements.upsert(bed('Bed B', 'p_2', ['s_1', 'p_1']));
    expect(arrangements.referencingPattern('p_1')).toEqual(['Bed A', 'Bed B']);
    expect(arrangements.referencingPattern('s_1')).toEqual(['Bed A', 'Bed B']);
    expect(arrangements.referencingPattern('p_2')).toEqual(['Bed B']);
    expect(arrangements.referencingPattern('p_9')).toEqual([]);
    arrangements.remove('arr_1');
    expect(arrangements.referencingPattern('p_1')).toEqual(['Bed B']);
  });
});
