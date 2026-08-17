# Phase 1 Data Model: Rhythm Master MVP

This document fixes the shape the spec's Key Entities describe in prose. It supersedes the
"PROVISIONAL" note in `tools/convert-legacy-patterns.js` — the format below is the format
`data/seed-patterns.json` already carries, now ratified.

---

## 1. Pattern

The single unit that lives in the library, gets played, rated, tagged, exported, and submitted.

```jsonc
{
  "id": "p_7f3a9c",              // stable, opaque. Assigned on creation; never reused.
  "name": "Bossa Groove",        // required, non-empty, trimmed
  "soundMode": "percussive",     // "percussive" | "melodic"
  "key": "C",                    // present only when soundMode === "melodic"
  "tempo": 80,                   // integer BPM, 18–220
  "tags": ["Latin", "warmup"],   // user Tags only; automatic Tags are derived, never stored
  "rating": 0,                   // integer 0–5
  "measures": [ /* Measure[] */ ]
}
```

**Field notes**

| Field | Rule | Source |
|---|---|---|
| `id` | Assigned at creation. Shipped Patterns get a deterministic id derived from their seed-file position, so Local Metadata keyed to one survives a library update. | FR-006 |
| `name` | Required. Duplicate names are permitted — identity is `id`, not name. | US-7.1 |
| `key` | Present iff `soundMode === "melodic"`. One of C, Db, D, Eb, E, F, Gb, G, Ab, A, Bb, B. | US-2.3 |
| `tempo` | Clamped 18–220 on read as well as write, so hand-edited seed data cannot introduce an out-of-range value. | AC-4.2.1 |
| `tags` | Stores **only** user-typed Tags. `custom`, `swing`, `percussive`, and `melodic` are computed from the Pattern on read and never persisted — persisting them would let them drift out of sync with the Pattern they describe. | US-5.3 |
| `measures` | 1–6 entries. The cap is enforced on every operation that can grow a Pattern (add Measure, Append, Duplicate). | AC-1.1.3 |

**Not on the Pattern**, deliberately:

- `origin` / provenance — see §5. Derived from which store the Pattern was loaded from, which makes
  it structurally impossible for an edit to forge it.
- Submission history, resolved-duplicate state — Local Metadata (§6), a separate store entirely
  (FR-006).
- Automatic Tags — computed (§4).
- Default Accent Levels — computed (§3).

---

## 2. Measure

```jsonc
{
  "timeSignature": "7/8",
  "beats": [ /* Beat[] */ ]
}
```

**Invariant (Principle I, FR-002)**: `beats.length` MUST equal the numerator of `timeSignature`,
always, with no implied sub-grouping. 7/8 is seven eighth-note Beats — never 2+2+3. 6/8 is six
eighth-note Beats — never two dotted quarters.

**Supported Time Signatures** and the Beat note value each implies:

| Time Signature | Beats | Beat note value |
|---|---|---|
| 1/4, 2/4, 3/4, 4/4, 5/4, 6/4, 7/4 | 1–7 | quarter note |
| 6/8, 7/8, 9/8, 12/8 | 6, 7, 9, 12 | eighth note |

The Beat note value — quarter or eighth — is what selects the Recipe menu (§3). It is a pure
function of the denominator, computed by `core/meter.js`, never stored.

1/4 and 2/4 exist because the predecessor's sub-measure drill cells convert to them (AC-16.1.6);
without them those Patterns could only be represented by padding or repetition, both of which change
what the Pattern is.

---

## 3. Beat, Recipe, and Slot

```jsonc
{
  "recipe": "straight-16ths",
  "slots": [
    { "on": true, "accent": 2, "pitch": { "degree": "b3", "octaveOffset": -1 } },
    { "on": false },
    { "on": false },
    { "on": false }
  ]
}
```

### Recipe catalogue

Fixed and closed. A Beat's available Recipes depend only on its note value.

**Quarter-note Beat — five Recipes:**

| `recipe` id | Label | Slots | Subdivision Groups |
|---|---|---|---|
| `straight-16ths` | Straight 16ths | 4 | one straight group of 4 |
| `straight-8ths` | Straight 8ths | 2 | one straight group of 2 |
| `triplet-8ths` | Triplet 8ths | 3 | one triplet group of 3 |
| `straight-triplet-split` | Straight → Triplet | 5 | straight group of 2 (first 8th), then triplet group of 3 (second 8th) |
| `triplet-straight-split` | Triplet → Straight | 5 | triplet group of 3 (first 8th), then straight group of 2 (second 8th) |

