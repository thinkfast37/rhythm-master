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
}

export function readStore(key, fallback) {
  const raw = get(key);
  // Deep-copy the fallback: callers mutate what they get back (upsert pushes onto
  // the array), and handing out a shared module-level default lets one caller
  // permanently poison every later "empty store" read.
  if (raw === null || raw === undefined) {
    return { ...structuredClone(fallback), schemaVersion: CURRENT_VERSION };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Stored data at "${key}" is not valid JSON; refusing to overwrite it.`);
  }
  return migrate(parsed);
}

export function writeStore(key, data) {
  set(key, JSON.stringify({ ...data, schemaVersion: CURRENT_VERSION }));
}

export function clearStore(key) {
  del(key);
}
