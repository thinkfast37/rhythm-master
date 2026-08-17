# Rhythm Master — working agreement

A browser-based rhythm and melody practice tool. Client-side only, no backend, no
audio assets. The maintainer is a practising musician, not a QA department: they
describe what they want in their own words, and **you pick the right workflow for
it**.

Read this before starting any change.

---

## 1. The blast-radius rule (the important one)

**Before implementing anything, work out what it touches beyond the literal
request.** Ask, in order:

1. Which Acceptance Criteria would have to change?
2. Which *other* User Stories' behaviour changes as a side effect?
3. Does it contradict a research decision (`research.md`, D-00x)?
4. Does it contradict a Constitution principle?

Then:

| Blast radius | What to do |
|---|---|
| Confined to what was asked | **Announce the type in one line and proceed.** |
| Reaches behaviour that was not asked about | **Stop. Present what else changes, and get approval for the spill before writing code.** |

The reason this rule exists: "use the takadimi sounds for both modes" sounded
like a small tweak. It reversed US-2.4 in its entirety, deleted the soundfont
infrastructure, and retired a standing Constitution exception. That should have
been surfaced *before* the work, not reported after it.

Classify by what a change **contradicts**, never by how big it feels. A one-line
edit can be a governance change; a thousand-line refactor can be a bug fix.

---

## 2. Choosing the workflow

| The change… | Type | Required path |
|---|---|---|
| Code doesn't do what an AC already says | **Bug** | Write the failing test first → fix → verify. No spec edit. |
| A test fails | **See §2a** | Fix the *code*. Changing the test is a separate, named decision. |
| An AC is wrong, impossible, or ambiguous | **Spec defect** | Revise the AC **first**, with a dated parenthetical saying what changed and why → then fix. |
| Nothing in the spec covers it | **New capability** | `/speckit-specify` → `/speckit-tasks` → `/speckit-implement`. Add `/speckit-plan` only when technical assumptions change. |
| Contradicts a research decision | **Approach change** | Amend the D-00x entry in `research.md` with the reversal and its reasoning → then whatever the row above implies. |
| Contradicts a Constitution principle | **Governance** | `/speckit-constitution` amendment with a version bump → then the rest. |
| Only seed data, tags, or content | **Data** | No spec pass. Edit the file, validate, test. |

**Spec before code, never after.** If an AC has to change, change it in the same
change *before* the implementation, so the intent can be objected to rather than
the finished work. Backfilling ACs to match what was already built keeps the spec
truthful but defeats the point of having one.

---

## 2a. When a test fails, the code is wrong

This is a Constitution non-negotiable (Principle IV), not a preference.

**A failing test is evidence about the code.** The default conclusion is that the
implementation is wrong, and the implementation is what changes. Work the failure
until the code satisfies the test as written.

A test may be changed **only** when the test itself is the defect — it asserted
something the AC never said, or encoded an assumption the AC contradicts. When
that is genuinely the case:

1. Say so explicitly, naming the AC that settles it.
2. Log it in the task and cite it in the commit.
3. Fix the test to match the AC — not to match the code.

If the *AC* is what's wrong, that is a **spec defect**: revise the AC first, in the
same change, before touching the test (§2).

**Never** relax an assertion, narrow a case, delete a test, or mark it skipped in
order to turn a build green. The cheapest way to make a red suite green is to lower
what it asks, and that converts a caught defect into a shipped one. If you cannot
make a test pass, say so and stop — a reported failure is worth more than a
green build that means nothing.

---

## 2b. Traceability: what stops a requirement being half-built

`npm run check:trace` enforces the chain below. It exists because a green
`coverage:ac` twice hid an entire unbuilt User Story — US-2.2's pitch strip (T145)
and US-11.1/US-11.2's duplicate and Family views (T147). In both, the AC ID was
present in a test name and nothing checked that the test had anything to do with it.

```text
AC  →  Case (if the AC asserts more than one thing)
    →  plan item (P-0xx, plan.md's Traceability Matrix)
    →  implementation task  +  test task  (tasks.md)
    →  a test named for the criterion, verbatim
```

Seven checks, each failing on its own:

| | Rule |
|---|---|
| **T1** | Every AC traces to a numbered plan item in `plan.md`. |
| **T2** | Every plan item carrying ACs has an implementation task **and** a test task. |
| **T3** | Every file path a *completed* task names exists. (Open tasks may name files that are the work.) |
| **T4** | An AC asserting more than one thing declares numbered **Cases**. |
| **T5** | Every criterion has a test whose **name is its title, verbatim**. |
| **T6** | A UI-level criterion has a test that can reach the DOM (`tests/e2e/` or `tests/unit/ui/`). |
| **T7** | No test names an AC or Case ID the spec does not declare. |

Three consequences worth stating outright:

- **A test name is not a claim, it is the criterion.** Write
  `it('AC-1.1.9 — Measure removal is always from the end', …)`, copying the AC's
  title. Append a qualifier after it when a criterion needs several tests:
  `'AC-1.1.9 — Measure removal is always from the end: from six down to one'`.
  If the AC's wording changes, T5 fails until you open the test and confirm it
  still proves the new wording. That failure is the point.
