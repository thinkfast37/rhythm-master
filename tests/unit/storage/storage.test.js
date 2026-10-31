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

  it('upsert replaces by id rather than appending a duplicate', () => {
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

  it('an empty store reads as an empty library, not an error', () => {
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
  it('AC-11.3.5 — Resolved-pair tracking is Local Metadata: Local Metadata lives under its own key, keyed by Pattern id', () => {
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

  it('an undeclared Local Metadata field is refused rather than smuggled in', () => {
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

  it('data at the current version passes through untouched', () => {
    const data = { schemaVersion: 1, patterns: [] };
    expect(migrate(data)).toEqual(data);
  });

  it('data from a newer build is refused, never downgraded', () => {
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
    // Legacy per-group entries, as the pre-AC-4.4.12 control wrote them.
    overlays.update('s_1', { swing: { '0.0.0': 30 } });

    const applied = overlays.applyPlaybackTo(seed);
    expect(applied.tempo).toBe(150);
    expect(applied.measures[0].beats[0].swing).toEqual({ 0: 30 });
    expect(seed.tempo).not.toBe(150);
    expect(seed.measures[0].beats[0].swing).toBeUndefined();
  });

  it('skips a stale swing entry that no longer resolves against the Pattern', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    overlays.update('s_2', { swing: { '5.0.0': 30 } }); // measure 5 does not exist
    const applied = overlays.applyPlaybackTo({ ...create('Shipped'), id: 's_2' });
    expect(applied.measures[0].beats[0].swing).toBeUndefined();
  });

  it('applies a remembered Pattern-wide swing amount, with legacy per-group entries still winning as overrides', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    const seed = { ...create('Shipped'), id: 's_6' };
    overlays.setSwingAmount('s_6', 35);
    overlays.update('s_6', { swing: { '0.1.0': 70 } }); // a legacy entry left from before

    const applied = overlays.applyPlaybackTo(seed);
    expect(applied.swingAmount).toBe(35);
    expect(applied.measures[0].beats[1].swing).toEqual({ 0: 70 });
    expect(seed.swingAmount).toBeUndefined();
  });

  it('setSwingAmount drops legacy per-group entries — the control just cleared those overrides', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    overlays.update('s_7', { swing: { '0.0.0': 30 } });
    overlays.setSwingAmount('s_7', 50);
    const overlay = overlays.forPattern('s_7');
    expect(overlay.swingAmount).toBe(50);
    expect(overlay.swing).toBeUndefined();
  });

  it("AC-2.8.1/4 — Keeps are per Pattern, shipped and custom alike, and survive a reload; a different Pattern shows its own keeps and none of this one's: the store", async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    overlays.setKeptFills('s_8', ['root-fifth', 'alberti']);
    overlays.setKeptFills('p_3', ['drone-root']);
    expect(overlays.keptFillsFor('s_8')).toEqual(['root-fifth', 'alberti']);
    expect(overlays.keptFillsFor('p_3')).toEqual(['drone-root']);
    expect(overlays.keptFillsFor('s_9')).toEqual([]);
    // Straight back out of the store, as a reload would read it.
    expect(overlays.loadAll().s_8.keptFills).toEqual(['root-fifth', 'alberti']);
    // Playback settings are untouched by a keep, and a keep by them.
    overlays.setTempo('s_8', 120);
    expect(overlays.keptFillsFor('s_8')).toEqual(['root-fifth', 'alberti']);
    expect(overlays.applyPlaybackTo({ ...create('Shipped'), id: 's_8' }).keptFills).toBeUndefined();
  });

  it('returns the Pattern as-is when nothing is remembered', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    const seed = { ...create('Shipped'), id: 's_3' };
    expect(overlays.applyPlaybackTo(seed)).toBe(seed);
  });

  it('applies a remembered swing feel onto a loaded copy, leaving the original untouched', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    const seed = { ...create('Shipped'), id: 's_4' };
    overlays.setSwingFeel('s_4', 'sixteenth');

    const applied = overlays.applyPlaybackTo(seed);
    expect(applied.swingFeel).toBe('sixteenth');
    expect(seed.swingFeel).toBeUndefined();
  });

  it('skips a remembered swing feel this build does not know', async () => {
    const overlays = await import('../../../src/storage/overlays.js');
    overlays.setSwingFeel('s_5', 'shuffle');
    const applied = overlays.applyPlaybackTo({ ...create('Shipped'), id: 's_5' });
    expect(applied.swingFeel).toBeUndefined();
  });
});

describe('storage/settings — My list across a re-spelled catalogue', () => {
  it('AC-2.12.1/4 — When the catalogue re-spells a song progression or retires an entry for its four-chord form, its tick on My list moves to the entry that now holds that song’s section or that form, so the list keeps the same music', async () => {
    const { PROGRESSION_RENAMES, renameProgressions } = await import('../../../src/storage/progressionRenames.js');
    const { PROGRESSIONS } = await import('../../../src/core/harmony.js');
    const { SONGBOOK } = await import('../../../src/core/songbook.js');
    const ids = new Set(PROGRESSIONS.map((p) => p.id));
    // Reckoner's verse was i–♭VII–♭VI–i–♭VI before AC-2.6.1/19; ticked under that
    // id, it is ticked under the entry that holds the verse now.
    const verse = SONGBOOK.find((c) => c.title === 'Reckoner' && c.section === 'verse').progression;
    expect(PROGRESSION_RENAMES['i-bVII-bVI-i-bVI']).toEqual([verse]);
    settings.save({ progressionCycleFrom: 'list', progressionCycleList: ['I-IV-V', 'i-bVII-bVI-i-bVI'] });
    expect(settings.load().progressionCycleList).toEqual(['I-IV-V', verse]);
    // A three-chord entry of a heading's own retired for its four-chord form (AC-2.6.1/20) is ticked as that form.
    settings.save({ progressionCycleFrom: 'list', progressionCycleList: ['vi-V-I', 'Vsus4-V-I'] });
    expect(settings.load().progressionCycleList).toEqual(['vi-vi-V-I', 'Vsus4-V-I-I']);
    // An id that was never renamed, or is already current, is left as it is, once.
    expect(renameProgressions([verse, 'i-bVII-bVI-i-bVI', 'ii-V-I'])).toEqual([verse, 'ii-V-I']);
    // Every rename is from an id the catalogue no longer has to ids it does.
    for (const [from, to] of Object.entries(PROGRESSION_RENAMES)) {
      expect(ids.has(from), from).toBe(false);
      for (const id of to) expect(ids.has(id), `${from} → ${id}`).toBe(true);
    }
    // The fills list is not a progressions list and is never renamed.
    settings.save({ fillCycleList: ['i-bVII-bVI-i-bVI'] });
    expect(settings.load().fillCycleList).toEqual(['i-bVII-bVI-i-bVI']);
  });
});
