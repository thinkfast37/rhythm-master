/**
 * Sampled piano for Melodic playback. US-2.4.
 *
 * Constitution Principle III: sample loading MUST NOT block app usability.
 * Browsing, viewing, editing, and Percussive playback stay fully available
 * while this loads; only Melodic playback waits, and it shows a loading state
 * rather than failing silently (AC-2.4.3).
 *
 * Loading is lazy and gesture-triggered like everything else in audio/ — nothing
 * here runs at module load.
 */
import { midiToFrequency } from '../core/pitch.js';

/** Amplitude per Accent Level. Melodic accents differ in gain and decay, never in pitch (AC-3.1.15). */
export const DYNAMICS = {
  1: { gain: 0.3, decay: 0.9 },
  2: { gain: 0.55, decay: 1.1 },
  3: { gain: 0.85, decay: 1.4 },
};

const STATUS = { IDLE: 'idle', LOADING: 'loading', READY: 'ready', FALLBACK: 'fallback' };

let status = STATUS.IDLE;
let instrument = null;
let loadError = null;
const listeners = new Set();

export function getStatus() {
  return { status, error: loadError };
}

export function onStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(next, error = null) {
  status = next;
  loadError = error;
  for (const fn of listeners) fn(getStatus());
}

/**
 * Where the soundfont comes from. Overridable so the app can be pointed at a
 * self-hosted copy rather than a third party — see the note at the bottom of
 * this file.
 */
export let soundfontBaseUrl = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/';

export function setSoundfontBaseUrl(url) {
  soundfontBaseUrl = url;
}

/**
 * Begin loading. Safe to call repeatedly; concurrent calls share one load.
 * Returns when the instrument is ready OR has fallen back — never rejects, so a
 * missing soundfont degrades the sound rather than breaking playback.
 */
let inFlight = null;
export function load(ctx) {
  if (status === STATUS.READY || status === STATUS.FALLBACK) return Promise.resolve(getStatus());
  if (inFlight) return inFlight;

  setStatus(STATUS.LOADING);
  inFlight = import('soundfont-player')
    .then((mod) => {
      const Soundfont = mod.default ?? mod;
      return Soundfont.instrument(ctx, 'acoustic_grand_piano', {
        soundfont: 'MusyngKite',
        nameToUrl: (name) => `${soundfontBaseUrl}${name}-mp3.js`,
      });
    })
    .then((inst) => {
      instrument = inst;
      setStatus(STATUS.READY);
      return getStatus();
    })
    .catch((err) => {
      /*
       * A failed soundfont fetch must not silence Melodic mode entirely. Falling
       * back to a synthesised voice keeps every Pattern playable at the correct
       * pitch and octave — which is the correctness requirement (SC-003) — while
       * the status makes it visible that the piano is not what is sounding.
       */
      instrument = null;
      setStatus(STATUS.FALLBACK, err);
      return getStatus();
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Schedule one melodic note at an absolute audio-clock time.
 *
 * Pitch comes from the event, already resolved by core/pitch.js — the same
 * resolution MIDI export uses, so the two cannot disagree.
 */
export function playMelodic(ctx, destination, event, when) {
  const { gain, decay } = DYNAMICS[event.accent] ?? DYNAMICS[1];
  const { midiNote } = event.pitch;

  if (status === STATUS.READY && instrument) {
    instrument.play(midiNote, when, { gain, duration: decay, destination });
    return;
  }

  playSynthesised(ctx, destination, midiNote, gain, decay, when);
}

/**
 * The fallback voice. Two detuned triangle oscillators through a decaying
 * low-pass — piano-ish enough to practise against, and unambiguously the right
 * pitch.
 */
function playSynthesised(ctx, destination, midiNote, gain, decay, when) {
  const frequency = midiToFrequency(midiNote);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(gain, when + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, when + decay);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(8000, frequency * 8), when);
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, frequency * 2), when + decay);

  for (const detune of [-4, 4]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, when);
    osc.detune.setValueAtTime(detune, when);
    osc.connect(filter);
    osc.start(when);
    osc.stop(when + decay + 0.05);
  }

  filter.connect(env).connect(destination);
}

/** Test seam. */
export function __reset() {
  status = STATUS.IDLE;
  instrument = null;
  loadError = null;
  inFlight = null;
}

export { STATUS };

/*
 * DEPLOYMENT NOTE — the soundfont is fetched from a third-party CDN by default.
 *
 * research.md D-003 left "CDN versus committed asset" open, to be judged once
 * the real file size was known. It should be resolved before release: a runtime
 * dependency on someone else's host means the app's core Melodic feature breaks
 * when that host does, which sits badly with Principle V's static-artifact goal.
 * Self-hosting the MusyngKite acoustic_grand_piano files and pointing
 * `setSoundfontBaseUrl` at them removes the dependency.
 */
