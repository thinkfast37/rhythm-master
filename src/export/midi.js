/**
 * MIDI export. US-12.1, contracts/file-formats.md §2.
 *
 * The exporter consumes `core/timeline.buildTimeline` — the identical event
 * list the scheduler plays. It does not re-derive timing, pitch, or accent.
 * That is what makes SC-003 enforceable: a divergence between the .mid and
 * playback would require two timelines, and there is only one.
 *
 * Format 0, single track, 480 ticks per quarter note.
 */
import { buildTimeline, loopDurationSeconds } from '../core/timeline.js';
import { beatDurationSeconds, beatCount } from '../core/meter.js';

export const TICKS_PER_QUARTER = 480;

/** Note-on velocity per Accent Level. */
export const VELOCITY = { 1: 48, 2: 80, 3: 112 };

/** Percussive Patterns export at one fixed pitch — the rhythm is the content. */
const PERCUSSIVE_NOTE = 37; // side stick

const NOTE_LENGTH_TICKS = 60;

function variableLength(value) {
  const bytes = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

const text = (s) => [...s].map((c) => c.charCodeAt(0) & 0x7f);

function chunk(id, data) {
  const len = data.length;
  return [...text(id), (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...data];
}

/**
 * Build a .mid for one loop pass of a Pattern.
 *
 * @returns {Uint8Array}
 */
export function buildMidi(pattern) {
  const events = buildTimeline(pattern);

  // Seconds are converted to ticks against the Pattern's own tempo, so swing
  // offsets survive the conversion rather than being quantised away.
  const secondsPerQuarter = 60 / pattern.tempo;
  const toTicks = (seconds) => Math.round((seconds / secondsPerQuarter) * TICKS_PER_QUARTER);

  /** @type {Array<{tick: number, bytes: number[]}>} */
  const timed = [];

  // Tempo, as microseconds per quarter note.
  const usPerQuarter = Math.round(secondsPerQuarter * 1e6);
  timed.push({
    tick: 0,
    bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff],
  });

  // A Time Signature meta event at every Measure boundary, since meter is
  // per-Measure in this app (US-1.1).
  let measureStart = 0;
  for (const measure of pattern.measures) {
    const [numerator, denominator] = measure.timeSignature.split('/').map(Number);
    timed.push({
      tick: toTicks(measureStart),
      bytes: [0xff, 0x58, 0x04, numerator, Math.log2(denominator), 24, 8],
    });
    measureStart +=
      beatCount(measure.timeSignature) * beatDurationSeconds(measure.timeSignature, pattern.tempo);
  }

  for (const event of events) {
    const note = event.pitch ? event.pitch.midiNote : PERCUSSIVE_NOTE;
    const velocity = VELOCITY[event.accent] ?? VELOCITY[1];
    const onTick = toTicks(event.timeSeconds);
    timed.push({ tick: onTick, bytes: [0x90, note & 0x7f, velocity] });
    timed.push({ tick: onTick + NOTE_LENGTH_TICKS, bytes: [0x80, note & 0x7f, 0] });
  }

  timed.sort((a, b) => a.tick - b.tick);

  const track = [];
  let previous = 0;
  for (const item of timed) {
    track.push(...variableLength(item.tick - previous), ...item.bytes);
    previous = item.tick;
  }
  // End of track, one loop length after the start so the file's duration is the
  // Pattern's, not merely the last note's.
  const endTick = Math.max(previous, toTicks(loopDurationSeconds(pattern)));
  track.push(...variableLength(endTick - previous), 0xff, 0x2f, 0x00);

  const header = chunk('MThd', [0, 0, 0, 1, (TICKS_PER_QUARTER >> 8) & 0xff, TICKS_PER_QUARTER & 0xff]);
  return new Uint8Array([...header, ...chunk('MTrk', track)]);
}

/** A filename-safe version of the Pattern's name. */
export function midiFilename(pattern) {
  const base = pattern.name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
  return `${base || 'pattern'}.mid`;
}

export function downloadMidi(pattern) {
  const blob = new Blob([buildMidi(pattern)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = midiFilename(pattern);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
