/**
 * The melodic voice (US-2.13, US-19.12): the instruments a note can sound
 * with, which one a note does sound with, how loud a part is, and, for the
 * piano, which recording plays it at what rate.
 *
 * Pure: the audio module asks, and plays what it is told.
 */

/**
 * Every instrument a note can sound with (AC-19.12.1/1), in the order the
 * switches list them. `view` is where its notes are played in the Composer —
 * the fretboard for the two guitars, the keyboard for the rest (AC-19.12.1/2).
 * `soundfont` names the FluidR3_GM instrument a fetched voice plays
 * (AC-19.7.1, AC-19.12.5/1); `held` says a note lasts until the part's next
 * (AC-19.12.5/3).
 */
export const INSTRUMENTS = Object.freeze(
  [
    { id: 'piano', label: 'Piano', view: 'piano' },
    { id: 'synth', label: 'Synth', view: 'piano' },
    { id: 'guitar', label: 'Guitar', view: 'guitar', soundfont: 'acoustic_guitar_steel' },
    { id: 'electric', label: 'Electric guitar', view: 'guitar', soundfont: 'overdriven_guitar', held: true },
    { id: 'bass', label: 'Bass', view: 'piano', soundfont: 'electric_bass_finger', held: true },
    { id: 'sax', label: 'Sax', view: 'piano', soundfont: 'alto_sax', held: true },
    { id: 'trumpet', label: 'Trumpet', view: 'piano', soundfont: 'trumpet', held: true },
    { id: 'flute', label: 'Flute', view: 'piano', soundfont: 'flute', held: true },
    // Synthesised (US-19.13). `fixed`: its notes name drums, so they never move with the Key.
    { id: 'drums', label: 'Drums', view: 'piano', fixed: true },
  ].map(Object.freeze)
);

/** The voices a melodic note can sound with, in the switch's order (AC-2.13.1/1). */
export const VOICES = Object.freeze(INSTRUMENTS.map((i) => i.id));

/** Piano unless the musician has chosen otherwise (AC-2.13.1/2). */
export const DEFAULT_VOICE = 'piano';

/** The Composer's instrument on first use (AC-19.1.3/1). */
export const DEFAULT_INSTRUMENT = 'guitar';

/** A stored value, read safely: anything unrecognised is the default (data-model §6). */
export function normaliseVoice(voice, fallback = DEFAULT_VOICE) {
  return VOICES.includes(voice) ? voice : fallback;
}

/** An instrument's entry in the catalogue; an unrecognised id reads as the piano. */
export function instrumentOf(id) {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

/** Where an instrument's notes are played: `guitar` the fretboard, `piano` the keyboard (AC-19.12.1/2). */
export function viewOf(id) {
  return instrumentOf(id).view;
}

/** Whether an instrument's notes stay where they were written whatever the Key — the drums (AC-19.13.3). */
export function hasFixedNotes(id) {
  return Boolean(INSTRUMENTS.find((i) => i.id === id)?.fixed);
}

/** The instruments fetched as FluidR3_GM samples, by id. */
export const FETCHED = Object.freeze(INSTRUMENTS.filter((i) => i.soundfont).map((i) => i.id));

/**
 * The voice a melodic note sounds with. Practice plays the chosen voice
 * (AC-2.13.2). The Composer plays the part's own instrument, and the voice
 * Practice has chosen decides nothing there (AC-2.13.3).
 *
 * @param {{ composer: boolean, instrument?: string, voice?: string }} where
 * @returns {string} an instrument id
 */
export function resolveVoice({ composer, instrument, voice }) {
  if (!composer) return normaliseVoice(voice);
  return normaliseVoice(instrument, DEFAULT_INSTRUMENT);
}

/* --- a part's volume (AC-19.12.3) -------------------------------------------- */

export const MIN_VOLUME = 1;
export const MAX_VOLUME = 100;
/**
 * 8 dB under full. Parts that do not move together add by power — six of them
 * about 8 dB — so up to six parts at the default land at about the level of
 * one at full, with twenty steps left to bring a part forward (research.md D-028).
 */
export const DEFAULT_VOLUME = 80;
/** Decibels a step: loudness is heard in ratios, so the taper is in dB (AC-19.12.3/3). */
export const VOLUME_DB_PER_STEP = 0.4;

/** A volume as stored or typed, read safely: a whole number held to 1–100, the default when it is no number (AC-19.12.3/2). */
export function normaliseVolume(volume) {
  if (volume === null || volume === undefined || volume === '') return DEFAULT_VOLUME;
  const n = Number(volume);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, Math.round(n)));
}

/** How far under the full level a volume sits, in dB: 0 at 100 (AC-19.12.3/3). */
export function volumeDb(volume) {
  return (normaliseVolume(volume) - MAX_VOLUME) * VOLUME_DB_PER_STEP;
}

/** The multiplier a volume puts on a note's level (AC-19.12.3/3). */
export function volumeGain(volume) {
  return 10 ** (volumeDb(volume) / 20);
}

/**
 * The Salamander recordings shipped: A0 (MIDI 21) to A7 (105), a minor third
 * apart. C8 is left out because its recording is almost a semitone sharp, so
 * A#7–C8 play from A7.
 */
export const PIANO_SAMPLE_NOTES = Object.freeze(Array.from({ length: 29 }, (_, i) => 21 + i * 3));

const FILE_NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];

/** The file a recording is shipped as: 63 → "Ds4.mp3". */
export function pianoSampleFile(sampleMidi) {
  return `${FILE_NAMES[sampleMidi % 12]}${Math.floor(sampleMidi / 12) - 1}.mp3`;
}

/**
 * The recording a note plays and the rate that puts it at the note's pitch
 * (AC-2.13.2/1). The nearest recording wins, so the stretch is never more than
 * a semitone and a half; a note outside the range takes the nearest end.
 */
export function pianoSampleFor(midiNote) {
  let sampleMidi = PIANO_SAMPLE_NOTES[0];
  for (const candidate of PIANO_SAMPLE_NOTES) {
    if (Math.abs(candidate - midiNote) < Math.abs(sampleMidi - midiNote)) sampleMidi = candidate;
  }
  return { sampleMidi, playbackRate: 2 ** ((midiNote - sampleMidi) / 12) };
}

/**
 * How long a piano note is held before its damper falls, by Accent Level, and
 * how long the damper takes. A rhythm has onsets and no durations, so the hold
 * is a fixed non-legato length: long enough to read as a piano, short enough
 * that a line at practice tempo does not blur like a held pedal.
 */
export const PIANO_HOLD_SECONDS = Object.freeze({ 1: 0.8, 2: 1.2, 3: 1.6 });
export const PIANO_RELEASE_SECONDS = 0.3;
