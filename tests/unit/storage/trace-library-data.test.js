/**
 * The shipped library's conversion and data rules, proved criterion by criterion
 * (US-16.1, US-16.2).
 *
 * The conversion criteria (AC-16.1.3 … AC-16.1.9) describe what the converter does to
 * a legacy Pattern, so they are proved against `convert` itself, fed legacy-shaped
 * input — not against the shipped file, which has been curated by hand since the
 * conversion (T130 merged "Song Signatures" into "Song", for one) and so no longer
 * shows what the converter emits.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { convert } from '../../../tools/convert-legacy-patterns.js';
import * as seed from '../../../src/storage/seed.js';
import { MAX_MEASURES, validate, automaticTags } from '../../../src/core/pattern.js';
import { TIME_SIGNATURES, beatCount } from '../../../src/core/meter.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import realSeed from '../../../data/seed-patterns.json';

/** A legacy straight beat: four slots, `null` for an empty one. */
const S = (...slots) => ({ type: 'S', slots });
/** A legacy triplet beat: three slots. */
const T = (...slots) => ({ type: 'T', slots });

const legacy = (over = {}) => ({
  name: 'Legacy',
  cat: 'Song Signatures',
  disp: 'search text',
  ts: '4/4',
  bpm: 96,
  beats: [S('ta', null, 'di', null), S('ta', null, null, null), S('ta', null, null, null), S('ta', null, null, null)],
  ...over,
});

describe('US-16.1 — the conversion from the predecessor', () => {
  it('AC-16.1.3 — Legacy category becomes a Tag', () => {
    const p = convert(legacy({ cat: 'Song Signatures' }));
    expect(p.tags).toEqual(['Song Signatures']);
    // A user-style Tag: stored on the Pattern, and not one of the automatic ones,
    // which are derived alongside it rather than written (AC-5.3.1).
    expect(validate(p).valid).toBe(true);
    const automatic = automaticTags(p, false);
    expect(automatic).toEqual(['built-in', 'percussive']);
    expect(automatic).not.toContain('Song Signatures');
  });

  it('AC-16.1.4 — Straight and triplet beats map to Recipes', () => {
    const p = convert(
      legacy({
        ts: '2/4',
        beats: [S('ta', null, 'mi', null), T('ta', null, 'ki')],
      })
    );
    const [straight, triplet] = p.measures[0].beats;
    expect(straight.recipe).toBe('straight-16ths');
    expect(straight.slots.map((s) => s.on)).toEqual([true, false, true, false]);
    expect(triplet.recipe).toBe('triplet-8ths');
    expect(triplet.slots.map((s) => s.on)).toEqual([true, false, true]);
  });

  it('AC-16.1.5 — One Pattern-wide meter becomes a per-Measure Time Signature', () => {
    const eight = Array.from({ length: 8 }, () => S('ta', null, null, null));
    const p = convert(legacy({ ts: '4/4', beats: eight }));
    expect(p.measures).toHaveLength(2);
    for (const m of p.measures) {
      expect(m.timeSignature).toBe('4/4');
      expect(m.beats).toHaveLength(4);
      expect(m.beats).toHaveLength(beatCount(m.timeSignature)); // AC-1.2.2
    }
  });

  it('AC-16.1.8 — Melodic Patterns have their pitches resolved at conversion time', () => {
    // The predecessor cycled 1-3-5-7 across sounding slots at playback time; the
    // converted Pattern must carry, on each active Slot, the degree it would have sounded.
    const p = convert(
      legacy({
        soundScheme: '1-3-5-7',
        key: 'Eb',
        beats: [
          S('ta', null, 'di', null),
          S('ta', 'ka', 'di', null),
          S(null, null, null, null),
          S('ta', null, null, null),
        ],
      })
    );
    expect(p.soundMode).toBe('melodic');
    expect(p.key).toBe('Eb');
    const sounding = p.measures.flatMap((m) => m.beats.flatMap((b) => b.slots)).filter((s) => s.on);
    expect(sounding.map((s) => s.pitch.degree)).toEqual(['1', '3', '5', '7', '1', '3']);
    for (const s of sounding) expect(s.pitch.octaveOffset).toBe(0);
    // Nothing is left to cycle at playback: every note is already a fixed Pitch.
    expect(() => buildTimeline(p)).not.toThrow();
    expect(buildTimeline(p).filter((e) => e.pitch)).toHaveLength(sounding.length);
  });

  it('AC-16.1.8 — Melodic Patterns have their pitches resolved at conversion time: a trailing comma drops the octave', () => {
    const p = convert(
      legacy({
        soundScheme: 'custom',
        customSchemeData: ['1', '5,', 'b3'],
        beats: [S('ta', 'ka', 'di', 'mi'), S(null, null, null, null), S(null, null, null, null), S(null, null, null, null)],
      })
    );
    const pitches = p.measures[0].beats[0].slots.map((s) => s.pitch);
    expect(pitches).toEqual([
      { degree: '1', octaveOffset: 0 },
      { degree: '5', octaveOffset: -1 },
      { degree: 'b3', octaveOffset: 0 },
      { degree: '1', octaveOffset: 0 },
    ]);
  });

  it('AC-16.1.9 — Trailing silent Measures are dropped', () => {
    const sounding = Array.from({ length: 4 }, () => S('ta', null, null, null));
    const silent = Array.from({ length: 4 }, () => S(null, null, null, null));
    const p = convert(legacy({ beats: [...sounding, ...silent, ...silent] }));
    expect(p.measures).toHaveLength(1);
    expect(p.measures[0].beats.every((b) => b.slots[0].on)).toBe(true);
  });

  it('AC-16.1.9 — Trailing silent Measures are dropped: a silent Measure inside the Pattern is kept', () => {
    const sounding = Array.from({ length: 4 }, () => S('ta', null, null, null));
    const silent = Array.from({ length: 4 }, () => S(null, null, null, null));
    const p = convert(legacy({ beats: [...sounding, ...silent, ...sounding] }));
    expect(p.measures).toHaveLength(3);
  });

  it('AC-16.1.10 — Seeded data satisfies every structural rule in this specification', () => {
    const library = seed.loadAll();
    expect(library.length).toBeGreaterThan(0);
    for (const p of library) {
      expect(p.measures.length, p.name).toBeLessThanOrEqual(MAX_MEASURES); // AC-1.1.3
      for (const [mi, m] of p.measures.entries()) {
        const where = `${p.name} Measure ${mi + 1}`;
        expect(TIME_SIGNATURES, where).toContain(m.timeSignature); // AC-1.2.1
        expect(m.beats, where).toHaveLength(beatCount(m.timeSignature)); // AC-1.2.2
        if (p.soundMode !== 'melodic') continue;
        for (const b of m.beats) {
          for (const s of b.slots) {
            // AC-2.2.8: an on Slot carries a Pitch, an off Slot carries none.
            if (s.on) expect(s.pitch, where).toBeTruthy();
            else expect(s.pitch ?? null, where).toBeNull();
          }
        }
      }
    }
  });
});

