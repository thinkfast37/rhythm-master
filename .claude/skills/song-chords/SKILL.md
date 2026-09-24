---
name: song-chords
description: Add songs' chord progressions to the catalogue from their chord sheets (Ultimate Guitar Chords pages, saved pages, or plain-text sheets), or re-check songs already credited. Reads one song at a time, keeps only the chords, works out the key and each section's loop as numerals, and files reviewed songs into src/core/harmony.js and src/core/songbook.js (AC-2.6.1/18, AC-2.6.11). Use when asked to add a song, an artist's songs, or "the progressions from" something, or to check whether a shipped song's chords are right.
---

# song-chords

## The tool

```bash
npm run chords -- read <url|file> [--artist A] [--title T] [--out file]   # → chord-reviews/<artist>--<title>.json
npm run chords -- compare chord-reviews/*.json                           # against the shipped credits
npm run chords -- add chord-reviews/x.json [--replace] [--heading pop] [--dry-run]
```

`read` fetches with curl, so it honours the proxy. When a host is blocked, save the page
and pass the file. The words on a sheet are dropped as each line is read. A review file
holds chords, numerals and notes only, and `chord-reviews/` is gitignored.

## The workflow

1. **Read** each song. Take the "Chords" version with the most ratings, not a tab or
   a bass tab. One song at a time: Ultimate Guitar's terms do not allow bulk
   automated access, so never loop over search results.
2. **Review before adding.** Print the review. Look hard at:
   - **The key.** Relative major and minor are the common miss (`vi–IV–I–V` versus
     `i–♭VI–♭III–♭VII`). The page's own key is in the note when it disagrees.
   - **The loops.** A sheet shows where chords change, not how long each lasts, so a
     chord held for two bars is written once. Where the maintainer would hear I–I–IV–V,
     edit the numerals by hand.
   - **Simplifications.** Anything in `note` (dropped bass, m11 read as m7) is fine to
     keep, but say so in the PR.
   - `confidence: low` means the chords fit no key well. **Ask the maintainer**; don't
     guess.
3. **Compare** re-reads of shipped songs. `DIFFERS` is a question for the maintainer
   before any `--replace`: the shipped credit may be the better reading.
4. **Add**, then regenerate the matrix and run every gate (CLAUDE.md §4).

## What the gates will say

- **A new artist has no heading** in AC-2.6.1/18. `add` refuses until you pass
  `--heading`, and the criterion must be revised to name the artist (a spec change:
  do it first, CLAUDE.md §2).
- **The screen-off render ceiling.** `tests/unit/audio/backgroundRender.test.js` proves
  that the whole catalogue at a 3-second pass renders whole under `MAX_BYTES`. At
  60 MB that holds about 237 entries. Past that the test fails. That is a decision
  for the maintainer (raise the ceiling, or accept a shorter screen-off loop, as
  AC-4.1.15/4 allows), never a test to loosen.
- A loop the catalogue already holds is credited, not duplicated (AC-2.6.1/15), and
  replacing a song's credits removes any song entry nothing credits any more
  (AC-2.6.11/3).
