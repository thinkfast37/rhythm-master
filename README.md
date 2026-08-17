# Rhythm Master

A browser-based rhythm and melody practice and composition tool for musicians on any
instrument.

Build rhythmic patterns with mixed meter and mixed subdivision, assign per-slot accents
and pitches, and practice them with a metronome, count-in, and swing — all running
entirely in the browser with no backend.

## Status

Pre-implementation. The specification is complete; no application code exists yet.

## Key capabilities (planned)

- **Mixed meter** — every Measure in a Pattern carries its own time signature, so a
  Pattern can shift from 4/4 to 2/4 to 7/8 without leaving the tool.
- **Mixed subdivision** — a single Beat can be part straight-feel, part triplet-feel,
  chosen from a fixed menu of subdivision Recipes.
- **Musically-aware accent defaults** — turning on a Slot lands it on the accent a
  musician would naturally give that metric position, rather than a flat default, with
  tap-to-cycle override.
- **Melodic mode** — assign an explicit scale degree and octave per Slot, played back
  through a sampled piano, transposable to any key.
- **Practice tooling** — 18–220 BPM, metronome, count-in, per-subdivision-group swing,
  and three counting systems (Takadimi, 1-e-&-a, Numbered).
- **Library** — rate, tag, search, combine, duplicate, and MIDI-export Patterns, with
  automatic duplicate and variant detection.

## Documentation

| Document | Purpose |
|---|---|
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | Project principles — correctness, visual and audio clarity, traceability, and scope constraints that all work is held to |
| [`specs/001-rhythm-master-mvp/spec.md`](specs/001-rhythm-master-mvp/spec.md) | Feature specification: 34 user stories, 205 acceptance criteria in Given/When/Then form |
| [`data/seed-patterns.json`](data/seed-patterns.json) | The 112 Patterns the app ships with. Plain JSON — add or edit Patterns here directly, no code change needed (US-16.2) |
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

The MVP specification is complete at `specs/001-rhythm-master-mvp/`. The next step
is `/speckit-plan`.
