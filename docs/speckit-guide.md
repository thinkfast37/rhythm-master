# How this project uses GitHub Spec Kit

A walkthrough of the spec-driven workflow behind Rhythm Master: what Spec Kit is, where
every artifact lives and what it contains, how the stock workflow has been extended and
scaffolded, and — concretely — how a new feature, a bug, or any other change moves from
"I want this" to the live site.

This is the map. The binding rules live in [`CLAUDE.md`](../CLAUDE.md) (the working
agreement) and [`.specify/memory/constitution.md`](../.specify/memory/constitution.md)
(the principles); where this document and those disagree, they win.

Throughout, concepts are illustrated with **excerpts from the actual files** — chosen
for stability, but they are snapshots (taken 2026-09-07), not the source: when an
excerpt and its file disagree, the file is right. A few deliberately show live status
(a gap severity, a baseline entry) and are marked as such.

---

## 1. What Spec Kit is, in one paragraph

[GitHub Spec Kit](https://github.com/github/spec-kit) is a toolkit for **spec-driven
development**: instead of prompting an AI agent to "build X" and reviewing whatever comes
out, you drive the work through a fixed sequence of artifacts — a constitution
(principles), a specification (what, as User Stories with testable Acceptance Criteria),
a plan (how, technically), and tasks (the ordered to-do list) — and only then implement.
Each stage is a slash command backed by a skill the agent follows, and each stage's
output is a Markdown file checked into the repository, so the *intent* is reviewable
before any code exists and survives long after the conversation that produced it is
gone.

This project was initialized with Spec Kit `0.16.5` using the **claude** integration
(`.specify/init-options.json` records the choices), which installs each command as a
Claude Code skill under `.claude/skills/`.

## 2. The map: where everything lives

### 2.1 `.specify/` — the Spec Kit scaffold itself

| Path | What it is |
|---|---|
| `.specify/memory/constitution.md` | The project constitution: five principles (I Rhythmic & Metric Correctness, II Grid Consistency & Accent Legibility, III Audio Timing & Playback Behavior, IV Traceability & Testing Standards, V Simplicity & Scope Discipline), currently at version 3.5.0. Semantic-versioned; every amendment prepends a Sync Impact Report explaining the bump. See the excerpts below. |
| `.specify/templates/` | The Markdown skeletons the commands fill in: `spec-template.md`, `plan-template.md`, `tasks-template.md`, `checklist-template.md`, `constitution-template.md`. |
| `.specify/scripts/bash/` | Helper scripts the skills call: `create-new-feature.sh` (numbers and scaffolds a new `specs/NNN-…/` folder and branch), `setup-plan.sh`, `setup-tasks.sh`, `check-prerequisites.sh` (verifies the artifacts a stage depends on exist), `resolve-template.sh`, `common.sh`. |
| `.specify/workflows/speckit/workflow.yml` | A bundled "Full SDD Cycle" workflow (specify → plan → tasks → implement with approve/reject gates between stages). Registered in `workflow-registry.json`; in practice this project runs the commands individually rather than through the workflow. |
| `.specify/integration.json`, `init-options.json`, `integrations/` | Bookkeeping: which Spec Kit version, which integration (claude), sequential feature numbering, `sh` scripts. |

What a constitution principle looks like — a behavioural quality bar, testable and
stack-agnostic, never a tech choice (from Principle I):

> **Beat count always equals the time signature's numerator**, for every supported
> meter, with no assumed sub-grouping. 7/8 is seven eighth-note Beats — never three
> Beats grouped 2+2+3. 6/8 is six eighth-note Beats — never two dotted-quarter Beats.
> No view, export, or playback path may reinterpret a meter into an implied grouping
> the user did not author.

And the amendment rules it lives under (from the Governance section):

> - **MAJOR**: Removal or backward-incompatible redefinition of a principle.
> - **MINOR**: Addition of a new principle or section, or material expansion of guidance
>   that imposes new requirements.
> - **PATCH**: Clarifications, rewording, or typo fixes that do not change intent.

### 2.2 `.claude/skills/` — the commands

The `speckit-*` folders are the Spec Kit commands as Claude Code skills, invoked as
`/speckit-specify`, `/speckit-plan`, and so on. Each `SKILL.md` is the procedure the
agent follows for that stage. Two skills in this directory are **not** from Spec Kit —
`spec-trace` and `pattern-intake` are this project's own scaffolding (see §4).

### 2.3 `specs/` — the feature artifacts

Everything for the MVP feature lives in `specs/001-rhythm-master-mvp/`
(sequential numbering; a second feature would get `002-…`):

| File | Produced by | Contents |
|---|---|---|
| `spec.md` | `/speckit-specify` (+ `/speckit-clarify`) | **The contract.** 37 User Stories in 15 epics, each with a description, priority, acceptance scenarios, and Given/When/Then Acceptance Criteria — ~630 AC references in all. Every requirement carries a stable ID (`US-<epic>.<story>`, `AC-<epic>.<story>.<n>`; compound ACs decompose into Cases `AC-x.y.z/1`, `/2`, …). Its Conventions section explains the ID scheme and that quoted Pattern names in scenarios are illustrative fixtures, not required content. |
| `plan.md` | `/speckit-plan` | **The how.** Technical context (vanilla ES modules + Vite, no framework), project structure, the Constitution Check, and — a local addition — the **Traceability Matrix**: numbered plan items `P-0xx`, one per phase of tasks.md, each listing the ACs it carries and its implementation and test task ranges. This matrix is the middle link `check:trace` T1/T2 enforce. |
| `research.md` | `/speckit-plan` (Phase 0) | **The decisions.** Numbered entries `D-001`–`D-010`, each with the decision, its rationale, and the alternatives *rejected* and why. Decisions are amended in place with dated notes when reversed — an approach change must touch its D-00x entry first. |
| `data-model.md` | `/speckit-plan` (Phase 1) | The ratified Pattern format, the `localStorage` schema (`rm.patterns.v1`, `rm.localMeta.v1`, `rm.overlays.v1`, `rm.settings.v1`), and the numbered validation rules `validate:seed` and `core/pattern.js` both enforce. |
| `contracts/` | `/speckit-plan` (Phase 1) | `core-api.md` (the pure core's function signatures) and `file-formats.md` (MIDI export, portable Pattern JSON). |
| `quickstart.md` | `/speckit-plan` | How to run and validate the app end to end, including the manual checks (e.g. the 30-minute continuous-playback scenario V7) that automation only approximates. |
| `checklists/requirements.md` | `/speckit-checklist` | A spec-quality checklist (no implementation details, no ambiguity, measurable criteria), ticked off during spec review. |
| `tasks.md` | `/speckit-tasks` | **The build plan and the log.** T001–T124 are the MVP phases, ordered by User Story priority, each task naming its exact files — that section is a historical record and is never renumbered. Everything since lands in the **Post-MVP task log** (T125 onward): one numbered entry per change, whatever its kind. |

**What an Acceptance Criterion looks like.** Given/When/Then, concrete enough to test,
with a stable ID (from spec.md, US-1.1):

> - **AC-1.1.9** — Measure removal is always from the end
>   - **Given** a Pattern with more than one Measure
>   - **When** the Composer taps −Measure
>   - **Then** the last Measure is removed, and every remaining Measure keeps its own
>     Time Signature and content unchanged — removal is always from the end, never
>     from the middle

A **compound** AC — one asserting more than one thing — declares numbered Cases, one
test each (`check:trace` T4 enforces this):

> - **AC-1.1.5/1** — The first Measure's Time Signature change offers Apply to all,
>   This measure only, and Cancel
> - **AC-1.1.5/2** — A Measure other than the first changes alone, with no prompt

And when an AC is revised, the revision carries a **dated parenthetical** explaining
what changed and why — the reasoning stays in the spec (AC-1.1.5 again, revised as a
spec defect):

> *(Revised 2026-08-17. This previously read "Multi-Measure change" and prompted on any
> Measure. Only the first Measure meaningfully stands for the whole Pattern — a meter
> change there reads as "this Pattern is in 6/8", whereas a change to Measure 3 reads as
> a local event […] The implementation has always gated the prompt on the first Measure;
> this AC was describing something that was never built.)*

**What a plan item looks like.** One row of plan.md's Traceability Matrix — the middle
link between an AC and the tasks that build and prove it. Note that implementation and
test tasks are separate columns, because "who builds it" and "who proves it" are
different questions:

> | Plan item | Covers | Acceptance Criteria | Implementation tasks | Test tasks |
> |---|---|---|---|---|
> | **P-005** | US-1.1 — Measure sequence & per-Measure Time Signature | AC-1.1.1–AC-1.1.9 | T036–T037 | T038 |
> | **P-007** | US-1.3 — Mixed subdivision within a Beat, via Recipes | AC-1.3.1–AC-1.3.12 | T041–T043, T182, T224, T226 | T044, T183, T225, T227 |

P-007's growing task list shows how post-MVP work attaches: a later bug fix (T224) or
capability (T226) *extends* the plan item its ACs belong to rather than getting a new
one.

**What a research decision looks like.** Decision, rationale, and — the part that pays
off later — the rejected alternatives (from research.md, D-001, abridged):

> **Decision**: Vanilla JavaScript ES modules, built with Vite.
>
> **Rationale**: The predecessor was plain `<script>` tags and its problems were not
> framework-shaped — they were that musical arithmetic was duplicated across views and
> that shared mutable `var` globals made state hard to reason about. ES modules plus a
> pure `core/` layer fix both without taking on a framework. […]
>
> **Alternatives considered**:
> - *Svelte* — would make the pure-state-to-render contract nearly free […] Rejected as
>   a maintenance and learning cost not justified for a single-maintainer project whose
>   rendering needs are one grid and a list.

Three files sit at `specs/` top level because they span the whole application, not one
feature:

| File | What it is |
|---|---|
| `traceability-matrix.md` | **Generated — never hand-edited.** One row per criterion: its User Story, its own words, plan item, implementation tasks, test tasks (listed separately), the test that proves it, and a colour-marked status (🟢 proven, 🔵 waived, 🟡/🟠/🔴 by gap severity). Regenerated by `npm run trace:matrix` and committed; `check:trace` T8 fails when it is stale. |
| `traceability-baseline.json` | The traceability debt that existed the day the gate landed (333 findings). Baselined findings are reported but don't fail the build. **It may only shrink** (`npm run trace:prune`); taking on new debt means hand-editing it, visibly, in a diff. |
| `traceability-waivers.json` | Signed-off LOW/MEDIUM gaps, each with a written reason that shows in its matrix row. CRITICAL and HIGH gaps can never be waived. |

The matrix announces its own rules in a header comment:

> GENERATED FILE — do not edit by hand.
>
> Regenerate with: `npm run trace:matrix`. It is checked by `npm run check:trace`
> (check T8), so an out-of-date matrix fails the build rather than sitting quietly out
> of step with the spec.
>
> The decisions live elsewhere. Which AC belongs to which plan item, and which tasks
> build and prove it, are authored in the plan's own Traceability Matrix. This file is
> that expanded one row per criterion, cross-referenced against the test suite, and
> marked with what is true right now.

And one row — a **live-status snapshot** (this row will change when the gap is fixed;
that is the point of it). AC-1.1.9 is fully specified, planned, tasked, and every task
is done — and it is still a 🔴 HIGH finding, because the test naming it proves something
else (see §4.2):

> | US-1.1 | `AC-1.1.9` 🖵 | Measure removal is always from the end | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js` | 🔴 **HIGH** · WRONG TEST |

The self-describing `note` fields in the JSON files are worth reading in full; they are
the policy. From `traceability-waivers.json`:

> Gaps deliberately left open, each with a written reason (CLAUDE.md §2b). This is NOT
> the baseline: the baseline is debt still owed and expected to shrink, a waiver is a
> decision that a gap will not be closed. Only LOW and MEDIUM gaps may be waived —
> CRITICAL (no test at all) and HIGH (the test proves something else, or a UI criterion
> has only a pure unit test) are the states that let unbuilt work report as complete,
> and no reason clears them (Constitution Principle IV).

### 2.4 Everything the workflow touches outside `specs/`

| Path | Role in the workflow |
|---|---|
| `CLAUDE.md` | The working agreement: the blast-radius rule, the change-type routing table, the gates, the PR landing procedure. Read by the agent at the start of every session. |
| `tests/ac-coverage.js` | The `coverage:ac` gate: every AC ID in spec.md appears in at least one test name. |
| `.claude/skills/spec-trace/` | The traceability checker and matrix generator (§4.2). |
| `.claude/settings.json` | A `Stop` hook that runs `spec-trace` when a session ends and surfaces new findings — informational, never blocking. |
| `tools/` | The remaining gates: `validate-seed.js`, `check-cvd.js`, `check-unwired.mjs` (+ its `unwired-baseline.json`), and `convert-legacy-patterns.js` (the reproducible one-time seed migration). |
| `.github/workflows/deploy.yml` | On push to `main`: re-runs every gate (`verify`), builds, and publishes to GitHub Pages. **`main` is the live site** — a branch left unmerged is invisible to the musician. |
| `data/seed-patterns.json` | The shipped library. Curation is a data change, validated by `validate:seed`, no spec pass (CLAUDE.md §7). |

## 3. The Spec Kit lifecycle, step by step

The stock pipeline, as it was run for the MVP and as it runs for any new feature large
enough to need it:

```text
/speckit-constitution   →  .specify/memory/constitution.md
/speckit-specify        →  specs/NNN-…/spec.md
/speckit-clarify        →  targeted questions, answers folded back into spec.md
/speckit-plan           →  plan.md, research.md, data-model.md, contracts/, quickstart.md
/speckit-tasks          →  tasks.md
/speckit-analyze        →  read-only cross-artifact consistency report
/speckit-checklist      →  checklists/…  (quality gate on the spec itself)
/speckit-implement      →  code + tests, working tasks.md in dependency order
/speckit-converge       →  audits code against spec/plan/tasks; appends unbuilt work as new tasks
```

Stage by stage:

1. **`/speckit-constitution`** creates or amends the constitution. Amendments are
   semantic-versioned (MAJOR: principle removed or redefined; MINOR: principle or
   section added; PATCH: clarification) and each carries a Sync Impact Report — see the
   3.5.0 report at the top of the file for the shape, including the record of a proposed
   MAJOR bump the maintainer corrected down to MINOR.
2. **`/speckit-specify`** takes a natural-language description and writes spec.md from
   the template: personas, User Stories with priorities, acceptance scenarios,
   Given/When/Then ACs, functional requirements. No implementation details — the
   checklist stage enforces that.
3. **`/speckit-clarify`** asks up to five targeted questions about genuinely
   underspecified areas and encodes the answers back into spec.md. Optional but was used
   heavily here; the maintainer's answers are the spec's substance.
4. **`/speckit-plan`** runs the planning workflow: Phase 0 research (every decision
   posed to the maintainer, rejected alternatives recorded as D-00x entries), Phase 1
   design (data-model.md, contracts/, quickstart.md), and plan.md itself with its
   Constitution Check — the stage where "does this design violate a principle?" is
   answered in writing.
5. **`/speckit-tasks`** turns the plan into tasks.md: dependency-ordered phases grouped
   by User Story, `[P]` marking tasks that can run in parallel, every task naming its
   exact files.
6. **`/speckit-analyze`** (optional, read-only) checks spec, plan and tasks against each
   other for contradictions, coverage holes and ambiguity before any code is written.
7. **`/speckit-implement`** executes tasks.md in order, checking tasks off as they
   complete.
8. **`/speckit-converge`** (run after implementation) re-audits the codebase against the
   artifacts and appends whatever is still unbuilt as new tasks — the honest inventory
   step.

`/speckit-taskstoissues` exists to fan tasks out as GitHub issues; this project keeps
tasks in tasks.md instead.

## 4. How this project extends and scaffolds Spec Kit

Stock Spec Kit gets you reviewable intent. It does **not** verify, after the fact, that
what was specified was actually built and actually proven — and this project was burned
by exactly that gap three separate times (US-2.2's pitch strip, US-11.1/11.2's duplicate
and Family views, and US-1.1's −Measure control were each specified, reported as
covered, and never built or never wired). Everything below exists because of those
failures.

### 4.1 CLAUDE.md — the working agreement

The layer that tells the agent *which* workflow a given request needs. Its two load-bearing
ideas:

- **The blast-radius rule (§1).** Before implementing anything, work out what it touches
  beyond the literal request: which ACs would change, which other User Stories' behaviour
  changes as a side effect, whether it contradicts a research decision or a Constitution
  principle. Confined changes proceed with a one-line announcement; anything that spills
  stops for approval *before* code is written.
- **The routing table (§2).** Classifies every request by what it **contradicts**, never
  by how big it feels, and routes each kind to its path — see §5 below.

It also fixes the delivery mechanics: every change gets a Post-MVP task, every change
lands as a PR, all gates must pass, and the deploy run is watched to completion.

### 4.2 spec-trace — the traceability gate (`.claude/skills/spec-trace/`)

The largest piece of scaffolding: a self-contained, dependency-free checker (portable to
any spec-kit project via `spec-trace.config.json`, which points it at this repo's spec,
plan, tasks, matrix, baseline, waivers and test directories). It enforces the full chain

```text
AC → Case → plan item (P-0xx) → implementation task + test task → a test NAMED for the criterion, verbatim
```

through nine checks (T1–T9, tabulated in CLAUDE.md §2b and the skill's own README), and
generates `specs/traceability-matrix.md`. The key inversion: **a test's name is not a
claim about the criterion, it *is* the criterion** — the title copied verbatim, so a
reworded AC fails T5 until someone confirms the test still proves the new wording.

Both shapes exist in the suite right now, which makes the contrast concrete. The wrong
shape — a real test in `tests/unit/core/pattern.test.js`, and the reason AC-1.1.9's
matrix row above reads HIGH · WRONG TEST:

```js
it('AC-1.1.9 — no mutator touches its argument', () => { … });
```

The ID is present, so `coverage:ac` counts it — but the name is a *different claim* from
"Measure removal is always from the end", so nothing here proves the criterion. And the
right shape — from `tests/e2e/melodic.spec.js`, name identical to the Case it proves:

```js
test('AC-1.3.11/5 — Arming a pitch on the pitch strip disarms the armed Recipe', …);
```

Gap severity is *derived from the kind of gap* (no test names the criterion → CRITICAL;
named but proving something else, or UI-level with only a pure unit test → HIGH; compound
AC not decomposed → MEDIUM; clerical → LOW), never assigned per criterion. LOW/MEDIUM may
be waived with a written reason; **CRITICAL and HIGH can never be waived** (Principle IV).
Pre-existing debt lives in the shrink-only baseline; fixing a baselined finding fails the
gate until you `trace:prune`, deliberately, so the list stays honest.

The skill carries its own tests (run under `npm test`), a `Stop` hook, and this rule:
changing the checker means changing its tests, because a gate that never fires looks
exactly like a gate with nothing to find.

### 4.3 The other gates

Spec Kit prescribes none of these; each was added after a specific failure:

| Gate | Scaffolds against |
|---|---|
| `npm run coverage:ac` (`tests/ac-coverage.js`) | An AC with no test naming it at all. Necessary, nowhere near sufficient — it cannot tell a right test from a wrong one, which is why spec-trace exists. |
| `npm run check:unwired` (`tools/check-unwired.mjs`) | Code specified, written, exported, unit-tested — and reachable by nothing in `src/` (`removeMeasure` had this shape for the project's whole life). Tests are not uses; genuine test seams go in `tools/unwired-baseline.json` with a written reason. |

The unwired baseline shows what a *reasoned* baseline entry looks like — each one argues
its case, and the two kinds (permanent seam vs outstanding work) are explicit (from
`tools/unwired-baseline.json`; the OUTSTANDING entries are live snapshots and disappear
when the work is done):

> `"src/storage/keyValue.js useBackingStore"`: Test seam. Swaps localStorage for an
> in-memory store so storage tests do not depend on a browser. Permanent.
>
> `"src/core/pattern.js removeMeasure"`: OUTSTANDING, and the finding this gate was
> built for. AC-1.1.8 and AC-1.1.9 specify a −Measure control; no such control exists,
> so the mutator behind it has never been called. Scheduled to be built.
| `npm run lint` | The `core/` purity boundary (Principle I): no DOM, audio, storage, `Date.now`, `Math.random`, or imports from the impure layers. |
| `npm run validate:seed` | The shipped library drifting from data-model §7. |
| `npm run check:cvd` | The accent palette collapsing under simulated colour-vision deficiency (Principle II). |
| `.github/workflows/deploy.yml` | All of the above re-run in CI on every push to `main`, before Pages publishes. |

### 4.4 pattern-intake (`.claude/skills/pattern-intake/`)

A project-specific skill outside the Spec Kit lifecycle: it triages Patterns users submit
through the app's Submit button (US-13.1) as GitHub issues, decodes both submission
formats, renders each as a legible accent grid for review, and shepherds accepted ones
into `data/seed-patterns.json`.

### 4.5 Local conventions layered onto the stock artifacts

- **plan.md grew a Traceability Matrix section** (P-0xx items) that the stock template
  does not have — it is the middle link T1/T2 check.
- **tasks.md grew the Post-MVP task log**: Spec Kit's tasks end when implementation
  ends; here every subsequent change of any kind appends a numbered task recording what
  it was, why (often quoting the maintainer's report verbatim, with the date), the files
  touched, and the US/AC IDs implemented or revised. Implementation and test tasks are
  logged as separate entries (`T238` builds, `T239` proves).
- **research.md is amended, never rewritten**: a reversed decision gets a dated note in
  its D-00x entry so the reasoning trail survives.
- **spec.md ACs are revised with dated parentheticals** saying what changed and why —
  and always *before* the implementation, never backfilled after it.

## 5. How changes are made

Every change starts the same way: classify it with the blast-radius rule, give it a
Post-MVP task, and land it through the same gates and PR procedure. What differs is which
artifacts move first. This is CLAUDE.md §2, expanded into walk-throughs.

### 5.1 A new feature (nothing in the spec covers it)

1. Classify (§1). If it spills into other Stories' behaviour, get the spill approved
   first.
2. `/speckit-specify` — add the User Story and its ACs to spec.md, with IDs. A compound
   AC gets numbered Cases.
3. **In the same change**: add the plan item row (`P-0xx`) to plan.md's Traceability
   Matrix and both tasks — implementation *and* test — to tasks.md. T1/T2 fail until
   they exist; that is what stops an AC being written down and quietly never scheduled.
4. `/speckit-plan` only if technical assumptions change (new decision → new or amended
   D-00x entry in research.md).
5. `/speckit-tasks` → `/speckit-implement`, or for a small feature just work the tasks
   directly: build it, and write tests whose names are the criteria, verbatim.
6. Run every gate (§6), regenerate the matrix, land it (§5.6).

Worked example in the log: **T216/T217** (the scale picker, US-2.5) — spec, plan item
P-040, data-model rule 13, core module, UI, seed data and validator all named in one
task entry, with the DOM-proven e2e tests in its test task.

### 5.2 A bug (code doesn't do what an AC already says)

Write the failing test first — named for the AC it proves — then fix the code, then
verify. **No spec edit.** In practice a maintainer bug report often exposes an unstated
criterion, which makes it "bug + spec addition": the new AC, its plan-item extension and
both tasks land together. Here is a complete worked example — the actual T224/T225
entries from the Post-MVP log (historical record, so stable), showing everything one
change carries: its kind, the files, the IDs, the plan item it extends, and the
maintainer's report verbatim with its date (file paths abridged):

> - [X] **T224 [bug + spec addition]** Arming a pitch disarms the armed Recipe —
>   `spec.md` (AC-1.3.11/5 added, with a dated parenthetical), `plan.md` (P-007),
>   `src/main.js` (`onArmDegree` and `onArmOctave` clear `armedRecipe`, so the Recipe
>   brush yields to the pitch strip). Implements AC-1.3.11/5. Extends P-007. Reported by
>   the maintainer 2026-09-05: in a Melodic Pattern, changing the octave and picking a
>   note, then tapping a Slot, changed the Beat's subdivision instead of stamping the
>   pitch — a Recipe armed earlier still owned every grid tap, and nothing on the pitch
>   strip ended that state.
>
> - [X] **T225 [test]** Test for T224 — `tests/e2e/melodic.spec.js` (AC-1.3.11/5 named
>   test: arm a Recipe, step the octave and arm a degree, then tap a note band and
>   assert the pitch stamps and the Beat's Recipe is unchanged).

Follow the thread and you touch every layer of the scaffolding at once: the maintainer's
words became AC-1.3.11/5 in spec.md, P-007's row in plan.md grew T224/T225, and the e2e
test's name is the Case's title verbatim (it appears as the "right shape" example in
§4.2). That thread is what `check:trace` walks mechanically.

### 5.3 A failing test

**The code is wrong until proven otherwise** (Constitution Principle IV; CLAUDE.md §2a).
Fix the code to satisfy the test as written. A test may change only when the test itself
is the defect — it asserted something its AC never said — and then the change is named
explicitly, logged in the task, cited in the commit, and fixes the test *to match the
AC*, never to match the code (see T211's note for the one recorded instance). Never relax
an assertion, narrow a case, delete or skip a test to go green.

### 5.4 A spec defect (the AC is wrong, impossible, or ambiguous)

Revise the AC **first**, with a dated parenthetical saying what changed and why, then fix
code and tests to match. Spec before code, never after — so the intent can be objected
to rather than the finished work. Example: **T214** (the pitch strip going chromatic
reversed AC-2.2.4 outright; the spill was approved before the rebuild).

### 5.5 The other kinds

- **Approach change** (contradicts a D-00x): amend the research.md entry with the
  reversal and reasoning first, then proceed as whatever kind remains.
- **Governance** (contradicts a principle): `/speckit-constitution` amendment with a
  version bump and Sync Impact Report first. The 3.5.0 native-shell amendment is the
  model — its report records not just the change but a *corrected classification*, which
  is exactly what the report format is for (from the top of constitution.md, abridged):

  > Version change: 3.4.0 → 3.5.0
  >
  > This was first drafted as MAJOR 4.0.0, reading "permanent constraints, not deferred
  > features" […] as forbidding a native shell. The maintainer corrected that the same
  > day: **a native store version was always intended for this app** […] So this is an
  > ADDITION, and MINOR: […] no rule is removed or weakened, and the rules below only
  > say how the shell must behave.
- **Data** (seed Patterns, tags, content): edit `data/seed-patterns.json`,
  `npm run validate:seed`, test. No spec pass; the file is the source of truth
  (CLAUDE.md §7 — no maintainer mode in the UI, on purpose).
- **Docs** (like this file): a task, the gates, a PR. Nothing in the chain moves.

### 5.6 Landing — the same for every kind (CLAUDE.md §5)

1. Blast radius settled and any spill approved.
2. One question, once per change: **Auto** (agent opens the PR and merges when gates
   pass — the default) or **Review** (agent opens the PR, reports, and stops; the
   maintainer merges). Irreversibility (storage migrations, deleting shipped Patterns)
   and taste (layout, spacing, colour) are named in the question when they apply,
   because no gate catches either.
3. Implement; run **all** gates.
4. Open the PR either way — it is the record, carrying spec revisions, AC IDs, gate
   results, and the pasted output of `npm run trace:changed`.
5. Merge (Auto) or hand over the link (Review). A failing or skipped gate stops the
   merge in either mode.
6. **Watch the deploy.** Merging is not landing: `verify` and `build` can pass and the
   `deploy` job still fail on its own, leaving `main` correct and the site stale. Check
   the run; if it is red, say so and don't call the change delivered.

## 6. Command reference

```bash
# Develop
npm run dev                # Vite dev server
npm run build              # static build into dist/
npm run build:native       # same build at base /, for the Capacitor store shell

# The gates — all must pass before every commit
npm run lint               # includes the core/ purity boundary
npm test                   # Vitest: core/, storage/, and the spec-trace skill's own tests
npm run test:e2e           # Playwright (CHROMIUM_PATH=... where browsers aren't installed)
npm run coverage:ac        # every AC has a test naming it — must be 100%
npm run trace:matrix       # regenerate specs/traceability-matrix.md; commit the result
npm run check:trace        # the nine chain checks; add -- --summary for one line per check
npm run validate:seed      # shipped library vs data-model §7
npm run check:cvd          # accent palette under simulated colour blindness
npm run check:unwired      # every export in src/ reachable from src/

# Traceability upkeep
npm run trace:changed      # matrix rows this change touches — paste into the PR body
npm run trace:prune        # strike off baseline entries that are no longer findings
```

## 7. Reading order for a newcomer

1. `CLAUDE.md` — the rules of engagement.
2. `.specify/memory/constitution.md` — the five principles and why each exists.
3. `specs/001-rhythm-master-mvp/spec.md` — skim the Conventions, then any one User
   Story end to end.
4. `specs/001-rhythm-master-mvp/research.md` — the D-00x entries; the rejected
   alternatives teach the architecture faster than the accepted ones.
5. `specs/traceability-matrix.md` — the whole chain, one row per promise.
6. The Post-MVP log in `tasks.md`, newest entries first — each one is a worked example
   of the workflow in §5.
