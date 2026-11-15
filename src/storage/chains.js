/**
 * Chains, in `rm.songs.v1` (US-18.1). Its own store, separate from Patterns,
 * ratings, added Tags and Keeps, so nothing that happens to those can lose a
 * Chain (AC-18.1.4/7). A Chain references the Pattern it is composed over by
 * id; it never carries the Pattern itself.
 *
 * The store keeps the name it had while a saved Chain was called a Song, and
 * so do its list (`songs`) and its ids (`song_n`): renaming them would rewrite
 * saved work for no gain to the musician (T506).
 */
import { readStore, writeStore } from './keyValue.js';

export const KEY = 'rm.songs.v1';

const EMPTY = { songs: [] };

export function loadAll() {
  return readStore(KEY, EMPTY).songs ?? [];
}

function saveAll(chains) {
  writeStore(KEY, { songs: chains });
}

export function findById(id) {
  return loadAll().find((s) => s.id === id) ?? null;
}

const references = (chain, patternId) => (chain.sections ?? []).some((s) => s.patternId === patternId);

/** The Chains any of whose Chains are composed over `patternId` (AC-18.1.4/2). */
export function forPattern(patternId) {
  return loadAll().filter((s) => references(s, patternId));
}

/** The names of the Chains composed over `patternId` — what a refused deletion says (AC-18.1.4/5). */
export function referencingPattern(patternId) {
  return forPattern(patternId).map((s) => s.name);
}

/**
 * Ids are opaque and never reused. Derived from a counter rather than a clock
 * or randomness so the store stays reproducible in tests.
 */
function nextId(existing) {
  const used = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (used.has(`song_${n}`)) n += 1;
  return `song_${n}`;
}

/** Insert or replace by id, assigning one when the Chain has none. Returns the saved Chain. */
export function upsert(chain) {
  // Copy before changing — see the note in patterns.upsert: reads are cached
  // by raw string, so mutating one in place would edit the cache, not the store.
  const all = [...loadAll()];
  const saved = { ...chain, id: chain.id ?? nextId(all) };
  const i = all.findIndex((s) => s.id === saved.id);
  if (i === -1) all.push(saved);
  else all[i] = saved;
  saveAll(all);
  return saved;
}

export function rename(id, name) {
  const chain = findById(id);
  if (!chain) throw new Error(`No Chain with id ${id}`);
  return upsert({ ...chain, name });
}

export function remove(id) {
  saveAll(loadAll().filter((s) => s.id !== id));
}
