# Vendored soundfonts

The piano samples Melodic playback uses live here, served from the app's own
origin rather than a CDN (research.md D-003).

They are **not** committed yet in a fresh checkout. Fetch them once:

```bash
npm run fetch:soundfont
git add public/soundfonts && git commit -m "Vendor the piano soundfont"
```

Until then, Melodic playback falls back to a synthesised voice — correct pitch
and octave, but not a piano. Percussive playback is pure synthesis and is
unaffected either way.

Source: [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts),
MusyngKite set, MIT licensed.
