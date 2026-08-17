import { describe, it, expect } from 'vitest';
import * as seed from '../../../src/storage/seed.js';
import { validate } from '../../../src/core/pattern.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import { beatCount, isSupported } from '../../../src/core/meter.js';
import { SEED_PATTERN_COUNT } from '../../seed-count.js';

const library = seed.loadAll();

/**
 * The size of the library as converted from the predecessor application. A
 * historical figure, not the library's size: everything from index 110 onward
 * was authored later and is appended, never inserted (see data/README.md).
 */
const CONVERTED_LIBRARY_SIZE = 110;

describe('the shipped Pattern library', () => {
  it('AC-16.1.1 — the app arrives stocked with every shipped Pattern', () => {
    expect(library).toHaveLength(SEED_PATTERN_COUNT);
    expect(library.length).toBeGreaterThanOrEqual(CONVERTED_LIBRARY_SIZE);
  });

  it('AC-16.1.2 — every shipped Pattern is valid against the data model', () => {
    const { valid, errors } = seed.validateAll();
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it('AC-16.1.3 — the conversion preserved every note from the predecessor', () => {
    // 1,053 at conversion, less the 26 notes in the two placeholder Patterns
    // ("New Rhythm", "My Rhythm") removed during the 2026-08-17 tag audit.
    // Counted over the converted slice, so later additions cannot disturb it.
    expect(seed.noteOnCount(library.slice(0, CONVERTED_LIBRARY_SIZE))).toBe(1027);
  });

  it('AC-16.1.4 — ids are deterministic, unique, and derived from seed position', () => {
    const ids = library.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(seed.seedId(0));
    // Reloading yields the same ids, so Local Metadata keyed to one survives.
    expect(seed.loadAll().map((p) => p.id)).toEqual(ids);
  });

  it('AC-16.1.5 — every Measure holds exactly its numerator in Beats', () => {
    for (const p of library) {
      for (const [i, m] of p.measures.entries()) {
        expect(isSupported(m.timeSignature), `${p.name} measure ${i + 1}`).toBe(true);
        expect(m.beats.length, `${p.name} measure ${i + 1} (${m.timeSignature})`).toBe(
          beatCount(m.timeSignature)
        );
      }
    }
  });

  it('AC-16.1.6 — sub-measure drill cells became short meters, not padded or repeated bars', () => {
    const short = library.filter((p) => p.measures.some((m) => ['1/4', '2/4'].includes(m.timeSignature)));
    expect(short.length).toBeGreaterThan(0);
    // A drill cell keeps its original loop length: one Beat stays one Beat.
    for (const p of short) {
      for (const m of p.measures) {
        if (m.timeSignature === '1/4') expect(m.beats).toHaveLength(1);
        if (m.timeSignature === '2/4') expect(m.beats).toHaveLength(2);
      }
    }
  });

  it('AC-16.1.7 — no shipped Pattern exceeds the six-Measure cap', () => {
    for (const p of library) {
      expect(p.measures.length, p.name).toBeLessThanOrEqual(6);
    }
  });

  it('AC-16.1.8 — every shipped Pattern builds a playable timeline', () => {
    for (const p of library) {
      expect(() => buildTimeline(p), p.name).not.toThrow();
    }
  });

  it('AC-16.1.9 — every melodic Pattern carries a Key and a pitch on every sounding Slot', () => {
    for (const p of library.filter((x) => x.soundMode === 'melodic')) {
      expect(p.key, p.name).toBeTruthy();
      for (const m of p.measures) {
        for (const b of m.beats) {
          for (const s of b.slots) {
            if (s.on) expect(s.pitch, `${p.name}`).toBeDefined();
          }
        }
      }
    }
  });

  it('AC-16.1.10 — shipped Patterns store no id-bearing or automatic-Tag cruft', () => {
    for (const p of library) {
      expect(validate(p).valid, p.name).toBe(true);
      for (const t of p.tags) {
        expect(['custom', 'swing', 'percussive', 'melodic']).not.toContain(String(t).toLowerCase());
      }
    }
  });

  it('AC-16.1.11 — a shipped Pattern cannot be mutated in place', () => {
    const p = library[0];
    expect(Object.isFrozen(p)).toBe(true);
    expect(() => {
      'use strict';
      p.tempo = 999;
    }).toThrow();
    expect(p.tempo).not.toBe(999);
  });

  it('AC-16.2.1 — a Pattern can be found by its id', () => {
    expect(seed.findById(seed.seedId(3))).toBe(library[3]);
    expect(seed.findById('nope')).toBeNull();
  });

  it('AC-16.2.2 — the seed file carries a schema version and no ids of its own', () => {
    // Ids are assigned on load; the file itself stays a plain list of music.
    expect(library.every((p) => p.id)).toBe(true);
  });

  it('AC-16.2.3 — adding a Pattern is a data edit: the loader needs only the documented fields', () => {
    const handWritten = {
      name: 'Hand Added',
      soundMode: 'percussive',
      tempo: 100,
      tags: ['test'],
      rating: 0,
      measures: [
        {
          timeSignature: '4/4',
          beats: Array.from({ length: 4 }, () => ({
            recipe: 'straight-16ths',
            slots: [{ on: true }, { on: false }, { on: false }, { on: false }],
          })),
        },
      ],
    };
    expect(validate(handWritten).valid).toBe(true);
    expect(() => buildTimeline(handWritten)).not.toThrow();
  });

  it('AC-16.2.4 — a hand-added Pattern with a bad Beat count is rejected, not silently loaded', () => {
    const broken = {
      name: 'Broken',
      soundMode: 'percussive',
      tempo: 100,
      tags: [],
      rating: 0,
      measures: [{ timeSignature: '4/4', beats: [{ recipe: 'straight-16ths', slots: [{ on: true }] }] }],
    };
    expect(validate(broken).valid).toBe(false);
  });
});
