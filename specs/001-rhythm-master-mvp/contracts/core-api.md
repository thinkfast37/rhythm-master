# Contract: `src/core/` — the musical arithmetic API

`core/` is the sole arithmetic authority for the app (Constitution Principle I). Everything here is
a **pure function**: same inputs → same outputs, no side effects, no DOM, no Web Audio, no
`localStorage`, no `Date.now()`, no randomness. An import-boundary lint rule fails the build if any
`core/` module imports from `ui/`, `audio/`, `storage/`, or `export/`.

Types referenced below (`Pattern`, `Measure`, `Beat`, `Slot`, `Pitch`) are defined in
[data-model.md](../data-model.md).

---

## `core/meter.js`

```js
beatCount(timeSignature: string): number
// "7/8" → 7. Always the numerator. Never an implied grouping.  [FR-002, AC-1.2.x]

beatNoteValue(timeSignature: string): "quarter" | "eighth"
// From the denominator alone. Selects which Recipe menu applies.  [AC-1.3.4, AC-1.3.5]

isSupported(timeSignature: string): boolean
// The closed set: 1/4 2/4 3/4 4/4 5/4 6/4 7/4 6/8 7/8 9/8 12/8.  [AC-1.2.1]

beatDurationSeconds(timeSignature: string, bpm: number): number
// Seconds for one Beat of this meter at this tempo.
```

## `core/recipes.js`

```js
recipesFor(beatNoteValue): RecipeId[]
// quarter → 5 ids; eighth → 2 ids. Order is menu order.  [AC-1.3.4, AC-1.3.5]

slotCount(recipeId, beatNoteValue): number
// straight-16ths → 4 on a quarter Beat, 2 on an eighth Beat.

subdivisionGroups(recipeId, beatNoteValue): Array<{
  feel: "straight" | "triplet",
  slotIndices: number[]        // 0-based, contiguous
}>
// One entry per group. The two split Recipes return two groups.  [AC-1.3.4]

isMixedFeel(recipeId): boolean
// True for the two split Recipes. Drives forced Numbered counting.  [AC-5.6.2]

defaultRecipeFor(beatNoteValue): RecipeId
// Both note values default to straight-16ths.  [AC-1.3.1, AC-1.3.2]
```

## `core/accents.js`

```js
metricLevel(index1Based: number, n: number): 1 | 2 | 3
// The shared formula:
//   3 (strong) if i === 1
//   2 (medium) if n even, n > 2, and i === n/2 + 1
//   1 (weak)   otherwise
// Applied at Beat level and again at Slot level.  [AC-3.1.2 … AC-3.1.9]

defaultAccent(measure: Measure, beatIndex: number, slotIndex: number): 1 | 2 | 3
// The published default for a Slot. Pure function of position — never read from
// or written to the Slot.  [FR-003, AC-3.1.10]

effectiveAccent(measure, beatIndex, slotIndex): 0 | 1 | 2 | 3
// 0 if the Slot is off; the stored override if present; otherwise defaultAccent().
// This is what playback and rendering both call. Neither may reimplement it.
```

## `core/swing.js`

```js
swungOffsets(groupSlotCount: 2 | 4, swing: number, slotDuration: number): number[]
// Per-Slot time offsets in seconds for one straight group.
// swing is 0–100; 0 returns all zeros (even subdivision).
// Triplet groups are never passed here — swing does not apply to them.  [AC-4.4.x]
```

## `core/pitch.js`

```js
resolve(pitch: Pitch, key: string): { midiNote: number, frequency: number }
// degree + octaveOffset + key → an absolute pitch. The single place this
// conversion exists; MIDI export and audio playback both call it, so a
// .mid file and the in-app playback can never disagree.  [SC-003, AC-2.2.x]

isSupportedKey(key: string): boolean
// C Db D Eb E F Gb G Ab A Bb B
```

## `core/timeline.js`

```js
buildTimeline(pattern: Pattern): TimelineEvent[]
// Flattens a Pattern into an ordered, absolute-time event list for one loop pass.

// TimelineEvent:
//   { timeSeconds, measureIndex, beatIndex, slotIndex,
//     accent: 1|2|3, pitch: {midiNote, frequency} | null }

loopDurationSeconds(pattern: Pattern): number
```

`buildTimeline` is where meter, Recipe, accent, swing, and pitch all compose. It is the
single boundary between "what the Pattern is" and "when things sound," which is what lets the
scheduler stay dumb and the visual cursor read from the same list as the audio (Principle III).
Times are relative to loop start; the scheduler adds its absolute audio-clock origin.

## `core/pattern.js`

```js
create(): Pattern                        // one 4/4 Measure, default Recipes, all Slots off  [AC-1.1.1]
addMeasure(pattern): Pattern             // inherits previous Measure's Time Signature  [AC-1.1.2]
removeMeasure(pattern, index): Pattern
setTimeSignature(pattern, measureIndex, ts): Pattern   // resets that Measure's Beats  [AC-1.1.6]
setTimeSignatureAll(pattern, ts): Pattern              // the "apply to all" branch  [AC-1.1.5]
setRecipe(pattern, measureIndex, beatIndex, recipeId): Pattern  // clears the Beat  [AC-1.3.6]
cycleAccent(pattern, m, b, s): Pattern   // off → default → next level → … → off  [AC-3.1.x]
setPitch(pattern, m, b, s, pitch): Pattern
append(a: Pattern, b: Pattern): Pattern  // Measure cap enforced  [US-8.1]
duplicate(pattern): Pattern              // doubles length  [US-10.1]
validate(pattern): { valid: boolean, errors: string[] }
```

Every mutator returns a **new** Pattern; none mutates its argument. This is what makes rendering a
pure function of state (FR-013) enforceable rather than aspirational, and it makes undo a matter of
keeping a previous reference.

`setRecipe` and `setTimeSignature` clear content by design. The *confirmation prompt* that guards
them is UI (AC-1.3.7, AC-1.3.8) — `core/` never prompts. Callers ask
`countActiveSlots(pattern, m, b)` first and prompt if it is non-zero.

## `core/counting.js`

```js
labelsFor(recipeId, beatNoteValue, system): string[]
// system: "takadimi" | "one-e-and-a" | "numbered"
// Per-Slot labels for one Beat.  [US-5.6]

effectiveSystem(pattern, globalSystem): CountingSystem
// Returns "numbered" if the Pattern contains a mixed-feel Recipe, regardless of
// globalSystem — and without mutating the stored preference.  [AC-5.6.2, AC-5.6.3]
```

## `core/similarity.js`

```js
rhythmFingerprint(pattern): string
// Stable hash over meter + Recipes + Slot on/off + accents. Ignores name, tags,
// rating, tempo, soundMode, and pitch.

isDuplicate(a, b): boolean          // identical in every musical aspect  [US-11.1]
isSameFamily(a, b): boolean         // identical rhythm, differing Sound Mode or Pitch  [US-11.2]
```

---

## Testing contract

Every function above is covered by Vitest tests named `AC-x.y.z — <description>`, and
`tests/ac-coverage.js` fails CI if any AC ID in `spec.md` has no matching test name. Exhaustive
coverage is a hard gate specifically for: every supported Time Signature, every Recipe on both Beat
note values, the accent table at both levels, swing at 0 and 100, and pitch resolution across the
full octave range in all 12 Keys (Constitution Principle I).
