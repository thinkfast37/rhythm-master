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
export const BASE_MIDI = 60;

/**
 * Two ways of naming the same thing. A Pattern stores `octaveOffset`, an integer
 * relative to the base octave; a musician reads an absolute octave number. The
 * base octave is 4, so degree 1 in C at offset 0 is middle C (AC-2.2.3).
 *
 * Only the display side clamps. Stored data is not re-ranged by this — a Pattern
 * carrying an offset outside the strip's span still resolves (data-model §4).
 */
export const BASE_OCTAVE = 4;
export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 7;

const DEGREE_PATTERN = /^([b#]?)([1-9]\d*)$/;

/** Split a degree token into its accidental and its number: "b3" -> ["b", "3"]. */
export function splitDegree(degree) {
  const m = DEGREE_PATTERN.exec(String(degree));
  if (!m) throw new Error(`Invalid scale degree: ${degree}`);
  return [m[1], m[2]];
}

/** The absolute octave a stored offset sounds in. */
export function octaveNumber(octaveOffset = 0) {
  return BASE_OCTAVE + octaveOffset;
}

/** The offset to store for an absolute octave the musician chose. */
export function octaveOffsetFor(octave) {
  return octave - BASE_OCTAVE;
}

/**
 * Stepping past either end holds at that end rather than wrapping (AC-2.2.3) —
 * a stepper that wraps from 7 to 1 moves the note six octaves on what reads as
 * a one-step nudge.
 */
export function clampOctave(octave) {
  return Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave));
}

export function isSupportedKey(key) {
  return Object.prototype.hasOwnProperty.call(KEY_SEMITONES, key);
}

/** Semitones above C of a Key's tonic — shared with chord resolution (US-2.6). */
export function keySemitones(key) {
  if (!isSupportedKey(key)) throw new Error(`Unsupported Key: ${key}`);
  return KEY_SEMITONES[key];
}

/**
 * Semitones above the tonic for a degree token such as "1", "b3", "#4", "9".
 */
export function degreeSemitones(degree) {
  const [accidental, digits] = splitDegree(degree);

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

/* --- naming a Pitch (AC-2.2.15, AC-2.2.16) -------------------------------- */

/** The seven letters, in scale order, and the pitch class each names naturally. */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** How many semitones each accidental glyph shifts its letter. */
const ACCIDENTAL_ALTERATION = { bb: -2, b: -1, '': 0, '#': 1, '##': 2 };
const ALTERATION_GLYPH = Object.fromEntries(
  Object.entries(ACCIDENTAL_ALTERATION).map(([glyph, n]) => [n, glyph])
);

/**
 * Name a Pitch as a musician would write it, resolved through a Key.
 *
 * Spelling is **diatonic**, not by pitch class: the letter comes from counting
 * degrees up the alphabet from the Key's own letter, and the accidental is
 * whatever reconciles that letter with the note actually sounding. So degree 3
 * in Db is `F` and `b3` is `Fb` — not `E`, which is the same key on a piano and
 * the wrong interval on a stave. Every degree gets its own letter, which is the
 * property that makes a scale readable.
 *
 * The octave follows the *letter*, not the sounding note, so `Cb5` is named for
 * the C it is a flattened form of even though it sounds a semitone below it.
 *
 * @param {{degree: string, octaveOffset: number}} pitch
 * @param {string} key
 * @returns {{letter: string, accidental: string, octave: number, text: string}}
 */
export function noteName(pitch, key) {
  const { midiNote } = resolve(pitch, key);
  const [, digits] = splitDegree(pitch.degree);
  // Count that many letters up from the Key's letter. Degree 1 is the Key's own
  // letter, degree 8 is it again an octave up, so the step is (n - 1) mod 7.
  return spellFromLetter(midiNote, letterAbove(key[0], Number(digits) - 1), `Degree ${pitch.degree} in ${key}`);
}

/** The letter `steps` letters up the alphabet from `letter`, wrapping. */
export function letterAbove(letter, steps) {
  return LETTERS[(((LETTERS.indexOf(letter) + steps) % 7) + 7) % 7];
}

/**
 * Spell a sounding note on a given letter — the diatonic half of `noteName`,
 * shared with chord-tone naming (US-2.6), where the letter comes from counting
 * up from the chord's root rather than from the Key.
 *
 * @param {number} midiNote
 * @param {string} letter  one of C D E F G A B
 * @param {string} [what]  for the error, when no accidental can reconcile them
 */
export function spellFromLetter(midiNote, letter, what = `MIDI ${midiNote}`) {
  // The accidental is the gap between what the letter names naturally and what
  // is actually sounding, centred so it comes out as a small +/- rather than a
  // number near 12.
  const alteration =
    (((midiNote % 12) - LETTER_SEMITONES[letter] + 18) % 12) - 6;
  const accidental = ALTERATION_GLYPH[alteration];
  if (accidental === undefined) {
    throw new Error(`${what} needs ${alteration} semitones of accidental to spell as ${letter}`);
  }

  // Scientific pitch notation, against this app's middle C = MIDI 60 = C4. The
  // alteration is removed first so the octave belongs to the letter: Cb5 sounds
  // as MIDI 71, which is B4's number, but it is a C and so an octave 5 note.
  const octave = Math.floor((midiNote - alteration) / 12) - 1;

  return { letter, accidental, octave, text: `${letter}${accidental}${octave}` };
}

/**
 * The degree token as a musician writes it, with a proper accidental glyph.
 * The stored token uses `b` and `#` because those are typeable; this is for
 * display only and never round-trips back into storage.
 */
export function degreeLabel(degree) {
  const [accidental, digits] = splitDegree(degree);
  return `${accidental === 'b' ? '♭' : accidental === '#' ? '♯' : ''}${digits}`;
}
