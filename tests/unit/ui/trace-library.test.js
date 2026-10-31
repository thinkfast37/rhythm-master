import { describe, it, expect } from 'vitest';
import { buildEntries, allTags } from '../../../src/ui/library.js';
import { create } from '../../../src/core/pattern.js';

const p = (name, extra = {}) => ({ ...create(name), id: name.toLowerCase(), ...extra });

describe('ui/library — Tag-filter pills', () => {
  it('AC-5.3.8 — Tag-filter pill ordering: the six Tags of the criterion, in its exact order', () => {
    // Tags in use: custom, percussive, melodic, swing, "hard", "warmup" — and
    // nothing else, so every owned Pattern (no `built-in`).
    const swung = p('Swung');
    swung.measures[0].beats[0].swing = { 0: 25 };
    const entries = buildEntries(
      [],
      [
        { ...p('Drum'), tags: ['warmup'] },
        { ...p('Tune'), soundMode: 'melodic', key: 'C', tags: ['hard'] },
        swung,
      ]
    );
    expect(allTags(entries).map((t) => t.name)).toEqual([
      'custom',
      'melodic',
      'percussive',
      'swing',
      'hard',
      'warmup',
    ]);
    expect(allTags(entries).map((t) => t.automatic)).toEqual([true, true, true, true, false, false]);
  });
});
