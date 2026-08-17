import { describe, it, expect } from 'vitest';
import {
  rhythmFingerprint,
  isDuplicate,
  isSameFamily,
  findDuplicates,
  findFamily,
  familyGroups,
} from '../../../src/core/similarity.js';
import { create, cycleAccent, setRecipe, setTimeSignature } from '../../../src/core/pattern.js';

const withNote = (p, b = 0, s = 0) => cycleAccent(p, 0, b, s);

describe('core/similarity', () => {
  it('AC-11.1.1 — two Patterns with the same notes are duplicates whatever they are called', () => {
    const a = { ...withNote(create('Bossa Groove')), id: 'a' };
    const b = { ...withNote(create('Completely Different Name')), id: 'b' };
    expect(isDuplicate(a, b)).toBe(true);
  });

  it('AC-11.1.2 — differing notes are not duplicates', () => {
    const a = { ...withNote(create('A'), 0, 0), id: 'a' };
    const b = { ...withNote(create('B'), 1, 0), id: 'b' };
    expect(isDuplicate(a, b)).toBe(false);
  });

  it('AC-11.1.3 — an explicit accent equal to the computed default still fingerprints the same', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = structuredClone(a);
    b.id = 'b';
    // Beat 1 Slot 1 of 4/4 defaults to Strong; spelling it out changes nothing.
    b.measures[0].beats[0].slots[0].accent = 3;
    expect(rhythmFingerprint(a)).toBe(rhythmFingerprint(b));
    expect(isDuplicate(a, b)).toBe(true);
  });

  it('AC-11.1.4 — differing tempo or meter breaks duplication', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    expect(isDuplicate(a, { ...a, id: 'b', tempo: 140 })).toBe(false);
    expect(isDuplicate(a, { ...setTimeSignature(a, 0, '3/4'), id: 'b' })).toBe(false);
  });

  it('AC-11.1.5 — findDuplicates never reports a Pattern against itself', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = { ...withNote(create('B')), id: 'b' };
    expect(findDuplicates(a, [a, b]).map((p) => p.id)).toEqual(['b']);
  });

  it('AC-11.2.1 — same rhythm, different Sound Mode is a Family, not a duplicate', () => {
    const percussive = { ...withNote(create('Groove')), id: 'a' };
    const melodic = structuredClone(percussive);
    melodic.id = 'b';
    melodic.soundMode = 'melodic';
    melodic.key = 'C';
    melodic.measures[0].beats[0].slots[0].pitch = { degree: '1', octaveOffset: 0 };

    expect(isSameFamily(percussive, melodic)).toBe(true);
    expect(isDuplicate(percussive, melodic)).toBe(false);
  });

  it('AC-11.2.2 — same rhythm, different Pitch is a Family', () => {
    const base = { ...withNote(create('Groove')), id: 'a', soundMode: 'melodic', key: 'C' };
    base.measures[0].beats[0].slots[0].pitch = { degree: '1', octaveOffset: 0 };
    const other = structuredClone(base);
    other.id = 'b';
    other.measures[0].beats[0].slots[0].pitch = { degree: '5', octaveOffset: 0 };

    expect(isSameFamily(base, other)).toBe(true);
  });

  it('AC-11.2.3 — a different rhythm is not a Family', () => {
    const a = { ...withNote(create('A'), 0, 0), id: 'a' };
    const b = { ...withNote(create('B'), 2, 0), id: 'b' };
    expect(isSameFamily(a, b)).toBe(false);
  });

  it('AC-11.2.4 — an exact duplicate is not also reported as a Family', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = { ...withNote(create('B')), id: 'b' };
    expect(isDuplicate(a, b)).toBe(true);
    expect(isSameFamily(a, b)).toBe(false);
    expect(findFamily(a, [b])).toEqual([]);
  });

  it('AC-11.2.5 — familyGroups collects Patterns sharing a rhythm', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = { ...withNote(create('B')), id: 'b', soundMode: 'melodic', key: 'C' };
    b.measures[0].beats[0].slots[0].pitch = { degree: '1', octaveOffset: 0 };
    const c = { ...withNote(create('C'), 2, 0), id: 'c' };

    const groups = familyGroups([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('AC-11.1.1 — the fingerprint ignores name, tags, and rating', () => {
    const a = { ...withNote(create('A')), id: 'a', tags: ['jazz'], rating: 5 };
    const b = { ...withNote(create('B')), id: 'b', tags: [], rating: 0 };
    expect(rhythmFingerprint(a)).toBe(rhythmFingerprint(b));
  });

  it('AC-11.1.2 — swing is part of the rhythm', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = structuredClone(a);
    b.id = 'b';
    b.measures[0].beats[0].swing = { 0: 60 };
    expect(rhythmFingerprint(a)).not.toBe(rhythmFingerprint(b));
    expect(isDuplicate(a, b)).toBe(false);
  });

  it('AC-11.1.3 — a Recipe change breaks duplication even with the same audible notes', () => {
    const a = { ...withNote(create('A')), id: 'a' };
    const b = { ...withNote(setRecipe(create('B'), 0, 0, 'straight-8ths')), id: 'b' };
    expect(isDuplicate(a, b)).toBe(false);
  });
});
