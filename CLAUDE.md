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
npm run validate:seed # the shipped library against data-model §7
npm run check:cvd     # accent palette under simulated colour blindness
```

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

**AC coverage must stay at 100%.** A new AC without a test is an incomplete
change, not a passing one. Commit messages cite the US/AC IDs they touch.

---

## 5. Architecture rules that are enforced, not suggested

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

## 6. Curating the shipped library

Built-in Patterns' own Tags are locked in the UI on purpose — they describe what
a Pattern *is*, and a user should not be able to lose "Latin" from Bossa Nova.

So **curation is a data change**: edit `data/seed-patterns.json` directly, then
`npm run validate:seed`. Do not add a maintainer mode to work around the lock; a
second way to change shipped data would drift from the file.

Tags a user adds to a built-in Pattern live in `rm.overlays.v1` under
`addedTags`, alongside the Pattern's own rather than replacing them.

---

## 7. Where things live

| Path | What |
|---|---|
| `.specify/memory/constitution.md` | Principles and quality bars. Amending needs a version bump. |
| `specs/001-rhythm-master-mvp/spec.md` | User Stories and Acceptance Criteria — the contract. |
| `specs/001-rhythm-master-mvp/research.md` | Technical decisions (D-00x) with rejected alternatives. |
| `specs/001-rhythm-master-mvp/data-model.md` | Pattern shape, storage schema, validation rules. |
| `specs/001-rhythm-master-mvp/tasks.md` | MVP build plan, plus the Post-MVP task log. |
| `data/seed-patterns.json` | The 112 shipped Patterns. Plain data — see `data/README.md`. |
| `src/core/` | Pure musical arithmetic. |
| `tests/ac-coverage.js` | The gate that makes per-AC testing real. |

---

## 8. Working style

- Surface decisions rather than making them quietly. When a choice would change
  what the musician gets, ask — with the trade-offs named, not just the options.
- Be concise. State the finding, not the journey.
- Report failures plainly, with the output.
- When the maintainer challenges something, check whether they are right before
  defending it. On this project they usually have been.
