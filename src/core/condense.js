/**
 * Condense a Pattern to its simplest subdivision (US-10.2).
 *
 * A Pattern written as four Measures of quarter notes holds the same sequence
 * of events as one Measure of sixteenths. One *halving* packs each pair of
 * consecutive Beats into one Beat at twice the subdivision, and so each pair of
 * consecutive Measures into one Measure of the same Time Signature. `condense`
 * applies halvings until none is possible.
 *
 * A Beat is halvable when its events sit on the coarser half of a straight
 * subdivision: Straight 8ths, or Straight 16ths whose finer Slots are all off
 * (on an eighth-note Beat, Undivided, or Straight 16ths with its second Slot
 * off). Triplets and the mixed splits have no coarser half and are never
 * halvable. The packed Beat is always Straight 16ths — the finest straight
 * Recipe on either note value — so the Recipe that can be halved again is that
 * one, once the finer Slots of every Beat are off.
 *
 * Pure: never touches its argument, never prompts. What lands where is
 * `main.js`'s business, and it lands the way Double Length does.
 */
import { beatNoteValue } from './meter.js';

const PACKED_RECIPE = 'straight-16ths';

/**
 * The Slots a Beat contributes to a packed Beat, or null when it is not
 * halvable. Each contributed Slot is the stored Slot itself — its `on`, any
 * Accent override and any Pitch travel with it (AC-10.2.1/4).
 */
function coarseSlots(beat, noteValue) {
  const { recipe, slots } = beat;
  if (noteValue === 'quarter') {
    if (recipe === 'straight-8ths') return slots;
    if (recipe === 'straight-16ths' && !slots[1].on && !slots[3].on) return [slots[0], slots[2]];
    return null;
  }
  if (recipe === 'undivided') return slots;
  if (recipe === 'straight-16ths' && !slots[1].on) return [slots[0]];
  return null;
}

/** Whether one halving is possible. AC-10.2.3 */
export function canHalve(pattern) {
  const { measures } = pattern;
  if (measures.length < 2 || measures.length % 2 !== 0) return false;
  for (let i = 0; i < measures.length; i += 2) {
    if (measures[i].timeSignature !== measures[i + 1].timeSignature) return false;
  }
  return measures.every((m) => {
    const noteValue = beatNoteValue(m.timeSignature);
    return m.beats.every((b) => coarseSlots(b, noteValue) !== null);
  });
}

/**
 * One halving. AC-10.2.1
 *
 * Per-Group swing overrides are dropped: two Beats' overrides cannot both
 * survive in the one Beat they become, and the Pattern-wide amount still
 * applies (AC-10.2.1/5). Everything else on the Pattern is carried as is.
 */
export function halve(pattern) {
  if (!canHalve(pattern)) throw new Error('This Pattern cannot be halved (AC-10.2.3)');
  const next = structuredClone(pattern);
  const measures = [];
  for (let i = 0; i < next.measures.length; i += 2) {
    const { timeSignature } = next.measures[i];
    const noteValue = beatNoteValue(timeSignature);
    const olds = [...next.measures[i].beats, ...next.measures[i + 1].beats];
    const beats = [];
    for (let j = 0; j < olds.length; j += 2) {
      beats.push({
        recipe: PACKED_RECIPE,
        slots: [...coarseSlots(olds[j], noteValue), ...coarseSlots(olds[j + 1], noteValue)],
      });
    }
    measures.push({ timeSignature, beats });
  }
  next.measures = measures;
  return next;
}

/** Whether Condense would change the Pattern at all. AC-10.2.3 */
export function canCondense(pattern) {
  return canHalve(pattern);
}

/**
 * Every halving that is possible, in one step. AC-10.2.2
 *
 * A Pattern that cannot be halved comes back as an unchanged copy rather than
 * an error: the control is disabled in that state, and a caller that asks
 * anyway is asking for the simplest form, which is what it already has.
 */
export function condense(pattern) {
  let next = structuredClone(pattern);
  while (canHalve(next)) next = halve(next);
  return next;
}
