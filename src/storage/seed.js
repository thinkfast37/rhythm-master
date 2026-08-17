/**
 * The shipped Pattern library. US-16.1, US-16.2.
 *
 * Patterns loaded from here are SHIPPED: immutable, undeletable, and edited only
 * by producing a new user-owned Pattern (US-7.3). Provenance is this module, not
 * a field on the Pattern — which is what stops an edit from forging it
 * (FR-007, data-model §5).
 *
 * Ids are derived from seed position rather than stored in the file, so
 * `data/seed-patterns.json` stays a plain list of music that anyone can extend
 * by hand (US-16.2). The cost is that reordering the file reassigns ids and
 * orphans any Local Metadata keyed to them; new Patterns therefore go at the
 * END of the file.
 */
import seed from '../../data/seed-patterns.json';
import { validate } from '../core/pattern.js';

/** Stable id for the Pattern at seed index `i`. */
export function seedId(i) {
  return `s_${i + 1}`;
}

let cache = null;

/**
 * Every shipped Pattern, id-stamped and frozen.
 *
 * Frozen deliberately: a shipped Pattern must never be mutated in place, and a
 * silent no-op assignment is a far worse failure than a thrown error, because it
 * looks like it worked (FR-007).
 */
export function loadAll() {
  if (cache) return cache;
  cache = seed.patterns.map((p, i) => deepFreeze({ ...structuredClone(p), id: seedId(i) }));
  return cache;
}

export function findById(id) {
  return loadAll().find((p) => p.id === id) ?? null;
}

/**
 * Validate the shipped library. Called by tests and by `npm run validate:seed`;
 * a failure here is build-breaking, not a runtime warning.
 */
export function validateAll() {
  const errors = [];
  for (const p of loadAll()) {
    const result = validate(p);
    if (!result.valid) errors.push(`${p.name}: ${result.errors.join('; ')}`);
  }
  return { valid: errors.length === 0, errors };
}

/** Total sounding Slots across the library — the figure the conversion preserved. */
export function noteOnCount() {
  return loadAll().reduce(
    (total, p) =>
      total +
      p.measures.reduce(
        (m, measure) =>
          m + measure.beats.reduce((b, beat) => b + beat.slots.filter((s) => s.on).length, 0),
        0
      ),
    0
  );
}

function deepFreeze(o) {
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(o);
}
