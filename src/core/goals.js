/**
 * Goals (US-14.1): what the musician came to do. A goal is a screen inside one
 * shared frame (research.md D-018, AC-15.1.20), and names its own controls.
 *
 * Two kinds of goal. **Practise a rhythm** is read-only playback (AC-14.1.5):
 * no workbench, no edits, a goal strip and one settings rail of playback
 * settings. A **making** goal decides which workbench groups its work surface
 * offers and whether Pattern actions and the family members are present —
 * until its own screen lands (D-018 phases 3–7), each rides along with the
 * controls it has today. Lab offers everything, and is the cockpit the app had
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
 * Prev/Next then range over the whole library, so a musician can see how hard
 * things get.
 */
export const ANY_LEVEL = 'any';

export const LAB = 'lab';

/** The one practice goal (AC-14.1.1/2, D-018: "if so not sure if we need four boxes"). */
export const PRACTISE = 'practise';

/** The Composer as a goal (AC-14.1.2/6): until phase 6 draws its screen, it opens the Composer. */
export const PLAY_IT_IN = 'play-in';

/** The playback settings the Practise rail can hold, in the order it shows them (AC-14.1.5/4). */
export const PANEL_ITEMS = ['click', 'tempo', 'counting', 'swing', 'cycle'];

/**
 * The goals screen's groups, in order, as storyboard board 1 draws them
 * (AC-14.1.1/2): one practice goal, the making goals as the stages the app
 * grew in, keeping, and Lab set apart.
 */
export const GOAL_GROUPS = Object.freeze([
  Object.freeze({ id: 'practise', title: 'Hear it and practise it' }),
  Object.freeze({ id: 'make', title: 'Make something', numbered: true }),
  Object.freeze({ id: 'keep', title: 'Keep it' }),
  Object.freeze({ id: LAB, title: 'Everything at once' }),
]);

/**
 * The seven goals, in the order the screen lists them. `practice` marks the
 * one that hands out a rhythm by level (AC-14.1.4) and edits nothing
 * (AC-14.1.5); `panel` is what its strip and rail hold; `tabs` are listed in
 * the order the tab bar shows them, and are empty under Practise, which has no
 * workbench; `composer` marks the goal that opens the Composer (AC-14.1.2/6).
 */
export const GOALS = Object.freeze([
  {
    id: PRACTISE,
    title: 'Practise a rhythm',
    blurb: 'Loop a rhythm at your level. Clap it, count it in syllables, swing it, play along. Nothing to edit.',
    group: 'practise',
    practice: true,
    composer: false,
    panel: PANEL_ITEMS,
    tabs: [],
    actions: false,
    family: false,
  },
  {
    id: 'build',
    title: 'Build a rhythm',
    blurb: 'Measures, meter, subdivision, accents. Build it and save it.',
    group: 'make',
    practice: false,
    composer: false,
    panel: [],
    tabs: ['rhythm', 'practice'],
    actions: true,
    family: false,
  },
  {
    id: 'melodic',
    title: 'Make it melodic',
    blurb: 'Pick a key and scale, and choose the notes the rhythm plays.',
    group: 'make',
    practice: false,
    composer: false,
    panel: [],
    tabs: ['melody', 'practice'],
    actions: true,
    family: false,
  },
  {
    id: 'combine',
    title: 'Combine patterns',
    blurb: 'Rhythm, chord progression, fill pattern. Try combinations, keep what works, arrange it.',
    group: 'make',
    practice: false,
    composer: false,
    panel: [],
    tabs: ['melody', 'practice', 'compose'],
    actions: true,
    family: false,
  },
  {
    id: PLAY_IT_IN,
    title: 'Play it in',
    blurb: 'Guitar or piano on screen. The rhythm loops; you play, it records.',
    group: 'make',
    practice: false,
    composer: true,
    panel: [],
    tabs: ALL_TABS,
    actions: true,
    family: false,
  },
  {
    id: 'share',
    title: 'Share and tidy up',
    blurb: 'Rate, tag, print, export MIDI, submit. Duplicates, families, backup.',
    group: 'keep',
    practice: false,
    composer: false,
    panel: [],
    tabs: ['practice'],
    actions: true,
    family: true,
  },
  {
    id: LAB,
    title: 'Lab',
    blurb: 'Every control on one screen, for experimenting. Remembered: the app opens here next time.',
    group: LAB,
    practice: false,
    composer: false,
    panel: [],
    tabs: ALL_TABS,
    actions: true,
    family: true,
  },
]);

/**
 * The goal ids of 2026-09-20, read as the goals they became (AC-14.1.1/2's
 * note): a remembered goal in `rm.settings.v1` is never lost to a rename.
 */
export const LEGACY_GOALS = Object.freeze({
  play: PRACTISE,
  vocalise: PRACTISE,
  groove: PRACTISE,
  melody: PRACTISE,
  'compose-rhythm': 'build',
  'add-melody': 'melodic',
});

/** A goal by id — a legacy id resolving to its successor — or Lab for an id that is not one: the cockpit is the safe default. */
export function goalById(id) {
  const resolved = LEGACY_GOALS[id] ?? id;
  return GOALS.find((g) => g.id === resolved) ?? GOALS.find((g) => g.id === LAB);
}

/**
 * What the work surface offers under a goal: the tabs in AC-15.1.8's order and
 * whether Pattern actions and the family members are present (AC-14.1.2) —
 * or, under Practise a rhythm, nothing of the workbench and the playback
 * settings in PANEL_ITEMS' order for the strip and the rail (AC-14.1.5).
 */
export function surfaceFor(id) {
  const goal = goalById(id);
  return {
    tabs: ALL_TABS.filter((t) => goal.tabs.includes(t)),
    actions: goal.actions,
    family: goal.family,
    practice: goal.practice,
    readOnly: goal.practice,
    composer: goal.composer,
    panel: PANEL_ITEMS.filter((item) => goal.panel.includes(item)),
    /** The frame's proportion (AC-15.1.20/5): the music's room, or the tools'. */
    layout: goal.practice ? 'playback' : 'design',
  };
}

/** True for Practise a rhythm — the goal the level and Give me one belong to. */
export function isPracticeGoal(id) {
  return goalById(id).practice;
}

/** The Tags Pick from the library filters to under Practise a rhythm (AC-14.1.4/3): the level alone. */
export function libraryTagsFor(id, level) {
  const goal = goalById(id);
  if (!goal.practice) return [];
  return level === ANY_LEVEL ? [] : [level];
}

/** The Patterns Give me one may draw from: at the level, in a Mode when one is asked for, never the one open. */
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
