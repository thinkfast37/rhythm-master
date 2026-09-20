import { describe, it, expect } from 'vitest';
import {
  GOALS,
  LEVELS,
  ANY_LEVEL,
  LAB,
  ALL_TABS,
  PANEL_ITEMS,
  goalById,
  surfaceFor,
  isPracticeGoal,
  libraryTagsFor,
  candidatesAtLevel,
  pickAtLevel,
} from '../../../src/core/goals.js';

/** A shipped-shaped Pattern: id, Mode and Tags are all the picker reads. */
const p = (id, level, soundMode = 'percussive', extra = []) => ({ id, soundMode, tags: [level, ...extra] });

const LIBRARY = [
  p('s_0', 'Beginner'),
  p('s_1', 'Beginner', 'melodic'),
  p('s_2', 'Beginner'),
  p('s_3', 'Intermediate'),
  p('s_4', 'Advanced', 'melodic'),
  p('s_5', 'Advanced'),
];

describe('core/goals — the catalogue (US-14.1)', () => {
  it('AC-14.1.1/2 — The screen names every goal with a one-line description: the four practice goals first, then the three compose goals, then Lab set apart: the catalogue itself', () => {
    expect(GOALS.map((g) => g.group)).toEqual([
      'practise', 'practise', 'practise', 'practise',
      'compose', 'compose', 'compose',
      LAB,
    ]);
    for (const g of GOALS) {
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.blurb.length).toBeGreaterThan(0);
      expect(g.blurb).not.toContain('\n');
    }
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    expect(goalById(LAB).title).toBe('Lab');
  });

  it('AC-14.1.2/2 — The four practice goals offer no workbench group: the tab bar is absent, and one practice panel stands in its place: the surfaces', () => {
    for (const id of ['play', 'vocalise', 'groove', 'melody']) {
      expect(isPracticeGoal(id)).toBe(true);
      expect(surfaceFor(id).practice).toBe(true);
      expect(surfaceFor(id).readOnly).toBe(true);
      expect(surfaceFor(id).tabs).toEqual([]);
      expect(surfaceFor(id).panel.length).toBeGreaterThan(0);
    }
    expect(surfaceFor('vocalise').soundMode).toBe('percussive');
    expect(surfaceFor('melody').soundMode).toBe('melodic');
    expect(surfaceFor('play').soundMode).toBeNull();
    expect(surfaceFor('groove').soundMode).toBeNull();
  });

  it('AC-14.1.2/3 — Compose a rhythm offers Rhythm and Practice with Pattern actions and the grid’s accent brush; Add a melody to it offers Melody, Practice and Compose with Pattern actions; Keep and share offers Practice with Pattern actions and the family members: the surfaces', () => {
    expect(surfaceFor('compose-rhythm')).toMatchObject({ tabs: ['rhythm', 'practice'], actions: true, family: false });
    expect(surfaceFor('add-melody')).toMatchObject({ tabs: ['melody', 'practice', 'compose'], actions: true, family: false });
    expect(surfaceFor('share')).toMatchObject({ tabs: ['practice'], actions: true, family: true });
    for (const id of ['compose-rhythm', 'add-melody', 'share']) {
      expect(isPracticeGoal(id)).toBe(false);
      expect(surfaceFor(id).readOnly).toBe(false);
      expect(surfaceFor(id).panel).toEqual([]);
    }
  });

  it('AC-14.1.2/4 — Pattern actions and the family members are absent under the four practice goals: the surfaces', () => {
    for (const id of ['play', 'vocalise', 'groove', 'melody']) {
      expect(surfaceFor(id).actions).toBe(false);
      expect(surfaceFor(id).family).toBe(false);
    }
  });

  it('AC-14.1.3/1 — Lab offers every workbench group, Pattern actions and the family members, exactly as the tabbed workbench and the main panel’s fixed order already describe: the surface', () => {
    expect(surfaceFor(LAB)).toMatchObject({ tabs: ALL_TABS, actions: true, family: true, practice: false, readOnly: false, panel: [], soundMode: null });
    // An id that is no goal — nothing chosen yet, or a stale store — is Lab, the cockpit.
    expect(surfaceFor(null)).toEqual(surfaceFor(LAB));
    expect(surfaceFor('no-such-goal')).toEqual(surfaceFor(LAB));
    expect(isPracticeGoal(LAB)).toBe(false);
  });

  it('AC-14.1.4/3 — Pick from the library opens the library filtered to the level’s Tag, with the Mode Tag added under the two goals that have one, and the filter can be changed or cleared as any other: the Tags', () => {
    expect(libraryTagsFor('play', 'Beginner')).toEqual(['Beginner']);
    expect(libraryTagsFor('groove', 'Advanced')).toEqual(['Advanced']);
    expect(libraryTagsFor('vocalise', 'Intermediate')).toEqual(['Intermediate', 'percussive']);
    expect(libraryTagsFor('melody', 'Beginner')).toEqual(['Beginner', 'melodic']);
    // Not a practice goal: nothing to filter to.
    expect(libraryTagsFor('compose-rhythm', 'Beginner')).toEqual([]);
    expect(libraryTagsFor(LAB, 'Beginner')).toEqual([]);
  });

  it('AC-14.1.4/5 — Under Any level the dice draws from every shipped Pattern in the goal’s Mode, whatever its level, and Pick from the library filters to the Mode Tag alone, or to nothing under a goal without one: the Tags and the draw', () => {
    expect(ANY_LEVEL).toBe('any');
    expect(libraryTagsFor('play', ANY_LEVEL)).toEqual([]);
    expect(libraryTagsFor('groove', ANY_LEVEL)).toEqual([]);
    expect(libraryTagsFor('vocalise', ANY_LEVEL)).toEqual(['percussive']);
    expect(libraryTagsFor('melody', ANY_LEVEL)).toEqual(['melodic']);

    // Every level reached, the open one never, the Mode still honoured.
    const reached = new Set();
    for (let i = 0; i < 100; i++) reached.add(pickAtLevel(LIBRARY, { level: ANY_LEVEL, excludeId: 's_0', random: i / 100 }).id);
    expect([...reached].sort()).toEqual(['s_1', 's_2', 's_3', 's_4', 's_5']);
    expect(candidatesAtLevel(LIBRARY, { level: ANY_LEVEL, soundMode: 'melodic' }).map((x) => x.id)).toEqual(['s_1', 's_4']);
    expect(pickAtLevel([p('only', 'Advanced')], { level: ANY_LEVEL, excludeId: 'only' })).toBeNull();
  });
});

