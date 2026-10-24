/**
 * MIDI input, the arithmetic of it (US-19.10, research.md D-019): what a MIDI
 * message says, whether the instrument view on screen has a place for a note,
 * which devices the Composer listens to, and what the device picker offers.
 * Pure — `src/midi/input.js` is the only module that touches Web MIDI.
 */
import { FRET_COUNT, STRING_COUNT, noteAt, isPlayable, clampRange, clampCapo } from './fretboard.js';
import { rangeFor, keyName, isValidKeyCount, DEFAULT_KEY_COUNT } from './piano.js';

/** The picker's value for "take notes from every device" (AC-19.10.4/2). */
export const ALL_DEVICES = 'all';

/**
 * A note-on, or null for anything else. A note-on at velocity 0 is a note-off
 * by the MIDI convention, and velocity is otherwise ignored (AC-19.10.1/3).
 * @param {ArrayLike<number>} data
 * @returns {{note: number, channel: number} | null}
 */
export function parseNoteOn(data) {
  if (!data || data.length < 3) return null;
  const status = data[0];
  if ((status & 0xf0) !== 0x90) return null;
  if (data[2] === 0) return null;
  return { note: data[1] & 0x7f, channel: status & 0x0f };
}

/** Every visible, playable fret that sounds `midi` (AC-19.10.2/2, AC-19.10.3/2). */
export function fretsFor(midi, capo = 0, range = [0, FRET_COUNT]) {
  const c = clampCapo(capo);
  const [lower, upper] = clampRange(range);
  const places = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    const fret = midi - noteAt(s, 0);
    if (fret < lower || fret > upper || !isPlayable(fret, c)) continue;
    places.push({ string: s, fret });
  }
  return places;
}

/**
 * Whether the instrument view on screen has a key or fret for `midi`, and if
 * not, what the record bar says (AC-19.10.3).
 * @param {number} midi
 * @param {{instrument: 'guitar'|'piano', capo?: number, range?: number[], count?: number}} view
 * @returns {{inRange: true} | {inRange: false, message: string}}
 */
export function placeFor(midi, view) {
  if (view.instrument === 'piano') {
    const count = isValidKeyCount(view.count) ? Number(view.count) : DEFAULT_KEY_COUNT;
    const { low, high } = rangeFor(count);
    if (midi >= low && midi <= high) return { inRange: true };
    return { inRange: false, message: `${keyName(midi)} — out of range for ${count} keys` };
  }
  if (fretsFor(midi, view.capo, view.range).length > 0) return { inRange: true };
  return { inRange: false, message: `${keyName(midi)} — not on the visible frets` };
}

/**
 * Whether a note from the device named `from` is taken (AC-19.10.4/2, /3):
 * from every device unless one is chosen and connected.
 * @param {{name: string}[]} devices the connected inputs
 */
export function acceptsFrom(devices, chosen, from) {
  if (!chosen || chosen === ALL_DEVICES) return true;
  if (!devices.some((d) => d.name === chosen)) return true;
  return from === chosen;
}

/**
 * What the device picker shows (AC-19.10.4, AC-19.10.5): its options, whether
 * it can be used, the value in force and the reason it cannot.
 * @param {'idle'|'pending'|'ready'|'unsupported'|'denied'} status
 * @param {{name: string}[]} devices
 * @param {string} chosen
 */
export function pickerFor(status, devices, chosen) {
  const fixed = (label, reason) => ({ disabled: true, options: [{ value: '', label }], value: '', reason });
  if (status === 'unsupported') return fixed('Not available', 'MIDI input needs Chrome, Edge or Firefox');
  if (status === 'denied') return fixed('Not allowed', 'MIDI access was not allowed');
  if (status !== 'ready') return fixed('Waiting for access…', 'Waiting for the browser to allow MIDI access');
  const names = [...new Set(devices.map((d) => d.name))];
  if (names.length === 0) return fixed('No device connected', 'Connect a MIDI device to play notes in');
  if (names.length === 1) return { ...fixed(names[0], `Notes from ${names[0]} are taken`), value: names[0], options: [{ value: names[0], label: names[0] }] };
  const value = names.includes(chosen) ? chosen : ALL_DEVICES;
  return {
    disabled: false,
    options: [{ value: ALL_DEVICES, label: 'All devices' }, ...names.map((n) => ({ value: n, label: n }))],
    value,
    reason: value === ALL_DEVICES ? 'Notes from every device are taken' : `Only notes from ${value} are taken`,
  };
}
