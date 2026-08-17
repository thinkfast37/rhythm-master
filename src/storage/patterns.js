/**
 * User-owned Patterns, in `rm.patterns.v1`. data-model §6.
 *
 * This store is the definition of provenance: a Pattern read from here is
 * user-owned, editable, deletable, and auto-saved. A Pattern read from the seed
 * store is shipped. Nothing on the Pattern itself says which — that is what
 * stops an edit from forging it (FR-007, data-model §5).
 */
import { readStore, writeStore } from './keyValue.js';

export const KEY = 'rm.patterns.v1';

const EMPTY = { patterns: [] };

export function loadAll() {
  return readStore(KEY, EMPTY).patterns ?? [];
}

export function saveAll(patterns) {
  writeStore(KEY, { patterns });
}

export function findById(id) {
  return loadAll().find((p) => p.id === id) ?? null;
}

/** Insert or replace by id. This is the whole of auto-save (US-7.2). */
export function upsert(pattern) {
  if (!pattern.id) throw new Error('A user-owned Pattern needs an id before it can be saved');
  const all = loadAll();
  const i = all.findIndex((p) => p.id === pattern.id);
  if (i === -1) all.push(pattern);
  else all[i] = pattern;
  saveAll(all);
  return pattern;
}

export function remove(id) {
  saveAll(loadAll().filter((p) => p.id !== id));
}

/**
 * Ids are opaque and never reused. Derived from a counter rather than a clock
 * or randomness so the store stays reproducible in tests.
 */
export function nextId(existing = loadAll()) {
  const used = new Set(existing.map((p) => p.id));
  let n = existing.length + 1;
  while (used.has(`p_${n}`)) n += 1;
  return `p_${n}`;
}
