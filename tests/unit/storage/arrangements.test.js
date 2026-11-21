import { describe, it, expect, beforeEach } from 'vitest';
import { useBackingStore } from '../../../src/storage/keyValue.js';
import * as arrangements from '../../../src/storage/arrangements.js';
import * as sections from '../../../src/storage/sections.js';
import * as patterns from '../../../src/storage/patterns.js';
import { createArrangement, addToPalette, addEntry } from '../../../src/core/arrangement.js';
import { create } from '../../../src/core/pattern.js';

let backing;
beforeEach(() => {
  backing = new Map();
  useBackingStore(backing);
});

const piece = (name) => addEntry(addToPalette(addToPalette(createArrangement(name), 'section', 'arr_1'), 'pattern', 's_21'), 'pattern', 's_21', 'Intro', 2);

describe('storage/arrangements', () => {
  it('AC-20.1.4/6 — Arrangements are stored in `rm.arrangements.v2`, apart from every other store, and an Arrangement holds the ids of what it is made of and never a copy', () => {
    expect(arrangements.KEY).toBe('rm.arrangements.v2');
    const saved = arrangements.upsert(piece('Sunday song'));
    expect(saved.id).toBe('arrg_1');
    // Its own key, and nothing in any other store.
    expect([...backing.keys()]).toEqual([arrangements.KEY]);
    const stored = JSON.parse(backing.get(arrangements.KEY));
    expect(Object.keys(stored).sort()).toEqual(['arrangements', 'schemaVersion']);
    // Ids and the Arrangement's own words, and nothing of what they name.
    expect(stored.arrangements[0]).toEqual({
      id: 'arrg_1',
      name: 'Sunday song',
      palette: [
        { kind: 'section', id: 'arr_1' },
        { kind: 'pattern', id: 's_21' },
      ],
      entries: [{ kind: 'pattern', id: 's_21', name: 'Intro', repeats: 2 }],
    });
    // The key Sections once had is not this one: reading Sections moves nothing of an Arrangement.
    expect(arrangements.KEY).not.toBe(sections.LEGACY_KEY);
    expect(sections.loadAll()).toEqual([]);
    expect(arrangements.loadAll()).toHaveLength(1);
    // Other stores written, this one untouched.
    patterns.upsert({ ...create('Mine'), id: 'p_1' });
    expect(JSON.parse(backing.get(arrangements.KEY)).arrangements).toHaveLength(1);
  });

  it('AC-20.1.4/3 — A saved Arrangement survives a reload, and can be renamed and deleted, deletion asking first: the store', () => {
    const saved = arrangements.upsert(piece('Sunday song'));
    // A reload is a fresh read of the same backing store.
    useBackingStore(backing);
    expect(arrangements.findById('arrg_1')).toEqual(saved);
    // Nothing unsound is written: no name, or repeats out of range.
    expect(() => arrangements.upsert({ ...saved, name: '' })).toThrow(/needs a name/);
    expect(() => arrangements.upsert({ ...saved, entries: [{ kind: 'pattern', id: 's_21', name: 'x', repeats: 40 }] })).toThrow(/repeats/);
    expect(arrangements.findById('arrg_1')).toEqual(saved);
    // upsert replaces in place; rename keeps the id.
    arrangements.upsert({ ...saved, entries: [] });
    expect(arrangements.loadAll()).toHaveLength(1);
    expect(arrangements.findById('arrg_1').entries).toEqual([]);
    expect(arrangements.rename('arrg_1', 'Monday song').id).toBe('arrg_1');
    expect(arrangements.findById('arrg_1').name).toBe('Monday song');
    expect(() => arrangements.rename('arrg_9', 'x')).toThrow();
    const second = arrangements.upsert(piece('Other'));
    expect(second.id).toBe('arrg_2');
    arrangements.remove('arrg_1');
    expect(arrangements.loadAll().map((a) => a.id)).toEqual(['arrg_2']);
    expect(arrangements.findById('arrg_1')).toBeNull();
  });

  it('AC-20.1.4/5 — Deleting a Pattern, a Section or a Chain that an Arrangement uses is refused with a message naming the Arrangement or Arrangements, until they no longer use it: which Arrangements name an item', () => {
    expect(arrangements.referencing('pattern', 's_21')).toEqual([]);
    arrangements.upsert(piece('First'));
    arrangements.upsert(piece('Second'));
    arrangements.upsert(addToPalette(createArrangement('Elsewhere'), 'chain', 'song_2'));
    expect(arrangements.referencing('pattern', 's_21')).toEqual(['First', 'Second']);
    expect(arrangements.referencing('section', 'arr_1')).toEqual(['First', 'Second']);
    expect(arrangements.referencing('chain', 'song_2')).toEqual(['Elsewhere']);
    expect(arrangements.referencing('pattern', 'arr_1')).toEqual([]);
    arrangements.remove('arrg_1');
    expect(arrangements.referencing('pattern', 's_21')).toEqual(['Second']);
  });
});
