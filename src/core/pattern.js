/**
 * Pattern construction, mutation, and validation.
 *
 * Every mutator returns a NEW Pattern and never touches its argument. That is
 * what makes FR-013 — "rendering is a pure function of the Pattern plus
 * transport position" — enforceable rather than aspirational, and it makes undo
 * a matter of holding on to a previous reference.
 *
 * This module never prompts. The confirmation dialogs that guard destructive
 * edits (AC-1.3.7, AC-1.3.8, AC-1.1.7) are UI concerns; callers ask
 * `countActiveSlots` first and decide for themselves.
 */
import { TIME_SIGNATURES, beatCount, beatNoteValue, isSupported } from './meter.js';
import { defaultRecipeFor, isOffered, slotCount } from './recipes.js';
import { defaultAccent, nextAccentInCycle, OFF } from './accents.js';
import { isSupportedKey } from './pitch.js';
import { isValidSwing } from './swing.js';

export const MAX_MEASURES = 6;
export const MIN_TEMPO = 18;
export const MAX_TEMPO = 220;
export const DEFAULT_TEMPO = 80;
export const DEFAULT_TIME_SIGNATURE = '4/4';

/** Tags the app derives rather than stores (data-model §4). */
export const AUTOMATIC_TAGS = ['custom', 'swing', 'percussive', 'melodic'];

const clone = (v) => structuredClone(v);

// --- construction -----------------------------------------------------------

/** A Beat filled with the default Recipe and all Slots off. AC-1.3.1 … AC-1.3.3 */
export function createBeat(timeSignature) {
  const noteValue = beatNoteValue(timeSignature);
  const recipe = defaultRecipeFor(noteValue);
  return {
    recipe,
    slots: Array.from({ length: slotCount(recipe, noteValue) }, () => ({ on: false })),
  };
}

/** A Measure holding exactly `numerator` default Beats. AC-1.1.1, FR-002 */
export function createMeasure(timeSignature = DEFAULT_TIME_SIGNATURE) {
  if (!isSupported(timeSignature)) throw new Error(`Unsupported Time Signature: ${timeSignature}`);
  return {
    timeSignature,
    beats: Array.from({ length: beatCount(timeSignature) }, () => createBeat(timeSignature)),
  };
}

/** A new Pattern: one 4/4 Measure, default Recipes, every Slot off. AC-1.1.1 */
export function create(name = 'Untitled') {
  return {
    name,
    soundMode: 'percussive',
    tempo: DEFAULT_TEMPO,
    tags: [],
    rating: 0,
    measures: [createMeasure(DEFAULT_TIME_SIGNATURE)],
  };
}

// --- Measures ---------------------------------------------------------------

/** Append a Measure, inheriting the previous Measure's meter. AC-1.1.2 */
export function addMeasure(pattern) {
  if (pattern.measures.length >= MAX_MEASURES) {
    throw new Error(`A Pattern may hold at most ${MAX_MEASURES} Measures (AC-1.1.3)`);
  }
  const inherited = pattern.measures[pattern.measures.length - 1].timeSignature;
  return { ...clone(pattern), measures: [...clone(pattern.measures), createMeasure(inherited)] };
}

export function removeMeasure(pattern, index) {
  if (pattern.measures.length <= 1) throw new Error('A Pattern must keep at least one Measure');
  const measures = clone(pattern.measures);
  measures.splice(index, 1);
  return { ...clone(pattern), measures };
}

/**
 * Set one Measure's meter. Its Beats reset to the new meter's default Recipe
 * with every Slot cleared — there is no unsurprising way to carry Slots across
 * a Beat-count change, so the reset is explicit rather than a guessed remap
 * (AC-1.1.6).
 */
export function setTimeSignature(pattern, measureIndex, timeSignature) {
  if (!isSupported(timeSignature)) throw new Error(`Unsupported Time Signature: ${timeSignature}`);
  const measures = clone(pattern.measures);
  measures[measureIndex] = createMeasure(timeSignature);
  return { ...clone(pattern), measures };
}

/** The "apply to all Measures" branch of the first-Measure meter prompt. AC-1.1.5 */
export function setTimeSignatureAll(pattern, timeSignature) {
  if (!isSupported(timeSignature)) throw new Error(`Unsupported Time Signature: ${timeSignature}`);
  return {
    ...clone(pattern),
    measures: pattern.measures.map(() => createMeasure(timeSignature)),
  };
}

