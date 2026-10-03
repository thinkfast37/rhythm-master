/**
 * The whole-library backup (US-7.6): what the file holds, how a restore
 * replaces the stores, and which files are refused with nothing written.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useBackingStore, rawOf } from '../../../src/storage/keyValue.js';
import { backupText, checkBackup, restoreBackup } from '../../../src/storage/backup.js';
import { BACKUP_FORMAT, BACKUP_VERSION, backupFilename, buildBackup } from '../../../src/core/backup.js';
import * as patternStore from '../../../src/storage/patterns.js';
import * as overlayStore from '../../../src/storage/overlays.js';
import * as songStore from '../../../src/storage/songs.js';
import * as settingsStore from '../../../src/storage/settings.js';
import * as localMetaStore from '../../../src/storage/localMeta.js';
import * as seedStore from '../../../src/storage/seed.js';

const KEYS = [patternStore.KEY, overlayStore.KEY, songStore.KEY, settingsStore.KEY, localMetaStore.KEY];
const CREATED = '2026-10-03T14:05:09.000Z';

let backing;
beforeEach(() => {
  backing = new Map();
  useBackingStore(backing);
});

const shipped = () => seedStore.loadAll()[0];

/** A library with something in every store. */
function fillLibrary() {
  const mine = { ...structuredClone(shipped()), id: 'p_1', name: 'My Groove' };
  patternStore.upsert(mine);
  overlayStore.setRating(shipped().id, 4);
  overlayStore.setAddedTags(shipped().id, ['warmup']);
  overlayStore.setKeptFills(shipped().id, ['up']);
  songStore.upsert({ id: 'song_1', name: 'Verse', sections: [{ patternId: 'p_1', entries: [] }] });
  settingsStore.save({ countingSystem: 'numbered', goal: 'lab' });
  localMetaStore.update('p_1', { submittedAt: '2026-10-01T00:00:00Z', duplicateResolved: true });
}

const snapshot = () => Object.fromEntries(KEYS.map((k) => [k, rawOf(k) ?? null]));
const parsedSnapshot = () =>
  Object.fromEntries(KEYS.map((k) => [k, rawOf(k) === null ? null : JSON.parse(rawOf(k))]));

const backupOf = (stores, extra = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: BACKUP_VERSION, createdAt: CREATED, stores, ...extra });

describe('US-7.6 — backing up the whole library (AC-7.6.1)', () => {
  it('AC-7.6.1/2 — The file holds every store the app keeps — Patterns, overlays, Songs, settings and Local Metadata — each exactly as stored, and a store never written is absent', () => {
    fillLibrary();
    const file = JSON.parse(backupText(CREATED));
    expect(Object.keys(file.stores).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) expect(file.stores[key]).toEqual(JSON.parse(rawOf(key)));
    expect(file.stores[localMetaStore.KEY].byPatternId.p_1.submittedAt).toBe('2026-10-01T00:00:00Z');
  });

  it('AC-7.6.1/2 — The file holds every store the app keeps — Patterns, overlays, Songs, settings and Local Metadata — each exactly as stored, and a store never written is absent: an untouched store is left out', () => {
    overlayStore.setRating(shipped().id, 3);
    const file = JSON.parse(backupText(CREATED));
    expect(Object.keys(file.stores)).toEqual([overlayStore.KEY]);
    expect(buildBackup({ a: null, b: undefined, c: { schemaVersion: 1 } }, CREATED).stores).toEqual({
      c: { schemaVersion: 1 },
    });
  });

  it('AC-7.6.1/3 — The file names its format and carries its own schemaVersion and the time it was made', () => {
    const file = JSON.parse(backupText(CREATED));
    expect(file.format).toBe('rhythm-master-backup');
    expect(file.schemaVersion).toBe(1);
    expect(file.createdAt).toBe(CREATED);
    expect(backupFilename(CREATED)).toBe('rhythm-master-backup-2026-10-03.json');
  });

  it('AC-7.6.1/4 — Shipped Patterns are not in the file; the ratings, added Tags and Keeps on them are, in the overlays', () => {
    fillLibrary();
    const file = JSON.parse(backupText(CREATED));
    const ids = file.stores[patternStore.KEY].patterns.map((p) => p.id);
    expect(ids).toEqual(['p_1']);
    for (const p of seedStore.loadAll()) expect(ids).not.toContain(p.id);
    const overlay = file.stores[overlayStore.KEY].byPatternId[shipped().id];
    expect(overlay).toMatchObject({ rating: 4, addedTags: ['warmup'], keptFills: ['up'] });
  });
});

