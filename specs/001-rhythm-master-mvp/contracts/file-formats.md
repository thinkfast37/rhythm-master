# Contract: file and payload formats

The three formats that cross a boundary out of the app. Each is a place where FR-006 (Local
Metadata never leaves) and FR-005 (schema versioning) are enforced.

Pattern shape is defined in [data-model.md](../data-model.md).

---

## 1. `data/seed-patterns.json` — the shipped library

**Consumers**: the app at load; a human adding a Pattern by hand (US-16.2).

```jsonc
{
  "schemaVersion": 1,
  "patterns": [
    {
      "name": "Bossa Groove",
      "soundMode": "percussive",
      "tempo": 90,
      "tags": ["Latin"],
      "rating": 0,
      "measures": [
        {
          "timeSignature": "4/4",
          "beats": [
            {
              "recipe": "straight-16ths",
              "slots": [
                { "on": true, "accent": 3 },
                { "on": false },
                { "on": true },
                { "on": false }
              ]
            }
            // … one Beat per numerator
          ]
        }
      ]
    }
  ]
}
```

**Rules**

- No `id` field. Ids are assigned deterministically on load from seed position, so a Pattern's
  Local Metadata survives library updates.
- No provenance field. Being in this file *is* the provenance (data-model §5).
- `key` required iff `soundMode` is `"melodic"`; `pitch` then required on every `on: true` Slot.
- `accent` is optional and means "the author deliberately overrode the metric default." Omit it and
  the computed default applies — which is the normal case and keeps the file readable.
- CI validates this file against data-model §7. A failure breaks the build rather than shipping a
  musically invalid Pattern.

**The promise this format makes** (US-16.2): adding a Pattern is editing this file. No code change,
no id to invent, no bookkeeping fields, no registration step.

---

## 2. MIDI export — `.mid`

**Consumer**: the user's DAW (US-12.1).

Standard MIDI File, format 0, single track, 480 ticks per quarter note.

| Musical fact | MIDI encoding |
|---|---|
| Time Signature per Measure | a Time Signature meta event at each Measure boundary |
| Tempo | a Set Tempo meta event at tick 0 |
| Percussive Slot | fixed pitch, note-on at the Slot's tick |
| Melodic Slot | pitch from `core/pitch.resolve(pitch, key)` — the same call playback makes |
| Accent Level | note-on velocity: Weak 48, Medium 80, Strong 112 |
| Swing | applied to the tick, from the same `core/swing.js` offsets playback uses |

**Rule**: the exporter consumes `core/timeline.buildTimeline(pattern)` — the identical event list
the scheduler plays. It does not re-derive timing, pitch, or accent. This is what makes SC-003 ("what
you author is what you hear, in the app *and* in any export") enforceable: a divergence between the
`.mid` and playback would require two different timelines, and there is only one.

**Rule**: no Local Metadata, no `id`, no rating, no tags. A `.mid` is music.

---

## 3. Pattern submission payload — prefilled GitHub issue

**Consumer**: GitHub's new-issue form, reached by a URL the user clicks (US-13.1).

The app never authenticates to GitHub. It builds a URL with a prefilled title and body and hands it
to the user on GitHub's own domain — the pattern Principle V mandates for third-party writes, and
the reason no token exists anywhere in the client.

Body content: a fenced JSON block per submitted Pattern, in **seed-file Pattern shape** — exactly
what a maintainer pastes into `data/seed-patterns.json`.

```
### Pattern: Bossa Groove

```json
{ "name": "Bossa Groove", "soundMode": "percussive", … }
```
```

**Rules**

- Same field set as the seed file: no `id`, no provenance, no Local Metadata, no rating.
- Bulk submission puts one block per Pattern in one issue.
- If the URL exceeds the length limit, fall back to a title/label-only prefilled issue plus
  clipboard copy with paste instructions, rather than emitting a truncated link (AC-13.1.3).
- Submission time is recorded in `rm.localMeta.v1`, never on the Pattern (FR-006) — which is what
  lets US-11.3 later notice that a submitted Pattern has shipped, without that fact ever having
  been exportable.

---

## Enforcement

One serialization test covers all three formats: it constructs a Pattern that has Local Metadata
attached, runs it through the seed shape, the MIDI exporter, and the submission builder, and asserts
that no Local Metadata key appears in any output. FR-006 is thereby tested rather than trusted.
