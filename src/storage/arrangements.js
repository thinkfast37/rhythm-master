/**
 * Arrangements, in `rm.arrangements.v2` (US-20.1). Its own store, shaped as
 * the Sections' is, so nothing that happens to Patterns, Sections or Chains
 * can lose one (AC-20.1.4/6). An Arrangement names what it is made of by id;
 * it never carries a copy.
 *
 * The key is `v2` on purpose: `rm.arrangements.v1` is where Sections were kept
 * while they were called Arrangements, and `storage/sections.js` still moves
 * whatever it finds there into Sections (AC-19.11.4/8).
 */
import { readStore, writeStore } from './keyValue.js';
import { usesItem, validateArrangement } from '../core/arrangement.js';

export const KEY = 'rm.arrangements.v2';

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

/** The names of the Arrangements using an item — what a refused deletion says (AC-20.1.4/5). */
export function referencing(kind, id) {
  return loadAll()
    .filter((a) => usesItem(a, kind, id))
    .map((a) => a.name);
}

/** Ids are opaque and never reused within what is stored — a counter, so tests stay reproducible. */
function nextId(existing) {
  const used = new Set(existing.map((a) => a.id));
  let n = existing.length + 1;
  while (used.has(`arrg_${n}`)) n += 1;
  return `arrg_${n}`;
}

/** Insert or replace by id, assigning one when the Arrangement has none. Returns what was saved; throws on an unsound one. */
export function upsert(arrangement) {
  // Nothing unsound is written: a store that held one could not be read back as what it claims to be.
  const problems = validateArrangement(arrangement);
  if (problems.length > 0) throw new Error(`Not a sound Arrangement: ${problems.join('; ')}`);
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
