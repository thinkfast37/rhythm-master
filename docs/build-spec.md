# Rhythm Master — Build Specification (v1)

A browser-based rhythm and melody practice and composition tool. In future this tool may be encapsulated in a mobile application wrapper deployable to the Android and iOS app stores.

**Scope:** Arrangements (multi-section pieces) are out of scope for this version.

---

## Traceability & Testing Convention

Every requirement in this document is a numbered **Acceptance Criterion (AC)**, written as a Given/When/Then scenario, belonging to a numbered **User Story (US)**:

- **User Story ID**: `US-<epic>.<story>` — e.g. `US-1.1` is Epic 1's first story.
- **Acceptance Criterion ID**: `AC-<epic>.<story>.<n>` — e.g. `AC-1.1.3` is the third acceptance criterion under `US-1.1`.

**Every downstream artifact must reference these IDs**: commits, PR descriptions, code comments on the function/component implementing a given behavior, and — most importantly — **test names/tags**, so a single AC traces end-to-end from this spec → implementation → an automated test that proves it (e.g. a test literally named/tagged `AC-1.1.3` that asserts exactly the Given/When/Then below it). A test suite should be able to report "AC-1.1.3: covered / not covered" for every AC in this document.

Where a note marks something as **Assumption**, it's a judgment call made without your explicit confirmation — everything else in this document reflects a decision you've made directly.

**Naming convention — read this before any AC below:** Every AC is a concrete, worked scenario rather than an abstract rule, per your earlier direction that ACs must be testable. To make each scenario concrete, quoted Pattern names like "Bossa Groove," "Samba Break," "My Custom Fill," or "Groove A" are used throughout as **illustrative example data** — fixture names invented purely so the Given/When/Then has something specific to point at. **None of these names are required content.** They don't imply a Pattern with that exact name must exist in the shipped library or anywhere else; an implementation or test may substitute any equivalent fixture data that satisfies the same Given clause. Where an AC's title says e.g. "Beat Accent table" or "restart per Beat," that title — not the example name inside it — is the actual thing being specified.

---

## Personas

| Persona | Who they are | What they're here for |
|---|---|---|
| **The Composer** | A musician building original rhythmic and melodic Patterns — transcribing real pieces, inventing new ones, combining/layering/varying existing material. Comfortable with music-notation concepts (time signatures, subdivisions, scale degrees) and wants precise control without friction. | Epics 1, 2, 3, 7, 8, 9, 10, 12 |
| **The Practicing Musician** | A musician (often a student) using the tool to drill and internalize rhythms and melodies on their own instrument, at their own tempo, with practice aids (metronome, count-in, counting syllables). May or may not compose their own Patterns. | Epics 4, 5, 6, 15 |
| **The New User** | A first-time visitor who doesn't yet know the tool's concepts or rhythm fundamentals. | *(Currently unused — was Epic 14, Tutorial System, which is deferred. Kept defined for when that epic returns.)* |
| **The Contributor** | A Composer who wants their original Patterns to become part of the shared library for other users. | Epic 13 |

---

## Key Entities / Glossary

