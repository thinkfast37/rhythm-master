<!--
SYNC IMPACT REPORT
==================
Version change: [unversioned template] → 1.0.0
Modified principles: N/A (initial population — all placeholders replaced)

Added sections:
  - Core Principles (I–V)
  - Accessibility & Inclusive Design
  - Client-Side Architecture Constraints
  - Governance

Removed sections: None (no prior content)

Templates reviewed:
  - .specify/templates/plan-template.md   ✅ — Constitution Check section present; Principle IV's
    per-AC test-coverage requirement and Principle V's no-backend constraint are both checkable
    at plan time; no structural misalignment
  - .specify/templates/spec-template.md   ✅ — User story / acceptance criteria structure aligns
    with the US-x.y / AC-x.y.z traceability scheme mandated by Principle IV
  - .specify/templates/tasks-template.md  ✅ — task categorization compatible with per-AC test
    tasks and P0 correctness-bug handling

Deferred TODOs: None — all placeholders resolved.
==================
-->

# Rhythm Master Constitution

## Core Principles

### I. Rhythmic & Metric Correctness (NON-NEGOTIABLE)

All meter, beat, subdivision, accent, swing, and pitch calculations MUST derive from a
single canonical rhythm/meter module — never duplicated or hardcoded per-view or
per-component. This module is the sole arithmetic authority for the entire app.

- Beat-count-from-time-signature, subdivision Recipe expansion, metric accent
  derivation, swing offset calculation, and scale-degree-to-frequency resolution MUST
  be implemented as pure, deterministic functions with no side effects.
- **Beat count always equals the time signature's numerator**, for every supported
  meter, with no assumed sub-grouping. 7/8 is seven eighth-note Beats — never three
  Beats grouped 2+2+3. 6/8 is six eighth-note Beats — never two dotted-quarter Beats.
  No view, export, or playback path may reinterpret a meter into an implied grouping
  the user did not author.
