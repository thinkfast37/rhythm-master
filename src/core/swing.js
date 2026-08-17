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

/** The delay is capped just short of a full Slot so a swung Slot can never reach or pass the next one. */
const MAX_DELAY_FRACTION = 0.95;

export function isValidSwing(swing) {
  return Number.isInteger(swing) && swing >= MIN_SWING && swing <= MAX_SWING;
}

/**
 * Per-Slot time offsets, in seconds, for one straight Subdivision Group.
 *
 * Only the Slot at position N/2 + 1 — the first Slot of the group's second
 * half, the "&" — is delayed; every other Slot keeps its nominal onset. That
 * is what produces a long-short feel rather than a uniform lag.
 *
 * A group with an odd Slot count has no such midpoint and cannot swing, so it
 * returns all zeros. In practice straight groups are 1, 2, or 4 Slots; the
 * 1-Slot Undivided group falls out as unswingable for the same reason.
 *
 * @param {number} groupSlotCount  Slots in this group
 * @param {number} swing           0–100
 * @param {number} slotDuration    seconds per Slot at the current tempo
 * @returns {number[]}             offset in seconds per Slot, same length
 */
export function swungOffsets(groupSlotCount, swing, slotDuration) {
  if (!Number.isInteger(groupSlotCount) || groupSlotCount < 1) {
    throw new Error(`Slot count must be a positive integer, got ${groupSlotCount}`);
  }
  if (!isValidSwing(swing)) {
    throw new Error(`Swing must be an integer 0–100, got ${swing}`);
  }
  if (!(slotDuration >= 0)) {
    throw new Error(`Slot duration must be non-negative, got ${slotDuration}`);
  }

  const offsets = new Array(groupSlotCount).fill(0);
  if (swing === 0 || groupSlotCount % 2 !== 0) return offsets;

  const delay = Math.min((swing / 100) * slotDuration, MAX_DELAY_FRACTION * slotDuration);
  offsets[groupSlotCount / 2] = delay; // 0-based index of position N/2 + 1
  return offsets;
}
