/**
 * The one place localStorage is touched.
 *
 * Kept behind a swappable backing store so the storage modules stay testable in
 * Node without a DOM, and so a quota or serialization failure has a single
 * place to be handled rather than a dozen.
 */
import { migrate, CURRENT_VERSION } from './migrate.js';

let backing = typeof localStorage !== 'undefined' ? localStorage : new Map();

const get = (k) => (backing instanceof Map ? (backing.get(k) ?? null) : backing.getItem(k));
const set = (k, v) => (backing instanceof Map ? backing.set(k, v) : backing.setItem(k, v));
const del = (k) => (backing instanceof Map ? backing.delete(k) : backing.removeItem(k));

/** Test seam. Pass a Map for an in-memory store. */
export function useBackingStore(store) {
  backing = store;
  cache.clear();
}

/*
 * Parsed reads, keyed by the raw string they were parsed from.
 *
 * `readStore` was a full getItem + JSON.parse + migrate on every call, and the
 * library's own bookkeeping calls it once PER PATTERN: `overlays.applyTo` and
 * `overlays.addedTagsFor` each re-read the whole overlay store, so building the
 * library list re-parsed localStorage roughly six hundred times. That list is
 * rebuilt on every render, and a render happens on every sounding event — which
 * is what made the app unusable on a TV-class CPU (measured: 11.3 seconds of
 * blocked main thread inside a 4-second window at 20x throttle).
 *
 * Keying on the raw string rather than on a revision counter keeps this honest:
 * a write from anywhere — this tab, another tab, a test reaching past the
 * module — changes the string and misses the cache. The only way to read stale
 * data is to MUTATE what a read handed back, so the two write paths that used
 * to do that (`patterns.upsert`, `overlays.update`) now copy first.
 */
const cache = new Map();

export function readStore(key, fallback) {
  const raw = get(key);
  const hit = cache.get(key);
  if (hit !== undefined && hit.raw === raw) return hit.value;
  // Deep-copy the fallback: callers mutate what they get back (upsert pushes onto
  // the array), and handing out a shared module-level default lets one caller
  // permanently poison every later "empty store" read.
  if (raw === null || raw === undefined) {
    // NOT cached: the fallback is deep-copied precisely because callers mutate
    // what they get back, and handing the same copy out twice would undo that.
    return { ...structuredClone(fallback), schemaVersion: CURRENT_VERSION };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Stored data at "${key}" is not valid JSON; refusing to overwrite it.`);
  }
  const value = migrate(parsed);
  cache.set(key, { raw, value });
  return value;
}

/**
 * The raw stored string for a key, unparsed — a cheap identity for "has this
 * store changed?", for callers memoizing expensive work over it. Compare with
 * `===`; do not parse it. Null when nothing is stored.
 */
export function rawOf(key) {
  return get(key);
}

export function writeStore(key, data) {
  set(key, JSON.stringify({ ...data, schemaVersion: CURRENT_VERSION }));
}

export function clearStore(key) {
  del(key);
}