// --- Beats and Slots --------------------------------------------------------

/**
 * Change a Beat's Recipe. The Beat's Slots are replaced wholesale with fresh
 * off Slots, in either direction — growing a Recipe destroys content just as
 * surely as shrinking one, which is why AC-1.3.8 requires confirmation both
 * ways. Other Beats are untouched (AC-1.3.6).
 */
export function setRecipe(pattern, measureIndex, beatIndex, recipeId) {
  const measures = clone(pattern.measures);
  const measure = measures[measureIndex];
  const noteValue = beatNoteValue(measure.timeSignature);

  if (!isOffered(recipeId, noteValue)) {
    throw new Error(`Recipe "${recipeId}" is not offered on a ${noteValue}-note Beat`);
  }

  measure.beats[beatIndex] = {
    recipe: recipeId,
    slots: Array.from({ length: slotCount(recipeId, noteValue) }, () => ({ on: false })),
  };
  return { ...clone(pattern), measures };
}

/** Active Slots on one Beat — what the confirmation prompt counts. AC-1.3.7 */
export function countActiveSlots(pattern, measureIndex, beatIndex) {
  return pattern.measures[measureIndex].beats[beatIndex].slots.filter((s) => s.on).length;
}

/**
 * Tap a Slot: off → its computed default → the other two levels → off.
 * AC-3.1.1, AC-3.1.11 … AC-3.1.13.
 *
 * An accent equal to the computed default is stored as an override anyway once
 * the Composer has cycled through — but a Slot turned on and left alone stores
 * no accent at all, so it keeps tracking its position (FR-003, AC-3.1.10).
 */
export function cycleAccent(pattern, measureIndex, beatIndex, slotIndex) {
  const measures = clone(pattern.measures);
  const measure = measures[measureIndex];
  const slot = measure.beats[beatIndex].slots[slotIndex];

  const fallback = defaultAccent(measure, beatIndex, slotIndex);
  const current = slot.on ? (slot.accent ?? fallback) : OFF;
  const next = nextAccentInCycle(current, fallback);

  if (next === OFF) {
    measure.beats[beatIndex].slots[slotIndex] = { on: false };
  } else if (next === fallback && current === OFF) {
    // First tap lands on the default; leave it computed rather than freezing it.
    measure.beats[beatIndex].slots[slotIndex] = { ...slot, on: true, accent: undefined };
    delete measure.beats[beatIndex].slots[slotIndex].accent;
  } else {
    measure.beats[beatIndex].slots[slotIndex] = { ...slot, on: true, accent: next };
  }

  return { ...clone(pattern), measures };
}

export function setPitch(pattern, measureIndex, beatIndex, slotIndex, pitch) {
  const measures = clone(pattern.measures);
  const slot = measures[measureIndex].beats[beatIndex].slots[slotIndex];
  if (!slot.on) throw new Error('Pitch may only be assigned to an active Slot');
  slot.pitch = clone(pitch);
  return { ...clone(pattern), measures };
}

/** Per-Subdivision-Group swing, keyed by group index within the Beat. AC-4.4.2 */
export function setGroupSwing(pattern, measureIndex, beatIndex, groupIndex, swing) {
  if (!isValidSwing(swing)) throw new Error(`Swing must be an integer 0–100, got ${swing}`);
  const measures = clone(pattern.measures);
  const beat = measures[measureIndex].beats[beatIndex];
  beat.swing = { ...(beat.swing ?? {}), [groupIndex]: swing };
  return { ...clone(pattern), measures };
}

// --- whole-Pattern operations -----------------------------------------------

/** Append another Pattern's Measures after this one's. US-8.1 */
export function append(a, b) {
  const measures = [...clone(a.measures), ...clone(b.measures)];
  if (measures.length > MAX_MEASURES) {
    throw new Error(
      `Appending would produce ${measures.length} Measures, over the ${MAX_MEASURES} cap (AC-1.1.3)`
    );
  }
  return { ...clone(a), measures };
}

/** Double a Pattern's length with a copy of its own Measures. US-10.1 */
export function duplicate(pattern) {
  return append(pattern, pattern);
}

// --- derived ----------------------------------------------------------------

