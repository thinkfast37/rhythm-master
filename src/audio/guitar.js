/**
 * The Composer's guitar voice (US-19.7): the FluidR3_GM steel-string guitar
 * fret-navigator plays, through soundfont-player — the one sampled voice the
 * Constitution admits (3.7.0, research.md D-003 as amended, D-016).
 *
 * Loaded lazily, once per AudioContext, and only when asked — the Composer
 * asks on the first showing of its Guitar view, never on page load. Until the
 * instrument resolves, and whenever it has failed, every note goes to the
 * fallback voice handed in (the melodic synth), so loading never blocks and
 * failing never silences (AC-19.7.2). A failed load lets a later call retry.
 */
import Soundfont from 'soundfont-player';
import { ensureCompressor } from './nodes.js';
import { ACCENT_AMPS } from './voices.js';

export const INSTRUMENT_NAME = 'acoustic_guitar_steel';
export const SOUNDFONT = 'FluidR3_GM';

export const ATTRIBUTION = Object.freeze({
  text: 'Guitar samples: FluidR3_GM SoundFont by Frank Wen, served via gleitz/midi-js-soundfonts, licensed CC BY 3.0.',
  sourceUrl: 'https://github.com/gleitz/midi-js-soundfonts',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
});

/** Per-context load state: soundfont buffers are bound to the context that decoded them. */
let loads = new WeakMap();
/** The context most recently asked for, so `getStatus()` can answer without one. */
let current = null;
const listeners = new Set();
/** How many notes the sampled instrument has sounded — a test seam for AC-19.7.1/2. */
let sampledPlays = 0;

let loader = (ctx) =>
  Soundfont.instrument(ctx, INSTRUMENT_NAME, { soundfont: SOUNDFONT, destination: ensureCompressor(ctx) });

function entryFor(ctx) {
  let entry = loads.get(ctx);
  if (!entry) {
    entry = { status: 'idle', instrument: null, promise: null, error: null };
    loads.set(ctx, entry);
  }
  return entry;
}

function notify() {
  for (const fn of listeners) fn(getStatus());
}

/** `idle` until asked, then `loading`, `ready` or `error` (AC-19.7.2). */
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
 * Ask for the instrument. Idempotent while loading or ready; after a failure
 * only `retry` asks again.
 */
export function load(ctx) {
  current = ctx;
  const entry = entryFor(ctx);
  if (entry.status === 'ready') return Promise.resolve(entry.instrument);
  if (entry.status === 'loading' && entry.promise) return entry.promise;
  // A failure stands until Retry asks again (AC-19.7.2/2): opening another
  // rhythm or tapping the board must not hammer a CDN that just said no.
  if (entry.status === 'error') return Promise.reject(entry.error);
  entry.status = 'loading';
  entry.error = null;
  notify();
  // The executor runs synchronously, so the request is made inside the call
  // that asked for it — a gesture handler, when a tap is what asks — and a
  // loader that throws still lands in the catch below.
  entry.promise = new Promise((resolve) => resolve(loader(ctx)))
    .then((instrument) => {
      entry.instrument = instrument;
      entry.status = 'ready';
      entry.promise = null;
      notify();
      return instrument;
    })
    .catch((err) => {
      entry.instrument = null;
      entry.status = 'error';
      entry.error = err;
      entry.promise = null;
      notify();
      throw err;
    });
  // A load nobody awaits must not surface as an unhandled rejection; the
  // status carries the failure to the UI.
  entry.promise.catch(() => {});
  return entry.promise;
}

/** Retry after a failure (AC-19.7.2/2). */
export function retry(ctx = current) {
  if (!ctx) return Promise.resolve(null);
  const entry = entryFor(ctx);
  if (entry.status === 'error') entry.status = 'idle';
  return load(ctx).catch(() => null);
}

/**
 * Sound one guitar note at an absolute audio-clock time, the same signature as
 * `playMelodic` so the scheduler can hold either. Through the samples when
 * they are ready; through `fallback` otherwise — and a context that has never
 * been asked is asked now, so a tap on the board is what starts the load if
 * the view's own request has not (AC-19.7.1/1 keeps that request to the
 * Guitar view: nothing else calls this).
 */
export function playGuitar(ctx, destination, event, when, fallback) {
  current = ctx;
  const entry = entryFor(ctx);
  if (entry.status === 'ready' && entry.instrument) {
    const gain = ACCENT_AMPS[event.accent] ?? ACCENT_AMPS[2];
    entry.instrument.play(event.pitch.midiNote, when, { gain });
    sampledPlays += 1;
    return 'sampled';
  }
  if (entry.status === 'idle') load(ctx).catch(() => {});
  fallback?.(ctx, destination, event, when);
  return 'fallback';
}

/**
 * The guitar on a context of the caller's own — the screen-off render's
 * OfflineAudioContext (AC-2.13.5/2). It plays the live instrument's decoded
 * buffers, keyed by MIDI note: an AudioBuffer is not bound to the context that
 * decoded it, so the render needs no second request to the CDN, which would
 * break AC-19.7.1/1's "once". Resolves null while the live context has no
 * instrument, and the render uses the synth. Touches no status.
 */
export async function prepare(ctx) {
  const live = current && loads.get(current);
  if (live?.status !== 'ready' || !live.instrument?.buffers) return null;
  const buffers = live.instrument.buffers;
  return {
    play(midiNote, when, { gain }) {
      const buffer = buffers[midiNote];
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const level = ctx.createGain();
      level.gain.setValueAtTime(gain, when);
      source.connect(level);
      level.connect(ensureCompressor(ctx));
      source.start(when);
    },
  };
}

/** One note on an instrument `prepare` returned, at the live voice's gain. */
export function playOn(instrument, event, when) {
  const gain = ACCENT_AMPS[event.accent] ?? ACCENT_AMPS[2];
  instrument.play(event.pitch.midiNote, when, { gain });
  return 'sampled';
}

/** Test seams. */
export function __setLoader(fn) {
  loader = fn;
}
export function __sampledPlays() {
  return sampledPlays;
}
export function __reset() {
  loads = new WeakMap();
  current = null;
  sampledPlays = 0;
  listeners.clear();
}
