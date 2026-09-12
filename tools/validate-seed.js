#!/usr/bin/env node
/**
 * Validates data/seed-patterns.json against data-model.md §7.
 *
 * A shipped Pattern that violates a rule is a build-breaking error: the library
 * is the first thing every user sees, and a musically invalid Pattern there
 * teaches the wrong thing (Constitution Principle I).
 *
 * Kept dependency-free and standalone so it can run in CI before `npm install`
 * of anything beyond dev tooling, and so US-16.2's promise holds — someone
 * hand-adding a Pattern can check their work with one command.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = join(ROOT, 'data/seed-patterns.json');

// Mirrors core/meter.js. Duplicated deliberately: this tool validates the data
// that core/ will later consume, so it must not depend on core/ being correct.
const NUMERATOR = {
  '1/4': 1, '2/4': 2, '3/4': 3, '4/4': 4, '5/4': 5, '6/4': 6, '7/4': 7,
  '6/8': 6, '7/8': 7, '9/8': 9, '12/8': 12,
};
const NOTE_VALUE = { 4: 'quarter', 8: 'eighth' };

const SLOT_COUNT = {
  'quarter:straight-16ths': 4,
  'quarter:straight-8ths': 2,
  'quarter:triplet-8ths': 3,
  'quarter:straight-triplet-split': 5,
  'quarter:triplet-straight-split': 5,
  'eighth:undivided': 1,
  'eighth:straight-16ths': 2,
};

const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const AUTOMATIC_TAGS = ['custom', 'swing', 'percussive', 'melodic'];
// Mirrors core/scales.js's catalogue ids, duplicated for standalone-ness like KEYS.
const SCALES = [
  'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian',
  'major-pentatonic', 'suspended-pentatonic', 'blues-minor-pentatonic',
  'blues-major-pentatonic', 'minor-pentatonic',
  'minor-blues', 'major-blues', 'harmonic-minor', 'melodic-minor',
];
const DEGREE = /^[b#]?[1-9]\d*$/;
// Mirrors core/harmony.js (US-2.6), duplicated for standalone-ness like KEYS.
const QUALITIES = [
  'maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '6', 'm6', 'maj7', 'm7', '7', 'm7b5', 'dim7',
  'mMaj7', '7sus4', 'add9', '9', 'maj9', 'm9',
];
const TONES = [1, 3, 5, 7, 9];
const CHANGES = ['pass', 'measure'];
const ARPEGGIOS = ['up', 'down', 'up-down', 'alberti', 'root', 'root-fifth'];

const errors = [];
const fail = (name, msg) => errors.push(`${name}: ${msg}`);

const raw = JSON.parse(readFileSync(SEED, 'utf8'));

if (raw.schemaVersion !== 1) {
  fail('<file>', `schemaVersion is ${raw.schemaVersion}, expected 1`);
}
if (!Array.isArray(raw.patterns)) {
  console.error('validate-seed: `patterns` must be an array');
  process.exit(2);
}

let noteOns = 0;

for (const p of raw.patterns) {
  const name = p.name ?? '<unnamed>';

  if (typeof p.name !== 'string' || !p.name.trim()) fail(name, 'name must be a non-empty string');
  if (p.id !== undefined) fail(name, 'shipped Patterns must not carry an id (contracts/file-formats.md §1)');
  if (!['percussive', 'melodic'].includes(p.soundMode)) fail(name, `soundMode "${p.soundMode}" invalid`);

  const melodic = p.soundMode === 'melodic';
  if (melodic !== ('key' in p)) fail(name, 'key must be present iff soundMode is melodic');
  if (melodic && !KEYS.includes(p.key)) fail(name, `key "${p.key}" unsupported`);
  // Every shipped Melodic Pattern carries its scale explicitly (AC-2.5.4/4);
  // the absent-reads-as-ionian default is for user data, not the seed.
  if (melodic !== ('scale' in p)) fail(name, 'scale must be present iff soundMode is melodic (AC-2.5.4/4)');
  if (melodic && !SCALES.includes(p.scale)) fail(name, `scale "${p.scale}" unsupported (data-model §7 rule 13)`);

  // A progression, where present, only on a Melodic Pattern (data-model §7 rule 14).
  const harmonic = Boolean(p.harmony?.chords?.length);
  if ('harmony' in p) {
    const h = p.harmony;
    if (!melodic) fail(name, 'harmony on a percussive Pattern (data-model §7 rule 14)');
    if (!CHANGES.includes(h?.change)) fail(name, `harmony.change "${h?.change}" invalid`);
    if ('arpeggio' in (h ?? {}) && !ARPEGGIOS.includes(h.arpeggio)) fail(name, `harmony.arpeggio "${h.arpeggio}" invalid`);
    if (!Array.isArray(h?.chords) || h.chords.length < 1 || h.chords.length > 16) {
      fail(name, `harmony has ${h?.chords?.length} chords, expected 1–16`);
    } else {
      for (const [ci, c] of h.chords.entries()) {
        if (!DEGREE.test(String(c?.degree))) fail(name, `chord ${ci + 1}: degree "${c?.degree}" invalid`);
        if (!QUALITIES.includes(c?.quality)) fail(name, `chord ${ci + 1}: quality "${c?.quality}" unsupported`);
      }
    }
  }

  if (!Number.isInteger(p.tempo) || p.tempo < 18 || p.tempo > 220) fail(name, `tempo ${p.tempo} outside 18–220`);
  if (!Number.isInteger(p.rating) || p.rating < 0 || p.rating > 5) fail(name, `rating ${p.rating} outside 0–5`);

  if (!Array.isArray(p.tags)) fail(name, 'tags must be an array');
  else for (const t of p.tags) {
    if (AUTOMATIC_TAGS.includes(String(t).toLowerCase())) {
      fail(name, `tag "${t}" is automatic and must not be stored (data-model §4)`);
    }
  }

  // Mirrors MAX_MEASURES in core/pattern.js. Duplicated for the standalone-ness
  // this file's header explains — which means it must be changed in step. T157
  // raised the cap 6 → 8 and missed this copy; the seed library caught it.
  if (!Array.isArray(p.measures) || p.measures.length < 1 || p.measures.length > 8) {
    fail(name, `${p.measures?.length} Measures, expected 1–8 (AC-1.1.3)`);
    continue;
  }

  for (const [mi, m] of p.measures.entries()) {
    const ts = m.timeSignature;
    const num = NUMERATOR[ts];
    if (num === undefined) {
      fail(name, `Measure ${mi + 1}: unsupported Time Signature "${ts}"`);
      continue;
    }
    if (!Array.isArray(m.beats) || m.beats.length !== num) {
      fail(name, `Measure ${mi + 1}: ${m.beats?.length} Beats in ${ts}, expected ${num} (FR-002)`);
      continue;
    }

    const noteValue = NOTE_VALUE[Number(ts.split('/')[1])];

    for (const [bi, b] of m.beats.entries()) {
      const where = `Measure ${mi + 1} Beat ${bi + 1}`;
      const expected = SLOT_COUNT[`${noteValue}:${b.recipe}`];
      if (expected === undefined) {
        fail(name, `${where}: Recipe "${b.recipe}" is not offered on a ${noteValue}-note Beat`);
        continue;
      }
      if (!Array.isArray(b.slots) || b.slots.length !== expected) {
        fail(name, `${where}: ${b.slots?.length} Slots for ${b.recipe}, expected ${expected}`);
        continue;
      }

      for (const [si, s] of b.slots.entries()) {
        const slot = `${where} Slot ${si + 1}`;
        if (typeof s.on !== 'boolean') fail(name, `${slot}: on must be a boolean`);
        if (s.on) noteOns++;

        if ('accent' in s) {
          if (!s.on) fail(name, `${slot}: accent on an off Slot`);
          if (![1, 2, 3].includes(s.accent)) fail(name, `${slot}: accent ${s.accent} outside 1–3`);
        }

        if ('pitch' in s) {
          if (!s.on) fail(name, `${slot}: pitch on an off Slot`);
          if (!melodic) fail(name, `${slot}: pitch on a percussive Pattern`);
          // A Pitch is a degree or a chord-tone role, never both (rules 15–16).
          const hasDegree = s.pitch?.degree !== undefined;
          const hasTone = s.pitch?.tone !== undefined;
          if (hasDegree === hasTone) fail(name, `${slot}: pitch must carry exactly one of degree or tone`);
          if (hasDegree && !DEGREE.test(String(s.pitch?.degree))) fail(name, `${slot}: degree "${s.pitch?.degree}" invalid`);
          if (hasTone && !TONES.includes(s.pitch.tone)) fail(name, `${slot}: tone ${s.pitch.tone} is not one of 1, 3, 5, 7, 9`);
          if (hasTone && !harmonic) fail(name, `${slot}: chord tone on a Pattern with no progression (rule 16)`);
          if (!Number.isInteger(s.pitch?.octaveOffset)) fail(name, `${slot}: octaveOffset must be an integer`);
        } else if (melodic && s.on) {
          fail(name, `${slot}: melodic Pattern has an on Slot with no pitch`);
        }
      }
    }
  }
}

console.log(`Patterns: ${raw.patterns.length}`);
console.log(`Note-ons: ${noteOns}`);

if (errors.length) {
  console.error(`\n${errors.length} validation error(s):`);
  for (const e of errors.slice(0, 50)) console.error(`  ! ${e}`);
  if (errors.length > 50) console.error(`  … and ${errors.length - 50} more`);
  process.exit(1);
}

console.log('\nAll shipped Patterns valid against data-model §7.');
