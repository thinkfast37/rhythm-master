/**
 * The piano voice (US-2.13): the Salamander Grand Piano recordings
 * fret-navigator plays, bundled in `public/audio/piano/` — one of the two
 * sampled voices the Constitution admits (3.9.0, research.md D-003 as amended).
 *
 * A note plays the nearest recording, re-pitched (`core/voice.pianoSampleFor`):
 *   AudioBufferSourceNode → gain (accent, hold, damper) → shared compressor
 *
 * Nothing is requested on page load. The first call that could sound the piano
 * asks for the whole set; each recording is fetched once and decoded per
 * context, since a buffer belongs to the context that decoded it. Until a
 * note's recording is decoded, the note goes to the fallback voice handed in
 * (the synth), so loading never blocks and failing never silences
 * (AC-2.13.4/2). A failed load stands until Retry asks again (AC-2.13.4/3).
 */
import { ensureCompressor } from './nodes.js';
import { ACCENT_AMPS } from './voices.js';
import {
  PIANO_SAMPLE_NOTES,
  PIANO_HOLD_SECONDS,
  PIANO_RELEASE_SECONDS,
  pianoSampleFile,
  pianoSampleFor,
} from '../core/voice.js';

export const ATTRIBUTION = Object.freeze({
  text: 'Piano samples: Salamander Grand Piano by Alexander Holm, licensed CC BY 3.0.',
  sourceUrl: 'https://github.com/sfzinstruments/SalamanderGrandPiano',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
});

/** Peak gain of a Strong note; Medium and Weak scale down by the percussive voice's ratios. */
export const VOLUME = 0.8;

/** Where the recordings are served from: the app's own origin, under its base (AC-2.13.4/1). */
export function sampleUrl(sampleMidi) {
  const base = import.meta.env?.BASE_URL ?? '/';
  return `${base}audio/piano/${pianoSampleFile(sampleMidi)}`;
}

/** sampleMidi → Promise<ArrayBuffer>, shared by every context. A failure is dropped so Retry refetches. */
let fetched = new Map();
/** Per context: decoded buffers, the pending decodes, load status, and the voice each key is sounding. */
let contexts = new WeakMap();
/** The live context most recently asked for, so `getStatus()` can answer without one. */
let current = null;
const listeners = new Set();
/** How many notes the recordings have sounded — a test seam for AC-2.13.2/1. */
let sampledPlays = 0;

let fetcher = (url) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`piano sample ${url}: HTTP ${response.status}`);
    return response.arrayBuffer();
  });

function fetchSample(sampleMidi) {
  if (!fetched.has(sampleMidi)) {
    const request = Promise.resolve().then(() => fetcher(sampleUrl(sampleMidi)));
    request.catch(() => fetched.delete(sampleMidi));
    fetched.set(sampleMidi, request);
  }
  return fetched.get(sampleMidi);
}

function entryFor(ctx) {
  let entry = contexts.get(ctx);
  if (!entry) {
    entry = { status: 'idle', error: null, promise: null, buffers: new Map(), pending: new Map(), sounding: new Map() };
    contexts.set(ctx, entry);
  }
  return entry;
}

function decode(ctx, entry, sampleMidi) {
  if (entry.buffers.has(sampleMidi)) return Promise.resolve(entry.buffers.get(sampleMidi));
  if (!entry.pending.has(sampleMidi)) {
    // decodeAudioData detaches its input, so each context decodes its own copy.
    const decoding = fetchSample(sampleMidi)
      .then((bytes) => ctx.decodeAudioData(bytes.slice(0)))
      .then((buffer) => {
        entry.buffers.set(sampleMidi, buffer);
        entry.pending.delete(sampleMidi);
        return buffer;
      });
    decoding.catch(() => entry.pending.delete(sampleMidi));
    entry.pending.set(sampleMidi, decoding);
  }
  return entry.pending.get(sampleMidi);
}

/** Every recording decoded on `ctx`; rejects if any fails. Touches no status. */
function decodeAll(ctx, entry) {
  return Promise.all(PIANO_SAMPLE_NOTES.map((s) => decode(ctx, entry, s)));
}