describe('core/goals — the practice panels (AC-14.1.5)', () => {
  it('AC-14.1.5/4 — Play a rhythm’s panel holds Click and Count-in and Tempo; Vocalise or clap it adds Counting; Feel the groove adds Swing; Play melodies over it adds Cycle fills, Cycle progressions and Repeats, without Keep: the panels', () => {
    expect(PANEL_ITEMS).toEqual(['click', 'tempo', 'counting', 'swing', 'cycle']);
    expect(surfaceFor('play').panel).toEqual(['click', 'tempo']);
    expect(surfaceFor('vocalise').panel).toEqual(['click', 'tempo', 'counting']);
    expect(surfaceFor('groove').panel).toEqual(['click', 'tempo', 'swing']);
    expect(surfaceFor('melody').panel).toEqual(['click', 'tempo', 'cycle']);
    // Always in PANEL_ITEMS' order, whatever order a goal lists its items in.
    for (const g of GOALS) {
      const order = surfaceFor(g.id).panel.map((i) => PANEL_ITEMS.indexOf(i));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });
});

describe('core/goals — Give me one (AC-14.1.4)', () => {
  it('AC-14.1.4/4 — Give me one draws from the whole level: fed every position in turn it reaches every shipped Pattern at that level and never the one open, and yields nothing when the level has no other', () => {
    expect(LEVELS).toEqual(['Beginner', 'Intermediate', 'Advanced']);

    // Every position in [0, 1) lands on a candidate; walked finely, all of them.
    const reached = new Set();
    for (let i = 0; i < 100; i++) {
      const pick = pickAtLevel(LIBRARY, { level: 'Beginner', excludeId: 's_0', random: i / 100 });
      expect(pick).not.toBeNull();
      expect(pick.id).not.toBe('s_0');
      expect(pick.tags).toContain('Beginner');
      reached.add(pick.id);
    }
    expect([...reached].sort()).toEqual(['s_1', 's_2']);

    // The Mode narrows the pool to the goal's own.
    expect(candidatesAtLevel(LIBRARY, { level: 'Beginner', soundMode: 'melodic' }).map((x) => x.id)).toEqual(['s_1']);
    expect(pickAtLevel(LIBRARY, { level: 'Advanced', soundMode: 'percussive', random: 0.99 }).id).toBe('s_5');

    // The edges of the draw stay inside the pool.
    expect(pickAtLevel(LIBRARY, { level: 'Beginner', random: 0 }).id).toBe('s_0');
    expect(pickAtLevel(LIBRARY, { level: 'Beginner', random: 1 }).id).toBe('s_2');
    expect(pickAtLevel(LIBRARY, { level: 'Beginner', random: Number.NaN }).id).toBe('s_0');

    // Nothing when the level has no other: the one open is the only one.
    expect(pickAtLevel(LIBRARY, { level: 'Intermediate', excludeId: 's_3', random: 0.5 })).toBeNull();
    expect(pickAtLevel(LIBRARY, { level: 'Intermediate', soundMode: 'melodic', random: 0.5 })).toBeNull();
    expect(pickAtLevel([], { level: 'Beginner' })).toBeNull();
  });
});
