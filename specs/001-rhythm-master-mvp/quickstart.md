# Quickstart: running and validating Rhythm Master

Written against the structure in [plan.md](./plan.md). None of this exists yet — this document
describes what `/speckit-implement` must make true, and is the checklist for confirming it did.

## Prerequisites

- Node 20+
- A Chromium for Playwright. In the standard dev container one is already present at
  `/opt/pw-browsers`; `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` keeps npm from fetching another.

## Setup

```bash
npm install
npm run dev          # Vite dev server, prints a localhost URL
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Static production build into `dist/` |
| `npm run preview` | Serve `dist/` — this is what CI publishes |
| `npm test` | Vitest unit suite over `core/` and `storage/` |
| `npm run test:e2e` | Playwright suite over grid, transport, and responsive behaviour |
| `npm run coverage:ac` | Maps every AC ID in `spec.md` to a test name; exits non-zero on any gap |
| `npm run validate:seed` | Validates `data/seed-patterns.json` against data-model §7 |
| `npm run check:cvd` | Renders the accent palette under simulated colour vision deficiencies and asserts the four states stay distinguishable |

`npm run coverage:ac` is the gate that makes FR-014 real. It is expected to fail loudly for most of
the build and reach zero gaps before release.

---

## Validation scenarios

Each proves an end-to-end slice. Run them against `npm run dev`.

### V1 — Mixed meter plays correctly (US-1.1, US-4.1)

1. New Pattern. Set Measure 1 to 4/4; when asked whether to apply to all, choose **This Measure**.
2. Add a Measure; confirm it inherits 4/4. Change it to 6/8.
3. Turn on the first Slot of every Beat in both Measures.
4. Play.

**Expected**: Measure 1 sounds 4 quarter-note Beats, Measure 2 sounds 6 eighth-note Beats — not two
dotted-quarter Beats. The loop counter increments once per full pass, not once per Measure.
*Covers AC-1.1.2, AC-1.1.4, AC-4.1.3, AC-4.1.4, and Principle I's no-implied-grouping rule.*

### V2 — Mixed subdivision within one Beat (US-1.3)

1. On a 4/4 Measure, set Beat 2's Recipe to **Straight → Triplet**.
2. Confirm it shows 5 Slots: 2 straight, then 3 triplet, with the group boundary visible.
3. Turn on all 5 and play at 60 BPM.
4. Switch the counting system to Takadimi.

**Expected**: the first half-beat is two even 16ths, the second is an even triplet. The grid renders
in **Numbered** despite Takadimi being selected, and the global preference is unchanged when you
open a Pattern without a mixed Recipe. *Covers AC-1.3.4, AC-1.3.9, AC-5.6.2, AC-5.6.3.*

### V3 — Accent defaults are musical, and overrides stick (US-3.1)

1. New 4/4 Pattern, Straight 16ths throughout. Turn on Slot 1 of each Beat.
2. Read the four accents.

**Expected**: Beat 1 Strong, Beat 2 Weak, Beat 3 Medium, Beat 4 Weak — without touching anything.
3. Tap Beat 2's Slot 1 to cycle its accent; reload the page.
**Expected**: the override survived; the other three are still computed, not frozen.
4. Change Beat 3's Recipe away and back.
**Expected**: it returns to Medium — recomputed from position, not restored from memory.
*Covers AC-3.1.2 … AC-3.1.10, FR-003.*

### V4 — Melodic playback matches what was authored (US-2.2, US-2.3, SC-003)

1. Set Sound Mode to Melodic; choose key **Eb**.
2. Assign degrees 1, 3, 5 across three Slots, putting the 5 an octave down.
3. Play, then export MIDI and open the `.mid`.

**Expected**: playback sounds a real piano, not a synth; the low note is an octave below; the `.mid`
carries the same three pitches at the same octaves, with velocities reflecting accent. Percussive
playback was available immediately on load, before samples finished. *Covers AC-2.2.x, AC-2.3.x,
AC-2.4.3, US-12.1.*

### V5 — Nothing is lost (US-7.2, US-7.3, SC-005)

1. Open a shipped Pattern and edit a Slot.
**Expected**: a naming prompt appears *before* the edit applies. Cancel — the shipped Pattern is
untouched.
2. Name it and continue editing. Reload mid-edit without any save action.
**Expected**: every edit is there.
3. Confirm the shipped original is still present and unmodified.
*Covers AC-7.2.x, AC-7.3.x, FR-007.*

### V6 — The worst case on a phone (US-15.1)

1. Build 6 Measures of 12/8, every Beat Straight 16ths — 144 Slots.
2. View at 390 px wide.

**Expected**: one Measure per row, stacked vertically. No horizontal scrolling of the page or the
grid. Every Slot at least 24 px wide and reliably tappable. Playing scrolls the sounding Measure
into view and scrolls back on loop. *Covers AC-15.1.10, AC-15.1.11.*

### V7 — Timing holds over a long session (SC-002)

Play a Pattern continuously for 30 minutes.

**Expected**: no audible drift between click, Pattern, and cursor; no stall; no degradation. The
automated form of this is AC-4.1.1's 500-loop assertion, which is the version that runs in CI.

### V8 — Local Metadata never escapes (FR-006)

1. Submit a Pattern, so it acquires submission history.
2. Export it as MIDI, and open the submission body.

**Expected**: neither contains submission history, resolved-duplicate state, ids, ratings, or tags.
The automated form is the serialization test in
[contracts/file-formats.md](./contracts/file-formats.md).

---

## Definition of done

- `npm test` and `npm run test:e2e` pass.
- `npm run coverage:ac` reports **zero** uncovered ACs.
- `npm run validate:seed` passes; all 112 Patterns load.
- `npm run check:cvd` passes.
- V1–V8 all behave as described.
- The Actions workflow runs test → build → publish, and a failing test blocks the deploy.
