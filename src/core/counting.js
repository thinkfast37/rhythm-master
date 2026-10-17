/**
 * Counting-system labels. US-5.6.
 *
 * Three systems: Takadimi, 1-e-&-a, and Numbered — shown as Pulse tracking.
 * The two syllable systems label a Slot by its metric position within the
 * Beat, so they depend on the Recipe. Pulse tracking labels the Measure's
 * Slots as one run of pulses, in groups a musician can hold in their head
 * (AC-5.6.7 … AC-5.6.11), so it depends on the whole Measure.
 *
 * A Pattern containing a mixed-feel Recipe renders in Numbered whatever the
 * musician's preference, because neither Takadimi nor 1-e-&-a has vocabulary for
 * a half-Beat group of 2 or 3 (AC-5.6.2). That override does NOT write back to
 * the stored preference (AC-5.6.3) — the preference is what they chose, not what
 * one Pattern forced.
 */
import { defaultAccent, effectiveAccent } from './accents.js';
import { beatCount, beatNoteValue } from './meter.js';
import { isMixedFeel, subdivisionGroups } from './recipes.js';

export const COUNTING_SYSTEMS = ['takadimi', 'one-e-and-a', 'numbered'];

export const COUNTING_LABELS = {
  takadimi: 'Takadimi',
  'one-e-and-a': '1-e-&-a',
  numbered: 'Pulse tracking',
};

/** Whole-Beat vocabularies, keyed by Slot count. */
const VOCABULARY = {
  takadimi: {
    1: ['ta'],
    2: ['ta', 'di'],
    3: ['ta', 'ki', 'da'],
    4: ['ta', 'ka', 'di', 'mi'],
  },
  'one-e-and-a': {
    1: ['1'],
    2: ['1', '&'],
    3: ['1', 'trip', 'let'],
    4: ['1', 'e', '&', 'a'],
  },
};

/** As many pulses as a group may hold: "once you start going over four, it's tricky." */
const MAX_GROUP = 4;

/**
 * Per-Slot labels for one Beat.
 *
 * The two syllable systems need only the Beat. 1-e-&-a's leading digit is the
 * Beat's own ordinal within the Measure (AC-5.6.12), so `beatIndex` (0-based,
 * restarting each Measure) is needed only for that system. Numbered — and a
 * mixed-feel Recipe, which has no syllables — counts the Beat as a run of
 * pulses on its own, with nothing stressed; `measureLabels` is what the
 * application renders, since a Beat alone cannot know its group's number.
 */
export function labelsFor(recipeId, beatNoteValue, system, beatIndex = 0) {
  if (!COUNTING_SYSTEMS.includes(system)) throw new Error(`Unknown counting system: ${system}`);

  const groups = subdivisionGroups(recipeId, beatNoteValue);
  const total = groups.reduce((n, g) => n + g.slotIndices.length, 0);

  if (system === 'numbered' || isMixedFeel(recipeId)) {
    const starts = new Set(groups.map((g) => g.slotIndices[0]));
    return groupLabels(divideSpan(total, starts, false));
  }

  const vocab = VOCABULARY[system][total];
  if (!vocab) throw new Error(`No ${system} vocabulary for a ${total}-Slot Beat`);
  const labels = [...vocab];
  if (system === 'one-e-and-a') labels[0] = String(beatIndex + 1);
  return labels;
}

/**
 * Per-Slot labels for every Beat of a Measure, as an array of label arrays in
 * Beat order. The syllable systems delegate to `labelsFor`; Numbered is pulse
 * tracking over the whole Measure.
 */
export function measureLabels(measure, system) {
  if (!COUNTING_SYSTEMS.includes(system)) throw new Error(`Unknown counting system: ${system}`);
  const noteValue = beatNoteValue(measure.timeSignature);
  const numbered = system === 'numbered' || measure.beats.some((b) => isMixedFeel(b.recipe));
  if (!numbered) return measure.beats.map((beat, b) => labelsFor(beat.recipe, noteValue, system, b));

  const flat = groupLabels(pulseGroups(measure));
  let next = 0;
  return measure.beats.map((beat) => beat.slots.map(() => flat[next++]));
}

/**
 * The Measure's pulses divided into groups, as group sizes in order.
 *
 * A group begins at the Measure's first pulse — the downbeat, the strongest
 * stress there is — and at every stress: a sounding Slot whose accent the
 * Composer raised above its computed default (AC-5.6.9). The computed defaults
 * are the meter's own shape, which the groups already follow, so they are not
 * stresses; nor is a lowered accent, nor a silent Slot. Every span between
 * group starts that is longer than one group holds is then divided
 * (AC-5.6.8, AC-5.6.10).
 */
