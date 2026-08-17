import { describe, it, expect } from 'vitest';
import {
  rhythmFingerprint,
  isDuplicate,
  isSameFamily,
  findDuplicates,
  findFamily,
  familyGroups,
  duplicateGroups,
} from '../../../src/core/similarity.js';
import { create, cycleAccent, setRecipe, setTimeSignature } from '../../../src/core/pattern.js';

const withNote = (p, b = 0, s = 0) => cycleAccent(p, 0, b, s);

/** A Melodic twin of a Percussive Pattern — same rhythm, different Sound Mode. */
function melodicTwin(pattern, id, degree = '1') {
  const twin = structuredClone(pattern);
  twin.id = id;
  twin.soundMode = 'melodic';
  twin.key = 'C';
  twin.measures[0].beats[0].slots[0].pitch = { degree, octaveOffset: 0 };
  return twin;
}

describe('core/similarity', () => {
  // --- AC-11.1.1 — True duplicate match criteria ---------------------------

  it('AC-11.1.1 — True duplicate match criteria', () => {
    const a = { ...withNote(create('Bossa Groove')), id: 'a' };
    const b = { ...withNote(create('Completely Different Name')), id: 'b' };
    expect(isDuplicate(a, b)).toBe(true);
  });

  it('AC-11.1.1 — True duplicate match criteria: name, Tags and Rating are not part of them', () => {
    const a = { ...withNote(create('A')), id: 'a', tags: ['jazz'], rating: 5 };
    const b = { ...withNote(create('B')), id: 'b', tags: [], rating: 0 };
    expect(rhythmFingerprint(a)).toBe(rhythmFingerprint(b));
  });

  it('AC-11.1.1 — True duplicate match criteria: differing Slot content excludes a match', () => {
    const a = { ...withNote(create('A'), 0, 0), id: 'a' };
    const b = { ...withNote(create('B'), 1, 0), id: 'b' };
    expect(isDuplicate(a, b)).toBe(false);
  });

  it('AC-11.1.1 — True duplicate match criteria: an explicit accent equal to the default still matches', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = structuredClone(a);
    b.id = 'b';
    // Beat 1 Slot 1 of 4/4 defaults to Strong; spelling it out changes nothing.
    b.measures[0].beats[0].slots[0].accent = 3;
    expect(rhythmFingerprint(a)).toBe(rhythmFingerprint(b));
    expect(isDuplicate(a, b)).toBe(true);
  });

  it('AC-11.1.1 — True duplicate match criteria: differing tempo or Time Signature excludes a match', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    expect(isDuplicate(a, { ...a, id: 'b', tempo: 140 })).toBe(false);
    expect(isDuplicate(a, { ...setTimeSignature(a, 0, '3/4'), id: 'b' })).toBe(false);
  });

  it('AC-11.1.1 — True duplicate match criteria: a Recipe change excludes a match even with the same audible notes', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = { ...withNote(setRecipe(create('B'), 0, 0, 'straight-8ths')), id: 'b' };
    expect(isDuplicate(a, b)).toBe(false);
  });

  it('AC-11.1.1 — True duplicate match criteria: a Pattern is never its own duplicate', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = { ...withNote(create('B')), id: 'b' };
    expect(findDuplicates(a, [a, b]).map((p) => p.id)).toEqual(['b']);
  });

  // --- AC-11.1.2 — Differing Sound Mode, Pitch, or swing -------------------

  it('AC-11.1.2 — Differing Sound Mode, Pitch, or swing excludes a duplicate match', () => {
    const percussive = { ...withNote(create('Groove')), id: 'a' };
    expect(isDuplicate(percussive, melodicTwin(percussive, 'b'))).toBe(false);
  });

  it('AC-11.1.2 — Differing Sound Mode, Pitch, or swing excludes a duplicate match: differing Pitch', () => {
    const base = melodicTwin({ ...withNote(create('Groove')), id: 'a' }, 'a', '1');
    const other = melodicTwin(base, 'b', '5');
    expect(isDuplicate(base, other)).toBe(false);
  });

  it('AC-11.1.2 — Differing Sound Mode, Pitch, or swing excludes a duplicate match: differing swing', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = structuredClone(a);
    b.id = 'b';
    b.measures[0].beats[0].swing = { 0: 60 };
    expect(rhythmFingerprint(a)).not.toBe(rhythmFingerprint(b));
    expect(isDuplicate(a, b)).toBe(false);
  });

  // --- AC-11.1.4 — the view's data, library-wide ---------------------------

  it('AC-11.1.4 — Possible-duplicates view catches duplicates from ongoing edits: library-wide pairs', () => {
    // Neither of these is "the current Pattern" — the view is over the whole library.
    const a = { ...withNote(create('A')), id: 'a' };
    const b = { ...withNote(create('B')), id: 'b' };
    const unrelated = { ...withNote(create('C'), 2, 0), id: 'c' };

    const groups = duplicateGroups([a, b, unrelated]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('AC-11.1.4 — Possible-duplicates view catches duplicates from ongoing edits: a Family is not a duplicate set', () => {
    const percussive = { ...withNote(create('A')), id: 'a' };
    const melodic = melodicTwin(percussive, 'b');
    // Same rhythm, so they share a bucket — but they are not duplicates, so no group.
    expect(rhythmFingerprint(percussive)).toBe(rhythmFingerprint(melodic));
    expect(duplicateGroups([percussive, melodic])).toEqual([]);
  });

  it('AC-11.1.4 — Possible-duplicates view catches duplicates from ongoing edits: three identical Patterns are one set', () => {
    const group = ['a', 'b', 'c'].map((id) => ({ ...withNote(create(id.toUpperCase())), id }));
    const groups = duplicateGroups(group);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('AC-11.1.4 — Possible-duplicates view catches duplicates from ongoing edits: a library with no duplicates reports none', () => {
    const a = { ...withNote(create('A'), 0, 0), id: 'a' };
    const b = { ...withNote(create('B'), 1, 0), id: 'b' };
    expect(duplicateGroups([a, b])).toEqual([]);
  });

  // --- AC-11.2.1 — Family match criteria -----------------------------------

  it('AC-11.2.1 — Family match criteria', () => {
    const percussive = { ...withNote(create('Groove')), id: 'a' };
    const melodic = melodicTwin(percussive, 'b');
    expect(isSameFamily(percussive, melodic)).toBe(true);
    expect(isDuplicate(percussive, melodic)).toBe(false);
  });

  it('AC-11.2.1 — Family match criteria: same rhythm, different Pitch is a Family', () => {
    const base = melodicTwin({ ...withNote(create('Groove')), id: 'a' }, 'a', '1');
    const other = melodicTwin(base, 'b', '5');
    expect(isSameFamily(base, other)).toBe(true);
  });

  it('AC-11.2.1 — Family match criteria: a different rhythm is not a Family', () => {
    const a = { ...withNote(create('A'), 0, 0), id: 'a' };
    const b = { ...withNote(create('B'), 2, 0), id: 'b' };
    expect(isSameFamily(a, b)).toBe(false);
  });

  it('AC-11.2.1 — Family match criteria: an exact duplicate is not also a Family', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = { ...withNote(create('B')), id: 'b' };
    expect(isDuplicate(a, b)).toBe(true);
    expect(isSameFamily(a, b)).toBe(false);
    expect(findFamily(a, [b])).toEqual([]);
  });

  it('AC-11.2.1 — Family match criteria: familyGroups collects Patterns sharing a rhythm', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = melodicTwin(a, 'b');
    const c = { ...withNote(create('C'), 2, 0), id: 'c' };

    const groups = familyGroups([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  // --- AC-11.2.3 — independence -------------------------------------------

  it('AC-11.2.3 — Family members remain fully independent: editing one does not touch the other', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = melodicTwin(a, 'b');
    const before = rhythmFingerprint(b);

    // Family membership is a computed relationship, not a data link, so a mutation of
    // one member cannot reach the other (AC-7.5.4 depends on this too).
    const edited = { ...withNote(a, 2, 0), id: 'a' };

    expect(rhythmFingerprint(b)).toBe(before);
    expect(isSameFamily(edited, b)).toBe(false);
  });
});
