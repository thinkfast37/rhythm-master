/**
 * Goals (US-14.1): what the musician came to do, and which of the workbench's
 * groups that job is for.
 *
 * One rule, not a matrix. A goal decides which groups the tab bar offers and
 * whether Pattern actions and the family members are present; it never hides a
 * control inside a group. Lab offers everything, and is the cockpit the app had
 * before goals existed (AC-14.1.3/1).
 *
 * Pure: the catalogue, the surface a goal id resolves to, and the draw that
 * hands out a shipped Pattern at a level. Randomness is a parameter — `core/`
 * never reaches for Math.random (Principle I) — so the draw is provable
 * (AC-14.1.4/4).
 */

/** The workbench tabs, in the order AC-15.1.8 fixes. */
export const ALL_TABS = ['melody', 'rhythm', 'practice', 'compose'];

/** The library's own level Tags, easiest first (AC-14.1.4/1). */
export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

/**
 * The level setting that means every level (AC-14.1.4/5): the dice and
 * Prev/Next then range over the whole library in the goal's Mode, so a
 * musician can see how hard things get.
 */
export const ANY_LEVEL = 'any';

export const LAB = 'lab';

/**
 * The seven goals, then Lab. `practice` marks the four that hand out a rhythm
 * by level (AC-14.1.4); `soundMode` is the Mode a practice goal draws from,
 * or null for either. `tabs` are listed in the order the tab bar shows them.
 */
export const GOALS = Object.freeze([
  {
    id: 'play',
    title: 'Play a rhythm',
    blurb: 'Pick one at your level, loop it, set the tempo, count yourself in.',
    group: 'practise',
    practice: true,
    soundMode: null,
    tabs: ['practice'],
    actions: false,
    family: false,
  },
  {
    id: 'vocalise',
    title: 'Vocalise or clap it',
    blurb: 'Count it out loud in syllables, or clap it, over a percussive sound.',
    group: 'practise',
    practice: true,
    soundMode: 'percussive',
    tabs: ['practice'],
    actions: false,
    family: false,
  },
  {
    id: 'groove',
    title: 'Feel the groove',
    blurb: 'Swing it, shape its accents, and cycle through fills while it plays.',
    group: 'practise',
    practice: true,
    soundMode: null,
    tabs: ['melody', 'practice'],
    actions: false,
    family: false,
  },
  {
    id: 'melody',
    title: 'Play melodies over it',
    blurb: 'Choose a scale and a chord progression, place it in a register, and play along.',
    group: 'practise',
    practice: true,
    soundMode: 'melodic',
    tabs: ['melody', 'practice'],
    actions: false,
    family: false,
  },
  {
    id: 'compose-rhythm',
    title: 'Compose a rhythm',
    blurb: 'Build Measures and Beats, choose subdivisions, set accents, and save it.',
    group: 'compose',
    practice: false,
    soundMode: null,
    tabs: ['rhythm', 'practice'],
    actions: true,
    family: false,
  },
  {
    id: 'add-melody',
    title: 'Add a melody to it',
    blurb: 'Stamp pitches by hand, keep the fills you like, and build them into a Section.',
    group: 'compose',
    practice: false,
    soundMode: null,
    tabs: ['melody', 'practice', 'compose'],
    actions: true,
    family: false,
  },
  {
    id: 'share',
    title: 'Keep and share',
    blurb: 'Rate, copy, find duplicates and Families, export MIDI, print sheet music, submit.',
    group: 'compose',
    practice: false,
    soundMode: null,
    tabs: ['practice'],
    actions: true,
    family: true,
  },
  {
    id: LAB,
    title: 'Lab',
    blurb: 'Every control at once, for experimenting. Remembered: the app opens here next time.',
    group: LAB,
    practice: false,
    soundMode: null,
    tabs: ALL_TABS,
    actions: true,
    family: true,
  },
]);

/** A goal by id, or Lab for an id that is not one — the cockpit is the safe default. */
export function goalById(id) {
  return GOALS.find((g) => g.id === id) ?? GOALS.find((g) => g.id === LAB);
}

/**
 * What the main panel offers under a goal: the tabs in AC-15.1.8's order,
 * and whether Pattern actions and the family members are present (AC-14.1.2).
 */
export function surfaceFor(id) {
  const goal = goalById(id);
  return {
    tabs: ALL_TABS.filter((t) => goal.tabs.includes(t)),
    actions: goal.actions,
    family: goal.family,
    practice: goal.practice,
    soundMode: goal.soundMode,
  };
}

/** True for the four practice goals — the ones the level and Give me one belong to. */
export function isPracticeGoal(id) {
  return goalById(id).practice;
}

/** The Tags Pick from the library filters to under a practice goal (AC-14.1.4/3). */
export function libraryTagsFor(id, level) {
  const goal = goalById(id);
  if (!goal.practice) return [];
  const tags = level === ANY_LEVEL ? [] : [level];
  return goal.soundMode ? [...tags, goal.soundMode] : tags;
}

/** The Patterns Give me one may draw from: at the level, in the goal's Mode, never the one open. */
export function candidatesAtLevel(patterns, { level, soundMode = null, excludeId = null } = {}) {
  return patterns.filter(
    (p) =>
      (level === ANY_LEVEL || (p.tags ?? []).includes(level)) &&
      (soundMode === null || p.soundMode === soundMode) &&
      p.id !== excludeId
  );
}

/**
 * One shipped Pattern at the level (AC-14.1.4/2, /4). `random` is a number in
 * [0, 1): the caller's draw, so that every position reaches a different
 * candidate and the draw itself is testable. Null when the level has no other.
 */
export function pickAtLevel(patterns, { level, soundMode = null, excludeId = null, random = 0 } = {}) {
  const pool = candidatesAtLevel(patterns, { level, soundMode, excludeId });
  if (pool.length === 0) return null;
  const r = Number.isFinite(random) ? Math.min(Math.max(random, 0), 1 - Number.EPSILON) : 0;
  return pool[Math.floor(r * pool.length)];
}
