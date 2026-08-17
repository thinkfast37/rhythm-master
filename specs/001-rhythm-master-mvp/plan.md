# Implementation Plan: Rhythm Master MVP

**Branch**: `main` (spec lives at `specs/001-rhythm-master-mvp/`) | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-rhythm-master-mvp/spec.md`

## Summary

Rhythm Master is a single-page, client-side rhythm and melody practice tool. A musician builds
Patterns from Measures that each carry their own Time Signature, subdivides each Beat via a fixed
menu of Recipes (including two mixed-feel splits), assigns per-Slot accents and — in Melodic mode —
explicit scale degrees and octaves, then drills the result against a metronome with count-in and
per-group swing. Patterns live in a searchable, taggable, rateable local library seeded with 112
converted Patterns.

The technical approach is a **vanilla ES-module app built with Vite**, organised around a pure
`core/` layer that owns every musical calculation and a thin `ui/` layer that renders as a function
of Pattern state plus transport position. Audio is scheduled with a lookahead scheduler against
`AudioContext.currentTime`. Persistence is `localStorage` under version-stamped, separated keys.
Tests are Vitest for the core and Playwright for grid, transport, and responsive behaviour, with
every test named for the AC it proves.

## Technical Context

**Language/Version**: JavaScript (ES2022 modules), no TypeScript

**Primary Dependencies**: Vite (dev server + build); `soundfont-player` with an acoustic grand piano
soundfont for Melodic playback (the constitution's standing sampled-piano exception). No UI
framework, no state library, no CSS framework.

**Storage**: Browser `localStorage`, split across separate version-stamped keys — `rm.patterns.v1`,
`rm.localMeta.v1`, `rm.settings.v1` — so FR-006's Local Metadata separation is structural rather
than conventional.

**Testing**: Vitest for `core/` (pure functions, exhaustive) and `storage/`; Playwright driving
Chromium for grid interaction, transport, audio/visual sync, and responsive ACs. Every test name is
prefixed with the AC ID it proves, and a coverage reporter maps AC ID → covered/not covered.

**Target Platform**: Evergreen browsers with Web Audio support — Chrome, Safari (including iOS
Safari), Firefox, Edge. No build-time backend.

**Project Type**: Single-page client-side web application, served as static files.

**Performance Goals**: No audible drift between click, Pattern, and cursor over a 30-minute
continuous run (SC-002); scheduled-event timing within 10 ms of predicted and visual highlight
within 20 ms of its audio event (AC-4.1.1, AC-4.1.2); grid re-render cheap enough that a 144-Slot
Pattern updates its playback cursor without dropping frames.

**Constraints**: No backend, no accounts, no remote sync, no analytics (Principle V). No secrets in
client code. Sampled-piano loading must never block browsing or editing. The app must be fully
usable on a 390 px viewport.

**Scale/Scope**: 34 User Stories, 206 Acceptance Criteria across 14 epics. 112 seeded Patterns at
ship, with a personal library expected to grow into the hundreds.

## Constitution Check

*GATE: evaluated against constitution v3.2.0. Re-checked after Phase 1 design, and again
on 2026-08-17 when Principle IV was rewritten (T147).*

| Principle | How this plan satisfies it | Status |
|---|---|---|
| **I. Rhythmic & Metric Correctness** (NON-NEGOTIABLE) | All meter/Recipe/accent/swing/pitch arithmetic lives in `src/core/`, exported as pure functions with no DOM or audio imports. Nothing outside `core/` may compute a beat count, a slot duration, or an accent default; an import-boundary lint rule enforces it. Exhaustive Vitest coverage over every supported meter, every Recipe, the accent tables at Beat and Slot level, swing at 0 and 100, and pitch across the full octave range in all 12 Keys. | PASS |
| **II. Grid Consistency & Accent Legibility** | One grid component instance, rendered from `(pattern, transportPosition)`. Every control dispatches a Pattern mutation and re-renders through the same path. Accent palette validated against deuteranopia/protanopia/tritanopia simulation as an automated check; fill height is used as a second channel for scannability — a design choice recorded in research.md, not a constitutional requirement. | PASS |
| **III. Audio Timing & Playback Behavior** | Lookahead scheduler polls on a timer but computes every event time as `origin + elapsedBeats × secondsPerBeat` from the transport's absolute audio-clock origin — never accumulated. The visual cursor is driven from the same scheduled queue. Audio only starts from a transport control; the AudioContext is created inside that gesture handler. Soundfont loads asynchronously; Percussive playback never waits on it. | PASS |
| **IV. Traceability & Testing Standards** | Every test is named for the criterion it proves, in the criterion's own words. `npm run check:trace` enforces the whole chain — AC → Case → plan item (the Traceability Matrix below) → implementation task + test task → a verbatim-named test — and requires a DOM-capable test for any UI-level criterion. `npm run coverage:ac` remains as the cheaper "is any AC unnamed" check. Commits cite the US/AC IDs they touch. | **PARTIAL** — see below |
| **V. Simplicity & Scope Discipline** | No framework, no state library, no CSS framework. Two runtime dependencies: `soundfont-player` (constitutional standing exception) and the piano soundfont asset. Vite is a devDependency producing static output. `localStorage` only; every key version-stamped with a migration path. | PASS |
| **Visual & Audio Clarity** | Accent palette CVD-verified (above). 390 px legibility met by one-Measure-per-row vertical paging with a 24 px minimum Slot width (AC-15.1.10). Melodic pitch resolution unit-tested per Key and octave. Metronome click uses a timbre outside the Pattern voices' range. | PASS |
| **Client-Side Architecture Constraints** | Pattern is one serializable object; rendering is a pure function of it. Local Metadata is a physically separate storage key with no code path that merges it into a Pattern's export shape — enforced by a serialization test. Provenance is determined by which store a Pattern was loaded from rather than by a field on the Pattern, so an edit cannot forge it (data-model §5). | PASS |

**Principle IV is PARTIAL as of 2026-08-17.** `npm run check:trace` reports 333 standing
findings, held in `traceability-baseline.json` so the gate can block new drift while they
are worked off. They are not a plan deviation to be waived — they are logged as T147–T153
in `tasks.md` and burn down from there. The two that matter most:

- ~~**US-11.1's possible-duplicates view and US-11.2's Family panel were never built.**~~
  Built by T148 on 2026-08-17. `core/similarity.js` had computed both correctly all along,
  but `main.js` exposed `currentDuplicates` and `currentFamily` only as test seams on
  `window.__rm` — no view, no panel, no CSS — while thirteen tests of fingerprint
  arithmetic carried those Stories' AC IDs, so the old gate read 100%. AC-11.1.4 called
  the view "the sole safety net" for duplicates that emerge through ongoing edits, and
  there was none.
- **83 criteria are proved by a test that asserts something else**, in contiguous runs
  consistent with ACs being inserted and the spec renumbered while test names stayed put —
  `counting.test.js` across AC-5.6.6–AC-5.6.11, `seed.test.js` across AC-16.1.3–AC-16.1.11,
  `library.test.js`, `storage.test.js`, `similarity.test.js`. The old gate's orphan check
  was a warning, so an ID that slid onto a *different real* AC was invisible.

No other Constitution Check violations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-rhythm-master-mvp/
├── plan.md              # This file
├── spec.md              # 34 User Stories, 206 ACs
├── research.md          # Phase 0 — decisions and rejected alternatives
├── data-model.md        # Phase 1 — Pattern shape, storage schema, invariants
├── quickstart.md        # Phase 1 — how to run, test, and validate
├── contracts/           # Phase 1 — core API, storage, seed-file, MIDI contracts
└── checklists/
    └── requirements.md  # Spec quality validation record
```