**Eighth-note Beat — two Recipes:**

| `recipe` id | Label | Slots | Subdivision Groups |
|---|---|---|---|
| `undivided` | Undivided | 1 | one group of 1 |
| `straight-16ths` | Straight 16ths | 2 | one straight group of 2 |

Note `straight-16ths` means 4 Slots on a quarter-note Beat and 2 on an eighth-note Beat — in both
cases it is "16th notes," which is what the name asserts. `core/recipes.js` resolves Slot count from
`(recipe, beatNoteValue)`; nothing else may assume a count from the id alone.

There is deliberately no Undivided Recipe for quarter-note Beats and no triplet Recipe for
eighth-note Beats.

**Invariant**: `slots.length` MUST equal the Slot count the Recipe resolves to for that Beat's note
value. Any Recipe change replaces the entire `slots` array with fresh off Slots (AC-1.3.6) — no
Slot content is carried across, in either direction.

### Slot

| Field | Type | Rule |
|---|---|---|
| `on` | boolean | Required. `false` means silent. |
| `accent` | 1 \| 2 \| 3 | **Optional, and present only when the user overrode the computed default.** Absent means "use the metric default." Never written speculatively. |
| `pitch` | object | Present only when `soundMode === "melodic"` and `on === true`. |

`accent` is deliberately absent rather than 0 for an off Slot. Accent Level 0 is not a stored value
— it is what `on: false` means.

**Pitch**

```jsonc
{ "degree": "b3", "octaveOffset": -1 }
```

`degree` is a scale-degree token: a positive integer with an optional flat or sharp prefix, resolved
against the Pattern's `key`. Degrees above 7 continue upward by octave, so `"9"` is a ninth above the
tonic — the same note as `"2"` an octave up, written the way a musician writes it. The pitch strip
(US-2.2) offers `"1"`–`"8"` by default and extends to `"15"`; the shipped library uses up to `"10"`.
`octaveOffset` is an integer, 0 being the base octave — octave 4, whose degree 1 in C is middle C.
The strip spans `octaveOffset` −3 to +3, shown to the musician as absolute octaves 1 to 7
(AC-2.2.3). Resolution to a frequency or MIDI note number is `core/pitch.js`'s job and depends on
`(degree, octaveOffset, key)` only.

*(Revised 2026-08-17. This previously said degrees ran `"1"`–`"7"`, which neither `core/pitch.js`
nor `tools/validate-seed.js` has ever enforced and which the shipped library already contradicts —
four Patterns use `"8"`, `"9"` and `"10"`.)*

### Computed Accent defaults (never stored — FR-003)

Both levels use the same formula, applied to a sequence of length *N* at 1-based index *i*:

```
strong  if i === 1
medium  if N is even and N > 2 and i === (N / 2) + 1
weak    otherwise
```

Applied at Beat level across the Measure's Beats, and again at Slot level within each Beat, then
combined:

| Within-Beat position | Resulting default |
|---|---|
| Slot 1 | that Beat's own level |
| the midpoint Slot (the "&") | **Medium, in every Beat** |
| everything else | Weak |

The "&" is uniformly Medium rather than derived from its Beat's level, so the within-Beat shape is
identical wherever you are in the Measure and only Slot 1 varies (AC-3.1.16). Three Accent Levels
cannot represent the full hierarchy — bar, half-bar, beat, eighth, sixteenth — so something has to
collapse; this is the collapse that matches how the subdivision is actually played.

Consequences worth stating because they are easy to get wrong: a 3-Slot or 5-Slot Recipe never
produces a Medium Slot (odd *N* has no midpoint), and a 2-Slot Recipe never does either
(*N* not > 2).

---

## 4. Derived values — computed, never persisted

| Derived value | Computed from | Spec |
|---|---|---|
| Default Accent Level | Slot's metric position | FR-003 |
| Automatic Tag `built-in` / `custom` | which store the Pattern came from | US-5.3 |
| Automatic Tag `swing` | any Subdivision Group has swing ≠ 0 | US-5.3 |
| Automatic Tag `percussive` / `melodic` | `soundMode` | US-5.3 |
| Beat note value | Time Signature denominator | FR-002 |
| Slot count | `(recipe, beatNoteValue)` | US-1.3 |
| Counting-system labels | Recipe + Slot index + active system | US-5.6 |
| Forced Numbered counting | Pattern contains a mixed-feel Recipe | AC-5.6.2 |
| Duplicate / Pattern Family relations | structural comparison of Patterns | US-11.1, US-11.2 |

Persisting any of these would let it drift from the Pattern it describes. They are recomputed on
read.