function pulseGroups(measure) {
  const noteValue = beatNoteValue(measure.timeSignature);
  const starts = new Set(); // pulse indices where the Beat or a Subdivision Group begins
  const stresses = [];
  let index = 0;
  measure.beats.forEach((beat, b) => {
    for (const group of subdivisionGroups(beat.recipe, noteValue)) starts.add(index + group.slotIndices[0]);
    beat.slots.forEach((slot, s) => {
      if (slot.on && effectiveAccent(measure, b, s) > defaultAccent(measure, b, s)) stresses.push(index);
      index += 1;
    });
  });
  const total = index;
  const anchors = [0, ...stresses.filter((i) => i > 0)];
  const compound = isCompound(measure.timeSignature);

  const sizes = [];
  anchors.forEach((from, i) => {
    const to = anchors[i + 1] ?? total;
    const local = new Set([...starts].filter((p) => p > from && p < to).map((p) => p - from));
    sizes.push(...divideSpan(to - from, local, compound));
  });
  return sizes;
}

/** 6/8, 9/8 and 12/8: eighth-note Beats in threes. 7/8 is not compound. */
function isCompound(timeSignature) {
  const n = beatCount(timeSignature);
  return beatNoteValue(timeSignature) === 'eighth' && n >= 6 && n % 3 === 0;
}

/**
 * Divide a span of `length` pulses into groups of at most MAX_GROUP, as sizes.
 *
 * A span that fits in one group is one group. A longer span is divided into
 * groups of 2, 3 or 4 — every length past 1 can be — choosing, in order:
 *
 *   1. the fewest boundaries that miss a Beat or Subdivision Group start (`starts`,
 *      as offsets within the span);
 *   2. in a compound meter, the fewest groups that are not threes;
 *   3. the fewest groups;
 *   4. the nearest-equal group sizes;
 *   5. the larger group first.
 *
 * Exhaustive over a small state: the position reached, and the smallest and
 * largest group so far, which is all rule 4 needs to be judged at the end.
 */
function divideSpan(length, starts, compound) {
  if (length <= MAX_GROUP) return length > 0 ? [length] : [];

  // best.get(position) → Map of `${min},${max}` → { cost: [misses, nonThrees, groups], sizes }
  const best = new Map([[0, new Map([['0,0', { cost: [0, 0, 0], sizes: [] }]])]]);
  for (let pos = 0; pos < length; pos++) {
    const here = best.get(pos);
    if (!here) continue;
    for (const [, state] of here) {
      for (let size = 2; size <= MAX_GROUP; size++) {
        const next = pos + size;
        if (next > length || length - next === 1) continue; // a leftover 1 cannot be a group
        const missed = next < length && !starts.has(next) ? 1 : 0;
        const nonThree = compound && size !== 3 ? 1 : 0;
        const [m, n, g] = state.cost;
        const sizes = [...state.sizes, size];
        const min = state.sizes.length ? Math.min(...state.sizes, size) : size;
        const max = Math.max(...sizes);
        const candidate = { cost: [m + missed, n + nonThree, g + 1], sizes };
        const key = `${min},${max}`;
        if (!best.has(next)) best.set(next, new Map());
        const there = best.get(next);
        const current = there.get(key);
        if (!current || better(candidate, current)) there.set(key, candidate);
      }
    }
  }

  let winner = null;
  for (const [key, state] of best.get(length)) {
    const [min, max] = key.split(',').map(Number);
    const full = { cost: [...state.cost, max - min], sizes: state.sizes };
    if (!winner || better(full, winner)) winner = full;
  }
  return winner.sizes;
}

/** Lower cost wins, element by element; equal cost, the larger-first sizes win. */
function better(a, b) {
  for (let i = 0; i < a.cost.length; i++) {
    if (a.cost[i] !== b.cost[i]) return a.cost[i] < b.cost[i];
  }
  for (let i = 0; i < Math.min(a.sizes.length, b.sizes.length); i++) {
    if (a.sizes[i] !== b.sizes[i]) return a.sizes[i] > b.sizes[i];
  }
  return false;
}

/** Group sizes to labels: the group's ordinal on its first pulse, then 2, 3, 4. */
function groupLabels(sizes) {
  return sizes.flatMap((size, g) =>
    Array.from({ length: size }, (_, i) => String(i === 0 ? g + 1 : i + 1))
  );
}

/**
 * The system a Pattern actually renders in — the musician's preference, unless
 * the Pattern contains a mixed-feel Recipe. AC-5.6.2
 */
export function effectiveSystem(pattern, globalSystem) {
  const forced = pattern.measures.some((m) => m.beats.some((b) => isMixedFeel(b.recipe)));
  return forced ? 'numbered' : globalSystem;
}

/** Why the system was overridden, for the UI to explain rather than just do. */
export function isForcedNumbered(pattern) {
  return pattern.measures.some((m) => m.beats.some((b) => isMixedFeel(b.recipe)));
}
