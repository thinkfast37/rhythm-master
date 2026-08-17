import { describe, it, expect } from 'vitest';
import {
  buildEntries,
  sortEntries,
  filterEntries,
  allTags,
  neighbours,
  toggleTag,
  selectedTags,
} from '../../../src/ui/library.js';
import { create } from '../../../src/core/pattern.js';

const p = (name, extra = {}) => ({ ...create(name), id: name.toLowerCase(), ...extra });

describe('ui/library', () => {
  it('AC-5.1.1 — shipped and owned Patterns appear in one list', () => {
    const entries = buildEntries([p('Alpha')], [p('Beta')]);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.owned)).toEqual([false, true]);
  });

  it('AC-5.1.2 — the list sorts alphabetically by name', () => {
    const entries = buildEntries([p('Zulu'), p('Alpha')], [p('Mike')]);
    expect(sortEntries(entries).map((e) => e.pattern.name)).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('AC-5.1.3 — Patterns sharing a name sort by rating, highest first', () => {
    const entries = buildEntries(
      [{ ...p('Groove'), id: 'low', rating: 1 }, { ...p('Groove'), id: 'high', rating: 5 }],
      []
    );
    expect(sortEntries(entries).map((e) => e.pattern.id)).toEqual(['high', 'low']);
  });

  it('AC-5.1.4 — sorting is case-insensitive', () => {
    const entries = buildEntries([p('banjo'), p('Apple')], []);
    expect(sortEntries(entries).map((e) => e.pattern.name)).toEqual(['Apple', 'banjo']);
  });

  it('AC-5.1.5 — every shipped and owned Pattern is listed, none dropped', () => {
    const entries = buildEntries([p('A'), p('B'), p('C')], [p('D')]);
    expect(sortEntries(entries)).toHaveLength(4);
  });

  it('AC-5.1.6 — a Pattern carries its provenance for display', () => {
    const entries = buildEntries([p('Shipped')], [p('Mine')]);
    expect(entries.find((e) => e.pattern.name === 'Shipped').owned).toBe(false);
    expect(entries.find((e) => e.pattern.name === 'Mine').owned).toBe(true);
  });

  it('AC-5.3.1 — automatic Tags mark provenance: built-in versus custom', () => {
    const entries = buildEntries([p('Shipped')], [p('Mine')]);
    expect(entries[0].autoTags).toEqual(['built-in', 'percussive']);
    expect(entries[1].autoTags).toEqual(['custom', 'percussive']);
    expect(entries[1].pattern.tags).toEqual([]);
  });

  it('AC-5.3.2 — a built-in Pattern’s own Tags are locked; Tags you add to it are not', () => {
    const shipped = { ...p('Bossa'), tags: ['Latin'] };
    const entries = buildEntries([shipped], [], (id) => (id === 'bossa' ? ['warmup'] : []));

    expect(entries[0].lockedTags).toEqual(['Latin']);
    expect(entries[0].userTags).toEqual(['warmup']);
  });

  it('AC-5.3.2 — every Tag on a Pattern you own is yours to remove', () => {
    const mine = { ...p('Mine'), tags: ['groove'] };
    const entries = buildEntries([], [mine]);
    expect(entries[0].lockedTags).toEqual([]);
    expect(entries[0].userTags).toEqual(['groove']);
  });

  it('AC-5.2.1 — search matches Pattern names, case-insensitively', () => {
    const entries = buildEntries([p('Bossa Groove'), p('Samba Break')], []);
    expect(filterEntries(entries, { query: 'bossa' }).map((e) => e.pattern.name)).toEqual([
      'Bossa Groove',
    ]);
    expect(filterEntries(entries, { query: 'BREAK' }).map((e) => e.pattern.name)).toEqual([
      'Samba Break',
    ]);
  });

  it('AC-5.2.2 — search matches Tags as well as names', () => {
    const entries = buildEntries([{ ...p('Anon'), tags: ['latin'] }], []);
    expect(filterEntries(entries, { query: 'latin' })).toHaveLength(1);
    expect(filterEntries(entries, { query: 'melodic' })).toHaveLength(0);
  });

  it('AC-5.2.3 — an empty query matches everything', () => {
    const entries = buildEntries([p('A'), p('B')], []);
    expect(filterEntries(entries, { query: '   ' })).toHaveLength(2);
  });

  it('AC-5.3.3 — filtering by an automatic Tag works like any other', () => {
    const entries = buildEntries([p('Shipped')], [p('Mine')]);
    expect(filterEntries(entries, { tag: 'custom' }).map((e) => e.pattern.name)).toEqual(['Mine']);
    expect(filterEntries(entries, { tag: 'percussive' })).toHaveLength(2);
  });

  it('AC-5.3.4 — Tag filtering is case-insensitive', () => {
    const entries = buildEntries([{ ...p('A'), tags: ['Warmup'] }], []);
    expect(filterEntries(entries, { tag: 'warmup' })).toHaveLength(1);
  });

  it('AC-5.3.6 — automatic Tags are listed before the rest', () => {
    const entries = buildEntries([{ ...p('A'), tags: ['zebra', 'apple'] }], []);
    const tags = allTags(entries);
    expect(tags.filter((t) => t.automatic).map((t) => t.name)).toEqual(['built-in', 'percussive']);
    expect(tags.filter((t) => !t.automatic).map((t) => t.name)).toEqual(['apple', 'zebra']);
  });

  it('AC-5.3.6 — a built-in Pattern’s own Tags are filterable like any other', () => {
    const entries = buildEntries([{ ...p('A'), tags: ['Latin'] }], []);
    expect(filterEntries(entries, { tag: 'latin' })).toHaveLength(1);
    expect(filterEntries(entries, { tag: 'built-in' })).toHaveLength(1);
    expect(filterEntries(entries, { query: 'latin' })).toHaveLength(1);
  });

  it('AC-5.3.7 — only Tags actually in use are listed', () => {
    const tags = allTags(buildEntries([p('A')], [])).map((t) => t.name);
    expect(tags).toContain('percussive');
    expect(tags).toContain('built-in');
    expect(tags).not.toContain('melodic');
    expect(tags).not.toContain('custom');
  });

  it('AC-5.3.8 — a melodic Pattern surfaces the melodic Tag', () => {
    const melodic = { ...p('Tune'), soundMode: 'melodic', key: 'C' };
    const entries = buildEntries([melodic], []);
    expect(entries[0].autoTags).toContain('melodic');
    expect(entries[0].autoTags).not.toContain('percussive');
  });

  it('AC-5.5.1 — Prev/Next follow the sorted order on screen', () => {
    const entries = buildEntries([p('Alpha'), p('Bravo'), p('Charlie')], []);
    const { previous, next } = neighbours(entries, { currentId: 'bravo' });
    expect(previous.pattern.name).toBe('Alpha');
    expect(next.pattern.name).toBe('Charlie');
  });

  it('AC-5.5.2 — navigation wraps at both ends and stays inside the active filter', () => {
    const entries = buildEntries([p('Alpha'), p('Bravo'), p('Charlie')], []);
    expect(neighbours(entries, { currentId: 'alpha' }).previous.pattern.name).toBe('Charlie');
    expect(neighbours(entries, { currentId: 'charlie' }).next.pattern.name).toBe('Alpha');

    const filtered = { currentId: 'alpha', query: 'ra' }; // Bravo only
    expect(neighbours(entries, filtered).next.pattern.name).toBe('Bravo');
  });
});

