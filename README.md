# Rhythm Master

A browser-based rhythm and melody practice and composition tool for musicians on any
instrument.

Build rhythmic patterns with mixed meter and mixed subdivision, assign per-slot accents
and pitches, and practice them with a metronome, count-in, and swing — all running
entirely in the browser with no backend.

## Status

Substantially implemented, with known gaps that are counted rather than guessed at.

Every Acceptance Criterion carries at least one automated test naming it
(`npm run coverage:ac`). **That is a much weaker statement than it sounds**, and this
README claimed more than it should have until 2026-08-17: a test naming an AC is not
necessarily a test *of* it. `npm run check:trace` measures the difference, and
`specs/traceability-matrix.md` reports it per criterion.

Three User Stories have been caught specified-but-never-built this way — US-11.1's
possible-duplicates view, US-11.2's Family panel, and US-1.1's −Measure control. See
**Guardrails** below for how each was found and what still cannot be caught
automatically.

Counts are not restated here on purpose; `npm run coverage:ac`,
`npm run check:trace` and the generated matrix are the honest sources.

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
| `npm run coverage:ac` | Every AC in spec.md has a test naming it — necessary, not sufficient (see Guardrails) |
| `npm run check:trace` | The AC → plan item → task → test chain, and that each test is named for what it proves |
| `npm run trace:matrix` | Regenerates the traceability matrix; commit the result |
| `npm run validate:seed` | The shipped Pattern library against data-model §7 |
| `npm run check:cvd` | The accent palette under simulated colour vision deficiencies |
| `npm run lint` | Includes the `core/` purity boundary (Constitution Principle I) |

Playwright uses its own installed browsers by default, so `npm run test:e2e` needs no
setup locally. Where they are not installed — CI containers, for instance — point it at a
Chromium with `CHROMIUM_PATH`:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
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
| [`specs/001-rhythm-master-mvp/spec.md`](specs/001-rhythm-master-mvp/spec.md) | Feature specification: 35 User Stories and their Acceptance Criteria in Given/When/Then form |
| [`data/seed-patterns.json`](data/seed-patterns.json) | The Patterns the app ships with. Plain JSON — add or edit Patterns here directly, no code change needed (US-16.2) |
| [`specs/001-rhythm-master-mvp/plan.md`](specs/001-rhythm-master-mvp/plan.md) | Implementation plan: stack, project structure, and the Constitution Check |
| [`specs/001-rhythm-master-mvp/research.md`](specs/001-rhythm-master-mvp/research.md) | Every technical decision, with the alternatives that were rejected and why |
| [`specs/001-rhythm-master-mvp/data-model.md`](specs/001-rhythm-master-mvp/data-model.md) | The ratified Pattern format, storage schema, and validation rules |
| [`specs/001-rhythm-master-mvp/quickstart.md`](specs/001-rhythm-master-mvp/quickstart.md) | How to run it, and the eight scenarios that validate it end to end |
| [`tools/convert-legacy-patterns.js`](tools/convert-legacy-patterns.js) | One-time migration that produced the seed data; kept so the conversion is reproducible rather than hand-edited |

## Guardrails

Nine of these run on every commit and in CI; a failure stops the change. They exist
because the obvious gate — "every AC has a test" — turned out to prove almost nothing.

### The gates

| Command | What it catches |
|---|---|
| `npm run lint` | The `core/` purity boundary: no DOM, audio, storage, `Date.now` or `Math.random` in pure code (Principle I) |
| `npm test` | Vitest over `core/` and `storage/` |
| `npm run test:e2e` | Playwright over the grid, transport, library and responsive behaviour |
| `npm run coverage:ac` | Every AC has **a test naming it**. Necessary, and nowhere near sufficient — see below |
| `npm run check:trace` | The nine chain checks below |
| `npm run trace:matrix` | Regenerates `specs/traceability-matrix.md`; commit the result |
| `npm run validate:seed` | The shipped Pattern library against data-model §7 |
| `npm run check:cvd` | The accent palette under simulated colour vision deficiencies |

### The nine chain checks

`check:trace` enforces `AC → Case → plan item → implementation task + test task → a test
named for the criterion, verbatim`. Each fails on its own:

| | Rule | The failure it exists to catch |
|---|---|---|
| **T1** | Every AC traces to a numbered plan item | An AC written down and never scheduled |
| **T2** | Every plan item with ACs has an implementation task **and** a test task | Something built with nobody assigned to prove it |
| **T3** | Every file a *completed* task names exists | A task marked done against files that were never written |
| **T4** | A compound AC declares numbered **Cases** | One test standing in for twelve table rows — proves one, claims twelve |
| **T5** | Every criterion has a test whose **name is its title, verbatim** | `it('AC-1.1.9 — no mutator touches its argument')` passing as proof of "Measure removal is always from the end" |
| **T6** | A UI-level criterion has a test that can reach the DOM | `core/` is pure by construction and cannot see a screen, whatever the test is named |
| **T7** | No test names an AC the spec does not declare | A test citing a requirement that no longer exists |
| **T8** | The committed matrix is up to date | A criterion silently losing its test between commits |
| **T9** | Every waiver is valid, reasoned, and still needed | The waiver file rotting into a blanket pass |

