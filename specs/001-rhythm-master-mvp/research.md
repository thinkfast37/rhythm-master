# Phase 0 Research: Rhythm Master MVP

Every decision below was posed to the maintainer and chosen by them. Alternatives are recorded so a
later reader can see what was weighed rather than assuming the choice was arbitrary.

---

## D-001 — Build tooling and rendering approach

**Decision**: Vanilla JavaScript ES modules, built with Vite.

**Amended 2026-08-18** (Constitution 3.5.0): the Vite build is unchanged and remains the *only*
build of the application. What is new is that its output, `dist/`, is also the payload of a native
shell for the App Store and Google Play (D-009). Nothing here reverses: the shell was chosen
precisely because it wraps the existing bundle rather than requiring a second toolchain, a
framework, or a fork of `src/`. The one addition to `src/` is `src/billing/`, an impure adapter
layer that is a no-op on the web (D-010).

**Rationale**: The predecessor was plain `<script>` tags and its problems were not framework-shaped
— they were that musical arithmetic was duplicated across views and that shared mutable `var`
globals made state hard to reason about. ES modules plus a pure `core/` layer fix both without
taking on a framework. Vite supplies a dev server, a bundled static build for GitHub Pages, and —
critically — an npm-based test runner, which FR-014's per-AC requirement makes non-optional.

**Alternatives considered**:
- *Svelte* — would make the pure-state-to-render contract nearly free and handle the 192-Slot grid
  re-render automatically. Rejected as a maintenance and learning cost not justified for a
  single-maintainer project whose rendering needs are one grid and a list.
- *React* — largest ecosystem, most contributor-familiar. Rejected on runtime weight and because
  the playback cursor would need deliberate memoisation to avoid re-rendering 192 Slots per tick.
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

## D-003 — Melodic and percussive voicing

**Decision (revised 2026-08-17)**: port the predecessor's synthesised audio engine verbatim, for
both Sound Modes. No samples, no soundfont, no audio assets at all.

**How this changed.** The original decision was a full sampled soundfont, on the reasoning that
US-2.4 existed because synthesis "sounded wrong for melodic practice". That reasoning was
second-hand — it came from the predecessor's early oscillator voicing, not from the engine the
predecessor actually ships today, which had since gained a chorus, a filter sweep, a synthesised
reverb, and a compressor. Once the rebuild was playable the maintainer heard both and preferred the
predecessor's. The sampled path was removed.

**What is ported:**

- *Percussive*: one sine oscillator per hit, bending down to 0.85× over a 0.1 s decay, through the
  shared compressor. The pitch bend is what makes it read as a struck drum rather than a beep — its
  absence was the specific reason the first rebuild attempt sounded harsh.
- *Melodic*: three detuned sine oscillators (chorus) into a shared gain envelope shaped per Accent
  Level, a low-pass sweeping 2000 → 600 Hz over the decay, then a dry path plus a 35% reverb send.
- *Shared*: one `DynamicsCompressor` and one `ConvolverNode` whose impulse response is synthesised
  from decaying noise at runtime, so there is still no audio file anywhere.

**What this bought back.** The app is a genuinely self-contained static artifact again — no CDN, no
vendored megabytes, nothing to fetch, nothing to cache, and no melodic loading state to design
around. Constitution Principle V's standing sampled-piano exception is now unused; it can be
retired at the next amendment.

**Alternatives considered**: a sampled soundfont from a CDN (rejected — someone else's uptime for a
core feature); a vendored soundfont (built, then removed — several MB in the repo for a sound the
maintainer liked less); a small pitch-shifted sample set (rejected earlier on stretch artefacts, and
moot now).

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

A second, non-colour channel is retained regardless, because at 192 Slots on a phone a size
difference is faster to scan than a hue difference for *any* user. Which channel carries it is a
revisable design decision rather than a constraint.

**Amended 2026-08-17: the second channel is bar width along the Slot's bottom edge, not fill
height.** Fill height put a moving horizontal boundary inside the cell, and the counting syllable
lives in that cell too. Measured, the fill's top edge landed 0.4px below the text baseline at Weak
and 2.8px above the cap height at Medium — so at two of the three levels the colour changed within
3px of the letters, and at Medium the syllable also flipped to dark and sat on the seam. There is no
value of the fill percentage that avoids this: the boundary sweeps vertically through the exact band
the text occupies, by construction.

