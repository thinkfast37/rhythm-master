/**
 * Subdivision Recipes — the closed menu of ways a Beat can be divided.
 * AC-1.3.1 … AC-1.3.5.
 *
 * A Recipe's Slot count depends on the Beat's note value, not on the Recipe id
 * alone: `straight-16ths` is 4 Slots on a quarter-note Beat and 2 on an
 * eighth-note Beat. Both are genuinely "16th notes" — that is what the name
 * asserts. Nothing outside this module may assume a Slot count from an id.
 */

/**
 * feel is what swing keys off (straight only) and what the grid draws a
 * boundary between inside a mixed Recipe.
 */
const CATALOGUE = {
  quarter: [
    {
      id: 'straight-8ths',
      label: 'Straight 8ths',
      groups: [{ feel: 'straight', slots: 2 }],
    },
    {
      id: 'straight-16ths',
      label: 'Straight 16ths',
      groups: [{ feel: 'straight', slots: 4 }],
    },
    {
      id: 'triplet-8ths',
      label: 'Triplet 8ths',
      groups: [{ feel: 'triplet', slots: 3 }],
    },
    {
      id: 'straight-triplet-split',
      label: 'Straight → Triplet',
      groups: [
        { feel: 'straight', slots: 2 },
        { feel: 'triplet', slots: 3 },
      ],
    },
    {
      id: 'triplet-straight-split',
      label: 'Triplet → Straight',
      groups: [
        { feel: 'triplet', slots: 3 },
        { feel: 'straight', slots: 2 },
      ],
    },
  ],
  eighth: [
    {
      id: 'undivided',
      label: 'Undivided',
      groups: [{ feel: 'straight', slots: 1 }],
    },
    {
      id: 'straight-16ths',
      label: 'Straight 16ths',
      groups: [{ feel: 'straight', slots: 2 }],
    },
  ],
};

/**
 * Menu order, deliberately: for a quarter-note Beat the menu runs coarsest to
 * finest within the straight feel, then triplet, then the two mixed splits last
 * (AC-1.3.4). There is no Undivided Recipe for a quarter-note Beat and no
 * triplet Recipe for an eighth-note Beat.
 */
export function recipesFor(beatNoteValue) {
  const list = CATALOGUE[beatNoteValue];
  if (!list) throw new Error(`Unknown Beat note value: ${beatNoteValue}`);
  return list.map((r) => ({ id: r.id, label: r.label }));
}

function lookup(recipeId, beatNoteValue) {
  const list = CATALOGUE[beatNoteValue];
  if (!list) throw new Error(`Unknown Beat note value: ${beatNoteValue}`);
  const found = list.find((r) => r.id === recipeId);
  if (!found) {
    throw new Error(`Recipe "${recipeId}" is not offered on a ${beatNoteValue}-note Beat`);
  }
  return found;
}

export function isOffered(recipeId, beatNoteValue) {
  return Boolean(CATALOGUE[beatNoteValue]?.some((r) => r.id === recipeId));
}

export function labelFor(recipeId, beatNoteValue) {
  return lookup(recipeId, beatNoteValue).label;
}

/** Total Slots this Recipe produces on a Beat of this note value. */
export function slotCount(recipeId, beatNoteValue) {
  return lookup(recipeId, beatNoteValue).groups.reduce((n, g) => n + g.slots, 0);
}

/**
 * The Recipe's Subdivision Groups, each with its feel and the 0-based Slot
 * indices it spans. Groups are contiguous and in playing order.
 */
export function subdivisionGroups(recipeId, beatNoteValue) {
  let next = 0;
  return lookup(recipeId, beatNoteValue).groups.map((g) => {
    const slotIndices = Array.from({ length: g.slots }, (_, i) => next + i);
    next += g.slots;
    return { feel: g.feel, slotIndices };
  });
}

/**
 * True when a Recipe mixes straight and triplet feel within one Beat. Such
 * Patterns render in Numbered counting regardless of the global preference,
 * because no Takadimi or 1-e-&-a vocabulary exists for half-Beat groups
 * (AC-5.6.2).
 */
export function isMixedFeel(recipeId) {
  for (const list of Object.values(CATALOGUE)) {
    const found = list.find((r) => r.id === recipeId);
    if (found) return new Set(found.groups.map((g) => g.feel)).size > 1;
  }
  throw new Error(`Unknown Recipe: ${recipeId}`);
}

/** Both Beat note values default to Straight 16ths. AC-1.3.1, AC-1.3.2 */
export function defaultRecipeFor(beatNoteValue) {
  if (!CATALOGUE[beatNoteValue]) throw new Error(`Unknown Beat note value: ${beatNoteValue}`);
  return 'straight-16ths';
}
