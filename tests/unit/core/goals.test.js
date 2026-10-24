import { describe, it, expect } from 'vitest';
import {
  GOALS,
  GOAL_GROUPS,
  LEGACY_GOALS,
  LEVELS,
  ANY_LEVEL,
  LAB,
  PRACTISE,
  PLAY_IT_IN,
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

const MAKING = ['build', 'melodic', 'combine', PLAY_IT_IN, 'share'];

describe('core/goals — the catalogue (US-14.1)', () => {
  it('AC-14.1.1/2 — The screen names every goal with a one-line description, in four groups: Hear it and practise it holds Practise a rhythm; Make something holds Build a rhythm, Make it melodic, Combine patterns and Play it in, numbered as stages; Keep it holds Share and tidy up; Everything at once holds Lab: the catalogue itself', () => {
    expect(GOAL_GROUPS.map((g) => g.id)).toEqual(['practise', 'make', 'keep', LAB]);
    expect(GOAL_GROUPS.map((g) => g.title)).toEqual(['Hear it and practise it', 'Make something', 'Keep it', 'Everything at once']);
    expect(GOAL_GROUPS.filter((g) => g.numbered).map((g) => g.id)).toEqual(['make']);
    expect(GOALS.map((g) => [g.id, g.group])).toEqual([
      [PRACTISE, 'practise'],
      ['build', 'make'],
      ['melodic', 'make'],
      ['combine', 'make'],
      [PLAY_IT_IN, 'make'],
      ['share', 'keep'],
      [LAB, LAB],
    ]);
    expect(GOALS.map((g) => g.title)).toEqual([
      'Practise a rhythm',
      'Build a rhythm',
      'Make it melodic',
      'Combine patterns',
      'Play it in',
      'Share and tidy up',
      'Lab',
    ]);
    for (const g of GOALS) {
      expect(g.blurb.length).toBeGreaterThan(20);
      expect(g.blurb).not.toContain('\n');
    }
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    // Every goal's group is one the screen draws.
    for (const g of GOALS) expect(GOAL_GROUPS.some((grp) => grp.id === g.group)).toBe(true);

    // A goal remembered under one of the 2026-09-20 ids is the goal it became.
    expect(LEGACY_GOALS).toEqual({
      play: PRACTISE,
      vocalise: PRACTISE,
      groove: PRACTISE,
      melody: PRACTISE,
      'compose-rhythm': 'build',
      'add-melody': 'melodic',
    });
    for (const [old, now] of Object.entries(LEGACY_GOALS)) expect(goalById(old).id).toBe(now);
    expect(goalById(LAB).title).toBe('Lab');
  });

  it('AC-14.1.2/2 — Practise a rhythm offers no workbench group: the tab bar is absent, and its settings rail stands in the work surface’s place: the surface', () => {
    expect(isPracticeGoal(PRACTISE)).toBe(true);
    const surface = surfaceFor(PRACTISE);
    expect(surface.practice).toBe(true);
    expect(surface.readOnly).toBe(true);
    expect(surface.tabs).toEqual([]);
    expect(surface.panel.length).toBeGreaterThan(0);
    expect(surface.composer).toBe(false);
    // The one practice goal: nothing else in the catalogue is one.
    expect(GOALS.filter((g) => g.practice).map((g) => g.id)).toEqual([PRACTISE]);
    for (const old of ['play', 'vocalise', 'groove', 'melody']) expect(isPracticeGoal(old)).toBe(true);
  });

  it('AC-14.1.2/3 — Build a rhythm offers Rhythm and Practice with Pattern actions and the grid’s accent brush; Make it melodic offers Melody and Practice with Pattern actions; Combine patterns offers Melody, Practice and Compose with Pattern actions; Share and tidy up offers Practice with Pattern actions and the family members: the surfaces', () => {
    expect(surfaceFor('build')).toMatchObject({ tabs: ['rhythm', 'practice'], actions: true, family: false });
    expect(surfaceFor('melodic')).toMatchObject({ tabs: ['melody', 'practice'], actions: true, family: false });
    expect(surfaceFor('combine')).toMatchObject({ tabs: ['melody', 'practice', 'compose'], actions: true, family: false });
    expect(surfaceFor('share')).toMatchObject({ tabs: ['practice'], actions: true, family: true });
    for (const id of MAKING) {
      expect(isPracticeGoal(id)).toBe(false);
      expect(surfaceFor(id).readOnly).toBe(false);
      expect(surfaceFor(id).panel).toEqual([]);
      expect(surfaceFor(id).layout).toBe('design');
    }
    // The renamed goals keep what they offered under their old names.
    expect(surfaceFor('compose-rhythm')).toEqual(surfaceFor('build'));
    expect(surfaceFor('add-melody')).toEqual(surfaceFor('melodic'));
  });

  it('AC-14.1.2/4 — Pattern actions and the family members are absent under Practise a rhythm: the surface', () => {
    expect(surfaceFor(PRACTISE).actions).toBe(false);
    expect(surfaceFor(PRACTISE).family).toBe(false);
  });

  it('AC-14.1.2/6 — Choosing Play it in opens the Composer in the work surface, with the Practice | Composer switch in its goal strip to step out of it; on its Practice side it offers what Lab offers, until its own screen lands: the surface', () => {
    expect(surfaceFor(PLAY_IT_IN).composer).toBe(true);
    expect(surfaceFor(PLAY_IT_IN)).toMatchObject({ tabs: ALL_TABS, actions: true, readOnly: false, practice: false });
    // The one goal that opens the Composer.
    expect(GOALS.filter((g) => g.composer).map((g) => g.id)).toEqual([PLAY_IT_IN]);
  });

  it('AC-14.1.3/1 — Lab offers every workbench group, Pattern actions and the family members, exactly as the tabbed workbench and the main panel’s fixed order already describe: the surface', () => {
    expect(surfaceFor(LAB)).toMatchObject({ tabs: ALL_TABS, actions: true, family: true, practice: false, readOnly: false, composer: false, panel: [], layout: 'design' });
    // An id that is no goal — nothing chosen yet, or a stale store — is Lab, the cockpit.
    expect(surfaceFor(null)).toEqual(surfaceFor(LAB));
    expect(surfaceFor('no-such-goal')).toEqual(surfaceFor(LAB));
    expect(isPracticeGoal(LAB)).toBe(false);
  });

  it('AC-14.1.4/3 — Pick from the library opens the library filtered to the level’s Tag alone, and the filter can be changed or cleared as any other, the Mode Tags among them: the Tags', () => {
    expect(libraryTagsFor(PRACTISE, 'Beginner')).toEqual(['Beginner']);
    expect(libraryTagsFor(PRACTISE, 'Advanced')).toEqual(['Advanced']);
    // No Mode of its own: never a Mode Tag.
    for (const level of LEVELS) expect(libraryTagsFor(PRACTISE, level)).toEqual([level]);
    // Not the practice goal: nothing to filter to.
    for (const id of [...MAKING, LAB]) expect(libraryTagsFor(id, 'Beginner')).toEqual([]);
  });

  it('AC-14.1.4/5 — Under Any level the dice draws from every shipped Pattern, whatever its level or Mode, and Pick from the library filters to nothing: the Tags and the draw', () => {
    expect(ANY_LEVEL).toBe('any');
    expect(libraryTagsFor(PRACTISE, ANY_LEVEL)).toEqual([]);

    // Every level and both Modes reached, the open one never.
    const reached = new Set();
    for (let i = 0; i < 100; i++) reached.add(pickAtLevel(LIBRARY, { level: ANY_LEVEL, excludeId: 's_0', random: i / 100 }).id);
    expect([...reached].sort()).toEqual(['s_1', 's_2', 's_3', 's_4', 's_5']);
    expect(candidatesAtLevel(LIBRARY, { level: ANY_LEVEL }).map((x) => x.id)).toEqual(['s_0', 's_1', 's_2', 's_3', 's_4', 's_5']);
    expect(pickAtLevel([p('only', 'Advanced')], { level: ANY_LEVEL, excludeId: 'only' })).toBeNull();
  });

  it('AC-15.1.20/5 — The panel is marked with the layout in force: Playback under Practise a rhythm, where on a wide panel the band takes at least the height the rail does and the rail is capped; Design under every other goal, where on a wide panel the band is capped and the work surface takes the rest: the layout each goal names', () => {
    expect(surfaceFor(PRACTISE).layout).toBe('playback');
    for (const g of GOALS.filter((x) => x.id !== PRACTISE)) expect(surfaceFor(g.id).layout).toBe('design');
  });
});

describe('core/goals — the settings rail (AC-14.1.5)', () => {
  it('AC-14.1.5/4 — The strip holds Click and Count-in; the rail holds Tempo, Counting and Swing, and on a Melodic rhythm with a chord progression Cycle fills, Cycle progressions and Repeats, without Keep: the items', () => {
    expect(PANEL_ITEMS).toEqual(['click', 'tempo', 'counting', 'swing', 'cycle']);
    // Every setting the four panels of 2026-09-20 held between them, in one list.
    expect(surfaceFor(PRACTISE).panel).toEqual(['click', 'tempo', 'counting', 'swing', 'cycle']);
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
      expect(pick.tags).toContain('Beginner');
      expect(pick.id).not.toBe('s_0');
      reached.add(pick.id);
    }
    expect([...reached].sort()).toEqual(['s_1', 's_2']);
    // Both Modes are in the draw: a Melodic Beginner is reached as readily as a Percussive one.
    expect(candidatesAtLevel(LIBRARY, { level: 'Beginner', excludeId: 's_0' }).map((x) => x.soundMode).sort()).toEqual(['melodic', 'percussive']);

    // A Mode narrows it when one is asked for, and the open Pattern is never drawn.
    expect(candidatesAtLevel(LIBRARY, { level: 'Beginner', soundMode: 'melodic' }).map((x) => x.id)).toEqual(['s_1']);
    expect(pickAtLevel(LIBRARY, { level: 'Beginner', soundMode: 'melodic', excludeId: 's_1' })).toBeNull();
    expect(pickAtLevel(LIBRARY, { level: 'Intermediate', excludeId: 's_3' })).toBeNull();
    expect(pickAtLevel([], { level: 'Beginner' })).toBeNull();

    // The draw is clamped, never thrown off by a bad number.
    expect(pickAtLevel(LIBRARY, { level: 'Advanced', random: 1 }).tags).toContain('Advanced');
    expect(pickAtLevel(LIBRARY, { level: 'Advanced', random: -1 }).tags).toContain('Advanced');
    expect(pickAtLevel(LIBRARY, { level: 'Advanced', random: NaN }).tags).toContain('Advanced');
  });
});