### Source Code (repository root)

```text
index.html                  # Single page; Vite entry

src/
├── main.js                 # Composition root: wires storage → state → ui → audio
├── core/                   # PURE. No DOM, no Web Audio, no localStorage imports.
│   ├── meter.js            # Time Signatures, beat counts, Beat note values
│   ├── recipes.js          # Recipe catalogue, Slot counts, Subdivision Groups
│   ├── accents.js          # Metric accent defaults at Beat and Slot level
│   ├── swing.js            # Per-group swing offsets
│   ├── pitch.js            # Scale degree + octave + Key → frequency / MIDI note
│   ├── timeline.js         # Pattern → flat ordered list of scheduled events
│   ├── pattern.js          # Pattern construction and mutation
│   ├── similarity.js       # Duplicate and Pattern Family detection
│   └── counting.js         # Takadimi / 1-e-&-a / Numbered syllable labels
├── audio/
│   ├── context.js          # AudioContext lifecycle, gesture unlock, suspend handling
│   ├── scheduler.js        # Lookahead transport driving core/timeline events
│   ├── voices.js           # Percussive synthesis + accent dynamics
│   └── piano.js            # Soundfont loading and Melodic note playback
├── ui/
│   ├── grid.js             # The one grid view
│   ├── controls.js         # Meter, Recipe, pitch, tempo, swing, counting controls
│   ├── library.js          # Browse, search, Tag filter, rating, navigation
│   ├── dialogs.js          # Naming, confirmation, duplicate prompts
│   └── responsive.js       # Breakpoints, per-Measure row paging, playback autoscroll
├── storage/
│   ├── patterns.js         # rm.patterns.v1
│   ├── localMeta.js        # rm.localMeta.v1  (never exported — FR-006)
│   ├── settings.js         # rm.settings.v1
│   └── migrate.js          # schemaVersion migrations
├── export/
│   ├── midi.js             # MIDI file builder
│   └── submit.js           # Prefilled GitHub issue URL builder
└── styles/
    ├── tokens.css          # Colour tokens, incl. the CVD-verified accent palette
    └── *.css

data/
└── seed-patterns.json      # 112 shipped Patterns (US-16.2 — data, not code)

tests/
├── unit/                   # Vitest over core/ and storage/
├── e2e/                    # Playwright over ui/, audio/, responsive
└── ac-coverage.js          # Maps spec AC IDs to test names; fails on gaps

tools/
└── convert-legacy-patterns.js

.github/workflows/
└── deploy.yml              # Test → build → publish to GitHub Pages
```