describe('ui/library — filtering by several Tags', () => {
  const withTags = (name, tags) => ({ ...p(name), tags });

  it('AC-5.3.9 — two Tags narrow to Patterns carrying both', () => {
    const entries = buildEntries(
      [
        withTags('Bossa', ['Latin', 'Song']),
        withTags('Samba', ['Latin']),
        withTags('Ballad', ['Song']),
      ],
      []
    );

    expect(filterEntries(entries, { tags: ['Latin'] }).map((e) => e.pattern.name)).toEqual([
      'Bossa',
      'Samba',
    ]);
    expect(filterEntries(entries, { tags: ['Latin', 'Song'] }).map((e) => e.pattern.name)).toEqual([
      'Bossa',
    ]);
  });

  it('AC-5.3.9 — adding a Tag can only ever shrink the list, never grow it', () => {
    const entries = buildEntries(
      [withTags('A', ['Latin']), withTags('B', ['Afro']), withTags('C', ['Latin', 'Afro'])],
      []
    );
    const one = filterEntries(entries, { tags: ['Latin'] });
    const two = filterEntries(entries, { tags: ['Latin', 'Afro'] });

    expect(two.length).toBeLessThanOrEqual(one.length);
    expect(two.map((e) => e.pattern.name)).toEqual(['C']);
  });

  it('AC-5.3.9 — automatic and user Tags combine in the same selection', () => {
    const entries = buildEntries(
      [withTags('Perc', ['Latin']), { ...withTags('Mel', ['Latin']), soundMode: 'melodic', key: 'C' }],
      []
    );
    expect(
      filterEntries(entries, { tags: ['Latin', 'melodic'] }).map((e) => e.pattern.name)
    ).toEqual(['Mel']);
  });

  it('AC-5.3.9 — a combination nothing carries returns nothing, rather than ignoring a Tag', () => {
    const entries = buildEntries([withTags('A', ['Latin'])], []);
    expect(filterEntries(entries, { tags: ['Latin', 'Waltz'] })).toEqual([]);
  });

  it('AC-5.3.9 — Tag matching stays case-insensitive with several selected', () => {
    const entries = buildEntries([withTags('A', ['Latin', 'Song'])], []);
    expect(filterEntries(entries, { tags: ['latin', 'SONG'] })).toHaveLength(1);
  });

  it('AC-5.3.9 — toggling adds a Tag, then removes it', () => {
    let view = { tags: [] };
    view = { tags: toggleTag(view, 'Latin') };
    expect(selectedTags(view)).toEqual(['Latin']);

    view = { tags: toggleTag(view, 'Song') };
    expect(selectedTags(view)).toEqual(['Latin', 'Song']);

    // Case-insensitive, so the chip you clicked is the one that comes off.
    view = { tags: toggleTag(view, 'latin') };
    expect(selectedTags(view)).toEqual(['Song']);
  });

  it('AC-5.3.9 — Tags narrow alongside search and Rating rather than replacing them', () => {
    const entries = buildEntries(
      [
        { ...withTags('Bossa Groove', ['Latin', 'Song']), rating: 5 },
        { ...withTags('Bossa Fill', ['Latin', 'Song']), rating: 1 },
        { ...withTags('Samba Groove', ['Latin', 'Song']), rating: 5 },
      ],
      []
    );

    const result = filterEntries(entries, {
      tags: ['Latin', 'Song'],
      query: 'bossa',
      minRating: 4,
    });
    expect(result.map((e) => e.pattern.name)).toEqual(['Bossa Groove']);
  });

  it('AC-5.3.9 — a single Tag string is still honoured', () => {
    const entries = buildEntries([withTags('A', ['Latin']), withTags('B', ['Afro'])], []);
    expect(filterEntries(entries, { tag: 'Latin' }).map((e) => e.pattern.name)).toEqual(['A']);
  });

  it('AC-5.5.2 — Prev/Next traverse the multi-Tag filtered list', () => {
    const entries = buildEntries(
      [
        withTags('Alpha', ['Latin', 'Song']),
        withTags('Bravo', ['Latin']),
        withTags('Charlie', ['Latin', 'Song']),
      ],
      []
    );
    const view = { tags: ['Latin', 'Song'], currentId: 'alpha' };
    // Bravo is filtered out, so Next skips straight past it.
    expect(neighbours(entries, view).next.pattern.name).toBe('Charlie');
    expect(neighbours(entries, view).previous.pattern.name).toBe('Charlie');
  });
});
