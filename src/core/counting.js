/**
 * Counting-system labels. US-5.6.
 *
 * Three systems: Takadimi, 1-e-&-a, and Numbered. Labels are per Slot within a
 * Beat and depend on the Recipe, not just the Slot index.
 *
 * A Pattern containing a mixed-feel Recipe renders in Numbered whatever the
 * musician's preference, because neither Takadimi nor 1-e-&-a has vocabulary for
 * a half-Beat group of 2 or 3 (AC-5.6.2). That override does NOT write back to
 * the stored preference (AC-5.6.3) — the preference is what they chose, not what
 * one Pattern forced.
 */
import { isMixedFeel, subdivisionGroups } from './recipes.js';

export const COUNTING_SYSTEMS = ['takadimi', 'one-e-and-a', 'numbered'];

export const COUNTING_LABELS = {
  takadimi: 'Takadimi',
  'one-e-and-a': '1-e-&-a',
  numbered: 'Numbered',
};

/** Whole-Beat vocabularies, keyed by Slot count. */
const VOCABULARY = {
  takadimi: {
    1: ['ta'],
    2: ['ta', 'di'],
    3: ['ta', 'ki', 'da'],
    4: ['ta', 'ka', 'di', 'mi'],
  },
  'one-e-and-a': {
    1: ['1'],
    2: ['1', '&'],
    3: ['1', 'trip', 'let'],
    4: ['1', 'e', '&', 'a'],
  },
};

/**
 * Per-Slot labels for one Beat.
 *
 * Numbered labels every Slot by its ordinal within the Beat, which is the only
 * system that survives a Recipe whose halves have different feels.
 */
export function labelsFor(recipeId, beatNoteValue, system) {
  if (!COUNTING_SYSTEMS.includes(system)) throw new Error(`Unknown counting system: ${system}`);

  const groups = subdivisionGroups(recipeId, beatNoteValue);
  const total = groups.reduce((n, g) => n + g.slotIndices.length, 0);

  if (system === 'numbered' || isMixedFeel(recipeId)) {
    return Array.from({ length: total }, (_, i) => String(i + 1));
  }

  const vocab = VOCABULARY[system][total];
  if (!vocab) throw new Error(`No ${system} vocabulary for a ${total}-Slot Beat`);
  return [...vocab];
}

/**
 * The system a Pattern actually renders in — the musician's preference, unless
 * the Pattern contains a mixed-feel Recipe. AC-5.6.2
 */
export function effectiveSystem(pattern, globalSystem) {
  const forced = pattern.measures.some((m) => m.beats.some((b) => isMixedFeel(b.recipe)));
  return forced ? 'numbered' : globalSystem;
}

/** Why the system was overridden, for the UI to explain rather than just do. */
export function isForcedNumbered(pattern) {
  return pattern.measures.some((m) => m.beats.some((b) => isMixedFeel(b.recipe)));
}
