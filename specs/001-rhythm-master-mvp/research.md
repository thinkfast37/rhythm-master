# Phase 0 Research: Rhythm Master MVP

Every decision below was posed to the maintainer and chosen by them. Alternatives are recorded so a
later reader can see what was weighed rather than assuming the choice was arbitrary.

---

## D-001 — Build tooling and rendering approach

**Decision**: Vanilla JavaScript ES modules, built with Vite.

**Rationale**: The predecessor was plain `<script>` tags and its problems were not framework-shaped
— they were that musical arithmetic was duplicated across views and that shared mutable `var`
globals made state hard to reason about. ES modules plus a pure `core/` layer fix both without
taking on a framework. Vite supplies a dev server, a bundled static build for GitHub Pages, and —
critically — an npm-based test runner, which FR-014's per-AC requirement makes non-optional.

**Alternatives considered**:
- *Svelte* — would make the pure-state-to-render contract nearly free and handle the 144-Slot grid
  re-render automatically. Rejected as a maintenance and learning cost not justified for a
  single-maintainer project whose rendering needs are one grid and a list.
- *React* — largest ecosystem, most contributor-familiar. Rejected on runtime weight and because
  the playback cursor would need deliberate memoisation to avoid re-rendering 144 Slots per tick.
- *No build step at all* — matches the predecessor's edit-and-push workflow exactly. Rejected
  because it forecloses an npm test runner, and the per-AC suite is a constitutional hard gate.

---

## D-002 — Testing stack

**Decision**: Vitest for the pure core and storage layers; Playwright (Chromium) for grid
interaction, transport, audio/visual sync, and responsive behaviour.

**Rationale**: The AC set splits cleanly. The large majority — accent default tables, Recipe
expansion, meter arithmetic, swing offsets, pitch resolution, similarity detection, MIDI encoding —
are assertions about pure functions and are far cheaper and more exhaustive as unit tests. A
smaller set (Epics 4, 5, 15) is only meaningful through a real browser with a real audio clock.
Using both means neither category is tested through the wrong tool.

**Alternatives considered**:
- *Vitest only* — fast and simple, but leaves playback, grid, and responsive ACs with no automated
  coverage at all, which FR-014 forbids.
- *Playwright only* — highest fidelity, one tool. Rejected because asserting an accent-default
  table through the DOM is both slower and less precise than calling `defaultAccent()` directly.

**Coverage mechanism**: `tests/ac-coverage.js` parses AC IDs out of `spec.md` and test names out of
both suites, then reports any AC with no test. It runs in CI and fails the build on a gap, which is
what makes "every AC has a test" an enforced claim rather than an aspiration.

---

## D-003 — Piano samples for Melodic mode

**Decision**: A full sampled soundfont via `soundfont-player`, using an acoustic grand piano set.

**Rationale**: US-2.4 exists specifically because synthesised approximation sounded wrong for
melodic practice. A complete sampled set means every note is a real recorded note, with no stretch
artefacts at the extremes of the octave range. The constitution already carries a standing
exception permitting exactly this dependency.

**Alternatives considered**:
- *Small bundled sample set with pitch-shifting* — a few MB in-repo, fully offline, no third-party
  code. Rejected in favour of sound quality; stretch artefacts are most audible at the range
  extremes, which is where the octave controls invite the user to go.
- *Pure Web Audio synthesis* — zero bytes and instant. Rejected because it is the thing US-2.4 was
  written to replace.

**Consequences to handle in implementation**: The soundfont is fetched rather than bundled, so
Principle III's non-blocking rule is load-bearing here. Percussive playback must be fully available
before any sample has loaded, and Melodic play must show a loading state rather than failing
silently (AC-2.4.3). The fetch must be cached so a second melodic play is instant, and a failed
fetch must surface as a clear message rather than silence.

---

## D-004 — Storage structure

**Decision**: `localStorage`, split across three version-stamped keys — `rm.patterns.v1`,
`rm.localMeta.v1`, `rm.settings.v1`.

**Rationale**: Splitting the keys makes FR-006's Local Metadata separation structural: Pattern
serialization physically cannot reach Local Metadata, because it lives behind a different module
reading a different key. `localStorage`'s synchronous API keeps continuous auto-save (US-7.2)
trivial to reason about, and migrations are straightforward. The ~5 MB budget comfortably holds
Patterns at their real size — the 112 seeded Patterns are well under 1 MB.

