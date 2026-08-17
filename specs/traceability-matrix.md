# Traceability Matrix

<!--
  GENERATED FILE — do not edit by hand.

  Regenerate with:  npm run trace:matrix
  It is checked by  npm run check:trace  (check T8), so an out-of-date matrix fails
  the build rather than sitting quietly out of step with the spec.

  The decisions live elsewhere. Which AC belongs to which plan item, and which tasks
  build and prove it, are authored in the plan's own Traceability Matrix. This file is
  that expanded one row per criterion, cross-referenced against the test suite, and
  marked with what is true right now.
-->

**Feature**: specs/001-rhythm-master-mvp/spec.md
**Criteria**: 264 across 35 User Stories

**Coverage**: 66 of 264 criteria proven (25.0%)

| | Criteria | Share |
|---|---|---|
| 🟢 Proven | 66 | 25.0% |
| 🔴 Gap — HIGH | 77 | 29.2% |
| 🟠 Gap — MEDIUM | 42 | 15.9% |
| 🟡 Gap — LOW | 79 | 29.9% |

A row is one *criterion*: an Acceptance Criterion that asserts one thing, or one Case of
an AC that asserts several. 🖵 marks a criterion that describes something a person sees or
does, which cannot be proved by a test with no document to look at.

🟢 proven · 🔵 waived · and 🟡 → 🟠 → 🔴
as a gap gets more serious. The colour only repeats what the row already says in words, so
nothing is lost reading this in greyscale, in a plain diff, or by someone who cannot tell
the red from the green.

## How a gap is ranked

Severity comes from the kind of gap, not from a judgement recorded per criterion, so it
cannot be talked down when a deadline is close.

| Severity | Gap | Why it ranks there |
|---|---|---|
| 🔴 **CRITICAL** | NO TEST — nothing names this criterion | Nobody has looked. This is the state an unbuilt requirement sits in. |
| 🔴 **HIGH** | WRONG TEST — a test names it but proves something else | The claim is unproven while reporting as covered. This is what hid US-2.2 and US-11.1/11.2. |
| 🔴 **HIGH** | NOT PROVABLE — UI-level, but only a pure unit test | Same failure, arrived at differently: `core/` cannot see a screen, whatever the test is named. |
| 🟠 **MEDIUM** | NEEDS CASES — a compound AC not decomposed | Partly proven. One test stands in for several claims, so some of them are unchecked. |
| 🟡 **LOW** | MISNAMED — right test, named in its own words | Proven. Clerical: the name has drifted from the spec's wording. |

🔵 **WAIVED** marks a gap deliberately left open, with its reason shown in the row. Only LOW
and MEDIUM may be waived — CRITICAL and HIGH are exactly the states that let unbuilt work
report as complete, so no reason clears them (Constitution Principle IV).

ᵃ marks a gap accepted as pre-existing debt (198 rows). It is reported but does not
fail the build, and it is outstanding work — never a settled decision.

## Coverage by User Story

| User Story | Criteria | 🟢 Proven | 🔵 Waived | 🔴 CRITICAL | 🔴 HIGH | 🟠 MEDIUM | 🟡 LOW |
|---|---|---|---|---|---|---|---|
| 🔴 US-1.1 | 9 | 1 | · | · | 4 | · | 4 |
| 🟠 US-1.2 | 4 | 0 | · | · | · | 4 | · |
| 🔴 US-1.3 | 10 | 0 | · | · | 1 | 3 | 6 |
| 🔴 US-1.4 | 8 | 0 | · | · | 2 | 4 | 2 |
| 🔴 US-2.1 | 5 | 0 | · | · | 2 | · | 3 |
| 🔴 US-2.2 | 29 | 16 | · | · | 1 | 7 | 5 |
| 🟡 US-2.3 | 3 | 0 | · | · | · | · | 3 |
| 🔴 US-2.4 | 5 | 0 | · | · | 2 | · | 3 |
| 🔴 US-3.1 | 20 | 4 | · | · | 3 | 1 | 12 |
| 🔴 US-4.1 | 10 | 4 | · | · | 3 | 1 | 2 |
| 🔴 US-4.2 | 3 | 0 | · | · | 1 | 2 | · |
| 🟠 US-4.3 | 6 | 0 | · | · | · | 1 | 5 |
| 🔴 US-4.4 | 5 | 0 | · | · | 5 | · | · |
| 🔴 US-5.1 | 6 | 0 | · | · | 5 | · | 1 |
| 🔴 US-5.2 | 3 | 0 | · | · | 1 | · | 2 |
| 🔴 US-5.3 | 10 | 0 | · | · | 7 | 3 | · |
| 🟠 US-5.5 | 2 | 0 | · | · | · | 1 | 1 |
| 🔴 US-5.6 | 13 | 2 | · | · | 10 | 1 | · |
| 🔴 US-6.1 | 6 | 0 | · | · | 3 | · | 3 |
| 🟠 US-7.1 | 2 | 0 | · | · | · | 1 | 1 |
| 🔴 US-7.2 | 3 | 0 | · | · | 2 | · | 1 |
| 🔴 US-7.3 | 5 | 0 | · | · | 1 | · | 4 |
| 🔴 US-7.4 | 6 | 0 | · | · | 1 | · | 5 |
| 🔴 US-7.5 | 4 | 0 | · | · | 1 | · | 3 |
| 🔴 US-8.1 | 6 | 0 | · | · | 1 | 1 | 4 |
| 🔴 US-10.1 | 6 | 2 | · | · | 1 | · | 3 |
| 🟠 US-11.1 | 9 | 8 | · | · | · | 1 | · |
| 🟢 US-11.2 | 6 | **6** | · | · | · | · | · |
| 🔴 US-11.3 | 5 | 0 | · | · | 4 | · | 1 |
| 🔴 US-12.1 | 4 | 0 | · | · | 4 | · | · |
| 🟢 US-13.1 | 10 | **10** | · | · | · | · | · |
| 🔴 US-15.1 | 18 | 5 | · | · | 1 | 9 | 3 |
| 🔴 US-16.1 | 11 | 0 | · | · | 9 | 2 | · |
| 🔴 US-16.2 | 4 | 0 | · | · | 2 | · | 2 |
| 🟢 US-15.2 | 8 | **8** | · | · | · | · | · |

