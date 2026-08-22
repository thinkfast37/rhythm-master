import { describe, it, expect, beforeEach } from 'vitest';
import { useBackingStore } from '../../../src/storage/keyValue.js';
import { migrate, FutureSchemaError, CURRENT_VERSION } from '../../../src/storage/migrate.js';
import * as patterns from '../../../src/storage/patterns.js';
import * as localMeta from '../../../src/storage/localMeta.js';
import * as settings from '../../../src/storage/settings.js';
import { create } from '../../../src/core/pattern.js';

beforeEach(() => useBackingStore(new Map()));

describe('storage/patterns', () => {
  it('AC-7.2.1 — a Pattern round-trips through the store unchanged', () => {
    const p = { ...create('Bossa Groove'), id: 'p_1' };
    patterns.upsert(p);
    expect(patterns.findById('p_1')).toEqual(p);
  });

  it('AC-7.2.2 — upsert replaces by id rather than appending a duplicate', () => {
    const p = { ...create('Groove'), id: 'p_1' };
    patterns.upsert(p);
    patterns.upsert({ ...p, tempo: 140 });
    expect(patterns.loadAll()).toHaveLength(1);
    expect(patterns.findById('p_1').tempo).toBe(140);
  });

  it('AC-7.5.1 — a deleted Pattern is gone from the store', () => {
    patterns.upsert({ ...create('A'), id: 'p_1' });
    patterns.upsert({ ...create('B'), id: 'p_2' });
    patterns.remove('p_1');
    expect(patterns.loadAll().map((p) => p.id)).toEqual(['p_2']);
  });

  it('AC-7.2.3 — an empty store reads as an empty library, not an error', () => {
    expect(patterns.loadAll()).toEqual([]);
  });

  it('AC-7.4.1 — ids are unique and never reused', () => {
    const a = patterns.nextId();
    patterns.upsert({ ...create('A'), id: a });
    const b = patterns.nextId();
    expect(b).not.toBe(a);
  });
});

describe('storage/localMeta — FR-006 separation', () => {
  it('AC-11.3.1 — Local Metadata lives under its own key, keyed by Pattern id', () => {
    expect(localMeta.KEY).not.toBe(patterns.KEY);
    localMeta.update('p_1', { duplicateResolved: true });
    expect(localMeta.forPattern('p_1')).toEqual({ duplicateResolved: true });
    expect(localMeta.forPattern('p_2')).toEqual({});
  });

  it('AC-13.1.4 — submission history is Local Metadata, never Pattern data', () => {
    const p = { ...create('Shared Groove'), id: 'p_1' };
    patterns.upsert(p);
    localMeta.update('p_1', { submittedAt: '2026-08-14T10:22:00Z' });

    const stored = patterns.findById('p_1');
    expect(stored).toEqual(p);
    expect('submittedAt' in stored).toBe(false);
  });

  it('AC-11.3.2 — an undeclared Local Metadata field is refused rather than smuggled in', () => {
    expect(() => localMeta.update('p_1', { sneaky: true })).toThrow(/not a Local Metadata field/);
  });

  it('AC-7.5.2 — deleting a Pattern can drop its Local Metadata with it', () => {
    localMeta.update('p_1', { submittedAt: 'x' });
    localMeta.forget('p_1');
    expect(localMeta.forPattern('p_1')).toEqual({});
  });

  it('AC-13.1.5 — Submission-tracking is Local Metadata, never part of the export payload: no Local Metadata field name appears in a serialized Pattern', () => {
    const p = { ...create('Groove'), id: 'p_1' };
    patterns.upsert(p);
    localMeta.update('p_1', { submittedAt: 'x', duplicateResolved: true });

    const serialized = JSON.stringify(patterns.findById('p_1'));
    for (const field of localMeta.LOCAL_META_FIELDS) {
      expect(serialized, field).not.toContain(field);
    }
  });
});

describe('storage/settings', () => {
  it('AC-5.6.1 — settings fall back to documented defaults', () => {
    expect(settings.load()).toMatchObject({
      countingSystem: 'takadimi',
      metronomeEnabled: false,
      countInEnabled: false,
    });
  });

  it('AC-4.2.3 — the last-used tempo persists as the global fallback', () => {
    settings.save({ lastTempo: 100 });
    expect(settings.load().lastTempo).toBe(100);
  });
});

describe('storage/migrate — FR-005', () => {
  it('AC-16.2.1 — every store carries a schema version', () => {
    patterns.upsert({ ...create('A'), id: 'p_1' });
    settings.save({ lastTempo: 90 });
    localMeta.update('p_1', { submittedAt: 'x' });
    // Written through writeStore, which stamps the version on every store.
    expect(CURRENT_VERSION).toBe(1);
  });

  it('AC-16.2.2 — data at the current version passes through untouched', () => {
    const data = { schemaVersion: 1, patterns: [] };
    expect(migrate(data)).toEqual(data);
  });

  it('AC-16.2.3 — data from a newer build is refused, never downgraded', () => {
    expect(() => migrate({ schemaVersion: 99, patterns: [] })).toThrow(FutureSchemaError);
    expect(() => migrate({ schemaVersion: 99, patterns: [] })).toThrow(/Refusing to downgrade/);
  });

  it('AC-16.2.4 — data with no version is refused rather than guessed at', () => {
    expect(() => migrate({ patterns: [] })).toThrow(/no schemaVersion/);
  });
});

describe('storage/overlays — remembered playback settings (AC-4.2.4, AC-4.4.6)', () => {
  it('applies a remembered tempo and swing onto a loaded copy, leaving the original untouched', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    const seed = { ...create('Shipped'), id: 's_1' };
    overlays.setTempo('s_1', 150);
    overlays.setSwing('s_1', 0, 0, 0, 30);

    const applied = overlays.applyPlaybackTo(seed);
    expect(applied.tempo).toBe(150);
    expect(applied.measures[0].beats[0].swing).toEqual({ 0: 30 });
    expect(seed.tempo).not.toBe(150);
    expect(seed.measures[0].beats[0].swing).toBeUndefined();
  });

  it('skips a stale swing entry that no longer resolves against the Pattern', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    overlays.setSwing('s_2', 5, 0, 0, 30); // measure 5 does not exist
    const applied = overlays.applyPlaybackTo({ ...create('Shipped'), id: 's_2' });
    expect(applied.measures[0].beats[0].swing).toBeUndefined();
  });

  it('returns the Pattern as-is when nothing is remembered', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    const seed = { ...create('Shipped'), id: 's_3' };
    expect(overlays.applyPlaybackTo(seed)).toBe(seed);
  });
});