function notify() {
  for (const fn of listeners) fn(getStatus());
}

/** `idle` until asked, then `loading`, `ready` or `error` (AC-2.13.4). */
export function getStatus(ctx = current) {
  if (!ctx) return { status: 'idle', error: null };
  const entry = entryFor(ctx);
  return { status: entry.status, error: entry.error };
}

export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Ask for the recordings on the live context. Idempotent while loading or
 * ready; after a failure only `retry` asks again.
 */
export function load(ctx) {
  current = ctx;
  const entry = entryFor(ctx);
  if (entry.status === 'ready') return Promise.resolve(true);
  if (entry.status === 'loading' && entry.promise) return entry.promise;
  if (entry.status === 'error') return Promise.reject(entry.error);
  entry.status = 'loading';
  entry.error = null;
  notify();
  entry.promise = decodeAll(ctx, entry).then(
    () => {
      entry.status = 'ready';
      entry.promise = null;
      if (ctx === current) notify();
      return true;
    },
    (err) => {
      entry.status = 'error';
      entry.error = err;
      entry.promise = null;
      if (ctx === current) notify();
      throw err;
    }
  );
  // A load nobody awaits must not surface as an unhandled rejection; the status carries it.
  entry.promise.catch(() => {});
  return entry.promise;
}

/** Retry after a failure (AC-2.13.4/3). */
export function retry(ctx = current) {
  if (!ctx) return Promise.resolve(false);
  const entry = entryFor(ctx);
  if (entry.status === 'error') entry.status = 'idle';
  return load(ctx).catch(() => false);
}

/**
 * The recordings decoded on a context of the caller's own — the screen-off
 * render's OfflineAudioContext (AC-2.13.5/1). Only once the live context has
 * them all, so the bytes are already fetched and this only decodes; resolves
 * false otherwise, or if decoding fails, and the render uses the synth.
 */
export async function prepare(ctx) {
  if (getStatus().status !== 'ready') return false;
  try {
    await decodeAll(ctx, entryFor(ctx));
    return true;
  } catch {
    return false;
  }
}

/**
 * Sound one piano note at an absolute audio-clock time, the same signature as
 * `playMelodic` so the scheduler can hold either. Through the recording when
 * it is decoded on this context; through `fallback` otherwise — and a context
 * never asked is asked now (AC-2.13.4/1).
 */
export function playPiano(ctx, destination, event, when, fallback) {
  const entry = entryFor(ctx);
  const { sampleMidi, playbackRate } = pianoSampleFor(event.pitch.midiNote);
  const buffer = entry.buffers.get(sampleMidi);
  if (!buffer) {
    if (entry.status === 'idle') load(ctx).catch(() => {});
    fallback?.(ctx, destination, event, when);
    return 'fallback';
  }

  const accent = ACCENT_AMPS[event.accent] ? event.accent : 2;
  const peak = (VOLUME * ACCENT_AMPS[accent]) / ACCENT_AMPS[3];
  const hold = PIANO_HOLD_SECONDS[accent];
  const end = when + hold + PIANO_RELEASE_SECONDS;

  // A key struck again damps what it was sounding, as a piano's damper does,
  // so a repeated note at tempo is a repeated note rather than a smear.
  const key = event.pitch.midiNote;
  const previous = entry.sounding.get(key);
  if (previous && previous.end > when && previous.start <= when) {
    damp(previous.gain.gain, when);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, when);
  gain.gain.setValueAtTime(peak, when + hold);
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  source.connect(gain);
  gain.connect(ensureCompressor(ctx));
  source.start(when);
  source.stop(end + 0.05);
  entry.sounding.set(key, { gain, start: when, end });
  sampledPlays += 1;
  return 'sampled';
}

function damp(param, when) {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(when);
  else param.cancelScheduledValues(when);
  param.setTargetAtTime(0.0001, when, 0.02);
}

/** Test seams. */
export function __setFetcher(fn) {
  fetcher = fn;
}
export function __sampledPlays() {
  return sampledPlays;
}
export function __reset() {
  fetched = new Map();
  contexts = new WeakMap();
  current = null;
  sampledPlays = 0;
  listeners.clear();
}