## Every criterion

| Story | Criterion | What it requires | Plan | Implementation tasks | Test tasks | Proving test | Status |
|---|---|---|---|---|---|---|---|
| US-1.1 | `AC-1.1.1` | New Pattern defaults | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js`, `grid.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.1 | `AC-1.1.2` 🖵 | Appending inherits the preceding Measure's Time Signature | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js` | 🔴 **HIGH** · NOT PROVABLE ᵃ |
| US-1.1 | `AC-1.1.3` 🖵 | 8-Measure cap disables +Measure | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js`, `grid.spec.js` | 🟢 OK |
| US-1.1 | `AC-1.1.4` 🖵 | Single-Measure Time Signature change applies immediately | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-1.1 | `AC-1.1.5` | Multi-Measure change prompts apply-to-all vs. this-one | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.1 | `AC-1.1.6` | Time Signature change resets that Measure's content | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.1 | `AC-1.1.7` | Time Signature reset is undoable | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.1 | `AC-1.1.8` 🖵 | Last remaining Measure can't be removed | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js` | 🔴 **HIGH** · NOT PROVABLE ᵃ |
| US-1.1 | `AC-1.1.9` 🖵 | Measure removal is always from the end | P-005 | T036, T037 (2/2 done) | T038 (1/1 done) | `pattern.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-1.2 | `AC-1.2.1` | Beat count and note-value are independent per Measure | P-006 | T039 (1/1 done) | T040 (1/1 done) | `meter.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.2 | `AC-1.2.2` | Beat count/note-value table for all 10 Time Signatures | P-006 | T039 (1/1 done) | T040 (1/1 done) | `meter.test.js`, `grid.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.2 | `AC-1.2.3` | 7/8 is 7 ungrouped Beats | P-006 | T039 (1/1 done) | T040 (1/1 done) | `meter.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.2 | `AC-1.2.4` | 6/8 is 6 ungrouped Beats | P-006 | T039 (1/1 done) | T040 (1/1 done) | `meter.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.3 | `AC-1.3.1` | Default Recipe for a quarter-note Beat | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `recipes.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.3 | `AC-1.3.2` | Default Recipe for an eighth-note Beat | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `recipes.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.3 | `AC-1.3.3` | New Recipe Slots start off | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `pattern.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.3 | `AC-1.3.4` 🖵 | Recipe menu for a quarter-note Beat | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `recipes.test.js`, `timeline.test.js`, `grid.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.3 | `AC-1.3.5` 🖵 | Recipe menu for an eighth-note Beat | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `pattern.test.js`, `recipes.test.js` | 🔴 **HIGH** · NOT PROVABLE ᵃ |
| US-1.3 | `AC-1.3.6` | Recipe change resets only that Beat | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `pattern.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.3 | `AC-1.3.7` | Recipe change on a Beat that has notes requires confirmation | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `pattern.test.js`, `grid.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.3 | `AC-1.3.8` | Confirmation is required in both directions, since any Recipe change clears the Beat | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `pattern.test.js`, `grid.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.3 | `AC-1.3.9` 🖵 | Accent works identically on a triplet-feel Slot | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.3 | `AC-1.3.10` 🖵 | Recipe change on an empty Beat applies with no confirmation | P-007 | T041, T042, T043 (3/3 done) | T044 (1/1 done) | `pattern.test.js`, `grid.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.4 | `AC-1.4.1` 🖵 | Time Signature label is itself the picker control | P-008 | T045 (1/1 done) | T046 (1/1 done) | `grid.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-1.4 | `AC-1.4.2` 🖵 | Picker offers exactly the 10 supported values | P-008 | T045 (1/1 done) | T046 (1/1 done) | `grid.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-1.4 | `AC-1.4.3` 🖵 | Each Measure's label reflects only its own Time Signature | P-008 | T045 (1/1 done) | T046 (1/1 done) | `grid.test.js`, `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.4 | `AC-1.4.4` 🖵 | Prominent vs. dimmed label rendering | P-008 | T045 (1/1 done) | T046 (1/1 done) | `grid.test.js`, `remaining.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.4 | `AC-1.4.5` 🖵 | Uniform-meter Pattern renders only Measure 1 prominently | P-008 | T045 (1/1 done) | T046 (1/1 done) | `grid.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-1.4 | `AC-1.4.6` 🖵 | Changing a dimmed label recalculates neighboring prominence | P-008 | T045 (1/1 done) | T046 (1/1 done) | `grid.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.4 | `AC-1.4.7` 🖵 | Changing a prominent label recalculates neighboring prominence | P-008 | T045 (1/1 done) | T046 (1/1 done) | `grid.test.js`, `remaining.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-1.4 | `AC-1.4.8` 🖵 | Read-only contexts show labels without a picker | P-008 | T045 (1/1 done) | T046 (1/1 done) | `remaining.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-2.1 | `AC-2.1.1` | Sound Mode changes take effect immediately | P-014 | T065 (1/1 done) | T066 (1/1 done) | `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.1 | `AC-2.1.2` | New Pattern defaults to Percussive | P-014 | T065 (1/1 done) | T066 (1/1 done) | `melodic.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-2.1 | `AC-2.1.3` | Switching to Melodic requires a Key, defaulting to C | P-014 | T065 (1/1 done) | T066 (1/1 done) | `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.1 | `AC-2.1.4` 🖵 | Pitch data survives a Sound Mode round-trip | P-014 | T065 (1/1 done) | T066 (1/1 done) | `melodic.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-2.1 | `AC-2.1.5` | Sound Mode changes never alter Accent Levels | P-014 | T065 (1/1 done) | T066 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.2 | `AC-2.2.1` | One Pitch per Slot, no chords | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `timeline.test.js`, `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.2 | `AC-2.2.2` 🖵 | Armed pitch defaults to degree 1, octave 4, and stays armed | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-2.2 | `AC-2.2.3` 🖵 | Octave stepper clamps at its bounds | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-2.2 | `AC-2.2.4` 🖵 | Degree strip default span | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-2.2 | `AC-2.2.5` 🖵 | A Slot that is not sounding cannot be stamped | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-2.2 | `AC-2.2.6` 🖵 | Stamping a sounding Slot changes only its Pitch | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-2.2 | `AC-2.2.7` 🖵 | Cycling Accent to off clears Pitch too | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.2 | `AC-2.2.8` | Accent/Pitch null-state invariant | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.2 | `AC-2.2.9` 🖵 | Changing the armed pitch doesn't retroactively affect stamped Slots | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.2 | `AC-2.2.10` 🖵 | A Melodic Slot has two tap zones, and they do different jobs | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-2.2 | `AC-2.2.11` 🖵 | Turning a Slot on takes the armed pitch | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.2 | `AC-2.2.12` 🖵 | Both zones stay tappable at the smallest supported Slot | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-2.2 | `AC-2.2.17/1` 🖵 | On a precise pointer the note band's hit area shrinks to the strip it draws, so the Slot is shorter and the strip reads as the thin thing it is | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.17/2` 🖵 | On a touchscreen, at any viewport width, it keeps the 24 CSS pixel target AC-2.2.12 requires — a tablet held in the hand is a touchscreen whatever its width | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.17/3` 🖵 | The finger-sized target is the default, so a browser that cannot report the pointing device keeps it rather than losing it | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.13` 🖵 | The pitch strip is present wherever pitches are edited | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-2.2 | `AC-2.2.14/1` 🖵 | The note band is rendered below the accent zone, not above it | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.14/2` 🖵 | A visible gap separates the two zones, so neither reads as part of the other | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.14/3` 🖵 | The note band's text is rendered at least a third smaller than the counting syllable, so the difference is legible as a difference rather than merely present | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.14/4` 🖵 | The counting syllable is rendered bold and the note band's text is not, at a weight separation of at least 300 — a Medium face reads as bold at these sizes, so "bolder" is not enough | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.14/5` 🖵 | Neither line of the note band is clipped on any axis: the band gives its two lines enough leading that ascenders and descenders are not shaved | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.14/6` 🖵 | The counting syllable is the brightest text in the Slot, the scale degree dimmer, and the note name dimmer still — so the ordering survives a reader whose browser settings flatten every size and weight difference | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.15/1` 🖵 | The band shows the Slot's scale degree, including any accidental | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.15/2` 🖵 | The band shows the note name that degree resolves to in the Pattern's Key — letter, accidental where the spelling has one, and absolute octave number | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.15/3` 🖵 | The two are shown on one line within the band, so the band stays a thin strip under the accent zone rather than a second block of text competing with it | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.15/4` 🖵 | Changing the Pattern's Key updates every note name shown, while no stored degree or octave value changes (AC-2.3.2) | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.15/5` | The note name is spelled diatonically against the Key: each degree takes its own letter, so degree 3 in D♭ is `F` and `b3` is `Fb` rather than `E`, which is how the interval is written on a stave | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `pitch.test.js`, `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.16/1` 🖵 | Each degree button shows the note name it would stamp at the currently armed accidental and octave, alongside the degree | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.2 | `AC-2.2.16/2` 🖵 | Changing the Key, the accidental or the octave updates those names, since they describe what the button will do rather than what it is called | P-016 | T069, T160, T162, T163, T164, T165 (6/6 done) | T070, T161, T162, T163, T164, T165 (6/6 done) | `melodic.spec.js` | 🟢 OK |
| US-2.3 | `AC-2.3.1` | Default Key | P-015 | T067 (1/1 done) | T068 (1/1 done) | `pitch.test.js`, `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.3 | `AC-2.3.2` | Changing Key re-transposes without altering stored data | P-015 | T067 (1/1 done) | T068 (1/1 done) | `pitch.test.js`, `timeline.test.js`, `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.3 | `AC-2.3.3` 🖵 | Percussive Patterns have no Key | P-015 | T067 (1/1 done) | T068 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.4 | `AC-2.4.1` | Melodic playback uses the ported synthesis chain | P-017 | T071, T072 (2/2 done) | T073 (1/1 done) | `melodic.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.4 | `AC-2.4.2` | No audio asset is ever fetched | P-017 | T071, T072 (2/2 done) | T073 (1/1 done) | `melodic.spec.js`, `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.4 | `AC-2.4.3` | Neither Sound Mode waits on anything to load | P-017 | T071, T072 (2/2 done) | T073 (1/1 done) | `melodic.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-2.4 | `AC-2.4.4` | Melodic notes share one reverb and one compressor | P-017 | T071, T072 (2/2 done) | T073 (1/1 done) | `melodic.spec.js`, `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-2.4 | `AC-2.4.5` | Percussive playback stays dry and single-oscillator | P-017 | T071, T072 (2/2 done) | T073 (1/1 done) | `melodic.spec.js`, `remaining.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-3.1 | `AC-3.1.1` 🖵 | Turning on a Slot lands on its computed default, not a fixed value | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js`, `pattern.test.js`, `grid.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.2` | Beat Accent table | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-3.1 | `AC-3.1.3` | Within-Beat rule, 4-Slot Recipe on a Strong Beat | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js`, `timeline.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.4` | Within-Beat rule, 4-Slot Recipe on a Weak Beat | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.5` | Within-Beat rule, 4-Slot Recipe on a Medium Beat | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.17/1` 🖵 | A silent Slot's counting syllable is not bold, while a sounding one's is | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `grid.spec.js` | 🟢 OK |
| US-3.1 | `AC-3.1.17/2` 🖵 | A silent Slot's counting syllable is rendered at about three quarters the size of a sounding one's | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `grid.spec.js` | 🟢 OK |
| US-3.1 | `AC-3.1.17/3` 🖵 | A silent Slot's counting syllable is dimmer than a sounding one's, so the distinction survives a reader whose browser clamps small sizes to a minimum | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `grid.spec.js` | 🟢 OK |
| US-3.1 | `AC-3.1.17/4` 🖵 | The Accent bar keeps its proportion to the Slot at every Recipe, so a wide cell does not reduce the Accent to a detail | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `grid.spec.js` | 🟢 OK |
| US-3.1 | `AC-3.1.16` | The within-Beat shape is identical in every Beat | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-3.1 | `AC-3.1.6` | Within-Beat rule, 2-Slot Recipe | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.7` | Within-Beat rule, 3-Slot Triplet Recipe | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.8` | Within-Beat rule, 5-Slot mixed Recipe | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.9` | Within-Beat rule, 1-Slot undivided Recipe | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.10` | Computed default recomputes fresh after a Recipe reset | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.11` 🖵 | Override cycle, Strong default | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js`, `pattern.test.js`, `grid.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.12` 🖵 | Override cycle, Medium default | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js`, `pattern.test.js` | 🔴 **HIGH** · NOT PROVABLE ᵃ |
| US-3.1 | `AC-3.1.13` 🖵 | Override cycle, Weak default | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `accents.test.js` | 🔴 **HIGH** · NOT PROVABLE ᵃ |
| US-3.1 | `AC-3.1.14` | Percussive accent-to-sound mapping is deterministic | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-3.1 | `AC-3.1.15` | Melodic accent-to-sound mapping is independent of Pitch | P-009 | T047, T048, T050, T166 (3/4 done) | T049, T166 (1/2 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-4.1 | `AC-4.1.1` | Playback stays sample-accurate over long loops | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `timeline.test.js`, `playback.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-4.1 | `AC-4.1.2` 🖵 | Visual highlight stays in sync with audio | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `playback.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-4.1 | `AC-4.1.7/1` 🖵 | It is the accent zone that is marked — the cell carrying the counting syllable — never the note band beneath it | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `playback.spec.js` | 🟢 OK |
| US-4.1 | `AC-4.1.7/2` 🖵 | That cell fills completely with its own Accent colour, rather than being outlined | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `playback.spec.js` | 🟢 OK |
| US-4.1 | `AC-4.1.7/3` 🖵 | The counting syllable stays legible against the fill, at every Accent Level | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `playback.spec.js` | 🟢 OK |
| US-4.1 | `AC-4.1.7/4` 🖵 | A Slot that does not sound still shows the cursor as it passes, so the pulse can be followed through rests | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `playback.spec.js` | 🟢 OK |
| US-4.1 | `AC-4.1.3` | Loop counter increments once per full pass | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `timeline.test.js`, `playback.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-4.1 | `AC-4.1.4` | Mixed-meter Pattern plays each Measure by its own Time Signature | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `timeline.test.js`, `playback.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-4.1 | `AC-4.1.5` | Audio suspended by the device stops the transport and resets it | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `playback.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-4.1 | `AC-4.1.6` 🖵 | Returning after a suspension requires a deliberate Play | P-010 | T051, T052, T053, T054, T055, T165 (6/6 done) | T056, T165 (2/2 done) | `playback.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-4.2 | `AC-4.2.1` | Default tempo and range | P-011 | T057, T058 (2/2 done) | T059 (1/1 done) | `playback.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-4.2 | `AC-4.2.2` | Tempo change restarts playback immediately | P-011 | T057, T058 (2/2 done) | T059 (1/1 done) | `playback.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-4.2 | `AC-4.2.3` | Tempo default: global last-used, overridden by a per-Pattern save | P-011 | T057, T058 (2/2 done) | T059 (1/1 done) | `storage.test.js`, `playback.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-4.3 | `AC-4.3.1` 🖵 | Metronome/count-in defaults | P-012 | T060, T061 (2/2 done) | T062 (1/1 done) | `playback.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-4.3 | `AC-4.3.2` 🖵 | Click tone is identical across Sound Modes | P-012 | T060, T061 (2/2 done) | T062 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-4.3 | `AC-4.3.3` 🖵 | Count-in length matches the first Measure's Beat count | P-012 | T060, T061 (2/2 done) | T062 (1/1 done) | `remaining.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-4.3 | `AC-4.3.4` 🖵 | Metronome setting persists across reloads | P-012 | T060, T061 (2/2 done) | T062 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-4.3 | `AC-4.3.5` 🖵 | Count-in setting persists across reloads | P-012 | T060, T061 (2/2 done) | T062 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-4.3 | `AC-4.3.6` | Metronome/count-in have no per-Pattern override, unlike tempo | P-012 | T060, T061 (2/2 done) | T062 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-4.4 | `AC-4.4.1` | Swing default and range | P-013 | T063 (1/1 done) | T064 (1/1 done) | `swing.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-4.4 | `AC-4.4.2` 🖵 | Swing is set per Subdivision Group independently | P-013 | T063 (1/1 done) | T064 (1/1 done) | `swing.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-4.4 | `AC-4.4.3` 🖵 | Triplet-feel groups have no swing control | P-013 | T063 (1/1 done) | T064 (1/1 done) | `swing.test.js`, `timeline.test.js` | 🔴 **HIGH** · NOT PROVABLE ᵃ |
| US-4.4 | `AC-4.4.4` | Swing only affects the straight portion of a mixed Beat | P-013 | T063 (1/1 done) | T064 (1/1 done) | `timeline.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-4.4 | `AC-4.4.5` | Swing timing formula | P-013 | T063 (1/1 done) | T064 (1/1 done) | `swing.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.1 | `AC-5.1.1` | Shipped and custom Patterns appear in one unified list | P-024 | T087 (1/1 done) | T088 (1/1 done) | `library.test.js`, `library.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-5.1 | `AC-5.1.2` 🖵 | Library entry shows name, meter, and Measure/Beat count | P-024 | T087 (1/1 done) | T088 (1/1 done) | `library.test.js`, `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.1 | `AC-5.1.3` 🖵 | Mixed-meter Pattern shows "Mixed Meter" instead of one Time Signature | P-024 | T087 (1/1 done) | T088 (1/1 done) | `library.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.1 | `AC-5.1.4` | Default sort order: Rating descending, then alphabetical within each Rating | P-024 | T087 (1/1 done) | T088 (1/1 done) | `library.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.1 | `AC-5.1.5` 🖵 | Sort order applies on top of Tag filtering | P-024 | T087 (1/1 done) | T088 (1/1 done) | `library.test.js`, `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.1 | `AC-5.1.6` | "List order" elsewhere in the doc means this sort order | P-024 | T087 (1/1 done) | T088 (1/1 done) | `library.test.js`, `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.2 | `AC-5.2.1` 🖵 | Search matches name/description | P-025 | T089 (1/1 done) | T090 (1/1 done) | `library.test.js`, `library.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-5.2 | `AC-5.2.2` 🖵 | Search matching is case-insensitive | P-025 | T089 (1/1 done) | T090 (1/1 done) | `library.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-5.2 | `AC-5.2.3` 🖵 | Search results keep the library's default sort order | P-025 | T089 (1/1 done) | T090 (1/1 done) | `library.test.js`, `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.3 | `AC-5.3.1` | Auto-tags recompute immediately on configuration change | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `pattern.test.js`, `library.test.js`, `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.3 | `AC-5.3.2` | `custom` is permanent, set once at creation | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `pattern.test.js`, `library.test.js`, `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.3 | `AC-5.3.3` | `percussive`/`melodic` always reflects current Sound Mode | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `library.test.js`, `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.3 | `AC-5.3.4` | `swing` tracks live swing state | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `library.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.3 | `AC-5.3.5` 🖵 | Auto-tags are not user-removable and render distinctly | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.3 | `AC-5.3.9` 🖵 | Several Tags can be selected, and each one narrows further | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `library.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-5.3 | `AC-5.3.10` 🖵 | A Pattern's Tags live on the Pattern, not repeated down the library list | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `library.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-5.3 | `AC-5.3.7` | The Tag vocabulary means what it says | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `library.test.js`, `library.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-5.3 | `AC-5.3.6` | User Tag de-duplication is case-insensitive | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `library.test.js`, `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.3 | `AC-5.3.8` 🖵 | Tag-filter pill ordering | P-026 | T091, T092 (2/2 done) | T093 (1/1 done) | `library.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.5 | `AC-5.5.1` 🖵 | Prev/Next steps through the filtered list, not the full library | P-027 | T094 (1/1 done) | T095 (1/1 done) | `library.test.js`, `library.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-5.5 | `AC-5.5.2` 🖵 | Prev/Next doesn't wrap at list boundaries | P-027 | T094 (1/1 done) | T095 (1/1 done) | `library.test.js`, `library.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-5.6 | `AC-5.6.1` 🖵 | Counting-system toggle updates labels live | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js`, `storage.test.js` | 🔴 **HIGH** · NOT PROVABLE ᵃ |
| US-5.6 | `AC-5.6.2` 🖵 | A Pattern containing a mixed-feel Recipe supports Numbered only | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js`, `grid.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-5.6 | `AC-5.6.3` 🖵 | Pattern-level restriction does not overwrite the global setting | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.4` 🖵 | A Pattern without mixed-feel Recipes supports all three systems | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js`, `grid.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.5` | Adding a mixed-feel Recipe to a Pattern switches it to Numbered immediately | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.6` | Default counting system on first load | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.7` | Numbered scheme, restart per Beat | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.8` | Numbered scheme, continuous across the Measure for 1-Slot Beats | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.9` | Numbered scheme, restart per Beat even at eighth-note-Beat granularity | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.10` | Numbered scheme, no compound grouping (deferred) | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.11` 🖵 | Numbered scheme handles mixed-feel Recipes by position | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-5.6 | `AC-5.6.12` | 1-e-&-a scheme, the leading digit is the Beat's own number | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js`, `grid.spec.js` | 🟢 OK |
| US-5.6 | `AC-5.6.13` | 1-e-&-a scheme, restart per Beat even at eighth-note-Beat granularity | P-018 | T074, T075, T162 (3/3 done) | T076, T163 (2/2 done) | `counting.test.js` | 🟢 OK |
| US-6.1 | `AC-6.1.1` | New Pattern defaults to Rating 0 | P-028 | T096 (1/1 done) | T097 (1/1 done) | `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-6.1 | `AC-6.1.2` 🖵 | Rating filter defaults to All | P-028 | T096 (1/1 done) | T097 (1/1 done) | `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-6.1 | `AC-6.1.3` 🖵 | Tapping a star sets Rating from zero | P-028 | T096 (1/1 done) | T097 (1/1 done) | `library.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-6.1 | `AC-6.1.4` 🖵 | Tapping the current star clears Rating | P-028 | T096 (1/1 done) | T097 (1/1 done) | `library.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-6.1 | `AC-6.1.5` 🖵 | Tapping a different star changes Rating rather than clearing it | P-028 | T096 (1/1 done) | T097 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-6.1 | `AC-6.1.6` 🖵 | Rating filter narrows an already-filtered list | P-028 | T096 (1/1 done) | T097 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.1 | `AC-7.1.1` 🖵 | New Pattern name default and validation | P-019 | T077 (1/1 done) | T078 (1/1 done) | `remaining.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-7.1 | `AC-7.1.2` | A newly created Pattern is immediately in the library | P-019 | T077 (1/1 done) | T078 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.2 | `AC-7.2.1` 🖵 | Edits to an owned Pattern save immediately, no Save action | P-020 | T079 (1/1 done) | T080 (1/1 done) | `storage.test.js`, `grid.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.2 | `AC-7.2.2` | Each edit in a sequence saves individually | P-020 | T079 (1/1 done) | T080 (1/1 done) | `storage.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-7.2 | `AC-7.2.3` | Auto-saved edits survive an app close mid-edit | P-020 | T079 (1/1 done) | T080 (1/1 done) | `storage.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-7.3 | `AC-7.3.1` 🖵 | Editing a shipped Pattern triggers a naming prompt before the edit applies | P-021 | T081 (1/1 done) | T082 (1/1 done) | `grid.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.3 | `AC-7.3.2` 🖵 | Confirming the naming prompt creates a new owned Pattern | P-021 | T081 (1/1 done) | T082 (1/1 done) | `grid.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-7.3 | `AC-7.3.3` 🖵 | Canceling the naming prompt discards the edit | P-021 | T081 (1/1 done) | T082 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.3 | `AC-7.3.4` 🖵 | The naming prompt fires only once per shipped Pattern | P-021 | T081 (1/1 done) | T082 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.3 | `AC-7.3.5` 🖵 | Naming prompt enforces unique Pattern names | P-021 | T081 (1/1 done) | T082 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.4 | `AC-7.4.1` | Make Copy prompts for a name with no default | P-022 | T083 (1/1 done) | T084 (1/1 done) | `storage.test.js`, `operations.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.4 | `AC-7.4.2` 🖵 | Confirming Make Copy creates an independent Pattern | P-022 | T083 (1/1 done) | T084 (1/1 done) | `operations.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-7.4 | `AC-7.4.3` 🖵 | Canceling Make Copy creates nothing | P-022 | T083 (1/1 done) | T084 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.4 | `AC-7.4.4` | Make Copy enforces unique Pattern names | P-022 | T083 (1/1 done) | T084 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.4 | `AC-7.4.5` | A Make Copy result immediately qualifies as a Pattern Family member | P-022 | T083 (1/1 done) | T084 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.4 | `AC-7.4.6` 🖵 | Make Copy is unavailable on shipped Patterns | P-022 | T083 (1/1 done) | T084 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.5 | `AC-7.5.1` | Delete requires a naming confirmation | P-023 | T085 (1/1 done) | T086 (1/1 done) | `storage.test.js`, `operations.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-7.5 | `AC-7.5.2` | Delete is permanent | P-023 | T085 (1/1 done) | T086 (1/1 done) | `storage.test.js`, `operations.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.5 | `AC-7.5.3` 🖵 | Only owned Patterns can be deleted | P-023 | T085 (1/1 done) | T086 (1/1 done) | `operations.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-7.5 | `AC-7.5.4` 🖵 | Deleting one Family member doesn't affect the other | P-023 | T085 (1/1 done) | T086 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-8.1 | `AC-8.1.1` | Combine has no meter-matching restriction | P-029 | T098 (1/1 done) | T099 (1/1 done) | `pattern.test.js`, `operations.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-8.1 | `AC-8.1.2` 🖵 | Combine picker excludes Patterns that would exceed the 8-Measure cap | P-029 | T098 (1/1 done) | T099 (1/1 done) | `pattern.test.js`, `operations.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-8.1 | `AC-8.1.3` 🖵 | Combining to exactly 8 Measures succeeds | P-029 | T098 (1/1 done) | T099 (1/1 done) | `remaining.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-8.1 | `AC-8.1.4` | Combine into an owned Pattern auto-saves | P-029 | T098 (1/1 done) | T099 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-8.1 | `AC-8.1.5` 🖵 | Combine into a shipped Pattern triggers the naming prompt | P-029 | T098 (1/1 done) | T099 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-8.1 | `AC-8.1.6` 🖵 | Combine picker re-filters correctly on repeated use | P-029 | T098 (1/1 done) | T099 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-10.1 | `AC-10.1.1` | Duplicate copies the full Measure sequence exactly | P-030 | T100 (1/1 done) | T101 (1/1 done) | `pattern.test.js`, `operations.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-10.1 | `AC-10.1.2` | Duplicate focuses the newly-added second half | P-030 | T100 (1/1 done) | T101 (1/1 done) | `pattern.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-10.1 | `AC-10.1.3` 🖵 | Duplicate is enabled within the 8-Measure cap | P-030 | T100 (1/1 done) | T101 (1/1 done) | `remaining.spec.js` | 🟢 OK |
| US-10.1 | `AC-10.1.4` 🖵 | Duplicate is disabled when doubling would exceed the cap | P-030 | T100 (1/1 done) | T101 (1/1 done) | `operations.spec.js`, `remaining.spec.js` | 🟢 OK |
| US-10.1 | `AC-10.1.5` | Duplicate into an owned Pattern auto-saves | P-030 | T100 (1/1 done) | T101 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-10.1 | `AC-10.1.6` 🖵 | Duplicate into a shipped Pattern triggers the naming prompt | P-030 | T100 (1/1 done) | T101 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-11.1 | `AC-11.1.1` | True duplicate match criteria | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `similarity.test.js` | 🟢 OK |
| US-11.1 | `AC-11.1.2` | Differing Sound Mode, Pitch, or swing excludes a duplicate match | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `similarity.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-11.1 | `AC-11.1.3` 🖵 | Duplicate warning fires only at Pattern-creation moments | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `duplicates.spec.js`, `operations.spec.js` | 🟢 OK |
| US-11.1 | `AC-11.1.4/1` 🖵 | The view lists a duplicate that no warning ever fired for | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.1 | `AC-11.1.4/2` 🖵 | The view covers the whole library, not only the loaded Pattern | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.1 | `AC-11.1.5/1` 🖵 | Confirming removal deletes that Pattern and leaves its twin | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.1 | `AC-11.1.5/2` 🖵 | A shipped Pattern offers no Remove control in this view | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.1 | `AC-11.1.6/1` 🖵 | Removing the open Pattern loads its surviving twin | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.1 | `AC-11.1.6/2` 🖵 | Removing a Pattern that is not open leaves the editor where it was | P-031 | T102, T103, T148 (3/3 done) | T104, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.2 | `AC-11.2.1` | Family match criteria | P-032 | T105, T148 (2/2 done) | T106, T155 (2/2 done) | `similarity.test.js`, `operations.spec.js` | 🟢 OK |
| US-11.2 | `AC-11.2.2` | Family detection recomputes on every edit, not just creation | P-032 | T105, T148 (2/2 done) | T106, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.2 | `AC-11.2.3` | Family members remain fully independent | P-032 | T105, T148 (2/2 done) | T106, T155 (2/2 done) | `similarity.test.js` | 🟢 OK |
| US-11.2 | `AC-11.2.4` 🖵 | Family members are discoverable via normal Tag/name listing | P-032 | T105, T148 (2/2 done) | T106, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.2 | `AC-11.2.5/1` 🖵 | Below 768px no family information is shown | P-032 | T105, T148 (2/2 done) | T106, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.2 | `AC-11.2.5/2` 🖵 | At 768px and wider the editor lists family members as links | P-032 | T105, T148 (2/2 done) | T106, T155 (2/2 done) | `duplicates.spec.js` | 🟢 OK |
| US-11.3 | `AC-11.3.1` | Trigger: app load after a library update | P-033 | T107 (1/1 done) | T108 (1/1 done) | `storage.test.js`, `operations.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-11.3 | `AC-11.3.2` 🖵 | One-time Remove/Keep prompt, with data-loss callout | P-033 | T107 (1/1 done) | T108 (1/1 done) | `storage.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-11.3 | `AC-11.3.3` 🖵 | Remove deletes the custom copy | P-033 | T107 (1/1 done) | T108 (1/1 done) | `remaining.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-11.3 | `AC-11.3.4` 🖵 | Keep retains both, no repeat prompt for that pair | P-033 | T107 (1/1 done) | T108 (1/1 done) | `remaining.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-11.3 | `AC-11.3.5` | Resolved-pair tracking is Local Metadata | P-033 | T107 (1/1 done) | T108 (1/1 done) | `remaining.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-12.1 | `AC-12.1.1` | MIDI generation is entirely client-side | P-034 | T109 (1/1 done) | T110 (1/1 done) | `export.test.js`, `operations.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-12.1 | `AC-12.1.2` | Percussive exports to a drum channel; Melodic exports pitched notes | P-034 | T109 (1/1 done) | T110 (1/1 done) | `export.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-12.1 | `AC-12.1.3` | Accent Level maps to a fixed MIDI velocity table | P-034 | T109 (1/1 done) | T110 (1/1 done) | `export.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-12.1 | `AC-12.1.4` | Mixed-meter Pattern exports each Measure by its own Time Signature | P-034 | T109 (1/1 done) | T110 (1/1 done) | `export.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-13.1 | `AC-13.1.1/1` 🖵 | The submission URL carries the title, the `new-pattern` label and the Pattern's full definition as query parameters | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.1/2` 🖵 | Submit presents the URL as a clickable link that opens GitHub's own issue page in a new tab | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.1/3` 🖵 | No GitHub credential is held and GitHub's API is never called | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.2` | Bulk submission batches multiple Patterns into one issue | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.3/1` 🖵 | An oversized submission links to a title-and-label-only issue and shows the paste-it-yourself note | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.3/2` 🖵 | A submission within the limit prefills title, label and body in full | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.4/1` | A Pattern submitted and unedited since is excluded from a later bulk submission | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.4/2` | A Pattern edited since it was submitted is included again | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.4/3` | A Pattern never submitted is included | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `submission.spec.js` | 🟢 OK |
| US-13.1 | `AC-13.1.5` | Submission-tracking is Local Metadata, never part of the export payload | P-035 | T111, T112, T169 (3/3 done) | T113, T170 (2/2 done) | `export.test.js`, `storage.test.js`, `operations.spec.js` | 🟢 OK |
| US-15.1 | `AC-15.1.1` 🖵 | Breakpoint definitions | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `grid.spec.js`, `responsive.spec.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-15.1 | `AC-15.1.2` 🖵 | Desktop sidebar is a 300px column, open on load and collapsible | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.3` 🖵 | Tablet sidebar is a 240px column, open on load and collapsible | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-15.1 | `AC-15.1.4` 🖵 | Mobile sidebar is an off-canvas drawer | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-15.1 | `AC-15.1.5` 🖵 | Mobile drawer auto-opens on every page load | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.6` 🖵 | The library collapses whenever a Pattern is loaded, at every width | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.7` 🖵 | Secondary control sections collapse to accordions on mobile | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.8` 🖵 | Fixed main-panel section order | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.9` 🖵 | Wide controls never force horizontal page scrolling | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-15.1 | `AC-15.1.10` 🖵 | Grid remains usable for the largest supported Pattern on mobile | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `grid.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.11` 🖵 | Playback keeps the sounding Measure in view on mobile | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.12` 🖵 | The library and the main panel scroll independently | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.13` 🖵 | The collapsed library is one control away, and every load starts it open | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `responsive.spec.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-15.1 | `AC-15.1.14/1` | Every Beat in a Measure is the same width as every other Beat in it, on its own line and across lines | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `grid.spec.js` | 🟢 OK |
| US-15.1 | `AC-15.1.14/2` 🖵 | No Beat is narrower than its own Slots need at the 24px minimum, so the grid still never scrolls sideways | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `grid.spec.js` | 🟢 OK |
| US-15.1 | `AC-15.1.14/3` | Beats divide evenly between lines: four Beats where three fit lay out two and two, never three and one | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `grid.spec.js` | 🟢 OK |
| US-15.1 | `AC-15.1.14/4` | Where every Beat fits one line, they occupy that one line and still share the width | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `grid.spec.js` | 🟢 OK |
| US-15.1 | `AC-15.1.14/5` | The layout re-balances when the width available to the grid changes | P-036 | T114, T115, T116, T160, T167 (5/5 done) | T117, T161, T168 (3/3 done) | `grid.spec.js` | 🟢 OK |
| US-16.1 | `AC-16.1.1` | Shipped library present on first run | P-003 | T032 (1/1 done) | T033 (1/1 done) | `timeline.test.js`, `seed.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.1 | `AC-16.1.2` 🖵 | Shipped Patterns are not marked as user-authored | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🔴 **HIGH** · NOT PROVABLE ᵃ |
| US-16.1 | `AC-16.1.3` | Legacy category becomes a Tag | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.1 | `AC-16.1.4` | Straight and triplet beats map to Recipes | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.1 | `AC-16.1.5` | One Pattern-wide meter becomes a per-Measure Time Signature | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.1 | `AC-16.1.6` | Sub-measure drill cells become their own short Measure | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-16.1 | `AC-16.1.7` | Deliberate accents are preserved; everything else uses computed defaults | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🟠 **MEDIUM** · NEEDS CASES ᵃ |
| US-16.1 | `AC-16.1.8` | Melodic Patterns have their pitches resolved at conversion time | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.1 | `AC-16.1.9` | Trailing silent Measures are dropped | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.1 | `AC-16.1.10` | Seeded data satisfies every structural rule in this specification | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.1 | `AC-16.1.11` | Conversion is reproducible, not hand-edited | P-003 | T032 (1/1 done) | T033 (1/1 done) | `seed.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.2 | `AC-16.2.1` | Patterns are data, not source | P-004 | T034 (1/1 done) | T035 (1/1 done) | `pattern.test.js`, `seed.test.js`, `storage.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-16.2 | `AC-16.2.2` | Adding a Pattern requires no code change | P-004 | T034 (1/1 done) | T035 (1/1 done) | `pattern.test.js`, `seed.test.js`, `storage.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.2 | `AC-16.2.3` | Malformed entries fail loudly, not silently | P-004 | T034 (1/1 done) | T035 (1/1 done) | `pattern.test.js`, `seed.test.js`, `storage.test.js` | 🔴 **HIGH** · WRONG TEST ᵃ |
| US-16.2 | `AC-16.2.4` | The data file is versioned | P-004 | T034 (1/1 done) | T035 (1/1 done) | `pattern.test.js`, `seed.test.js`, `storage.test.js` | 🟡 **LOW** · MISNAMED ᵃ |
| US-15.2 | `AC-15.2.1/1` 🖵 | A Measure block's border, against the page background behind it | P-038 | T160 (1/1 done) | T161 (1/1 done) | `grid-boundaries.spec.js` | 🟢 OK |
| US-15.2 | `AC-15.2.1/2` 🖵 | A Beat's border, against the Measure panel behind it | P-038 | T160 (1/1 done) | T161 (1/1 done) | `grid-boundaries.spec.js` | 🟢 OK |
| US-15.2 | `AC-15.2.1/3` 🖵 | A Slot's border, against the Measure panel behind it | P-038 | T160 (1/1 done) | T161 (1/1 done) | `grid-boundaries.spec.js` | 🟢 OK |
| US-15.2 | `AC-15.2.1/4` 🖵 | A Melodic Slot's accent-to-note divider, against the Slot's unfilled background | P-038 | T160 (1/1 done) | T161 (1/1 done) | `grid-boundaries.spec.js` | 🟢 OK |
| US-15.2 | `AC-15.2.2` 🖵 | A Beat is bounded by a drawn border, not by spacing alone | P-038 | T160 (1/1 done) | T161 (1/1 done) | `grid-boundaries.spec.js` | 🟢 OK |
| US-15.2 | `AC-15.2.3` | The boundaries form a hierarchy, so nesting is readable | P-038 | T160 (1/1 done) | T161 (1/1 done) | `grid-boundaries.spec.js` | 🟢 OK |
| US-15.2 | `AC-15.2.4` 🖵 | The grid's boundary colours belong to the grid alone | P-038 | T160 (1/1 done) | T161 (1/1 done) | `grid-boundaries.spec.js` | 🟢 OK |
| US-15.2 | `AC-15.2.5` | Raising boundary contrast leaves the Accent and feel encodings intact | P-038 | T160 (1/1 done) | T161 (1/1 done) | `grid-boundaries.spec.js` | 🟢 OK |
