/**
 * Metric accent defaults. AC-3.1.1 … AC-3.1.13.
 *
 * Constitution Principle I / FR-003: a Slot's default Accent Level is a pure
 * function of its metric position, recomputed on demand and NEVER stored. Only
 * a deliberate user override is persisted. This is what makes AC-3.1.10 work —
 * a Slot returns to the right default after a Recipe reset because nothing
 * remembered the old one.
 *
 * Levels: 0 = off, 1 = Weak, 2 = Medium, 3 = Strong.
 */
import { beatCount, beatNoteValue } from './meter.js';
import { slotCount } from './recipes.js';

export const OFF = 0;
export const WEAK = 1;
export const MEDIUM = 2;
export const STRONG = 3;

/**
 * The shared positional formula, applied to a sequence of length `n` at
 * 1-based index `i`. Used at Beat level across a Measure and again at Slot
 * level within a Beat.
 *
 *   Strong  if first
 *   Medium  if the sequence halves evenly and this is the start of the second half
 *   Weak    otherwise
 *
 * Consequences worth naming because they are easy to get wrong: an odd-length
 * sequence never produces a Medium (3-Slot triplets, 5-Slot splits, 5/4, 7/4,
 * 7/8, 9/8), and neither does a 2-length one, since it has no position beyond
 * first and last.
 */
export function metricLevel(i, n) {
  if (!Number.isInteger(i) || i < 1 || i > n) {
    throw new Error(`Position ${i} out of range for a sequence of ${n}`);
  }
  if (i === 1) return STRONG;
  if (n % 2 === 0 && n > 2 && i === n / 2 + 1) return MEDIUM;
  return WEAK;
}

/** A Beat's own default accent, from its position in the Measure. AC-3.1.2 */
export function beatAccent(timeSignature, beatIndex) {
  return metricLevel(beatIndex + 1, beatCount(timeSignature));
}

/**
 * A Slot's computed default Accent Level. AC-3.1.3 … AC-3.1.9.
 *
 * The within-Beat position is scored by the same formula, then combined with
 * the Beat's own level:
 *
 *   within Strong (Slot 1)  → the Beat's level, whatever it is
 *   within Medium           → one level below the Beat's, floored at Weak
 *   within Weak             → Weak
 *
 * So Slot 1 of a Medium Beat is Medium (AC-3.1.5), and the mid-Slot of a Weak
 * Beat floors at Weak rather than dropping to off (AC-3.1.4). A Recipe spanning
 * two Subdivision Groups is scored across the whole Beat, not per group
 * (AC-3.1.8).
 */
export function defaultAccent(measure, beatIndex, slotIndex) {
  const beat = measure.beats[beatIndex];
  if (!beat) throw new Error(`No Beat at index ${beatIndex}`);

  const n = slotCount(beat.recipe, beatNoteValue(measure.timeSignature));
  const within = metricLevel(slotIndex + 1, n);
  const beatLevel = beatAccent(measure.timeSignature, beatIndex);

  if (within === STRONG) return beatLevel;
  if (within === MEDIUM) return Math.max(WEAK, beatLevel - 1);
  return WEAK;
}

/**
 * What actually sounds and renders: 0 for an off Slot, the stored override when
 * the Composer set one, otherwise the computed default.
 *
 * Playback, rendering, and MIDI export all call this. None of them may
 * reimplement it — that divergence is exactly what Principle I exists to
 * prevent.
 */
export function effectiveAccent(measure, beatIndex, slotIndex) {
  const slot = measure.beats[beatIndex]?.slots[slotIndex];
  if (!slot) throw new Error(`No Slot at beat ${beatIndex}, slot ${slotIndex}`);
  if (!slot.on) return OFF;
  if (slot.accent !== undefined) return slot.accent;
  return defaultAccent(measure, beatIndex, slotIndex);
}

/**
 * The tap cycle. AC-3.1.11 … AC-3.1.13.
 *
 * From off, a tap lands on the Slot's computed default. Further taps walk the
 * other two levels in ascending order, wrapping, and then switch the Slot off:
 *
 *   default Strong: 3 → 1 → 2 → 0 → 3
 *   default Medium: 2 → 3 → 1 → 0 → 2
 *   default Weak:   1 → 2 → 3 → 0 → 1
 *
 * The point is that the first tap always gives the musically-normal accent for
 * that position, and returning to it takes the same number of taps wherever you
 * start.
 */
export function nextAccentInCycle(current, defaultLevel) {
  if (current === OFF) return defaultLevel;
  const next = (current % 3) + 1;
  return next === defaultLevel ? OFF : next;
}
