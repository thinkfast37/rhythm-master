---
description: "Task list for Rhythm Master MVP"
---

# Tasks: Rhythm Master MVP

**Input**: Design documents from `/specs/001-rhythm-master-mvp/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: REQUIRED, not optional. Constitution Principle IV and FR-014 require at least one
automated test per Acceptance Criterion, named for the AC ID it proves. Test tasks are therefore
first-class here, not an add-on.

**Scope**: All 34 User Stories. There is no MVP subset — the maintainer's instruction was to build
all of it. Phases are ordered by dependency, not by priority; every story is P1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: The spec's own User Story ID (e.g. `[US1.3]`), not a renumbering. Keeping the spec's
  IDs is what makes the traceability chain in Principle IV work end to end.
- Every task names the exact file(s) it touches

## Path Conventions

Single project at repository root: `src/`, `tests/`, `data/`, per plan.md's Project Structure.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: A running dev server, a test runner, and the guardrails that make the constitution
enforceable rather than aspirational.

- [X] T001 Create the directory skeleton from plan.md's Project Structure in `src/core/`, `src/audio/`, `src/ui/`, `src/storage/`, `src/export/`, `src/styles/`, `tests/unit/`, `tests/e2e/`
- [X] T002 Initialize npm project and Vite in `package.json` and `vite.config.js`, with `dev`, `build`, and `preview` scripts and `base` set for GitHub Pages
- [X] T003 Create the app shell in `index.html` and `src/main.js` — an empty composition root that imports nothing yet
- [X] T004 [P] Add Vitest in `vitest.config.js` with the `test` script, and a smoke test in `tests/unit/smoke.test.js`
- [X] T005 [P] Add Playwright in `playwright.config.js` with the `test:e2e` script, pointing at the pre-installed Chromium via `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`
- [X] T006 [P] Configure ESLint and Prettier in `eslint.config.js` and `.prettierrc`
- [X] T007 Add the `core/` purity lint rule to `eslint.config.js` — an import-boundary restriction failing the build if any `src/core/**` module imports from `ui/`, `audio/`, `storage/`, or `export/`, or references `window`, `document`, `localStorage`, or `Date.now` (Constitution Principle I)
- [X] T008 Implement the per-AC coverage reporter in `tests/ac-coverage.js` — parse AC IDs from `spec.md`, parse test names from both suites, report every AC with no matching test, exit non-zero on any gap; wire as the `coverage:ac` script (FR-014)
- [X] T009 [P] Implement the seed validator in `tools/validate-seed.js` per data-model §7, wired as the `validate:seed` script
- [X] T010 [P] Implement the CVD palette check in `tools/check-cvd.js` — render the accent palette under simulated deuteranopia, protanopia and tritanopia and assert a minimum perceptual distance between off/Weak/Medium/Strong; wire as the `check:cvd` script (FR-012, D-005)
- [X] T011 Create the deploy workflow in `.github/workflows/deploy.yml` — test → e2e → coverage:ac → validate:seed → build → publish to Pages, with a failing step blocking the deploy (D-008)

**Checkpoint**: `npm run dev` serves a blank page; `npm test` and `npm run test:e2e` run; `npm run coverage:ac` reports 206 uncovered ACs.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure musical core and the persistence layer. Every user story depends on these.
Nothing in this phase renders anything.

**⚠️ No user story can start until this phase is complete.**

### The pure core

- [X] T012 [P] Implement `src/core/meter.js` — `beatCount`, `beatNoteValue`, `isSupported`, `beatDurationSeconds` over the closed Time Signature set, per contracts/core-api.md
- [X] T013 [P] Implement `src/core/recipes.js` — the closed Recipe catalogue, `recipesFor`, `slotCount`, `subdivisionGroups`, `isMixedFeel`, `defaultRecipeFor`, resolving Slot count from `(recipe, beatNoteValue)` so `straight-16ths` yields 4 on a quarter Beat and 2 on an eighth
- [X] T014 [P] Implement `src/core/accents.js` — `metricLevel`, `defaultAccent`, `effectiveAccent`, computing defaults from position and never storing them (FR-003)
- [X] T015 [P] Implement `src/core/pitch.js` — `resolve(pitch, key)` returning `{midiNote, frequency}`, and `isSupportedKey` over the 12 keys
- [X] T016 [P] Implement `src/core/swing.js` — `swungOffsets(groupSlotCount, swing, slotDuration)`, straight groups only
- [X] T017 Implement `src/core/pattern.js` — construction and immutable mutators (`create`, `addMeasure`, `removeMeasure`, `setTimeSignature`, `setTimeSignatureAll`, `setRecipe`, `cycleAccent`, `setPitch`, `append`, `duplicate`, `countActiveSlots`, `validate`), every mutator returning a new Pattern
- [X] T018 Implement `src/core/timeline.js` — `buildTimeline(pattern)` composing meter, Recipe, accent, swing and pitch into one ordered absolute-time event list, plus `loopDurationSeconds`

### Core tests

- [X] T019 [P] Unit tests for meter in `tests/unit/core/meter.test.js` — every supported Time Signature, asserting beat count equals numerator with no implied grouping (AC-1.2.1–AC-1.2.4)
- [X] T020 [P] Unit tests for recipes in `tests/unit/core/recipes.test.js` — both menus, Slot counts and Subdivision Groups for every Recipe on both Beat note values (AC-1.3.1, AC-1.3.2, AC-1.3.4, AC-1.3.5)
- [X] T021 [P] Unit tests for accents in `tests/unit/core/accents.test.js` — the full Beat-level and Slot-level tables, including that 3-Slot, 5-Slot and 2-Slot Recipes never produce Medium (AC-3.1.1–AC-3.1.15)
- [X] T022 [P] Unit tests for pitch in `tests/unit/core/pitch.test.js` — every degree across the full octave range in all 12 keys
- [X] T023 [P] Unit tests for swing in `tests/unit/core/swing.test.js` — boundary values 0 and 100 on 2-Slot and 4-Slot groups
- [X] T024 [P] Unit tests for pattern mutators in `tests/unit/core/pattern.test.js` — including that no mutator mutates its argument, and validation rules from data-model §7
- [X] T025 [P] Unit tests for timeline in `tests/unit/core/timeline.test.js` — event ordering and absolute times across a mixed-meter, mixed-Recipe Pattern

### Persistence and app state

- [X] T026 [P] Implement `src/storage/patterns.js` over the `rm.patterns.v1` key, per data-model §6
- [X] T027 [P] Implement `src/storage/localMeta.js` over `rm.localMeta.v1`, exposing no path that merges into a Pattern (FR-006)
- [X] T028 [P] Implement `src/storage/settings.js` over `rm.settings.v1`
- [X] T029 Implement `src/storage/migrate.js` — ordered upgrade functions applied on read, upgrading rather than discarding, and refusing to downgrade a store newer than the app (FR-005)
- [X] T030 Implement the app state container and render loop in `src/main.js` — holds the current Pattern, dispatches mutations through `core/pattern.js`, re-renders from `(pattern, transportPosition)` alone (FR-013)
- [X] T031 [P] Unit tests for storage and migration in `tests/unit/storage/` — round-trip, version handling, and the FR-006 serialization test asserting no Local Metadata key reaches any Pattern, MIDI, or submission payload

**Checkpoint**: The musical core is complete and exhaustively tested; Patterns persist. Nothing is visible yet.

---

## Phase 3: US-16.1 — Ship with a seeded Pattern library

**Goal**: The app arrives stocked with the 112 converted Patterns.

**Independent test**: Load the app with empty storage; all 112 Patterns are present, valid, and match the legacy note-on count.

- [X] T032 [US16.1] Implement seed loading in `src/storage/seed.js` — read `data/seed-patterns.json`, assign deterministic ids from seed position, mark provenance as shipped by origin store (data-model §5)
- [X] T033 [US16.1] Tests in `tests/unit/storage/seed.test.js` covering AC-16.1.1–AC-16.1.11, including the 1,053 note-on total and the 1/4 and 2/4 drill-cell conversions (AC-16.1.6)

---

## Phase 4: US-16.2 — Add Patterns by editing a data file

**Goal**: Adding a library Pattern is a data edit, no code change.

**Independent test**: Append a hand-written Pattern to `data/seed-patterns.json`; it appears in the library on reload with no other change.

- [X] T034 [US16.2] Document the seed-file format in `data/README.md`, mirroring contracts/file-formats.md §1
- [X] T035 [US16.2] Tests in `tests/unit/storage/seed-format.test.js` covering AC-16.2.1–AC-16.2.4, including that a hand-added Pattern with no `id` loads correctly

---

## Phase 5: US-1.1 — Measure sequence & per-Measure Time Signature

**Goal**: A Pattern is an ordered sequence of Measures, each with its own meter.

**Independent test**: Build a Pattern whose Measures are 4/4, 6/8 and 3/4; assert each holds the right Beat count and that the 6-Measure cap holds.

- [X] T036 [US1.1] Wire Measure add/remove and the 6-Measure cap into `src/ui/controls.js` and `src/main.js`
- [X] T037 [US1.1] Implement the apply-to-all-Measures prompt on first-Measure meter change in `src/ui/dialogs.js` (AC-1.1.5)
- [X] T038 [US1.1] Tests in `tests/unit/core/pattern.test.js` and `tests/e2e/us-1-1.spec.js` covering AC-1.1.1–AC-1.1.9, including inheritance of the previous Measure's meter and the undoable reset

---

## Phase 6: US-1.2 — Time signature support without implied grouping

**Goal**: Every supported meter, with beat count always equal to the numerator.

**Independent test**: For each supported meter, assert Beat count and that no view groups 7/8 as 2+2+3 or 6/8 as two dotted quarters.

- [X] T039 [US1.2] Implement the Time Signature picker in `src/ui/controls.js` over the closed supported set
- [X] T040 [US1.2] Tests in `tests/e2e/us-1-2.spec.js` covering AC-1.2.1–AC-1.2.4, asserting rendered Beat counts per meter

---

## Phase 7: US-1.3 — Mixed subdivision within a Beat, via Recipes

**Goal**: Per-Beat Recipes, including the two mixed-feel splits.

**Independent test**: Apply each Recipe and assert Slot count and Subdivision Group structure; assert the confirmation prompt fires in both directions when a Beat has notes.

- [X] T041 [US1.3] Implement the Recipe picker in `src/ui/controls.js`, offering exactly the menu for the Beat's note value
- [X] T042 [US1.3] Implement the clear-confirmation dialog in `src/ui/dialogs.js` — required in both directions whenever the Beat has notes, skipped when empty (AC-1.3.7, AC-1.3.8, AC-1.3.10)
- [X] T043 [US1.3] Render the straight/triplet group boundary in `src/ui/grid.js` for mixed-feel Recipes
- [X] T044 [US1.3] Tests in `tests/e2e/us-1-3.spec.js` covering AC-1.3.1–AC-1.3.10

---

## Phase 8: US-1.4 — Display and change a Measure's Time Signature in the grid

**Goal**: Each Measure shows and edits its own meter inline.

**Independent test**: Change one Measure's meter from the grid; assert only that Measure resets.

- [X] T045 [US1.4] Render the per-Measure Time Signature affordance in `src/ui/grid.js`
- [X] T046 [US1.4] Tests in `tests/e2e/us-1-4.spec.js` covering AC-1.4.1–AC-1.4.8

---

## Phase 9: US-3.1 — Per-Slot dynamics with musically-normal defaults

**Goal**: Turning on a Slot lands it on the accent a musician would naturally give that position.

**Independent test**: Turn on Slots across every Beat position and Recipe; assert each lands on its computed default, then assert the override cycle from each starting default.

- [X] T047 [US3.1] Implement slot tap and accent cycling in `src/ui/grid.js`, calling `core/accents.effectiveAccent` and never recomputing locally
- [X] T048 [US3.1] Define the CVD-verified accent palette and fill-height treatment in `src/styles/tokens.css` and `src/ui/grid.js` (D-005)
- [X] T049 [US3.1] Tests in `tests/e2e/us-3-1.spec.js` covering AC-3.1.1–AC-3.1.15, including recomputation after a Recipe reset (AC-3.1.10)
- [X] T050 [US3.1] Wire `npm run check:cvd` into the accent palette so a palette change cannot land without passing it

---

## Phase 10: US-4.1 — Play a Pattern on loop

**Goal**: Press Play; the Pattern loops with synced audio and a visual cursor.

**Independent test**: Play a multi-meter Pattern and assert timing accuracy over sustained looping, visual/audio sync, per-Measure iteration, and stop-and-reset on device suspension.

- [X] T051 [US4.1] Implement `src/audio/context.js` — AudioContext created inside a user-gesture handler, resume on gesture, and suspension detection (FR-010, FR-011)
- [X] T052 [US4.1] Implement `src/audio/scheduler.js` — lookahead transport computing every event time from an absolute audio-clock origin, never accumulated (FR-009)
- [X] T053 [US4.1] Implement `src/audio/voices.js` — percussive synthesis with the three Accent Levels audibly distinct
- [X] T054 [US4.1] Drive the playback cursor in `src/ui/grid.js` from the scheduler's event queue, not a separate animation loop
- [X] T055 [US4.1] Implement stop-and-reset on device suspension in `src/audio/context.js` and `src/main.js` — transport to stopped, cursor to Measure 1, loop counter to 0, no auto-resume on refocus (AC-4.1.5, AC-4.1.6)
- [X] T056 [US4.1] Tests in `tests/e2e/us-4-1.spec.js` covering AC-4.1.1–AC-4.1.6, including the 500-loop drift assertion and the 20 ms visual sync bound

---

## Phase 11: US-4.2 — Adjust tempo

**Goal**: Slider and presets across 18–220 BPM.

**Independent test**: Change tempo during playback and assert immediate restart at the new tempo, clamping at both bounds, and per-Pattern vs global default resolution.

- [X] T057 [US4.2] Implement the tempo control in `src/ui/controls.js` with clamping at 18 and 220
- [X] T058 [US4.2] Implement restart-on-tempo-change in `src/audio/scheduler.js`, resetting the loop counter (AC-4.2.2)
- [X] T059 [US4.2] Tests in `tests/e2e/us-4-2.spec.js` covering AC-4.2.1–AC-4.2.3

---

## Phase 12: US-4.3 — Metronome click and count-in

**Goal**: A reference pulse and a count-in measure.

**Independent test**: Enable both; assert the click lands on Beats, is timbrally separable from Pattern voices, and that count-in precedes the first loop only.

- [X] T060 [US4.3] Implement the metronome voice in `src/audio/voices.js`, timbrally outside the Pattern voices' range
- [X] T061 [US4.3] Implement count-in scheduling in `src/audio/scheduler.js`
- [X] T062 [US4.3] Tests in `tests/e2e/us-4-3.spec.js` covering AC-4.3.1–AC-4.3.6

---

## Phase 13: US-4.4 — Swing

**Goal**: Per-Subdivision-Group swing on straight-feel groups only.

**Independent test**: Set swing on the straight group of a mixed Recipe; assert the triplet group is unaffected and offsets match `core/swing.js`.

- [X] T063 [US4.4] Store per-group swing on the Beat in `src/core/pattern.js` and expose the control in `src/ui/controls.js`, disabled on triplet groups
- [X] T064 [US4.4] Tests in `tests/e2e/us-4-4.spec.js` covering AC-4.4.1–AC-4.4.5

---

## Phase 14: US-2.1 — Choose Sound Mode

**Goal**: Percussive or Melodic, per Pattern.

**Independent test**: Toggle mode; assert pitch controls appear only in Melodic and that Percussive playback needs no samples.

- [X] T065 [US2.1] Implement the Sound Mode toggle in `src/ui/controls.js`, showing and hiding pitch affordances
- [X] T066 [US2.1] Tests in `tests/e2e/us-2-1.spec.js` covering AC-2.1.1–AC-2.1.5

---

## Phase 15: US-2.3 — Transpose to a Key

**Goal**: A root key for a Melodic Pattern.

**Independent test**: Change key; assert every Slot's sounding pitch transposes and stored degrees are unchanged.

- [X] T067 [US2.3] Implement the key selector in `src/ui/controls.js`, enabled only in Melodic mode
- [X] T068 [US2.3] Tests in `tests/e2e/us-2-3.spec.js` covering AC-2.3.1–AC-2.3.3

---

## Phase 16: US-2.2 — Assign Pitch to a Slot

**Goal**: An explicit scale degree and octave per Slot.

**Independent test**: Assign degrees and octaves across a Pattern; assert each Slot sounds and exports at exactly what was authored.

- [X] T069 [US2.2] Implement the per-Slot pitch input in `src/ui/controls.js` and `src/ui/grid.js`
- [X] T070 [US2.2] Tests in `tests/e2e/us-2-2.spec.js` covering AC-2.2.1–AC-2.2.9

---

## Phase 17: US-2.4 — Sampled piano playback

**Goal**: Melodic notes sound like a piano, without blocking the app.

**Independent test**: Load the app and play Percussive immediately; then play Melodic and assert a loading state rather than silence or failure.

- [X] T071 [US2.4] Implement `src/audio/piano.js` — asynchronous soundfont loading, caching, and a clear error state on fetch failure
- [X] T072 [US2.4] Implement the Melodic loading state in `src/ui/controls.js` so Percussive playback is never gated on samples (AC-2.4.3)
- [X] T073 [US2.4] Tests in `tests/e2e/us-2-4.spec.js` covering AC-2.4.1–AC-2.4.5

---

## Phase 18: US-5.6 — Counting system toggle

**Goal**: Takadimi, 1-e-&-a, or Numbered labels, with mixed-feel Patterns forced to Numbered.

**Independent test**: Switch systems and assert labels per Recipe; open a mixed-feel Pattern and assert Numbered rendering without the stored preference changing.

- [X] T074 [US5.6] Implement `src/core/counting.js` — `labelsFor` and `effectiveSystem` per contracts/core-api.md
- [X] T075 [US5.6] Render labels and the legend in `src/ui/grid.js`, and the toggle in `src/ui/controls.js`
- [X] T076 [US5.6] Tests in `tests/unit/core/counting.test.js` and `tests/e2e/us-5-6.spec.js` covering AC-5.6.1–AC-5.6.11

---

## Phase 19: US-7.1 — Build a Pattern from scratch

**Goal**: Create a new Pattern and author it end to end.

**Independent test**: From an empty app, create a Pattern, add Measures and Beats, set Recipes, toggle Slots, and play it.

- [X] T077 [US7.1] Implement the new-Pattern flow in `src/ui/controls.js` and `src/main.js` (AC-7.1.1, AC-7.1.2)
- [X] T078 [US7.1] Tests in `tests/e2e/us-7-1.spec.js` covering AC-7.1.1–AC-7.1.2

---

## Phase 20: US-7.2 — Continuous auto-save for a Pattern you own

**Goal**: Owned Patterns save as you type, with no save action.

**Independent test**: Edit an owned Pattern and reload mid-edit without saving; every edit is present.

- [X] T079 [US7.2] Implement auto-save on every mutation in `src/main.js` and `src/storage/patterns.js`
- [X] T080 [US7.2] Tests in `tests/e2e/us-7-2.spec.js` covering AC-7.2.1–AC-7.2.3

---

## Phase 21: US-7.3 — Editing a shipped Pattern requires naming a new Pattern first

**Goal**: Shipped Patterns are never mutated.

**Independent test**: Edit a shipped Pattern; assert the naming prompt precedes the edit and that cancelling leaves the original untouched.

- [X] T081 [US7.3] Implement the forced-naming prompt in `src/ui/dialogs.js`, applying the pending edit only on confirm (FR-007)
- [X] T082 [US7.3] Tests in `tests/e2e/us-7-3.spec.js` covering AC-7.3.1–AC-7.3.5

---

## Phase 22: US-7.4 — Make a named copy of a Pattern you own

**Goal**: An explicit Make Copy under a new name.

**Independent test**: Copy an owned Pattern; assert both exist independently and edits to one don't affect the other.

- [X] T083 [US7.4] Implement Make Copy in `src/ui/controls.js` and `src/core/pattern.js`
- [X] T084 [US7.4] Tests in `tests/e2e/us-7-4.spec.js` covering AC-7.4.1–AC-7.4.6

---

## Phase 23: US-7.5 — Delete a Pattern

**Goal**: Permanently delete a Pattern you created.

**Independent test**: Delete an owned Pattern; assert it's gone after reload and that shipped Patterns offer no delete.

- [X] T085 [US7.5] Implement delete with confirmation in `src/ui/dialogs.js` and `src/storage/patterns.js`
- [X] T086 [US7.5] Tests in `tests/e2e/us-7-5.spec.js` covering AC-7.5.1–AC-7.5.4

---

## Phase 24: US-5.1 — Browse the library

**Goal**: Every Pattern in one place, alphabetical, then by rating.

**Independent test**: Load the app; assert all 112 shipped plus owned Patterns list in the specified order.

- [X] T087 [US5.1] Implement the library list in `src/ui/library.js` with the alphabetical-then-rating sort
- [X] T088 [US5.1] Tests in `tests/e2e/us-5-1.spec.js` covering AC-5.1.1–AC-5.1.6

---

## Phase 25: US-5.2 — Search by text

**Goal**: Filter the library by typing.

**Independent test**: Type a fragment; assert matching Patterns remain and non-matching disappear.

- [X] T089 [US5.2] Implement search filtering in `src/ui/library.js`
- [X] T090 [US5.2] Tests in `tests/e2e/us-5-2.spec.js` covering AC-5.2.1–AC-5.2.3

---

## Phase 26: US-5.3 — Organise by Tag, including automatic Tags

**Goal**: Tag filtering, with automatic Tags computed and non-removable.

**Independent test**: Assert `custom`, `swing`, `percussive` and `melodic` are derived not stored, render as outlined chips with no removal control, and that user Tags render filled with a removal control.

- [X] T091 [US5.3] Implement automatic Tag derivation in `src/core/pattern.js` — computed on read, never persisted (data-model §4)
- [X] T092 [US5.3] Implement Tag chips and filtering in `src/ui/library.js` and `src/styles/` — outlined vs filled per D-007 (AC-5.3.5)
- [X] T093 [US5.3] Tests in `tests/e2e/us-5-3.spec.js` covering AC-5.3.1–AC-5.3.8, including case-insensitive de-duplication

---

## Phase 27: US-5.5 — Navigate sequentially

**Goal**: Step through Patterns with Prev/Next.

**Independent test**: Navigate with a filter active; assert traversal follows the filtered, sorted order.

- [X] T094 [US5.5] Implement Prev/Next in `src/ui/library.js`
- [X] T095 [US5.5] Tests in `tests/e2e/us-5-5.spec.js` covering AC-5.5.1–AC-5.5.2

---

## Phase 28: US-6.1 — Rate a Pattern

**Goal**: 0–5 stars on any Pattern, shipped or owned.

**Independent test**: Rate a shipped Pattern; assert it persists across reload without mutating the shipped Pattern.

- [X] T096 [US6.1] Implement ratings in `src/ui/library.js` and `src/storage/`, storing ratings for shipped Patterns without mutating them
- [X] T097 [US6.1] Tests in `tests/e2e/us-6-1.spec.js` covering AC-6.1.1–AC-6.1.6

---

## Phase 29: US-8.1 — Append a second Pattern

**Goal**: Append another Pattern's Measures after the current one.

**Independent test**: Append a 2-Measure Pattern to a 3-Measure one; assert 5 Measures, each keeping its own meter, and that the cap is enforced.

- [X] T098 [US8.1] Implement the append flow in `src/ui/controls.js` over `core/pattern.append`
- [X] T099 [US8.1] Tests in `tests/e2e/us-8-1.spec.js` covering AC-8.1.1–AC-8.1.6

---

## Phase 30: US-10.1 — Duplicate a Pattern to build a variation

**Goal**: Double a Pattern's length with a copy of its own Measures.

**Independent test**: Duplicate a 2-Measure Pattern; assert 4 Measures and that editing the second half leaves the first intact.

- [X] T100 [US10.1] Implement duplicate in `src/ui/controls.js` over `core/pattern.duplicate`, enforcing the cap
- [X] T101 [US10.1] Tests in `tests/e2e/us-10-1.spec.js` covering AC-10.1.1–AC-10.1.6

---

## Phase 31: US-11.1 — Detect true duplicates

**Goal**: Warn only on genuine duplicates, at the two Pattern-creation moments.

**Independent test**: Create a Pattern identical to an existing one; assert the warning fires at naming and Make Copy only, and that mid-edit duplicates surface only in the standing view.

- [X] T102 [US11.1] Implement `src/core/similarity.js` — `rhythmFingerprint`, `isDuplicate`, `isSameFamily`
- [X] T103 [US11.1] Implement the duplicate warning at the two creation moments and the standing possible-duplicates view in `src/ui/library.js` and `src/ui/dialogs.js`
- [X] T104 [US11.1] Tests in `tests/unit/core/similarity.test.js` and `tests/e2e/us-11-1.spec.js` covering AC-11.1.1–AC-11.1.5

---

## Phase 32: US-11.2 — Detect and surface Pattern Families

**Goal**: Surface Patterns sharing identical rhythm but differing Sound Mode or Pitch.

**Independent test**: Create a melodic variant of a percussive Pattern; assert they surface as a Family, not a duplicate.

- [X] T105 [US11.2] Implement Family surfacing in `src/ui/library.js`
- [X] T106 [US11.2] Tests in `tests/e2e/us-11-2.spec.js` covering AC-11.2.1–AC-11.2.5

---

## Phase 33: US-11.3 — Detect when a library update duplicates your own Pattern

**Goal**: A one-time Remove/Keep prompt when a submitted Pattern later ships.

**Independent test**: Add a shipped Pattern duplicating an owned one; assert the prompt fires once and never again after resolution.

- [X] T107 [US11.3] Implement the one-time prompt in `src/ui/dialogs.js`, recording resolution in `src/storage/localMeta.js` and never on the Pattern (FR-006)
- [X] T108 [US11.3] Tests in `tests/e2e/us-11-3.spec.js` covering AC-11.3.1–AC-11.3.5

---

## Phase 34: US-12.1 — Export a single Pattern as MIDI

**Goal**: Download the current Pattern as `.mid`.

**Independent test**: Export a mixed-meter melodic Pattern; assert the file's meters, pitches, ticks and velocities match playback.

- [X] T109 [US12.1] Implement `src/export/midi.js` consuming `core/timeline.buildTimeline` — never re-deriving timing, pitch or accent (contracts/file-formats.md §2)
- [X] T110 [US12.1] Tests in `tests/unit/export/midi.test.js` covering AC-12.1.1–AC-12.1.4, including accent-to-velocity mapping and per-Measure Time Signature events

---

## Phase 35: US-13.1 — Submit a Pattern for review

**Goal**: Submit one Pattern or a batch as a prefilled GitHub issue.

**Independent test**: Submit a batch; assert the URL carries one JSON block per Pattern in seed-file shape, with no ids or Local Metadata, and that oversize payloads fall back to clipboard.

- [X] T111 [US13.1] Implement `src/export/submit.js` — prefilled issue URL builder with the oversize fallback (AC-13.1.3), no token anywhere (FR-008)
- [X] T112 [US13.1] Record submission time in `src/storage/localMeta.js`, never on the Pattern
- [X] T113 [US13.1] Tests in `tests/unit/export/submit.test.js` covering AC-13.1.1–AC-13.1.5

---

## Phase 36: US-15.1 — Desktop, tablet, and mobile adaptation

**Goal**: The full workflow works on a phone on a music stand.

**Independent test**: Build the densest Pattern (144 Slots) at 390 px; assert per-Measure vertical rows, 24 px minimum Slot width, no horizontal scroll, and playback autoscroll.

- [X] T114 [US15.1] Implement breakpoints and the desktop/tablet layouts in `src/ui/responsive.js` and `src/styles/`
- [X] T115 [US15.1] Implement per-Measure vertical row paging with a 24 px minimum Slot width in `src/ui/grid.js` and `src/ui/responsive.js` (AC-15.1.10, D-006)
- [X] T116 [US15.1] Implement playback autoscroll in `src/ui/responsive.js` and `src/ui/grid.js`, keeping the sounding Measure in view including on loop wrap (AC-15.1.11)
- [X] T117 [US15.1] Tests in `tests/e2e/us-15-1.spec.js` covering AC-15.1.1–AC-15.1.11 across the three viewport classes

---

## Phase 37: Polish & Cross-Cutting Concerns

- [X] T118 Run `npm run coverage:ac` and close every remaining gap until it reports zero uncovered ACs (FR-014)
- [X] T119 [P] Run the quickstart's V1–V8 validation scenarios manually and record the results in `specs/001-rhythm-master-mvp/quickstart.md`
- [X] T120 [P] Verify the 30-minute continuous-playback run in `tests/e2e/endurance.spec.js` holds time with no drift, stall, or degradation (SC-002)
- [X] T121 [P] Verify `npm run check:cvd` passes against the final accent palette
- [X] T122 [P] Verify `npm run validate:seed` passes and all 112 Patterns load and play
- [X] T123 Confirm the deploy workflow blocks on a failing test, then publish to GitHub Pages
- [X] T124 [P] Update `README.md` with run, test, and contribution instructions

---

## Dependencies

```
Phase 1 (Setup)
   └─> Phase 2 (Foundational — core + storage)   ⚠️ blocks everything
          ├─> Phase 3–4   US-16.1, US-16.2   (seed library)
          ├─> Phase 5–8   US-1.1 … US-1.4    (structure + grid)   ← needs Phase 3
          ├─> Phase 9     US-3.1             (accents)            ← needs Phase 7
          ├─> Phase 10–13 US-4.1 … US-4.4    (playback)           ← needs Phase 9
          ├─> Phase 14–17 US-2.1 … US-2.4    (melodic)            ← needs Phase 10
          ├─> Phase 18    US-5.6             (counting)           ← needs Phase 7
          ├─> Phase 19–23 US-7.1 … US-7.5    (authoring)          ← needs Phase 8
          ├─> Phase 24–28 US-5.1 … US-6.1    (library)            ← needs Phase 19
          ├─> Phase 29–30 US-8.1, US-10.1    (combine, duplicate) ← needs Phase 23
          ├─> Phase 31–33 US-11.1 … US-11.3  (duplicate detection)← needs Phase 24
          ├─> Phase 34–35 US-12.1, US-13.1   (export, submit)     ← needs Phase 16
          └─> Phase 36    US-15.1            (responsive)         ← needs Phase 9
                 └─> Phase 37 (Polish)
```

**Ordering rationale**: the chain that matters is Recipes → accents → playback. Accents can't be
tested without Recipes to position them within, and playback can't be verified without accents to
hear. Everything downstream of playback is comparatively independent and the branches can proceed
in parallel.

## Parallel Opportunities

- **Phase 2**: T012–T016 are five independent pure modules; T019–T025 are seven independent test
  files; T026–T028 are three independent storage modules. This is the widest parallel phase.
- **Phases 24–28** (library: browse, search, tags, navigation, ratings) touch mostly
  `src/ui/library.js` and are best done in sequence, but their test files are independent.
- **Phases 34–35** (MIDI export, submission) are fully independent of each other and of the
  library work.
- **Phase 37**: T119–T122 and T124 are independent verification tasks.

## Implementation Strategy

All 34 stories ship. There is no MVP subset. Phases are dependency-ordered, so the app becomes
progressively usable — Patterns play from Phase 10, are authorable from Phase 19, and browsable
from Phase 24 — but none of those is a release boundary.

**The gate that matters**: `npm run coverage:ac` must reach zero uncovered ACs before Phase 37
closes. It will report 206 gaps at the start of Phase 2 and should fall monotonically. A phase is
not done while its ACs are uncovered.

---

## Post-MVP task log

Every change after the MVP build gets a numbered task here — bug, data fix,
feature, or governance amendment — with the files it touched and the US/AC IDs
it implements or revises. See `CLAUDE.md` §3.

`T125`–`T132` are backfilled from work done before this log existed, so the
record is complete rather than starting mid-stream.

- [X] T125 **[approach change]** Vendor the piano soundfont instead of fetching it from a CDN — `src/audio/piano.js`, `tools/fetch-soundfont.js`, `research.md` D-003. *Superseded by T126.*
- [X] T126 **[approach change]** Port the predecessor's synthesis engine for both Sound Modes; remove the sampled path entirely — `src/audio/nodes.js`, `src/audio/voices.js`, `src/audio/melodic.js`. Reversed US-2.4 (rewritten), amended research.md D-003, retired the Constitution's sampled-piano exception (v3.1.0). *This is the change the blast-radius rule in CLAUDE.md §1 was written for.*
- [X] T127 **[bug]** Shared audio nodes were cached module-globally rather than per AudioContext; a replaced context would have thrown on every connect — `src/audio/nodes.js`.
- [X] T128 **[new capability]** Add Tags from the UI; lock a built-in Pattern's own Tags while leaving user-added ones removable — `src/ui/library.js`, `src/storage/overlays.js`, `src/main.js`. AC-5.3.5 extended.
- [X] T129 **[spec defect]** Provenance was shown as the prose "ships with the app"; it is now the automatic Tag `built-in`, paired with `custom` — `src/core/pattern.js`, `src/ui/controls.js`, `src/ui/dialogs.js`. AC-5.3.5 extended.
- [X] T130 **[data]** Merge the redundant "Song Signatures" Tag into "Song" across 14 Patterns — `data/seed-patterns.json`.
- [X] T131 **[bug]** The mobile drawer stayed open when a Pattern was created from it — `src/main.js`. AC-15.1.6 rewritten around the rule rather than the control.
- [X] T132 **[spec defect]** The "&" subdivision took Medium only on Beat 1, which was inconsistent between Beats and ranked a subdivision equal to the Beat-3 downbeat — `src/core/accents.js`. AC-3.1.4 and AC-3.1.5 revised, AC-3.1.16 added.
- [X] T133 **[new capability]** Filter by several Tags at once, ANDed — `src/ui/library.js`, `src/main.js`. AC-5.3.9 added.
- [X] T134 **[new capability]** Move a Pattern's Tags onto the Pattern header and stop repeating them down the library list — `src/ui/controls.js`, `src/ui/library.js`, `src/main.js`. AC-5.3.10 added.
- [X] T135 **[process]** Codify the workflow: blast-radius rule, change-type triage, task logging, verification gates — `CLAUDE.md`, this section.
- [X] T136 **[data]** Correct inaccurate Tags across the shipped library, decided pattern-by-pattern with the maintainer — `data/seed-patterns.json`, commit `d413223`. Song removed from 8 self-describing Patterns; New Rhythm and My Rhythm deleted; the four 3/4 waltzes moved off Odd Meter onto Waltz; Latin added to the 7 originals that lacked it; the vague "Rhythm" tag retired; Blues, Gospel and Shuffle filled in. Library 112 → 110 Patterns, 1,053 → 1,027 note-ons, 15 → 17 Tags, none unused, none untagged. AC-5.3.7 added.
- [X] T137 **[process]** Require checking the durable record before asking the maintainer anything — `CLAUDE.md` §9 (§8 when written). A compaction of this conversation lost the record of T136, so the same decisions were put to the maintainer twice while the answers sat in `git log`.
- [X] T138 **[docs]** Drop the hard-coded Pattern count from `CLAUDE.md` and `README.md`; both still said 112 after T136 removed two. A count restated in prose goes stale the moment the data changes, so neither file names one now.
- [X] T139 **[new capability]** Give the library and the main panel their own scrollbars — `src/styles/tokens.css`, `src/ui/responsive.js`, `tests/e2e/responsive.spec.js`. AC-15.1.12 added. `.shell` was `min-height: 100vh` with no cap, so the sidebar's `overflow-y: auto` never engaged: the taller pane stretched the document and its single scrollbar dragged both, so reading to the bottom of the Pattern list carried the player off the top of the window. The shell is now pinned to the viewport and clips; each pane scrolls itself.
- [X] T140 **[spec defect]** Collapse the library whenever a Pattern is loaded, at every width, and reopen it from a sticky toggle — `src/main.js`, `src/ui/responsive.js`, `src/styles/tokens.css`, `tests/e2e/responsive.spec.js`, `tests/e2e/library.spec.js`. AC-15.1.2, AC-15.1.3 and AC-15.1.6 revised; AC-15.1.13 added. The collapse rule was mobile-only and AC-15.1.6 stated explicitly that the sidebar stays visible on tablet and desktop, which is the clause this reverses. The drawer state is now `data-library` (`open`/`collapsed`) and the toggle `.library-toggle`, since above mobile there is no drawer for `data-drawer` to have described. Collapsed is a within-session position and is deliberately not persisted, so no load ever starts with the library missing.
- [X] T141 **[docs]** Correct the AC count in `README.md`, stale at 206 against an actual 209 before T139–T140 and 211 after. *(T138 dropped the Pattern count from prose for this reason; the AC count survived that pass and went stale the same way. If it goes stale a third time, drop it too — `npm run coverage:ac` is the honest source.)*

- [X] T142 **[process]** Make every change land as a PR, and ask per change whether to auto-merge — `CLAUDE.md` §5 (new; §5–§9 renumbered to §6–§10). Work was being pushed to a branch and left there, so the maintainer reloaded the live site and saw none of it — `main` is the deploy trigger, and a branch is invisible from where they sit. The landing mode is now a single `AskUserQuestion` at the point implementation starts, defaulting to Auto, rather than a static list of change types that would have re-asked for approval already given under §1.
- [X] T143 **[process]** Extend `CLAUDE.md` §5 with a sixth step: watch the deploy run and report what is actually live. Merging is not landing — the `deploy` job failed twice running (a 503 from the Pages API, then a 429 fetching `actions/deploy-pages`) while `verify` and `build` passed both times, so `main` was correct and the site stale, which from the maintainer's chair is indistinguishable from the work never happening. Also records that the session token cannot re-run a workflow (`403 Resource not accessible by integration`; it holds `contents` and `pages` write, not `actions: write`), so a red deploy is handed back with the run link rather than quietly retried.
- [X] T144 **[spec defect]** Stop hardcoding the shipped library's size — `specs/001-rhythm-master-mvp/spec.md`, `src/storage/seed.js`, `tests/seed-count.js` (new), `tests/unit/storage/seed.test.js`, `tests/e2e/library.spec.js`, `tests/e2e/remaining.spec.js`, `README.md`, `CLAUDE.md`. AC-16.1.1 revised; AC-5.3.10's Given reworded. The library grows by appending to `data/seed-patterns.json` with no code change (US-16.2), so the literal `110` in an AC would have had to be amended for every batch of Patterns added — a spec edit for a change the spec does not govern, and the same staleness T138 and T141 fixed in prose. The count is still asserted in seven places, now against the data file's own length via `SEED_PATTERN_COUNT`, so a loader or list that silently drops Patterns still fails. AC-16.1.3's note-on figure of 1,027 is a record of the conversion from the predecessor, not of the library, so it is now counted over the first 110 Patterns rather than all of them; `seed.noteOnCount()` takes the slice to count.
- [X] T145 **[spec defect]** Build US-2.2's pitch strip, and split a Melodic Slot into a note band and an accent zone — `src/core/pitch.js`, `src/ui/grid.js`, `src/ui/controls.js`, `src/main.js`, `src/styles/tokens.css`, `specs/.../data-model.md`, `tests/unit/core/pitch.test.js`, `tests/e2e/melodic.spec.js`, `tests/e2e/responsive.spec.js`. AC-2.2.2 through AC-2.2.6 and AC-2.2.9 revised, AC-2.2.10–AC-2.2.13 added, AC-15.1.8 revised, a note added under AC-3.1.1.

  US-2.2 had described a pitch strip holding an armed pitch, painted onto Slots. What was built was a Degree and an Octave dropdown inside the Edit accordion, acting on whichever Slot was tapped last — with no marker showing which Slot that was, and no way to select one without also cycling its Accent, so pitching a note cost a four-tap round trip to put the Accent back. The dropdown could not even reproduce the shipped library's own pitches: it offered neither degree 8 nor 10, and four seed Patterns use them.

  Two deliberate departures from the AC text as it stood, both approved before implementation. A Slot's tap area is now split (AC-2.2.10), which is what lets AC-2.2.6 and AC-2.2.7 both hold — as written they contradicted each other, one saying a tap on an active Slot repaints its Pitch and the other saying it cycles its Accent. And stamping is confined to Slots that already sound (AC-2.2.5, reversed): the accent zone decides whether a Slot sounds, the note band decides what it sounds. Turning a Slot on now picks up the armed pitch (AC-2.2.11) rather than always the tonic, so the two-gesture path reaches where the old one-gesture path did.

  Slot geometry: a Melodic Slot is 24px of note band over 32px of accent zone at every width, so both zones clear 24px in both dimensions at the AC-15.1.10 worst case (AC-2.2.12). Percussive Slots are untouched at 52px/44px — most of the library is Percussive and did not need the height.

  Drag-stamping, which the old AC-2.2.5 mentioned, is deliberately not implemented: the armed pitch stays armed across stamps, so a run of Slots is one tap each.

  *Not fixed here, by decision: `tests/unit/core/pitch.test.js` claims AC-2.2.2 through AC-2.2.9 for tests of semitone arithmetic, which is why `coverage:ac` read 100% over a UI that did not exist. The gate only checks that an AC ID appears in a test name. Those names are left as they are pending a separate pass over the whole suite for the same fault — see T146.*
- [X] T146 **[process]** Audit every AC ID claimed by a test against what that test actually asserts, and close the hole in `tests/ac-coverage.js` that lets a name claim an AC it does not exercise. Found via T145: eight tests in `tests/unit/core/pitch.test.js` named AC-2.2.2–AC-2.2.9 while testing degree/semitone arithmetic, so an entire unbuilt User Story reported full coverage. Two more surfaced in the same change — AC-15.1.9's test switched to Melodic on a *shipped* Pattern, so the copy-naming dialog swallowed the mode change and the strip it names was never on screen; AC-2.2.1's e2e test asserted a dropdown that no AC described. Scope is the root cause and the prevention, not a one-off correction.

  *Delivered as T147. The audit's findings are T148–T153.*

- [X] T147 **[governance]** Replace the "an AC ID appears in a test name" gate with one that checks the whole traceability chain — `.specify/memory/constitution.md` (v3.1.0 → v3.2.0), `CLAUDE.md` §2a and §2b (new; §2a's rule also referenced from the §2 triage table), `specs/001-rhythm-master-mvp/plan.md` (new Traceability Matrix, Constitution Check now PARTIAL), the traceability checker — created here under `tools/`, and moved by T154 to `.claude/skills/spec-trace/spec-trace.mjs`, which is where it lives now — `specs/traceability-baseline.json` (new; moved by T159 from `specs/001-rhythm-master-mvp/`, which is where it lived at the time), `package.json`, `.github/workflows/deploy.yml`.

  Principle IV required only that a test "reference the AC's ID", which is what `coverage:ac` checked. An ID in a test name is a claim, not a demonstration, and the claim was false twice: US-2.2's pitch strip (T145) and — found by this audit — US-11.1's possible-duplicates view and US-11.2's Family panel. All three were specified, never built, and reported 100% covered.

  Principle IV now requires one criterion per test with compound ACs decomposed into numbered **Cases**; a test **name that is its criterion's title verbatim**, so wording drift in the spec forces someone to open the test; a **DOM-capable test for any UI-level criterion**, since `src/core/` is pure and cannot prove one however it is named; the chain **AC → plan item → implementation task + test task**, so an AC cannot be specified and never scheduled; and orphan IDs failing rather than warning. A new NON-NEGOTIABLE clause forbids weakening a test to make a failure go away — the cheapest way to green a red suite is to lower what it asks, which converts a caught defect into a shipped one.

  `npm run check:trace` implements seven checks (T1–T7) and is a required gate. It found **333 standing findings**, held in `traceability-baseline.json` so it blocks *new* drift while they burn down: a baselined finding is reported but does not fail the build, anything else does, and the list may only shrink — `--prune-baseline` removes what is fixed and nothing writes new entries, so taking on debt means hand-editing a checked-in file. Fixing a baselined finding fails the gate until it is pruned, deliberately, so the list cannot quietly re-excuse a later regression.

  Verified against three seeded regressions before landing: an invented AC ID in a test (T7), a new AC with no plan item and no test (T1 + T5), and a clean criterion's test renamed away from its title (T5). All three failed the gate; restoring each returned it to green.

  *Also corrected here: `tests/ac-coverage.js` parsed test names with a regex that ended a name at any quote character, so AC-3.1.4's name — which contains `"&"` — was read as `the `. Two ACs went unexamined for a reason unrelated to their tests.*

- [X] T155 **[bug]** Tests for T148 — `tests/e2e/duplicates.spec.js` (new, 12 tests over AC-11.1.3, AC-11.1.4/1–/2, AC-11.1.5/1–/2, AC-11.1.6/1–/2, AC-11.2.2, AC-11.2.4, AC-11.2.5), `tests/unit/core/similarity.test.js` (rewritten), `tests/e2e/responsive.spec.js` and `tests/e2e/operations.spec.js` and `tests/e2e/remaining.spec.js` (updated).

  `similarity.test.js` was rewritten rather than extended. Its thirteen tests were named for AC-11.1.3, AC-11.1.4, AC-11.1.5, AC-11.2.2, AC-11.2.3, AC-11.2.4 and AC-11.2.5 while all of them tested fingerprint arithmetic — the mislabelling that let two unbuilt User Stories read as fully covered. Each is now named verbatim for the criterion it actually proves (AC-11.1.1, AC-11.1.2, AC-11.1.4, AC-11.2.1, AC-11.2.3), so the ACs freed up are the ones the new e2e file proves properly. This is T149's method applied to the eight criteria T148 owns; the rest of T149 is untouched.

  Four existing tests changed for reasons stated rather than for convenience: three encoded the duplicate warning's old `Make Copy` button label, which is now `Keep both` (AC-11.1.3's own wording for the proceed-anyway choice); `AC-11.1.1`'s e2e test asserted that declining the warning abandons the copy entirely, which is the behaviour AC-11.1.3 says is wrong, so it was re-pointed to AC-11.1.3 and now asserts the corrected flow; and AC-15.1.8's test carried the old section list and its own paraphrased name.

- [X] T148 **[bug]** Build US-11.1's possible-duplicates view and US-11.2's Family members panel — `src/core/similarity.js`, `src/ui/dialogs.js`, `src/ui/controls.js`, `src/main.js`, `src/styles/tokens.css`, `specs/001-rhythm-master-mvp/spec.md`, `specs/001-rhythm-master-mvp/plan.md`. AC-15.1.8 revised; AC-11.1.4 revised and given Cases; AC-11.1.5 extended and given Cases; AC-11.1.6 added with Cases; AC-11.2.5 given Cases. Tests are T155.

  **The spill, approved before implementation.** AC-15.1.8 fixed the main-panel section order "at any viewport width" and AC-11.2.5 required a family area present only at ≥768px — a direct contradiction, and the reason a conditionally-present section had nowhere to go. AC-15.1.8 now carries the family area as a conditional entry, the same shape as the pitch strip's Percussive absence, so what it guarantees is unchanged: the sections present are always in this order and none ever swaps places. AC-11.1.4 required a view but never said how it is reached, which left the first thing a musician must do — find it — unspecified; it opens from the actions area, which AC-15.1.8 already covered as "other actions". AC-11.1.6 is new, because the view invites deleting a Pattern while it is open, which US-7.5's Delete never does.

  **AC-11.1.3 was half-built, not merely mislabelled.** The warning fired on Make Copy but never in US-7.3's forced-naming flow, though the AC names both; and declining it abandoned the whole operation, where the AC says "cancel and stay on the naming prompt". Both flows now loop back to the prompt with the typed name still in the field.

  Two things found while building, both fixed rather than worked around. The forced-naming flow copies the shipped Pattern *before* applying the edit that triggered it, so the copy is identical to its own source by construction — the first implementation warned on every single edit of a shipped Pattern. The check now excludes the Pattern being copied; a clash with any other Pattern still warns. And the possible-duplicates view shares its host with `confirm`, which empties it, so removing a Pattern destroyed the view mid-flow; it re-attaches after each confirmation.

  `duplicateGroups` is new in `core/` — `findDuplicates` was relative to one Pattern, and AC-11.1.4 needs pairs across the whole library, since a duplicate that emerged from ongoing edits may be between two Patterns neither of which is open. It lists members in library order: the view puts a Remove control on every row, and a list ordered differently from the library is one where it is easy to delete the wrong Pattern.

  Baseline 333 → 316 as a result. Of US-11's 15 criteria, 14 now read OK in the matrix; AC-11.1.2 still needs Cases and is left for T151.

  *Superseded description: build the view and panel — AC-11.1.4, AC-11.1.5, AC-11.2.4, AC-11.2.5, and the naming-time warning in AC-11.1.3.* `src/core/similarity.js` computes all of it correctly and `src/main.js` exposes `currentDuplicates`, `currentFamily` and `unresolvedLibraryDuplicates` — but only on the `window.__rm` test seam. There is no view, no panel, no CSS, and no way for the musician to reach any of it. AC-11.1.4 calls the view "the sole safety net" for duplicates that emerge through ongoing edits, so at present there is none. AC-11.2.5 specifies the panel below the editor at ≥768px and nothing below that. Thirteen tests of fingerprint arithmetic in `tests/unit/core/similarity.test.js` carry these Stories' AC IDs, which is why this read as complete. **This is unbuilt work, not a naming defect — it is why the audit happened.**

- [X] T169 **[new capability]** Colour a cell by what it sounds or would sound, and make it square — `specs/001-rhythm-master-mvp/spec.md`, `src/ui/grid.js`, `src/styles/tokens.css`, `tests/e2e/grid.spec.js`, `tests/e2e/grid-boundaries.spec.js`. AC-3.1.18 and AC-15.2.6 added, both with Cases. Extends P-009 and P-038.

  Carried over from a predecessor app of the maintainer's that reads better than this grid did.

  - **Every cell had one ground**, so an empty Measure was a row of identical boxes and a half-written one gave no clue which positions were structurally strong. A resting Slot is now tinted by `defaultAccent` — the level it would take if turned on — which is the same metric hierarchy AC-3.1.2's table already computes, shown rather than left implicit. A sounding Slot is tinted by its actual level instead, more strongly, so what sounds beats what merely could.
  - **The syllable takes its Accent Level's colour too**, so a cell reads as one thing. The fills could not be reused as text: `--accent-weak` (#3a6ea8) on the Slot's ground is about 2.5:1, well under what small text needs, so `--accent-ink-*` are lightened forms and AC-3.1.18/4 holds them to 4.5:1 against the composited tint.
  - **Counting cells are square** (AC-15.2.6), because the cell is the unit the eye counts and a wide rectangle reads as a span of time.

  **`aspect-ratio` could not be used for the square, and the reason is worth keeping.** `.beats` is a grid of `minmax(min-content, 1fr)` tracks (AC-15.1.14), and an aspect-ratio feeds the cell's height back into its min-content *width* — combined with the existing `min-height` it became a silent 52px width floor that both unbalanced the tracks and wrapped a 4/4 Measure AC-15.1.14/4 requires to fit one line. A container-query length (`100cqi`) resolves after the width does, so it cannot affect it.

- [X] T168 **[new capability]** Give the grid room to breathe — `src/styles/tokens.css`. No AC changes: spacing was never specified, only the constraints it must not break (AC-15.1.10's 24px Slot minimum and no sideways scroll, AC-15.1.14's shared Beat width).

  The Beat separator T167 added sat 4px from the cells on either side, so the boundary it drew was crammed rather than legible, and the maintainer named the whole grid as too crowded. Spacing is now four tokens — Slot, group, Beat, Measure padding — with the gap *between* Beats several times the gap *within* one, because the separator should be confirming a grouping the spacing already suggests rather than doing that work alone.

  **The compact values are the base and desktop widens them**, which is the opposite of how the first attempt was written. Generous spacing takes width from the cells, and at tablet size the library's 240px column leaves a 900px window with less room than the phrase "tablet" suggests — nearer a phone's than a desktop's. Widening there wrapped a plain 4/4 Measure at Straight 16ths, the commonest Pattern there is, onto two lines when it would otherwise fit one. So the generosity is keyed at 1101px, and the Slot minimum that lets a dense Measure wrap rather than shrink is `38px` — measured as the point where that 4/4 Measure still fits one line down to about 900px.

- [X] T167 **[spec defect]** Show a dot where a Slot is silent, and separate Beats with a rule instead of a box — `specs/001-rhythm-master-mvp/spec.md`, `src/ui/grid.js`, `src/styles/tokens.css`, `tests/e2e/grid.spec.js`, `tests/e2e/grid-boundaries.spec.js`. AC-3.1.17 and AC-15.2.2 revised. Extends P-009 and P-038.

  Both changes came from the maintainer comparing this grid against a predecessor app of their own that reads better, and both reverse something written earlier the same day.

  - **AC-15.2.2 required each Beat to carry "its own drawn border".** That produced a box inside a box inside a box — Measure, Beat, Slot — and the nesting turned out to be what made the grid hard to read, not what made it legible. A single rule between Beats draws the same boundary with one line. It is a pseudo-element in the gap rather than a border or padding, because a border on every Beat but the first makes that Beat a different width, which AC-15.1.14/1 forbids.
  - **AC-3.1.17 kept the syllable on a silent Slot** and made it lighter, smaller and dimmer. Three channels, and still too subtle to scan across a Measure where most Slots sound — which is the case the maintainer was actually looking at. A silent Slot now shows a dot instead: a cell either has a syllable in it or it does not, which is a difference in kind rather than degree. T166 was the second attempt at this and this is the third; the lesson is that degrees of emphasis do not survive a dense Pattern, whatever the channel.

  The syllable a dot stands for is kept on the element and as its accessible name (AC-3.1.17/3), so a screen reader still hears "e" where a sighted reader sees a dot — and the counting-system criteria, which are about which vocabulary the labels come from rather than about which Slots sound, now assert against that rather than against rendered text.

- [X] T166 **[new capability]** Make a silent Slot recede, so the shape of what plays is legible — `specs/001-rhythm-master-mvp/spec.md`, `src/styles/tokens.css`, `tests/e2e/grid.spec.js`. AC-3.1.17 added with Cases. Extends P-009.

  Every counting syllable rendered identically whether or not its Slot sounded, so the largest, boldest thing in an empty cell was text carrying no information about the rhythm. The maintainer could not see which subdivisions play without reading each cell in turn — which is the opposite of what a grid is for.

  A silent Slot's syllable is now regular rather than bold, about three quarters the size, and dimmer. **Three channels deliberately.** The maintainer asked for the first two; on their machine neither works alone, because a browser-enforced minimum font size clamps the reduced size back up to the full one and a substituted typeface flattens the weight. Colour is the only one of the three no reader setting overrules, so AC-3.1.17/3 states it separately and its test re-asserts the distinction with size and weight forced equal.

  The Accent bar also scales with the cell now (AC-3.1.17/4): its height was a flat 5px, which is proportionate in a 16th-note cell and a hairline in an undivided one.

- [X] T165 **[new capability]** Make the sounding Slot findable without hunting, and stop the note band competing with the count — `specs/001-rhythm-master-mvp/spec.md`, `src/styles/tokens.css`, `tests/e2e/playback.spec.js`, `tests/e2e/melodic.spec.js`, `tests/e2e/grid-boundaries.spec.js`. AC-4.1.7 added with Cases; AC-2.2.17 added with Cases; AC-2.2.15/3 reversed. Extends P-010 and P-016.

  Four reports from practising against it, and they share a root: the grid's visual weight was distributed by rules that never asked what the cell was for.

  - **The playback cursor was a 2px outline on the whole Slot**, which in Melodic mode boxed the note band in with the accent zone — so it read as marking the note name rather than the beat. It now fills the accent zone with that Slot's own Accent colour, so a Strong beat flashes amber and a Weak one blue, and the syllable flips to whichever of dark or light clears it. A silent Slot lights neutral grey, so the pulse can still be followed through rests. AC-4.1.2 had fixed the highlight's *timing* and said nothing about its appearance, which is how an outline shipped as the answer to "where am I".
  - **Percussive counts were 10px** — the note band's size — so the count read as the least important text in a mode whose cell contains nothing else. Now the same treatment as Melodic.
  - **The count did not fill a wide cell.** A Slot's width is whatever its Recipe leaves it, so 15px that fills a 16th-note cell sits as a small mark in an 8th-note cell twice as wide. The syllable now sizes in `cqi` against the Slot's own width, floored at 15px and capped at 26px, so it holds its proportion at every subdivision.
  - **The note band was two lines and too tall.** One line now, and the visible strip is 18px. The 24px of AC-2.2.12 is a *tap target*, not a look, so the button keeps 24px while the strip inside it is thinner — and AC-2.2.17 keys that target on the pointing device rather than the viewport, so a trackpad gets the strip's own height back and a tablet held in the hand keeps the finger-sized one at any width.

- [X] T164 **[bug]** Carry the Slot's text hierarchy on colour, and fix the two text colours that were inverted — `specs/001-rhythm-master-mvp/spec.md` (AC-2.2.14/6 added), `src/styles/tokens.css`, `tests/e2e/melodic.spec.js`. Extends P-016.

  The counting syllable was `--ink-dim` while the scale degree was `--ink`, so the note the maintainer wanted to recede was literally the brightest text in the Slot. That is a plain inversion and it had been there since T160.

  The larger point is why three passes at "make the note text smaller" changed nothing the maintainer could see: **their browser enforces a minimum font size**, which raises the syllable's 15px and the pitch's 10px to that same value. No declared ratio survives it. Weight is no better — a dyslexia-friendly face with heavy weighted bottoms reads as bold at every weight. Both channels AC-2.2.14/3 and /4 rely on are ones a reader's own settings overrule.

  Colour is the one channel neither setting touches, so the ordering now rests on it: syllable `--ink`, degree `--ink-dim`, name `--ink-faint` (new). AC-2.2.14/6 states it, and its test asserts strictly descending relative luminance **and** re-asserts the ordering with size and weight forced identical — the state the maintainer's browser actually produces. /3 and /4 stay as reinforcement where a browser honours them.

- [X] T163 **[approach change]** Move the Accent's second channel from fill height to a bottom bar, and pin the grid's typefaces — `specs/001-rhythm-master-mvp/research.md` (D-005 amended), `src/ui/grid.js`, `src/styles/tokens.css`, `tests/e2e/grid.spec.js`, `tests/e2e/melodic.spec.js`. No AC changes: nothing in the spec ever specified the fill, only D-005 did, and it named itself revisable.

  Two reports from the maintainer, one cause between them.

  - **The fill collided with the counting syllable.** Level was encoded by fill *height*, so the colour boundary swept vertically through the band the text sits in — measured, 0.4px below the baseline at Weak and 2.8px above the caps at Medium. No fill percentage avoids it. The bar is now pinned to the bottom edge at 5px and encodes level by *width* (33/67/100%), so it cannot reach the letters at any level. The cell's ground stays flat, and the dark-text-on-light-fill flip retires with it.
  - **The grid was illegible under a dyslexia-friendly system font.** `system-ui` and a bare `monospace` both resolve to the reader's own setting, and the maintainer runs OpenDyslexic system-wide. Under a face with a large x-height the 15px syllable and the 10px pitch stopped being distinguishable, and the tall metrics overflowed the note band. Faces are now named explicitly (`--font-ui`, `--font-mono`), which generic keywords cannot reach — and every Slot box sizes from its content with `min-height` floors rather than pinned heights, so a face forced through an extension or a minimum-size setting still gets a grid that grows instead of clipping.

  **Why the tests did not catch the second one:** they read `font-size` back from `getComputedStyle`, which is the value the stylesheet declared. A substituted face changes the ink and not the declaration, so the assertion cannot fail by construction. AC-2.2.14/3 now measures rendered glyph extents via canvas as well as the declared size, and AC-2.2.14/5 gained a case that substitutes a proportional face at an enforced 14px and asserts no box clips. Same lesson as T162 one level down: assert what is drawn, not what was asked for.

- [X] T162 **[bug]** Make the note band's text actually read as subordinate, and stop it being clipped — `src/styles/tokens.css`, `specs/001-rhythm-master-mvp/spec.md`, `tests/e2e/melodic.spec.js`. AC-2.2.14/3 and /4 tightened; AC-2.2.14/5 added. Extends P-016.

  T160 shipped three defects that its own tests passed, which is the part worth recording:

  - **The pitch was bold.** Weight 500 against the syllable's 700 satisfies "bolder than", and in `ui-monospace` — SF Mono on macOS — a Medium face at 10px is indistinguishable from Bold. Now 400, a 300-point separation.
  - **The sizes looked identical.** 10px under 13px satisfies "a smaller font size" and reads as the same text twice. The syllable is now 15px, a ratio of 1.5.
  - **The text was clipped vertically.** Two 10px lines at line-height 1.05 gave each glyph a 10.5px line box with no room for ascenders or descenders, inside a 24px band with 22px of content. Line-height is now 1.25 and `--slot-note-h` is 28px — AC-2.2.12 sets 24px as a floor, not a value.

  **All three passed a green gate**, and that is the finding. AC-2.2.14/3 and /4 asserted `<` and `>`, which any difference satisfies however invisible; both now carry a margin. The truncation check in AC-2.2.15/3 ran on the horizontal axis only, so vertical overflow was never looked at; it now checks both, and AC-2.2.15/5 exists to check leading directly. A criterion that cannot fail is not a criterion.

- [X] T160 **[new capability]** Make Melodic mode readable: brighter grid boundaries, the note band moved below the accent zone, and note names beside scale degrees — `src/core/pitch.js`, `src/ui/grid.js`, `src/ui/controls.js`, `src/main.js`, `src/styles/tokens.css`, `specs/001-rhythm-master-mvp/spec.md`, `specs/001-rhythm-master-mvp/plan.md`. Implements P-016, P-036 and P-038. AC-2.2.10 and AC-15.1.8 revised; AC-2.2.14, AC-2.2.15, AC-2.2.16 added; US-15.2 added with AC-15.2.1–AC-15.2.5. Tests are T161.

  Four maintainer reports, and three of them contradicted a criterion that had been written deliberately, so each is a spec revision made before the code rather than after:

  - **Boundaries were invisible.** Every line in the grid was one token, `--line` (`#262a38`), at ~1.2:1 against the panel behind it, and a Beat had no border at all — only a 6px gap distinguishing it from the 2px gap between Slots. New US-15.2 sets a 3:1 floor and a Measure > Beat > Slot hierarchy, on grid-only tokens so the library, dialogs and control bar are untouched (AC-15.2.4).
  - **The note band was above the accent zone**, flush against it, so pitch sat between the eye and the accent fill. Moved below and separated by a gap (AC-2.2.10 revised, AC-2.2.14 added). The syllable rose 10px → 13px and went bold rather than the pitch shrinking: the maintainer could not read 8px on their display, so the subordination is achieved by raising the syllable, not lowering the note.
  - **The pitch strip displaced the transport.** AC-15.1.8 put it between grid and play controls, arguing adjacency to the grid was worth moving Play down on every Melodic Pattern. Used daily that trade was backwards, and the strip now sits below the play controls. It is still never inside a collapsed section, so AC-2.2.13 stands unchanged — only the order of two always-visible sections changed.
  - **Degrees required mental conversion.** `core/pitch.js` could resolve a degree to a MIDI note but could not name it, so nothing could show `Fb4` beside `b3`. `noteName` added, spelling diatonically against the Key so each degree takes its own letter. Shown on two lines inside the note band, which is what makes it fit: measured at 390px on the densest Pattern (8 Measures of 12/8 at Straight 16ths, 192 Slots) the band is 29.2px wide, and the widest name any Key can produce — `Abb4`, the flattened second of G♭ — needs 24.1px stacked against 36.1px on one line (AC-2.2.15/3).

- [X] T161 **[new capability]** Tests for T160 — `tests/unit/core/pitch.test.js`, `tests/e2e/grid-boundaries.spec.js` (new), `tests/e2e/melodic.spec.js`, `tests/e2e/responsive.spec.js`. Covers AC-2.2.14/1–/4, AC-2.2.15/1–/4, AC-2.2.16, the revised AC-2.2.10 and AC-15.1.8, and AC-15.2.1/1–/4 through AC-15.2.5. The boundary criteria are UI-level (T6) and read computed styles from a rendered grid, so they cannot be proved from `src/core/`.

- [X] T156 **[governance]** Report coverage as well as gaps, rank gaps by severity, admit a narrow waiver, and stop the change matrix over-reporting — `.specify/memory/constitution.md` (v3.3.0 → v3.4.0), `CLAUDE.md` §2b, `.claude/skills/spec-trace/lib/matrix.mjs`, `.claude/skills/spec-trace/lib/project.mjs`, `.claude/skills/spec-trace/lib/analyse.mjs`, `.claude/skills/spec-trace/lib/config.mjs`, `.claude/skills/spec-trace/spec-trace.mjs`, `.claude/skills/spec-trace/tests/spec-trace.test.js`, `.claude/skills/spec-trace/SKILL.md`, `.claude/skills/spec-trace/README.md`, `specs/traceability-waivers.json` (new; moved by T159 from `specs/001-rhythm-master-mvp/`, which is where it lived at the time).

  **The change matrix was over-reporting to the point of uselessness.** T148's PR reported 167 criteria across 28 User Stories for a change that really touched fourteen: `src/main.js` is named by dozens of tasks, so touching it fans out through every plan item that claims it. The "over-report rather than under-report" rule was right in principle and unusable in practice — a 169-row table is not a review aid. Rows are now split by how the criterion was reached: **direct** (a test naming that criterion changed in the diff) is listed in full, **indirect** (the change touched a file some task mentions) collapses to a count behind a disclosure, labelled as a blast radius rather than a finding.

  **The matrix reported gaps but not coverage**, so it could not answer whether the work was fit to ship — and it summed a test proving the wrong thing together with a test having an untidy name into a single meaningless number. It now reports the proportion proven, overall and per User Story, and ranks every gap CRITICAL / HIGH / MEDIUM / LOW.

  Severity is **derived from the kind of gap, never assigned per criterion**. An assigned severity is a judgement made under whatever pressure applied at the time and gets revised downward by whoever is in a hurry; a derived one cannot be argued with. The ladder is the one this audit produced: MISNAMED never hid anything, WRONG TEST hid two entire User Stories.

  **The waiver is the risky part and is deliberately narrow.** A LOW or MEDIUM gap may be signed off with a written reason, kept in its own file — separate from the baseline, because debt still owed and a decision not to pay it are different things — and shown in the matrix row so it is argued for in review rather than merely recorded. CRITICAL and HIGH may not be waived by anyone for any reason, and that prohibition is now a NON-NEGOTIABLE clause: those are exactly the states in which US-2.2's pitch strip and US-11.1/US-11.2's views sat while reporting as complete. New check **T9** fails a waiver that reaches above MEDIUM, names an undeclared criterion, carries no real reason, or covers a gap that has since been fixed — so the file cannot rot into a blanket pass.

  Twelve new self-tests, including one asserting that no severity outside LOW/MEDIUM is waivable, so the prohibition is enforced by the suite and not only by the prose.

- [X] T158 **[docs]** Colour the traceability matrix by status, so proven and unproven are told apart at a glance — `.claude/skills/spec-trace/lib/matrix.mjs`, `.claude/skills/spec-trace/tests/spec-trace.test.js`, `.claude/skills/spec-trace/SKILL.md`, `CLAUDE.md` §2b, `specs/traceability-matrix.md` (regenerated; moved by T159 from `specs/001-rhythm-master-mvp/`, which is where it lived at the time). No AC, plan item or research decision is touched: this is how the generated document reads, not what it checks.

- [X] T159 **[docs]** Move the generated matrix, baseline and waivers file out of `specs/001-rhythm-master-mvp/` to `specs/` — `spec-trace.config.json`, `CLAUDE.md` §2b and §8, `.claude/skills/spec-trace/SKILL.md`, `specs/traceability-matrix.md`, `specs/traceability-baseline.json`, `specs/traceability-waivers.json` (all three moved, matrix regenerated). The three had been nested inside this one feature's spec folder purely because that is where `spec.md` happened to be pointed at when T147 created the checker — but the matrix reports on the whole application, not this feature, and this folder is `001-`: it is not the last one. Nested there, the matrix reads as scoped to a release it will outlive. `spec`, `plan` and `tasks` stay feature-scoped, under the numbered folder, because those genuinely are authored per feature; `matrix`, `baseline` and `waivers` move to the `specs/` root, matching the tool's own `DEFAULTS` in `.claude/skills/spec-trace/lib/config.mjs` — which is where `waivers` was already implicitly pointed, since the old config never overrode it and the file had in fact been sitting at the wrong path with no effect, since it holds no waivers yet. No AC, plan item, research decision or checker behaviour changes — pointers only.

  T156 gave every gap a severity, but rendered all six states — proven, waived, and four gap severities — in the same black text, so 220 rows had to be *read* to find the ones in trouble. Markdown carries no colour of its own, so the mark is a glyph: 🟢 proven · 🔵 waived · 🟡 → 🟠 → 🔴 as a gap gets more serious, on each criterion row, on each headline count, and on each User Story. CRITICAL and HIGH share red deliberately — they are the two the Constitution refuses to let anyone waive, and splitting them by colour would suggest one is negotiable.

  A **User Story takes the colour of its worst criterion**, not an average: one unproven claim is the thing worth seeing, and averaging would let a single CRITICAL hide behind nine OKs.

  **The colour is always printed beside the words it repeats, never instead of them.** Red against green is the one pair a colour-blind reader cannot separate — the same concern `npm run check:cvd` enforces for the accent palette — and the matrix also has to survive being read in a plain-text diff, where glyphs are all that render. Six new self-tests, one of which strips every mark from the output and asserts the document still states each row's status, so the colour can never quietly become load-bearing.

- [ ] T149 **[bug]** Re-point the 83 criteria whose test proves something else, then confirm what each AC actually claims is tested at all. Grouped by the file the mislabelled test lives in: `library.spec.js` (11), `counting.test.js` (9), `seed.test.js` (9), `similarity.test.js` (8), `pattern.test.js` (6), `storage.test.js` (6), `operations.spec.js` (6), `ui/library.test.js` (5), `grid.spec.js` (4), `playback.spec.js` (4), `export.test.js` (4), `remaining.spec.js` (3), `melodic.spec.js` (3), `swing.test.js` (3), and one each in `pitch.test.js`, `responsive.spec.js`, `accents.test.js`, `timeline.test.js`. The runs are contiguous — AC-5.6.6–AC-5.6.11, AC-16.1.3–AC-16.1.11 — which is the signature of ACs being inserted and the spec renumbered while test names stayed put. The old gate's orphan check was a warning, so an ID that slid onto a *different real* AC was invisible. **Each one is two questions, in this order: is the AC's own claim proved anywhere? Only then, what should the test be called?** Renaming first would bury exactly the kind of gap T148 turned out to be. Per Constitution Principle IV, where an AC turns out to be untested the fix is a test, never a softened AC.

- [ ] T150 **[bug]** Give the 20 remaining UI-level criteria a test that can reach the DOM — US-1.1 (AC-1.1.2, AC-1.1.4, AC-1.1.8, AC-1.1.9 — ~~AC-1.1.3~~ done by T157), US-1.3 (AC-1.3.5), US-3.1 (AC-3.1.12, AC-3.1.13), US-4.4 (AC-4.4.2, AC-4.4.3), US-5.6 (AC-5.6.1, AC-5.6.3, AC-5.6.11), US-11.1 (AC-11.1.3–AC-11.1.5), US-11.2 (AC-11.2.4, AC-11.2.5), US-11.3 (AC-11.3.2), US-13.1 (AC-13.1.3), US-16.1 (AC-16.1.2). Each names a control, menu, prompt, panel, or gesture and is currently proved only by a pure unit test. Several are the *same* gap as T148 seen from the other side: a disabled `+Measure` button (AC-1.1.3), a Recipe menu's contents (AC-1.3.5), the absence of a swing control on a triplet group (AC-4.4.3) — none of these can be observed from `src/core/`. Expect some to turn out unbuilt.

- [ ] T151 **[spec defect]** Decompose the 61 compound ACs into numbered Cases (`AC-x.y.z/1`, `/2`, …), one assertion each, and give each Case its own test. Heaviest: US-15.1 (9), US-2.2 (8), US-1.4 (6), US-5.3 (6), US-1.2 (4), US-1.3 (4), US-16.1 (4), US-13.1 (3). AC-1.2.2 and AC-3.1.2 are 12-row tables currently proved by one test each — twelve claims, one demonstration. No AC is renumbered: Cases are additive, and renumbering is precisely what caused T149.

- [ ] T152 **[docs]** Correct the 129 criteria whose test is right but named in its own words rather than the spec's, so T5 passes verbatim. Clerical, and strictly *after* T149 — a rename pass run first would make the mislabelled tests look settled. Also correct the 37 file paths named by checked-off MVP tasks that do not exist (`tests/e2e/us-1-1.spec.js` and 32 siblings, from the consolidation into eight suites; plus `src/audio/piano.js` and `tools/fetch-soundfont.js`, removed by T126). A task log that names files which were never written is not a record.

- [X] T154 **[governance]** Make the traceability chain a reviewable document, test the checker, and make the whole thing portable — `.specify/memory/constitution.md` (v3.2.0 → v3.3.0), `CLAUDE.md` §2b and §4–§5, `.claude/skills/spec-trace/SKILL.md`, `.claude/skills/spec-trace/README.md`, `.claude/skills/spec-trace/spec-trace.mjs`, `.claude/skills/spec-trace/lib/config.mjs`, `.claude/skills/spec-trace/lib/parse.mjs`, `.claude/skills/spec-trace/lib/analyse.mjs`, `.claude/skills/spec-trace/lib/matrix.mjs`, `.claude/skills/spec-trace/lib/project.mjs`, `.claude/skills/spec-trace/hooks/stop-notify.mjs`, `.claude/skills/spec-trace/tests/spec-trace.test.js`, `.claude/settings.json`, `spec-trace.config.json`, `specs/traceability-matrix.md` (moved by T159 from `specs/001-rhythm-master-mvp/`, which is where it lived at the time), `package.json`, `vitest.config.js`, `.github/workflows/deploy.yml`.

  T147 built the gate but left the chain visible only as a pass/fail line: the maintainer could be told "333 findings" without being shown what they were against. There is now a generated matrix — one row per criterion, carrying its Story, the criterion's own words, its plan item, its implementation tasks and its **test tasks separately**, the test that proves it, and a status — committed so it diffs in review, and gated on being current (new check **T8**). `npm run trace:changed` prints the same rows filtered to what a change touches, for the PR body; it reaches a criterion through a changed test naming it and through a changed source file named by a task whose plan item covers it, which is the route a diff alone misses.

  The checker moved from `tools/check-traceability.js` into a self-contained, dependency-free skill so it is portable: copy `.claude/skills/spec-trace/` into any spec-kit project and write a `spec-trace.config.json`. A `Stop` hook surfaces new findings when a session ends, and never blocks — a hook that halts a session over a documentation gap gets switched off.

  **The checker now has its own tests** (37, over fixtures), which the Constitution requires because a false PASS in a gate is invisible by construction: a gate that never fires looks exactly like one with nothing to find. They assert both that each defect class is caught and that a clean project raises nothing — a checker that flags everything enforces as little as one that flags nothing.

  Those tests found two live defects in the checker on their first run. Its stemmer mapped "measures" to "measur" while "measure" stayed whole, so the spec's word and the test's word for the same thing failed to match — masked until now by a hand-written measure/measures synonym, which is why the fix was to the stemmer and not the synonym list. And an AC range spanning two stories consumed its own endpoints while contributing nothing, silently dropping both ACs from the plan item that named them. Fixing the stemmer reclassified four criteria from "test proves something else" to "test merely misnamed" (AC-1.1.5, AC-10.1.2, AC-11.1.2, AC-13.1.3), all four verified by hand as genuinely related tests; the baseline was edited surgically for those four rather than regenerated wholesale.

- [ ] T153 **[docs]** Refresh `plan.md`'s stale Technical Context — it still lists `soundfont-player` and a piano soundfont as primary dependencies and cites the Constitution's sampled-piano exception, all retired by T126; still says "34 User Stories, 206 Acceptance Criteria" against 215; still says 112 seeded Patterns against a count that T144 made derive from the data file; and its Source Code tree still lists `src/audio/piano.js`. Same staleness T138, T141 and T144 fixed elsewhere, in the one artifact that escaped those passes.

- [X] T157 **[spec defect]** Raise the Measure cap from 6 to 8, and revise every criterion whose behaviour was pinned to 6 — `specs/001-rhythm-master-mvp/spec.md` (AC-1.1.3, AC-2.2.12, AC-8.1.2, AC-8.1.3, AC-8.1.6, AC-10.1.3, AC-10.1.4, AC-15.1.10, US-1.1's Independent Test, AC-16.1.10, and the Edge Cases density note), `specs/001-rhythm-master-mvp/data-model.md` (§1 field table, §7 rule 1), `specs/001-rhythm-master-mvp/research.md` (D-006 and two rejected-alternative figures), `src/core/pattern.js`, `tests/unit/core/pattern.test.js`, `tests/e2e/grid.spec.js`, `tests/e2e/remaining.spec.js`, `tests/e2e/melodic.spec.js`.

  **Why 8, and why now.** Transcribing a graded reading book into the library found lines of 7 Measures — 2/4 exercises whose phrases run seven bars. Under a cap of 6 each of those becomes two Patterns, which is not what the exercise is. 8 is the smallest even cap that clears the longest line found; even matters because Duplicate doubles, and an odd cap would stop Duplicate one Measure short of it.

  **The cap was one constant but not one behaviour.** `MAX_MEASURES` is the only literal — every enforcement site already derived from it, so the code is a one-line change. Six Acceptance Criteria had the number 6 written into their *scenarios*, and those are the real change: the Combine picker's exclusion threshold (AC-8.1.2, "more than 3" → "more than 5"), the exactly-on-the-boundary combine (AC-8.1.3, "Fill B" grown 3 → 5 Measures so it still lands on the cap), the re-filter case (AC-8.1.6, 5 → 7 Measures so it still runs at its tightest), and both Duplicate criteria.

  **AC-10.1.4 is a behaviour reversal, not a rewording.** A 4-Measure Pattern could not be duplicated before and now can. The Given moved to 5 Measures, the smallest size still refused, and AC-10.1.3's Given moved 3 → 4 so it keeps proving the boundary rather than a case comfortably inside it. Both were verified against the control's own predicate rather than assumed from the constant.

  **The density claim is the part with consequences.** AC-15.1.10 pins the worst case the mobile layout must survive, and it grew from 6 Measures of 12/8 at Straight 16ths (144 Slots) to 8 (192). No gate proves a denser grid is still *readable*, only that no Slot drops under 24px and nothing scrolls sideways — so the 390px rendering was looked at, not merely asserted. D-006's rationale was updated with the new figures and an explicit note that the decision is strengthened rather than contradicted: per-row Slot count is fixed by the Time Signature and does not move with the cap; what moves is total page length, which is why AC-15.1.11's auto-scroll matters more now.

  **AC-1.1.3 got the DOM test it has been owed since T150.** It names a control — a disabled `+Measure` button — and `src/core/` cannot observe one, so it was passing T6 only by being in the baseline. The new e2e test checks the control is *enabled* at 7 Measures before checking it is disabled at 8, so it proves the cap is doing the disabling and not some unrelated always-off state. Struck from T150's list, and the baseline pruned rather than left to re-excuse it later.

  Baseline 316 → 310: five T5 entries (AC-1.1.3, AC-8.1.3, AC-10.1.3, AC-10.1.4, AC-15.1.10) and one T6 entry (AC-1.1.3) are no longer findings, since revising an AC's title forces its test to be reread and renamed to match.

- [X] T158 **[data]** Transcribe Winning Rhythms Exercise 1 into the shipped library — `data/seed-patterns.json` (9 Patterns appended, `s_111`–`s_119`), `tests/e2e/library.spec.js`.

  Nine Patterns, `WR 1-B` through `WR 1-J`, all 4/4, four Measures each, tempo 80, tagged `WR Book`. **Line A was deliberately skipped** — sixteen undifferentiated quarter notes is a metronome, not an exercise, and the maintainer excluded it.

  **Appended, never inserted.** Shipped ids are `s_${index + 1}` (`src/storage/seed.js`), so inserting anywhere but the end would renumber every later Pattern and orphan the ratings and added Tags that `rm.overlays.v1` keys by id. The diff is 1863 insertions and 0 deletions, which is the check that this held.

  **Straight 8ths, not Straight 16ths, for a quarter-note Beat.** There is no Undivided Recipe for a quarter-note Beat (data-model §3), so a plain quarter note cannot be one Slot. Straight 8ths is the thinnest available — one dead "&" per Beat instead of Straight 16ths' three.

  **Only onsets are transcribed**, per the tool's design: a half note is a sounding Slot on its own Beat and silence on the next, and a tie contributes no onset at all. Eight of the ten lines carry a previous owner's pencilled counting, which agrees with this reading on every one; line E has none and rests on the transcription alone.

  One test outside the change failed and was corrected: `AC-5.1.6`'s test asserted `toHaveCount(111)`, a hardcoded library size. Per §2a the test was the defect — the criterion asserts nothing about how many Patterns exist, and the same file already imports `SEED_PATTERN_COUNT` and uses it two tests earlier. This is a literal that T144/#4 missed when it stopped the library's size being hardcoded; it is now derived. (That test is also mislabelled — `AC-5.1.6` is about list order, not owned Patterns joining the library — which is T149's territory and left for it.)

- [X] T162 **[spec defect]** Fix the 1-e-&-a counting display: every Beat read "1-&" instead of incrementing — `specs/001-rhythm-master-mvp/spec.md` (AC-5.6.12, AC-5.6.13 added), `specs/001-rhythm-master-mvp/plan.md` (P-018), `src/core/counting.js`, `src/ui/grid.js`. Implements P-018.

  Reported against "WR 1-D": switching to 1-e-&-a left every Beat reading "1-&" rather than "1-&, 2-&, 3-&, 4-&". `labelsFor` looked up the 1-e-&-a vocabulary from a static table keyed only by Slot count (`{ 2: ['1', '&'], ... }`), with no `beatIndex` parameter at all — so the leading digit was always the literal string `'1'`, and `src/ui/grid.js`'s `renderBeat`, which already has `beatIndex` in scope, never had anywhere to pass it. Takadimi is unaffected: its vocabulary (`ta`, `ka`, `di`, `mi`) has no beat-number digit to get wrong.

  No AC previously said what the leading digit of 1-e-&-a counts — AC-5.6.7 and AC-5.6.9 specified restart-per-Beat only for Numbered. Added AC-5.6.12 and AC-5.6.13, mirroring that pair for 1-e-&-a, before changing the code (§2, spec defect path). `labelsFor` now takes a `beatIndex` parameter (default 0, so every existing three-argument call site and test is unaffected) and substitutes the Beat's own ordinal for the vocabulary's placeholder `'1'` only when `system === 'one-e-and-a'`.

- [X] T163 **[spec defect]** Tests for T162 — `tests/unit/core/counting.test.js`, `tests/e2e/grid.spec.js`. Covers AC-5.6.12 and AC-5.6.13. The digit is UI-level (T6) as well as core-level, since it is what the musician actually reads off the grid, so `grid.spec.js` checks the second Beat's rendered label directly rather than relying on the unit test alone.

- [X] T164 **[bug]** Toggling the metronome click mid-playback desynced `state.isPlaying` from the running transport and left the click stuck once desynced — `src/audio/scheduler.js`, `tests/e2e/playback.spec.js`.

  Reported: pressing Play showed "Stop" correctly, but toggling Click while playing flipped the button back to "Play" even though audio kept running; pressing "Play" again then behaved like a reset; and after that, Click stopped responding at all until a full Stop/Play cycle.

  Root cause was in `createTransport`, not in the button or toggle handlers themselves. `restart()` (used by `onSetting`, and also by `onTempo`/`onSwing` for AC-4.2.2-style restarts) is `stop()` immediately followed by `start()` — but `stop()` unconditionally fired the `onStop` callback, which `src/main.js` wires to mean "the musician stopped, or the device suspended audio" (AC-4.1.5, AC-4.1.6) and which sets `state.isPlaying = false`. `restart()`'s internal stop is not that event, so every settings-triggered restart corrupted `state.isPlaying` for the instant between its `stop()` and `start()`, and `render()` painted that stale value permanently since nothing after `start()` ever set `state.isPlaying` back to `true`. Once corrupted, `onSetting`'s own `if (state.isPlaying) transport.restart(...)` guard read `false` and stopped forwarding further toggles to the scheduler at all — explaining why Click got stuck rather than merely mislabelling.

  Fixed by giving `stop()` a `silent` flag and having `restart()` pass it, so only a genuine stop (explicit Stop, or the device taking audio away) fires `onStop`. That silenced the transport's own reset of the loop counter, which restart() had been relying on as a side effect to satisfy AC-4.2.2 ("the loop counter resets to 0, since the restart begins a new run") — `start()` now reports loop 0 directly via `onLoop?.(0)` instead, which is correct for a fresh Play as well as a restart. Same latent bug existed for `onTempo`/`onSwing`'s restarts mid-playback, not only the reported Click case, though it went unreported there.

  No AC governs the transport's internal `onStop`/`onLoop` contract, so this is corrected as a bug (§2a) with no spec revision. Added a regression e2e test toggling Click four times mid-playback, asserting `isPlaying`/`transport.isRunning` stay `true` and the metronome setting flips each time; verified it fails without the fix (isPlaying went `false` on the second toggle) and passes with it. Full e2e suite (194 tests) and all six gates pass.

- [X] T165 **[data]** Transcribe Winning Rhythms Exercises 2–10 into the shipped library — `data/seed-patterns.json` (88 Patterns appended, `s_120`–`s_207`), `tools/validate-seed.js`, `tests/unit/storage/seed.test.js`.

  88 Patterns, `WR 2-B` through `WR 10-K`, all percussive at 80 BPM, tagged `WR Book`, appended so no existing id moves. Nine of them carry seven Measures — the Exercise 2 lines that motivated T157's cap raise, now actually using it.

  **Deliberately excluded**: nine two-part duets (the app has one voice), Exercise 13 (a worksheet with blank measures), Exercise 12's blank staves, and `WR 1-A`, `2-A`, `3-A`, `3-B` as too simple to be worth practising. Exercise 10 is partial — four lines transcribed, two that would not resolve (10-I, 10-J), seven not reached. Exercises 11, 12 and 14–21 remain untranscribed.

  **T157 claimed every enforcement site derived from `MAX_MEASURES`. That was wrong.** `tools/validate-seed.js` keeps its own copy — deliberately, so it stays standalone and dependency-free per its own header — and T157 did not update it, so the cap raise never reached the seed gate. The first seven-Measure Pattern found it. `tests/unit/storage/seed.test.js` held a third copy, hardcoded to 6.

  **That third copy was also mislabelled.** It ran under `AC-16.1.7`, which is about accent preservation and says nothing about Measures. Renaming it to the criterion it actually proves (`AC-16.1.10`) left `AC-16.1.7` with no test at all — it had only ever been covered by a test measuring something else, exactly the T148 failure mode. Per Constitution Principle IV the fix is a test, so `AC-16.1.7` now has one, asserting both its clauses: overrides survived conversion, and Patterns without stored accents carry none so the metric defaults compute.

- [ ] T166 **[bug]** 205 stored Accent Levels across 36 shipped Patterns are equal to the value the metric default would compute, which data-model §3 forbids outright: "present only when the user overrode the computed default … never written speculatively." Found by T165's new `AC-16.1.7` test when it briefly asserted the §3 rule; the assertion was withdrawn because §3 is not what `AC-16.1.7` claims, and the debt logged here instead rather than silently widened into a criterion that never covered it. 243 accents in the same Patterns are genuine overrides, so this cannot be fixed by stripping the field wholesale — each has to be compared against `defaultAccent`. Affected include "Downbeat ska", "3 middle up downbeat", "Downbeat triplet upbeat", "8th-8th-Quarter Tumble", "Rumba Clave 3-2 Mod". Stripping the redundant ones is inaudible by construction — the computed default replaces them — which is what makes this safe and also what has let it sit unnoticed.

- [X] T167 **[new capability]** Beats in a Measure lay out on one shared column width, and a wrapped Measure balances its lines — `specs/001-rhythm-master-mvp/spec.md` (AC-15.1.14 added), `specs/001-rhythm-master-mvp/plan.md` (P-036), `src/ui/beat-layout.js`, `src/ui/grid.js`, `src/main.js`, `src/styles/tokens.css`. Implements P-036.

  Reported against a 4/4 Pattern on a phone: measured at 390px, the Measure laid its Beats out at 110, 110, 110 and then 341 — three narrow Beats on the first line and the fourth spread across the whole of the second, all four sounding the same duration.

  `.beats` was a wrapping flexbox of `flex: 1 1 auto` Beats, and a flexbox grows whatever landed on a line to fill that line. AC-15.1.10 required the wrap and forbade a Beat splitting across it, but said nothing about the widths that come out, so this is a new criterion (AC-15.1.14) rather than a bug — written, with its plan row and both tasks, before the code (§1, §2).

  Now a CSS grid of `repeat(var(--beat-cols), minmax(min-content, 1fr))`: equal tracks, none of which can be driven below what its Slots need at the 24px minimum, so an over-ambitious column count cannot overflow (AC-15.1.10 continues to hold). The column COUNT is the one part CSS cannot express — it depends on the measured minimum, and so on the reader's font — so `ui/beat-layout.js` measures it and writes `--beat-cols`. The count is deliberately not "as many as fit": the most that fit gives the LINE count, and the Beats then divide evenly between those lines, which is what turns 3-and-1 into 2-and-2.

  **Not inside `renderGrid`**, which stays a pure function of (pattern, transportPosition) per Principle II — how much room the grid has is neither. `renderGrid` writes `--beat-count` from the Pattern alone as the one-line fallback; `main.js` balances immediately after the render, before the task yields to paint, and again on resize and through a `ResizeObserver` — the library opening or collapsing changes the grid's width and fires no resize event at all (AC-15.1.14/5). The measured minimum is cached by the Measure's Slot shape, since playback re-renders the grid on every Slot and an uncached probe would force a layout tens of times a second.

  **The maintainer chose equal widths at every viewport**, not mobile-only: a Measure whose Beats carry different Recipes now shows them at one width with the Slot counts differing inside, at desktop and tablet as well as on a phone. Verified at 1400, 900 and 390px.

  One assertion had to be a margin rather than an equality: `1fr` tracks divide a fractional container width, so twelve Beats across 802px come out 61.328px and 61.344px. The tests assert the spread is under a pixel.

- [X] T168 **[new capability]** Tests for T167 — `tests/unit/ui/beat-layout.test.js`, `tests/e2e/grid.spec.js`. Covers AC-15.1.14/1–AC-15.1.14/5.

  Five e2e tests, one per Case, plus unit tests of the column arithmetic for the edges a browser cannot easily reach — a Beat wider than the viewport, a Measure of one Beat. The unit tests deliberately do not stand for the criterion: AC-15.1.14 is UI-level (T6) and what it asserts is what a Measure looks like on a screen.

  AC-15.1.14/2 asserts each `.beats` container's own `scrollWidth` as well as the page's, because `overflow-x: hidden` on the body means an over-wide Measure is CLIPPED rather than scrolled — it would hide half a Measure while every page-level overflow check still passed.

- [X] T169 **[bug]** Submit did nothing: the whole hand-off half of US-13.1 was unbuilt — `specs/001-rhythm-master-mvp/spec.md` (Cases added to AC-13.1.1, AC-13.1.3, AC-13.1.4; AC-13.1.4 clarified), `specs/001-rhythm-master-mvp/plan.md` (P-035), `src/export/submit.js`, `src/storage/localMeta.js`, `src/ui/dialogs.js`, `src/ui/controls.js`, `src/styles/tokens.css`, `src/main.js`. Implements P-035, AC-13.1.1–AC-13.1.5.

  Reported: "there is a submit button in export & actions, it doesn't seem to do anything." Correct, and it had never done anything. `handlers.onSubmit` built the submission and **returned** it; `renderActions`'s click handler discarded the return value. Nothing opened the URL, nothing showed a link, and no clipboard path existed anywhere in `src/`. The one observable effect was a lie: it stamped `submittedAt`, marking as submitted a Pattern that was never sent.

  T111–T113 built `export/submit.js` and stopped there. The gate could not see it: `submit.js` is pure, so the URL builder's unit tests reported AC-13.1.1 as covered while the criterion is about a link on a screen — the `core/` -cannot-prove-a-UI-criterion failure mode from §2b, reached through `export/`. US-13.1 read 0 of 5 criteria proven in the matrix, and the whole epic was in fact unbuilt from the button inwards.

  **Three places where the code contradicted an AC**, all corrected in the code per §2a, none by revising the criterion: `MAX_URL_LENGTH` was 6000 against AC-13.1.3's stated 8,000; `buildIssueTitle` produced "New Patterns: 3 submissions" against AC-13.1.2's "Bulk Pattern Submission (3 patterns)"; and AC-13.1.4's exclusion of already-submitted, unedited Patterns had no implementation at all — `submittedAt` was written and never read.

  **"Edited since" needed defining, and AC-13.1.4 never did.** A Pattern carries no modified timestamp, and adding one would change the stored Pattern shape to answer a bookkeeping question. Decided by comparing submission payloads: `submissionDigest` (FNV-1a over the submission shape) is stored beside `submittedAt` as Local Metadata, and `selectForBulk` includes a Pattern when the digest differs. Strictly more truthful than a timestamp — an edit that is undone before the next bulk run is correctly not an edit — and it keeps everything about submission tracking inside `rm.localMeta.v1`, which is what AC-13.1.5 requires. AC-13.1.4 carries a dated clarification recording this.

  **The submission is recorded when the link is followed, not when Submit is pressed.** Pressing Submit and closing the dialog is not a submission, and marking it as one would exclude that Pattern from the next bulk run (AC-13.1.4) so it silently never goes anywhere. `showSubmission` takes an `onOpened` callback wired to the link's own click.

  Bulk submission is a second control, `Submit All…`, beside Submit. It copies the full text to the clipboard unconditionally (AC-13.1.2), not only in the oversized case — these Patterns exist in one browser and nowhere else, so a submission GitHub rejects for length must not lose them. `copyToClipboard` falls back from the async Clipboard API to `execCommand`, since the app is also opened from `file://` and over plain HTTP on a phone, where the API is unavailable.

- [X] T170 **[bug]** Tests for T169 — `tests/unit/export/export.test.js`, `tests/e2e/submission.spec.js`. Covers AC-13.1.1/1–/3, AC-13.1.2, AC-13.1.3/1–/2, AC-13.1.4/1–/3, AC-13.1.5.

  AC-13.1.1 and AC-13.1.3 are UI-level (T6), so the new e2e file proves them at the DOM: Submit opens a dialog carrying a real `<a>` whose `href` holds the title, label and body; clicking it opens a second tab on github.com; and only then does `submittedAt` appear. github.com is stubbed at the context — the app is offline by design and a test that depends on a third party fails for reasons of its own. That stub is also how AC-13.1.1/3 is proved: every request the app makes is visible, and none is to `api.github.com`.

  The pure tests were renamed to their criteria verbatim. Three had drifted: two named AC-13.1.2 while proving payload shape, and one named AC-13.1.4 while proving that a small payload fits in a URL — the criterion AC-13.1.4 actually states, exclusion of already-submitted Patterns, had no test at all. That is the T5 `mismatched` finding the baseline had been carrying since the gate landed.

- [X] T171 **[bug]** T167's layout pass measured on every render, which timed out the densest Melodic e2e test on CI — `src/ui/beat-layout.js`.

  The deploy's verify job failed twice on `AC-2.2.15/3` — 8 Measures of 12/8 Melodic, 192 Slots at 390px — timing out at 30s where it had taken 9.8s on the run before.

  `balanceBeatLines` measured on every call, and playback re-renders the whole grid on every Slot (Principle II), so a forced layout landed in the middle of each render. A Measure's columns depend on its Slot shape, its meter label and the grid's width; while those hold, the answer holds. It is now cached on exactly that key, so the render path only writes `--beat-cols` and never reads, and the grid's own width is read once per pass and only when something is unknown.

  Measured against a warm preview server, three runs each: 15.7s on the flexbox this replaced, 16.3s with the uncached version, 6.0s with the cache. The fixed-column grid turns out to be cheaper to lay out than a wrapping flexbox of 192 min-content items, once nothing forces a read mid-render.

  No AC changed: AC-15.1.14 says what the layout must be, not how often it may be computed (§2a, fixed as a bug).

- [X] T172 **[bug]** A four-Measure Pattern fell into the oversized-bulk fallback, because the submitted JSON was pretty-printed — `src/export/submit.js`, `tests/unit/export/export.test.js`, `tests/e2e/submission.spec.js`. Implements P-035, AC-13.1.1, AC-13.1.3.

  Reported: "i tried it with a four bar measure i have and it says it's too large to pre-fill? why? is this some limit you imposed or some technical constraint?"

  Both, and the limit was not the problem. `MAX_URL_LENGTH` is 8,000 against GitHub's ~8,192-character request-URI cap (AC-13.1.3) — a real constraint, not an invented one. But T169 serialized the payload with `JSON.stringify(shape, null, 2)`, and indentation that is nearly free in a file is ruinous in a URL: every newline and space costs three characters once percent-encoded, and each Slot is its own object. The reported Pattern is **1,657 characters of music, 5,353 pretty-printed, and 14,281 encoded** — so the formatting, not the Pattern, spent the budget.

  Compact now. The same Pattern is 3,193 characters of URL, and every 4/4 Pattern fits at the full 8-Measure cap.

  **This was a bug against AC-13.1.1, not a case for AC-13.1.3.** AC-13.1.1 puts no size caveat on submitting a single Pattern; the caveat is AC-13.1.3's and its Given is explicitly *a bulk submission*. An ordinary single Pattern reaching the fallback is the code failing AC-13.1.1, so it was fixed in the code with no spec change (§2, §2a).

  **The fallback still fires at the extreme end, and that is genuine.** 8 Measures of 12/8 at Straight 16ths is 192 Slots — 6,515 characters compact, 11,867 encoded — and the same Pattern in Melodic mode with every Slot pitched is 16,507 compact, 29,167 encoded. No formatting choice fits 29KB into an 8KB URL; that is what AC-13.1.3's clipboard path exists for. Measured breakpoints, single Pattern: **4/4 at any Recipe, all 8 Measures**; 12/8 Straight 16ths, **5 Measures**; Melodic 4/4 Straight 16ths with every Slot sounding, **4 Measures**.

  A claim made to the maintainer mid-report — that no Pattern the app can represent would exceed the limit once compacted — was wrong, and is corrected above. It came from measuring 8 Measures of 4/4 (128 Slots) rather than the densest Pattern the app supports (192).

- [X] T173 **[spec defect]** Compress a submission that will not fit readably, instead of asking the Contributor to paste it — `specs/001-rhythm-master-mvp/spec.md` (AC-13.1.3 revised, Cases renumbered to three; AC-13.1.2 amended), `src/export/submit.js`, `src/ui/dialogs.js`, `src/main.js`. Implements P-035, AC-13.1.2, AC-13.1.3.

  Asked for after T172: *"if it's still not able to accommodate a reasonable pattern size then how about we use base64 encoding?"*

  **Base64 alone does not work, and was measured rather than assumed.** It is 4/3 the size of the raw bytes and only wins by avoiding percent-encoding — about 26%. The densest Pattern the app can represent goes 11,515 → 8,533, still over the 8,000 limit, and its Melodic equivalent 25,359 → 19,296. It would have failed at exactly the Patterns that were already failing, while making every submission unreadable.

  **Compression is what does it**, with base64url as the transport. The payload is enormously repetitive — a Recipe id per Beat, most Slots the same four bytes — so gzip takes the two worst cases to 798 and 912 characters of URL. `CompressionStream` is a platform API, so this costs no dependency (Principle V).

  **Three tiers now, and the middle one is new** (AC-13.1.3, revised): readable JSON when it fits, compressed when it does not, title-and-label-only when even compressed will not. The old two-tier criterion made the manual paste the answer to *merely dense*, when it is the one step in the flow a Contributor can silently get wrong. Readability is kept where it is free — after T172 that is every 4/4 Pattern at the full 8-Measure cap.

  **The compressed block decodes to exactly the readable body**, byte for byte, not to some second representation. So anything reading a submission has one shape to understand: decompress if the marker is there, then parse the same Markdown either way — which is what keeps `pattern-intake` a single parser rather than a fork. `readSubmissionBody` and `readSubmittedPatterns` are exported for that reason and asserted round-trip.

  `buildSubmission` is now async, since `CompressionStream` is. Callers and their tests follow; `export/` is not bound by the `core/` purity rule, and the alternative — a synchronous deflate — would have meant a runtime dependency.

  The dialog says plainly when a submission was compressed. An issue that looks like a wall of characters, unexplained, would reasonably read as something having gone wrong.

- [X] T174 **[spec defect]** Tests for T173 — `tests/unit/export/export.test.js`, `tests/e2e/submission.spec.js`. Covers AC-13.1.2, AC-13.1.3/1–/3.

  AC-13.1.3/1's old test — 40 Patterns falling back to a title-only link — now proves the compressed tier instead, because that batch compresses. It was rewritten to the revised criterion rather than retitled: it asserts the URL still carries a body, that the block decodes to the readable body byte for byte, and that all 40 Patterns survive.

  **AC-13.1.3/3 needed a batch that defeats compression, which took measuring.** Repetition is what gzip eats, so more of the same Pattern does not help; only real entropy in the music does. 80 four-Measure Patterns of pseudo-random accents still compress to 7,489. The unit test uses 80 of them at four Measures with a seeded PRNG, and the e2e 160 at eight Measures — both sized from a measured breakpoint, both noted in the test so the next person does not have to rediscover it.

- [X] T175 **[new capability]** `pattern-intake` skill — review submitted Patterns and add the good ones — `.claude/skills/pattern-intake/SKILL.md`, `.claude/skills/pattern-intake/lib/decode.mjs`, `.claude/skills/pattern-intake/lib/render.mjs`, `.claude/skills/pattern-intake/lib/seed.mjs`, `.claude/skills/pattern-intake/pattern-intake.mjs`, `.claude/skills/pattern-intake/tests/pattern-intake.test.js`.

  Asked for alongside T173: *"you need to also write a skill that allows me to review and add submitted patterns via here … you can present it to me in a readable format even if it was base64 encoded."* T173 makes that a requirement rather than a convenience — a compressed submission cannot be read at all without something that decodes it.

  **No AC and no spec pass.** This is maintainer tooling, like `spec-trace`, not app behaviour: it runs from the repository, never ships, and US-13.1 says nothing about how a submission is reviewed. Its own tests live beside it and run under `npm test`, which is the `spec-trace` precedent.

  **It imports the app rather than reimplementing it**, and that is the opposite choice from `spec-trace`, deliberately. `spec-trace` is dependency-free so it can be copied into other projects; this skill exists to serve *this* format, so `lib/decode.mjs` imports `src/export/submit.js` and `lib/render.mjs` reads Accent Levels through `src/core/accents.js`. One implementation of the wire format cannot drift from itself, and the grid shown is what will actually sound (Principle I).

  **Appended, never inserted, enforced in code.** `lib/seed.mjs` will only write at the end of `data/seed-patterns.json`, because shipped ids are positional and inserting renumbers every later Pattern — orphaning the ratings and added Tags that `rm.overlays.v1` keys by id. A name already in the library is refused case-insensitively unless forced, as are two Patterns in one batch sharing a name.

  **`accept` does not validate its own write.** It appends and stops, and tells you to run `npm run validate:seed`. A tool that blesses its own output is a gate that proves nothing. It also never commits, pushes or opens a PR — landing a change is §5's business and includes a task entry and the full gate run.

- [X] T176 **[bug]** Submissions arrive unlabelled, so intake cannot see them — `.claude/skills/pattern-intake/lib/select.mjs`, `.claude/skills/pattern-intake/pattern-intake.mjs`, `.claude/skills/pattern-intake/SKILL.md`, `.claude/skills/pattern-intake/tests/pattern-intake.test.js`. Covers AC-13.1.1/1.

  The first real submission — issue #32, "Another One Bites the Dust bass groove" — was invisible to `pattern-intake list`, which reported "No open issues labelled `new-pattern`" while the Pattern sat there perfectly readable.

  **The app was right; the repo was misconfigured.** `buildSubmission` puts `&labels=new-pattern` in the URL exactly as AC-13.1.1/1 requires. But GitHub applies a label from a prefilled issue URL only if that label already exists in the repo — and it did not. GitHub does not create it and does not complain: it drops the parameter, and the issue lands bare. **No AC changed and no code in `src/` changed**, because neither was wrong.

  **The label now exists**, created once with `gh label create new-pattern`, and #32 has been labelled. That alone is the fix for the reported symptom: a Contributor now has to do nothing but press "Submit new issue".

  **But the failure was silent, and that is the part worth engineering against.** The symptom of a missing label is an empty list, which is indistinguishable from nobody having submitted — and no gate can see a repo's label list. So `list` no longer trusts the label alone: it also matches the title shapes `buildIssueTitle` builds, marks anything found that way `[unlabelled]` with the command to fix it, and says outright when the repo has no such label. The title matchers are asserted against real `buildIssueTitle` output, since they are the one place the skill re-expresses a format `src/export/submit.js` owns.

  **`gh issue list --label` is not evidence that an issue is labelled.** Found while testing this: that query is served by GitHub's search index, which lags — strip a label and it keeps returning the issue for a while. So `unlabelled` is read off the issue's own `labels`, never off which query returned it. Trusting the query would have reported a bare issue as labelled and hidden the exact misconfiguration the fallback exists to surface.

- [X] T177 **[new capability]** `pattern-intake close` — tell the Contributor their Pattern shipped, and only when it has — `.claude/skills/pattern-intake/lib/landed.mjs`, `.claude/skills/pattern-intake/lib/seed.mjs`, `.claude/skills/pattern-intake/pattern-intake.mjs`, `.claude/skills/pattern-intake/SKILL.md`, `.claude/skills/pattern-intake/tests/pattern-intake.test.js`.

  Asked for after T176: *"let's close it out and add a comment that the pattern was added to the library."* Nothing closed a submission before, so an accepted Pattern's issue stayed open for ever and the Contributor was never told.

  **No AC and no spec pass.** Maintainer tooling, like `spec-trace` and the rest of this skill — it runs from the repository and never ships. US-13.1 says nothing about what happens to an issue after review.

  **It runs at merge, not at accept, and it checks before it claims.** "Accepted" is not "shipped": `accept` leaves an uncommitted seed file, and between that and the deploy going green sit a PR and eight gates, any of which can send the change back. So `close` reads `data/seed-patterns.json` from the **default branch** — the live site (§5) — and refuses if any Pattern the issue carries is not there. An issue closed against a change that never landed tells a Contributor their Pattern is in the library when it is not, and nothing would ever correct it. Verified against the real #32, which is not accepted: it refuses.

  **The comment names the id, not just the name.** The id is the durable handle — a name can be tidied later, an id cannot change without orphaning every rating and added Tag that `rm.overlays.v1` keys off it.

  **It closes, and never deletes.** The issue is the record of what a Contributor sent and what was decided, including the case where the write is wrong and `validate:seed` sends it back — and a deleted issue leaves nothing to revert to.

  **Also fixed: an append was rewriting lines it did not add.** Found on a dry run against #32 — `appendPatterns` wrote with a plain `JSON.stringify`, which emits literal non-ASCII where the shipped file uses `\uXXXX` escapes, so appending one Pattern also rewrote 13 existing em-dashed names. The values were identical and the diff was still wrong: "appended, never inserted" is a rule a reviewer has to be able to *see* holding, and a real mistake hides easily in fourteen lines of noise. The write now matches the file's own convention; the append is 203 insertions and 0 deletions. The test fixture was writing in the wrong convention too, which is why it could not have caught this — a fixture unlike the real file proves nothing about rewriting it.

- [X] T178 **[data]** Ship the submitted *Another One Bites the Dust* bassline as a Melodic companion to the percussive entry — `data/seed-patterns.json` (1 Pattern appended, `s_208`).

  The first Pattern to arrive through the app's Submit button and land in the library. Issue #32, from `thinkfast37`, decoded and rendered with `pattern-intake show`.

  **It is not a new rhythm — it is the missing half of one already shipped.** The onsets are identical, note for note, to `Another One Bites the Dust - Queen` (percussive, `s_68`). What the submission adds is *pitch*: the riff in relative E minor against a Key of G — E E E · E │ E E G E A · · E D — and 104 BPM, which is nearer the record than the shipped 80. Surfaced to the maintainer before anything was written, since a tool cannot tell a duplicate from a companion; `Djembe 1`/`Djembe 2` is the existing precedent for the pair.

  **Renamed on the maintainer's call, to `Another One Bites the Dust — Bass`.** The submitted name carried `- melodic`, restating the Sound Mode the UI already shows, and `- Queen`, which the percussive twin already holds. `Fascination Street — Bass` and `The Lovecats - Bass` are the house convention for exactly this. Only the name changed: a Contributor's *music* is never edited here — if a rhythm is wrong they are asked to resubmit, because an edit made at intake ships music nobody played.

  **The append is 203 insertions and 0 deletions.** Ids are positional (`s_${index + 1}`), so anything but an append renumbers every later Pattern and orphans the ratings and added Tags `rm.overlays.v1` keys by id.

  **`pattern-intake close` cannot close #32, and that is correct behaviour, not a bug.** It matches an issue to the library by name, and this Pattern shipped under a different one — so it refuses rather than guessing. The closing comment was posted by hand, naming `s_208`, only after the deploy went green.
- [X] T179 **[spec defect]** Two stale ACs corrected, and US-1.4's HIGH traceability gaps closed — `specs/001-rhythm-master-mvp/spec.md`, `tests/e2e/grid.spec.js`. Revises AC-1.1.5 and AC-1.4.2; covers AC-1.1.5/1, AC-1.1.5/2, AC-1.4.1, AC-1.4.2.

  Found while triaging the 77 `check:trace` HIGH findings, before writing any test for them. Both ACs described something that was never built, and both were reporting as covered.

  **AC-1.1.5 said any Measure's meter change prompts apply-to-all; the code has always gated that prompt on the first Measure** (`main.js:279`). The maintainer settled it as a spec defect: only the first Measure meaningfully stands for the whole Pattern, and prompting on each of up to eight Measures nags without informing. The AC now says so, and gained Cases — adding the "any other Measure" clause made it compound, which `T4` caught immediately.

  **AC-1.4.2's title said 10 while its body listed eleven** and `TIME_SIGNATURES` held eleven; 1/4 was added without the title following. Not merely untidy: `T5` matches a test name against the AC *title*, so a verbatim-named test would have claimed ten while proving eleven.

  **The four tests are e2e because all four criteria are UI-level.** The two that previously named AC-1.4.1 and AC-1.4.2 proved neither — one duplicated AC-1.4.1's subject, the other asserted beat counts that AC-1.2.2 already covers — so they were rewritten to the criteria rather than retitled.

  **The first drafts failed, and the tests were wrong, not the code.** They assumed the editor opens on a blank 4/4 Pattern; it opens on a shipped one, so the first click hit US-7.3's naming guard and the meter picker never opened. Fixed by starting from `loadBlank('4/4')`, which hands back an owned Pattern.

- [X] T180 **[data]** README: document every guardrail, and what none of them catch — `README.md`. No AC; documentation only.

  Asked for directly: *"how did you miss all this when we originally built it and how do we avoid it again? do we have all the guardrails in place? if so, can you add all the guardrails in place into the readme."*

  **The honest answer is that the guardrails are in place and were muted.** `T6 AC-1.1.8` and `T6 AC-1.1.9` — the −Measure control's criteria, flagged as UI-level with only a pure unit test — are in `traceability-baseline.json` right now. The check fired correctly when it was introduced; the baseline exists so the gate is not permanently red, and the finding has been sitting in it since.

  So the new section leads with the nine checks and then states the three holes plainly: the baseline mutes 296 findings, nothing detects code that is built but never wired, and `coverage:ac` at 100% cannot tell a test *of* an AC from a test merely *named* for one. A guardrail list that reads as complete is worse than no list.

  **Stale facts corrected while in there**: 333 findings → the matrix is now the source; "211 acceptance criteria" → 232; "the next step is `/speckit-tasks`" (untrue since the MVP shipped); and a `CHROMIUM_PATH` that pointed at a container path which does not exist on the maintainer's machine, wrongly implying e2e needs setup locally.

- [X] T181 **[new capability]** `check:unwired` — a gate for code the application cannot reach — `tools/check-unwired.mjs`, `tools/unwired-baseline.json`, `tests/unit/tools/unwired.test.js`, `package.json`, `.github/workflows/deploy.yml`, `README.md`, `CLAUDE.md`. No AC: maintainer tooling, like `spec-trace` (T175 precedent).

  Asked for after the README guardrail audit named it as the one hole with no check at all: *"do we have all the guardrails in place?"* — we did not.

  **The failure it exists for.** `removeMeasure` was specified (AC-1.1.8, AC-1.1.9), written, exported, unit-tested, and called by nothing outside `core/` for the whole life of the project, while every gate stayed green. `coverage:ac` saw an AC ID in a test name; `lint` guards the direction `core/` must not import, never whether anything imports back; `check:trace` T6 flagged it and the finding went into the baseline.

  **The rule is deliberately narrow**: a finding is an export that nothing anywhere in `src/` mentions. A helper used by its own module is wired. Three earlier formulations were measured and thrown away first — "unreferenced outside `core/`" flagged 33, "unreferenced outside its own module" flagged 67, both mostly legitimate internals. A gate that cries wolf gets switched off.

  **Tests are not uses**, because an export whose only consumer is a test is precisely the shape being hunted. Genuine test seams are baselined with a written reason, and the checker's own tests fail a reason shorter than 30 characters — which caught a lazy "OUTSTANDING, as above." on the first run.

  **18 findings baselined**, each with a reason distinguishing a permanent test seam from outstanding work. Two are real and named as such: `removeMeasure`, and `familyGroups` — US-11.2's Family panel, specified and never built, already known as T147 and found here independently, which is the point.

  **What it cannot see, stated in the docs rather than left to be discovered**: partial reachability. The Recipe and Swing controls are wired to Measure 1, Beat 1 only; every export involved is used, so nothing flags them.

- [X] T182 **[new capability]** Recipe strip: arm a Recipe, paint it onto any Beat — `src/ui/controls.js`, `src/ui/grid.js`, `src/main.js`, `src/styles/tokens.css`. Implements AC-1.3.11 and makes AC-1.3.4, AC-1.3.5, AC-1.3.6 reachable on every Beat.

- [X] T183 **[new capability]** Tests for T182 — `tests/e2e/grid.spec.js`, `tests/e2e/remaining.spec.js`, `tests/e2e/responsive.spec.js`. Covers AC-1.3.11/1–/4, AC-1.3.4, AC-1.3.5, AC-15.1.8.

  **The maintainer designed this one.** Asked how a Beat should expose its Recipe picker, the answer was to mirror the pitch strip — *"with the recipe picker you could just click anywhere within the beat"* — and, on whether to label each Beat with its Recipe, *"won't it be apparent from the cells that are displayed?"* Both were right, and the second removes the whole vertical cost a per-Beat label would have added.

  **AC-1.3.4 and AC-1.3.5 had to be revised first.** Both described a per-Beat *menu* offering exactly N Recipes. A single armed strip has no per-Beat menu to scope, and a Pattern mixing 4/4 and 6/8 necessarily shows Recipes some visible Beats cannot take. They now say which Recipes *apply* to a Beat and that the rest are inert on it — the same musical guarantee, stated for the interaction that exists.

  **AC-15.1.8 had to be revised too**, and that was not foreseen: it pins the main panel's section order, and adding a section broke its test. The strip sits below the play controls and above the pitch strip — a palette belongs with the other palette, and the always-present one precedes the Melodic-only one, so nothing above it moves.

  **The mode has a real cost, and the tests found it the way a user would.** While a Recipe is armed, a tap in the grid paints a Beat instead of cycling a Slot's accent — so three existing tests broke by clicking a Slot while still armed. That is the interaction working as designed, not a defect, but it is why the strip states in words what a tap will do and why tapping the armed chip disarms it (AC-1.3.11/4).

- [X] T184 **[new capability]** One cell size across Patterns — `specs/001-rhythm-master-mvp/spec.md`, `specs/001-rhythm-master-mvp/plan.md`, `src/styles/tokens.css`, `src/ui/beat-layout.js`. Implements AC-15.2.7/1–/5; also fixes AC-15.2.6/1 in a mixed-Recipe Measure. Extends P-038.

- [X] T185 **[new capability]** Tests for T184 — `tests/e2e/grid.spec.js`, `tests/unit/ui/beat-layout.test.js`. Covers AC-15.2.7/1–/5, and AC-15.2.6/1 in a mixed-Recipe Measure.

  Asked for directly: *"the size of the cells varies wildly based on when the pattern is loaded — for a 1 beat pattern the cells are ridiculously huge; if I add a measure the second measure is also huge; overall they are too big. In takadimi_app the size of the cells was good and it was consistent."*

  **Why they varied.** The Beat tracks were `1fr` — they shared the line — and a cell then took its share of the line as its width, and (AC-15.2.6) that width as its height. At 1400px with the library collapsed a 4/4 Straight-16ths cell was 73×73 in Percussive and 73×100 in Melodic; a one-Beat Pattern's cell was 330px square. Takadimi's cells were a fixed 44px and never grew.

  **The fix keeps the equal-width tracks and caps their container.** `beat-layout.js` already probed each Measure's *minimum* Beat width to choose a column count; it now runs a second probe at the *preferred* width — every Slot pinned to `--slot-size` (44px), or its own content where that is wider — and writes `columns × preferred + gaps` to `--beats-max`, which `.beats` takes as `max-width`. The `1fr` tracks share the capped width, so AC-15.1.14/1's one-Beat-width holds; where the line is narrower than the cap the cap does nothing, so the dense case (AC-15.1.10, AC-15.1.14/2, AC-15.2.6/2) is byte-for-byte what it was. A short line's spare room now stays spare, and the Beats sit at its start.

  **A twelve-Beat 8ths Measure at 1400px is 41px, not 44.** Twelve 93px Beats need 1358px and the line offers 1290, so the cells shrink rather than wrap — the AC's third clause, and the better reading of a 12/8 bar. Case /1 says "wide enough to hold all three at that size" for that reason and its test runs at 1600.

  **AC-15.2.6/1 was not true in a mixed-Recipe Measure.** An 8th-note cell beside 16ths is twice their width and so twice their height, and flex's default stretch pulled every 16th-note cell on the row up to it: 44×93. `.beat` and `.group` now top-align, and a qualifier test proves it — the old giant sizes had hidden it, not fixed it.

  **Two existing tests changed, both because they encoded fill-the-line, not because they were failing on a defect (§2a).** *AC-3.1.17/4* built its "wide cell" from a uniform 8ths Measure, which was wide only because cells filled the line; the wide cell the criterion is about now arises in a mixed-Recipe Measure (AC-15.1.14), so that is what it builds — the assertions are unchanged. *AC-15.1.14/5* read the re-balanced widths after polling the overflow, which is satisfied before the ResizeObserver runs as well as after; it passed only because fill-the-line tracks changed width the moment the container did. It now polls for the width change, as its own two resize cases already did.

  **AC-15.1.14/4 clarified in place**: "still share the width" means one shared width on the line, which they still have; it never required filling it. Case titles unchanged, so T5 is undisturbed.

- [X] T186 **[new capability]** A content column, and a Measure box that hugs its Beats — `specs/001-rhythm-master-mvp/spec.md`, `specs/001-rhythm-master-mvp/plan.md`, `src/styles/tokens.css`. Implements AC-15.2.8/1–/4. Extends P-038.

- [X] T187 **[new capability]** Tests for T186 — `tests/e2e/grid.spec.js`. Covers AC-15.2.8/1–/4.

  Asked for directly, on seeing T184 live: *"each section including the pattern cells has a very wide box it's in that looks awkward. What do you recommend?"* — and the recommendation was taken as given: one left-aligned content column for the panel, the Measure box hugging its Beats, and the Subdivision strip left-aligned instead of centred.

  **The column is 1120px**, so the common Patterns still fit one line inside it (a 4/4 Straight-16ths Measure is 830px of Beats). Left-aligned, not centred, so the grid does not move when the library toggles. Below that width nothing changes.

  **`.beats` now declares its width rather than only its ceiling.** With the Measure box at `fit-content`, a grid of `1fr` tracks has no intrinsic width worth hugging — measured, the box shrank to the Slots' 38px minimums. `--beats-max` is therefore `width`, with `flex-shrink` and `min-width: 0` letting a narrower Measure squeeze it exactly as before; the two probes lift it the same way they lifted the cap. Nothing observable changes on a phone or a dense bar, and every AC-15.2.7 test still passes unchanged.

  **Two existing tests changed (§2a), both for encoding the unbounded panel rather than for a defect.** *AC-15.2.7/4* measured the line's spare room against the Measure box, which now hugs its Beats; it measures against the grid's content edge, where the room actually is — the criterion's own claims (Beats at the start, no cell above 44px) are unchanged. *AC-15.1.14/5*'s library-toggle scenario ran at 1400px, where the column now bounds the grid to 1120px whether or not the library is open, so the toggle re-balanced to the same answer and proved nothing; it runs at a 1000px tablet, where the column is a quarter of the window and a 12/8 Measure goes from two lines of six to one of twelve. `beat-layout.js` also holds the Measure box at full width while probing (`.measure.measuring`), since "available" otherwise read as however wide the hugging box was last time.

- [X] T188 **[data]** Rename the 97 book-transcribed exercises and retag them — `data/seed-patterns.json`. Touches no AC; ids unchanged (renamed in place, US-5.3 overlays keyed by id are unaffected).

  Asked for directly: *"they are all tagged with WR Book. I would like to rename those to exercises. also the current rhythm names are the actual exercise numbers in the book. i don't want to use those because of potential intellectual property and copyright claims … assign more descriptive names to the rhythms as well as additional tags such as beginner, intermediate, advanced."*

  **`WR Book` → `Exercises`** (as asked; first landed as the singular `Exercise` to match `Song`, corrected the same day — the maintainer wanted the word they used). Every `WR n-x` name — a direct index into the book — becomes `<Family> — <what distinguishes it>` in the em-dash form the library already uses (*Paradise — Intro*), e.g. `WR 9-G` → *Offbeat Eighths — Upbeat Drifting Earlier*. All 97 unique, clashing with nothing.

  **Tags added, per Pattern:** a level — `Beginner` (34: quarter-note lines and the first eighth pairs), `Intermediate` (45: eighths mixed with quarters and rests, mixed meter, upbeat-of-two lines), `Advanced` (18: offbeat eighths and dense syncopation) — chosen by the material each group teaches, so a borderline call is arguable in one place; a material tag, `Quarter Notes` (26) / `Eighth Notes` (78) / `Offbeats` (31); and a meter tag where it applies, `2/4` (28, wholly in two) and `Mixed Meter` (12, the 2/4 ↔ 4/4 lines). Nothing here is an automatic Tag (data-model §4).

  T164/T165's log entries above keep the old names as the historical record of what was transcribed and what was skipped.

- [X] T189 **[infrastructure]** Stamp every deployed build with a legible version — `vite.config.js` (a `build-stamp` plugin injecting `<meta name="build-version" content="YYYY-MM-DD HH:MM:SS UTC (commit)">` into `index.html` at build time), `CLAUDE.md` §6 (the rule). Touches no AC and renders nothing on screen; view-source on the live site shows which build is running. Asked for across all the maintainer's repos: *"every time I merge and deploy, there should be like a version number in the app … it could be a timestamp … not necessarily displayed, but it should be in the source code"* (2026-08-18).

- [X] T190 **[governance]** Constitution 4.0.0 and the research decisions for a store build — `.specify/memory/constitution.md` (Principle V: a native shell around the identical web build, store billing as the one permitted native SDK, the paywall rules), `specs/001-rhythm-master-mvp/research.md` (D-001 and D-008 amended; D-009 Capacitor shell; D-010 store billing, the trial as the subscription's introductory offer, `rm.monthly` / `rm.lifetime`), `specs/001-rhythm-master-mvp/spec.md` (US-17.1, AC-17.1.1–AC-17.1.9), `specs/001-rhythm-master-mvp/plan.md` (P-039), `CLAUDE.md` §6. Implements P-039 (spec side).

  Asked for directly (2026-08-18): *"I want to create a version of this app that can be hosted on the apple and android app stores. i would also like to allow for monthly subscription pricing and outright purchase, along with a 3 day free trial. so a person may use the app for 3 days, subscribe for a few months and then decide to buy it."* Surfaced as a Governance + Approach + New-capability spill and approved before code; the web build stays free (*"I want the web version to keep working … but i may not host always on github pages"*).

- [X] T191 **[new capability]** Pure entitlement — `src/core/entitlement.js` (`PRODUCTS`, `deriveEntitlement(purchases, now)` → `{ level: none|trial|subscribed|lifetime, until }`). Implements AC-17.1.1. Extends P-039.

- [X] T192 **[new capability]** Store adapters and the composition root — `src/billing/index.js` (adapter selection: native inside the shell, `fake` under `?billing=fake`, otherwise web), `src/billing/native.js` (`@capgo/native-purchases`), `src/billing/web.js` (always `lifetime`, no products), `src/billing/fake.js` (scripted from `window.__rmFakeStore`), `src/main.js` (gate the app on entitlement; Purchases control in the header inside the store build). Implements AC-17.1.3–AC-17.1.6, AC-17.1.8, AC-17.1.9. Extends P-039.

- [X] T193 **[new capability]** The paywall, the Purchases dialog, the legal pages and the shell — `src/ui/paywall.js`, `src/styles/tokens.css`, `terms.html`, `privacy.html`, `vite.config.js` (multi-page build so the legal pages ship in `dist/`), `capacitor.config.json`, `package.json` (Capacitor 8, `@capgo/native-purchases`; `cap:sync` script), `ios/`, `android/` (generated by `npx cap add`), `.github/workflows/deploy.yml` (`npx cap sync` in verify), `docs/app-store-setup.md` (App Store Connect and Play Console steps, products, trial offer, testing, upload). Implements AC-17.1.2, AC-17.1.7. Extends P-039.

- [X] T194 **[test]** Unit tests for entitlement — `tests/unit/core/entitlement.test.js`. Covers AC-17.1.1/1–AC-17.1.1/5, and (source-level) AC-17.1.9/2. Extends P-039.

- [X] T195 **[test]** e2e tests for the paywall and the Purchases dialog against the fake store — `tests/e2e/paywall.spec.js`. Covers AC-17.1.2–AC-17.1.8, AC-17.1.9/1, AC-17.1.9/2 (which scripts the served page loads). Extends P-039.

- [ ] T196 **[follow-up]** Back `storage/keyValue.js` with the native Preferences plugin inside the shell — `src/storage/keyValue.js`, `src/billing/`-style platform switch. iOS may evict WKWebView `localStorage` under storage pressure (D-009, consequences), which is where a paying Musician's own Patterns live. Not part of T190–T195: a storage change is one the maintainer should choose knowingly (CLAUDE.md §5, "cannot be undone by a follow-up commit").

- [ ] T197 **[follow-up]** App icons and splash for the shells — `resources/icon.png` (1024×1024) → `npx @capacitor/assets generate`; replaces Capacitor's placeholder icon in `ios/App/App/Assets.xcassets` and `android/app/src/main/res/mipmap-*`. Both stores reject the placeholder; needs artwork from the maintainer.
