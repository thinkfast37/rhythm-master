/**
 * User content attached to a BUILT-IN Pattern: `rm.overlays.v1`.
 *
 * Built-in Patterns are frozen and never mutated in place (FR-007), but the
 * musician can still rate them and add their own Tags. Those values have to
 * live somewhere, and they cannot live on the Pattern.
 *
 * This is NOT Local Metadata. Local Metadata is app-local bookkeeping *about* a
 * Pattern — submission history, resolved prompts — and is barred from every
 * export (FR-006). A rating is the musician's own content: it belongs to them,
 * and it travels with the Pattern if they ever make it their own. Keeping the
 * two in separate stores keeps that distinction enforceable.
 *
 * Tags added here are stored SEPARATELY from the Pattern's own tags rather than
 * replacing them. A built-in Pattern's own tags describe what it is and are not
 * the musician's to remove; the ones they add are theirs, and are.
 *
 * Owned Patterns need no overlay — their rating and tags live on the Pattern.
 */
import { readStore, writeStore } from './keyValue.js';

export const KEY = 'rm.overlays.v1';

const EMPTY = { byPatternId: {} };

export function loadAll() {
  return readStore(KEY, EMPTY).byPatternId ?? {};
}

export function forPattern(patternId) {
  return loadAll()[patternId] ?? {};
}

/** Tags the musician added to a built-in Pattern. Theirs to remove. */
export function addedTagsFor(patternId) {
  return forPattern(patternId).addedTags ?? [];
}

export function update(patternId, fields) {
  const all = loadAll();
  all[patternId] = { ...(all[patternId] ?? {}), ...fields };
  writeStore(KEY, { byPatternId: all });
  return all[patternId];
}

export function setRating(patternId, rating) {
  return update(patternId, { rating });
}

export function setAddedTags(patternId, addedTags) {
  return update(patternId, { addedTags });
}

/** Apply the rating overlay, returning a plain (unfrozen) copy the UI can read. */
export function applyTo(pattern) {
  const overlay = forPattern(pattern.id);
  if (overlay.rating === undefined) return pattern;
  return { ...structuredClone(pattern), rating: overlay.rating };
}
