/**
 * A fetched voice: one FluidR3_GM instrument through soundfont-player — the
 * steel-string guitar fret-navigator plays (US-19.7), and the electric guitar,
 * bass, saxophone and trumpet of US-19.12. The sampled voices the Constitution
 * admits beside the bundled piano (3.7.0, 3.10.0; research.md D-003, D-028).
 *
 * `createSoundfontVoice(name)` makes one voice with its own load state, so one
 * instrument failing to load silences no other. Each is loaded lazily, once
 * per AudioContext, and only when asked — never on page load. Until the
 * instrument resolves, and whenever it has failed, every note goes to the
 * fallback voice handed in (the melodic synth), so loading never blocks and
 * failing never silences (AC-19.7.2, AC-19.12.5/2). A failed load lets a later
 * call retry.
 *
 * A `held` voice stops a part's note when that part's next note begins
 * (AC-19.12.5/3): a sampled sax note is seconds long, and a line of them left
 * to ring is a cluster no saxophone can make.
 */
import Soundfont from 'soundfont-player';
import { ensureCompressor } from './nodes.js';
import { ACCENT_AMPS } from './voices.js';

export const SOUNDFONT = 'FluidR3_GM';

export const ATTRIBUTION = Object.freeze({
  text: 'Guitar, bass, saxophone, trumpet and flute samples: FluidR3_GM SoundFont by Frank Wen, served via gleitz/midi-js-soundfonts, licensed CC BY 3.0.',
  sourceUrl: 'https://github.com/gleitz/midi-js-soundfonts',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
});

/** How quickly a held note lets go when the next begins, in seconds. */
const RELEASE_SECONDS = 0.06;

/** A note's level: its Accent Level's, scaled by its part's volume (AC-19.12.3/3). */
function levelOf(event) {
  return (ACCENT_AMPS[event.accent] ?? ACCENT_AMPS[2]) * (event.gain ?? 1);
}

/** Which line a note belongs to, for holding: a tap, the part on screen, or a layer. */
function lineOf(event) {
  if (event.tap) return 'tap';
  return event.layer ?? 'own';
}

/**
 * @param {string} name  the FluidR3_GM instrument, e.g. `alto_sax`
 * @param {{ held?: boolean }} [options]
 */
export function createSoundfontVoice(name, { held = false } = {}) {
  /** Per-context load state: soundfont buffers are bound to the context that decoded them. */
  let loads = new WeakMap();
  /** The context most recently asked for, so `getStatus()` can answer without one. */
  let current = null;
  const listeners = new Set();
  /** How many notes the sampled instrument has sounded — a test seam for AC-19.7.1/2. */
  let sampledPlays = 0;

  let loader = (ctx) => Soundfont.instrument(ctx, name, { soundfont: SOUNDFONT, destination: ensureCompressor(ctx) });

  function entryFor(ctx) {
    let entry = loads.get(ctx);
    if (!entry) {
      entry = { status: 'idle', instrument: null, promise: null, error: null, lines: new Map() };
      loads.set(ctx, entry);
    }
    return entry;
  }

  /** `idle` until asked, then `loading`, `ready` or `error` (AC-19.7.2). */
  function getStatus(ctx = current) {
    if (!ctx) return { status: 'idle', error: null };
    const entry = entryFor(ctx);
    return { status: entry.status, error: entry.error };
  }

  function notify() {
    for (const fn of listeners) fn(getStatus());
  }

  function onStatus(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /**
   * Ask for the instrument. Idempotent while loading or ready; after a failure
   * only `retry` asks again.
   */
  function load(ctx) {
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
  function retry(ctx = current) {
    if (!ctx) return Promise.resolve(null);
    const entry = entryFor(ctx);
    if (entry.status === 'error') entry.status = 'idle';
    return load(ctx).catch(() => null);
  }

  /**
   * A held voice lets go of the line's last note as this one begins. A note
   * scheduled later than this one is left alone: a tap never cuts off a note
   * the transport has queued ahead of it.
   */
  function hold(lines, event, when, node, stop) {
    if (!held) return;
    const line = lineOf(event);
    const previous = lines.get(line);
    if (previous && previous.when <= when) stop(previous.node);
    lines.set(line, { node, when });
  }

  /**
   * Sound one note at an absolute audio-clock time, the same signature as
   * `playMelodic` so the scheduler can hold either. Through the samples when
   * they are ready; through `fallback` otherwise — and a context that has
   * never been asked is asked now, so the first note is what starts the load
   * if nothing else has.
   */
  function play(ctx, destination, event, when, fallback) {
    current = ctx;
    const entry = entryFor(ctx);
    if (entry.status === 'ready' && entry.instrument) {
      const node = entry.instrument.play(event.pitch.midiNote, when, { gain: levelOf(event) });
      hold(entry.lines, event, when, node, (n) => n?.stop?.(when));
      sampledPlays += 1;
      return 'sampled';
    }
    if (entry.status === 'idle') load(ctx).catch(() => {});
    fallback?.(ctx, destination, event, when);
    return 'fallback';
  }

  /**
   * The instrument on a context of the caller's own — the screen-off render's
   * OfflineAudioContext (AC-2.13.5/2, AC-19.12.5/4). It plays the live
   * instrument's decoded buffers, keyed by MIDI note: an AudioBuffer is not
   * bound to the context that decoded it, so the render needs no second
   * request to the CDN, which would break AC-19.7.1/1's "once". Resolves null
   * while the live context has no instrument, and the render uses the synth.
   * Touches no status.
   */
  async function prepare(ctx) {
    const live = current && loads.get(current);
    if (live?.status !== 'ready' || !live.instrument?.buffers) return null;
    const buffers = live.instrument.buffers;
    const lines = new Map();
    return {
      play(midiNote, when, { gain, event = {} }) {
        const buffer = buffers[midiNote];
        if (!buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const level = ctx.createGain();
        level.gain.setValueAtTime(gain, when);
        source.connect(level);
        level.connect(ensureCompressor(ctx));
        source.start(when);
        hold(lines, event, when, { source, level }, (n) => {
          n.level.gain.setTargetAtTime(0.0001, when, RELEASE_SECONDS / 3);
          n.source.stop(when + RELEASE_SECONDS * 2);
        });
      },
    };
  }

  /** One note on an instrument `prepare` returned, at the live voice's level. */
  function playOn(instrument, event, when) {
    instrument.play(event.pitch.midiNote, when, { gain: levelOf(event), event });
    return 'sampled';
  }

  return {
    name,
    held,
    getStatus,
    onStatus,
    load,
    retry,
    play,
    prepare,
    playOn,
    /** Test seams: a stub loader, the count of sampled notes, and a clean slate. */
    seams: {
      setLoader(fn) {
        loader = fn;
      },
      sampledPlays: () => sampledPlays,
      reset() {
        loads = new WeakMap();
        current = null;
        sampledPlays = 0;
        listeners.clear();
      },
    },
  };
}
