/**
 * The kinds of thing the library holds (US-5.7): what a Pattern is by its
 * structure, and the two that are not Patterns at all. A type is worked out
 * from the entry and never stored, so it cannot drift from what it describes.
 * Pure.
 */
import { hasHarmony } from './harmony.js';

/** Every type, in the order the library's pills show them (AC-5.7.1/1). */
export const LIBRARY_TYPES = Object.freeze([
  Object.freeze({ id: 'percussive', label: 'Percussive' }),
  Object.freeze({ id: 'melodic', label: 'Melodic composition' }),
  Object.freeze({ id: 'progression', label: 'Chord progression' }),
  Object.freeze({ id: 'chain', label: 'Chain' }),
  Object.freeze({ id: 'section', label: 'Section' }),
]);

const IDS = LIBRARY_TYPES.map((t) => t.id);

/**
 * A Pattern's type (AC-5.7.1/4): Percussive; a Chord progression when it is
 * Melodic and carries one; a Melodic composition otherwise.
 */
export function patternType(pattern) {
  if (pattern?.soundMode !== 'melodic') return 'percussive';
  return hasHarmony(pattern) ? 'progression' : 'melodic';
}

/** The types chosen, as a list of known ids; none chosen means every type. */
export function chosenTypes(types) {
  return (Array.isArray(types) ? types : []).filter((id) => IDS.includes(id));
}

/** Whether entries of `type` show under the choice: all of them while nothing is chosen (AC-5.7.1/2). */
export function showsType(types, type) {
  const chosen = chosenTypes(types);
  return chosen.length === 0 || chosen.includes(type);
}

/** Choosing a type adds it, choosing a chosen one takes it away, and null clears the choice (AC-5.7.1/2). */
export function toggleType(types, type) {
  const chosen = chosenTypes(types);
  if (type === null || !IDS.includes(type)) return [];
  return chosen.includes(type) ? chosen.filter((id) => id !== type) : IDS.filter((id) => id === type || chosen.includes(id));
}