- **A compound AC must be decomposed, not summarised.** An AC with several
  `Then`/`And` clauses or a table gets numbered Cases (`AC-1.2.2/1`, `/2`, …), one
  test each. One test standing in for twelve table rows proves one and claims twelve.
- **`src/core/` cannot prove a UI criterion.** It is pure by construction (§6). An
  AC that names a control, view, panel, prompt, gesture, or viewport needs an e2e or
  `tests/unit/ui/` test. An AC whose only proof is a pure unit test is the exact
  shape of an unbuilt feature reporting as covered.

**Adding a new AC means adding its plan item row and both tasks in the same
change.** Not afterwards — T1 and T2 fail until they exist, which is what stops an
AC being written down and quietly never scheduled.

### The baseline

The gate arrived after the damage, with 333 findings already standing. A gate that is
permanently red gates nothing, so `traceability-baseline.json` holds the debt that
existed the day it landed: those findings are **reported but do not fail the build**.
Anything not in it does.

**The baseline may only shrink.** `npm run check:trace -- --prune-baseline` strikes off
entries that are no longer findings, and nothing writes new ones. Taking on new debt means
hand-editing a checked-in file, which shows up in a diff and has to be argued for.

Two consequences when you touch this file's neighbourhood:

- **Fixing a baselined finding fails the gate until you prune.** That is deliberate: it
  keeps the list honest, so it can never quietly re-excuse a regression later.
- **A baselined finding is outstanding work, not a settled decision.** It is on the
  burn-down list in `tasks.md`, and "it's in the baseline" is never a reason to leave it.

---

## 3. Every change gets a task

`specs/001-rhythm-master-mvp/tasks.md` carries a **Post-MVP** section. Every
change — bug, data fix, feature, anything — gets a numbered task there
(`T125` onward), checked off when done, naming the files it touched and the
US/AC IDs it implements or revises.

The MVP section (T001–T124) is a historical record. Do not renumber it.

---

## 4. Non-negotiable gates

Run before every commit. All must pass:

```bash
npm run lint          # includes the core/ purity boundary
npm test              # Vitest over core/ and storage/
npm run test:e2e      # Playwright; needs CHROMIUM_PATH (see below)
npm run coverage:ac   # every AC has a test naming it — must be 100%
npm run check:trace   # the AC → plan → task → test chain (§2b)
npm run validate:seed # the shipped library against data-model §7
npm run check:cvd     # accent palette under simulated colour blindness
```

`npm run check:trace --silent -- --summary` prints one line per check when you only
need to know which are red.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

**AC coverage must stay at 100%, and `check:trace` must report no new findings.**
A new AC without a test is an incomplete change, not a passing one — and a new AC
whose test does not prove it is the same thing wearing a green badge. Commit
messages cite the US/AC IDs they touch.

**A gate that fails stops the change.** Not "is noted and worked around": §2a
governs what to do next, and the answer is never to make the gate ask for less.

---

## 5. Landing the work: every change becomes a PR

Work is not delivered when it is committed, and it is not delivered when it is
pushed. **`main` is the live site.** `.github/workflows/deploy.yml` fires on push
to `main`, re-runs all six gates, and publishes to Pages. Nothing on a branch is
visible to the musician, however green it is — so a branch left unmerged is a
change that, from where they are sitting, did not happen.

Every change lands the same way:

1. **Ask what §1 requires** and get the spill approved, if there is one.
2. **Ask how this one should land.** Once the plan is settled and you are about
   to write code, put one `AskUserQuestion` with two options:
   - **Auto** — you open the PR and merge it yourself once the gates pass.
     **This is always the default, and always listed first.**
   - **Review** — you open the PR, report the gate results, and stop. The
     maintainer merges.

   Ask it **once per change**, at that point. Not again later in the same change.
3. **Implement**, then run all six gates in §4.
4. **Open the PR either way.** The PR is the *record*, not the approval step: it
   carries the spec revisions, the AC IDs and the gate results in one place, so
   the reasoning outlives a compaction and lives somewhere a commit message
   cannot. Open it even in Auto mode, even for a one-line data fix.
5. **Auto: merge it.** Review: hand over the link and stop.
6. **Watch the deploy, and report what is actually live.** Merging is not
   landing. `verify` and `build` can both pass and the `deploy` job still fail
   on its own — a Pages outage, a rate-limited action download — leaving `main`
   correct and the site stale, which looks from the musician's chair exactly
   like the work never happened. Check the run. If it is red, say so, name the
   failure, and do not describe the change as delivered.

**A failing or skipped gate stops the merge in either mode.** Auto is permission
to merge *passing* work without waiting; it is never permission to merge red work
or to decide a gate did not apply.

**If the blast radius changes mid-implementation, the mode is void.** An AC that
turns out to need revising, a migration that turns out to be needed — that is a
new spill under §1. Stop, say so, and ask again. The mode chosen at step 2 was
chosen against a different change from the one you now have.

