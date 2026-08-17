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

*GATE: evaluated against constitution v3.0.0. Re-checked after Phase 1 design.*

| Principle | How this plan satisfies it | Status |
|---|---|---|
| **I. Rhythmic & Metric Correctness** (NON-NEGOTIABLE) | All meter/Recipe/accent/swing/pitch arithmetic lives in `src/core/`, exported as pure functions with no DOM or audio imports. Nothing outside `core/` may compute a beat count, a slot duration, or an accent default; an import-boundary lint rule enforces it. Exhaustive Vitest coverage over every supported meter, every Recipe, the accent tables at Beat and Slot level, swing at 0 and 100, and pitch across the full octave range in all 12 Keys. | PASS |
| **II. Grid Consistency & Accent Legibility** | One grid component instance, rendered from `(pattern, transportPosition)`. Every control dispatches a Pattern mutation and re-renders through the same path. Accent palette validated against deuteranopia/protanopia/tritanopia simulation as an automated check; fill height is used as a second channel for scannability — a design choice recorded in research.md, not a constitutional requirement. | PASS |
| **III. Audio Timing & Playback Behavior** | Lookahead scheduler polls on a timer but computes every event time as `origin + elapsedBeats × secondsPerBeat` from the transport's absolute audio-clock origin — never accumulated. The visual cursor is driven from the same scheduled queue. Audio only starts from a transport control; the AudioContext is created inside that gesture handler. Soundfont loads asynchronously; Percussive playback never waits on it. | PASS |
| **IV. Traceability & Testing Standards** | Every test is named `AC-x.y.z — …`. A `npm run coverage:ac` script parses the spec's AC IDs and the suite's test names and reports any AC with no test. Commits cite the US/AC IDs they touch. | PASS |
| **V. Simplicity & Scope Discipline** | No framework, no state library, no CSS framework. Two runtime dependencies: `soundfont-player` (constitutional standing exception) and the piano soundfont asset. Vite is a devDependency producing static output. `localStorage` only; every key version-stamped with a migration path. | PASS |
| **Visual & Audio Clarity** | Accent palette CVD-verified (above). 390 px legibility met by one-Measure-per-row vertical paging with a 24 px minimum Slot width (AC-15.1.10). Melodic pitch resolution unit-tested per Key and octave. Metronome click uses a timbre outside the Pattern voices' range. | PASS |
| **Client-Side Architecture Constraints** | Pattern is one serializable object; rendering is a pure function of it. Local Metadata is a physically separate storage key with no code path that merges it into a Pattern's export shape — enforced by a serialization test. Provenance is determined by which store a Pattern was loaded from rather than by a field on the Pattern, so an edit cannot forge it (data-model §5). | PASS |

**No violations. Complexity Tracking is empty.**

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

## Complexity Tracking

No Constitution Check violations. Table intentionally empty.
