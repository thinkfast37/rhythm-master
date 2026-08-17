/**
 * Local Metadata, in `rm.localMeta.v1`. FR-006 — MANDATORY separation.
 *
 * App-local bookkeeping ABOUT a Pattern: when it was submitted, whether a
 * duplicate prompt has been answered. Deliberately a different key with a
 * different module, so a Pattern's serialization physically cannot reach it.
 *
 * NOTHING here may ever appear in an export, a MIDI file, or a submission
 * payload. A Pattern's portable form describes the music and nothing about this
 * installation's history with it.
 */
import { readStore, writeStore } from './keyValue.js';

export const KEY = 'rm.localMeta.v1';

const EMPTY = { byPatternId: {} };

/** Every key this store may hold — asserted against exports by the FR-006 test. */
export const LOCAL_META_FIELDS = ['submittedAt', 'submittedDigest', 'duplicateResolved'];

export function loadAll() {
  return readStore(KEY, EMPTY).byPatternId ?? {};
}

export function forPattern(patternId) {
  return loadAll()[patternId] ?? {};
}

export function update(patternId, fields) {
  for (const k of Object.keys(fields)) {
    if (!LOCAL_META_FIELDS.includes(k)) {
      throw new Error(`"${k}" is not a Local Metadata field; add it to LOCAL_META_FIELDS first.`);
    }
  }
  const all = loadAll();
  all[patternId] = { ...(all[patternId] ?? {}), ...fields };
  writeStore(KEY, { byPatternId: all });
  return all[patternId];
}

/** Local Metadata for a deleted Pattern is dropped with it. */
export function forget(patternId) {
  const all = loadAll();
  delete all[patternId];
  writeStore(KEY, { byPatternId: all });
}
