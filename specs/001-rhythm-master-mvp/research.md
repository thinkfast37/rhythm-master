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

**Amended 2026-10-18 (US-19.7, Constitution 3.7.0).** One sampled voice returns, narrowly: the
Composer's guitar is the FluidR3_GM `acoustic_guitar_steel` that fret-navigator plays, fetched from
gleitz/midi-js-soundfonts through soundfont-player on first use of the Composer's Guitar view. Both
Sound Modes in Practice, and the Composer's piano, remain the synthesis above. The CDN objection
stands and is answered by the fallback rather than by vendoring: the synthesised melodic voice sounds
for every guitar note while the samples load or when they cannot, so the feature works offline at the
cost of timbre, never of silence (AC-19.7.2). The maintainer chose this over a synthesised plucked
string, told of the reversal: "for guitar — use the one in fret-navigator." See D-016.

**Amended 2026-10-24 (US-2.13, Constitution 3.9.0): the synth becomes a choice rather than the only
melodic voice.** A global setting picks Piano, Synth or Guitar for melodic playback, and Piano is the
default. The Composer plays the instrument on screen. The Guitar view is always the guitar. The Piano
view plays the synth when Synth is chosen and the piano otherwise, including when Guitar is chosen.

- *The piano is the Salamander Grand Piano* (Alexander Holm, CC BY 3.0). These are the recordings
  fret-navigator plays: 29 MP3s from A0 to A7, a minor third apart. Each key plays the nearest
  recording, re-pitched by `playbackRate = 2^(semitones/12)`. That is at most 1.5 semitones of
  stretch, below where re-pitching artefacts become audible. This is not the soundfont piano
  rejected on 2026-08-17. That was a General MIDI patch the maintainer liked less than the
  synth. This is a concert-grand multisample they asked for by name: "real piano (look at what we
  did in fret-navigator project)".
- *Bundled, not fetched.* The guitar's CDN objection was answered by its synth fallback. For the
  default voice, though, falling back would mean the app sounds wrong whenever it is offline,
  which includes the store builds on a plane. About 2 MB in `public/audio/piano/` is an acceptable
  cost for that, and the maintainer chose it. The recordings are still requested lazily, on the
  first need after a gesture, never on page load. Until a recording is decoded, its notes sound
  through the synth.
- *Accent* scales the recording's gain by the percussive voice's `ACCENT_AMPS`, so the three
  levels stay audibly distinct (Constitution, Audio clarity). *Re-striking* a key damps the voice
  it was already sounding, as a piano's damper does. Without that, a repeated note at practice
  tempo would stack three seconds of ring into mud.
- *Routing*: the sampled voices share the melodic chain's compressor. The synth keeps its own
  reverb send, and the recordings carry their own room, so the piano gets none.
- *The screen-off render* (AC-4.1.15) decodes the voice's recordings on the offline context, so a
  locked screen hears the piano rather than the synth. The guitar's render reuses the live
  instrument's decoded buffers. An AudioBuffer is not bound to the context that decoded it, so
  the CDN is asked only once (AC-19.7.1/1).

Alternatives considered: fetching Salamander from a CDN (rejected: the default voice would break
offline); a soundfont piano through soundfont-player (rejected: it is the voice retired on
2026-08-17); keeping the choice inside the Composer (offered; the maintainer wanted Practice to
follow it as well).

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

*(Amended 2026-09-13 with T290, AC-15.1.19. "One Measure per row" becomes "as many whole
Measures per row as fit": a Measure is still its own bounded block and is never split across
rows, but where the grid is wider than one Measure the next one sits to its right rather than
under it, and the row wraps by whole Measure. On a phone nothing changes — every Measure of the
densest Pattern is wider than the grid, so each still takes a row — and the tap minimum, the
Beat wrapping inside a Measure and the autoscroll are untouched. What changed is the wide end:
on a 1920×1080 TV an eight-bar 4/4 Pattern was 984px of grid beside about 1000px of empty
panel, and the maintainer's rule for it was "fit based on how many cells are available … but
don't split a measure across two rows". The alternatives below were rejected for the phone,
and still are; this is the same decision extended to widths it never considered.)*

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

*(Figures updated again 2026-10-23: the cap is 32 (AC-1.1.3, D-011 reversed), so the worst case is
768 Slots. Same reasoning, same conclusion — per-row Slot count is unchanged, and the page is four
times as long at the extreme.)*

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

**Amended 2026-10-18: two more step kinds (T390, AC-2.6.6/18–/19).** Three kinds could not write a neighbour note or a boogie. A **scale neighbour** — the next note of the Pattern's scale above or below a chord tone — is counted from the Key, because the scale step rooted on the chord spells the upper neighbour of B over iii in C as C♯; its scale is the seven degrees the chords are stacked from, as the scale drones' is, so a pentatonic Pattern's neighbour is one step away rather than a third. An **interval above the chord's root**, fixed whatever the Key, carries the boogie's major 6th and minor 7th. Rejected: a diatonic boogie (B, not B♭, over I in C major — not a boogie), and a fill offered only over dominant-seventh progressions, which would make the cycle's catalogue depend on the Pattern. Chosen by the maintainer. The interval sits above the root as voiced, so under an inversion it stays above the stack's 5th.

**Amended 2026-10-25: two chromatic step kinds, and the first step that looks ahead (T439, AC-2.6.6/20–/27).** A **chromatic neighbour** `{ chromatic: ±1, of }` is the semitone beside a chord tone, outside the Key on purpose — the approach note and the enclosure are chromatic by definition, and a diatonic version is the scale neighbour already there. A **chromatic approach** `{ approach: ±1, target }` is the semitone beside the next chord's bass. Every earlier step resolves against the chord it sounds over alone; this one cannot, so the catalogue entry only declares that it walks into the next chord and `arpeggioDeal` — the one place that already knows where each chord's span ends — writes the target into the last sounding Slot of the span, read from the same next-chord rule the Now/Next strip uses, wrapping at the end of the cycle. The target is carried as semitones above the tonic, so every consumer resolves the step exactly as it does any other and none needs the next chord. Rejected: resolving it in each consumer (four places that would have to agree about the next chord, against the one-timeline rule), and following a Song into its next Section (one Section's notes would depend on another's, and a Section played alone would sound different from the same Section in its Song). Within a Song the approach is reckoned from the Pattern alone, which the maintainer accepted when choosing the fill with its wider reach named.