**Structure Decision**: Single project, no frontend/backend split, because there is no backend and
never will be (Principle V). The layering that matters here is not by feature but by purity: `core/`
is pure and exhaustively tested; `audio/`, `ui/`, and `storage/` are the impure edges. This is the
structural expression of Principle I — the import boundary is what stops musical arithmetic from
being re-derived inside a view, which is the failure mode the predecessor application had.

## Traceability Matrix

*Added 2026-08-17. Enforced by `npm run check:trace`.*

The chain the project promises is `AC → plan item → implementation task + test task → a
test named for the criterion it proves`. Before this section existed the middle link was
missing: an AC traced to a test name and nothing else, so an AC could be specified,
skipped, and still report as covered — which is exactly what happened to US-2.2's pitch
strip (T145) and to US-11.1/US-11.2's duplicate and Family views.

Every plan item below is one phase of `tasks.md`. **An item that carries ACs MUST have at
least one implementation task and at least one test task.** An item carrying no AC is
infrastructure: it asserts no behaviour, so it needs no test task.

`—` in the AC column means infrastructure. Task ranges are inclusive.

| Plan item | Covers | Acceptance Criteria | Implementation tasks | Test tasks |
|---|---|---|---|---|
| **P-001** | Setup (shared infrastructure) | — | T001–T011 | — |
| **P-002** | Foundational: the pure core and persistence | — | T012–T018, T026–T030 | T019–T025, T031 |
| **P-003** | US-16.1 — Ship with a seeded Pattern library | AC-16.1.1–AC-16.1.11 | T032 | T033 |
| **P-004** | US-16.2 — Add Patterns by editing a data file | AC-16.2.1–AC-16.2.4 | T034 | T035 |
| **P-005** | US-1.1 — Measure sequence & per-Measure Time Signature | AC-1.1.1–AC-1.1.9 | T036–T037 | T038 |
| **P-006** | US-1.2 — Time signature support without implied grouping | AC-1.2.1–AC-1.2.4 | T039 | T040 |
| **P-007** | US-1.3 — Mixed subdivision within a Beat, via Recipes | AC-1.3.1–AC-1.3.10 | T041–T043 | T044 |
| **P-008** | US-1.4 — Display and change a Measure's Time Signature in the grid | AC-1.4.1–AC-1.4.8 | T045 | T046 |
| **P-009** | US-3.1 — Per-Slot dynamics with musically-normal defaults | AC-3.1.1–AC-3.1.17 | T047–T048, T050, T166 | T049, T166 |
| **P-010** | US-4.1 — Play a Pattern on loop | AC-4.1.1–AC-4.1.7 | T051–T055, T165 | T056, T165 |
| **P-011** | US-4.2 — Adjust tempo | AC-4.2.1–AC-4.2.3 | T057–T058 | T059 |
| **P-012** | US-4.3 — Metronome click and count-in | AC-4.3.1–AC-4.3.6 | T060–T061 | T062 |
| **P-013** | US-4.4 — Swing | AC-4.4.1–AC-4.4.5 | T063 | T064 |
| **P-014** | US-2.1 — Choose Sound Mode | AC-2.1.1–AC-2.1.5 | T065 | T066 |
| **P-015** | US-2.3 — Transpose to a Key | AC-2.3.1–AC-2.3.3 | T067 | T068 |
| **P-016** | US-2.2 — Assign Pitch to a Slot | AC-2.2.1–AC-2.2.17 | T069, T160, T162, T163, T164, T165 | T070, T161, T162, T163, T164, T165 |
| **P-017** | US-2.4 — Melodic playback | AC-2.4.1–AC-2.4.5 | T071–T072 | T073 |
| **P-018** | US-5.6 — Counting system toggle | AC-5.6.1–AC-5.6.13 | T074–T075, T162 | T076, T163 |
| **P-019** | US-7.1 — Build a Pattern from scratch | AC-7.1.1–AC-7.1.2 | T077 | T078 |
| **P-020** | US-7.2 — Continuous auto-save for a Pattern you own | AC-7.2.1–AC-7.2.3 | T079 | T080 |
| **P-021** | US-7.3 — Editing a shipped Pattern requires naming a new Pattern first | AC-7.3.1–AC-7.3.5 | T081 | T082 |
| **P-022** | US-7.4 — Make a named copy of a Pattern you own | AC-7.4.1–AC-7.4.6 | T083 | T084 |
| **P-023** | US-7.5 — Delete a Pattern | AC-7.5.1–AC-7.5.4 | T085 | T086 |
| **P-024** | US-5.1 — Browse the library | AC-5.1.1–AC-5.1.6 | T087 | T088 |
| **P-025** | US-5.2 — Search by text | AC-5.2.1–AC-5.2.3 | T089 | T090 |
| **P-026** | US-5.3 — Organise by Tag, including automatic Tags | AC-5.3.1–AC-5.3.10 | T091–T092 | T093 |
| **P-027** | US-5.5 — Navigate sequentially | AC-5.5.1–AC-5.5.2 | T094 | T095 |
| **P-028** | US-6.1 — Rate a Pattern | AC-6.1.1–AC-6.1.6 | T096 | T097 |
| **P-029** | US-8.1 — Append a second Pattern | AC-8.1.1–AC-8.1.6 | T098 | T099 |
| **P-030** | US-10.1 — Duplicate a Pattern to build a variation | AC-10.1.1–AC-10.1.6 | T100 | T101 |
| **P-031** | US-11.1 — Detect true duplicates | AC-11.1.1–AC-11.1.6 | T102–T103, T148 | T104, T155 |
| **P-032** | US-11.2 — Detect and surface Pattern Families | AC-11.2.1–AC-11.2.5 | T105, T148 | T106, T155 |
| **P-033** | US-11.3 — Detect when a library update duplicates your own Pattern | AC-11.3.1–AC-11.3.5 | T107 | T108 |
| **P-034** | US-12.1 — Export a single Pattern as MIDI | AC-12.1.1–AC-12.1.4 | T109 | T110 |
| **P-035** | US-13.1 — Submit a Pattern for review | AC-13.1.1–AC-13.1.5 | T111–T112, T169, T173 | T113, T170, T174 |
| **P-036** | US-15.1 — Desktop, tablet, and mobile adaptation | AC-15.1.1–AC-15.1.14 | T114–T116, T160, T167 | T117, T161, T168 |
| **P-037** | Polish & cross-cutting concerns | — | T119, T123–T124 | T118, T120–T122 |
| **P-038** | US-15.2 — Structural boundaries in the grid are visible | AC-15.2.1–AC-15.2.5 | T160 | T161 |

**Post-MVP work** extends the plan item it belongs to rather than adding one. A change
that revises AC-15.1.13 is more of P-036; its tasks are logged in the Post-MVP section of
`tasks.md` and cite the plan item they extend. A change that introduces a User Story the
plan has never had adds a new `P-0xx` row here, in the same change that specifies it.

## Complexity Tracking

No Constitution Check violations. Table intentionally empty.
