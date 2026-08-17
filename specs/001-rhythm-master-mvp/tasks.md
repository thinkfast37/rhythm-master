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

- [X] T147 **[governance]** Replace the "an AC ID appears in a test name" gate with one that checks the whole traceability chain — `.specify/memory/constitution.md` (v3.1.0 → v3.2.0), `CLAUDE.md` §2a and §2b (new; §2a's rule also referenced from the §2 triage table), `specs/001-rhythm-master-mvp/plan.md` (new Traceability Matrix, Constitution Check now PARTIAL), the traceability checker — created here under `tools/`, and moved by T154 to `.claude/skills/spec-trace/spec-trace.mjs`, which is where it lives now — `specs/001-rhythm-master-mvp/traceability-baseline.json` (new), `package.json`, `.github/workflows/deploy.yml`.

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

- [X] T156 **[governance]** Report coverage as well as gaps, rank gaps by severity, admit a narrow waiver, and stop the change matrix over-reporting — `.specify/memory/constitution.md` (v3.3.0 → v3.4.0), `CLAUDE.md` §2b, `.claude/skills/spec-trace/lib/matrix.mjs`, `.claude/skills/spec-trace/lib/project.mjs`, `.claude/skills/spec-trace/lib/analyse.mjs`, `.claude/skills/spec-trace/lib/config.mjs`, `.claude/skills/spec-trace/spec-trace.mjs`, `.claude/skills/spec-trace/tests/spec-trace.test.js`, `.claude/skills/spec-trace/SKILL.md`, `.claude/skills/spec-trace/README.md`, `specs/001-rhythm-master-mvp/traceability-waivers.json` (new).

  **The change matrix was over-reporting to the point of uselessness.** T148's PR reported 167 criteria across 28 User Stories for a change that really touched fourteen: `src/main.js` is named by dozens of tasks, so touching it fans out through every plan item that claims it. The "over-report rather than under-report" rule was right in principle and unusable in practice — a 169-row table is not a review aid. Rows are now split by how the criterion was reached: **direct** (a test naming that criterion changed in the diff) is listed in full, **indirect** (the change touched a file some task mentions) collapses to a count behind a disclosure, labelled as a blast radius rather than a finding.

  **The matrix reported gaps but not coverage**, so it could not answer whether the work was fit to ship — and it summed a test proving the wrong thing together with a test having an untidy name into a single meaningless number. It now reports the proportion proven, overall and per User Story, and ranks every gap CRITICAL / HIGH / MEDIUM / LOW.

  Severity is **derived from the kind of gap, never assigned per criterion**. An assigned severity is a judgement made under whatever pressure applied at the time and gets revised downward by whoever is in a hurry; a derived one cannot be argued with. The ladder is the one this audit produced: MISNAMED never hid anything, WRONG TEST hid two entire User Stories.

  **The waiver is the risky part and is deliberately narrow.** A LOW or MEDIUM gap may be signed off with a written reason, kept in its own file — separate from the baseline, because debt still owed and a decision not to pay it are different things — and shown in the matrix row so it is argued for in review rather than merely recorded. CRITICAL and HIGH may not be waived by anyone for any reason, and that prohibition is now a NON-NEGOTIABLE clause: those are exactly the states in which US-2.2's pitch strip and US-11.1/US-11.2's views sat while reporting as complete. New check **T9** fails a waiver that reaches above MEDIUM, names an undeclared criterion, carries no real reason, or covers a gap that has since been fixed — so the file cannot rot into a blanket pass.

  Twelve new self-tests, including one asserting that no severity outside LOW/MEDIUM is waivable, so the prohibition is enforced by the suite and not only by the prose.

- [ ] T149 **[bug]** Re-point the 83 criteria whose test proves something else, then confirm what each AC actually claims is tested at all. Grouped by the file the mislabelled test lives in: `library.spec.js` (11), `counting.test.js` (9), `seed.test.js` (9), `similarity.test.js` (8), `pattern.test.js` (6), `storage.test.js` (6), `operations.spec.js` (6), `ui/library.test.js` (5), `grid.spec.js` (4), `playback.spec.js` (4), `export.test.js` (4), `remaining.spec.js` (3), `melodic.spec.js` (3), `swing.test.js` (3), and one each in `pitch.test.js`, `responsive.spec.js`, `accents.test.js`, `timeline.test.js`. The runs are contiguous — AC-5.6.6–AC-5.6.11, AC-16.1.3–AC-16.1.11 — which is the signature of ACs being inserted and the spec renumbered while test names stayed put. The old gate's orphan check was a warning, so an ID that slid onto a *different real* AC was invisible. **Each one is two questions, in this order: is the AC's own claim proved anywhere? Only then, what should the test be called?** Renaming first would bury exactly the kind of gap T148 turned out to be. Per Constitution Principle IV, where an AC turns out to be untested the fix is a test, never a softened AC.

- [ ] T150 **[bug]** Give the 20 remaining UI-level criteria a test that can reach the DOM — US-1.1 (AC-1.1.2, AC-1.1.4, AC-1.1.8, AC-1.1.9 — ~~AC-1.1.3~~ done by T157), US-1.3 (AC-1.3.5), US-3.1 (AC-3.1.12, AC-3.1.13), US-4.4 (AC-4.4.2, AC-4.4.3), US-5.6 (AC-5.6.1, AC-5.6.3, AC-5.6.11), US-11.1 (AC-11.1.3–AC-11.1.5), US-11.2 (AC-11.2.4, AC-11.2.5), US-11.3 (AC-11.3.2), US-13.1 (AC-13.1.3), US-16.1 (AC-16.1.2). Each names a control, menu, prompt, panel, or gesture and is currently proved only by a pure unit test. Several are the *same* gap as T148 seen from the other side: a disabled `+Measure` button (AC-1.1.3), a Recipe menu's contents (AC-1.3.5), the absence of a swing control on a triplet group (AC-4.4.3) — none of these can be observed from `src/core/`. Expect some to turn out unbuilt.

- [ ] T151 **[spec defect]** Decompose the 61 compound ACs into numbered Cases (`AC-x.y.z/1`, `/2`, …), one assertion each, and give each Case its own test. Heaviest: US-15.1 (9), US-2.2 (8), US-1.4 (6), US-5.3 (6), US-1.2 (4), US-1.3 (4), US-16.1 (4), US-13.1 (3). AC-1.2.2 and AC-3.1.2 are 12-row tables currently proved by one test each — twelve claims, one demonstration. No AC is renumbered: Cases are additive, and renumbering is precisely what caused T149.

- [ ] T152 **[docs]** Correct the 129 criteria whose test is right but named in its own words rather than the spec's, so T5 passes verbatim. Clerical, and strictly *after* T149 — a rename pass run first would make the mislabelled tests look settled. Also correct the 37 file paths named by checked-off MVP tasks that do not exist (`tests/e2e/us-1-1.spec.js` and 32 siblings, from the consolidation into eight suites; plus `src/audio/piano.js` and `tools/fetch-soundfont.js`, removed by T126). A task log that names files which were never written is not a record.

- [X] T154 **[governance]** Make the traceability chain a reviewable document, test the checker, and make the whole thing portable — `.specify/memory/constitution.md` (v3.2.0 → v3.3.0), `CLAUDE.md` §2b and §4–§5, `.claude/skills/spec-trace/SKILL.md`, `.claude/skills/spec-trace/README.md`, `.claude/skills/spec-trace/spec-trace.mjs`, `.claude/skills/spec-trace/lib/config.mjs`, `.claude/skills/spec-trace/lib/parse.mjs`, `.claude/skills/spec-trace/lib/analyse.mjs`, `.claude/skills/spec-trace/lib/matrix.mjs`, `.claude/skills/spec-trace/lib/project.mjs`, `.claude/skills/spec-trace/hooks/stop-notify.mjs`, `.claude/skills/spec-trace/tests/spec-trace.test.js`, `.claude/settings.json`, `spec-trace.config.json`, `specs/001-rhythm-master-mvp/traceability-matrix.md`, `package.json`, `vitest.config.js`, `.github/workflows/deploy.yml`.

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