**A test name is not a claim about the criterion — it *is* the criterion.** Write
`it('AC-1.1.9 — Measure removal is always from the end', …)`, copying the AC's title
exactly, with any qualifier after a colon. When the AC's wording changes, T5 fails until
someone opens the test and confirms it still proves the new wording. That failure is the
point.

### Severity, and what can never be waived

Severity is derived from the *kind* of gap, never assigned per criterion — an assigned
severity gets revised downward by whoever is in a hurry.

| | Gap | Why it ranks there |
|---|---|---|
| 🔴 **CRITICAL** | No test names the criterion | Nobody has looked |
| 🔴 **HIGH** | A test names it but proves something else | Unproven while reporting as covered |
| 🔴 **HIGH** | UI-level, but only a pure unit test | Same failure, reached differently |
| 🟠 **MEDIUM** | Compound AC not decomposed | Partly proven |
| 🟡 **LOW** | Right test, named in its own words | Proven. Clerical |

LOW and MEDIUM may be waived in `specs/traceability-waivers.json` with a written reason.
**CRITICAL and HIGH can never be waived, by anyone, for any reason** (Principle IV,
non-negotiable): those are exactly the states in which a specified requirement sits while
unbuilt and reporting as complete.

### What the guardrails do *not* catch

Three holes, stated plainly, because a guardrail list that reads as complete is worse
than none.

**1. The baseline mutes almost everything.** `check:trace` arrived after the damage, with
333 findings already standing. A permanently-red gate gates nothing, so
`specs/traceability-baseline.json` holds that debt: those findings are **reported but do
not fail the build**. Anything not in it does.

This is the hole that let the −Measure control ship as missing. `T6 AC-1.1.8` and
`T6 AC-1.1.9` are in the baseline *right now* — the guardrail fired correctly and was
muted. A baselined finding is **outstanding work, never a settled decision**, and "it's in
the baseline" is never a reason to leave it.

**The baseline may only shrink.** `npm run trace:prune` strikes off entries that are no
longer findings, and nothing writes new ones. Taking on new debt means hand-editing a
checked-in file, which shows up in a diff and has to be argued for. Fixing a baselined
finding *fails the gate until you prune* — deliberately, so the list cannot quietly
re-excuse a regression later.

**2. Nothing detects code that is built but never wired.** `removeMeasure` was written,
exported from `core/pattern.js`, unit-tested, and called by nothing outside `core/` — for
the entire life of the project. ESLint guards the direction `core/` must not import; no
check asks whether `ui/` ever reaches back. The same gap hides the Recipe and Swing
controls being wired only to Measure 1, Beat 1.

**3. `coverage:ac` at 100% means very little on its own.** It asks whether an AC ID appears
in a test name. It cannot tell `AC-1.1.9 — Measure removal is always from the end` from
`AC-1.1.9 — no mutator touches its argument`. Read it alongside `check:trace`, never
instead of it.

### The matrix

`specs/traceability-matrix.md` is the chain as a document — one row per criterion, with its
User Story, its own words, plan item, implementation tasks, test tasks (listed separately,
because "who builds it" and "who proves it" are different questions), the test that proves
it, and a status. **It is generated. Never edit it by hand.**

```bash
npm run trace:matrix     # regenerate; commit the result
npm run trace:changed    # the rows this change touches — paste into the PR body
npm run trace:prune      # strike off findings that are no longer findings
```

Every row and User Story is colour-marked — 🟢 proven, 🔵 waived, 🟡 → 🟠 → 🔴 as a gap
gets more serious — so hundreds of rows can be scanned rather than read. A User Story
takes the colour of its **worst** criterion. The colour always sits beside the words it
repeats and never replaces them, since red and green are the one pair a colour-blind
reader cannot separate.

A `Stop` hook (`.claude/settings.json`) runs the check when a session ends and surfaces new
findings. It never blocks — a hook that halts a session over a documentation gap gets
switched off, and a gate that is off enforces nothing.

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

The MVP specification, plan and tasks are complete at `specs/001-rhythm-master-mvp/`.
Post-MVP work is logged as numbered tasks in that folder's `tasks.md`; every change gets
one, and every change lands as a pull request carrying its spec revisions, AC IDs and
gate results.
