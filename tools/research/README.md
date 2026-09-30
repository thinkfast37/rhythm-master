# Research to run on your own machine

The cloud session's network proxy blocks YouTube, Hooktheory and Ultimate
Guitar. When a curation question needs those sites, the commands go here and
you run them locally; the output files come back to the session (paste them,
attach them, or run Claude Code locally in the repo and let it read them).

Setup, once: `npm ci`, and `brew install yt-dlp` for the YouTube script.

## Indie progressions and fills — curating the Logic Pro loop export (T350)

### 1. David Bennett's harmony videos

```bash
npm run research:bennett
```

Writes `research-out/bennett-harmony.md`: every harmony video's title, link
and description (which names his example songs). Takes a few minutes.

### 2. Chord sheets for the songs the research was unsure of

One song at a time, through the existing chord-sheet reader — it keeps the
chords and discards the lyrics. Each writes `chord-reviews/<artist>--<song>.json`.

```bash
npm run chords -- read https://tabs.ultimate-guitar.com/tab/modest-mouse/dashboard-chords-1775925
npm run chords -- read https://tabs.ultimate-guitar.com/tab/big-thief/paul-chords-6314753
npm run chords -- read https://tabs.ultimate-guitar.com/tab/pixies/where-is-my-mind-chords-706594
npm run chords -- read https://tabs.ultimate-guitar.com/tab/death-cab-for-cutie/transatlanticism-chords-1813826
npm run chords -- read https://tabs.ultimate-guitar.com/tab/vampire-weekend/a-punk-chords-1730423
npm run chords -- read https://tabs.ultimate-guitar.com/tab/fleet-foxes/white-winter-hymnal-chords-847489
```

These four had no Ultimate Guitar link in the research. Search the site for
each, open the top-rated **Chords** version, and pass its URL the same way:

- Arcade Fire — Rebellion (Lies)
- The Strokes — Someday
- The Strokes — Last Nite
- Pixies — Here Comes Your Man

### 3. Send back

`research-out/bennett-harmony.md` and the `chord-reviews/` folder.