| Term | Definition |
|---|---|
| **Pattern** | A rhythmic (and optionally melodic) idea, built from one or more Measures. The single unit that lives in the Library, gets rated, tagged, played, and exported. |
| **Measure** | One instance of a Time Signature at a position in a Pattern. A Pattern is an ordered sequence of Measures; each Measure has its own Time Signature. |
| **Time Signature** | e.g. 4/4, 2/4, 7/8. Supported set: 2/4, 3/4, 4/4, 5/4, 6/4, 7/4, 6/8, 7/8, 9/8, 12/8. A per-Measure property. There is no simple/compound distinction in the data model — see Epic 1. |
| **Beat** | One pulse within a Measure, one note-value long (the Time Signature's denominator — e.g. a quarter note in 4/4, an eighth note in 6/8). Beat count per Measure always equals the Time Signature's numerator. |
| **Recipe** | A named subdivision template applied to a Beat: how many Slots it has and their feel (straight or triplet), sized to fit within that Beat's own note-value. Recipes always support at least 16th-note granularity. |
| **Subdivision Group** | A contiguous run of Slots within a Beat sharing one rhythmic feel. A Beat has more than one Subdivision Group only when its Recipe mixes feels. |
| **Slot** | The smallest addressable rhythmic unit — one on/off + Accent Level +, in Melodic Patterns, a Pitch. Belongs to exactly one Subdivision Group. |
| **Accent Level** | Integer 0–3 (off / weak / medium / strong), set per Slot via tap-cycle, defaulting to a computed value based on metric position (Epic 3). |
| **Sound Mode** | A Pattern is either **Percussive** or **Melodic**. |
| **Pitch** | In a Melodic Pattern, a single note (scale degree + octave) assigned to a Slot. One Pitch per Slot maximum. |
| **Key** | The root note a Melodic Pattern's degrees transpose against. |
| **Rating** | 0–5 stars on any Pattern. |
| **Tag** | A free-form or system-applied label on a Pattern. The sole organizational mechanism — there is no separate Category. |
| **Pattern Family** | A set of Patterns sharing identical rhythm content but differing in Sound Mode and/or Pitch. Discovery relationship only, not a data link. |
| **Local Metadata** | App-local bookkeeping tracked *about* a Pattern (e.g. whether it's been submitted before, whether a duplicate prompt has already been resolved for it) that is never part of the Pattern's own portable definition. Stored separately, referenced by Pattern identity, and explicitly excluded from every export/submission payload (US-13.1) — a Pattern exported today and imported into a fresh app instance carries none of its Local Metadata history. |

---

## Epic 1 — Rhythm & Meter Data Model

### US-1.1 — A Pattern is a sequence of Measures, each with its own Time Signature
**As** the Composer, **I want** different Measures within one Pattern to use different time signatures, **so that** I can transcribe pieces that genuinely shift meter (e.g. a bar of 4/4 followed by a bar of 2/4) instead of being forced into one meter for the whole piece.

- **AC-1.1.1** — New Pattern defaults
  - **Given** no existing Pattern
  - **When** the Composer creates a new Pattern
  - **Then** it is created with exactly one Measure, Time Signature 4/4, the default Beat/Recipe structure (US-1.3), and all Slots off

- **AC-1.1.2** — Appending inherits the preceding Measure's Time Signature
  - **Given** a Pattern of 2 Measures whose last Measure is 3/4
  - **When** the Composer taps +Measure
  - **Then** a third Measure is appended at the end, set to 3/4, with default Recipe Beats and all Slots off
  - **And** no control exists to insert a Measure anywhere other than the end

- **AC-1.1.3** — 6-Measure cap disables +Measure
  - **Given** a Pattern with exactly 6 Measures
  - **When** the Composer looks at the +Measure control
  - **Then** it is disabled — a Pattern cannot exceed 6 Measures

- **AC-1.1.4** — Single-Measure Time Signature change applies immediately
  - **Given** a Pattern with exactly one Measure
  - **When** the Composer changes that Measure's Time Signature
  - **Then** the change applies immediately with no prompt, the Measure's Time Signature updates, and its Beats reset to the new Time Signature's default Recipe with all Slots cleared to off

- **AC-1.1.5** — Multi-Measure change prompts apply-to-all vs. this-one
  - **Given** a Pattern with more than one Measure
  - **When** the Composer changes one Measure's Time Signature
  - **Then** the system prompts *"Apply [new time signature] to all measures in this pattern?"* with three choices:
    - **Apply to all** → every Measure's Time Signature is set to the new value, and every Measure's Beats reset to the new default Recipe, all Slots cleared
    - **This measure only** → only the edited Measure's Time Signature changes and resets (AC-1.1.6); every other Measure is untouched
    - **Cancel** → no change is made anywhere

- **AC-1.1.6** — Time Signature change resets that Measure's content
  - **Given** a Measure whose Time Signature has just changed (via AC-1.1.4 or AC-1.1.5)
  - **When** the change is applied
  - **Then** that Measure's Beats reset to the new Time Signature's default Recipe with all Slots cleared, and any prior Slot content on that Measure is discarded rather than remapped

- **AC-1.1.7** — Time Signature reset is undoable
  - **Given** a Time-Signature-triggered reset has just occurred (AC-1.1.6)
  - **When** the Composer invokes Undo
  - **Then** the entire reset (Time Signature change and Slot-clearing) is reverted as a single action

- **AC-1.1.8** — Last remaining Measure can't be removed
  - **Given** a Pattern with exactly one Measure
  - **When** the Composer looks at the −Measure control
  - **Then** it is disabled
  - **And** deleting the whole Pattern remains available as a separate, explicit action elsewhere in the UI

- **AC-1.1.9** — Measure removal is always from the end
  - **Given** a Pattern with more than one Measure
  - **When** the Composer taps −Measure
  - **Then** the last Measure is removed, and every remaining Measure keeps its own Time Signature and content unchanged — removal is always from the end, never from the middle

*(How a Measure's Time Signature is displayed and changed in the grid is specified in US-1.4.)*

---

### US-1.2 — Time signature support
**As** the Composer, **I want** to transcribe in a range of common time signatures, including asymmetric ones, without the tool imposing a beat grouping I didn't specify, **so that** I can accurately represent meters like 7/8 exactly as they're actually felt, rather than the tool guessing at a 2+2+3-style grouping on my behalf.

- **AC-1.2.1** — Beat count and note-value are independent per Measure
  - **Given** a Measure set to 5/4 and a Measure set to 6/8
  - **When** each Measure's structure is generated
  - **Then** the 5/4 Measure has 5 Beats of one quarter note each, and the 6/8 Measure has 6 Beats of one eighth note each
  - **And** neither Measure's Beat count nor note-value depends on any other Measure in the Pattern

- **AC-1.2.2** — Beat count/note-value table for all 10 Time Signatures
  - **Given** a Measure is set to time signature `<signature>`
  - **When** its Beats are generated
  - **Then** the Measure has exactly `<beat count>` Beats, each one `<note value>` long

  | `<signature>` | `<beat count>` | `<note value>` |
  |---|---|---|
  | 2/4 | 2 | quarter note |
  | 3/4 | 3 | quarter note |
  | 4/4 | 4 | quarter note |
  | 5/4 | 5 | quarter note |
  | 6/4 | 6 | quarter note |
  | 7/4 | 7 | quarter note |
  | 6/8 | 6 | eighth note |
  | 7/8 | 7 | eighth note |
  | 9/8 | 9 | eighth note |
  | 12/8 | 12 | eighth note |

- **AC-1.2.3** — 7/8 is 7 ungrouped Beats
  - **Given** a Measure is set to 7/8
  - **When** its Beats are generated
  - **Then** the Measure has 7 Beats of one eighth note each
  - **And** the Measure is not grouped into 3 Beats of 2+2+3, nor any other sub-grouping

- **AC-1.2.4** — 6/8 is 6 ungrouped Beats
  - **Given** a Measure is set to 6/8
  - **When** its Beats are generated
  - **Then** the Measure has 6 Beats of one eighth note each
  - **And** the Measure is not grouped into 2 dotted-quarter Beats

---

### US-1.3 — Mixed subdivision within a Beat, via Recipes
**As** the Composer, **I want** to give one part of a Beat a different subdivision feel than another part, **so that** I can capture patterns that actually mix feels within a single beat (e.g. straight 8ths for the first half, triplet feel for the second half), which the tool previously couldn't represent at all.

- **AC-1.3.1** — Default Recipe for a quarter-note Beat
  - **Given** a Beat in a 4/4 Measure is created or reset
  - **When** its default Recipe is assigned
  - **Then** it receives the Straight 16ths Recipe: 4 Slots, one Subdivision Group, all straight

- **AC-1.3.2** — Default Recipe for an eighth-note Beat
  - **Given** a Beat in a 6/8 Measure is created or reset
  - **When** its default Recipe is assigned
  - **Then** it receives the Straight 16ths Recipe: 2 Slots, one Subdivision Group, all straight

- **AC-1.3.3** — New Recipe Slots start off
  - **Given** a Beat has just received a default Recipe (AC-1.3.1 or AC-1.3.2)
  - **When** its Slots are initialized
  - **Then** every one of its Slots starts off, Accent Level 0

- **AC-1.3.4** — Recipe menu for a quarter-note Beat
  - **Given** a Beat in a 4/4 Measure
  - **When** the Composer opens its Recipe picker
  - **Then** exactly these five Recipes are offered:

  | Recipe | Slots | Subdivision Groups |
  |---|---|---|
  | Straight 16ths | 4 | one group: 4 straight 16th-note Slots |
  | Straight 8ths | 2 | one group: 2 straight 8th-note Slots |
  | Triplet 8ths | 3 | one group: 3 triplet-8th-note Slots |
  | Straight → Triplet split | 5 | Slots 1–2: straight 16ths (the beat's first 8th note); Slots 3–5: triplet 16ths (the beat's second 8th note) |
  | Triplet → Straight split | 5 | Slots 1–3: triplet 16ths (the beat's first 8th note); Slots 4–5: straight 16ths (the beat's second 8th note) |

- **AC-1.3.5** — Recipe menu for an eighth-note Beat
  - **Given** a Beat in a 6/8, 7/8, 9/8, or 12/8 Measure
  - **When** the Composer opens its Recipe picker
  - **Then** exactly these two Recipes are offered, and no triplet or mixed-feel option is present:

  | Recipe | Slots | Subdivision Groups |
  |---|---|---|
  | Undivided | 1 | one group: 1 Slot, the whole eighth note |
  | Straight 16ths | 2 | one group: 2 straight 16th-note Slots |

- **AC-1.3.6** — Recipe change resets only that Beat
  - **Given** Beat 1 has the Triplet 8ths Recipe with Slot 2 accented, and Beat 2 (in the same Measure) has the Straight 8ths Recipe with both Slots accented
  - **When** the Composer changes Beat 1's Recipe to Straight 16ths
  - **Then** Beat 1's Slots reset to 4 off Slots
  - **And** Beat 2's Slots, and every Slot in every other Measure, are unchanged

- **AC-1.3.7** — Recipe change that would clear active Slots requires confirmation
  - **Given** a Beat on the Straight 16ths Recipe (4 Slots) with 3 of its 4 Slots active
  - **When** the Composer selects the Undivided Recipe (1 Slot) for it
  - **Then** the system requires confirmation — *"Changing subdivision will clear 3 active note(s) on this beat — continue?"* — before applying

- **AC-1.3.8** — Recipe change that doesn't reduce Slot count applies without confirmation
  - **Given** a Beat on the Straight 8ths Recipe (2 Slots) with both Slots active
  - **When** the Composer selects the Straight 16ths Recipe (4 Slots) for it
  - **Then** the change applies immediately with no confirmation, since 4 Slots is not fewer than the 2 currently active

- **AC-1.3.9** — Accent works identically on a triplet-feel Slot
  - **Given** a Slot in the triplet-feel first group of a Beat on the Triplet → Straight split Recipe
  - **When** the Composer taps it
  - **Then** Accent Level 0–3 is available on it exactly as on any straight-feel Slot, with its specific default computed per Epic 3

---

### US-1.4 — Display and change a Measure's Time Signature in the grid
**As** the Composer, **I want** each Measure to show its own Time Signature directly in the grid and let me change it by tapping it, **so that** I can see at a glance where the meter shifts in a Pattern and edit it in place, without hunting for a separate control.

- **AC-1.4.1** — Time Signature label is itself the picker control
  - **Given** a Pattern containing 3 Measures
  - **When** the Composer views the Pattern editor
  - **Then** each of the 3 Measures displays its own Time Signature label showing that Measure's current Time Signature
  - **And** that label is itself the control — tapping it opens that Measure's Time Signature picker

- **AC-1.4.2** — Picker offers exactly the 10 supported values
  - **Given** the Composer taps a Measure's Time Signature label
  - **When** the picker opens
  - **Then** exactly these ten values are offered: 2/4, 3/4, 4/4, 5/4, 6/4, 7/4, 6/8, 7/8, 9/8, 12/8
  - **And** no free-text entry is possible

- **AC-1.4.3** — Each Measure's label reflects only its own Time Signature
  - **Given** a Pattern whose Measure 1 is 4/4 and Measure 2 is 3/4
  - **When** the Composer views the Pattern editor
  - **Then** Measure 1's label shows 4/4 and Measure 2's label shows 3/4, each reflecting only its own Measure

- **AC-1.4.4** — Prominent vs. dimmed label rendering
  - **Given** a Pattern whose Measures are 4/4, 4/4, 3/4, 3/4
  - **When** the Composer views the Pattern grid
  - **Then** all four Measures display their Time Signature label
  - **And** Measures 1 and 3 render theirs prominently, because each differs from the Measure before it (Measure 1 being the Pattern's opening Time Signature)
  - **And** Measures 2 and 4 render theirs dimmed, because each matches the Measure before it

- **AC-1.4.5** — Uniform-meter Pattern renders only Measure 1 prominently
  - **Given** a Pattern whose Measures are all 4/4
  - **When** the Composer views the Pattern grid
  - **Then** Measure 1 renders "4/4" prominently, and every other Measure renders "4/4" dimmed

- **AC-1.4.6** — Changing a dimmed label recalculates neighboring prominence
  - **Given** a Pattern whose Measures are 4/4, 4/4, 3/4 and the Composer taps Measure 2's dimmed "4/4" label
  - **When** the picker opens and the Composer selects 6/8
  - **Then** Measure 2's label becomes "6/8" rendered prominently
  - **And** Measure 3's "3/4" label remains prominent, as it still differs from Measure 2

- **AC-1.4.7** — Changing a prominent label recalculates neighboring prominence
  - **Given** a Pattern whose Measures are 4/4, 3/4, 3/4 and the Composer taps Measure 2's prominent "3/4" label
  - **When** the picker opens and the Composer selects 4/4
  - **Then** Measure 2's label becomes "4/4" rendered dimmed, as it now matches Measure 1
  - **And** Measure 3's "3/4" label becomes prominent, as it now differs from Measure 2

- **AC-1.4.8** — Read-only contexts show labels without a picker
  - **Given** a Pattern is displayed in a read-only context (library list preview or playback view)
  - **When** the Practicing Musician views it
  - **Then** every Measure displays its Time Signature label with the same prominent/dimmed treatment as AC-1.4.4
  - **And** tapping a label does not open a picker

---

## Epic 2 — Melodic Mode & Pitch

### US-2.1 — Choose Sound Mode
**As** the Composer, **I want** to set a Pattern to Percussive or Melodic, **so that** I control whether it plays fixed accent-driven tones for pure rhythm practice, or specific pitched notes for melodic practice, without needing two separate tools.

- **AC-2.1.1** — Sound Mode changes take effect immediately
  - **Given** a loaded Pattern
  - **When** the Composer changes its Sound Mode
  - **Then** the change takes effect immediately, in either direction, with no confirmation required

- **AC-2.1.2** — New Pattern defaults to Percussive
  - **Given** no existing Pattern
  - **When** a new Pattern is created
  - **Then** its Sound Mode defaults to Percussive

- **AC-2.1.3** — Switching to Melodic requires a Key, defaulting to C
  - **Given** a Pattern with no Key previously set
  - **When** the Composer switches its Sound Mode from Percussive to Melodic
  - **Then** a Key is required to be active, and defaults to C if none was set

- **AC-2.1.4** — Pitch data survives a Sound Mode round-trip
  - **Given** a Melodic Pattern with per-Slot Pitch data
  - **When** the Composer switches its Sound Mode to Percussive and then back to Melodic
  - **Then** all previously stored Pitch data reappears exactly as it was — it was never deleted, only unused during Percussive playback *(Assumption: preserves in-progress melodic authoring across an exploratory mode toggle.)*

- **AC-2.1.5** — Sound Mode changes never alter Accent Levels
  - **Given** a Pattern with existing Accent Level data on its Slots
  - **When** the Composer switches Sound Mode in either direction
  - **Then** no Accent Level anywhere on the Pattern changes

---

### US-2.2 — Assign Pitch to a Slot
**As** the Composer, once a Pattern is Melodic with a Key chosen, **I want** to assign each active Slot a specific scale degree and octave, **so that** I'm authoring a real, deliberate melody rather than relying on some automatic pitch-cycling behavior I can't fully control.

- **AC-2.2.1** — One Pitch per Slot, no chords
  - **Given** a Slot that already has a Pitch assigned
  - **When** the Composer assigns it a different Pitch
  - **Then** the new Pitch fully replaces the old one — a Slot never holds more than one Pitch (no chords)

- **AC-2.2.2** — Armed pitch defaults to root, octave 4
  - **Given** a Pattern entering Melodic mode for the first time, with no prior Pitch data
  - **When** the pitch strip is shown
  - **Then** its armed pitch defaults to degree 1 (root), octave 4

- **AC-2.2.3** — Octave stepper clamps at its bounds
  - **Given** the octave stepper on the pitch strip
  - **When** the Composer steps beyond octave 1 or octave 7
  - **Then** the value clamps at that bound rather than wrapping

- **AC-2.2.4** — Degree strip default span
  - **Given** a Melodic Pattern with an active Key
  - **When** the Composer views the degree strip
  - **Then** degrees 1–8 (one octave of the Key's scale) are shown by default, scrollable/extendable to reach degrees 9–15 without touching the octave stepper

- **AC-2.2.5** — Painting an off Slot sets Pitch and computed Accent together
  - **Given** an off Slot and a currently armed pitch on the strip
  - **When** the Composer taps or drag-stamps that Slot
  - **Then** the Slot's Pitch is set to the armed value and its Accent Level is set to that Slot's computed metric default (Epic 3, US-3.1) — both in the same gesture

- **AC-2.2.6** — Repainting an active Slot changes only its Pitch
  - **Given** an already-active Slot and a currently armed pitch on the strip
  - **When** the Composer paints that Slot again
  - **Then** only its Pitch is replaced; its existing Accent Level is left unchanged

- **AC-2.2.7** — Cycling Accent to off clears Pitch too
  - **Given** an active Melodic Slot
  - **When** the Composer taps it to cycle Accent Level down to off (per Epic 3's override rule)
  - **Then** both its Accent Level and its Pitch clear together — a Slot cannot hold Accent 0 with a non-null Pitch, or Accent > 0 with a null Pitch

- **AC-2.2.8** — Accent/Pitch null-state invariant
  - **Given** any Slot in a Melodic Pattern, at any point
  - **When** its state is inspected
  - **Then** it always holds either (Accent 0, null Pitch) or (Accent > 0, non-null Pitch) — no UI path can produce any other combination

- **AC-2.2.9** — Changing the armed pitch doesn't retroactively affect painted Slots
  - **Given** Slots that have already been painted with a pitch
  - **When** the Composer changes the armed pitch on the strip
  - **Then** none of those already-painted Slots change — the new armed pitch only affects the next paint/stamp gesture

---

### US-2.3 — Transpose to a Key
**As** the Composer, **I want** to pick a root key for a Melodic Pattern, **so that** I can practice or transcribe the same melodic shape in whatever key I actually need, without re-authoring every Pitch by hand.

- **AC-2.3.1** — Default Key
  - **Given** a Pattern newly switched to Melodic mode with no Key previously chosen
  - **When** its Key is initialized
  - **Then** it defaults to C

- **AC-2.3.2** — Changing Key re-transposes without altering stored data
  - **Given** a Melodic Pattern with existing per-Slot degree/octave data
  - **When** the Composer changes its Key
  - **Then** playback immediately re-transposes to the new Key, and no stored degree/octave value on any Slot is altered

- **AC-2.3.3** — Percussive Patterns have no Key
  - **Given** a Percussive Pattern
  - **When** the Composer looks for a Key control
  - **Then** none is shown — Key is not applicable, not merely hidden or disabled

---

### US-2.4 — Audio quality
**As** the Practicing Musician, **I want** Melodic notes to sound like an actual piano rather than a synthesized tone, **so that** practicing melodic material sounds musically real, while the app still loads and runs entirely in a browser.

- **AC-2.4.1** — Melodic playback uses sampled piano, not synthesis
  - **Given** a Melodic Pattern during playback
  - **When** any note sounds
  - **Then** it is produced from real recorded piano samples (a compact soundfont), covering the full Pitch range the app supports (octaves 1–7, degrees 1–15 per US-2.2), not a synthesized waveform

- **AC-2.4.2** — Soundfont loads in the background without blocking the app
  - **Given** the app is opened
  - **When** the page loads
  - **Then** the piano soundfont begins downloading in the background, and the app remains interactive immediately — the Composer can browse the library, view, and edit Patterns without waiting for it

- **AC-2.4.3** — Melodic Play waits on the soundfont; Percussive Play doesn't
  - **Given** the piano soundfont has not yet finished downloading
  - **When** the Composer opens a Melodic Pattern and looks at Play
  - **Then** Play shows a loading state and does not produce sound until the soundfont finishes downloading, at which point it becomes playable normally
  - **And**, given a Percussive Pattern in the same unloaded state, Play works immediately and is unaffected, since Percussive audio has no dependency on the soundfont

- **AC-2.4.4** — Soundfont is cached after first load
  - **Given** the piano soundfont has been downloaded once in the browser
  - **When** the Composer reloads the app or returns in a later session
  - **Then** it loads from cache rather than re-downloading, and Play is available for Melodic Patterns without the AC-2.4.3 loading delay

- **AC-2.4.5** — Percussive playback stays pure synthesis
  - **Given** a Percussive Pattern during playback
  - **When** any note sounds
  - **Then** it is produced via a single-oscillator synthesized path with no chorus, filter, or reverb, routed only through shared dynamics compression — Percussive audio remains pure Web Audio API synthesis, unaffected by AC-2.4.1's shift to sampled piano

---

## Epic 3 — Accent System

### US-3.1 — Set per-Slot dynamics, defaulting to musically-normal accent
**As** the Composer, **I want** a Slot to default to the accent a musician would naturally give that metric position when I turn it on, **so that** I'm not manually re-accenting every downbeat and backbeat by hand on every single pattern I build.

- **AC-3.1.1** — Turning on a Slot lands on its computed default, not a fixed value
  - **Given** Beat 2 of a 4/4 Measure, currently off
  - **When** the Composer turns on its first Slot
  - **Then** that Slot's Accent Level is set to Weak (1) — its computed metric default, per AC-3.1.2 — not a fixed value shared by every Slot regardless of position

- **AC-3.1.2** — Beat Accent table
  - **Given** a Measure set to time signature `<signature>`
  - **When** each Beat's default accent is computed
  - **Then** the Beats (position 1 → last) default to exactly:

  | `<signature>` | Beat accents, position 1 → last |
  |---|---|
  | 2/4 | Strong, Weak |
  | 3/4 | Strong, Weak, Weak |
  | 4/4 | Strong, Weak, Medium, Weak |
  | 5/4 | Strong, Weak, Weak, Weak, Weak |
  | 6/4 | Strong, Weak, Weak, Medium, Weak, Weak |
  | 7/4 | Strong, Weak, Weak, Weak, Weak, Weak, Weak |
  | 6/8 | Strong, Weak, Weak, Medium, Weak, Weak |
  | 7/8 | Strong, Weak, Weak, Weak, Weak, Weak, Weak |
  | 9/8 | Strong, Weak, Weak, Weak, Weak, Weak, Weak, Weak, Weak |
  | 12/8 | Strong, Weak, Weak, Weak, Weak, Weak, Medium, Weak, Weak, Weak, Weak, Weak |

- **AC-3.1.3** — Within-Beat rule, 4-Slot Recipe on a Strong Beat
  - **Given** Beat 1 of a 4/4 Measure (Strong, per AC-3.1.2) on the Straight 16ths Recipe (4 Slots)
  - **When** each Slot's default accent is computed
  - **Then** Slot 1 = Strong, Slot 2 = Weak, Slot 3 = Medium, Slot 4 = Weak

- **AC-3.1.4** — Within-Beat rule, 4-Slot Recipe on a Weak Beat
  - **Given** Beat 2 of a 4/4 Measure (Weak, per AC-3.1.2) on the Straight 16ths Recipe (4 Slots)
  - **When** each Slot's default accent is computed
  - **Then** Slot 1 = Weak, Slot 2 = Weak, Slot 3 = Weak, Slot 4 = Weak — one level below Weak floors at Weak, so Slot 3 does not go any lower

- **AC-3.1.5** — Within-Beat rule, 4-Slot Recipe on a Medium Beat
  - **Given** Beat 3 of a 4/4 Measure (Medium, per AC-3.1.2) on the Straight 16ths Recipe (4 Slots)
  - **When** each Slot's default accent is computed
  - **Then** Slot 1 = Medium, Slot 2 = Weak, Slot 3 = Weak (one level below Medium), Slot 4 = Weak

- **AC-3.1.6** — Within-Beat rule, 2-Slot Recipe
  - **Given** Beat 1 of a 2/4 Measure (Strong, per AC-3.1.2) on the Straight 8ths Recipe (2 Slots)
  - **When** each Slot's default accent is computed
  - **Then** Slot 1 = Strong, Slot 2 = Weak — a 2-Slot Recipe never produces a Medium Slot, since it has no position beyond the first and last

- **AC-3.1.7** — Within-Beat rule, 3-Slot Triplet Recipe
  - **Given** Beat 1 of a 3/4 Measure (Strong, per AC-3.1.2) on the Triplet 8ths Recipe (3 Slots)
  - **When** each Slot's default accent is computed
  - **Then** Slot 1 = Strong, Slot 2 = Weak, Slot 3 = Weak — a 3-Slot Recipe never produces a Medium Slot, since 3 is odd

- **AC-3.1.8** — Within-Beat rule, 5-Slot mixed Recipe
  - **Given** Beat 1 of a 4/4 Measure (Strong, per AC-3.1.2) on the Straight → Triplet split Recipe (5 Slots, per US-1.3's AC-1.3.4)
  - **When** each Slot's default accent is computed
  - **Then** Slot 1 = Strong, Slots 2–5 = Weak — a 5-Slot Recipe never produces a Medium Slot, since 5 is odd, and this holds regardless of the Recipe spanning two Subdivision Groups (straight then triplet)

- **AC-3.1.9** — Within-Beat rule, 1-Slot undivided Recipe
  - **Given** Beat 1 of a 6/8 Measure (Strong, per AC-3.1.2) on the Undivided Recipe (1 Slot)
  - **When** that Slot's default accent is computed
  - **Then** Slot 1 = Strong — the Beat's own accent, since there is only one Slot to hold it

- **AC-3.1.10** — Computed default recomputes fresh after a Recipe reset
  - **Given** Beat 3 of a 4/4 Measure, whose Straight 16ths Recipe was just changed to Straight 8ths and back to Straight 16ths, clearing its Slots each time (per AC-1.3.6)
  - **When** the Composer turns Slot 1 back on
  - **Then** it defaults to Medium — freshly recomputed from Beat 3's position, not from whatever Accent Level it held before the Recipe changes

- **AC-3.1.11** — Override cycle, Strong default
  - **Given** Slot 1 of Beat 1 in a 4/4 Measure, currently at its computed default of Strong (3)
  - **When** the Composer taps it three more times in a row
  - **Then** it goes Strong(3) → Weak(1) → Medium(2) → Off(0) on those three taps, and a fourth tap returns it to Strong(3)

- **AC-3.1.12** — Override cycle, Medium default
  - **Given** Slot 1 of Beat 3 in a 4/4 Measure, currently at its computed default of Medium (2)
  - **When** the Composer taps it three more times in a row
  - **Then** it goes Medium(2) → Strong(3) → Weak(1) → Off(0) on those three taps, and a fourth tap returns it to Medium(2)

- **AC-3.1.13** — Override cycle, Weak default
  - **Given** Slot 1 of Beat 2 in a 4/4 Measure, currently at its computed default of Weak (1)
  - **When** the Composer taps it three more times in a row
  - **Then** it goes Weak(1) → Medium(2) → Strong(3) → Off(0) on those three taps, and a fourth tap returns it to Weak(1)

- **AC-3.1.14** — Percussive accent-to-sound mapping is deterministic
  - **Given** a Percussive Slot at Accent Level 3 (Strong) and another at Accent Level 1 (Weak)
  - **When** both sound during playback
  - **Then** the Level-3 Slot is audibly louder and brighter than the Level-1 Slot, with the exact frequency/amplitude pair for each level fixed and deterministic — never randomized

- **AC-3.1.15** — Melodic accent-to-sound mapping is independent of Pitch
  - **Given** a Melodic Slot at Accent Level 3 (Strong) and another at Accent Level 1 (Weak), both assigned the same Pitch
  - **When** both sound during playback
  - **Then** the Level-3 Slot has a louder gain envelope and different decay time than the Level-1 Slot, while both play the identical Pitch

---

## Epic 4 — Playback Engine

### US-4.1 — Play a Pattern on loop
**As** the Practicing Musician, **I want** to press Play and have the Pattern loop continuously with synced audio and a visual cursor, **so that** I can drill it hands-free without having to keep restarting it myself.

- **AC-4.1.1** — Playback stays sample-accurate over long loops
  - **Given** a Pattern at 120 BPM playing continuously for 500 loop repeats
  - **When** the audio timestamp of the first Slot of loop 500 is measured against the audio timestamp predicted from the Pattern's tempo and loop 1's start time
  - **Then** the two differ by less than 10 milliseconds — every event time is computed from `AudioContext.currentTime`, never from a wall-clock timer (`setTimeout`/`setInterval`), which is what keeps this bounded regardless of how long playback runs *(Assumption: the 10ms tolerance is a reasonable starting bound, not a number you've confirmed.)*

- **AC-4.1.2** — Visual highlight stays in sync with audio
  - **Given** a Pattern is playing
  - **When** a given Slot's audio event fires
  - **Then** that Slot's visual highlight appears within 20 milliseconds of the audio event, because the visual update is driven from the same scheduled event queue as the audio, not a separately-timed animation loop *(Assumption: the 20ms tolerance is a reasonable starting bound, not a number you've confirmed.)*

- **AC-4.1.3** — Loop counter increments once per full pass
  - **Given** a Pattern is playing on loop
  - **When** the full Pattern (all Measures, in order) completes one pass
  - **Then** the loop counter increments by exactly 1

- **AC-4.1.4** — Mixed-meter Pattern plays each Measure by its own Time Signature
  - **Given** a Pattern whose Measure 1 is 4/4 and Measure 2 is 6/8
  - **When** it plays
  - **Then** each loop plays Measure 1's 4 quarter-note Beats followed by Measure 2's 6 eighth-note Beats, each Beat sounding according to its own Recipe, before the loop counter (AC-4.1.3) increments and the sequence repeats from Measure 1

---

### US-4.2 — Adjust tempo
**As** the Practicing Musician, **I want** to set tempo via a slider or presets, **so that** I can practice a difficult pattern slower before working up to performance speed.

- **AC-4.2.1** — Default tempo and range
  - **Given** a new Pattern
  - **When** it is created
  - **Then** its tempo defaults to 80 BPM, adjustable within a clamped range of 18–220 BPM

- **AC-4.2.2** — Tempo change restarts playback immediately
  - **Given** a Pattern is playing at 80 BPM, partway through Beat 2 of its 4/4 Measure
  - **When** the Practicing Musician changes tempo to 120 BPM
  - **Then** playback restarts from the top of the Pattern at 120 BPM immediately, rather than finishing the current loop at 80 BPM first

- **AC-4.2.3** — Tempo default: global last-used, overridden by a per-Pattern save
  - **Given** the Practicing Musician most recently played a Pattern at 100 BPM, and now opens a different, brand-new Pattern with no tempo of its own saved
  - **When** that Pattern loads
  - **Then** its tempo defaults to 100 BPM
  - **And**, given instead that Pattern has its own saved tempo of 140 BPM, it loads at 140 BPM regardless of the 100 BPM most recently used elsewhere

---

### US-4.3 — Metronome click and count-in
**As** the Practicing Musician, **I want** to enable a metronome click and a count-in measure, **so that** I have a clear timing reference before and during playback.

- **AC-4.3.1** — Metronome/count-in defaults
  - **Given** a new Pattern
  - **When** it is created
  - **Then** its metronome click defaults to off and its count-in defaults to on

- **AC-4.3.2** — Click tone is identical across Sound Modes
  - **Given** a Percussive Pattern and a Melodic Pattern, both with the metronome click enabled
  - **When** each plays
  - **Then** the click tone is acoustically identical in both — the click never changes with Sound Mode

- **AC-4.3.3** — Count-in length matches the first Measure's Beat count
  - **Given** a Pattern whose first Measure is 6/8 and count-in is enabled
  - **When** playback starts
  - **Then** exactly 6 clicks (one per Beat of that 6/8 Measure) play before the Pattern's first audible event
  - **And**, given instead the first Measure is 4/4, exactly 4 clicks play before playback starts

- **AC-4.3.4** — Metronome setting persists across reloads
  - **Given** the Practicing Musician turns the metronome click off
  - **When** they reload the app (or return in a later session)
  - **Then** the metronome click is still off — the setting persists across reloads, not just within the current session

- **AC-4.3.5** — Count-in setting persists across reloads
  - **Given** the Practicing Musician turns count-in off (from its on-by-default state, AC-4.3.1)
  - **When** they reload the app (or return in a later session)
  - **Then** count-in is still off — the setting persists across reloads, the same way metronome click does (AC-4.3.4)

- **AC-4.3.6** — Metronome/count-in have no per-Pattern override, unlike tempo
  - **Given** the metronome and count-in persistence in AC-4.3.4–4.3.5
  - **When** compared to tempo's persistence model, which supports a per-Pattern override on top of the global last-used value (AC-4.2.3)
  - **Then** metronome and count-in are treated as a single global app-wide preference with **no** per-Pattern override — every Pattern always uses the one current global on/off value, confirmed

---

### US-4.4 — Swing
**As** the Composer, **I want** to apply swing to straight-feel portions of a Pattern, **so that** it feels less mechanical without forcing me to hand-author a triplet feel where I don't actually want one.

- **AC-4.4.1** — Swing default and range
  - **Given** a straight-feel Subdivision Group
  - **When** it is created
  - **Then** its swing amount defaults to 0, adjustable from 0–100 in integer steps

- **AC-4.4.2** — Swing is set per Subdivision Group independently
  - **Given** a Beat on the Straight → Triplet split Recipe (2 straight Slots + 3 triplet Slots, per AC-1.3.4), with the straight group's swing set to 40
  - **When** the Composer looks at the triplet group's swing setting
  - **Then** it is unaffected and remains at its own independent value — each straight-feel Subdivision Group in a Beat has its own swing amount, not one value shared across the Beat or the Pattern

- **AC-4.4.3** — Triplet-feel groups have no swing control
  - **Given** the 3-Slot triplet group within a Beat on the Straight → Triplet split Recipe
  - **When** the Composer looks for a swing control on it
  - **Then** none is shown — swing is inapplicable to triplet feel, not merely present-but-disabled

- **AC-4.4.4** — Swing only affects the straight portion of a mixed Beat
  - **Given** a Beat on the Straight → Triplet split Recipe, with the straight group's (Slots 1–2) swing set to 60
  - **When** it plays
  - **Then** Slot 2's onset shifts later per AC-4.4.5's formula, while Slots 3–5 (the triplet group) play at their unshifted triplet timing regardless of the straight group's swing value

- **AC-4.4.5** — Swing timing formula
  - **Given** a straight Subdivision Group of *N* Slots (2 or 4, per US-1.3's Recipes) with swing amount *S* (0–100) and a per-Slot duration *d* seconds at the current tempo
  - **When** the group plays
  - **Then** every Slot keeps its nominal onset time **except** the Slot at position (*N*/2 + 1) — the first Slot of the group's second half — whose onset is delayed by `min(S / 100 × d, 0.95 × d)` seconds, and no other Slot's timing changes
  - **And**, worked example: Beat 1 of a 4/4 Measure at 120 BPM (quarter note = 0.5s) on the Straight 16ths Recipe (*N*=4, *d*=0.125s per 16th note) with swing 67 — Slot 3 (the "&", position *N*/2+1 = 3) nominally onsets at 0.250s after the beat starts, and instead onsets at 0.250s + min(0.67 × 0.125s, 0.95 × 0.125s) = 0.250s + 0.084s = 0.334s; Slots 1, 2, and 4 are unaffected *(Assumption: this formula, including the 0.95×d cap, is carried over from the original app's design and hasn't been explicitly re-confirmed for this rebuild.)*

---

## Epic 5 — Pattern Library, Browsing & Organization

### US-5.1 — Browse the library
**As** the Practicing Musician, **I want** to see every Pattern in one place, **so that** I don't have to remember or guess where a given rhythm or melody lives before I can practice it.

- **AC-5.1.1** — Shipped and custom Patterns appear in one unified list
  - **Given** the library contains "Bossa Groove" (shipped with the app) and "My Custom Fill" (composed by the Practicing Musician)
  - **When** they open the library
  - **Then** both appear together in the same list, with no separate "custom" or "shipped" section dividing them

- **AC-5.1.2** — Library entry shows name, meter, and Measure/Beat count
  - **Given** a Pattern named "Samba Break" whose Measures are all 4/4, 2 Measures totaling 8 Beats
  - **When** it is displayed in the library list
  - **Then** its entry shows "Samba Break", meter summary "4/4", and "2 Measures, 8 Beats"

- **AC-5.1.3** — Mixed-meter Pattern shows "Mixed Meter" instead of one Time Signature
  - **Given** a Pattern named "Shifting Meter" whose Measure 1 is 4/4 and Measure 2 is 2/4
  - **When** it is displayed in the library list
  - **Then** its entry shows meter summary "Mixed Meter" rather than a single Time Signature

- **AC-5.1.4** — Default sort order: Rating descending, then alphabetical within each Rating
  - **Given** the library contains "Zebra Beat" (5★), "Apple Groove" (5★), "Mango Fill" (3★), "Banana Riff" (3★), and "Date Loop" (0★, unrated)
  - **When** the Practicing Musician views the library list with no other sort selected
  - **Then** the order is: "Apple Groove" (5★), "Zebra Beat" (5★), "Banana Riff" (3★), "Mango Fill" (3★), "Date Loop" (0★) — Patterns are grouped by Rating from 5★ down to 0★ (unrated last), and only *within* each Rating tier are they alphabetical by name; the list is never simply alphabetical top to bottom

- **AC-5.1.5** — Sort order applies on top of Tag filtering
  - **Given** the same library as AC-5.1.4, with the Tag filter "warmup" active
  - **When** the filtered list renders
  - **Then** it applies the same Rating-descending-then-alphabetical order (AC-5.1.4) to whichever Patterns match the Tag filter — sort order and filtering combine, they don't replace each other

- **AC-5.1.6** — "List order" elsewhere in the doc means this sort order
  - **Given** the sort order from AC-5.1.4
  - **When** Prev/Next navigation (US-5.5) or Pattern Family display (US-11.2) references "the list" or "list order"
  - **Then** it means this Rating-descending-then-alphabetical order, applied to whatever the current filter set is — not a separately defined ordering

---

### US-5.2 — Search by text
**As** the Practicing Musician, **I want** to filter the library by typing, **so that** I can jump straight to a Pattern I already know the name or description of.

- **AC-5.2.1** — Search matches name/description
  - **Given** the library contains "Bossa Nova Groove" and "Samba Break," and no other Pattern's name or description contains "bossa"
  - **When** the Practicing Musician types "bossa" into the search field
  - **Then** the list filters to show only "Bossa Nova Groove"

- **AC-5.2.2** — Search matching is case-insensitive
  - **Given** the search from AC-5.2.1 showing only "Bossa Nova Groove"
  - **When** the Practicing Musician changes the search text to "BOSSA" (uppercase)
  - **Then** the same single result still shows — search matching is case-insensitive

- **AC-5.2.3** — Search results keep the library's default sort order
  - **Given** a search for "groove" matches "Zebra Groove" (5★) and "Apple Groove" (5★)
  - **When** the filtered list renders
  - **Then** it applies the same Rating-descending-then-alphabetical order as AC-5.1.4 — "Apple Groove" before "Zebra Groove" — search filtering does not override the library's default sort order

---

### US-5.3 — Organize by Tag, including automatic Tags
**As** the Practicing Musician, **I want** to filter and organize Patterns purely by Tag, with some Tags applied automatically, **so that** I always have accurate, low-effort organization (e.g. finding every melodic pattern) without manually tagging every Pattern myself.

- **AC-5.3.1** — Auto-tags recompute immediately on configuration change
  - **Given** a Pattern named "New Groove," currently Percussive (carrying `percussive`) with swing 0 on every Subdivision Group (no `swing` Tag)
  - **When** the Composer switches it to Melodic and sets one Subdivision Group's swing to 40
  - **Then** its Tags immediately update to carry `melodic` (no longer `percussive`) and `swing`, with no manual tagging action taken

- **AC-5.3.2** — `custom` is permanent, set once at creation
  - **Given** the Composer creates a new Pattern named "My Test Pattern"
  - **When** it is created
  - **Then** it carries the `custom` Tag
  - **And**, given they later rename it, rewrite its rhythm entirely, and save it repeatedly
  - **Then** it still carries `custom`, unaffected by any of those edits

- **AC-5.3.3** — `percussive`/`melodic` always reflects current Sound Mode
  - **Given** a Pattern currently Melodic, carrying `melodic`
  - **When** the Composer switches it to Percussive
  - **Then** it now carries `percussive` and no longer carries `melodic`

- **AC-5.3.4** — `swing` tracks live swing state
  - **Given** a Pattern with swing 0 on every Subdivision Group, carrying no `swing` Tag
  - **When** the Composer sets one Subdivision Group's swing to 25
  - **Then** it immediately carries `swing`
  - **And**, when that swing value is set back to 0 and no other Subdivision Group has swing > 0
  - **Then** `swing` is removed immediately

- **AC-5.3.5** — Auto-tags are not user-removable and render distinctly
  - **Given** a Pattern carrying `swing` because one Subdivision Group has swing 25
  - **When** the user looks for a way to remove the `swing` Tag directly
  - **Then** no removal control is available for it, and it renders visually distinct (e.g. a lock indicator) from a user-typed Tag like "warmup" on the same Pattern

- **AC-5.3.6** — User Tag de-duplication is case-insensitive
  - **Given** a Pattern already tagged "Warmup"
  - **When** the user types "warmup" (lowercase) and adds it as a Tag
  - **Then** no second Tag is added — the existing "Warmup" Tag is unchanged, since matching is case-insensitive

- **AC-5.3.7** — User Tag length/count limits
  - **Given** a Pattern already carrying 20 user-typed Tags
  - **When** the user attempts to add a 21st
  - **Then** the addition is rejected
  - **And**, given the user attempts to add a Tag 31 characters long
  - **Then** the addition is rejected *(Assumption: 20 Tags / 30 characters are starting limits, not derived from a prior decision.)*

- **AC-5.3.8** — Tag-filter pill ordering
  - **Given** a library where the Tags currently in use are `custom`, `percussive`, `melodic`, `swing`, "hard," and "warmup"
  - **When** the Tag-filter pills are rendered
  - **Then** they appear in this exact order: `custom`, `melodic`, `percussive`, `swing` (automatic Tags, alphabetically), followed by "hard," "warmup" (user Tags, alphabetically)

---

### US-5.4 — Rate a Pattern
See Epic 6 (US-6.1).

---

### US-5.5 — Navigate sequentially
**As** the Practicing Musician, **I want** to step through patterns with Prev/Next, **so that** I can drill through a filtered set (e.g. all 4/4 patterns tagged "warmup") without returning to the full list each time.

- **AC-5.5.1** — Prev/Next steps through the filtered list, not the full library
  - **Given** the Tag filter "warmup" is active, matching exactly "Bossa Groove," "Samba Break," and "Simple Fill," in that list order
  - **When** the Practicing Musician has "Bossa Groove" loaded and taps Next
  - **Then** "Samba Break" loads — the second item in the filtered list, not the second item in the full unfiltered library

- **AC-5.5.2** — Prev/Next doesn't wrap at list boundaries
  - **Given** the same filtered list as AC-5.5.1, with "Simple Fill" (the last item) currently loaded
  - **When** the Practicing Musician looks at the Next control
  - **Then** it is disabled
  - **And**, given instead "Bossa Groove" (the first item) is loaded, the Prev control is disabled — neither control wraps to the other end of the list

---

### US-5.6 — Counting system toggle
**As** the Practicing Musician, **I want** to switch between counting systems (Takadimi syllables, numeric 1-e-&-a, or straight Numbered), **so that** the grid matches whichever system I personally count in.

- **AC-5.6.1** — Counting-system toggle updates labels live
  - **Given** "Samba Break" is loaded and playing, currently showing Takadimi syllables
  - **When** the Practicing Musician toggles to 1-e-&-a
  - **Then** every grid cell label and the legend switch to 1-e-&-a immediately, without reselecting "Samba Break" or restarting playback

- **AC-5.6.2** — A Pattern containing a mixed-feel Recipe supports Numbered only
  - **Given** "Mixed Feel Groove," where at least one Beat anywhere in the Pattern uses a mixed-feel Recipe (Straight → Triplet split or Triplet → Straight split, per AC-1.3.4)
  - **When** the Practicing Musician loads it
  - **Then** its labels render in Numbered, regardless of which counting system is globally selected
  - **And** Takadimi and 1-e-&-a are shown as unavailable for this Pattern, with a brief explanation that they have no syllables for a subdivision group spanning half a Beat
  - *(This is why the half-Beat syllable question doesn't need answering: rather than inventing Takadimi/1-e-&-a vocabulary that doesn't exist for 2-Slot straight or 3-Slot triplet half-Beat groups, Patterns that create those groups simply use Numbered, which labels by position and needs no rhythmic-feel vocabulary — see AC-5.6.8.)*

- **AC-5.6.3** — Pattern-level restriction does not overwrite the global setting
  - **Given** the global counting system is Takadimi, and the Practicing Musician loads "Mixed Feel Groove" (which forces Numbered, per AC-5.6.2)
  - **When** they then load "Samba Break," which contains no mixed-feel Recipe
  - **Then** "Samba Break" renders in Takadimi — the global setting was never changed by the earlier Pattern, only overridden for the duration of that Pattern

- **AC-5.6.4** — A Pattern without mixed-feel Recipes supports all three systems
  - **Given** "Samba Break," where every Beat uses a single-feel Recipe (Straight 16ths, Straight 8ths, Triplet 8ths, or Undivided)
  - **When** the Practicing Musician loads it
  - **Then** all three counting systems are available and selectable, and it renders in whichever is globally selected

- **AC-5.6.5** — Adding a mixed-feel Recipe to a Pattern switches it to Numbered immediately
  - **Given** "Samba Break" is loaded, currently rendering in Takadimi, with no mixed-feel Recipe anywhere
  - **When** the Composer changes one Beat's Recipe to Straight → Triplet split
  - **Then** the entire Pattern's labels switch to Numbered immediately, and Takadimi and 1-e-&-a become unavailable for it
  - **And**, when the Composer changes that Beat back to a single-feel Recipe, the Pattern returns to rendering in Takadimi (the still-unchanged global setting)

- **AC-5.6.6** — Default counting system on first load
  - **Given** the app loads for the first time
  - **When** no counting system has been chosen yet
  - **Then** it defaults to Takadimi *(Assumption: not yet confirmed by you.)*

- **AC-5.6.7** — Numbered scheme, restart per Beat
  - **Given** a Measure set to 4/4 with every Beat on the Straight 16ths Recipe (4 Slots each), Numbered active
  - **When** labels are generated
  - **Then** each Beat's 4 Slots read 1, 2, 3, 4 — and this repeats fresh at 1 for every Beat in the Measure, rather than continuing to count upward across Beats

- **AC-5.6.8** — Numbered scheme, continuous across the Measure for 1-Slot Beats
  - **Given** a Measure set to 7/8 with every Beat on the Undivided Recipe (1 Slot each), Numbered active
  - **When** labels are generated
  - **Then** the 7 Slots read 1, 2, 3, 4, 5, 6, 7 in one continuous sequence across the whole Measure, not restarting to 1 at each Beat

- **AC-5.6.9** — Numbered scheme, restart per Beat even at eighth-note-Beat granularity
  - **Given** a Measure set to 7/8 with every Beat on the Straight 16ths Recipe (2 Slots each), Numbered active
  - **When** labels are generated
  - **Then** each Beat's 2 Slots read 1, 2 — and this repeats fresh at 1 for every one of the 7 Beats, giving 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2 across the Measure — confirming the restart rule (AC-5.6.7) applies whenever a Beat has more than 1 Slot, regardless of the Beat's own note-value

- **AC-5.6.10** — Numbered scheme, no compound grouping (deferred)
  - **Given** a Measure set to 12/8 with every Beat on the Undivided Recipe (1 Slot each), Numbered active
  - **When** labels are generated
  - **Then** the 12 Slots read 1 through 12 in one straight continuous sequence, **not** grouped as 1-2-3 repeated four times — compound-grouped numbering is explicitly deferred, not part of this version

- **AC-5.6.11** — Numbered scheme handles mixed-feel Recipes by position
  - **Given** a Beat on the Straight → Triplet split Recipe (5 Slots, per AC-1.3.4) — a Pattern that therefore renders in Numbered per AC-5.6.2
  - **When** labels are generated
  - **Then** its Slots read 1, 2, 3, 4, 5 straight through, since Numbered labels by position only and needs no rhythmic-feel vocabulary — which is exactly what makes it the safe fallback for these Patterns

---

## Epic 6 — Rating

### US-6.1 — Rate a Pattern
**As** the Practicing Musician, **I want** to rate any Pattern 0–5 stars, **so that** I can remember which ones I like and quickly find my best-rated material later.

- **AC-6.1.1** — New Pattern defaults to Rating 0
  - **Given** the Composer creates a new Pattern named "New Pattern"
  - **When** it is created
  - **Then** its Rating defaults to 0 (unrated)

- **AC-6.1.2** — Rating filter defaults to All
  - **Given** the app loads with no Rating filter previously selected
  - **When** the library view renders
  - **Then** the Rating filter defaults to All

- **AC-6.1.3** — Tapping a star sets Rating from zero
  - **Given** "Samba Break" currently has Rating 0
  - **When** the Practicing Musician taps star position 4
  - **Then** its Rating is set to 4

- **AC-6.1.4** — Tapping the current star clears Rating
  - **Given** "Samba Break" currently has Rating 4
  - **When** the Practicing Musician taps star position 4 again
  - **Then** its Rating clears back to 0

- **AC-6.1.5** — Tapping a different star changes Rating rather than clearing it
  - **Given** "Samba Break" currently has Rating 4
  - **When** the Practicing Musician taps star position 2
  - **Then** its Rating changes to 2 — tapping a different, lower star position sets the Rating to that position rather than clearing it

- **AC-6.1.6** — Rating filter narrows an already-filtered list
  - **Given** the Tag filter "warmup" is active, matching "Bossa Groove" (Rating 5), "Samba Break" (Rating 2), and "Simple Fill" (Rating 4)
  - **When** the Practicing Musician also selects the "4★+" Rating filter
  - **Then** the list shows only "Bossa Groove" and "Simple Fill" — the Rating filter narrows the already-Tag-filtered list rather than replacing it

---

## Epic 7 — Composing & Editing a Pattern

### US-7.1 — Build a Pattern from scratch
**As** the Composer, **I want** to add Measures and Beats, pick Recipes, toggle Slots, and — in Melodic mode — assign Pitch, **so that** I can create an original rhythm or melody from nothing.

- **AC-7.1.1** — New Pattern name default and validation
  - **Given** a new Pattern
  - **When** it is created
  - **Then** its name defaults to "New Pattern," pre-selected in an editable field for immediate rename
  - **And**, if the Composer clears the name entirely and blurs the field, it reverts to the last valid name rather than staying empty

- **AC-7.1.2** — A newly created Pattern is immediately in the library
  - **Given** the Composer has just created "New Pattern" and made no edits to it yet
  - **When** they open the library (Epic 5)
  - **Then** "New Pattern" already appears there — no separate save/publish step is required to make it discoverable, even though it's still empty/unedited

---

### US-7.2 — Continuous auto-save for a Pattern you own
**As** the Composer editing a Pattern I already own (carrying the `custom` Tag), **I want** every edit to save automatically and immediately, **so that** I never have to remember to save or risk losing work, and there's no separate Save action to think about.

- **AC-7.2.1** — Edits to an owned Pattern save immediately, no Save action
  - **Given** "My Custom Fill" (carrying `custom`) is loaded
  - **When** the Composer toggles a Slot on
  - **Then** that change is saved into "My Custom Fill" immediately — there is no explicit Save action anywhere in the app, and no unsaved/dirty indicator is ever shown

- **AC-7.2.2** — Each edit in a sequence saves individually
  - **Given** "My Custom Fill" is loaded
  - **When** the Composer makes a sequence of edits — toggling three different Slots, then changing one Subdivision Group's swing
  - **Then** each edit is saved as it happens individually, not batched into one save at the end of the sequence

- **AC-7.2.3** — Auto-saved edits survive an app close mid-edit
  - **Given** the Composer is actively editing "My Custom Fill" and closes the app mid-edit, without explicitly navigating away first
  - **When** they reopen the app and load "My Custom Fill" again
  - **Then** it reflects every edit made up to the moment they closed the app, since each one was already saved individually as it happened — no edit depends on a navigation event to be persisted

---

### US-7.3 — Editing a shipped Pattern requires naming a new Pattern first
**As** the Composer, **I want** any attempt to edit a Pattern I don't own (one shipped with the app) to immediately prompt me to name a new Pattern for my changes, **so that** shipped content can never be silently altered, and my edit always has a clear, named home from the very first change I make.

- **AC-7.3.1** — Editing a shipped Pattern triggers a naming prompt before the edit applies
  - **Given** "Bossa Groove" (shipped, no `custom` Tag, currently Percussive) is loaded
  - **When** the Composer makes any edit to it — toggling a Slot, changing its Sound Mode to Melodic, changing a Time Signature, or any other mutation
  - **Then** before that edit is applied, the Composer is prompted to name a new Pattern to hold it, with no pre-filled default name

- **AC-7.3.2** — Confirming the naming prompt creates a new owned Pattern
  - **Given** the prompt from AC-7.3.1, and the Composer types "Bossa Groove (Melodic)"
  - **When** they confirm
  - **Then** a new Pattern named "Bossa Groove (Melodic)" is created, carrying the `custom` Tag, containing "Bossa Groove"'s content plus the edit that triggered the prompt — and the editor now targets "Bossa Groove (Melodic)"; "Bossa Groove" itself remains completely unchanged

- **AC-7.3.3** — Canceling the naming prompt discards the edit
  - **Given** the naming prompt from AC-7.3.1 is showing
  - **When** the Composer cancels it instead of providing a name
  - **Then** the triggering edit is discarded, and "Bossa Groove" remains loaded, unedited, and unchanged

- **AC-7.3.4** — The naming prompt fires only once per shipped Pattern
  - **Given** "Bossa Groove (Melodic)" was just created via AC-7.3.2
  - **When** the Composer continues editing it
  - **Then** further edits auto-save directly into "Bossa Groove (Melodic)" per US-7.2 — the naming prompt fires only once, on the first edit to a shipped Pattern, never again once a named Pattern exists to hold the changes

- **AC-7.3.5** — Naming prompt enforces unique Pattern names
  - **Given** "Samba Break" already exists in the library
  - **When** the Composer, prompted per AC-7.3.1, types "samba break" (case-insensitively identical) and confirms
  - **Then** the action is blocked and they're prompted for a different name

---

### US-7.4 — Make a named copy of a Pattern you own
**As** the Composer, **I want** to explicitly make a copy of a custom Pattern under a new name, **so that** I can deliberately branch a second version (e.g. a Melodic take on a Percussive Pattern I built) while my original keeps auto-saving independently.

- **AC-7.4.1** — Make Copy prompts for a name with no default
  - **Given** "My Custom Fill" (carrying `custom`) is loaded
  - **When** the Composer chooses Make Copy
  - **Then** they are prompted to name the copy, with no pre-filled default name

- **AC-7.4.2** — Confirming Make Copy creates an independent Pattern
  - **Given** the prompt from AC-7.4.1, and the Composer types "My Custom Fill (Melodic)"
  - **When** they confirm
  - **Then** "My Custom Fill (Melodic)" is created as a wholly independent Pattern carrying "My Custom Fill"'s content at that moment, and the editor now targets "My Custom Fill (Melodic)" — "My Custom Fill" itself is unaffected and keeps auto-saving independently

- **AC-7.4.3** — Canceling Make Copy creates nothing
  - **Given** the Make Copy naming prompt from AC-7.4.1 is showing
  - **When** the Composer cancels it
  - **Then** no copy is created, and "My Custom Fill" remains loaded and unaffected

- **AC-7.4.4** — Make Copy enforces unique Pattern names
  - **Given** "Samba Break" already exists in the library
  - **When** the Composer, prompted per AC-7.4.1, types "samba break" (case-insensitively identical) and confirms
  - **Then** the action is blocked and they're prompted for a different name

- **AC-7.4.5** — A Make Copy result immediately qualifies as a Pattern Family member
  - **Given** "My Custom Fill (Melodic)" was just created via Make Copy
  - **When** Pattern Family detection runs (US-11.2)
  - **Then** it immediately qualifies as a family member of "My Custom Fill," since it shares identical rhythm content at the instant of creation

- **AC-7.4.6** — Make Copy is unavailable on shipped Patterns
  - **Given** Make Copy is available on "My Custom Fill" (custom, owned)
  - **When** the Composer looks for the same control on "Bossa Groove" (shipped, not owned)
  - **Then** it is not available — Make Copy only applies to Patterns already carrying `custom`; editing a shipped Pattern uses the forced-naming flow instead (US-7.3)

---

### US-7.5 — Delete a Pattern
**As** the Composer, **I want** to permanently delete a Pattern I created, **so that** I can remove clutter from my library without leaving discontinued work lying around indefinitely.

- **AC-7.5.1** — Delete requires a naming confirmation
  - **Given** "My Custom Fill" (carrying the `custom` Tag) is loaded
  - **When** the Composer chooses Delete
  - **Then** a confirmation naming "My Custom Fill" is required before removal — e.g. *"Delete 'My Custom Fill'? This cannot be undone."*

- **AC-7.5.2** — Delete is permanent
  - **Given** the Composer confirms deleting "My Custom Fill"
  - **When** the deletion completes
  - **Then** "My Custom Fill" is permanently removed from the library, with no way to undo the action, and no longer appears in any list, filter, or search result

- **AC-7.5.3** — Only owned Patterns can be deleted
  - **Given** "Bossa Groove," a Pattern shipped with the app (no `custom` Tag)
  - **When** the Composer looks for a Delete control on it
  - **Then** none is available — only Patterns carrying the `custom` Tag can be deleted; shipped Patterns cannot be removed

- **AC-7.5.4** — Deleting one Family member doesn't affect the other
  - **Given** "My Custom Fill" is a Pattern Family member alongside "My Custom Fill (Melodic)" (US-11.2)
  - **When** "My Custom Fill" is deleted
  - **Then** "My Custom Fill (Melodic)" is entirely unaffected — consistent with AC-11.2.3's independence guarantee, since Pattern Family membership is a discovery relationship, not a data link

---

## Epic 8 — Combine

### US-8.1 — Append a second Pattern
**As** the Composer, **I want** to pick a second Pattern and append it after my current one, **so that** I can build longer phrases out of existing pieces instead of re-authoring them from scratch.

- **AC-8.1.1** — Combine has no meter-matching restriction
  - **Given** "Groove A" (4/4) and "Bossa Take 2" (a mix of 6/8 and 7/8 Measures)
  - **When** the Composer combines them
  - **Then** concatenation succeeds — there is no meter-matching restriction, since each Measure retains its own Time Signature independently

- **AC-8.1.2** — Combine picker excludes Patterns that would exceed the 6-Measure cap
  - **Given** "Groove A" has 3 Measures currently loaded, and the Combine picker is open
  - **When** the Composer looks at the list of Patterns offered
  - **Then** any Pattern with more than 3 Measures is excluded from the picker entirely — since appending it would push "Groove A" over the 6-Measure cap (AC-1.1.3) — leaving only Patterns with 1, 2, or 3 Measures selectable

- **AC-8.1.3** — Combining to exactly 6 Measures succeeds
  - **Given** "Groove A" (3 Measures) and the Composer selects "Fill B" (3 Measures) from the (already-filtered) Combine picker
  - **When** they confirm
  - **Then** "Fill B"'s full Measure sequence is inserted immediately after "Groove A"'s last Measure, producing exactly 6 Measures total — after first showing a preview before that confirmation
  - **And** this confirms the cap is "cannot exceed 6," not "must stay strictly below 6" — combining to exactly 6 succeeds

- **AC-8.1.4** — Combine into an owned Pattern auto-saves
  - **Given** "My Custom Fill" (custom) is loaded and the Composer combines it with another Pattern
  - **When** Combine completes
  - **Then** the combined result auto-saves into "My Custom Fill" immediately, per US-7.2 — no separate save step

- **AC-8.1.5** — Combine into a shipped Pattern triggers the naming prompt
  - **Given** "Bossa Groove" (shipped, not owned) is loaded and the Composer combines it with another Pattern
  - **When** Combine completes
  - **Then** the Combine action itself is treated as the first edit to a shipped Pattern, triggering the naming prompt from US-7.3 before the combined result is applied anywhere

- **AC-8.1.6** — Combine picker re-filters correctly on repeated use
  - **Given** a Pattern that already has one appended Pattern, now at 5 Measures total (below the 6-Measure cap)
  - **When** the Composer wants to append a third Pattern
  - **Then** they invoke Combine again against the already-combined result, with the picker again filtered per AC-8.1.2 — now excluding any Pattern with more than 1 Measure

---

*(Epic 9 — Layer — was removed from scope: the value of automatically OR-merging two Patterns' accents at matching Slot positions didn't hold up against real composition workflow, where "layering" usually means stacking distinct instrument voices rather than merging two versions of one rhythmic line. Combine (Epic 8) remains. The gap in epic numbering is intentional — it's not reused.)*

---

## Epic 10 — Duplicate

### US-10.1 — Duplicate a Pattern to build a variation
**As** the Composer, **I want** to double a Pattern's length with an identical copy of its content, **so that** I can edit the second half into a variation, like a fill or a turnaround, without retyping the first half.

- **AC-10.1.1** — Duplicate copies the full Measure sequence exactly
  - **Given** "Groove A" (3 Measures), regardless of Sound Mode or content
  - **When** the Composer duplicates it
  - **Then** its full Measure sequence — every Time Signature, Recipe, Accent Level, and (if Melodic) Pitch — is copied exactly and appended, producing 6 Measures total

- **AC-10.1.2** — Duplicate focuses the newly-added second half
  - **Given** a Duplicate has just completed
  - **When** the editor updates
  - **Then** editing focus moves to the first Slot of the newly-added second half

- **AC-10.1.3** — Duplicate is enabled within the 6-Measure cap
  - **Given** "Groove A" has exactly 3 Measures
  - **When** the Composer looks at the Duplicate control
  - **Then** it is enabled, since doubling to 6 Measures stays within the 6-Measure cap (AC-1.1.3)

- **AC-10.1.4** — Duplicate is disabled when doubling would exceed the cap
  - **Given** "Groove B" has 4 Measures
  - **When** the Composer looks at the Duplicate control
  - **Then** it is disabled, since doubling to 8 Measures would exceed the 6-Measure cap — Duplicate is only available when a Pattern has 3 or fewer Measures

- **AC-10.1.5** — Duplicate into an owned Pattern auto-saves
  - **Given** "My Custom Fill" (custom, 2 Measures) is loaded and the Composer duplicates it
  - **When** Duplicate completes
  - **Then** the doubled result (4 Measures) auto-saves into "My Custom Fill" immediately, per US-7.2 — no separate save step

- **AC-10.1.6** — Duplicate into a shipped Pattern triggers the naming prompt
  - **Given** "Bossa Groove" (shipped, not owned, 2 Measures) is loaded and the Composer duplicates it
  - **When** Duplicate completes
  - **Then** the Duplicate action itself is treated as the first edit to a shipped Pattern, triggering the naming prompt from US-7.3 before the doubled result is applied anywhere

---

## Epic 11 — Duplicate Detection & Pattern Families

### US-11.1 — Detect true duplicates
**As** the Composer, **I want** to be warned only when a Pattern is a genuine duplicate, **so that** I don't accumulate clutter, while still being free to keep intentionally different renditions of the same rhythm.

- **AC-11.1.1** — True duplicate match criteria
  - **Given** "Samba Break" and "Samba Break (copy)": identical Measure sequences (Time Signatures, Recipes, Slot on/off, Accent Levels), both Percussive, and identical swing values on every Subdivision Group
  - **When** they are compared for duplication
  - **Then** they are flagged as a true duplicate pair

- **AC-11.1.2** — Differing Sound Mode, Pitch, or swing excludes a duplicate match
  - **Given** "Samba Break" (Percussive) and "Samba Break (Melodic)" (Melodic), otherwise identical Measure sequences
  - **When** they are compared
  - **Then** they are never flagged as duplicates
  - **And**, given instead two Melodic Patterns identical except for one Slot's Pitch, or two Patterns identical except for one Subdivision Group's swing value, both pairs are likewise never flagged as duplicates

- **AC-11.1.3** — Duplicate warning fires only at Pattern-creation moments
  - **Given** the Composer, prompted to name a new Pattern (US-7.3's forced-naming flow, or US-7.4's Make Copy), types a name that would make the new Pattern a true duplicate of "Samba Break"
  - **When** they confirm that name
  - **Then** they are warned before the new Pattern is created, with the choice to proceed anyway (keep both) or cancel and stay on the naming prompt
  - *(This is the resolution to the auto-save/duplicate-warning conflict flagged earlier: since ordinary edits to an already-owned custom Pattern now auto-save continuously with no discrete "save moment" per AC-7.2.1–7.2.3, an interrupting warning on every keystroke isn't workable. The duplicate check only interrupts at the two moments a genuinely new Pattern is actually being created — US-7.3 and US-7.4 — both of which already pause for a naming prompt, so adding a duplicate check there costs no extra interruption.)*

- **AC-11.1.4** — Possible-duplicates view catches duplicates from ongoing edits
  - **Given** ongoing auto-saved edits (US-7.2) to "My Custom Fill" make it, at some point, a true duplicate of an existing Pattern it wasn't a duplicate of before
  - **When** the Composer opens the "possible duplicates" view
  - **Then** it lists "My Custom Fill" alongside its duplicate, even though no interrupting warning ever fired for it — this view is the sole safety net for duplicates that emerge through ongoing edits rather than at Pattern-creation time

- **AC-11.1.5** — Removing a confirmed duplicate
  - **Given** "Samba Break" and "Samba Break (copy)" are a confirmed true duplicate pair, and the Composer selects "Samba Break (copy)" to remove
  - **When** they confirm the removal, having been shown that "Samba Break (copy)" specifically will be deleted
  - **Then** "Samba Break (copy)" is deleted from the library, and "Samba Break" remains

---

### US-11.2 — Detect and surface Pattern Families
**As** the Composer, **I want** the system to notice when several Patterns share identical rhythm content but differ in Sound Mode or Pitch, **so that** I can find other versions of a rhythm I've already built (e.g. a root-note-drone version next to an arpeggiated version of the same groove) instead of losing track of them.

- **AC-11.2.1** — Family match criteria
  - **Given** "Samba Break" (Percussive) and "Samba Break (Melodic)" (Melodic): identical Measure sequences, Recipes, Slot on/off, and Accent Levels, differing only in Sound Mode
  - **When** family detection runs
  - **Then** they are recognized as members of the same Pattern Family — precisely the set AC-11.1.2 excludes from being duplicates

- **AC-11.2.2** — Family detection recomputes on every edit, not just creation
  - **Given** any auto-saved edit (US-7.2), any Pattern created via the forced-naming flow (US-7.3), or any Make Copy (US-7.4)
  - **When** it happens
  - **Then** Pattern Family detection recomputes automatically across the library — not just at Pattern-creation moments, since ongoing edits to an existing Pattern can newly create or break a Family relationship

- **AC-11.2.3** — Family members remain fully independent
  - **Given** "Samba Break" and "Samba Break (Melodic)" are Pattern Family members
  - **When** one is edited, renamed, tagged, rated, or deleted
  - **Then** the other is entirely unaffected

- **AC-11.2.4** — Family members are discoverable via normal Tag/name listing
  - **Given** the library browse view
  - **When** the Practicing Musician looks for family members
  - **Then** they are discoverable through normal Tag/name-based listing, with no separate family-grouped view required

- **AC-11.2.5** — Family members panel: viewport-dependent display
  - **Given** the Composer is inside the Pattern editor
  - **When** the viewport is narrower than 768px
  - **Then** no family information is shown
  - **And**, when the viewport is 768px or wider, a compact area at the bottom of the editor lists the current Pattern's detected family members by name, each a link that loads that member into the editor

---

### US-11.3 — Detect when a library update duplicates one of your own custom Patterns
**As** the Composer, **I want** to be proactively told when a Pattern I submitted (US-13.1) has been merged and now ships with the app, duplicating my own custom copy, **so that** I can clean up the redundant copy without having to notice it myself.

- **AC-11.3.1** — Trigger: app load after a library update
  - **Given** the app loads and the shipped library has changed since the last time it loaded (a new app version with newly merged Patterns)
  - **When** the app checks for duplicates
  - **Then** every custom Pattern is compared against every newly-added shipped Pattern using the same true-duplicate criteria as AC-11.1.1 (full Measure sequence, Sound Mode, Pitch, swing all identical)

- **AC-11.3.2** — One-time Remove/Keep prompt, with data-loss callout
  - **Given** "Samba Break" (custom, Rating 4, Tags `custom`/"warmup") is found to be a true duplicate of a newly-shipped Pattern also named "Samba Break"
  - **When** this is detected for the first time
  - **Then** the Composer is shown a one-time prompt: *"Your custom pattern 'Samba Break' is now in the library — remove your copy? (Your Rating and Tags on it won't carry over.)"* with Remove and Keep options

- **AC-11.3.3** — Remove deletes the custom copy
  - **Given** the prompt from AC-11.3.2
  - **When** the Composer chooses Remove
  - **Then** the custom "Samba Break" is permanently deleted (per US-7.5's Delete rules, since it carries `custom`), and the shipped "Samba Break" remains as the sole copy

- **AC-11.3.4** — Keep retains both, no repeat prompt for that pair
  - **Given** the prompt from AC-11.3.2
  - **When** the Composer chooses Keep
  - **Then** both copies remain, and this specific pair is never prompted again — though it still appears in the standing "possible duplicates" view (AC-11.1.4) if the Composer wants to revisit the decision later

- **AC-11.3.5** — Resolved-pair tracking is Local Metadata
  - **Given** a Composer-custom/newly-shipped duplicate pair that has already been resolved (Remove or Keep chosen, per AC-11.3.3/11.3.4)
  - **When** the app loads again on a later occasion
  - **Then** it is not prompted a second time — which pairs have already been resolved is tracked as Local Metadata, entirely separate from either Pattern's own definition, and is never included when a Pattern is exported or submitted (US-13.1)

---

## Epic 12 — MIDI Export (single Pattern)

### US-12.1 — Export a single Pattern as MIDI
**As** the Composer, **I want** to download the current Pattern as a `.mid` file, **so that** I can bring it into a DAW without re-transcribing it by ear.

- **AC-12.1.1** — MIDI generation is entirely client-side
  - **Given** "Samba Break" is loaded
  - **When** the Composer exports it as MIDI
  - **Then** a `.mid` file is generated entirely in the browser, with no server round-trip, and offered as a download

- **AC-12.1.2** — Percussive exports to a drum channel; Melodic exports pitched notes
  - **Given** "Samba Break" (Percussive) and "Samba Break (Melodic)" (Melodic, Key C)
  - **When** each is exported
  - **Then** "Samba Break" maps to a fixed drum-channel note mapping, and "Samba Break (Melodic)" exports pitched notes exactly matching each Slot's authored degree+octave, resolved through Key C, on a melodic channel

- **AC-12.1.3** — Accent Level maps to a fixed MIDI velocity table
  - **Given** a Slot at Accent Level 1 (Weak), a Slot at Accent Level 2 (Medium), a Slot at Accent Level 3 (Strong), and an off Slot (Accent Level 0)
  - **When** the Pattern is exported
  - **Then** they receive MIDI velocities 50, 80, and 110 respectively, and the off Slot produces no note event at all *(Assumption: these three velocity values are carried over from the original app's design and haven't been explicitly re-confirmed for this rebuild.)*

- **AC-12.1.4** — Mixed-meter Pattern exports each Measure by its own Time Signature
  - **Given** "Shifting Meter" whose Measure 1 is 4/4 and Measure 2 is 6/8
  - **When** it is exported
  - **Then** Measure 1's notes are timed against 4 quarter-note Beats and Measure 2's against 6 eighth-note Beats — not a single Pattern-wide meter applied throughout

---

## Epic 13 — Community Sharing

### US-13.1 — Submit a Pattern for review
**As** the Contributor, **I want** to submit a Pattern, or a batch of my Patterns, for review, **so that** my original work can become part of the shared library for other users — and, in the absence of any sync/export-import feature, this is also the only way one of my custom Patterns ever becomes available to me on a different browser or device: once merged, it ships with the app itself rather than living only in the browser storage where I created it.

- **AC-13.1.1** — Submission mechanism: pre-filled GitHub issue link, no auth stored in-app
  - **Given** "Samba Break": Percussive, Rating 4, Tags `custom`/`swing`/"warmup," one 4/4 Measure on the Straight 16ths Recipe with Slot 1 at Strong and swing 30 on that Beat's Subdivision Group
  - **When** the Contributor clicks Submit
  - **Then** the app constructs a `github.com/<org>/<repo>/issues/new` URL with the title "New Pattern: Samba Break," the label `new-pattern`, and a body containing "Samba Break"'s full definition as a fenced code block, all encoded as URL query parameters, and presents it as a clickable link
  - **And** clicking it opens a new browser tab to GitHub's own issue-creation page, pre-filled, where the Contributor — authenticated as themselves, not the app — reviews and clicks "Submit new issue"
  - **And** the app itself never holds a GitHub credential or calls GitHub's API directly at any point

- **AC-13.1.2** — Bulk submission batches multiple Patterns into one issue
  - **Given** three `custom`-tagged Patterns not yet submitted: "Samba Break," "My Fill," and "Bossa Take 2"
  - **When** the Contributor triggers bulk submission
  - **Then** the app constructs one issue URL titled "Bulk Pattern Submission (3 patterns)," labeled `new-pattern`, with a body containing one fenced code block per Pattern under its own heading — and also copies the same full text to the clipboard as a standing backup, regardless of URL length

- **AC-13.1.3** — Oversized bulk submissions fall back to title/label-only prefill plus manual paste
  - **Given** a bulk submission whose full pre-filled URL (title + label + body) would exceed 8,000 characters
  - **When** the Contributor triggers it
  - **Then** the app does not attempt that oversized URL — it links instead to a GitHub issue pre-filled with only the title and label (no body), and shows a note instructing the Contributor to click "Copy all to clipboard" and paste the content into the issue body manually once the page opens
  - **And**, given the full URL is 8,000 characters or under, the complete title + label + body all prefill normally, per AC-13.1.2 *(Assumption: the 8,000-character threshold is carried over from the original app's implementation, chosen as a safe margin under GitHub's actual ~8,192-character request-URI limit.)*

- **AC-13.1.4** — Already-submitted, unedited Patterns are excluded from later bulk submissions
  - **Given** "Samba Break" was submitted yesterday and has not been edited since
  - **When** the Contributor triggers a later bulk submission
  - **Then** "Samba Break" is excluded from it
  - **And**, given "My Fill" was submitted yesterday but has since been edited (auto-saved per US-7.2)
  - **Then** "My Fill" is included in the new bulk submission

- **AC-13.1.5** — Submission-tracking is Local Metadata, never part of the export payload
  - **Given** "Samba Break"'s last-submitted timestamp (Local Metadata)
  - **When** "Samba Break" is submitted (AC-13.1.1)
  - **Then** the last-submitted timestamp is never included in the submitted payload — it's tracked in app-local storage, keyed by "Samba Break"'s identity, entirely separate from "Samba Break"'s own Pattern definition

---

*(Epic 14 — Tutorial System — is deferred, to be specified later. The gap in epic numbering is intentional — it's not reused.)*

---

## Epic 15 — Responsive Layout

### US-15.1 — Desktop, tablet, and mobile adaptation
**As** the Practicing Musician on any device, **I want** the layout to adapt to my screen size, **so that** the app stays usable without zooming or hunting for controls, whether I'm at a desk or holding a phone while practicing.

- **AC-15.1.1** — Breakpoint definitions
  - **Given** a viewport 767px wide, one 768px wide, one 1100px wide, and one 1101px wide
  - **When** layout breakpoints are evaluated
  - **Then** 767px resolves to mobile, 768px and 1100px both resolve to tablet, and 1101px resolves to desktop — mobile is ≤767px, tablet is 768–1100px inclusive, desktop is >1100px

- **AC-15.1.2** — Desktop sidebar is persistent at 300px
  - **Given** a 1400px-wide (desktop) viewport
  - **When** the app loads
  - **Then** the sidebar renders as a persistent 300px-wide column alongside the main panel, always visible, with no drawer toggle

- **AC-15.1.3** — Tablet sidebar is persistent at 240px
  - **Given** a 900px-wide (tablet) viewport
  - **When** the app loads
  - **Then** the sidebar renders as a persistent 240px-wide column — narrower than desktop's 300px, but still always visible rather than becoming a drawer

- **AC-15.1.4** — Mobile sidebar is an off-canvas drawer
  - **Given** a 390px-wide (mobile) viewport
  - **When** the app loads
  - **Then** the sidebar renders as an off-canvas drawer sized to 85% of viewport width, capped at a 320px maximum, opened and closed via a toggle control rather than being permanently visible

- **AC-15.1.5** — Mobile drawer auto-opens on every page load
  - **Given** a 390px-wide (mobile) viewport
  - **When** the app loads
  - **Then** the drawer opens automatically
  - **And**, when the Practicing Musician reloads the page again later, it auto-opens again — this happens on every load at mobile width, not only the first-ever visit

- **AC-15.1.6** — Mobile drawer closes on Pattern selection
  - **Given** a 390px-wide (mobile) viewport with the drawer open
  - **When** the Practicing Musician selects a Pattern from it
  - **Then** the drawer closes automatically, revealing the loaded Pattern in the main panel
  - **And**, given the same action on a 900px (tablet) or 1400px (desktop) viewport, the sidebar stays visible, since it isn't a drawer there

- **AC-15.1.7** — Secondary control sections collapse to accordions on mobile
  - **Given** a 390px-wide (mobile) viewport
  - **When** the Practicing Musician views playback settings or edit controls
  - **Then** those sections render as accordions, collapsed by default
  - **And**, given a 1400px (desktop) viewport, those same sections render expanded rather than as accordions

- **AC-15.1.8** — Fixed main-panel section order
  - **Given** the main panel at any viewport width
  - **When** its sections are laid out
  - **Then** the order is fixed top to bottom: Pattern header → grid → play controls → playback settings → edit controls → MIDI export (US-12.1) and other actions → quick navigation

- **AC-15.1.9** — Wide controls never force horizontal page scrolling
  - **Given** a 390px-wide (mobile) viewport
  - **When** the Melodic Pitch strip (US-2.2) or Recipe picker (US-1.3) is shown
  - **Then** each renders fully usable within that width, and the page body itself never scrolls horizontally — any internal scrolling is contained to the individual control

- **AC-15.1.10** — Grid remains usable for the largest supported Pattern on mobile
  - **Given** a 390px-wide (mobile) viewport and a Pattern at the maximum size: 6 Measures of 12/8, every Beat on the Straight 16ths Recipe (144 Slots total)
  - **When** the Practicing Musician views it
  - **Then** the grid remains readable and tappable, with any overflow contained to the grid's own horizontal scrolling rather than the page body
  - *(Flagged: this is the hardest responsive case in the app — 144 Slots on a phone. It's specified here as a constraint, but the actual layout strategy for it — horizontal scroll, per-Measure paging, zoom-out, or something else — is a UI design decision not settled in this document.)*

---

## Open items still needing your input

*(No unresolved content gaps remain — the half-Beat syllable question that previously sat here was resolved by restricting Patterns containing mixed-feel Recipes to the Numbered system, per AC-5.6.2, rather than inventing Takadimi/1-e-&-a vocabulary that doesn't exist.)*

### A. Values I chose without your input — confirm or override

1. **AC-5.6.6** — Default counting system on first load: currently Takadimi. *(The original rationale — "it's the app's namesake" — no longer applies now that the app is Rhythm Master, so this default is genuinely unjustified rather than merely unconfirmed. Numbered is arguably the better default: it's the only system that works on every Pattern, including mixed-feel ones. Worth a deliberate decision.)*
2. **AC-5.3.7** — User Tag limits: 30 characters per Tag, 20 Tags per Pattern.
3. **AC-2.2.3 / AC-2.2.4** — Octave range 1–7, and degree strip showing 1–8 by default extending to 15. Chosen for reasonable coverage without knowing your intended instrumental range.
4. **AC-4.1.1 / AC-4.1.2** — Timing tolerances: <10ms audio drift over 500 loops, <20ms audio-to-visual sync. Reasonable engineering starting bounds, not measured requirements.
5. **AC-2.1.4** — Pitch data is preserved (not deleted) when toggling Melodic → Percussive → Melodic, so exploratory mode-switching doesn't destroy authoring work.

### B. Behavior carried over from the original app — confirm it should persist

6. **AC-4.4.5** — Swing timing formula, including the `0.95 × d` cap on maximum shift.
7. **AC-12.1.3** — MIDI velocity mapping: Weak/Medium/Strong → 50/80/110.
8. **AC-13.1.3** — 8,000-character threshold before bulk submission falls back to clipboard-paste (safe margin under GitHub's ~8,192 request-URI limit).

### C. Specified as behavior, but the visual/interaction design is not settled

9. **AC-15.1.10** — How the grid handles the largest supported Pattern (6 Measures of 12/8 at Straight 16ths = 144 Slots) on a 390px phone. The constraint is stated; the strategy (horizontal scroll, per-Measure paging, zoom-out, etc.) is not.
10. **AC-11.1.4 / AC-11.1.5** — The standing "possible duplicates" view and its cleanup flow: functionally specified, exact list/detail layout not designed.
11. **AC-5.3.5** — Automatic Tags must render "visually distinct" from user Tags; the specific treatment (lock icon, color, separate row) is not chosen.

### D. Deferred scope — intentionally out of this version

12. **Epic 9 (Layer)** — removed; Combine (Epic 8) covers the retained use case.
13. **Epic 14 (Tutorial System)** — deferred, to be specified later. The New User persona remains defined but currently unused.
14. **Arrangements** (multi-section pieces) — out of scope, per the header.
15. **Cross-device sync / export-import** — explicitly not built. Community submission (US-13.1) is the only path by which a custom Pattern reaches another browser or device, and only if merged into the shipped library.

---

## Next step

Ready to go section by section — starting with Epic 1, or wherever you'd like to begin.