The level is now a fixed-height bar along the bottom edge, encoded by width (33 / 67 / 100%) and
colour. This keeps the redundant size channel and the rationale above intact, while the cell's
background stays flat at every level — so the syllable sits on one ground, keeps one colour, and
nothing about the text changes as the accent changes. The dark-text-on-light-fill flip is retired
with it.

*(Raised by the maintainer, who reads the grid with a dyslexia-friendly font override. A face with a
large x-height and heavy weighted bottoms pushes the glyphs further into the fill's sweep, so the
collision this fixes is worse in the rendering that actually matters than in the one the design was
checked in.)*

**Alternatives considered**: dot count (too small to count at mobile density); border weight
(compact and leaves the cell interior free for pitch labels, but weakest at fast discrimination);
variable cell height (most notation-like, but breaks uniform row alignment); flat colour with no
second channel at all (the maintainer's own first suggestion — simplest, and CVD-safe on the palette
alone, but gives up the fast-scan channel and still needs the dark-text flip).

**Verification**: an automated check renders the accent palette under simulated deuteranopia,
protanopia, and tritanopia and asserts a minimum perceptual distance between all four states
(off, Weak, Medium, Strong). Palette changes cannot land without passing it.

---

## D-006 — Mobile layout for the densest Pattern

**Decision**: One Measure per row, stacked vertically, read down the page. Minimum Slot width
24 CSS px. Playback auto-scrolls the sounding Measure into view.

**Rationale**: The worst case is 192 Slots on a 390 px viewport. Fitting that on one line means
Slots under 3 mm — below a reliable tap target and too small for any accent indicator to read.
Per-Measure rows keep Slots finger-sized, eliminate horizontal scrolling entirely, and make the
Measure boundary structurally obvious rather than a drawn line. Reading down the page also matches
how the app is actually used: a phone propped on a music stand (SC-007).

*(Figures updated 2026-08-17: the worst case was 144 Slots when the Measure cap was 6. Raising the
cap to 8 (AC-1.1.3) made it 192. The decision is unchanged and the reasoning is strengthened, not
contradicted — a denser worst case makes per-Measure rows more necessary, not less, since the
per-row Slot count is fixed by the Time Signature and does not move with the cap. What does move is
the page's total length, which is why AC-15.1.11's auto-scroll carries more weight now than it did.)*

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

**Amended 2026-08-18** (Constitution 3.5.0): GitHub Pages becomes *one* distribution channel of
three, and an optional one. The maintainer: *"I want the web version to keep working, so I can
test locally and optionally on github pages at times. but i may not host always on github pages."*
So the web build MUST keep working stand-alone (local `vite preview` or any static host) — it is
the free version and the test bed — and the Pages workflow stays as-is but is no longer the
definition of "delivered". The other two channels are the App Store and Google Play builds
produced from the same `dist/` (D-009). Those cannot run inside the CI gate without signing
secrets, so CI additionally runs `npx cap sync` to prove the shell still assembles, and the
maintainer archives and uploads from Xcode / Android Studio by hand following
`docs/app-store-setup.md`. The verify → build → deploy contract of the Pages job is unchanged.

**Rationale**: Same zero-cost static hosting as the predecessor, and gating the deploy on the suite
is what gives FR-014 teeth — a failing AC cannot reach the live site. The workflow is
test → build → publish, on push to `main`.

**Alternatives considered**: publishing without a CI gate (faster, but nothing enforces the suite);
deferring deployment entirely (no live URL during the build, and the deploy path stays untested
until it matters most).

---

## D-009 — Native shell for the App Store and Google Play

