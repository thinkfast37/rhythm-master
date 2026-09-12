/**
 * The scale catalogue and the chromatic strip it marks. US-2.5, AC-2.2.4.
 *
 * Adopted from the maintainer's fret-navigator project so the two tools agree
 * on names and formulas, extended with the three pentatonic modes it lacked —
 * the five pentatonic modes are one set of notes rotated five ways, and the
 * maintainer asked for all of them by name.
 *
 * A scale here is a *view*: it decides which chips the strip marks as in-scale
 * and how the tritone chip is spelled. It never participates in resolving a
 * Pitch to a sounding note — that stays (degree, octaveOffset, key) in
 * `core/pitch.js`, which is what keeps AC-2.5.5 structural.
 */

import { degreeSemitones } from './pitch.js';

/** The default spelling of each chromatic degree, semitone 0–11 above the tonic. */
const CHROMATIC_TOKENS = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];

/** The catalogue, in picker order, grouped by `category` (AC-2.5.1). */
export const SCALES = [
  { id: 'ionian', label: 'Ionian (Major)', category: 'Church Modes',
    degrees: ['1', '2', '3', '4', '5', '6', '7'] },
  { id: 'dorian', label: 'Dorian', category: 'Church Modes',
    degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'] },
  { id: 'phrygian', label: 'Phrygian', category: 'Church Modes',
    degrees: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'] },
  { id: 'lydian', label: 'Lydian', category: 'Church Modes',
    degrees: ['1', '2', '3', '#4', '5', '6', '7'] },
  { id: 'mixolydian', label: 'Mixolydian', category: 'Church Modes',
    degrees: ['1', '2', '3', '4', '5', '6', 'b7'] },
  { id: 'aeolian', label: 'Aeolian (Natural Minor)', category: 'Church Modes',
    degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
  { id: 'locrian', label: 'Locrian', category: 'Church Modes',
    degrees: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'] },

  { id: 'major-pentatonic', label: 'Major Pentatonic', category: 'Pentatonic',
    degrees: ['1', '2', '3', '5', '6'] },
  { id: 'suspended-pentatonic', label: 'Suspended Pentatonic', category: 'Pentatonic',
    degrees: ['1', '2', '4', '5', 'b7'] },
  { id: 'blues-minor-pentatonic', label: 'Blues Minor Pentatonic', category: 'Pentatonic',
    degrees: ['1', 'b3', '4', 'b6', 'b7'] },
  { id: 'blues-major-pentatonic', label: 'Blues Major Pentatonic', category: 'Pentatonic',
    degrees: ['1', '2', '4', '5', '6'] },
  { id: 'minor-pentatonic', label: 'Minor Pentatonic', category: 'Pentatonic',
    degrees: ['1', 'b3', '4', '5', 'b7'] },

  { id: 'minor-blues', label: 'Minor Blues', category: 'Blues',
    degrees: ['1', 'b3', '4', 'b5', '5', 'b7'] },
  { id: 'major-blues', label: 'Major Blues', category: 'Blues',
    degrees: ['1', '2', 'b3', '3', '5', '6'] },

  { id: 'harmonic-minor', label: 'Harmonic Minor', category: 'Other',
    degrees: ['1', '2', 'b3', '4', '5', 'b6', '7'] },
  { id: 'melodic-minor', label: 'Melodic Minor (ascending/jazz)', category: 'Other',
    degrees: ['1', '2', 'b3', '4', '5', '6', '7'] },
];

/** The default degree token for a semitone 0–11 above the tonic (US-2.6 bakes chord tones with it). */
export function chromaticToken(semitone) {
  return CHROMATIC_TOKENS[((semitone % 12) + 12) % 12];
}

/** A Melodic Pattern that carries no `scale` reads as this (AC-2.5.4/2). */
export const DEFAULT_SCALE = 'ionian';

export function isValidScale(id) {
  return SCALES.some((s) => s.id === id);
}

function getScale(id) {
  const scale = SCALES.find((s) => s.id === id);
  if (!scale) throw new Error(`Unknown scale: ${id}`);
  return scale;
}

/**
 * The twelve chips of the chromatic strip, marked against a scale.
 *
 * Each entry is `{ token, inScale }`, semitone 0–11 in order. An in-scale
 * semitone takes the scale's own spelling of it — so Locrian and the Blues
 * scales read `b5` where everything else reads `#4` (AC-2.5.3) — and the label,
 * the token armed, and the formula can never disagree, because they are one
 * string.
 */
export function chromaticStrip(scaleId = DEFAULT_SCALE) {
  const scale = getScale(scaleId);
  const bySemitone = new Map(scale.degrees.map((d) => [degreeSemitones(d), d]));
  return CHROMATIC_TOKENS.map((token, semitone) => ({
    token: bySemitone.get(semitone) ?? token,
    inScale: bySemitone.has(semitone),
  }));
}
