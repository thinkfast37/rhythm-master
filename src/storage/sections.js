/**
 * Sections, in `rm.sections.v1` (US-19.11). Its own store, shaped as
 * `rm.songs.v1` is, so nothing that happens to Patterns, overlays or Chains
 * can lose one (AC-19.11.4/7). A Section references its composition and
 * every layer by Pattern id; it never carries a Pattern itself.
 */
import { readStore, writeStore, rawOf, clearStore } from './keyValue.js';
import { usesPattern } from '../core/section.js';

export const KEY = 'rm.sections.v1';

/**
 * Where Sections were kept while they were called Arrangements, under the list
 * name `arrangements` (AC-19.11.4/8). Read once, moved, and cleared.
 */
export const LEGACY_KEY = 'rm.arrangements.v1';
export const LEGACY_LIST = 'arrangements';

const EMPTY = { sections: [] };

/**
 * Move what the old store holds into this one (AC-19.11.4/8): every entry kept
 * with its id, name, parts and sounds, an entry whose id this store already
 * uses given the next free one rather than dropped, and the old key cleared
 * only once the new one is written. A store that cannot be read is left alone.
 */
function adoptLegacy() {
  if (rawOf(LEGACY_KEY) === null || rawOf(LEGACY_KEY) === undefined) return;
  let old;
  try {
    old = readStore(LEGACY_KEY, { [LEGACY_LIST]: [] })[LEGACY_LIST] ?? [];
  } catch {
    return;
  }
  const all = [...(readStore(KEY, EMPTY).sections ?? [])];
  for (const entry of old) {
    const taken = all.some((a) => a.id === entry.id);
    all.push(taken ? { ...entry, id: nextId(all) } : entry);
  }
  writeStore(KEY, { sections: all });
  clearStore(LEGACY_KEY);
}

export function loadAll() {
  adoptLegacy();
  return readStore(KEY, EMPTY).sections ?? [];
}

function saveAll(sections) {
  writeStore(KEY, { sections });
}

export function findById(id) {
  return loadAll().find((a) => a.id === id) ?? null;
}

/** The names of the Sections using `patternId` — what a refused deletion says (AC-19.11.4/5). */
export function referencingPattern(patternId) {
  return loadAll()
    .filter((a) => usesPattern(a, patternId))
    .map((a) => a.name);
}

/** Ids are opaque and never reused — a counter, as Chains use, so tests stay reproducible. */
function nextId(existing) {
  const used = new Set(existing.map((a) => a.id));
  let n = existing.length + 1;
  while (used.has(`arr_${n}`)) n += 1;
  return `arr_${n}`;
}

/** Insert or replace by id, assigning one when the Section has none. Returns what was saved. */
export function upsert(section) {
  const all = [...loadAll()];
  const saved = { ...section, id: section.id ?? nextId(all) };
  const i = all.findIndex((a) => a.id === saved.id);
  if (i === -1) all.push(saved);
  else all[i] = saved;
  saveAll(all);
  return saved;
}

export function rename(id, name) {
  const section = findById(id);
  if (!section) throw new Error(`No Section with id ${id}`);
  return upsert({ ...section, name });
}

export function remove(id) {
  saveAll(loadAll().filter((a) => a.id !== id));
}
