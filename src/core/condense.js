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
 * A Pattern whose Measures differ in meter is first *regrouped* (AC-10.2.6):
 * every Beat is taken in order as one sequence, regardless of barlines, and
 * written into Measures of a Time Signature the Composer picks — so groups of
 * 3/4 and 2/4 become 4/4 and then halve into sixteenths. Eighth-note Beats pair
 * into quarter-note Beats and quarter-note Beats split into eighth-note ones as
 * the target needs; a triplet or split Beat travels whole or not at all.
 *
 * Every Slot keeps the Accent it sounded with (AC-10.2.1/4), stored as an
 * override only where its new position's computed default differs — so a 3+3+2
 * grouping is still heard once the barlines that made it are gone.
 *
 * Pure: never touches its argument, never prompts. What lands where is
 * `main.js`'s business, and it lands the way Double Length does.
 */
import { TIME_SIGNATURES, beatCount, beatNoteValue } from './meter.js';
import { defaultAccent, effectiveAccent } from './accents.js';
import { mapOverrides, withOverrides } from './harmony.js';

const PACKED_RECIPE = 'straight-16ths';

/** Where a regroup lands when it can, listed first (AC-10.2.6/1). */
const PREFERRED_TARGET = '4/4';

/**
 * The Slots a Beat contributes to a packed Beat, or null when it is not
 * halvable. Each contributed Slot is the stored Slot itself — its `on`, any
 * Accent and any Pitch travel with it (AC-10.2.1/4).
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

/** Whether the Measures differ in Time Signature. */
function isMixedMeter(pattern) {
  return pattern.measures.some((m) => m.timeSignature !== pattern.measures[0].timeSignature);
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
 * Run `transform` on a copy, then give every sounding Slot the Accent it had
 * before. AC-10.2.1/4
 *
 * The transforms move Slot objects rather than copying them, so a Slot is its
 * own key from before to after. Where the Accent it sounded with is the new
 * position's computed default, no override is stored — defaults are computed,
 * never stored (Constitution Principle I).
 */
function keepingAccents(pattern, transform) {
  const next = structuredClone(pattern);
  const sounded = new Map();
  next.measures.forEach((m) =>
    m.beats.forEach((b, bi) => b.slots.forEach((s, si) => sounded.set(s, effectiveAccent(m, bi, si))))
  );
  const out = transform(next);
  out.measures.forEach((m) =>
    m.beats.forEach((b, bi) =>
      b.slots.forEach((s, si) => {
        if (!s.on || !sounded.has(s)) return;
        const was = sounded.get(s);
        if (was === defaultAccent(m, bi, si)) delete s.accent;
        else s.accent = was;
      })
    )
  );
  return out;
}

/** One halving of a Pattern the caller already owns. */
function halveOwned(pattern) {
  const measures = [];
  for (let i = 0; i < pattern.measures.length; i += 2) {
    const { timeSignature } = pattern.measures[i];
    const noteValue = beatNoteValue(timeSignature);
    const olds = [...pattern.measures[i].beats, ...pattern.measures[i + 1].beats];
    const beats = [];
    for (let j = 0; j < olds.length; j += 2) {
      beats.push({
        recipe: PACKED_RECIPE,
        slots: [...coarseSlots(olds[j], noteValue), ...coarseSlots(olds[j + 1], noteValue)],
      });
    }
    measures.push({ timeSignature, beats });
  }
  pattern.measures = measures;
  // A Measure made of two takes the overrides of both, the first's where they
  // clash (AC-10.4.7/2).
  const overrides = mapOverrides(pattern.harmony?.overrides, (m, c) => [Math.floor(m / 2), c]);
  return withOverrides(pattern, overrides);
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
  return keepingAccents(pattern, halveOwned);
}

function halveAll(pattern) {
  let next = pattern;
  while (canHalve(next)) next = halveOwned(next);
  return next;
}

/** Two eighth-note Beats as one quarter-note Beat. AC-10.2.6/4 */
function pairEighths(a, b) {
  if (a.recipe === 'undivided' && b.recipe === 'undivided') {
    return { recipe: 'straight-8ths', slots: [a.slots[0], b.slots[0]] };
  }
  const sixteenths = (beat) => (beat.recipe === 'undivided' ? [beat.slots[0], { on: false }] : beat.slots);
  return { recipe: 'straight-16ths', slots: [...sixteenths(a), ...sixteenths(b)] };
}

/** One quarter-note Beat as two eighth-note Beats, or null. AC-10.2.6/5 */
function splitQuarter(beat) {
  const [a, b, c, d] = beat.slots;
  if (beat.recipe === 'straight-8ths') return [{ recipe: 'undivided', slots: [a] }, { recipe: 'undivided', slots: [b] }];
  if (beat.recipe === 'straight-16ths') return [{ recipe: 'straight-16ths', slots: [a, b] }, { recipe: 'straight-16ths', slots: [c, d] }];
  return null;
}

/**
 * Every Beat in order, written as Beats of `noteValue`, or null when they
 * cannot be. AC-10.2.6/6
 *
 * Into quarter-note Beats, eighth-note Beats pair; a run that leaves one over
 * before a quarter-note Beat or the end has no partner. Into eighth-note Beats,
 * quarter-note Beats split; a triplet or split Beat cannot.
 */
function beatsAs(pattern, noteValue) {
  const out = [];
  let pending = null;
  for (const measure of pattern.measures) {
    const from = beatNoteValue(measure.timeSignature);
    for (const beat of measure.beats) {
      if (from === noteValue) {
        if (pending) return null;
        out.push(beat);
      } else if (noteValue === 'eighth') {
        const halves = splitQuarter(beat);
        if (!halves) return null;
        out.push(...halves);
      } else if (pending) {
        out.push(pairEighths(pending, beat));
        pending = null;
      } else {
        pending = beat;
      }
    }
  }
  return pending ? null : out;
}

/** The regrouped and halved Pattern, or null when `target` does not fit. */
function condensedInto(pattern, target) {
  let result = null;
  keepingAccents(pattern, (next) => {
    const beats = beatsAs(next, beatNoteValue(target));
    const perMeasure = beatCount(target);
    if (!beats || beats.length % perMeasure !== 0) return next;
    const measures = [];
    for (let i = 0; i < beats.length; i += perMeasure) {
      measures.push({ timeSignature: target, beats: beats.slice(i, i + perMeasure) });
    }
    next.measures = measures;
    // Regrouped into another meter, no Measure is the one an override was on,
    // so they are dropped (AC-10.4.7/2).
    next = withOverrides(next, null);
    const halved = halveAll(next);
    // Condensing never lengthens: 2/4 is no target for 4/4, 4/4, 2/4, 2/4, 2/4.
    if (halved.measures.length < pattern.measures.length) result = halved;
    return halved;
  });
  return result;
}

/**
 * The Time Signatures a mixed-meter Pattern can be regrouped into, 4/4 first
 * when it fits and the rest in menu order. Empty for a Pattern of one meter,
 * which condenses in that meter. A mixed-meter Pattern whose Measures pair up
 * by meter can also be halved as written (`canHalve`), which is the caller's
 * other option. AC-10.2.6/1, AC-10.2.6/6
 */
export function condenseTargets(pattern) {
  if (!isMixedMeter(pattern)) return [];
  const order = [PREFERRED_TARGET, ...TIME_SIGNATURES.filter((ts) => ts !== PREFERRED_TARGET)];
  return order.filter((ts) => condensedInto(pattern, ts) !== null);
}

/** Whether Condense would change the Pattern at all. AC-10.2.3 */
export function canCondense(pattern) {
  return canHalve(pattern) || condenseTargets(pattern).length > 0;
}

/**
 * Every halving that is possible, in one step (AC-10.2.2): as written, each
 * Measure keeping its meter, or — given a `target` from `condenseTargets` —
 * after regrouping every Beat into that Time Signature (AC-10.2.6).
 *
 * A Pattern that cannot be condensed comes back as an unchanged copy rather
 * than an error: the control is disabled in that state, and a caller that asks
 * anyway is asking for the simplest form, which is what it already has.
 */
export function condense(pattern, target) {
  if (target) return condensedInto(pattern, target) ?? structuredClone(pattern);
  return keepingAccents(pattern, halveAll);
}
