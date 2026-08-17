/**
 * User content attached to a SHIPPED Pattern: `rm.overlays.v1`.
 *
 * Shipped Patterns are frozen and never mutated in place (FR-007), but the
 * musician can still rate and tag them (US-6.1, US-5.3). Those values have to
 * live somewhere, and they cannot live on the Pattern.
 *
 * This is NOT Local Metadata. Local Metadata is app-local bookkeeping ABOUT a
 * Pattern — submission history, resolved prompts — and is barred from every
 * export (FR-006). A rating is the musician's own content: it belongs to them,
 * it is what they came back for, and it travels with the Pattern if they ever
 * make it their own. Keeping the two in separate stores keeps that distinction
 * enforceable rather than a matter of remembering.
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

export function update(patternId, fields) {
  const all = loadAll();
  all[patternId] = { ...(all[patternId] ?? {}), ...fields };
  writeStore(KEY, { byPatternId: all });
  return all[patternId];
}

/**
 * Apply a shipped Pattern's overlay, returning a plain (unfrozen) copy the UI
 * can read uniformly alongside owned Patterns.
 */
export function applyTo(pattern) {
  const overlay = forPattern(pattern.id);
  if (!overlay.rating && !overlay.tags) return pattern;
  return {
    ...structuredClone(pattern),
    rating: overlay.rating ?? pattern.rating ?? 0,
    tags: overlay.tags ?? pattern.tags ?? [],
  };
}
