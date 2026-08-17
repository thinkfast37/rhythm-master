# The shipped Pattern library

`seed-patterns.json` is the library every user gets on first load. It is **data, not
code** (US-16.2): adding a Pattern means editing this file. No code change, no id to
invent, no registration step.

Check your work with:

```bash
npm run validate:seed
```

## Shape

```jsonc
{
  "schemaVersion": 1,
  "patterns": [
    {
      "name": "Bossa Groove",        // required, non-empty
      "soundMode": "percussive",     // "percussive" | "melodic"
      "key": "C",                    // melodic Patterns only; one of C Db D Eb E F Gb G Ab A Bb B
      "tempo": 90,                   // integer, 18–220
      "tags": ["Latin"],             // your own tags only — see below
      "rating": 0,                   // integer, 0–5
      "measures": [
        {
          "timeSignature": "4/4",
          "beats": [                 // exactly as many Beats as the numerator
            {
              "recipe": "straight-16ths",
              "slots": [             // exactly as many Slots as the Recipe gives
                { "on": true, "accent": 3 },
                { "on": false },
                { "on": true },
                { "on": false }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Rules that trip people up

**Beat count is the numerator, always.** 7/8 needs seven Beats, not three. 6/8 needs
six, not two. There is no implied grouping anywhere in this app.

**Slot count comes from the Recipe *and* the Beat's note value.** `straight-16ths` is
4 Slots on a quarter-note Beat (x/4 meters) and 2 Slots on an eighth-note Beat (x/8
meters). Both are genuinely 16th notes.

| Beat note value | Available Recipes | Slots |
|---|---|---|
| quarter (x/4) | `straight-8ths` | 2 |
| | `straight-16ths` | 4 |
| | `triplet-8ths` | 3 |
| | `straight-triplet-split` | 5 |
| | `triplet-straight-split` | 5 |
| eighth (x/8) | `undivided` | 1 |
| | `straight-16ths` | 2 |

There is no `undivided` on a quarter-note Beat and no triplet Recipe on an eighth-note
Beat.

**Omit `accent` unless you mean it.** Accent is computed from metric position — Beat 1
of 4/4 comes out Strong, Beat 3 Medium, the rest Weak, and the same shape applies within
each Beat. Write `accent` only where you want to *override* that. Most Patterns here
have none.

**Don't write automatic tags.** `custom`, `swing`, `percussive`, and `melodic` are
derived from the Pattern itself. Storing them lets them drift out of sync with what they
describe.

**No `id` field.** Ids are assigned from position on load, which is why **new Patterns go
at the end of the file** — reordering reassigns ids and orphans anything keyed to them.

**Melodic Patterns need a pitch on every sounding Slot**, as
`{ "degree": "b3", "octaveOffset": -1 }`. Degree is `1`–`7` (or beyond, for
ninths and thirteenths) with an optional `b` or `#`; `octaveOffset` is 0 for the base
octave.

## Supported Time Signatures

`1/4` `2/4` `3/4` `4/4` `5/4` `6/4` `7/4` `6/8` `7/8` `9/8` `12/8`

`1/4` and `2/4` exist so one- and two-beat drill cells keep their real loop length
instead of being padded out to a full bar.

## Full reference

[`specs/001-rhythm-master-mvp/data-model.md`](../specs/001-rhythm-master-mvp/data-model.md)
and [`contracts/file-formats.md`](../specs/001-rhythm-master-mvp/contracts/file-formats.md).
