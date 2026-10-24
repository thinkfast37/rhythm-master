/**
 * The melodic voice (US-2.13): which voice a melodic note sounds with, and,
 * for the piano, which recording plays it at what rate.
 *
 * Pure: the audio module asks, and plays what it is told.
 */

/** The voices a melodic note can sound with, in the switch's order (AC-2.13.1/1). */
export const VOICES = Object.freeze(['piano', 'synth', 'guitar']);

/** Piano unless the musician has chosen otherwise (AC-2.13.1/2). */
export const DEFAULT_VOICE = 'piano';

/** A stored value, read safely: anything unrecognised is the default (data-model §6). */
export function normaliseVoice(voice) {
  return VOICES.includes(voice) ? voice : DEFAULT_VOICE;
}

/**
 * The voice a melodic note sounds with. Practice plays the chosen voice
 * (AC-2.13.2). The Composer plays the instrument on screen: the Guitar view is
 * always the guitar, and the Piano view is the synth under Synth and the piano
 * otherwise, Guitar included (AC-2.13.3).
 *
 * @param {{ composer: boolean, instrument?: 'guitar'|'piano', voice?: string }} where
 * @returns {'piano'|'synth'|'guitar'}
 */
export function resolveVoice({ composer, instrument, voice }) {
  const chosen = normaliseVoice(voice);
  if (!composer) return chosen;
  if (instrument === 'guitar') return 'guitar';
  return chosen === 'synth' ? 'synth' : 'piano';
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