/**
 * Tags the app computes rather than stores. Persisting these would let them
 * drift out of sync with the Pattern they describe (data-model §4).
 *
 * @param {object} pattern
 * @param {boolean} isOwned  whether the Pattern came from the user's own store
 */
export function automaticTags(pattern, isOwned) {
  const tags = [pattern.soundMode];
  if (isOwned) tags.push('custom');
  const swung = pattern.measures.some((m) =>
    m.beats.some((b) => Object.values(b.swing ?? {}).some((s) => s > 0))
  );
  if (swung) tags.push('swing');
  return tags;
}

// --- validation -------------------------------------------------------------

/** data-model §7. Returns every problem rather than throwing on the first. */
export function validate(pattern) {
  const errors = [];
  const fail = (m) => errors.push(m);

  if (typeof pattern?.name !== 'string' || !pattern.name.trim()) fail('name must be a non-empty string');
  if (!['percussive', 'melodic'].includes(pattern?.soundMode)) fail(`soundMode "${pattern?.soundMode}" invalid`);

  const melodic = pattern?.soundMode === 'melodic';
  if (melodic !== ('key' in (pattern ?? {}))) fail('key must be present iff soundMode is melodic');
  if (melodic && !isSupportedKey(pattern.key)) fail(`Key "${pattern.key}" unsupported`);

  if (!Number.isInteger(pattern?.tempo) || pattern.tempo < MIN_TEMPO || pattern.tempo > MAX_TEMPO) {
    fail(`tempo ${pattern?.tempo} outside ${MIN_TEMPO}–${MAX_TEMPO}`);
  }
  if (!Number.isInteger(pattern?.rating) || pattern.rating < 0 || pattern.rating > 5) {
    fail(`rating ${pattern?.rating} outside 0–5`);
  }
  if (!Array.isArray(pattern?.tags)) fail('tags must be an array');
  else
    for (const t of pattern.tags) {
      if (AUTOMATIC_TAGS.includes(String(t).toLowerCase())) {
        fail(`tag "${t}" is automatic and must not be stored`);
      }
    }

  const measures = pattern?.measures;
  if (!Array.isArray(measures) || measures.length < 1 || measures.length > MAX_MEASURES) {
    fail(`${measures?.length} Measures, expected 1–${MAX_MEASURES}`);
    return { valid: false, errors };
  }

  measures.forEach((m, mi) => {
    if (!isSupported(m.timeSignature)) {
      fail(`Measure ${mi + 1}: unsupported Time Signature "${m.timeSignature}"`);
      return;
    }
    const expectedBeats = beatCount(m.timeSignature);
    if (!Array.isArray(m.beats) || m.beats.length !== expectedBeats) {
      fail(`Measure ${mi + 1}: ${m.beats?.length} Beats in ${m.timeSignature}, expected ${expectedBeats}`);
      return;
    }
    const noteValue = beatNoteValue(m.timeSignature);

    m.beats.forEach((b, bi) => {
      const where = `Measure ${mi + 1} Beat ${bi + 1}`;
      if (!isOffered(b.recipe, noteValue)) {
        fail(`${where}: Recipe "${b.recipe}" not offered on a ${noteValue}-note Beat`);
        return;
      }
      const expectedSlots = slotCount(b.recipe, noteValue);
      if (!Array.isArray(b.slots) || b.slots.length !== expectedSlots) {
        fail(`${where}: ${b.slots?.length} Slots for ${b.recipe}, expected ${expectedSlots}`);
        return;
      }
      b.slots.forEach((s, si) => {
        const slot = `${where} Slot ${si + 1}`;
        if (typeof s.on !== 'boolean') fail(`${slot}: on must be a boolean`);
        if ('accent' in s) {
          if (!s.on) fail(`${slot}: accent on an off Slot`);
          if (![1, 2, 3].includes(s.accent)) fail(`${slot}: accent ${s.accent} outside 1–3`);
        }
        if ('pitch' in s) {
          if (!s.on) fail(`${slot}: pitch on an off Slot`);
          if (!melodic) fail(`${slot}: pitch on a percussive Pattern`);
        } else if (melodic && s.on) {
          fail(`${slot}: melodic Pattern has an on Slot with no pitch`);
        }
      });
    });
  });

  return { valid: errors.length === 0, errors };
}

export { TIME_SIGNATURES };