---

## 5. Provenance

A Pattern is **shipped** or **user-owned**. This is not a field on the Pattern (§1) — it is
determined by which store it came from:

- Loaded from `data/seed-patterns.json` → shipped. Immutable. Not deletable. Editing one triggers
  the naming prompt (US-7.3) and produces a new user-owned Pattern.
- Loaded from `rm.patterns.v1` → user-owned. Auto-saved continuously (US-7.2), deletable,
  carries the automatic `custom` Tag.

Keeping provenance out of the serialized Pattern means an edit cannot forge it and an import
cannot claim it — which is what FR-007's "durable property, not derived from mutable state"
requires.

---

## 6. Storage schema

Three separate `localStorage` keys. The separation is what makes FR-006 structural.

### `rm.patterns.v1` — user-owned Patterns

```jsonc
{ "schemaVersion": 1, "patterns": [ /* Pattern[] */ ] }
```

### `rm.localMeta.v1` — Local Metadata (NEVER exported — FR-006)

App-local bookkeeping *about* Patterns, keyed by Pattern id:

```jsonc
{
  "schemaVersion": 1,
  "byPatternId": {
    "p_7f3a9c": {
      "submittedAt": "2026-08-14T10:22:00Z",   // US-13.1
      "duplicateResolved": true                 // US-11.3 — one-time prompt already answered
    }
  }
}
```

No code path may merge this into a Pattern. A serialization test asserts that no key from this
store appears in any MIDI export, submission payload, or Pattern JSON.

### `rm.overlays.v1` — user content on shipped Patterns

Shipped Patterns are frozen, but the musician can still rate and tag them. Those values
cannot live on the Pattern, so they live here, keyed by Pattern id:

```jsonc
{
  "schemaVersion": 1,
  "byPatternId": {
    "s_12": { "rating": 4, "addedTags": ["warmup"] }
  }
}
```

`addedTags` sits **alongside** the Pattern's own tags rather than replacing them. A built-in
Pattern's own tags describe what it is and are not the musician's to remove; the ones they
add are theirs, and are.

This is deliberately **not** Local Metadata. Local Metadata is app-local bookkeeping *about*
a Pattern and is barred from every export (FR-006). A rating is the musician's own content —
it is what they came back for, and it should travel with the Pattern if they make it their
own. Two stores keep the distinction enforceable rather than remembered.

Owned Patterns need no overlay: their rating and tags live on the Pattern itself.

### `rm.settings.v1` — app preferences

```jsonc
{
  "schemaVersion": 1,
  "countingSystem": "takadimi",   // "takadimi" | "one-e-and-a" | "numbered"
  "lastTempo": 100,               // AC-4.2.3 global fallback
  "metronomeEnabled": false,
  "countInEnabled": false
}
```

### Seed file — `data/seed-patterns.json`

```jsonc
{ "schemaVersion": 1, "patterns": [ /* Pattern[], without id */ ] }
```

Shipped Patterns omit `id` (assigned deterministically on load) and omit anything derivable. This
keeps US-16.2's promise that adding a Pattern to the library is a plain data edit — name, mode,
tempo, tags, and measures, nothing bookkeeping-shaped.

### Migration

Every store carries `schemaVersion`. `storage/migrate.js` holds an ordered list of upgrade
functions; reading a store at version *n* applies every migration from *n* to current before the
data reaches any other module. Migrations upgrade, never discard (FR-005). A store whose version is
*newer* than the running app's is left untouched and surfaced as an error, rather than being
downgraded and corrupted.

---

## 7. Validation rules

Enforced in `core/pattern.js` on every mutation, and on load for both stores:

1. `measures.length` between 1 and 6.
2. Each Measure's `beats.length` equals its Time Signature numerator.
3. Each Beat's `recipe` is in the catalogue for its Beat note value.
4. Each Beat's `slots.length` equals its resolved Slot count.
5. `accent`, where present, is 1, 2, or 3 — and only on a Slot with `on: true`.
6. `pitch`, where present, only on a Slot with `on: true`, and only when `soundMode` is `melodic`.
7. `key` present iff `soundMode` is `melodic`.
8. `tempo` an integer within 18–220.
9. `rating` an integer within 0–5.
10. `tags` contains no automatic Tag name.

A shipped Pattern failing validation is a build-breaking error — the seed file is checked in CI.
A user-owned Pattern failing validation is repaired where unambiguously possible (clamping tempo,
dropping a stray automatic Tag) and otherwise quarantined rather than dropped, so no authored work
is silently lost.
