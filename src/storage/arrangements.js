/**
 * Arrangements, in `rm.arrangements.v1` (US-19.11). Its own store, shaped as
 * `rm.songs.v1` is, so nothing that happens to Patterns, overlays or Songs
 * can lose one (AC-19.11.4/7). An Arrangement references its composition and
 * every layer by Pattern id; it never carries a Pattern itself.
 */
import { readStore, writeStore } from './keyValue.js';
import { usesPattern } from '../core/arrangement.js';

export const KEY = 'rm.arrangements.v1';

const EMPTY = { arrangements: [] };

export function loadAll() {
  return readStore(KEY, EMPTY).arrangements ?? [];
}

function saveAll(arrangements) {
  writeStore(KEY, { arrangements });
}

export function findById(id) {
  return loadAll().find((a) => a.id === id) ?? null;
}

/** The names of the Arrangements using `patternId` — what a refused deletion says (AC-19.11.4/5). */
export function referencingPattern(patternId) {
  return loadAll()
    .filter((a) => usesPattern(a, patternId))
    .map((a) => a.name);
}

/** Ids are opaque and never reused — a counter, as Songs use, so tests stay reproducible. */
function nextId(existing) {
  const used = new Set(existing.map((a) => a.id));
  let n = existing.length + 1;
  while (used.has(`arr_${n}`)) n += 1;
  return `arr_${n}`;
}

/** Insert or replace by id, assigning one when the Arrangement has none. Returns what was saved. */
export function upsert(arrangement) {
  const all = [...loadAll()];
  const saved = { ...arrangement, id: arrangement.id ?? nextId(all) };
  const i = all.findIndex((a) => a.id === saved.id);
  if (i === -1) all.push(saved);
  else all[i] = saved;
  saveAll(all);
  return saved;
}

export function rename(id, name) {
  const arrangement = findById(id);
  if (!arrangement) throw new Error(`No Arrangement with id ${id}`);
  return upsert({ ...arrangement, name });
}

export function remove(id) {
  saveAll(loadAll().filter((a) => a.id !== id));
}
