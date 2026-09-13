/**
 * Songs, in `rm.songs.v1` (US-18.1). Its own store, separate from Patterns,
 * ratings, added Tags and Keeps, so nothing that happens to those can lose a
 * Song (AC-18.1.4/7). A Song references the Pattern each Section is composed
 * over by id; it never carries the Pattern itself.
 */
import { readStore, writeStore } from './keyValue.js';

export const KEY = 'rm.songs.v1';

const EMPTY = { songs: [] };

export function loadAll() {
  return readStore(KEY, EMPTY).songs ?? [];
}

function saveAll(songs) {
  writeStore(KEY, { songs });
}

export function findById(id) {
  return loadAll().find((s) => s.id === id) ?? null;
}

const references = (song, patternId) => (song.sections ?? []).some((s) => s.patternId === patternId);

/** The Songs any of whose Sections are composed over `patternId` (AC-18.1.4/2). */
export function forPattern(patternId) {
  return loadAll().filter((s) => references(s, patternId));
}

/** The names of the Songs composed over `patternId` — what a refused deletion says (AC-18.1.4/5). */
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

/** Insert or replace by id, assigning one when the Song has none. Returns the saved Song. */
export function upsert(song) {
  const all = loadAll();
  const saved = { ...song, id: song.id ?? nextId(all) };
  const i = all.findIndex((s) => s.id === saved.id);
  if (i === -1) all.push(saved);
  else all[i] = saved;
  saveAll(all);
  return saved;
}

export function rename(id, name) {
  const song = findById(id);
  if (!song) throw new Error(`No Song with id ${id}`);
  return upsert({ ...song, name });
}

export function remove(id) {
  saveAll(loadAll().filter((s) => s.id !== id));
}
