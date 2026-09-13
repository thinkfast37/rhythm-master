/**
 * The parsed-read cache in keyValue.js.
 *
 * `readStore` memoizes against the raw string it parsed, because the library's
 * own bookkeeping used to re-read and re-parse the whole overlay store once per
 * Pattern — roughly six hundred full parses per render, several times a second
 * during playback (T301).
 *
 * A cache is only safe while every write path copies rather than mutating what
 * a read handed back. These tests hold that contract, since a violation of it
 * is silent: the store on disk stays right and only the in-memory value drifts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readStore, writeStore, clearStore, rawOf, useBackingStore } from '../../../src/storage/keyValue.js';
import * as patternStore from '../../../src/storage/patterns.js';
import * as overlayStore from '../../../src/storage/overlays.js';
import * as localMetaStore from '../../../src/storage/localMeta.js';
import * as songStore from '../../../src/storage/songs.js';

beforeEach(() => {
  useBackingStore(new Map());
});

describe('storage/keyValue — the parsed-read cache', () => {
  it('serves the same parsed value while the stored string is unchanged', () => {
    writeStore('k', { a: 1 });
    expect(readStore('k', {})).toBe(readStore('k', {}));
  });

  it('reparses as soon as the stored string changes', () => {
    writeStore('k', { a: 1 });
    const first = readStore('k', {});
    writeStore('k', { a: 2 });
    const second = readStore('k', {});
    expect(second).not.toBe(first);
    expect(second.a).toBe(2);
  });

  it('reparses after the key is cleared, rather than serving the old value', () => {
    writeStore('k', { a: 1 });
    readStore('k', {});
    clearStore('k');
    expect(readStore('k', { a: 'fallback' }).a).toBe('fallback');
  });

  it('never hands the same object back for an absent key, since the fallback is mutable', () => {
    const first = readStore('missing', { items: [] });
    first.items.push('mutated');
    expect(readStore('missing', { items: [] }).items).toEqual([]);
  });

  it('rawOf is the stored string itself, so it can key a memo without parsing', () => {
    expect(rawOf('k')).toBeNull();
    writeStore('k', { a: 1 });
    const raw = rawOf('k');
    expect(raw).toContain('"a":1');
    expect(rawOf('k')).toBe(raw);
  });

  it('a Map backing store swapped in underneath does not serve the previous one’s values', () => {
    writeStore('k', { a: 1 });
    readStore('k', {});
    useBackingStore(new Map());
    expect(readStore('k', { a: 'fresh' }).a).toBe('fresh');
  });
});

/*
 * The write paths. Each of these used to mutate the array or object `loadAll`
 * returned, which with a cache in place would edit the cached value in place —
 * so a later read could see a change that was never written, or miss one that
 * was. Each test writes twice, because a single write cannot show the drift.
 */
describe('storage — a write never edits the cached read in place', () => {
  it('patterns.upsert', () => {
    patternStore.upsert({ id: 'p_1', name: 'One' });
    const afterFirst = patternStore.loadAll();
    patternStore.upsert({ id: 'p_2', name: 'Two' });
    expect(afterFirst.map((p) => p.id)).toEqual(['p_1']);
    expect(patternStore.loadAll().map((p) => p.id)).toEqual(['p_1', 'p_2']);
  });

  it('overlays.update', () => {
    overlayStore.update('s_1', { rating: 3 });
    const afterFirst = overlayStore.loadAll();
    overlayStore.update('s_2', { rating: 5 });
    expect(Object.keys(afterFirst)).toEqual(['s_1']);
    expect(overlayStore.loadAll().s_2.rating).toBe(5);
  });

  it('localMeta.update and localMeta.forget', () => {
    localMetaStore.update('p_1', { submittedAt: 'a' });
    const afterFirst = localMetaStore.loadAll();
    localMetaStore.update('p_2', { submittedAt: 'b' });
    expect(Object.keys(afterFirst)).toEqual(['p_1']);

    const beforeForget = localMetaStore.loadAll();
    localMetaStore.forget('p_1');
    expect(Object.keys(beforeForget)).toEqual(['p_1', 'p_2']);
    expect(Object.keys(localMetaStore.loadAll())).toEqual(['p_2']);
  });

  it('songs.upsert', () => {
    songStore.upsert({ name: 'One', entries: [] });
    const afterFirst = songStore.loadAll();
    songStore.upsert({ name: 'Two', entries: [] });
    expect(afterFirst).toHaveLength(1);
    expect(songStore.loadAll()).toHaveLength(2);
  });
});