- **Metric accent defaults MUST be computed, never stored per-Slot.** A Slot's default
  Accent Level is a pure function of its position (which Beat, and where within that
  Beat's Recipe), recomputed on demand. A user override is stored; a default is not.
- **Swing applies only to straight-feel Subdivision Groups**, per group, never to
  triplet-feel groups and never as a single Pattern-wide value.
- Unit tests for this layer are a **hard gate**: no rhythm/meter function ships without
  tests covering every supported time signature, every Recipe (including both mixed-feel
  split Recipes), the Accent-default table at both Beat and Slot level, swing offsets at
  boundary values (0 and 100), and Pitch resolution across the full octave range in
  every supported Key.

**Rationale**: Incorrect beat counts, accents, or pitches destroy practice value
instantly — a musician drilling against a wrong pattern internalizes the wrong thing.
Rhythm bugs are never cosmetic; they are P0 correctness failures regardless of where
they surface.

### II. Grid Consistency & Non-Color Encoding

The rendered Pattern grid is the single on-screen source of truth. Every control
(time signature picker, Recipe picker, pitch strip, counting-system toggle, tempo,
swing) MUST update the one shared grid view — never spawn parallel or secondary grid
instances.

- Visual state (Slot on/off, Accent Level, assigned Pitch, active-playback position,
  Time Signature prominence) MUST be a pure, deterministic function of the current
  Pattern state plus transport position. No hidden mutable UI variable may hold display
  state that can diverge from the canonical Pattern object.
- **Accent Level MUST NOT be conveyed by color alone.** The three active levels
  (Weak / Medium / Strong) MUST each carry a distinct non-color indicator — height,
  fill density, border weight, glyph, or text — so they remain distinguishable in
  monochrome and under common color vision deficiencies. This is the single highest-risk
  accessibility surface in the app, because Accent Level is core musical information,
  not decoration.
- Slot on/off state, and the distinction between straight-feel and triplet-feel
  Subdivision Groups within a mixed Recipe, MUST likewise be legible without relying on
  color alone.
- The grid MUST remain readable and tappable at the largest Pattern the app permits
  (6 Measures of 12/8 at Straight 16ths = 144 Slots) on a 390 px-wide viewport. Overflow
  is contained to the grid's own scroll region; the page body MUST NOT scroll
  horizontally.

**Rationale**: A drifting visual model creates silent inconsistencies that are harder to
debug than crashes. Accent Level encoded only as color is functionally invisible to a
meaningful share of users, and accent is musical content — not styling.

### III. Audio Timing & Playback Behavior

Playback scheduling MUST be driven by the audio clock (`AudioContext.currentTime`) via a
lookahead scheduler. Wall-clock timers (`setTimeout`/`setInterval`) MUST NOT determine
when a note sounds; they may only drive the scheduler's polling cadence.

- Timing MUST NOT drift over long playback sessions. Every scheduled event's time is
  computed from the Pattern's tempo and the transport's absolute audio-clock origin —
  never accumulated by adding intervals, which compounds error.
- Visual playback position MUST derive from the same scheduled event queue as the audio,
  not from an independently-timed animation loop, so the highlighted Slot cannot drift
  out of sync with what is heard.
- **Audio MUST NOT autoplay** on page load, Pattern load, or any state change. Playback
  begins only on direct user interaction with a transport control.
- The AudioContext MUST be created or resumed inside a user-gesture handler to comply
  with browser autoplay policy, and MUST tolerate being re-suspended by the OS or browser
  (notably iOS Safari after backgrounding) by resuming on the next user gesture.
- **Sampled-instrument loading MUST NOT block app usability.** Sample assets load
  asynchronously; browsing, viewing, and editing Patterns remain fully available while
  loading. Only playback paths that genuinely require the samples may wait on them, and
  they MUST show a loading state rather than failing silently. Playback paths that do not
  require samples MUST remain available throughout.

**Rationale**: A rhythm tool whose timing drifts is worse than useless — it actively
teaches bad time. Accidental autoplay violates browser policy and user trust. A blocking
asset download turns a practice tool into a loading screen.

### IV. Traceability & Testing Standards

Every requirement in this project carries a stable identifier: User Stories as
`US-<epic>.<story>`, Acceptance Criteria as `AC-<epic>.<story>.<n>`. These IDs are the
project's connective tissue and MUST be preserved across all artifacts.

- **Every AC MUST have at least one automated test that references its ID** in the test
  name or tag. The suite MUST be able to report, for any AC ID, whether it is covered.
  An AC with no corresponding test is an incomplete implementation, not a passing one.
- **Every commit, pull request, and non-obvious code comment MUST cite the US/AC IDs it
  implements or modifies**, so any line of behavior traces back to the requirement that
  justified it, and any requirement traces forward to its implementation and proof.
- Pure-logic modules (rhythm/meter arithmetic, accent computation, swing offsets, pitch
  resolution, duplicate/family detection) MUST have exhaustive unit-test coverage as a
  hard quality gate — these layers have no DOM dependency and every branch is cheaply
  testable.
- DOM-bearing modules (grid rendering, controls, transport wiring, persistence) MUST have
  tests exercising construction, event wiring, and state transitions. These need not be
  exhaustive, but every public function and every AC's Given/When/Then MUST be covered by
  at least one test somewhere in the suite.
- Any defect producing an incorrect beat count, subdivision, accent, pitch, or playback
  timing anywhere in the UI or in an export is classified **P0** (correctness bug),
  regardless of how infrequently triggered or how visually minor. P0 bugs block release.
- Renumbering an AC is a **breaking documentation change**: it MUST be accompanied by
  updating every test, comment, and cross-reference bearing the old ID in the same
  change. Retired IDs are never reused for different behavior.

**Rationale**: The spec is only worth what its enforcement is worth. Without per-AC test
mapping, "we implemented the spec" is an unverifiable claim. Without ID citation in
commits and tests, the spec silently drifts from the code within weeks and neither can be
trusted to describe the other.

### V. Simplicity & Scope Discipline

This is a **single-page, client-side** application. There is no backend, no server-side
persistence, no user accounts, and no authentication. These are permanent constraints,
not deferred features.

- User-created data (Patterns, Ratings, Tags, preferences) MAY be persisted in
  `localStorage` only. No remote storage, sync service, or third-party analytics SDK may
  be introduced.
- `localStorage` schemas and every portable export MUST carry a `schemaVersion` field.
  Any future format change MUST include a migration path that reads and upgrades
  prior-version data rather than silently discarding it.
- **No API keys, tokens, or secrets may appear in client code**, ever. The app is a
  static artifact served to anyone; anything embedded in it is public. Features requiring
  third-party write access MUST be designed around user-authenticated flows (e.g.
  handing the user a pre-filled form on the third party's own domain) rather than the app
  acting as an authenticated client.
- The dependency footprint MUST be kept minimal. Prefer native Web APIs (Web Audio,
  Canvas, SVG) over heavyweight UI frameworks. A new dependency requires explicit
  justification that it cannot reasonably be replaced with a modest amount of direct
  DOM/API code. **Standing exception**: a sampled piano soundfont is an accepted
  dependency — synthesized approximation was evaluated and rejected as insufficiently
  musical for melodic practice. This exception covers sample assets and a thin
  playback wrapper; it does not open the door to general audio frameworks.
- YAGNI applies strictly: do not build configuration hooks, plugin systems, or
  abstractions for hypothetical features. Implement the minimum surface area that
  satisfies current requirements.

**Rationale**: Scope creep toward a framework-heavy, backend-dependent SPA would
contradict the tool's purpose and its zero-maintenance hosting model. Keeping it lean
ensures it loads fast, remains auditable, and can be served as static files indefinitely.

## Accessibility & Inclusive Design

The Pattern grid MUST meet the following baseline requirements, treated as first-class
correctness criteria rather than polish:

- **Color-independence**: Every piece of musical information — Slot on/off, Accent Level,
  straight vs. triplet feel, active playback position — MUST have a non-color indicator
  (shape, size, border, glyph, or text) so it is interpretable in monochrome and under
  deuteranopia and protanopia.
- **Keyboard navigability**: Users MUST be able to reach and activate any Slot, Recipe
  picker, Time Signature control, and transport control without a pointing device.
- **Screen reader support**: Slots and controls MUST expose meaningful accessible names
  conveying musical position and state (e.g. "Measure 1, Beat 3, Slot 2 of 4, strong
  accent, D4") rather than unlabeled click targets.
- **Contrast**: All text and glyph indicators MUST meet WCAG AA contrast (4.5:1 for
  normal text) against their background in every Slot state.
- **Touch targets**: Interactive Slots MUST remain reliably tappable on a 390 px-wide
  viewport, including in the app's densest supported Pattern.

Accessibility defects that render the grid uninterpretable or unusable for a user with a
disability are treated as P0 correctness bugs, not cosmetic issues.

## Client-Side Architecture Constraints

These constraints govern how state, data, and rendering are wired together:

- **Pattern state model**: A Pattern is a single serializable object — an ordered sequence
  of Measures, each carrying its own Time Signature and Beats, each Beat carrying its
  Recipe and Slots, each Slot carrying Accent Level and (in Melodic mode) Pitch — plus
  Pattern-level Sound Mode, Key, Tags, and Rating. All rendering is a pure function of
  this object plus transport position. No component holds authoritative state outside it.
- **Local Metadata separation (MANDATORY)**: App-local bookkeeping *about* a Pattern —
  submission history, resolved-duplicate-prompt state, and any similar operational
  tracking — MUST be stored separately, keyed by Pattern identity, and MUST NOT be part
  of the Pattern's own definition. No such field may ever appear in an export or
  submission payload. A Pattern's portable form describes the music and nothing about
  this installation's history with it.
- **Provenance is durable**: Whether a Pattern shipped with the app or was authored by
  the user is a permanent property, not derived from mutable state. Shipped Patterns are
  never mutated in place; editing one produces a new user-owned Pattern.
- **No framework mandate**: This constitution deliberately does not name a rendering
  framework. That decision belongs in the plan document. Any framework chosen MUST
  support the pure-state-→-render contract above and MUST NOT require a build-time
  backend.
- **Dependency vetting**: Before adding any dependency, confirm (a) it is actively
  maintained, (b) its size contribution is justified against the app's fast-load goal,
  and (c) no standard Web API achieves the same result.

## Governance

This constitution supersedes all other project-level guidance on matters of correctness,
scope, accessibility, traceability, and testing standards. Conflicting conventions in
code reviews, tickets, or other documents must be resolved in favor of this constitution.

**Amendment procedure**:
1. Propose a change via a pull request or equivalent review artifact that includes:
   (a) the changed principle text, (b) rationale for the change, and (c) an assessment of
   impact on existing code, tests, and the spec's AC set.
2. Any amendment that weakens a NON-NEGOTIABLE clause (Principle I, the per-AC test
   requirement in Principle IV, the no-secrets clause in Principle V, or the Local
   Metadata separation rule) requires explicit documented justification.
3. Bump the constitution version per the rules below. Update the `Last Amended` date.

**Versioning policy**:
- **MAJOR**: Removal or backward-incompatible redefinition of a principle.
- **MINOR**: Addition of a new principle or section, or material expansion of guidance
  that imposes new requirements.
- **PATCH**: Clarifications, rewording, or typo fixes that do not change intent.

**Compliance review**: All feature plans and pull requests MUST pass the Constitution
Check step in the plan template before implementation begins. Any plan that requires
violating a principle MUST document the violation explicitly in the Complexity Tracking
table and receive sign-off before work starts.

**Tech stack decisions**: Choices of framework, bundler, test runner, storage library,
and deployment method belong in the plan document, not here. This constitution governs
behavior and quality bars regardless of stack.

**Version**: 1.0.0 | **Ratified**: 2026-08-16 | **Last Amended**: 2026-08-16
