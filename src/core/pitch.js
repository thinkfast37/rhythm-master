/**
 * Scale degree + octave + Key → an absolute pitch. AC-2.2.x, AC-2.3.x.
 *
 * This is the single place the conversion exists. Audio playback and MIDI
 * export both call it, which is what makes SC-003 enforceable: a .mid file and
 * what you hear in the app cannot disagree, because there is only one
 * resolution path.
 *
 * A wrong octave is a correctness failure, not a tuning preference
 * (Constitution, Visual & Audio Clarity).
 */

/** Supported Keys, in menu order. */
export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Semitones above C for each Key's root. */
const KEY_SEMITONES = {
  C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5,
  Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11,
};

/**
 * Semitones above the tonic for each degree of the major scale. Degrees beyond
 * 7 continue upward by octave, so degree 9 is a ninth above the tonic — the
 * same note as degree 2 an octave up, which is how a musician writes it.
 */
const DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** The octave a Slot with octaveOffset 0 sounds in. Middle C is MIDI 60. */
const BASE_MIDI = 60;

const DEGREE_PATTERN = /^([b#]?)([1-9]\d*)$/;

export function isSupportedKey(key) {
  return Object.prototype.hasOwnProperty.call(KEY_SEMITONES, key);
}

/**
 * Semitones above the tonic for a degree token such as "1", "b3", "#4", "9".
 */
export function degreeSemitones(degree) {
  const m = DEGREE_PATTERN.exec(String(degree));
  if (!m) throw new Error(`Invalid scale degree: ${degree}`);
  const [, accidental, digits] = m;

  const n = Number(digits);
  const octaves = Math.floor((n - 1) / 7);
  const within = (n - 1) % 7;

  const alteration = accidental === 'b' ? -1 : accidental === '#' ? 1 : 0;
  return DEGREE_SEMITONES[within] + 12 * octaves + alteration;
}

/**
 * Resolve a Pitch against a Key.
 *
 * @param {{degree: string, octaveOffset: number}} pitch
 * @param {string} key
 * @returns {{midiNote: number, frequency: number}}
 */
export function resolve(pitch, key) {
  if (!isSupportedKey(key)) throw new Error(`Unsupported Key: ${key}`);
  if (!pitch || typeof pitch !== 'object') throw new Error('Pitch is required');

  const octaveOffset = pitch.octaveOffset ?? 0;
  if (!Number.isInteger(octaveOffset)) {
    throw new Error(`octaveOffset must be an integer, got ${octaveOffset}`);
  }

  const midiNote =
    BASE_MIDI + KEY_SEMITONES[key] + degreeSemitones(pitch.degree) + 12 * octaveOffset;

  return { midiNote, frequency: midiToFrequency(midiNote) };
}

/** Equal temperament, A4 = MIDI 69 = 440 Hz. */
export function midiToFrequency(midiNote) {
  return 440 * 2 ** ((midiNote - 69) / 12);
}