**Alternatives considered**:
- *IndexedDB* — effectively unlimited, with per-Pattern records rather than one blob rewritten on
  each keystroke, which is a genuinely better fit for continuous auto-save. Rejected as
  disproportionate: an async API and a heavier migration story for a capacity problem this app does
  not have.
- *A single localStorage key* — simplest possible. Rejected because it makes FR-006 a naming
  convention rather than a guarantee.

**Note**: Storage exhaustion was explicitly considered and dropped as an edge case not worth
specifying (see the spec's validation record). This decision does not reopen it.

---

## D-005 — Accent Level visual encoding

**Decision**: A colour-vision-deficiency-safe palette carries the requirement; fill height is used
alongside it as a design choice.

**Rationale**: The prior constitutional rule forbidding colour-alone encoding was inherited from a
sibling project's accessibility section, not requested here, and the maintainer identified it as
such. The real requirement is that a musician with common CVD can tell the three levels apart —
which a deuteranopia- and protanopia-safe palette satisfies on its own. Constitution v3.0.0 was
amended accordingly, and FR-012 rescoped in the same change.

Fill height is retained in the design regardless, because at 144 Slots on a phone a height
difference is faster to scan than a hue difference for *any* user. It is now a revisable design
decision rather than a constraint.

**Alternatives considered**: dot count (too small to count at mobile density); border weight
(compact and leaves the cell interior free for pitch labels, but weakest at fast discrimination);
variable cell height (most notation-like, but breaks uniform row alignment).

**Verification**: an automated check renders the accent palette under simulated deuteranopia,
protanopia, and tritanopia and asserts a minimum perceptual distance between all four states
(off, Weak, Medium, Strong). Palette changes cannot land without passing it.

---

## D-006 — Mobile layout for the densest Pattern

**Decision**: One Measure per row, stacked vertically, read down the page. Minimum Slot width
24 CSS px. Playback auto-scrolls the sounding Measure into view.

**Rationale**: The worst case is 144 Slots on a 390 px viewport. Fitting that on one line means
Slots under 3 mm — below a reliable tap target and too small for any accent indicator to read.
Per-Measure rows keep Slots finger-sized, eliminate horizontal scrolling entirely, and make the
Measure boundary structurally obvious rather than a drawn line. Reading down the page also matches
how the app is actually used: a phone propped on a music stand (SC-007).

**Alternatives considered**:
- *Horizontal scroll inside the grid region* — what AC-15.1.10 originally specified. Preserves the
  single-timeline reading, but you can never see the whole Pattern and sideways scrolling mid-
  practice is awkward.
- *Shrink Slots to fit* — whole Pattern always visible, at the cost of untappable Slots.

**Spec impact**: AC-15.1.10 was rewritten from the horizontal-scroll formulation, and AC-15.1.11
added for playback autoscroll.

---

## D-007 — Automatic vs. user Tag styling

**Decision**: Automatic Tags render as outlined chips with no removal affordance; user Tags render
as filled chips carrying a "×".

**Rationale**: Chip treatment carries the distinction, so it survives monochrome and CVD without
depending on hue. The absent "×" also makes "you cannot remove this" self-evident from the control
itself rather than from a lock glyph the user has to interpret.

**Alternatives considered**: a leading lock/gear glyph plus sort priority (explicit, but adds noise
to every chip); separate labelled rows (unmistakable, but costs vertical space on every Pattern
header — expensive on mobile).

**Spec impact**: AC-5.3.5's "e.g. a lock indicator" was replaced with the concrete outlined/filled
treatment.

---

## D-008 — Deployment

**Decision**: GitHub Pages, published by a GitHub Actions workflow that runs the full test suite
before building.

**Rationale**: Same zero-cost static hosting as the predecessor, and gating the deploy on the suite
is what gives FR-014 teeth — a failing AC cannot reach the live site. The workflow is
test → build → publish, on push to `main`.

**Alternatives considered**: publishing without a CI gate (faster, but nothing enforces the suite);
deferring deployment entirely (no live URL during the build, and the deploy path stays untested
until it matters most).

---

## Open items deliberately left to implementation

These are genuinely low-stakes and do not need a decision before tasks are written:

- The exact accent palette values, beyond passing the CVD check.
- The metronome click timbre, beyond being audibly separable from Pattern voices.
- Whether the soundfont is fetched from a CDN or committed as an asset — a size-versus-offline
  tradeoff best judged once the actual file size is known. Note that a CDN fetch must still respect
  the no-external-dependency-at-runtime spirit of Principle V; if it proves fragile, commit it.