**Decision (2026-08-18)**: Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`,
`@capacitor/android`), wrapping the unchanged Vite `dist/` in generated `ios/` and `android/`
projects at the repository root, configured by `capacitor.config.json` (`webDir: "dist"`).

**Rationale**: the app is one grid, a list and Web Audio; every line of it already runs in a
mobile WebView. Capacitor is the smallest step from "static site" to "store listing": it copies
`dist/` into a native container, adds a JS bridge only where a plugin is imported, and needs no
change to the source. It is maintained by Ionic, SPM-ready for iOS, and its plugin ecosystem
covers the one native capability this needs (billing, D-010). Distribution mechanics — App
Store Connect, Play Console, signing, screenshots, review — belong to the maintainer and are
written up step by step in `docs/app-store-setup.md`; neither Xcode nor Android Studio was
present on the development machine when this decision was made, and the scaffolding
deliberately does not require them.

**Consequences accepted**:
- The WebView's `localStorage` is the same store the web app uses, so saved Patterns carry
  over conceptually — but iOS may evict WKWebView storage under pressure. Backing
  `storage/keyValue.js` with the native Preferences plugin inside the shell is logged as a
  follow-up task, not folded in here.
- Web Audio needs a user gesture to start on iOS; the app already begins playback from a tap.
- Safe areas: `viewport-fit=cover` and `env(safe-area-inset-*)` padding are added to the shell's
  layout so the notch and home indicator do not cover controls.

**Alternatives considered**:
- *Progressive Web App only* — no store presence, no store billing. Rejected: the request was
  for the stores and for a subscription.
- *React Native / Flutter rewrite* — throws away a tested application for no musical gain.
  Rejected on Principle V.
- *Cordova* — the same idea, older tooling, weaker maintenance. Rejected.
- *Tauri Mobile* — Rust toolchain, younger mobile story, no billing plugin of note. Rejected.

---

## D-010 — Selling the app: store billing, a trial, a subscription and an outright purchase

**Decision (2026-08-18)**: `@capgo/native-purchases` (StoreKit 2 on iOS, Play Billing 7 on
Android; MIT; no hosted service; the JS API is `getProducts`, `purchaseProduct`,
`getPurchases({ onlyCurrentEntitlements })`, `restorePurchases`, `manageSubscriptions`). Two
products, identical ids on both stores:

| Product id | Kind | What it is |
|---|---|---|
| `rm.monthly` | Auto-renewable subscription, monthly | Carries the **3-day free trial** as its introductory offer (Apple: introductory offer, Free Trial, 3 days; Google: base plan `monthly` with a 3-day free-trial offer). |
| `rm.lifetime` | Non-consumable | **Buy outright.** Permanent entitlement. |

Prices are set in App Store Connect and Play Console, never in code, and the paywall shows the
store's own `title` and `priceString` (an App Review requirement).

**The trial is the store's introductory offer on the subscription, not an app-side clock.** The
maintainer's own description was the flow: *"a person may use the app for 3 days, subscribe for a
few months and then decide to buy it."* "Start your free 3-day trial" begins the subscription; the
musician can cancel inside the three days and pay nothing; the store enforces one trial per Apple
ID / Google account; a reinstall cannot reset it; Restore Purchases recovers it. An app-side timer
was considered and rejected: on Android it is reset by reinstall, on iOS App Review guideline
3.1.1 requires a trial for a non-subscription app to be a $0 non-consumable named "*N*-day
Trial" anyway, and either variant means the app rather than the store keeps a clock.

**Entitlement is pure.** `core/entitlement.js` takes the store's list of current purchases and
`now` and returns one of `trial | subscribed | lifetime | none` plus the date that matters
(trial end, renewal, or nothing). It has no idea where the purchases came from. Three adapters
in `src/billing/` supply them: `native.js` (the plugin, used only inside the shell), `web.js`
(always entitled: `lifetime`, no products, no paywall — the free web version), and `fake.js`
(scripted, for Playwright, selected by `?billing=fake` and driven from `window.__rmFakeStore`).
`main.js` picks the adapter by `Capacitor.isNativePlatform()`, and the web bundle never loads
the plugin.

**Gating**: with entitlement `none` the shell shows the paywall and nothing else. Trial,
subscribed and lifetime are all "full app". The paywall offers the two products, **Restore
Purchases**, **Manage subscription** (when subscribed), and links to Terms and Privacy Policy
(`terms.html`, `privacy.html`, shipped in `dist/` and also on the site). Purchase state is
never trusted from `localStorage`: the store is queried on every launch and after every purchase.

**Alternatives considered**:
- *RevenueCat / Adapty / Glassfy* — nicest dashboards, but a hosted entitlement service with an
  API key in the client. Rejected: it is the "sync service" Principle V forbids and needs a
  secret the no-secrets clause forbids.
- *cordova-plugin-purchase* — long-lived and capable, but its receipt validation path pushes
  toward a hosted validator and its iOS side is StoreKit 1. Rejected.
- *A separate paid app and a free app* — two listings, no trial, no subscription. Rejected:
  does not meet the request.
- *Gate the web build too* — needs a payment provider and a backend. Rejected by the
  maintainer: the web version stays free.

---

## D-011 — Chord progressions: roles resolved through the chord in force, one timeline per pass

**Decision (2026-09-12)**: a progression is stored as concrete chords on the Pattern; a Slot may hold a
chord-tone *role* instead of a degree; the one timeline takes the pass index and resolves each role
through the chord in force for that pass and Measure.

**Why roles, not notes.** The maintainer's ask is one rhythm played through a progression — one chord
per pass, or one per Measure — and "one note per rhythmic syllable". A Slot therefore has to sound
a different note under each chord while storing one thing. Storing the note would need a Pattern per
chord; storing a degree would need re-stamping on every chord change. A role (Root, 3rd, 5th, 7th,
9th) is what the musician thinks in, resolves against any chord, and keeps AC-2.2.1's one-Pitch-per-
Slot invariant literally true: `{ tone, octaveOffset }` is the second shape a Pitch can take.

**How a role resolves.** The chord's root sits at the Pitch's octave; members stack above it by the
quality's intervals, so the 5th of G in C at octave 4 is D5 — the shape an arpeggio has when played.
A role the chord lacks sounds the chord's next-lower member (7th on a triad → 5th). That rule was
chosen over "silence" (a rest the Composer did not write), over "the diatonic 7th" (which reintroduces
the scale into resolution, contradicting AC-2.5.5's structure), and over "refuse to stamp" (a
progression can mix triads and sevenths, so any role can be right for one chord and absent on the next).

**How chords are spelled.** Choosing a catalogue entry writes concrete chords once — degree tokens
of the Key with qualities stacked in thirds from the scale's own degrees. Seven-note scales spell
directly. Pentatonic and blues scales lack degrees to stack, so they borrow the parallel Ionian, or
Aeolian when the scale has ♭3 and no 3. A step whose root is outside the scale (♭VII in Ionian) takes
the catalogue's own quality or a major triad. After that the chords are the Composer's data: changing
the scale never rewrites them (consistent with AC-2.5.5), and each is editable by root and quality.

**One timeline, parameterised by pass.** `buildTimeline(pattern, pass)` is still the only place
timing, accent and pitch compose (SC-003). The alternative — one timeline spanning the whole harmonic
cycle — was rejected because it would move AC-4.1.9's edit pickup from the next pass to the next
cycle (four passes under a four-chord progression). Instead the scheduler rebuilds the pass's
timeline at each pass boundary it already crosses, the cursor keeps its `loop` index, and MIDI export
concatenates the cycle's passes from the same function. The cycle is `n` passes when the chord
changes every pass and `lcm(n, M) / M` when it changes every Measure.

**Amended 2026-09-12: the arpeggio is a derived deal, not stamped data.** The first build offered a one-shot Fill that wrote roles into the Slots. The maintainer expected an arpeggio to be a setting the notes follow ("c e g c e g over and over"), so `harmony.arpeggio` now names an order and the roles are dealt at play time across the sounding Slots, continuously through the pass, from the one timeline. Stored Pitches are kept underneath and return with None. Chosen over auto-stamping on every rhythm edit (which would silently rewrite hand-authored roles) and over making Fill re-run itself (which is the same thing with a worse name).

**Amended again 2026-09-12: a pattern is a step sequence.** Chord-tone orders could not say "the Key's tonic an octave up between every note" or "walk the major scale from the chord's root", both of which the maintainer plays. A step is now one of three kinds — a chord tone at an octave, a drone (the Key's tonic or the chord's root, at an octave), or the n-th step of a named scale rooted on the chord — and every catalogue entry is a sequence of them, built from the progression's roles and the walk's scale. The deal restarts on every chord change so each chord opens on its own root. The same engine is what a future "type your own sequence" would parse into.

**Not a longer grid.** The maintainer floated raising the 8-Measure cap for long progressions. Kept
at 8: the chord strip carries the progression across passes, and the cap is what every phone-layout
criterion (AC-15.1.10, AC-2.2.12) is measured against.

**Alternatives considered**: per-chord Pattern copies chained by Append (rejected — eight Measures
cannot hold a twelve-bar blues, and the melody would be re-authored per chord); a global "chord
mode" transposing whole Patterns (rejected — transposition is not chord quality); storing qualities
as scale-relative and re-deriving on scale change (rejected — a scale change would silently rewrite a
chord the Composer had set by hand).

---

## D-012 — Sheet music: an engraver of our own over SVG, printed by the browser

**Decision (2026-09-12)**: the score is drawn by the app itself — a pure `core/notation.js` that turns a
Pattern into notes, rests, beams, tuplets, ties, staff positions, accidentals and key signatures, and a
`ui/score.js` that draws that model as inline SVG. No notation library. The PDF is the browser's own
print dialog over a print stylesheet that hides everything but the score.

**Why our own engraver.** The maintainer's one hard requirement is accuracy: "the notes have to be
either on the lines or between the lines". That is a property to *prove*, and a model the app
computes can be tested to the staff step — middle C on the first ledger line, F5 on the top line —
where a library's output can only be eyeballed. The vocabulary is also small enough that a library
would be mostly unused: seven Recipes that all divide a Beat evenly, so every value is a quarter,
eighth, sixteenth, dotted eighth or a tuplet member; no ties across Beats, no dotted rests, no
cross-staff anything. VexFlow was the alternative considered (rejected: a large dependency for a
few dozen glyphs, its layout is not unit-testable, and the Constitution's dependency rule asks
exactly this question); abcjs was rejected for the same reasons plus a second notation language in
the middle. The glyphs — clefs, noteheads, flags, rests, accidentals, the accent mark — are SVG paths
drawn in staff-space units, so the score scales with the staff and prints as vectors.

**What a Slot becomes.** A sounding Slot's written value runs to the next sounding Slot in its Beat
or to the Beat's end, because that is how a rhythm is written and read: a lone first Slot of Straight
8ths is a quarter note, not an eighth and an eighth rest. The MIDI file's fixed short note length is
unaffected — it is a playback articulation, not a written value. Rests before the first sounding
Slot are written largest-first and never dotted, which is the convention a reader expects. A held
value never crosses a mixed Recipe's tuplet boundary; it is tied, because a single note cannot be
half in a tuplet.

**Spacing is proportional to time.** Engravers space notes non-linearly; this score spaces them by
time within each Measure. It is a practice tool whose grid the musician has just been looking at,
and a proportional score lines the count up under the notes exactly as the grid does. Chosen
knowingly over engraving convention.

**Key signatures follow the scale.** A mode's signature is its relative major's (D Dorian: none;
C Aeolian: three flats), computed from the Key's Ionian signature and the mode's offset. Scales that
are not modes borrow the parallel Ionian's, or Aeolian's when they have ♭3 and no 3 — the same rule
D-011 uses to spell chords, so the two never disagree about what "C minor" means. A mode that would
need more than seven accidentals (D♭ Locrian) falls back to the Key's Ionian signature; the
alterations are then written inline, which is always correct if not always pretty.

**Print, not a PDF writer.** The print dialog gives a vector PDF of the same SVG on every platform
the app runs on, with no second rendering path to keep accurate and no dependency. A hand-written PDF
writer was considered for a one-tap download and rejected for now: the accuracy requirement is met by
having one drawing, and a second emitter is a second place for a note to land on the wrong line.
Revisit only if the print dialog proves unusable on a phone in practice.

**Not a second model.** The score is a rendering of the one Pattern and the one transport position
(FR-013), read-only, with no data of its own: the Grid | Sheet choice is an app preference like the
counting system (`rm.settings.v1`), and no Pattern field was added. A note's sounding pitch is still resolved by `core/pitch.js` and `core/harmony.js`; the
engraver asks them for the spelled name and places the letter, so the score and the piano cannot
disagree about which note a Slot is.

---

## Open items deliberately left to implementation

These are genuinely low-stakes and do not need a decision before tasks are written:

- The exact accent palette values, beyond passing the CVD check.
- The metronome click timbre, beyond being audibly separable from Pattern voices.