describe('US-7.6 — restoring the whole library (AC-7.6.2)', () => {
  it("AC-7.6.2/2 — Confirmed, every store in the file is written and every store the file lacks is cleared, so the stores afterwards are exactly the backup's", () => {
    fillLibrary();
    const file = backupOf({
      [patternStore.KEY]: { schemaVersion: 1, patterns: [{ ...structuredClone(shipped()), id: 'p_9', name: 'Other' }] },
      [settingsStore.KEY]: { schemaVersion: 1, countingSystem: 'numbered', goal: 'play' },
    });
    expect(restoreBackup(file).ok).toBe(true);

    expect(patternStore.loadAll().map((p) => p.name)).toEqual(['Other']);
    expect(settingsStore.load().goal).toBe('play');
    expect(rawOf(overlayStore.KEY)).toBeNull();
    expect(rawOf(songStore.KEY)).toBeNull();
    expect(rawOf(localMetaStore.KEY)).toBeNull();
    expect(overlayStore.forPattern(shipped().id).rating).toBeUndefined();
  });

  it('AC-7.6.2/4 — Backing up and restoring round-trips: a backup restored into an emptied app gives back every store unchanged', () => {
    fillLibrary();
    const before = parsedSnapshot();
    const text = backupText(CREATED);

    useBackingStore(new Map());
    expect(KEYS.every((k) => rawOf(k) === null)).toBe(true);
    expect(restoreBackup(text).ok).toBe(true);

    expect(parsedSnapshot()).toEqual(before);
  });
});

describe('US-7.6 — files that cannot be restored (AC-7.6.3)', () => {
  /** Every refusal: not ok, a reason, and not one store changed. */
  function expectRefused(text, reason) {
    fillLibrary();
    const before = snapshot();
    const result = restoreBackup(text);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(reason);
    expect(checkBackup(text).ok).toBe(false);
    expect(snapshot()).toEqual(before);
  }

  it('AC-7.6.3/1 — A file that is not JSON, or not a Rhythm Master backup, is refused with a message and leaves the library as it was', () => {
    expectRefused('not json at all {', /not a Rhythm Master backup/);
    expectRefused(JSON.stringify({ schemaVersion: 1, patterns: [] }), /not a Rhythm Master backup/);
    expectRefused(JSON.stringify([1, 2, 3]), /not a Rhythm Master backup/);
    expectRefused(JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 1 }), /not a Rhythm Master backup/);
    expectRefused(JSON.stringify({ format: BACKUP_FORMAT, stores: {} }), /not a Rhythm Master backup/);
  });

  it('AC-7.6.3/2 — A backup, or any store in it, at a schemaVersion newer than this build understands is refused rather than downgraded, and nothing is written', () => {
    expectRefused(backupOf({}, { schemaVersion: BACKUP_VERSION + 1 }), /newer version/);
    expectRefused(backupOf({ [settingsStore.KEY]: { schemaVersion: 99, countingSystem: 'numbered' } }), /newer version/);
  });

  it('AC-7.6.3/3 — A backup with a malformed store — Patterns or Songs not a list, an entry without an id, two entries sharing one, an unknown store — is refused and nothing is written', () => {
    const p = { ...structuredClone(shipped()), id: 'p_1' };
    expectRefused(backupOf({ [patternStore.KEY]: { schemaVersion: 1, patterns: {} } }), /damaged/);
    expectRefused(backupOf({ [songStore.KEY]: { schemaVersion: 1, songs: 'x' } }), /damaged/);
    expectRefused(backupOf({ [patternStore.KEY]: { schemaVersion: 1, patterns: [{ ...p, id: '' }] } }), /no id/);
    expectRefused(backupOf({ [songStore.KEY]: { schemaVersion: 1, songs: [{ name: 'x', sections: [] }] } }), /no id/);
    expectRefused(backupOf({ [patternStore.KEY]: { schemaVersion: 1, patterns: [p, p] } }), /share the id/);
    expectRefused(backupOf({ 'rm.somethingElse.v1': { schemaVersion: 1 } }), /unknown store/);
    expectRefused(backupOf({ [overlayStore.KEY]: { schemaVersion: 1, byPatternId: [] } }), /damaged/);
    expectRefused(backupOf({ [settingsStore.KEY]: { countingSystem: 'numbered' } }), /schemaVersion/);
  });

  it('a write failing part-way puts every store back as it was', () => {
    fillLibrary();
    const before = parsedSnapshot();
    const text = backupOf({
      [patternStore.KEY]: { schemaVersion: 1, patterns: [] },
      [settingsStore.KEY]: { schemaVersion: 1, goal: 'play' },
    });
    // Writes that fail on the second, as a full quota would: Patterns is
    // written, overlays and Songs cleared, and settings throws.
    let writes = 0;
    const set = backing.set.bind(backing);
    backing.set = (k, v) => {
      writes += 1;
      if (writes === 2) throw new Error('QuotaExceededError');
      return set(k, v);
    };
    expect(() => restoreBackup(text)).toThrow('QuotaExceededError');
    expect(parsedSnapshot()).toEqual(before);
  });
});
