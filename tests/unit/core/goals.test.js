import { describe, it, expect } from 'vitest';
import {
  GOALS,
  LEVELS,
  LAB,
  ALL_TABS,
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

  it('AC-14.1.2/2 — Play a rhythm and Vocalise or clap it offer Practice alone; Feel the groove offers Practice and Melody; Play melodies over it offers Melody and Practice: the surfaces', () => {
    expect(surfaceFor('play').tabs).toEqual(['practice']);
    expect(surfaceFor('vocalise').tabs).toEqual(['practice']);
    // In AC-15.1.8's order, whatever order the goal lists them in.
    expect(surfaceFor('groove').tabs).toEqual(['melody', 'practice']);
    expect(surfaceFor('melody').tabs).toEqual(['melody', 'practice']);
    for (const id of ['play', 'vocalise', 'groove', 'melody']) {
      expect(isPracticeGoal(id)).toBe(true);
      expect(surfaceFor(id).practice).toBe(true);
    }
    expect(surfaceFor('vocalise').soundMode).toBe('percussive');
    expect(surfaceFor('melody').soundMode).toBe('melodic');
    expect(surfaceFor('play').soundMode).toBeNull();
    expect(surfaceFor('groove').soundMode).toBeNull();
  });

  it('AC-14.1.2/3 — Compose a rhythm offers Rhythm and Practice with Pattern actions; Add a melody to it offers Melody, Practice and Compose with Pattern actions; Keep and share offers Practice with Pattern actions and the family members: the surfaces', () => {
    expect(surfaceFor('compose-rhythm')).toMatchObject({ tabs: ['rhythm', 'practice'], actions: true, family: false });
    expect(surfaceFor('add-melody')).toMatchObject({ tabs: ['melody', 'practice', 'compose'], actions: true, family: false });
    expect(surfaceFor('share')).toMatchObject({ tabs: ['practice'], actions: true, family: true });
    for (const id of ['compose-rhythm', 'add-melody', 'share']) expect(isPracticeGoal(id)).toBe(false);
  });

  it('AC-14.1.2/4 — Pattern actions and the family members are absent under the four practice goals: the surfaces', () => {
    for (const id of ['play', 'vocalise', 'groove', 'melody']) {
      expect(surfaceFor(id).actions).toBe(false);
      expect(surfaceFor(id).family).toBe(false);
    }
  });

  it('AC-14.1.3/1 — Lab offers every workbench group, Pattern actions and the family members, exactly as the tabbed workbench and the main panel’s fixed order already describe: the surface', () => {
    expect(surfaceFor(LAB)).toMatchObject({ tabs: ALL_TABS, actions: true, family: true, practice: false, soundMode: null });
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
