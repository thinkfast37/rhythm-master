# Piano samples

Salamander Grand Piano by Alexander Holm (a Yamaha C5 grand), licensed
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). These are the MP3 renderings
Tone.js publishes at `https://tonejs.github.io/audio/salamander/`, one every three
semitones from A0 to A7, named `<pitch><octave>.mp3` with `s` for sharp (`Ds1`, `Fs4`).
They are copied unchanged from the sibling fret-navigator project.

They are the piano voice of US-2.13: `src/core/voice.js` chooses the recording nearest each
note, and `src/audio/pianoSamples.js` plays it re-pitched. Constitution 3.9.0 and
research.md D-003 (amended 2026-10-24) record why they are bundled.

C8 is deliberately absent: its recording measured almost a semitone sharp (≈4425 Hz
against 4186 Hz), so A#7–C8 play from A7.
