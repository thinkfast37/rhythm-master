import { describe, it, expect } from 'vitest';
import { workbenchTabFor, WORKBENCH_TABS } from '../../../src/ui/responsive.js';

const percussive = { soundMode: 'percussive', measures: [] };
const melodic = { soundMode: 'melodic', measures: [] };
const withProgression = { soundMode: 'melodic', measures: [], harmony: { chords: [{ degree: 'I' }], change: 'measure' } };

describe('ui/responsive — the tab in force under a goal (US-14.1)', () => {
  it('AC-14.1.2/1 — The tab bar offers exactly the groups the chosen goal names, in the main panel’s fixed order, and the group on screen is the first of them that applies to the Pattern: the tab chosen', () => {
    // Everything offered: the rules AC-15.1.7/3 and /4 already fix.
    const all = WORKBENCH_TABS.map(([t]) => t);
    expect(workbenchTabFor(percussive, null, all)).toBe('rhythm');
    expect(workbenchTabFor(melodic, null, all)).toBe('melody');
    expect(workbenchTabFor(percussive, 'melody', all)).toBe('rhythm');
    expect(workbenchTabFor(melodic, 'compose', all)).toBe('melody');
    expect(workbenchTabFor(withProgression, 'compose', all)).toBe('compose');
    expect(workbenchTabFor(percussive, 'practice', all)).toBe('practice');
    // The default is everything offered, so callers before goals are unchanged.
    expect(workbenchTabFor(melodic, 'rhythm')).toBe('rhythm');

    // A goal that offers Practice alone: Practice, whatever the Mode or the choice.
    expect(workbenchTabFor(percussive, null, ['practice'])).toBe('practice');
    expect(workbenchTabFor(melodic, null, ['practice'])).toBe('practice');
    expect(workbenchTabFor(melodic, 'melody', ['practice'])).toBe('practice');

    // Melody and Practice offered: Melody first on a Melodic Pattern, and the
    // first offered group that applies — Practice — on a Percussive one.
    expect(workbenchTabFor(melodic, null, ['melody', 'practice'])).toBe('melody');
    expect(workbenchTabFor(percussive, null, ['melody', 'practice'])).toBe('practice');
    expect(workbenchTabFor(withProgression, 'practice', ['melody', 'practice'])).toBe('practice');

    // Melody, Practice and Compose: Compose only with a progression.
    expect(workbenchTabFor(withProgression, 'compose', ['melody', 'practice', 'compose'])).toBe('compose');
    expect(workbenchTabFor(melodic, 'compose', ['melody', 'practice', 'compose'])).toBe('melody');

    // Nothing offered applies: no tab, rather than one the goal did not name.
    expect(workbenchTabFor(percussive, null, ['melody'])).toBeNull();
  });
});
