# Loop variations — design brief before the spec

*Written 2026-11-01, before any code. This is the input to `/speckit-specify`; it is not the
spec. It records what the repository already holds, what the research found, the model
change the request needs, and the rulings the maintainer has to make.*

---

## 1. What the record already holds

- **US-10.3 "Add variation" shipped on 2026-10-25 (PR #145), gained an audition the same
  day (#149), and was withdrawn whole on 2026-10-31 (#150)** — "I don't like how it's
  implemented and I am going to need to redesign it." D-020 keeps two lessons: a variation
  must be **heard before it is written**, and a device that hides a choice among many options
  needs that choice **offered, not guessed**.
- **The maintainer already declined a separate variation object beside the Pattern** (D-020,
  "a second place content lives"). The shipped design grew the Pattern by Measures through
  the same `append` Double Length uses, with the original phrase as the first N Measures and N
  remembered in Local Metadata as `phraseLength`.
- **US-2.15 (a fill per chord, 2026-10-31) was built as "the first piece of the variations
  redesign"**: a chord's fill is Pattern content on `harmony.chords[i].fill`, and the deal reads
  it at every chord change (D-022).
- **US-2.14 Roll the dice** already exists for the Melody group (key, scale, register,
  progression, chord changes, fill, voicing), with per-control No dice toggles; randomness
  comes from the UI, never `core/` (D-021).
- The withdrawal left a named gap: Make it melodic and Combine patterns show no Double Length
  (AC-15.1.8 note, D-018 ruling).

## 2. The one modelling fact that decides the design

Three of the eight requested techniques change **a chord** — its inversion, its fill, its
quality — *in the variation only*. Today a chord is one entry in `harmony.chords`, dealt across
passes or Measures by `chordAt(pattern, pass, m)`; a Measure carries no chord of its own.
So "Measure 2 plays Em7 where Measure 1 plays Em" cannot be written down. D-020 named this
limit when it ruled a turnaround out as a device. The redesign has to lift it.

The consumers that resolve a chord are few: `core/harmony.js` (the deal, `fillOf`),
`core/timeline.js`, `core/notation.js` (the score) and `ui/grid.js` (the Now/Next strip), and
the duplicate fingerprint in `core/similarity.js` reads the chord list.

### Option A — per-Measure chord overrides (recommended)

`harmony.overrides`: a sparse map from Measure index to chord index to the fields that
differ — `inversion`, `quality`, `fill`, `omit`. `chordAt` returns the chord in force as
now, then applies the override for that Measure when one exists. Nothing else changes shape.

- Keeps the design the maintainer approved in October: variations are Measures, the loop,
  grid, Composer, Remove Measure, MIDI, score and duplicate detection all see Measures.
- Works under both `change: 'pass'` (every appended Measure shares the pass's chord, so the
  override says "when this Measure plays chord k, play it as …") and `change: 'measure'`.
- Overrides travel with their Measure: Remove Measure drops them, Double Length copies them
  to the mirrored Measures, Condense/Append re-index them.
- The fingerprint (`pitchFingerprint`) must include them, or two Patterns differing only by a
  variation's inversion become duplicates.

### Option B — a first-class variation list on the Pattern

`pattern.variations = [{ measures, chordOverrides }]`, flattened at play time, the original
kept apart. Gives "original remembered" for free and would let an edit to the original
re-derive its variations — but it is the second place content lives that the maintainer
declined, and every consumer that walks `measures` (grid, Composer, Remove Measure, Double
Length, Condense, MIDI, score, duplicates, Songs) would need a rule for it.

**Recommendation: A.** B is listed because the request's phrasing ("the original pattern be
remembered … different than duplicating") could be read as asking for it; the October ruling
says otherwise, and A satisfies the phrasing (see §4).

## 3. Technique catalogue

### 3a. The eight requested, as the model carries them

| # | Requested | Standard name | In this model | Choice offered |
|---|---|---|---|---|
| 1 | Different inversion of a chord | Voicing / inversion change | Override `inversion` on chord k in the variation's Measures | Which chord; which bass (from `bassOptions`) |
| 2 | Different fill on a chord | Arpeggio-figure swap | Override `fill` on chord k; needs an Arpeggio set (US-2.15's rule) | Which chord; which fill (grouped as the chord Fill picker) |
| 3 | Em → Em7 | Colour-tone extension / diatonic substitution | Override `quality` on chord k, through `rechord` (bass and omits kept) | Which chord; a quality from the **same family** by default (min → m7, m9, m6, m(add9); maj → maj7, add9, 6, sus2, sus4; dom7 → 9, 13, 7sus4), the full 41 behind "More" |
| 4 | Add a syllable | Onset insertion / ghost-note add | Turn a silent Slot on; in a Melodic Pattern it takes the nearest earlier Pitch (the October rule, AC-2.2.8) | Which Slot; default the weak Slot before a downbeat |
| 5 | Remove a syllable | Subtraction / rest insertion | Turn a sounding Slot off | Which Slot; default a Weak one, never Beat 1 Slot 1 unless chosen |
| 6 | Move a syllable | Rhythmic displacement; anticipation (earlier) / delay (later) | Off at one Slot, on at another, accent override and Pitch carried | Which Slot; default one Slot earlier (the push) |
| 7 | Two 8ths → triplet | Tuplet substitution (local hemiola) | `setRecipe(beat, 'triplet-8ths')`, Slots re-mapped: 8th 1 → triplet 1, 8th 2 → triplet 3, middle Slot off; quarter-note Beats only (no eighth-note triplet recipe exists) | Which Beat; default the last straight-8ths Beat |
| 8 | 16th fill where there is none | Fill at the phrase end | `setRecipe(beat, 'straight-16ths')`, every Slot on, Pitches from the rule in #4 | Which Beat; default the last |

### 3b. Worth adding (research, ranked by safety and fit)

| Technique | Family | Why | In this model |
|---|---|---|---|
| **Shift the accent** / **Lift** / **Soften** | Dynamics | Cheapest variation there is: nothing structural moves; the accent model exists | Accent overrides (the October devices, unchanged) |
| **Breathe** (silence the last Beat) | Rhythm | The subtractive ending every groove teacher names | Slots off on the last Beat |
| **Antecedent–consequent framing** | Form | Vary the *ending* first; the research's safest structural move. Not a technique but a **default**: every "which Slot/Beat" choice defaults to the phrase's last Beat | Defaults only |
| **Omit a member** | Chord | US-2.16's infrastructure; "take the 5th out of the G" is a real voicing variation | Override `omit` |
| **Octave up / down** (Melodic) | Pitch | Cheap register colour | The October devices |
| **Halve the last Beat** | Rhythm | The reverse of #8; lets a dense ending thin out | Recipe change with Slot sub-sampling |
| **Rotation** (Euclidean shift) | Rhythm | Spicy; moves the downbeat. Advanced tier | Slot vector rotated by k |

Not in reach without a further model change, and so **out of this change**: anticipating the
chord change (a chord boundary inside a Measure), passing/approach chords and tritone
substitution (chords by Measure range, not by index), muted strums and boom-chick bass
(no stroke type on a Slot), half-time feel, humanise (fights the syllable grid).

### 3c. Order of application

A variation is one or more techniques applied to a copy of the original, in a fixed order so
the result is deterministic and testable: recipe changes (#7, #8, Halve) → Slot changes
(#4, #5, #6, Breathe, Rotation) → dynamics → chord overrides (#1, #2, #3, Omit) → pitch.
Each technique's availability is judged on the phrase as the earlier ones left it.

## 4. The original, and how variations accumulate

- **The original is the first N Measures.** N is fixed the first time a variation is added
  (default: the whole Pattern as it stands) and remembered per Pattern in Local Metadata, as
  October's `phraseLength` was. Every later variation is built from those N Measures — never
  from the last copy — which is what makes "1 → 2 → 3 Measures" differ from Double Length.
- Alternative: store N on the Pattern. D-020 rejected that (exported and compared, changes no
  sound). Still rejected here; Option B would make it moot.
- Remove Measure stays "from the end": a variation is as many Measures as the original, and
  removing them Measure by Measure is unchanged behaviour (AC-1.1.9).
- The 32-Measure cap bounds how many variations fit (AC-1.1.3).

## 5. The dialog: construct, hear, roll, accept

- **Add variation** sits beside Double Length (Rhythm group's Measures row; the Composer's
  Measures control; and the Melody group on Make it melodic and Combine patterns, which also
  restores Double Length there — closing the AC-15.1.8 gap).
- The dialog shows the candidate as a **stack of applied techniques**, each with its offered
  choice (chord, bass, quality, fill, Slot, Beat) visible and changeable. Adding a technique,
  changing a choice or removing one re-auditions at once: the loop plays original + candidate
  through the overlay cycle mode uses (AC-2.7.1/4), nothing is written.
- **Roll the dice** draws one to three techniques from the groups not marked No dice, with
  their choices drawn too, and auditions the result; the drawn stack is shown and editable, so
  a roll is a starting point, not a verdict. Roll again replaces. Randomness from the UI
  (D-021); the dice are a different button from the Melody group's.
- **Accept** appends; the dialog can be reopened at once for the next variation, which starts
  from the original again. Close or Escape discards the candidate.
- A Melodic technique under a fill follows October's rule: pitch devices other than Octave are
  unavailable while the fill deals the notes.

## 6. Blast radius

| Reaches | What changes |
|---|---|
| `data-model.md` §harmony, rule 14; `validate:seed` | New `harmony.overrides` content field and its validation |
| `core/harmony.js` `chordAt`/`fillOf`/`arpeggioDeal`; `core/timeline.js`; `core/notation.js`; `ui/grid.js` Now/Next | Resolve through the Measure's override |
| `core/similarity.js` | Fingerprint includes overrides (US-11.1/11.2 — otherwise a variation's inversion is not a difference) |
| `core/pattern.js` `append`/`duplicate`/`removeMeasure`; `core/condense.js` | Overrides travel with Measures (US-10.1, US-1.1, Condense) |
| `setArpeggio(None)`, `setChordQuality`, `removeChord` | Clear or re-key overrides as they clear chord fills today (US-2.15, US-2.16) |
| `storage/localMeta.js` | `phraseLength` returns to `LOCAL_META_FIELDS` |
| AC-15.1.8 / D-018 | Melody group regains Double Length + Add variation on goals with no Rhythm group |
| `research.md` | New D-025: supersedes withdrawn D-020; records Option A and why B stays declined |
| MIDI export, Songs, Sections | Follow the timeline; no code change expected, tests needed |

Does not touch: US-2.14's dice, the Fills/Progressions cycles, Voicing shapes (a shape writes
the chord list, overrides sit beside it), Local Metadata's exclusion from exports.

## 7. Rulings needed before the spec

1. **What was wrong with October's build** — the record says only "how it's implemented".
2. **Option A or B** for where a variation's chord changes live.
3. **Catalogue scope for v1**: the eight alone, or the eight plus the dynamics/Breathe/Omit
   rows of §3b.
4. **Landing mode**: Auto or Review. Taste is the deliverable here (a dialog the maintainer
   practises with daily), which argues for Review.
