/**
 * Swing offsets for straight-feel Subdivision Groups. AC-4.4.1 … AC-4.4.5.
 *
 * Constitution Principle I: swing applies ONLY to straight-feel groups, per
 * group, never as a Pattern-wide value and never to triplet feel — a triplet is
 * already the thing swing approximates, so swinging one is meaningless. In a
 * mixed Recipe the straight half swings and the triplet half does not
 * (AC-4.4.4).
 */

export const MIN_SWING = 0;
export const MAX_SWING = 100;

/**
 * The pulse level swing pairs at (AC-4.4.7). One value for the whole Pattern —
 * unlike the amount, which stays per group — because the Quarters feel pairs
 * whole Beats and so cannot live inside any one Subdivision Group.
 */
export const SWING_FEELS = ['quarter', 'eighth', 'sixteenth'];
export const DEFAULT_SWING_FEEL = 'eighth';

/** The delay is capped just short of a full Slot so a swung Slot can never reach or pass the next one. */
const MAX_DELAY_FRACTION = 0.95;

export function isValidSwing(swing) {
  return Number.isInteger(swing) && swing >= MIN_SWING && swing <= MAX_SWING;
}

export function isValidSwingFeel(feel) {
  return SWING_FEELS.includes(feel);
}

/**
 * The one delay formula, over whichever pulse duration the feel pairs at:
 * a Slot at the 8ths and 16ths feels, a whole Beat at Quarters (AC-4.4.9).
 */
export function swungDelay(swing, pulseDuration) {
  return Math.min((swing / 100) * pulseDuration, MAX_DELAY_FRACTION * pulseDuration);
}

/**
 * Per-Slot time offsets, in seconds, for one straight Subdivision Group.
 *
 * At the default 8ths feel, only the Slot at position N/2 + 1 — the first Slot
 * of the group's second half, the "&" — is delayed; every other Slot keeps its
 * nominal onset. That is what produces a long-short feel rather than a uniform
 * lag. At the 16ths feel the same long-short pairs each half of a 4-Slot group
 * instead, delaying positions 2 and 4 (AC-4.4.8); a 2-Slot group's Slots land
 * on the first half of each 16th pair, so it has nothing to delay. At the
 * Quarters feel the pairing is between whole Beats, which no single group can
 * see — the timeline handles it (AC-4.4.9) and every group offset is zero here.
 *
 * A group with an odd Slot count has no midpoint to pair and cannot swing, so
 * it returns all zeros. In practice straight groups are 1, 2, or 4 Slots; the
 * 1-Slot Undivided group falls out as unswingable for the same reason.
 *
 * @param {number} groupSlotCount  Slots in this group
 * @param {number} swing           0–100
 * @param {number} slotDuration    seconds per Slot at the current tempo
 * @param {string} [feel]          'quarter' | 'eighth' | 'sixteenth'
 * @returns {number[]}             offset in seconds per Slot, same length
 */
export function swungOffsets(groupSlotCount, swing, slotDuration, feel = DEFAULT_SWING_FEEL) {
  if (!Number.isInteger(groupSlotCount) || groupSlotCount < 1) {
    throw new Error(`Slot count must be a positive integer, got ${groupSlotCount}`);
  }
  if (!isValidSwing(swing)) {
    throw new Error(`Swing must be an integer 0–100, got ${swing}`);
  }
  if (!(slotDuration >= 0)) {
    throw new Error(`Slot duration must be non-negative, got ${slotDuration}`);
  }
  if (!isValidSwingFeel(feel)) {
    throw new Error(`Swing feel must be one of ${SWING_FEELS.join(', ')}, got ${feel}`);
  }

  const offsets = new Array(groupSlotCount).fill(0);
  if (swing === 0 || groupSlotCount % 2 !== 0) return offsets;

  if (feel === 'eighth') {
    offsets[groupSlotCount / 2] = swungDelay(swing, slotDuration); // 0-based index of position N/2 + 1
  } else if (feel === 'sixteenth' && groupSlotCount === 4) {
    const delay = swungDelay(swing, slotDuration);
    offsets[1] = delay;
    offsets[3] = delay;
  }
  return offsets;
}
