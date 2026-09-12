/**
 * Which playback settings a Pattern loads with. AC-4.2.3, AC-4.4.17.
 *
 * Three sources, in falling precedence:
 *
 *   1. the overlay store — a value the Musician set on this Pattern and the app
 *      remembered for it (AC-4.2.4, AC-4.4.6, AC-4.4.10);
 *   2. the Pattern's own authored value — a shipped or saved tempo that differs
 *      from the 80 BPM default, a Pattern-wide or per-group swing amount;
 *   3. what was carried from the Pattern just left.
 *
 * The middle rule is why a tempo of exactly 80 counts as absent: 172 of the 208
 * shipped Patterns carry it as a placeholder rather than a choice, and nothing
 * in the data distinguishes the two. Accepted knowingly in AC-4.2.3 — the cost
 * is that a Pattern deliberately set to 80 takes the carried tempo instead.
 *
 * Pure by construction (Principle I): the caller owns the stores and does the
 * applying. Absent fields in the result mean "leave what the Pattern and its
 * overlay already say" — never "set the default" — so a Pattern carrying
 * per-group swing overrides is not flattened by a carried amount.
 */
import { DEFAULT_TEMPO } from './pattern.js';
import { DEFAULT_SWING_FEEL } from './swing.js';

export const DEFAULT_SWING_AMOUNT = 0;

/** The playback settings a fresh install starts from, before any Pattern is opened. */
export const NO_CARRY = {
  tempo: DEFAULT_TEMPO,
  swingAmount: DEFAULT_SWING_AMOUNT,
  swingFeel: DEFAULT_SWING_FEEL,
};

/** Whether any Beat carries a per-group swing override (AC-4.4.2). */
function hasGroupSwing(pattern) {
  return (pattern.measures ?? []).some((m) =>
    (m.beats ?? []).some((b) => Object.values(b.swing ?? {}).some((s) => s > 0))
  );
}

/**
 * What to apply on top of a Pattern and its overlay when it loads.
 *
 * @param {object} args
 * @param {object} args.pattern  the Pattern as its store holds it — pre-overlay
 * @param {object} [args.overlay]  its record in `rm.overlays.v1`
 * @param {object} [args.carried]  the settings in effect on the Pattern just left
 * @returns {{tempo?: number, swingAmount?: number, swingFeel?: string}}
 *   only the fields the carry actually governs
 */
export function carriedPlaybackFor({ pattern, overlay = {}, carried = {} }) {
  const applied = {};

  const ownTempo = pattern.tempo !== undefined && pattern.tempo !== DEFAULT_TEMPO;
  if (overlay.tempo === undefined && !ownTempo && carried.tempo !== undefined) {
    applied.tempo = carried.tempo;
  }

  const ownSwing =
    overlay.swingAmount !== undefined ||
    overlay.swing !== undefined ||
    (pattern.swingAmount ?? 0) > 0 ||
    hasGroupSwing(pattern);
  if (!ownSwing && carried.swingAmount !== undefined) {
    applied.swingAmount = carried.swingAmount;
  }

  const ownFeel = overlay.swingFeel !== undefined || pattern.swingFeel !== undefined;
  if (!ownFeel && carried.swingFeel !== undefined) {
    applied.swingFeel = carried.swingFeel;
  }

  return applied;
}

/**
 * The playback settings a loaded Pattern is actually sounding at — what the
 * next Pattern carries from it (AC-4.2.3/4: the tempo in effect, not the last
 * one set by hand).
 */
export function playbackInEffect(pattern) {
  return {
    tempo: pattern.tempo ?? DEFAULT_TEMPO,
    swingAmount: pattern.swingAmount ?? DEFAULT_SWING_AMOUNT,
    swingFeel: pattern.swingFeel ?? DEFAULT_SWING_FEEL,
  };
}
