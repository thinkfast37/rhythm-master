---
name: pattern-intake
description: Review Patterns that users submitted through the app's Submit button (US-13.1) and add the good ones to the shipped library. Decodes both submission forms — readable JSON and the compressed rhythm-master block — and renders each Pattern as a legible accent grid before anything is written. Use when asked to look at, review, triage, accept or reject submitted Patterns, when asked what has been submitted, or when handed a GitHub issue labelled new-pattern.
---

# pattern-intake

## What this is for

The app's Submit button hands a Contributor a pre-filled GitHub issue (US-13.1). Something
then has to read those issues and decide what ships. That is this.

Two problems it solves:

- **A submission may not be readable.** Above ~8,000 characters of URL the app compresses the
  payload into a `rhythm-master` block (AC-13.1.3/1), which is a wall of base64. Dense 12/8
  and Melodic Patterns always arrive that way.
- **JSON is not how you judge a rhythm.** Deciding whether a Pattern is worth shipping means
  looking at where the notes fall, not reading `{"on":true}` two hundred times.

## Commands

```bash
node .claude/skills/pattern-intake/pattern-intake.mjs list
node .claude/skills/pattern-intake/pattern-intake.mjs show 42
node .claude/skills/pattern-intake/pattern-intake.mjs accept 42 --dry-run
node .claude/skills/pattern-intake/pattern-intake.mjs accept 42
```

`list` and `show` change nothing. `accept` writes `data/seed-patterns.json` and stops.

## The workflow

1. **`list`** — every open `new-pattern` issue, with how many Patterns each carries. An issue
   that cannot be decoded is reported, not skipped silently.
2. **`show <issue>`** — decode and render. Present this to the maintainer and let them decide;
   never accept on their behalf. It looks like:

   ```text
   Samba Break
   4 Measures · 4/4 · 96 BPM · percussive · 12 notes
   Recipes: straight-16ths
   Tags: Latin, warmup
   From issue #42 by some-contributor

     M1 |X · · ·|x · o ·|X · · ·|x · x ·|
     M2 |X · · ·|x · o ·|X · · x|x · x ·|

     X strong · o medium · x weak · · silent
   ```

3. **Ask the maintainer.** Is it musically worth shipping? Is the name right? Are the Tags
   the ones a user would search for? These are the questions the tool cannot answer.
4. **`accept <issue>`** — appends to `data/seed-patterns.json`, reporting the id each Pattern
   received.
5. **Run the gates, then land it as a normal change** (CLAUDE.md §4, §5): `npm run validate:seed`
   first, then the rest, then a PR with a task logged in `tasks.md`. This is a **data** change
   under §2 — no spec pass.

## Rules this enforces, and why

- **Appended, never inserted.** Shipped ids are positional (`s_${index + 1}`), so inserting
  anywhere but the end renumbers every later Pattern and orphans the ratings and added Tags
  that `rm.overlays.v1` keys by id. That is silent data loss for anyone who has rated
  anything, so `lib/seed.mjs` will only write at the end.
- **A name that already exists is refused** (case-insensitively), unless `--force`. Two
  Patterns with the same name are indistinguishable in the library list.
- **`accept` does not validate its own write.** `npm run validate:seed` is the gate; a tool
  that blesses its own output is a gate that proves nothing. Run it after, and revert if it
  fails.
- **Nothing here re-derives musical arithmetic.** The renderer reads Accent Levels through
  `src/core/accents.js`, so what you see is what will sound (Constitution Principle I).
- **The decoder is the app's own.** `lib/decode.mjs` imports `src/export/submit.js` rather than
  reimplementing the format — one implementation, so the encoder and decoder cannot drift.
  (This is the opposite choice from `spec-trace`, which is dependency-free because it is meant
  to be copied into other projects. This skill exists to serve *this* app's format.)

## What it will not do

- It will not commit, push, or open a PR by itself. Landing a change is CLAUDE.md §5's
  business, and it includes a task entry and the full gate run.
- It will not edit a Pattern's music. If a submission is nearly right, say so on the issue and
  let the Contributor resubmit — an edit made here would ship music the Contributor never
  played.
- It will not touch `rm.overlays.v1` or any user data. It only ever writes the seed file.

## Requirements

`gh`, authenticated (`gh auth status`). Node 18+ for `DecompressionStream`, which is what
unpacks a compressed submission.

## Tests

`.claude/skills/pattern-intake/tests/`, run by `npm test`. They cover both submission forms
round-tripping, the append-never-insert rule, name-clash refusal, and the rendering — because
a decoder that silently drops a Measure would otherwise be invisible until a wrong Pattern
shipped.