describe('US-16.2 — the library is data, not code', () => {
  afterEach(() => {
    vi.doUnmock('../../../data/seed-patterns.json');
    vi.resetModules();
  });

  /** The seed loader as it would run against a data file with these Patterns. */
  async function loaderWith(patterns) {
    vi.resetModules();
    vi.doMock('../../../data/seed-patterns.json', () => ({
      default: { schemaVersion: 1, patterns },
    }));
    return import('../../../src/storage/seed.js');
  }

  const handWritten = {
    name: 'Hand Added Groove',
    soundMode: 'percussive',
    tempo: 100,
    tags: ['Latin'],
    rating: 0,
    measures: [
      {
        timeSignature: '3/4',
        beats: Array.from({ length: 3 }, () => ({
          recipe: 'straight-8ths',
          slots: [{ on: true }, { on: false }],
        })),
      },
    ],
  };

  it('AC-16.2.2 — Adding a Pattern requires no code change', async () => {
    const appended = [...realSeed.patterns, handWritten];
    const loader = await loaderWith(appended);
    const library = loader.loadAll();
    expect(library).toHaveLength(realSeed.patterns.length + 1);
    const added = library.at(-1);
    expect(added.name).toBe('Hand Added Groove');
    // It gets an id from its position, with nothing registered anywhere.
    expect(added.id).toBe(loader.seedId(realSeed.patterns.length));
    expect(loader.findById(added.id)).toBe(added);
    // Fully playable.
    expect(loader.validateAll().errors).toEqual([]);
    expect(buildTimeline(added).length).toBeGreaterThanOrEqual(3);
  });

  it('AC-16.2.3 — Malformed entries fail loudly, not silently: the shipped-library validator names the Pattern and the rule', async () => {
    const wrongBeatCount = {
      ...handWritten,
      name: 'Short Bar',
      measures: [{ ...handWritten.measures[0], timeSignature: '4/4' }],
    };
    const unsupportedMeter = {
      ...handWritten,
      name: 'Odd Meter',
      measures: [{ ...handWritten.measures[0], timeSignature: '3/2' }],
    };
    const pitchless = {
      ...handWritten,
      name: 'Silent Tune',
      soundMode: 'melodic',
      key: 'C',
    };
    const loader = await loaderWith([handWritten, wrongBeatCount, unsupportedMeter, pitchless]);
    const { valid, errors } = loader.validateAll();
    expect(valid).toBe(false);
    expect(errors).toHaveLength(3);
    expect(errors.find((e) => e.startsWith('Short Bar:'))).toMatch(/3 Beats in 4\/4, expected 4/);
    expect(errors.find((e) => e.startsWith('Odd Meter:'))).toMatch(/3\/2/);
    expect(errors.find((e) => e.startsWith('Silent Tune:'))).toMatch(/pitch/i);
  });
});
