/**
 * The whole-library backup file (US-7.6, data-model §6).
 *
 * Pure: what the file holds, and which files are refused. Reading and writing
 * localStorage is `storage/backup.js`; this module never sees a store it was
 * not handed.
 *
 * The file is an envelope around every store, each exactly as stored. It is the
 * one file Local Metadata may travel in (FR-006, Constitution 3.6.0), and it
 * travels there as its own store — nothing here merges it into a Pattern.
 */

export const BACKUP_FORMAT = 'rhythm-master-backup';

/** The envelope's own version. Each store inside keeps its own (FR-005). */
export const BACKUP_VERSION = 1;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The backup for the given stores, keyed by storage key. A store that was
 * never written (null or undefined) is left out rather than written as empty,
 * so restoring the file clears it again (AC-7.6.1/2, AC-7.6.2/2). `createdAt`
 * is passed in: `core/` does not read the clock.
 */
export function buildBackup(stores, createdAt) {
  const present = {};
  for (const [key, value] of Object.entries(stores)) {
    if (value !== null && value !== undefined) present[key] = value;
  }
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_VERSION, createdAt, stores: present };
}

/** `rhythm-master-backup-2026-10-03.json` — the day it was made (AC-7.6.1/1). */
export function backupFilename(createdAt) {
  return `${BACKUP_FORMAT}-${String(createdAt).slice(0, 10)}.json`;
}

const NOT_A_BACKUP = 'This file is not a Rhythm Master backup.';
const NEWER = 'This backup was made by a newer version of Rhythm Master. Update the app to restore it.';

/**
 * Check a backup file's text before anything is written (AC-7.6.3). Never
 * throws: returns `{ ok: true, stores }` or `{ ok: false, error }`, the error
 * worded for the musician.
 *
 * `shapes` names the stores this build keeps and what each must hold:
 * `{ [key]: { list: 'patterns' } }` for a store holding a list of entries with
 * ids, `{ [key]: { map: 'byPatternId' } }` for one keyed by Pattern id, `{}`
 * for a flat one. `storeVersion` is the newest store schemaVersion this build
 * understands; an older one is upgraded by the caller's migrations.
 */
export function readBackup(text, { shapes, storeVersion }) {
  const fail = (error) => ({ ok: false, error });

  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return fail(NOT_A_BACKUP);
  }
  if (!isPlainObject(file) || file.format !== BACKUP_FORMAT) return fail(NOT_A_BACKUP);
  if (!Number.isInteger(file.schemaVersion) || file.schemaVersion < 1) return fail(NOT_A_BACKUP);
  if (file.schemaVersion > BACKUP_VERSION) return fail(NEWER);
  if (!isPlainObject(file.stores)) return fail(NOT_A_BACKUP);

  for (const [key, store] of Object.entries(file.stores)) {
    const shape = shapes[key];
    const damaged = (why) => fail(`This backup is damaged and cannot be restored: ${why}.`);
    if (!shape) return damaged(`it holds an unknown store "${key}"`);
    if (!isPlainObject(store) || !Number.isInteger(store.schemaVersion)) {
      return damaged(`"${key}" has no schemaVersion`);
    }
    if (store.schemaVersion > storeVersion) return fail(NEWER);

    if (shape.list) {
      const entries = store[shape.list];
      if (!Array.isArray(entries)) return damaged(`"${key}" ${shape.list} is not a list`);
      const seen = new Set();
      for (const entry of entries) {
        if (!isPlainObject(entry) || typeof entry.id !== 'string' || entry.id === '') {
          return damaged(`an entry in ${shape.list} has no id`);
        }
        if (seen.has(entry.id)) return damaged(`two entries in ${shape.list} share the id "${entry.id}"`);
        seen.add(entry.id);
      }
    }
    if (shape.map && shape.map in store && !isPlainObject(store[shape.map])) {
      return damaged(`"${key}" ${shape.map} is not keyed by id`);
    }
  }
  return { ok: true, stores: file.stores };
}
