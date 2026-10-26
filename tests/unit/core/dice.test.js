/**
 * US-2.14 — Roll the dice across the Melody group: what each roll may land on,
 * one test per Case of AC-2.14.2, on the pure roll with a fixed random number.
 * Where the button sits and what No dice looks like are proved in
 * tests/e2e/dice.spec.js.
 */
import { describe, it, expect } from 'vitest';
import { rollMelody, rollingControls, canRoll, DICE_CONTROLS } from '../../../src/core/dice.js';
import { create, cycleAccent, setPitch } from '../../../src/core/pattern.js';
import { KEYS, REGISTERS } from '../../../src/core/pitch.js';
import { SCALES } from '../../../src/core/scales.js';
import {
  setProgression,
  setArpeggio,
  setVoicing,
  setChange,
  matchProgression,
  matchVoicing,
  PROGRESSIONS,
  ARPEGGIOS,
  VOICINGS,
  DEFAULT_ARPEGGIO,
} from '../../../src/core/harmony.js';

/* --- fixtures ------------------------------------------------------------------ */

/** A one-Measure 4/4 melody in C Ionian at Normal: 1 3 5 2 on each Beat's first Slot. */
function melody() {
  let p = { ...create('Mel'), soundMode: 'melodic', key: 'C', scale: 'ionian' };
  ['1', '3', '5', '2'].forEach((degree, b) => {
    p = cycleAccent(p, 0, b, 0);
    p = setPitch(p, 0, b, 0, { degree, octaveOffset: 0 });
  });
  return p;
}

/** The same under I–IV–V, Alberti, Root position, changing every pass. */
function harmonic() {
  let p = setProgression(melody(), 'I-IV-V');
  p = setArpeggio(p, 'alberti');
  p = setVoicing(p, 'root');
  return setChange(p, 'pass');
}

const ALL = DICE_CONTROLS.map((c) => c.id);
/** Every control but the ones named marked No dice. */
const only = (...ids) => ALL.filter((id) => !ids.includes(id));
const zero = () => 0;
const top = () => 0.999;
/** A spread of random numbers, for the "any of" assertions. */
const SPREAD = Array.from({ length: 40 }, (_, i) => i / 40);

/* --- AC-2.14.2 — What each roll may land on ------------------------------------- */

