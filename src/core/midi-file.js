/**
 * MIDI import, the arithmetic of it (US-12.4, research.md D-027): reading a
 * Standard MIDI File and turning it into a Melodic Pattern. The conversion is
 * `contracts/file-formats.md` §2 — the export table — read backwards, so a
 * Pattern exported and imported again is the same Pattern (AC-12.4.4/4).
 *
 * Pure: bytes in, a Pattern out. Reading the file off the disk is `main.js`'s.
 */
import { KEYS, keySemitones, BASE_MIDI, BASE_OCTAVE, clampOctave } from './pitch.js';
import { isSupported, beatCount, beatNoteValue } from './meter.js';
import { slotCount } from './recipes.js';
import { MAX_MEASURES, MIN_TEMPO, MAX_TEMPO, validate } from './pattern.js';
import { defaultAccent } from './accents.js';

/** Every Beat of an import is Straight 16ths (AC-12.4.2/1); the Recipe is offered on both Beat values. */
export const IMPORT_RECIPE = 'straight-16ths';

const DEFAULT_TIME_SIGNATURE = '4/4';
const DEFAULT_TEMPO = 120;
const DRUM_CHANNEL = 9;

/** Chromatic degree tokens, semitone by semitone above the tonic (AC-12.4.4/2). */
const CHROMATIC_DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];

/**
 * Velocity to the Accent Level whose export velocity — 48, 80, 112 — is nearest
 * (AC-12.4.3): the midpoints are 64 and 96.
 */
export function accentForVelocity(velocity) {
  if (velocity <= 0) return 0;
  if (velocity < 64) return 1;
  if (velocity < 96) return 2;
  return 3;
}

/**
 * The degree and octave that `pitch.resolve` turns back into `midiNote` in `key`,
 * the octave held inside the stepper's range (AC-12.4.4/2, /3).
 */
export function pitchForMidiNote(midiNote, key) {
  const semis = midiNote - BASE_MIDI - keySemitones(key);
  const degree = CHROMATIC_DEGREES[((semis % 12) + 12) % 12];
  const octaveOffset = clampOctave(BASE_OCTAVE + Math.floor(semis / 12)) - BASE_OCTAVE;
  return { degree, octaveOffset };
}

/**
 * A key signature's tonic and scale: a major one is Ionian on the major tonic,
 * a minor one Aeolian on the relative minor (AC-12.4.4/1).
 */
export function keyForSignature(sharpsOrFlats, minor) {
  const major = (((sharpsOrFlats * 7) % 12) + 12) % 12;
  const tonic = minor ? (major + 9) % 12 : major;
  return { key: KEYS[tonic], scale: minor ? 'aeolian' : 'ionian' };
}

/**
 * The 16th-note syllable nearest a position measured in 16ths: a tie goes to the
 * earlier (AC-12.4.2/2).
 */
export function nearestSixteenth(positionInSixteenths) {
  return Math.max(0, Math.ceil(positionInSixteenths - 0.5));
}

/* --- the file ----------------------------------------------------------------- */

class MidiReadError extends Error {}

function readChunks(bytes) {
  const chunks = [];
  let i = 0;
  while (i + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const length = ((bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7]) >>> 0;
    chunks.push({ id, data: bytes.subarray(i + 8, Math.min(bytes.length, i + 8 + length)) });
    i += 8 + length;
  }
  return chunks;
}

function readVariableLength(data, at) {
  let value = 0;
  let i = at;
  for (;;) {
    if (i >= data.length) throw new MidiReadError('truncated');
    const byte = data[i++];
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return [value, i];
  }
}

const latin1 = (data) => String.fromCharCode(...data);

/**
 * Read one track into its events, each at an absolute tick. Running status is
 * honoured; a track that ends mid-event keeps what it had.
 */
