# Rhythm Master

A browser-based rhythm and melody practice and composition tool for musicians on any
instrument.

Build rhythmic patterns with mixed meter and mixed subdivision, assign per-slot accents
and pitches, and practice them with a metronome, count-in, and swing — all running
entirely in the browser with no backend.

## Status

Implemented. All 34 User Stories are built, and all 211 Acceptance Criteria carry at
least one automated test — `npm run coverage:ac` reports 211/211.

## Running it

```bash
npm install
npm run dev          # dev server
npm run build        # static build into dist/
```

| Command | What it checks |
|---|---|
| `npm test` | Vitest over the pure core and storage |
| `npm run test:e2e` | Playwright over the grid, transport, library and responsive behaviour |
| `npm run coverage:ac` | Every AC in spec.md has a test naming it — fails on any gap |
| `npm run validate:seed` | The shipped Pattern library against data-model §7 |
| `npm run check:cvd` | The accent palette under simulated colour vision deficiencies |
| `npm run lint` | Includes the `core/` purity boundary (Constitution Principle I) |

Playwright uses the container's Chromium via `CHROMIUM_PATH`:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

## Before release

- **Run the 30-minute continuous playback check by hand** (quickstart.md V7). The
  automated suite asserts the property that makes it hold — absolute-origin
  scheduling — over 30 seconds and 500 loops, not the full half hour.

## Key capabilities (planned)

- **Mixed meter** — every Measure in a Pattern carries its own time signature, so a
  Pattern can shift from 4/4 to 2/4 to 7/8 without leaving the tool.
- **Mixed subdivision** — a single Beat can be part straight-feel, part triplet-feel,
  chosen from a fixed menu of subdivision Recipes.
- **Musically-aware accent defaults** — turning on a Slot lands it on the accent a
  musician would naturally give that metric position, rather than a flat default, with
  tap-to-cycle override.
- **Melodic mode** — assign an explicit scale degree and octave per Slot, played back
  through the predecessor's synthesis engine, transposable to any key.
- **Practice tooling** — 18–220 BPM, metronome, count-in, per-subdivision-group swing,
  and three counting systems (Takadimi, 1-e-&-a, Numbered).
- **Library** — rate, tag, search, combine, duplicate, and MIDI-export Patterns, with
  automatic duplicate and variant detection.

## Documentation

| Document | Purpose |
|---|---|
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Project principles — correctness, visual and audio clarity, traceability, and scope constraints that all work is held to |
| [`specs/001-rhythm-master-mvp/spec.md`](specs/001-rhythm-master-mvp/spec.md) | Feature specification: 34 user stories, 211 acceptance criteria in Given/When/Then form |
| [`data/seed-patterns.json`](data/seed-patterns.json) | The Patterns the app ships with (110 at present). Plain JSON — add or edit Patterns here directly, no code change needed (US-16.2) |
| [`specs/001-rhythm-master-mvp/plan.md`](specs/001-rhythm-master-mvp/plan.md) | Implementation plan: stack, project structure, and the Constitution Check |
| [`specs/001-rhythm-master-mvp/research.md`](specs/001-rhythm-master-mvp/research.md) | Every technical decision, with the alternatives that were rejected and why |
| [`specs/001-rhythm-master-mvp/data-model.md`](specs/001-rhythm-master-mvp/data-model.md) | The ratified Pattern format, storage schema, and validation rules |
| [`specs/001-rhythm-master-mvp/quickstart.md`](specs/001-rhythm-master-mvp/quickstart.md) | How to run it, and the eight scenarios that validate it end to end |
| [`tools/convert-legacy-patterns.js`](tools/convert-legacy-patterns.js) | One-time migration that produced the seed data; kept so the conversion is reproducible rather than hand-edited |

## Traceability

Every requirement carries a stable ID — User Stories as `US-<epic>.<story>`, Acceptance
Criteria as `AC-<epic>.<story>.<n>`. Commits, pull requests, code comments, and test
names all reference these IDs, so any behavior traces back to the requirement that
justified it and forward to the test that proves it. See Principle IV of the
constitution.

## Development workflow

This project uses [GitHub Spec Kit](https://github.com/github/spec-kit). The scaffold is
already initialized; the skills live in `.claude/skills/`.

```
speckit-constitution → specify → plan → tasks → implement → converge
optional: clarify, analyze, checklist
```

The MVP specification and implementation plan are complete at
`specs/001-rhythm-master-mvp/`. The next step is `/speckit-tasks`.
