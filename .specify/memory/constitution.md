<!--
SYNC IMPACT REPORT
==================
Version change: 2.0.0 → 3.0.0
Modified principles:
  - Principle II — retitled from "Grid Consistency & Non-Color Encoding" to "Grid Consistency &
    Accent Legibility". The rule requiring Accent Level to carry a non-color indicator was
    REMOVED. It was inherited from a sibling project's accessibility section, not requested here,
    and survived the 2.0.0 rewrite only because it was relocated rather than re-examined. Replaced
    with a color-vision-deficiency requirement: the three Accent Levels, Slot on/off, and the
    straight/triplet group boundary MUST be distinguishable to users with common CVD, which a
    deuteranopia- and protanopia-safe palette satisfies on its own.
  - Visual & Audio Clarity — same replacement applied to its visual-clarity clause.
  - Governance — the non-negotiable clause list drops the non-color-encoding entry and now has
    four entries.

MAJOR bump rationale: a NON-NEGOTIABLE clause was removed, which is a backward-incompatible
redefinition of Principle II. Per the amendment procedure, the documented justification is that
the clause was never a maintainer requirement: it encoded a monochrome-legibility guarantee
imported from another project, whereas the actual requirement is that the levels be told apart by
users with color vision deficiencies. Using a second visual channel (fill height) remains the
intended design and is recorded in plan.md, but as a design decision that may be revised, not as
a constitutional constraint.

Added sections: None
Removed sections: None

Templates reviewed:
  - .specify/templates/plan-template.md   ✅ — Constitution Check remains the enforcement point
  - .specify/templates/spec-template.md   ✅ — unaffected
  - .specify/templates/tasks-template.md  ✅ — unaffected

Follow-up required: None.
  - spec.md's FR-012 was rescoped in the same change to require CVD-distinguishable encoding
    rather than a non-color indicator.

Deferred TODOs: None.
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

### II. Grid Consistency & Accent Legibility

The rendered Pattern grid is the single on-screen source of truth. Every control
(time signature picker, Recipe picker, pitch strip, counting-system toggle, tempo,
swing) MUST update the one shared grid view — never spawn parallel or secondary grid
instances.

- Visual state (Slot on/off, Accent Level, assigned Pitch, active-playback position,
  Time Signature prominence) MUST be a pure, deterministic function of the current
  Pattern state plus transport position. No hidden mutable UI variable may hold display
  state that can diverge from the canonical Pattern object.
- **The three Accent Levels (Weak / Medium / Strong) MUST be reliably distinguishable
  from one another, and from an off Slot, by users with common color vision
  deficiencies** — deuteranopia, protanopia, and tritanopia. Accent Level is core musical
  information, not decoration, so a palette whose levels collapse into each other under
  simulated CVD is a defect. How the distinction is achieved is a design decision: a
  CVD-safe palette satisfies this on its own, and a second visual channel may be used
  where it also improves scannability.
- Slot on/off state, and the distinction between straight-feel and triplet-feel
  Subdivision Groups within a mixed Recipe, MUST meet the same standard.
- The grid MUST remain readable and tappable at the largest Pattern the app permits
  (6 Measures of 12/8 at Straight 16ths = 144 Slots) on a 390 px-wide viewport. Overflow
  is contained to the grid's own scroll region; the page body MUST NOT scroll
  horizontally.

**Rationale**: A drifting visual model creates silent inconsistencies that are harder to
debug than crashes. Accent Level is musical content, not styling — a palette that renders
two levels indistinguishable to a colorblind musician is showing them the wrong pattern.

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

## Visual & Audio Clarity

The Composer must be able to tell, at a glance and by ear, exactly what a Pattern is doing.
Both are treated as correctness criteria, not polish.

**Visual clarity**

- The three Accent Levels MUST stay distinguishable from one another, and from an off Slot,
  under common color vision deficiencies (Principle II). Verifying this against a CVD
  simulation is part of accepting any change to the grid palette.
- Slot on/off state, and the boundary between straight-feel and triplet-feel groups inside a
  mixed Recipe, MUST meet the same standard.
- The grid MUST stay legible at the densest Pattern the app permits (6 Measures of 12/8 at
  Straight 16ths — 144 Slots) on a 390 px viewport, and Slots MUST stay reliably tappable there.

**Audio clarity**

- A Melodic Slot MUST sound at the exact pitch and octave it was authored at, resolved through
  the Pattern's Key. A wrong octave is a correctness failure, not a tuning preference.
- The three Accent Levels MUST be audibly distinct from one another at practice tempos, in both
  Percussive and Melodic modes — accent is musical content, and inaudible dynamics make a Pattern
  read as flat.
- The metronome click MUST remain audibly separable from the Pattern itself, so the reference
  pulse is never mistaken for content.

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
scope, clarity, traceability, and testing standards. Conflicting conventions in
code reviews, tickets, or other documents must be resolved in favor of this constitution.

**Amendment procedure**:
1. Propose a change via a pull request or equivalent review artifact that includes:
   (a) the changed principle text, (b) rationale for the change, and (c) an assessment of
   impact on existing code, tests, and the spec's AC set.
2. Any amendment that weakens a NON-NEGOTIABLE clause requires explicit documented
   justification. The non-negotiable clauses are:
   - Principle I in its entirety (rhythmic and metric correctness)
   - The per-AC automated test requirement in Principle IV
   - The no-secrets-in-client-code clause in Principle V
   - The Local Metadata separation rule in Client-Side Architecture Constraints
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

**Version**: 3.0.0 | **Ratified**: 2026-08-16 | **Last Amended**: 2026-08-17
