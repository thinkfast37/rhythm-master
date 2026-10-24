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
npm run chords -- songbook [--artist A] [--song T] [--refresh] [--delay 8]   # re-read every shipped song
npm run chords -- report                                                  # rewrite REPORT.md, no fetching
```

`read` fetches with curl, so it honours the proxy. When a host is blocked, save the page
and pass the file. The words on a sheet are dropped as each line is read. A review file
holds chords, numerals, notes and its source only.

**`chord-reviews/` is committed.** One file per song, so every shipped song carries a
record of where its chords came from. `chord-reviews/REPORT.md` is generated: each shipped
credit beside the most-rated sheet, marked ✅ on the sheet, 🔁 on it but started at another
chord, or ❌ not on it, plus the sheet's loops the songbook lacks (➕). Never edit it by hand.

**Where it runs.** Ultimate Guitar is reachable from a Claude Code session on the
maintainer's Mac and blocked from the cloud. In the cloud, the maintainer runs the
command and the files come back with the branch.

## The workflow

1. **Read** each song. Take the "Chords" version with the most ratings, not a tab, a
   bass tab, or a live or acoustic arrangement — `songbook` picks it that way.
   Ultimate Guitar's terms do not allow automated access; the maintainer chose on
   2026-10-23 to re-read the songbook's songs with the paced `songbook` run anyway
   (personal use, about two requests a song). Keep it to that: songs the songbook
   credits or the maintainer names, paced, never a crawl of search results or an
   artist's catalogue.
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
3. **Compare** re-reads of shipped songs (`compare`, or the report). `DIFFERS` / ❌ is a
   question for the maintainer before any `--replace`: the shipped credit may be the
   better reading. A sheet that labels only Intro and Verse is read stanza by stanza
   (blank lines), so its later parts come out as `verse 2`, `verse 3`: name them from
   the song before adding. A note that the sheet "strays from this loop" means a passing
   chord or turnaround was left out of the loop; say so if it matters.
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
