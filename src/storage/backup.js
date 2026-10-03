/**
 * Backing up and restoring every store at once (US-7.6). The file's shape and
 * what it refuses are `core/backup.js`; this module is the localStorage side.
 *
 * Restore replaces: a store the file holds is written, a store it lacks is
 * cleared, so the installation afterwards holds exactly what the backup did
 * (AC-7.6.2/2). Nothing is written until the whole file has been checked and
 * every store in it migrated (AC-7.6.3).
 */
import { buildBackup, readBackup } from '../core/backup.js';
import { rawOf, writeStore, clearStore } from './keyValue.js';
import { migrate, CURRENT_VERSION } from './migrate.js';
import * as patterns from './patterns.js';
import * as overlays from './overlays.js';
import * as songs from './songs.js';
import * as settings from './settings.js';
import * as localMeta from './localMeta.js';

/** Every store the app keeps, and what each must hold. */
const SHAPES = {
  [patterns.KEY]: { list: 'patterns' },
  [overlays.KEY]: { map: 'byPatternId' },
  [songs.KEY]: { list: 'songs' },
  [settings.KEY]: {},
  [localMeta.KEY]: { map: 'byPatternId' },
};

const KEYS = Object.keys(SHAPES);

/** Each store's stored JSON, parsed but otherwise exactly as stored; null when never written. */
function storedStores() {
  return Object.fromEntries(
    KEYS.map((key) => {
      const raw = rawOf(key);
      return [key, raw === null || raw === undefined ? null : JSON.parse(raw)];
    })
  );
}

/** The backup file's text, made at `createdAt` (an ISO timestamp). */
export function backupText(createdAt) {
  return JSON.stringify(buildBackup(storedStores(), createdAt), null, 2);
}

/**
 * Check a backup without writing anything: `{ ok: true, stores }` with every
 * store migrated to this build's schema, or `{ ok: false, error }`.
 */
export function checkBackup(text) {
  const read = readBackup(text, { shapes: SHAPES, storeVersion: CURRENT_VERSION });
  if (!read.ok) return read;
  const stores = {};
  try {
    for (const [key, store] of Object.entries(read.stores)) stores[key] = migrate(store);
  } catch (e) {
    return { ok: false, error: `This backup cannot be restored: ${e.message}` };
  }
  return { ok: true, stores };
}

/**
 * Replace every store with the backup's. Returns what `checkBackup` returned;
 * on `ok: false` nothing has been written. A write that fails part-way puts
 * every store back as it was and rethrows.
 */
export function restoreBackup(text) {
  const checked = checkBackup(text);
  if (!checked.ok) return checked;
  const before = storedStores();
  try {
    for (const key of KEYS) {
      if (key in checked.stores) writeStore(key, checked.stores[key]);
      else clearStore(key);
    }
  } catch (e) {
    for (const key of KEYS) {
      if (before[key] === null) clearStore(key);
      else writeStore(key, before[key]);
    }
    throw e;
  }
  return checked;
}