function readTrack(data) {
  const events = [];
  let i = 0;
  let tick = 0;
  let status = 0;
  try {
    while (i < data.length) {
      let delta;
      [delta, i] = readVariableLength(data, i);
      tick += delta;
      const byte = data[i];
      if (byte === undefined) break;
      if (byte & 0x80) {
        status = byte;
        i++;
      }
      if (status === 0xff) {
        const type = data[i++];
        let length;
        [length, i] = readVariableLength(data, i);
        const body = data.subarray(i, i + length);
        i += length;
        events.push({ tick, meta: type, body });
        if (type === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) {
        let length;
        [length, i] = readVariableLength(data, i);
        i += length;
      } else {
        const kind = status & 0xf0;
        const channel = status & 0x0f;
        const twoBytes = kind !== 0xc0 && kind !== 0xd0;
        const a = data[i++];
        const b = twoBytes ? data[i++] : 0;
        if (kind === 0x90 && b > 0) events.push({ tick, noteOn: a & 0x7f, velocity: b & 0x7f, channel });
        else if (kind === 0x90 || kind === 0x80) events.push({ tick, noteOff: a & 0x7f, channel });
      }
    }
  } catch (e) {
    if (!(e instanceof MidiReadError)) throw e;
  }
  return events;
}

/**
 * A Standard MIDI File, formats 0 and 1, as its header and its tracks' events
 * (AC-12.4.6/1). Returns null for anything that is not one.
 */
export function readMidiFile(bytes) {
  if (!bytes || bytes.length < 14) return null;
  const chunks = readChunks(bytes);
  const header = chunks[0];
  if (!header || header.id !== 'MThd' || header.data.length < 6) return null;
  const format = (header.data[0] << 8) | header.data[1];
  const division = (header.data[4] << 8) | header.data[5];
  if (format > 2 || division & 0x8000 || division === 0) return null;
  const tracks = chunks.filter((c) => c.id === 'MTrk').map((c) => readTrack(c.data));
  if (tracks.length === 0) return null;
  return { format, division, tracks };
}

/* --- the Pattern ---------------------------------------------------------------- */

const tempoOf = (body) => 60e6 / ((body[0] << 16) | (body[1] << 8) | body[2]);
const signed = (byte) => (byte > 127 ? byte - 256 : byte);

/**
 * Turn a `.mid` file into a Melodic Pattern (US-12.4).
 *
 * @param {Uint8Array} bytes
 * @param {{fileName?: string}} [options]
 * @returns {{ok: true, pattern: object, name: string, droppedMeasures: number} | {ok: false, error: string}}
 */
export function patternFromMidi(bytes, { fileName = '' } = {}) {
  const file = readMidiFile(bytes);
  if (!file) return { ok: false, error: 'This file is not a MIDI file, so there is nothing to import.' };

  const notes = [];
  const meters = [];
  let tempoEvent = null;
  let keySignature = null;
  let sequenceName = null;
  let firstNamedTrack = null;
  file.tracks.forEach((events, trackIndex) => {
    let trackName = null;
    let trackHasNotes = false;
    for (const e of events) {
      if (e.noteOn !== undefined) {
        if (e.channel === DRUM_CHANNEL) continue;
        notes.push({ tick: e.tick, note: e.noteOn, velocity: e.velocity, order: notes.length });
        trackHasNotes = true;
      } else if (e.meta === 0x51 && e.body.length >= 3) {
        if (!tempoEvent || e.tick < tempoEvent.tick) tempoEvent = { tick: e.tick, bpm: tempoOf(e.body) };
      } else if (e.meta === 0x58 && e.body.length >= 2) {
        meters.push({ tick: e.tick, timeSignature: `${e.body[0]}/${2 ** e.body[1]}` });
      } else if (e.meta === 0x59 && e.body.length >= 2) {
        if (!keySignature || e.tick < keySignature.tick) keySignature = { tick: e.tick, sf: signed(e.body[0]), mi: e.body[1] };
      } else if (e.meta === 0x03) {
        const text = latin1(e.body).trim();
        if (!text) continue;
        if (trackName === null) trackName = text;
        if (trackIndex === 0 && sequenceName === null) sequenceName = text;
      }
    }
    if (trackHasNotes && trackName && firstNamedTrack === null) firstNamedTrack = trackName;
  });

  if (notes.length === 0) {
    return { ok: false, error: 'This MIDI file holds no notes off the drum channel, so there is nothing to import.' };
  }

  // Each note to its nearest 16th, measured from the file's start (AC-12.4.2/2).
  const sixteenth = file.division / 4;
  for (const n of notes) n.at = nearestSixteenth(n.tick / sixteenth);
  const lastAt = Math.max(...notes.map((n) => n.at));

  // Measures from the meter in force at each one's start, until the last note is
  // covered; the first 32 are built, the rest counted (AC-12.4.2/5, AC-12.4.6/4).
  meters.sort((a, b) => a.tick - b.tick);
  const measures = [];
  let startAt = 0;
  let totalMeasures = 0;
  while (startAt <= lastAt) {
    const startTick = startAt * sixteenth;
    let timeSignature = DEFAULT_TIME_SIGNATURE;
    for (const m of meters) if (m.tick <= startTick) timeSignature = m.timeSignature;
    if (!isSupported(timeSignature)) {
      return { ok: false, error: `This MIDI file is in ${timeSignature}, which is not a Time Signature the app offers.` };
    }
    const noteValue = beatNoteValue(timeSignature);
    const perBeat = slotCount(IMPORT_RECIPE, noteValue);
    const beats = beatCount(timeSignature);
    if (totalMeasures < MAX_MEASURES) {
      measures.push({
        timeSignature,
        startAt,
        perBeat,
        beats: Array.from({ length: beats }, () => ({
          recipe: IMPORT_RECIPE,
          slots: Array.from({ length: perBeat }, () => ({ on: false })),
        })),
      });
    }
    totalMeasures++;
    startAt += beats * perBeat;
  }
  const droppedMeasures = totalMeasures - measures.length;

  const { key, scale } = keySignature ? keyForSignature(keySignature.sf, keySignature.mi) : { key: 'C', scale: 'ionian' };

  // Highest note wins a shared syllable, its velocity with it (AC-12.4.2/4).
  const chosen = new Map();
  for (const n of notes) {
    const held = chosen.get(n.at);
    if (!held || n.note > held.note || (n.note === held.note && n.velocity > held.velocity)) chosen.set(n.at, n);
  }
  for (const n of chosen.values()) {
    const measure = measures.find((m) => n.at >= m.startAt && n.at < m.startAt + m.beats.length * m.perBeat);
    if (!measure) continue;
    const local = n.at - measure.startAt;
    const accent = accentForVelocity(n.velocity);
    if (accent === 0) continue;
    measure.beats[Math.floor(local / measure.perBeat)].slots[local % measure.perBeat] = {
      on: true,
      accent,
      pitch: pitchForMidiNote(n.note, key),
    };
  }

  const tempo = tempoEvent ? Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(tempoEvent.bpm))) : DEFAULT_TEMPO;
  const baseName = fileName.replace(/\.[^.]*$/, '').trim();
  const name = sequenceName ?? firstNamedTrack ?? (baseName || 'Imported MIDI');

  // A default Accent Level is computed, never stored (FR-003): only an Accent
  // the file's velocity puts off the default persists.
  for (const measure of measures) {
    measure.beats.forEach((beat, bi) =>
      beat.slots.forEach((slot, si) => {
        if (slot.on && slot.accent === defaultAccent(measure, bi, si)) delete slot.accent;
      })
    );
  }

  const pattern = {
    name,
    soundMode: 'melodic',
    tempo,
    tags: [],
    rating: 0,
    key,
    scale,
    measures: measures.map(({ timeSignature, beats }) => ({ timeSignature, beats })),
  };
  const checked = validate(pattern);
  if (!checked.valid) return { ok: false, error: `This MIDI file could not be imported: ${checked.errors[0]}.` };
  return { ok: true, pattern, name, droppedMeasures };
}