Two things worth naming in the step-2 question when they apply, because no gate
can catch either and a merge deploys them straight to the musician:

- **It cannot be undone by a follow-up commit.** A storage migration rewrites
  real saved Patterns on load; deleting a shipped Pattern orphans the ratings and
  Tags in `rm.overlays.v1` that key off its id.
- **Taste is the deliverable.** Layout, spacing, colour, control placement. The
  gates prove it works, not that it is right, and the maintainer is the one
  practising with it daily.

Say so in the option text and let them choose. Do not change the default.

**A red deploy is your problem, not GitHub's.** Re-run the failed job if you
can. If the token cannot (`403 Resource not accessible by integration` on
`rerun-failed-jobs` and on `workflow_dispatch` — it holds `contents` and `pages`
write, not `actions: write`), say plainly that the maintainer has to press
**Re-run failed jobs** on the run, and give them the link. The next merge to
`main` also retriggers it, so a genuinely transient outage clears itself on the
following change.

---

## 6. Architecture rules that are enforced, not suggested

- **`src/core/` is pure.** No DOM, no Web Audio, no `localStorage`, no
  `Date.now`, no `Math.random`, no imports from `ui/`, `audio/`, `storage/` or
  `export/`. ESLint fails the build otherwise. All musical arithmetic lives here
  and is never re-derived elsewhere.
- **Beat count always equals the numerator.** 7/8 is seven Beats, never 2+2+3.
- **Accent defaults are computed, never stored.** Only overrides persist.
- **One timeline.** Playback, the visual cursor, and MIDI export all consume
  `core/timeline.buildTimeline`. They cannot disagree because there is only one.
- **Rendering is a pure function of `(pattern, transportPosition)`.**
- **Provenance is not a field.** Built-in vs custom is decided by which store a
  Pattern came from, so an edit cannot forge it.
- **Local Metadata never leaves.** `rm.localMeta.v1` is app-local bookkeeping and
  is barred from every export. `rm.overlays.v1` is user content (ratings, added
  tags) and is a different store for that reason.
- **No audio assets.** Both Sound Modes are Web Audio synthesis; the reverb
  impulse is generated at runtime.

---

## 7. Curating the shipped library

Built-in Patterns' own Tags are locked in the UI on purpose — they describe what
a Pattern *is*, and a user should not be able to lose "Latin" from Bossa Nova.

So **curation is a data change**: edit `data/seed-patterns.json` directly, then
`npm run validate:seed`. Do not add a maintainer mode to work around the lock; a
second way to change shipped data would drift from the file.

Tags a user adds to a built-in Pattern live in `rm.overlays.v1` under
`addedTags`, alongside the Pattern's own rather than replacing them.

---

## 8. Where things live

| Path | What |
|---|---|
| `.specify/memory/constitution.md` | Principles and quality bars. Amending needs a version bump. |
| `specs/001-rhythm-master-mvp/spec.md` | User Stories and Acceptance Criteria — the contract. |
| `specs/001-rhythm-master-mvp/research.md` | Technical decisions (D-00x) with rejected alternatives. |
| `specs/001-rhythm-master-mvp/data-model.md` | Pattern shape, storage schema, validation rules. |
| `specs/001-rhythm-master-mvp/tasks.md` | MVP build plan, plus the Post-MVP task log. |
| `data/seed-patterns.json` | The shipped Patterns. Plain data — see `data/README.md`. |
| `src/core/` | Pure musical arithmetic. |
| `tests/ac-coverage.js` | The gate that makes per-AC testing real. |

---

## 9. Check the record before asking

**Long sessions get compacted: earlier turns are summarised and specifics are
dropped.** Anything decided a while ago may be missing from working context even
though it is already done and committed. Treat your own memory of this project
as the least reliable source available.

So, before asking the maintainer *anything* — and before reporting work as
outstanding:

```bash
git log --oneline -20                  # what has actually been done
git log --oneline -- <the file>        # and to this file specifically
git log --all --grep='<topic>'         # was this decided already?
```

Then check the durable records: the Post-MVP log in `tasks.md`, the AC text in
`spec.md`, the D-00x entries in `research.md`, and the data file itself.

**The repository is the source of truth. Your context is not.** If the two
disagree, the repository is right.

Three habits that follow from this:

- **Write the outcome down when the work lands, not when you plan it.** A task
  logged as "in progress" after it was finished and pushed is worse than no
  log — it actively misleads the next session.
- **Verify state from the files, not from a commit message.** Messages describe
  intent; the files carry what actually happened.
- **If you find yourself about to ask something that feels familiar, it probably
  is.** Search first.

---

## 10. Working style

- Surface decisions rather than making them quietly. When a choice would change
  what the musician gets, ask — with the trade-offs named, not just the options.
- Be concise. State the finding, not the journey.
- Report failures plainly, with the output.
- When the maintainer challenges something, check whether they are right before
  defending it. On this project they usually have been.