describe('AC-2.14.2 — What each roll may land on', () => {
  it('AC-2.14.2/1 — Key: one of the twelve Keys', () => {
    const p = melody();
    expect(rollMelody(p, { noDice: only('key'), random: zero }).rolled.key).toBe('Db');
    expect(rollMelody(p, { noDice: only('key'), random: top }).rolled.key).toBe('B');
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(p, { noDice: only('key'), random: () => r });
      expect(KEYS).toContain(rolled.key);
      expect(rolled.key).not.toBe('C');
      expect(pattern.key).toBe(rolled.key);
    }
    // Never the one in force: from B, the top roll lands on Bb.
    expect(rollMelody({ ...p, key: 'B' }, { noDice: only('key'), random: top }).rolled.key).toBe('Bb');
  });

  it('AC-2.14.2/2 — Scale: one of the catalogue’s scales, every category together', () => {
    const p = melody();
    const ids = SCALES.map((s) => s.id);
    const categories = new Set();
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(p, { noDice: only('scale'), random: () => r });
      expect(ids).toContain(rolled.scale);
      expect(rolled.scale).not.toBe('ionian');
      expect(pattern.scale).toBe(rolled.scale);
      categories.add(SCALES.find((s) => s.id === rolled.scale).category);
    }
    // Every category is reachable from one roll, not only Ionian's own.
    expect([...categories].sort()).toEqual([...new Set(SCALES.map((s) => s.category))].sort());
  });

  it('AC-2.14.2/3 — Register: one of Bass, Low, Normal, High and Lead', () => {
    const p = melody();
    const values = REGISTERS.map((r) => r.value);
    expect(rollMelody(p, { noDice: only('register'), random: zero }).rolled.register).toBe(-2);
    expect(rollMelody(p, { noDice: only('register'), random: top }).rolled.register).toBe(2);
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(p, { noDice: only('register'), random: () => r });
      expect(values).toContain(rolled.register);
      expect(rolled.register).not.toBe(0);
      expect(pattern.register).toBe(rolled.register);
    }
    // From Lead (a stored Register), never Lead again.
    expect(rollMelody({ ...p, register: 2 }, { noDice: only('register'), random: top }).rolled.register).toBe(1);
  });

  it('AC-2.14.2/4 — Progression: one from the catalogue — My list when Cycle progressions is set to it, the whole catalogue otherwise — never None; a Pattern without a progression is given one, voiced Closest and with the default fill, exactly as choosing it would be', () => {
    // Without a progression: given the first of the catalogue on a zero roll, as choosing it gives it.
    const given = rollMelody(melody(), { noDice: only('progression'), random: zero });
    expect(given.rolled.progression).toBe(PROGRESSIONS[0].id);
    expect(matchProgression(given.pattern)).toBe(PROGRESSIONS[0].id);
    expect(matchVoicing(given.pattern.harmony.chords)).toBe('closest');
    expect(given.pattern.harmony.arpeggio).toBe(DEFAULT_ARPEGGIO);
    expect(given.pattern).toEqual(setArpeggio(setProgression(melody(), PROGRESSIONS[0].id), DEFAULT_ARPEGGIO));

    // The whole catalogue, never None and never the one in force.
    const ids = PROGRESSIONS.map((p) => p.id);
    for (const r of SPREAD) {
      const { rolled } = rollMelody(harmonic(), { noDice: only('progression'), random: () => r });
      expect(ids).toContain(rolled.progression);
      expect(rolled.progression).not.toBe('I-IV-V');
      expect(rolled.progression).not.toBe('none');
    }

    // My list: two entries, the one in force and another — the other, every time.
    const list = ['I-IV-V', 'I-V-vi-IV'];
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(harmonic(), { noDice: only('progression'), random: () => r, progressions: list });
      expect(rolled.progression).toBe('I-V-vi-IV');
      expect(matchProgression(pattern)).toBe('I-V-vi-IV');
      // A fill already chosen is kept for the Fill roll, as choosing a progression keeps it.
      expect(pattern.harmony.arpeggio).toBe('alberti');
    }
  });

  it('AC-2.14.2/5 — Chord changes: the other of Every Measure and Every pass', () => {
    const pass = harmonic();
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(pass, { noDice: only('change'), random: () => r });
      expect(rolled.change).toBe('measure');
      expect(pattern.harmony.change).toBe('measure');
    }
    const measure = setChange(pass, 'measure');
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(measure, { noDice: only('change'), random: () => r });
      expect(rolled.change).toBe('pass');
      expect(pattern.harmony.change).toBe('pass');
    }
  });

  it('AC-2.14.2/6 — Fill: one from the catalogue — My list when the Fills cycle is set to it, the whole catalogue otherwise — never None', () => {
    const ids = ARPEGGIOS.map((a) => a.id);
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(harmonic(), { noDice: only('fill'), random: () => r });
      expect(ids).toContain(rolled.fill);
      expect(rolled.fill).not.toBe('alberti');
      expect(pattern.harmony.arpeggio).toBe(rolled.fill);
    }
    // From None under a progression, still never None.
    const none = setArpeggio(harmonic(), 'none');
    for (const r of SPREAD) expect(ids).toContain(rollMelody(none, { noDice: only('fill'), random: () => r }).rolled.fill);

    // My list of two: the other one.
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(harmonic(), { noDice: only('fill'), random: () => r, fills: ['alberti', 'down'] });
      expect(rolled.fill).toBe('down');
      expect(pattern.harmony.arpeggio).toBe('down');
    }
  });

  it('AC-2.14.2/7 — Voicing: one of the named voicings, never Custom', () => {
    const ids = VOICINGS.map((v) => v.id);
    expect(ids).not.toContain('custom');
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(harmonic(), { noDice: only('voicing'), random: () => r });
      expect(ids).toContain(rolled.voicing);
      expect(rolled.voicing).not.toBe('root');
      // Voiced exactly as choosing that voicing would voice it — and so never Custom,
      // whichever named voicing the picker reads the result as (two can coincide on one progression).
      expect(pattern.harmony.chords).toEqual(setVoicing(harmonic(), rolled.voicing).harmony.chords);
      expect(matchVoicing(pattern.harmony.chords)).not.toBeNull();
    }
  });

  it('AC-2.14.2/8 — Nothing else is rolled: every stored Pitch is as it was, each chord’s root, quality and bass are what the rolled Progression and Voicing give, and the armed octave, the Fills and Progressions cycles, their Repeats, the tempo and the swing are untouched', () => {
    const before = { ...harmonic(), tempo: 97, swing: 0.3 };
    for (const r of SPREAD) {
      const { pattern, rolled } = rollMelody(before, { random: () => r });
      expect(Object.keys(rolled).sort()).toEqual([...ALL].sort());
      // The notes: every Slot's Pitch exactly as stored, on the same Slots.
      expect(pattern.measures).toEqual(before.measures);
      // The chords: the rolled progression, spelled under the rolled scale and voiced as rolled.
      const expected = setVoicing(setProgression({ ...before, scale: rolled.scale }, rolled.progression), rolled.voicing).harmony.chords;
      expect(pattern.harmony.chords).toEqual(expected);
      expect(pattern.tempo).toBe(97);
      expect(pattern.swing).toBe(0.3);
      expect(pattern.name).toBe(before.name);
    }
    // The roll never reaches outside the Pattern: no cycle, Repeats or armed octave is on it to
    // touch. The one field it may add is the Register, Pattern content a fresh Pattern stores only once set.
    expect(Object.keys(rollMelody(before, { random: zero }).pattern).sort()).toEqual([...Object.keys(before), 'register'].sort());

    // A setting that exists only under a progression is rolled only where one is in force:
    // without a progression and with Progression marked No dice, nothing harmonic rolls.
    const bare = melody();
    expect(rollingControls(bare, ['progression'])).toEqual(['key', 'scale', 'register']);
    expect(Object.keys(rollMelody(bare, { noDice: ['progression'], random: zero }).rolled)).toEqual(['key', 'scale', 'register']);
    expect(rollMelody(bare, { noDice: ['progression'], random: zero }).pattern.harmony).toBeUndefined();
    // With the Progression rolling, the harmonic settings roll after it.
    expect(rollingControls(bare, [])).toEqual(ALL);
    // With everything marked, there is nothing to roll.
    expect(canRoll(bare, ALL)).toBe(false);
    expect(canRoll(bare, ['key', 'scale', 'register', 'progression'])).toBe(false);
    expect(canRoll(harmonic(), ['key', 'scale', 'register', 'progression'])).toBe(true);
    expect(rollMelody(bare, { noDice: ALL, random: zero })).toEqual({ pattern: bare, rolled: {} });
  });
});
