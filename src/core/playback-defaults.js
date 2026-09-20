/**
 * Which playback settings a Pattern loads with. AC-4.2.3, AC-4.4.17.
 *
 * Only the tempo carries. Three sources, in falling precedence:
 *
 *   1. the overlay store — a tempo the Musician set on this Pattern and the app
 *      remembered for it (AC-4.2.4);
 *   2. the Pattern's own authored tempo — a shipped or saved tempo that differs
 *      from the 80 BPM default;
 *   3. the tempo carried from the Pattern just left.
 *
 * A Pattern with any overlay playback value at all — tempo, swing or feel — is
 * one the Musician has personalized, and takes nothing from the third source
 * (AC-4.2.3/6).
 *
 * Swing and swing feel never carry (AC-4.4.17, reversed 2026-09-20): a Pattern
 * with no swing of its own loads straight, whatever the Pattern just left was
 * doing. Swing carried for eight days and the maintainer heard it as shipped
 * rhythms that "have swing on them" when none does in the data.
 *
 * The middle rule is why a tempo of exactly 80 counts as absent: 172 of the 208
 * shipped Patterns carry it as a placeholder rather than a choice, and nothing
 * in the data distinguishes the two. Accepted knowingly in AC-4.2.3 — the cost
 * is that a Pattern deliberately set to 80 takes the carried tempo instead.
 *
 * Pure by construction (Principle I): the caller owns the stores and does the
 * applying. An absent field in the result means "leave what the Pattern and its
 * overlay already say" — never "set the default".
 */
import { DEFAULT_TEMPO } from './pattern.js';

/** The playback settings a fresh install starts from, before any Pattern is opened. */
export const NO_CARRY = {
  tempo: DEFAULT_TEMPO,
};

/**
 * What to apply on top of a Pattern and its overlay when it loads.
 *
 * @param {object} args
 * @param {object} args.pattern  the Pattern as its store holds it — pre-overlay
 * @param {object} [args.overlay]  its record in `rm.overlays.v1`
 * @param {object} [args.carried]  the settings in effect on the Pattern just left
 * @returns {{tempo?: number}}  only the fields the carry actually governs —
 *   never a swing amount or feel (AC-4.4.17)
 */
export function carriedPlaybackFor({ pattern, overlay = {}, carried = {} }) {
  const personalized =
    overlay.tempo !== undefined ||
    overlay.swingAmount !== undefined ||
    overlay.swing !== undefined ||
    overlay.swingFeel !== undefined;
  if (personalized) return {};

  const applied = {};

  const ownTempo = pattern.tempo !== undefined && pattern.tempo !== DEFAULT_TEMPO;
  if (!ownTempo && carried.tempo !== undefined) {
    applied.tempo = carried.tempo;
  }

  return applied;
}

/**
 * The playback settings a loaded Pattern is actually sounding at — what the
 * next Pattern carries from it (AC-4.2.3/4: the tempo in effect, not the last
 * one set by hand). Tempo only: swing is never carried (AC-4.4.17).
 */
export function playbackInEffect(pattern) {
  return {
    tempo: pattern.tempo ?? DEFAULT_TEMPO,
  };
}