**Amended 2026-09-12: cycle mode puts a fill in force without touching the Pattern (US-2.7).** The
maintainer wants playback to step through the whole fill catalogue, each fill for a few harmonic
cycles. Writing each step into `harmony.arpeggio` would auto-save every advance on an owned Pattern
and prompt for a name on a shipped one at the first — so the fill in force is a playback setting held
by the app, and every consumer (the transport, the grid's note bands, the picker, the score) is
handed the Pattern *with that fill substituted*, derived at render and at each pass boundary from the
loop count: `(start + ⌊(loop − base) / (repeats × cyclePasses)⌋) mod 23`. The stored Pattern, its
auto-save and the MIDI file never see it. The transport already swaps in a pending Pattern at the
boundary its loop callback fires on (AC-4.1.9), so the fill changes for exactly the pass the count
says, with no restart. Chosen over a Pattern-level `cycle` field (which would make a practice setting
into content that Duplicate detection and submission would have to reason about) and over restarting
the transport at each boundary (which resets the loop counter, AC-4.2.2).

**Not a longer grid.** The maintainer floated raising the 8-Measure cap for long progressions. Kept
at 8: the chord strip carries the progression across passes, and the cap is what every phone-layout
criterion (AC-15.1.10, AC-2.2.12) is measured against.

*(Reversed 2026-10-23 (T406): the cap is 32 (AC-1.1.3). The maintainer asked for it outright — a
tune's whole form in one Pattern, a twelve-bar or 32-bar chorus written out bar by bar, not only
carried across passes by the chord strip. The chord strip still works as it did; a longer grid is
now a choice alongside it rather than ruled out. The phone-layout objection does not hold up: the
layout criteria are per Measure (D-006 — Slot width is fixed by the Time Signature and never by the
cap), so 32 Measures make a longer page and not smaller Slots, and AC-15.1.11's auto-scroll is what
keeps a long page readable while it plays. The cost accepted is page length on a phone, which the
maintainer judges by playing it, and a Composer bake (AC-19.8.2) that now writes out whole cycles a
Pattern of 8 could only start.)*

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

## D-013 — Songs: a Section plays through the seam cycle mode already uses

**Decision (2026-09-13)**: a Song (US-18.1) is its own store, `rm.songs.v1`, holding Sections that
reference Patterns by id, and it plays through exactly the mechanism cycle mode (US-2.7) introduced:
at each pass boundary the transport is handed the Pattern with the fill in force substituted
(`withArpeggio`), and which fill is in force is a pure function of the pass number — `core/song.js`
answers it from the Song's entries as `core/harmony.js` answers it from the catalogue order. One
timeline per pass, unchanged (D-011); nothing new in the scheduler. Keeps (US-2.8) are an overlay
field beside ratings and added Tags, since a keep is the Composer's judgement about a fill over a
Pattern and belongs with the rest of their judgements about it.

**Why**: the maintainer's workflow is judge, then sequence — audition fills over a progression,
shortlist the ones that work, chain them with repeat counts, and build a song on that bed. The
transport already knows how to switch fills at a pass boundary without stopping; a Song only changes
who decides the next fill. Storing `patternId` per Section from the first version means the verse →
chorus case later — different progressions per Section — changes the Compose group, not the schema.

**Alternatives considered**: a Song as a chain of Pattern copies concatenated by Append (rejected
for the same reason as in D-011 — the Measure cap — and because a Song of fills over one progression
has no copies to make); Keeps stored on the Song rather than the Pattern (rejected: the shortlist is
made before any Song exists, while auditioning, and belongs to the Pattern being auditioned); a mode
inside the Melody group instead of a fourth workbench group (rejected: hidden state, exactly what the
2026-09-13 usability review removed); multiple Patterns per Song in this version (deferred: loop
length and meter can change between Sections, which is real transport work, and the maintainer's
first need is one Section over one progression).

## D-014 — Voicing: a bass per chord, the stack it implies, and shapes that write the data

**Decision (2026-10-18)**: a chord carries an optional `inversion` — the index of the member in its bass,
0 the root. The chord's *stack* is derived from it: the bass's pitch class placed in the armed octave,
the other members stacked above it in the chord's own cyclic order, so the members below the bass are
lifted an octave. Every role resolves through the stack — a stored chord-tone Pitch, a fill's dealt
step, a drone on the chord's root — and the fills deal the stack *positionally*, from the bass up, each
dealt step still named for the role it is. A Voicing shape is a pure function from the chords to their
inversions, which the picker writes into the chords the way the catalogue writes concrete chords
(D-011): the shape is a recipe, the result is the Composer's data, and a hand-picked bass turns the
picker to Custom in the same way an edited chord stops matching a catalogue entry.

**Why the bass is a member, not any note.** The maintainer's ask was inversions and "slash chords"
in one breath — "if I was playing a C chord, I could also use an E root or a G root". Limiting the bass
to the chord's members makes the two the same control, gives a chord exactly as many basses as it has
members (three for a triad, four for a seventh, five for a ninth), and keeps every stack a rotation of
the chord so each fill still deals every member. A bass outside the chord (C/D, C/B♭) is a different
thing — an added note — and was deliberately left out, to be asked for on its own if wanted.

**Why the bass sits in the armed octave.** D-011 anchors a chord's root at the Slot's octave; this
anchors its bass there instead, which is the same rule when the bass is the root. The alternative —
keeping the root anchored and only lifting the members below the bass — makes every inversion climb
above root position, so a "closest" shape could never choose one: under I–V, G/D would sit a fifth
above G, not a second above C. With the bass anchored, Closest over I–IV–V in C gives C E G, C F A,
D G B — the keyboard voicing with the common tone held — and over I–V–vi–IV gives a stepwise bass C D E F.
The cost is a register the shapes cannot cross: a bass is always within one octave above the armed
tonic, so Falling bass under I–V puts G/B at B4 rather than B3. The Slot's own octave (US-2.9) remains
the way to move the whole line.

**The shapes.** Closest minimises, for each chord in turn, the sum over its notes of the distance to
the nearest note of the chord before; ties go to the lower inversion. Rising bass takes the lowest
bass above the previous bass, wrapping to the lowest of all when none is higher; Falling bass the
mirror; Rising then falling rises to the middle chord and falls after it. The first chord is always
over its root, so the shapes describe motion, not a starting point. Rejected: a single
"smooth voice leading" option only (the maintainer asked for shapes — "ascending … descending … up
and then down"), and deriving the voicing at play time from a stored shape (two sources of truth once
a chord is edited by hand; writing the data keeps one).

**Why the shipped library is re-voiced as data, and saved Patterns are not.** Built-in Patterns load
from the seed file at runtime (§7, US-16.2), so giving all 158 progressions their Closest inversions is
an edit to that file: ids are seed positions and are unchanged, so no overlay, rating or Tag is
orphaned. A saved custom Pattern's chords name no bass and so are root position — exactly what they
were — with no migration and no schema bump: the maintainer's condition was "make sure you don't kill
all my settings", and a migration that rewrites saved Patterns cannot be undone by a later commit.

## D-015 — Note aids on the score: fret-navigator's degree palette, and a second set of tints for notes outside the scale

**Decision**: With the Note aids toggle on (US-12.3), every note of the melodic score is coloured by
its degree above the Key and named above its head. The twelve in-scale colours are the
`--role-*` palette of the maintainer's fret-navigator, copied verbatim, keyed by the same role ids
(`1`, `b2`, `2`, `b3`, `3`, `4`, `4s5b`, `5`, `b6`, `6`, `b7`, `7`). A degree the Pattern's scale does
not hold takes a colour from a second set of twelve tints, none of which is in the scheme, with its
notehead ringed in the staff's black and its name set on a ground of the same tint. The role, scale
membership and written name are computed once in `core/notation.buildScore`; `ui/score.js` only
emits them as classes and text, and the stylesheet carries the colours.

**Why by degree, not by letter.** fret-navigator colours by semitone above the root, so the tonic is
one colour whatever the key. Keeping that rule means a musician who learned the colours on the
fretboard reads the same colours on the staff, which is the point of borrowing the scheme at all.

**Why the second set is tints.** The maintainer asked for out-of-key notes in colours "not in the
scheme". The scheme already spends the hue wheel — twelve saturated hues at similar lightness — so a
thirteenth saturated hue would sit between two of them and read as one or the other. Lightness is the
one axis the scheme leaves free: a tint keeps the hue (so ♭2 out of scale is still recognisably the
♭2 family) while being plainly not a scheme colour. Two consequences follow and both are in the
criteria: a tint alone would vanish on white paper, so the notehead takes a black ring; and tint text
on paper is unreadable, so the name goes dark on a ground of the tint instead (AC-12.3.3/3). The ring
also means in-scale and out-of-scale read apart by shape, not colour alone, which is the same
discipline AC-2.5.2/3 holds the pitch strip to.

**Rejected**:

- *One neutral treatment for every out-of-key note* — simplest, and the maintainer declined it: they
  want each degree to be told apart, in or out of the scale.
- *Scheme colour, hollow notehead* — keeps twelve colours, but hollow noteheads mean half notes to
  any reader of standard notation, which the score must never suggest.
- *A per-degree colour stored on the Pattern* — colour is a reading aid, not a musical fact; nothing
  about it belongs in the data model (Constitution Principle I).

**Not CVD-gated.** `check:cvd` guards the four Accent states, which carry meaning no other channel
does. Here the name above each note is the primary channel and the colour is reinforcement, so the
palette is not added to that gate; it is a design decision the maintainer approved on screen.
## D-016 — The Composer: an instrument over the grid, a draft that is not yet a Pattern

**Decision (2026-10-18)**: the Composer (US-19.1–US-19.9) is a second mode of the main panel, beside
Practice, not a fifth workbench group. It shows an instrument view — fret-navigator's fretboard, or a
piano keyboard — above a record bar and a *composing grid*, and the library sidebar stays. The
composition it holds is a **draft**: a Melodic Pattern that may have sounding Slots with no Pitch,
which data-model §7 forbids in storage. The draft lives in `state.composer` and is written to
`rm.patterns.v1` only when complete — by hand the first time (Save), and on every change after that
while it stays complete. That is why US-7.2's auto-save and US-19.9's Save are one rule with a
precondition rather than two models.

**Why a mode, not a tab.** The fretboard is 24 frets wide and the keyboard up to 88 keys; either
beside the grid in the workbench pane halves what both get. The maintainer wants to look at the
instrument and the rhythm together, so they share the panel's width and nothing else does.

**The fretboard is ported, not shared.** fret-navigator has no build step and this app has Vite; a
shared package would be a third repository for two consumers. `core/fretboard.js` carries the
geometry (the column layout for a visible range, the marker frets, standard tuning's open notes as
MIDI) and `ui/fretboard.js` the SVG, both adapted from fret-navigator's `fretboard.js` and
`theory.js` with the capo-relative mode and the chord view left out. The twelve degree-role colours
are the same hex values. Names and degrees are **not** ported: `core/pitch.js` and `core/scales.js`
spell them, so the board and the grid can never disagree — the same reason `core/scales.js` adopted
fret-navigator's catalogue rather than linking to it (its header note).

**The piano is drawn, not ported.** `core/piano.js` gives the key range for a count — 25 and 49
centred on middle C; 37, 61, 76 and 88 the ranges such keyboards have — and the two-row split at the
C nearest the middle when one row would put white keys under 18px. SVG, like the board, so a key is
one element with one colour and one label.

**A tapped note becomes a degree of the Key.** `core/composer.js` `pitchFromMidi(midi, key, scale)`:
the semitone above the Key's tonic picks the degree token — the scale's own spelling where it has
one (`chromaticStrip`), the default chromatic token otherwise — and the octave offset is whatever
makes `resolve()` give the MIDI note back. A round trip with no loss is AC-19.4.4/1, and it is what
lets the fretboard, the grid and playback show one note three ways.

**Record is a cursor over the sounding Slots.** The target is the first sounding Slot with no Pitch
in timeline order; a recorded note moves it to the next such Slot; none left ends record mode.
Delete acts on the Slot *before* the target because the target holds nothing — the maintainer's own
description. Out of record mode a selection replaces the target: one Slot, tapped on its note box,
that the next instrument tap re-pitches.

**Playback of a draft needs no new timeline.** `buildTimeline` already emits `pitch: null` for a
sounding Slot without one, and the scheduler already plays such an event percussively; the draft
plays correctly as it is. What the Composer adds is which melodic voice the scheduler is handed —
guitar or piano, following the view — swapped without a restart.

**The guitar voice.** `audio/guitar.js` wraps soundfont-player exactly as fret-navigator's `audio.js`
does — instrument cached per AudioContext, loaded lazily, a load failure letting a later tap retry —
and schedules each note on the transport's clock so it lands with the percussive events around it.
Until the instrument resolves, or when it rejects, `playMelodic` sounds instead. `soundfont-player`
is an npm dependency (bundled, MIT); the samples are fetched at play time, never vendored
(Constitution 3.7.0). The CC BY 3.0 attribution is in the Composer's panel.

**Loading rules are the ownership rules.** A percussive Pattern or one with a progression can only
become a *new* composition — a percussive one has no notes, a harmonic one's notes are derived at
play time and become stored degrees here — so both ask a name at load; nothing is written until
Save. A melodic Pattern the musician owns may be edited in place (already complete, so already
saved) or copied; a shipped one may only be copied (US-7.3). Baking a progression unrolls the
harmonic cycle into Measures when it fits within the Measure cap (32 since 2026-10-23), because a melody that changes
chord every pass is several bars long, not one bar played differently; past the cap the first pass
alone is kept, and the Composer says so. A Register is folded into each note's octave so that what
the instrument shows is what sounds.

**Alternatives considered**: a `voice` field on the Pattern so the library plays a composition as
guitar (rejected by the maintainer — the instrument is the view, not the data); auto-saving the
complete Slots of an incomplete draft (rejected — the stored Pattern would differ from the screen);
a Karplus-Strong guitar with no assets (offered, declined); a fifth workbench tab (rejected — see
above); writing the draft to a store of its own so it survives a reload (not asked for — the
maintainer stated the loss explicitly, and a second Pattern store is a schema the app does not need).

## D-017 — Tempo counts a stated note value, and every Beat lasts its written length

**Decision (2026-10-18)**: a Pattern's tempo counts its **tempo unit**, a quarter note (♩) or an eighth note
(♪), per minute (`tempoUnit`, AC-4.2.7). Every Beat lasts its own written length against that unit, so an
eighth-note Beat is half a quarter-note Beat in every Pattern, at every tempo. `core/meter.js` is the one
place the arithmetic lives (`beatDurationSeconds` takes the unit); playback, the metronome, the count-in,
the score's tempo mark and the MIDI file all go through it.

**What this reverses.** Tempo counted *Beats*, whatever the Beat was written as: an eighth-note Beat in 6/8
at 80 lasted as long as a quarter-note Beat in 4/4 at 80. It was never a numbered decision — it lived in
`meter.js`'s comment and in AC-12.2.2/2's wording — and it was harmless while no Pattern mixed the two.
US-10.2's regrouping (AC-10.2.6) is built on Patterns that do: 4/4 then 3/8 then 5/8 is two bars of 4/4
to a musician, and under the old rule the 3/8 + 5/8 pair played for two. The maintainer: "you cannot have
quarter notes and 8th notes have the same duration … Usually in music we say what counts as a beat."

**Why a stated unit rather than always ♩.** Saved 6/8, 7/8, 9/8 and 12/8 Patterns were set to a tempo
that counted eighths. Absent `tempoUnit` reads as the note value of the first Measure's Beat — exactly what
the old rule counted — so every Pattern whose Measures share a note value plays as it did, with no storage
migration and no schema bump. Only a Pattern mixing /4 and /8 Measures changes, and it changes to correct.
No shipped Pattern has an eighth-note Measure. The editor writes the unit on open, so a later change to
Measure 1's meter cannot silently retime a Pattern through the default.

**Alternatives considered**: tempo always in quarter notes (rejected — every saved /8 Pattern would play
twice as fast); a dotted-quarter unit for compound feel (declined — a metronome clicking ♩. groups 6/8
into two Beats, which Constitution Principle I forbids without a governance amendment); a schema-version
migration writing the unit into every stored Pattern (unnecessary — the read default is the old behaviour,
and bumping `CURRENT_VERSION` would lock every store out of an older cached build).

## Open items deliberately left to implementation

These are genuinely low-stakes and do not need a decision before tasks are written:

- The exact accent palette values, beyond passing the CVD check.
- The metronome click timbre, beyond being audibly separable from Pattern voices.

---

## D-018 — The goal screens: one frame, a goal names its controls, two layouts

**Decision (2026-10-23)**: the main panel is rebuilt as **one frame** shared by every goal — a pinned
bar (Goals, Library, Related, Play/Stop, tempo with its unit, Prev/Next), a **goal strip** holding the
goal's own quick controls, the **rhythm** as grid or sheet across the full width and as many lines as it
needs, and one **work surface** holding only the controls that goal is for. There is no tab bar and no
Practice | Composer mode switch: **a goal is a screen.** The frame has two proportions — a **Design
layout**, where the rhythm is a band and the tools take the room, and a **Playback layout**, where the
music takes the room and the tools shrink to one rail — and any goal drops into Playback when Play is
pressed and the musician sits back. The goals are the stages the app grew in: Practise a rhythm (one goal,
read-only), then Build a rhythm, Make it melodic, Combine patterns, Play it in, then Share and tidy up,
with Lab keeping today's cockpit inside the frame. Each making screen hands on to the next stage itself.
The library is one drawer in every goal, every rhythm in it, Percussive / Melodic an ordinary filter;
Related opens the family of the rhythm on screen from the bar. The design is the maintainer's storyboard,
reviewed board by board on 2026-10-18 to 2026-10-20: <https://claude.ai/artifact/HEepj3uBW3KoP1UdXxBvBa>,
whose board 11 maps all 59 User Stories to a screen.

**Why.** The maintainer, 2026-10-18: "It is like this huge mishmash of different features and then the
controls are hidden in different places all of which interrupts flow … we need an inventory of controls
and what goals need which controls and then based on the goal we create a tailored view … ideally there
is some overall consistency across tailored views so the user is not feeling like they are using 10
different apps." The Composer (D-016) had just landed as a second axis beside the goals, so the app had
goals times modes; three ways of making a rhythm melodic lived in a tab, a pair of tabs and a mode; tempo
was set in three places and swing and counting in two; and the library's few hundred rhythms and dozens of
tags met every goal the same way. The frame answers the consistency ask, the per-goal work surface the
tailoring ask, and the quick strip the "I have to jump to a different menu to change the tempo" ask.

**What this reverses, by the book.**
- US-14.1's rule of 2026-09-20 — "a goal decides which workbench groups are offered, and never hides a
  control inside a group; one rule, not a matrix" — becomes its opposite: a goal names its controls. The
  practice panels (AC-14.1.5) had already crossed that line for the practice goals; this extends it to all.
- The four practice goals of 2026-09-20 become one: they differed only in which settings sat on the panel.
  Chosen by the maintainer 2026-10-19 ("if so not sure if we need four boxes").
- The tabbed workbench and the two panes (AC-15.1.7, AC-15.1.8, AC-15.1.18) go; the pinned bar
  (AC-15.1.17) stays and grows. The breakpoints, the drawer, one Measure per row on a phone (D-006) and the
  autoscroll are unchanged.
- D-016's *mechanism* — the Composer as a mode beside Practice — becomes a goal, Play it in. Its *reason*,
  that the instrument needs the panel's full width, is met by a goal owning its screen. The guitar, the
  piano, the draft and the Save rule are untouched.
- AC-4.1.16, Reset audio, is dropped: the maintainer, 2026-10-19, "we can drop reset audio as it doesn't
  work."

**What does not change.** `core/` is not touched. Rendering stays a pure function of the Pattern and the
transport position; the render functions, the handlers and the one state object survive, and only the
composition of them moves. The sheet engraver renders exactly as today, on a white page, the single-line
staff for percussive rhythms; the redesign changes the frame around it and how much room it gets. The
store build and its paywall (US-17.1) stay as they are and are not redrawn: web first, the App Store build
and a VST plugin are **layers** to add later (spec.md Assumptions).

**How it lands.** In phases, each one PR with its criteria, tests and code together, since AC coverage
must stay at 100%: (0) this record; (1) the shell extracted from `main.js` into `ui/shell.js` with no
visible change, proving the decoupling; (2) the frame, with Practise in the Playback layout and Lab's
workbench inside it, every other goal riding along with its current controls; then (3) Build and Append,
(4) Make it melodic, (5) Combine patterns and Arrange, (6) Play it in, (7) Share and Related, (8) the
phone, (9) clean-up. The spec stays in this folder: both gates name its `spec.md` directly, and every
change since the MVP, the Composer included, has landed here as new stories and dated revisions.

**Alternatives considered**:
- *Tidy the Composer view alone* — what the first report asked for on its face. Rejected: the Composer
  looked convoluted because it was the third home for "make it melodic", not because of its own layout.
- *A second shell beside the old one, goal by goal* — rejected: two frames on one screen is the mishmash
  again; the frame lands once, in phase 2, and the goals fill it one at a time.
- *A new feature folder, `specs/002-…`* — rejected for now: `spec-trace.config.json` and
  `tests/ac-coverage.js` both name `specs/001-rhythm-master-mvp/spec.md`, and nothing is gained by teaching
  them a second folder before the first is exhausted.
- *A global settings sheet* — drawn, then dropped on 2026-10-19: once each goal's quick strip carried
  tempo, swing, click and counting it held nothing that was not already one tap away.

## D-019 — MIDI input: Web MIDI on the web, a seam for the store builds

**Decision (2026-10-24)**: the Composer takes notes from a MIDI device through the browser's **Web
MIDI API** (`navigator.requestMIDIAccess`, without system-exclusive messages), read by one small
module, `src/midi/input.js`, which hands each note-on to the very handler a tap on the instrument view
calls. Decoding a MIDI message, deciding whether the instrument on screen has a place for a note, and
working out what the device picker offers are pure functions in `core/midi.js`; the module that touches
`navigator` is only plumbing. Nothing downstream can tell a MIDI note from a tap, so recording, the
selection and the voices need no MIDI-specific path (US-19.10).

**Why.** The maintainer asked for it on 2026-10-24 and asked first whether the store builds would need
a native app to have it. They would not: the Capacitor shell's WKWebView has no Web MIDI, but a
Capacitor plugin over CoreMIDI (and Android's `android.media.midi`) can pass note-ons to the same
JavaScript seam, exactly as `src/billing/` puts a native adapter behind the web one (D-010). The web is
built first; the native adapter is a later change and gets its own entry when it is made.

**Consequences.**
- Web MIDI is in Chrome, Edge and Firefox, and not in Safari or any browser on iPhone and iPad, all of
  which use WebKit. Those browsers show the picker disabled with the reason (AC-19.10.5/2); nothing else
  about the Composer changes, so plan.md's target platforms are not narrowed — one capability is absent.
- Access is asked for on entering the Composer, once a page load (AC-19.10.5/1). Asking at load would put
  a permission prompt in front of every visitor, most of whom have no device; a button would add a step
  every first time. The browser remembers the answer, so in practice it is asked once.
- A device is remembered by name, not id: Web MIDI does not promise an id survives reconnecting.
- Input is monophonic (AC-19.10.1/3). The Composer records one note per syllable; layered voices, if they
  come, are a change to the composition model before they are a change here.

**Alternatives considered**:
- *A native app for the store builds* — rejected: the gap is one API, and a plugin closes it without
  forking the app.
- *A Web MIDI polyfill over a browser extension or helper app (Jazz-Plugin and the like)* — rejected:
  it asks the musician to install software for a feature Chrome and Firefox already have.
- *Taking MIDI in Practice too, to stamp degrees* — not asked for; Practice ignores MIDI (AC-19.10.1/5).

## D-020 — Variations: the Pattern grows, each device one pure rule *(withdrawn 2026-10-31)*

**Withdrawn 2026-10-31 (T446).** US-10.3 was taken out whole at the maintainer's request after they played with it, to be redesigned. The decision below is kept as the record of what was tried and what was learnt, and constrains nothing: the redesign gets its own entry. Two lessons worth carrying into it, both the maintainer's own findings in use: a variation must be **heard before it is written** (the same-day amendment below), and a device that hides a choice among many options — which fill, which degree, how many steps — needs that choice **offered, not guessed**. `core/variations.js`, `ui/variations.js` and `phraseLength` in `rm.localMeta.v1` are gone; a stored `phraseLength` is left unread rather than migrated away, since it is not Pattern content and no export carries it.


**Decision (2026-10-25)**: a variation is appended to the Pattern as Measures — a copy of a base
phrase with one named device applied — through the same `append` that Double Length uses (US-10.1).
Each device is a deterministic pure function in `core/variations.js`, `(phrase, context) → phrase`,
with an `availability(phrase, context)` beside it that returns the reason it cannot apply or null.
The base phrase is the Pattern's first or last N Measures; N is the musician's choice in the picker
and is remembered per Pattern in `rm.localMeta.v1` as `phraseLength`. Nothing about a variation is
Pattern content (US-10.3).

**Why.** The maintainer wants a loop to change on every repeat, three or four variations strung
together, and to hear each one in the loop as it is added. Measures already do all of that: the loop
plays them, the grid and the Composer edit them, Remove Measure discards from the end, MIDI exports
them, and duplicate detection compares them. A separate non-destructive object — a variation set
beside the Pattern, auditioned and then committed — was the alternative weighed with the maintainer
and declined: it is a second place content lives, needs its own save, export and comparison rules,
and the audition it buys is already there in the loop, since an unwanted copy is one Remove Measure
per Measure away. Growing the Pattern is also what Double Length already does, so the shipped-Pattern
naming prompt, auto-save and the cap all come for free.

Each device is **one exact rule, not a style**. `core/` may not use `Math.random` (Constitution), and
a random tweak is in any case not a musical one; what composition teaching names — an end-of-phrase
fill, anticipation, subtraction, terraced dynamics, antecedent–consequent endings, sequence, octave
displacement, passing and neighbour tones, inversion, retrograde — are each a rule a musician can
predict, which is what makes the same device applied twice give the same Measures and lets a test name
the criterion. Where a rule would change nothing or lacks what it needs, the device reports why rather
than silently appending an exact copy, which Double Length already provides.

**Consequences.**
- The phrase length has to live somewhere, since a Pattern stores no phrase: it is Local Metadata,
  bookkeeping *about* the Pattern that never leaves the app (FR-006), beside `submittedAt` and
  `duplicateResolved`. It is a convenience, not a truth: the picker always shows it and lets it be
  changed, and a remembered length longer than the Pattern falls back to the whole Pattern.
- Melodic rhythm devices that turn a Slot on must give it a Pitch (AC-2.2.8): the nearest earlier
  note in the phrase, the phrase's first note, or the tonic — in that order — which is how a player
  fills a gap, by repeating what they just played.
- Pitch devices read a chord-tone Pitch as the degree it sounds in the first pass, as removing a
  progression does (AC-2.6.1/6), except Octave and Chord-tone swap, which keep roles. Under a
  progression that changes every Measure, a phrase as long as the chord list keeps every copy over
  the same chords; under one that changes every pass, the pass simply lengthens. The picker says
  which (AC-10.3.2/4); the progression itself is never edited by a device.
- A fill deals every sounding note (`arpeggioDeal`), so under one the pitch devices other than Octave
  would change stored Pitches nobody hears; they are unavailable and say why (AC-10.3.3/23). The one
  device that varies a fill — **Change the fill** — writes notes, because a fill is one setting for the
  whole Pattern: the current fill's first-pass deal into the Measures already there, the next fill's
  into the copy, through `stepAsDegree` as removing a progression bakes (AC-2.6.1/6), and the fill set
  to None. That is what "vary the fill from one loop to the next" means once the loop is Measures; the
  live way — the Fills cycle at Repeats 1, or a Section — is untouched and stays the way to audition.
- **Roll the dice** takes its random number from the UI, as `pickAtLevel` does for Give me one
  (US-14.1): `core/variations.js` exposes `rollable(devices, noDice)` and a `pick(list, random)`, and
  `Math.random` is called in `src/ui/`. The per-group **No dice** toggles are session state in the
  picker, not a setting: the maintainer framed them as "no dice" rather than "lock", and a toggle
  that persisted would be one more remembered state to find (the 2026-09-13 review's lesson).
- On a making goal whose tab bar has no Rhythm group — Make it melodic, Combine patterns — the Melody
  group ends with Double Length and Add variation (AC-15.1.8 revised), per D-018's ruling that Double
  Length is visible on every making goal. Lab keeps them in the Rhythm group alone.
- A harmonic turnaround is **not** a device: `harmony.chords` is one list dealt across passes or
  Measures (D-011), and a chord in force for one copy only would need chords addressed by Measure
  range, which is a change to the harmony model before it is a variation.
- Ghost notes are **not** a device yet: the accent scale stops at Weak (US-3.1). A
  Ghost level is its own spec change — accent table, audio gain, MIDI velocity, duplicate identity —
  and the device joins the Dynamics group when it lands.

**Amended 2026-10-25, the same day.** The maintainer tried it and asked to "hear the candidate
variation and either accept it or go to try another one". The paragraph above argued the loop was the
audition; it is not — an unwanted copy costs one Remove Measure per Measure, and trying four devices
costs sixteen. So a tap now **auditions**: `state.variationCandidate` is the Pattern with the candidate
appended, `playingAt` returns it in place of the Pattern (the overlay cycle mode already uses, which
writes nothing — AC-2.7.1/4), the grid and the Composer's grid draw it, and Accept is what calls
`addVariation` through `apply`. The Pattern still grows, as decided; only the moment it grows moved
from the tap to Accept. A separate variation set is still declined: the candidate lives in UI state for
the life of the picker and nowhere else.

**Alternatives considered**:
- *A variation set beside the Pattern, committed on request* — declined, above.
- *Variations as Section entries (US-18.1)* — rejected: a Section chains fills over one Pattern; its
  entries are arpeggio choices, not Measures, and Songs exist only on a Melodic Pattern with a
  progression. A percussive loop needs this just as much.
- *A single "Vary" button choosing a device at random* — rejected: `core/` is pure, and the musician
  asked for a set of named tools, not a dice roll.
- *A dice roll with a No dice toggle on every Melody-group control — key, scale, progression, fill,
  voicing, register* — deferred to a story of its own: each control needs a toggle and a rule for what
  it may roll to, across several existing stories' criteria. Asked for on 2026-10-25; not forgotten.
  *(Taken up the same day as US-2.14, D-021.)*

## D-021 — Roll the dice across the Melody group: one pure roll, the dice outside `core/`

**Decision (2026-10-25)**: `core/dice.js` holds one function, `rollMelody(pattern, { noDice, random,
fills, progressions })`, that returns the Pattern with every Melody setting not marked No dice
re-picked — Key, Scale, Register, Progression, Chord changes, Fill and Voicing, in that order — and a
record of what each landed on. It takes its random numbers from the caller as a `random()` function,
as `pickAtLevel` takes one for Give me one (US-14.1) and `pick` for the variation picker (D-020) took one;
`Math.random` is called once, in `src/main.js`. Each setting lands on a value other than the one in
force whenever another is offered. The No dice marks are session state in `main.js`, one set for
every Pattern, never stored (US-2.14).

*(Note 2026-10-31: D-020 is withdrawn (T446). The `pick` helper this roll borrowed from `core/variations.js` moved into `core/dice.js` unchanged; the roll's behaviour is untouched.)*

**Why.** The maintainer asked, while reviewing US-10.3's Roll the dice, for the same across the
melodic interface: "for each control that could be randomized could have a roll the dice or locked
toggle, so the dice roll only picks a random option for the controls that don't have a lock on them."
Seven pickers worked one at a time is the cost of hearing a loop in a setting one would not have
chosen; one tap with the decided parts held is the whole feature.

One function rather than seven handlers rolling in turn, because the settings are not independent:
a Pattern without a progression has no Fill, Voicing or Chord changes to roll until the Progression's
own roll gives it one, and the progression is spelled under the scale, so the scale must land first.
Ordering them inside one pure function makes the result one edit — one `apply`, one history entry,
one auto-save, one naming prompt on a shipped Pattern — which is what makes one Undo take it back
whole. The roll applies each setting through the same core setters the pickers use
(`setProgression`, `setArpeggio`, `setVoicing`, `setChange`), so a rolled value is indistinguishable
from a chosen one: a fresh progression arrives voiced Closest with the default fill (AC-2.6.1/7,
AC-2.11.3/7), and a rolled fill or progression restarts its cycle as a chosen one does (AC-2.7.2/7,
AC-2.10.2/7).

"Never the value in force" because a roll that lands where it was is indistinguishable from a roll
that skipped that control, and the musician cannot tell which happened; every unmarked control
audibly moving is what makes No dice legible.

The catalogues the Fill and Progression rolls draw from are the ones the cycles step through
(AC-2.12.1): My list when a cycle is set to it, the whole catalogue otherwise. A musician who has
shortlisted fills has said which fills they want to hear, and a roll that ignored the list would be a
second opinion nobody asked for.

**Consequences.**
- No dice is session state, as the variation picker's group toggles are: the maintainer chose
  session-only over a remembered setting, on the 2026-09-13 review's reasoning that a persisted
  toggle is one more remembered state to find. The marks live in `main.js`'s `state`, so they hold
  from one Pattern to the next in a session and are cleared by a reload.
- The Melody group's first entry is the Roll the dice row (AC-15.1.8 revised), so it is shown
  wherever the group is — Lab, Make it melodic, Combine patterns — and absent with it in Percussive.
  Each toggle sits beside the control it marks, on the pitch strip or among the harmony controls.
- The chord editors, the octave stepper, the cycles and their Repeats, tempo and swing never roll:
  the editors are what the rolled Progression and Voicing write, the stepper arms the next stamp
  rather than describing the Pattern, and the rest are Practice settings.

**Alternatives considered**:
- *Rolling through the seven handlers one after another* — rejected: seven history entries, seven
  auto-saves, and a shipped Pattern asked for a name on the first and then rolled six more times; and
  no place for the ordering the progression needs.
- *A roll that may leave a setting where it was* — rejected, above.
- *Remembering No dice in `rm.settings.v1`* — offered, declined by the maintainer the same day.
- *Rolling the Scale within its category* — not asked for; a scale change is the point of a roll, and
  the category heading is a picker convenience, not a musical boundary.

- *Storing the phrase length on the Pattern* — rejected: it would be exported, compared and
  submitted as content, and two identical Patterns would differ by a number that changes no sound.

## D-022 — A fill per chord: the chord carries it, the deal's restart reads it

**Decision (2026-10-31)**: a chord in `harmony.chords` may carry a `fill` — an `ARPEGGIOS` id — and
`arpeggioDeal`, which already restarts the deal at every chord change (AC-2.6.6/2), takes the chord's
own fill at that restart in place of `harmony.arpeggio`. Nothing else learns about it: the timeline,
the grid's note bands, the score and MIDI export all read the deal, so a per-chord fill reaches every
view and the file through the one place the arpeggio already does (US-2.15, research.md D-011).

**Why.** The maintainer's framing of the variations redesign is that a loop needs to change as it
goes round, and the first, plainest change is the fill: one shape over three chords and another over
the last. The chord is the unit a fill is already dealt over — the deal restarts there, a walking
approach aims at the next one — so the chord is where the choice belongs, beside the quality and the
bass the chord already carries (AC-2.6.2, US-2.11). It is Pattern content for the same reason the bass
is: it changes what the chord sounds, so it is saved, exported, undone, compared (AC-2.6.9/1) and
prompted for on a shipped Pattern, and no second store, overlay or migration is needed — a Pattern
saved before has no `fill` on any chord and sounds as it did.

**Consequences.**
- `harmony.arpeggio` is now the fill of every chord without one; the picker names it and each
  chord's picker reads **As above** until a fill is chosen. A chord's fill exists only under an
  arpeggio: setting the arpeggio to None drops every chord's fill, so the stamped Pitches return
  whole (AC-2.6.6/7) and no chord is dealt over a stamped melody. The maintainer declined, for this
  story, both a chord's fill under None and an "as stamped" entry in the chord's picker: each is the
  mixed state the pitch strip and degree chips would have to show, and the broader variations work
  is where that is decided.
- **A fill in force wins everywhere.** Cycle fills and a Song's Section put a fill in force through
  `withArpeggio` (AC-2.7.1/4, D-013); the overlay it returns deals every chord, each chord's own fill
  suspended, so the fill being auditioned is always heard — the maintainer's ruling. The overlay still
  writes nothing: the Pattern's chords keep their fills and they return when the cycle or Song ends.
- **The Fill roll clears them.** Roll the dice (US-2.14) sets `harmony.arpeggio` and removes every
  chord's fill in the same edit, so the roll is audible on every chord; Fill marked No dice leaves
  them, as it leaves the arpeggio. The maintainer chose this over leaving them (a roll inaudible on
  overridden chords) and over rolling each chord too (a roll that changes more than one control).
- A new progression's chords carry no fill, as `setProgression` writes fresh chords; `addChord` adds
  one without; editing a chord's root, quality or bass keeps it; removing the chord removes it.
- Baking on Progression None (AC-2.6.1/6) already bakes what the first pass sounded, read from the
  deal, so a chord's own fill in that pass is baked without a further rule.
- Duplicate identity (`core/similarity.js`) carries each chord's fill beside its bass; two Patterns
  alike but for one chord's fill are not duplicates. Family detection is unchanged.

**Alternatives considered**:
- *A fill per Measure* — rejected: under every-pass changes a chord spans a whole pass, and a fill
  that followed the Measure would cut across the chord the deal restarts on; the chord is the unit.
- *A fill per pass, or a per-pass schedule beside the Pattern* — rejected for now: it is the
  non-destructive variation set D-020 weighed and declined, a second place content lives. The broader
  redesign may still want one; this story gives it a unit — a fill on a chord — to build from.
- *Per-chord fills kept under a fill in force* — declined by the maintainer: the cycled fill would be
  inaudible on every overridden chord, which defeats auditioning it.

## D-023 — A member struck from a chord: the chord carries `omit`, and its members are read through it

**Decision (2026-10-31)**: a chord in `harmony.chords` may carry `omit` — the roles struck from it,
never the root — and every reading of a chord's members (`memberCount`, `chordStack`, and so
`memberFor`, `bassOf`, `hasTone`, `bassOptions`, the voicings and the deal) goes through one
function that takes the quality's intervals less those roles. Nothing downstream learns about
omission: a struck member is a role the chord lacks, which AC-2.6.4/2 already resolves to the
next-lower member. Addition is the catalogue: `QUALITIES` grows from nineteen to forty-one entries
in eight groups, and the chord-tone model gains the roles 11 and 13 beside 9 (US-2.16).

**Why.** The maintainer plays Em7 as root, 5th and 7th, or as root, 3rd and 7th, and G6 without its
5th or its 3rd: "there are a lot of options here for various chords and we need those options that add
or subtract degrees". Subtraction as qualities would mean an entry per combination — six for every
seventh chord, twelve for every ninth — and a picker nobody could scan; as a setting on the chord it
is one control that covers every quality, the new ones included. The chord keeps at least two members
and its root, because the root anchors the Bass picker and every fill's first step, and a one-note
chord is a drone the catalogue already offers. Addition stays in the catalogue because an added
degree needs an interval the name supplies — 6/9, 7♭9, 13 — and a chart's names are what a musician
reaches for. The 11th and 13th become roles rather than being folded into the 9th because two members
in one role would break the stack, which finds a role's member by its role.

**Consequences.**
- `omit` is a list of roles, not intervals, so it survives a quality change wherever the new quality
  has a member in that role (G6(no5) made a 7 is G7(no5)); when the survivors would leave fewer than
  two members they are all dropped (AC-2.16.1/4). A stored `inversion` indexes the remaining members,
  so striking a member re-seats the bass by role, as `rechord` does for a quality change
  (AC-2.16.1/5).
- The roles a fill deals are still the union over the progression (AC-2.6.6/5), counted after
  omission — less, for each chord, the members struck from it. *(Revised 2026-11-01: as first landed
  a struck member's step fell to the next-lower member like a member the chord never had, so Cm7(no3)
  among triads dealt C C G B♭ and Descending over Em7(no3) D B E E; the maintainer heard the doubled
  root and expected D B E D. `arpeggioRoles(pattern, chord)` now drops the chord's own `omit` from
  the roles it is dealt, so a struck member gets no step. A member a chord never had still falls to
  its next-lower member, so no Pattern saved before US-2.16 changes; dealing every chord only its own
  members would have changed every shipped Pattern that mixes triads and sevenths, and is still not
  taken.)*
- Fills written as positions of a three-member stack (Alberti, Root and fifth, the fingerpicking
  shapes) meet a two-member stack for the first time: the 3rd's position falls to the bass and the
  5th's is the other member (AC-2.16.4/1), the same next-lower rule in positional clothing.
- The name and numeral carry what is struck — Em7(no3), vi7(no3) — before the slash bass, as the
  bass is carried; the member is named as a chart names it (2 or 4 on a sus chord, 6 on a sixth
  chord), from its interval rather than its role.
- `diatonicChord` matches stacked thirds against the catalogue in order, so the nineteen original
  entries stay first and every catalogue progression spells as it did (AC-2.16.3/4). The one new
  match is a major-third, augmented-fifth, major-seventh stack — maj7♯5 — which used to fall back to 7.
- `tools/validate-seed.js` mirrors the catalogue by hand and is updated with it. No migration: a chord
  without `omit` has every member, and a quality already stored is unchanged.
- Duplicate identity (`core/similarity.js`) carries `omit` beside the bass and the fill.

**Alternatives considered**:
- *A quality per omission* (m7(no3), m7(no5), 6(no3), 6(no5), 7(no5)…) — rejected: combinatorial, and
  only the combinations guessed at; the maintainer chose the toggle.
- *Striking the root too (rootless voicings)* — rejected for now: the root is the bass's anchor and
  every fill's first step, and a progression that never sounds its roots is a different instrument.
- *Stopping the catalogue at 9ths* — offered and declined by the maintainer: "comprehensive" reaches
  the 13ths.
- *Altered chords with two members in one role* (7alt, 7♭9♯9) — not added: the stack finds a role's
  member by its role, and two would make one of them unreachable.

## D-024 — Starting a progression from scratch: Custom is an entry, and it starts with one chord

**Decision (2026-10-31)**: the progression picker's Custom entry is permanent — second, after None — and
choosing it is a mutation: `core/harmony.startProgression(pattern)` gives the Pattern a progression
of one chord, the tonic of its Key spelled from its scale through the same `diatonicChord` a catalogue
pick uses, voiced over its root, with the change setting and arpeggio carried as `setProgression`
carries them. The chord editor, which appears whenever a progression exists, then builds the rest
with the controls it already has (US-2.17).

**Why.** The maintainer could not find a way to write their own chords: "It seems I have to pick a
progression and then just edit it." Every progression began as a catalogue entry because the editor
was conditional on a progression existing and nothing but the catalogue could make one exist. The
smallest honest fix is to let the entry that already names an edited progression also start one:
the state "chords that match no catalogue entry" is the same whether reached by editing or by
starting, so one word in the picker covers it. One chord rather than none because every reading of a
progression — the deal, the chord in force, the strip, the data model's rule 14 — assumes at least one
chord, and an empty progression would need a second notion of "a progression with nothing in it".
The tonic chord rather than always major because a catalogue pick in C Aeolian gives Cm (AC-2.6.1/3)
and a scratch progression that opened with C major in a minor Key would need an edit before it was
right.

**Consequences.**
- AC-2.6.1/1 is revised: Custom is a second fixed entry, and no longer appears at the foot only once
  chords are edited. The ordering test is rewritten to the revised criterion.
- `onProgression('custom')` is a no-op only while the picker already reads Custom, which the select
  cannot fire anyway; otherwise it is an edit — the shipped-Pattern naming guard, one history entry,
  auto-save — and under Cycle progressions it turns the cycle off as None does, since the Composer is
  asking for their own chords and the cycle would substitute the catalogue's.
- No data-model change, no migration. `matchProgression`, `progressionIndexOf`, the dice and the
  Heard in line already handle chords that match no entry.

**Alternatives considered**:
- *A separate "Start from scratch" entry beside a trailing Custom* — offered and declined by the
  maintainer: two entries for one state, and the picker would read a different word from the one
  chosen.
- *A progression of zero chords, the editor showing only + Chord* — rejected: nothing downstream can
  read an empty progression, and `hasHarmony` would need a second meaning.
- *+ Chord visible with no progression* — rejected: the picker is where a progression begins
  (AC-2.6.1), and the chord editor is conditional on a progression by design (AC-15.1.8).
- *Always a major triad* — offered and declined by the maintainer: the tonic of the scale.
