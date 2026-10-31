/**
 * Roll the dice across the Melody group (US-2.14, research.md D-021): every
 * melodic setting not marked No dice re-picked at random, as one edit.
 *
 * Pure. The random numbers come from the caller as `random()`, as `pickAtLevel`
 * takes one for Give me one (US-14.1) — `core/` rolls no dice of its own. Each setting lands on a
 * value other than the one in force whenever another is offered, through the
 * same core setters its picker uses, so a rolled value is indistinguishable
 * from a chosen one.
 */
import { KEYS, REGISTERS, registerOf } from './pitch.js';
import { SCALES, DEFAULT_SCALE } from './scales.js';
import {
  hasHarmony,
  matchProgression,
  matchVoicing,
  setProgression,
  setArpeggio,
  clearChordFills,
  setVoicing,
  setChange,
  PROGRESSIONS,
  ARPEGGIOS,
  VOICINGS,
  CHANGES,
  DEFAULT_ARPEGGIO,
} from './harmony.js';

/** One of `list` for a random number in [0, 1) the caller supplies, or null for an empty list. */
function pick(list, random) {
  if (!list.length) return null;
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(random * list.length)));
  return list[i];
}

/** The controls a roll can change, in the order they are rolled (AC-2.14.2). */
export const DICE_CONTROLS = [
  { id: 'key', label: 'Key' },
  { id: 'scale', label: 'Scale' },
  { id: 'register', label: 'Register' },
  { id: 'progression', label: 'Progression' },
  { id: 'change', label: 'Chord changes' },
  { id: 'fill', label: 'Fill' },
  { id: 'voicing', label: 'Voicing' },
];

/** The settings that exist only under a progression. */
const HARMONIC = ['change', 'fill', 'voicing'];

/**
 * The controls a roll would change on this Pattern: those not marked No dice,
 * the harmonic ones only where a progression is in force once the Progression's
 * own roll is done (AC-2.14.2).
 */
export function rollingControls(pattern, noDice = []) {
  const live = DICE_CONTROLS.map((c) => c.id).filter((id) => !noDice.includes(id));
  const harmonic = hasHarmony(pattern) || live.includes('progression');
  return live.filter((id) => harmonic || !HARMONIC.includes(id));
}

/** Whether a roll has anything left to change (AC-2.14.1/5). */
export function canRoll(pattern, noDice = []) {
  return rollingControls(pattern, noDice).length > 0;
}

/** One of `list` other than `current`, when the list offers another. */
function other(list, current, random) {
  const choices = list.length > 1 ? list.filter((v) => v !== current) : list;
  return pick(choices, random());
}

/**
 * Roll every control not marked No dice (AC-2.14.1, AC-2.14.2).
 *
 * @param {object} pattern
 * @param {object} options
 * @param {string[]} [options.noDice]        control ids kept out of the roll
 * @param {() => number} options.random      a number in [0, 1) per call — the dice
 * @param {string[]} [options.fills]         the fill ids a roll may land on (My list, else all)
 * @param {string[]} [options.progressions]  the progression ids a roll may land on
 * @returns {{ pattern: object, rolled: Record<string, unknown> }} the Pattern, and what each rolled control landed on
 */
export function rollMelody(pattern, { noDice = [], random, fills = ARPEGGIOS.map((a) => a.id), progressions = PROGRESSIONS.map((p) => p.id) } = {}) {
  if (typeof random !== 'function') throw new Error('rollMelody needs a random() source');
  const controls = rollingControls(pattern, noDice);
  let next = pattern;
  const rolled = {};

  if (controls.includes('key')) {
    rolled.key = other(KEYS, pattern.key ?? 'C', random);
    next = { ...next, key: rolled.key };
  }
  if (controls.includes('scale')) {
    rolled.scale = other(SCALES.map((s) => s.id), pattern.scale ?? DEFAULT_SCALE, random);
    next = { ...next, scale: rolled.scale };
  }
  if (controls.includes('register')) {
    rolled.register = other(REGISTERS.map((r) => r.value), registerOf(pattern), random);
    next = { ...next, register: rolled.register };
  }
  if (controls.includes('progression')) {
    // Spelled under the scale just rolled, voiced Closest; a fresh progression
    // takes the default fill so the chords are audible, as the picker's does
    // (AC-2.6.1/7). A fill already chosen is kept for the Fill roll to move.
    rolled.progression = other(progressions, matchProgression(next), random);
    next = setProgression(next, rolled.progression);
    if (!next.harmony.arpeggio) next = setArpeggio(next, DEFAULT_ARPEGGIO);
  }
  if (controls.includes('change')) {
    rolled.change = other(CHANGES, next.harmony.change, random);
    next = setChange(next, rolled.change);
  }
  if (controls.includes('fill')) {
    // The rolled fill is heard on every chord: each chord's own fill goes with
    // the roll (AC-2.15.3/3).
    rolled.fill = other(fills, next.harmony.arpeggio ?? null, random);
    next = clearChordFills(setArpeggio(next, rolled.fill));
  }
  if (controls.includes('voicing')) {
    rolled.voicing = other(VOICINGS.map((v) => v.id), matchVoicing(next.harmony.chords), random);
    next = setVoicing(next, rolled.voicing);
  }
  return { pattern: next, rolled };
}
