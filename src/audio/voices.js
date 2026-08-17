/**
 * Percussive voices and the metronome click, ported from the predecessor's
 * engine — the sound the maintainer actually practises against.
 *
 * Accent Level drives amplitude and pitch deterministically, never randomly
 * (AC-3.1.14). In Percussive mode the syllable name is a visual mnemonic only;
 * sonic identity is entirely accent-driven.
 */
import { ensureCompressor } from './nodes.js';

/** Amplitude per Accent Level, carried over unchanged from the predecessor. */
export const ACCENT_AMPS = { 1: 0.35, 2: 0.6, 3: 0.88 };

/** Base frequency per level. Higher and louder as the accent strengthens. */
const ACCENT_FREQUENCIES = { 1: 200, 2: 370, 3: 620 };

const DECAY_SECONDS = 0.1;

export function accentVoice(accent) {
  const gain = ACCENT_AMPS[accent];
  const frequency = ACCENT_FREQUENCIES[accent];
  if (gain === undefined) throw new Error(`No percussive voice for Accent Level ${accent}`);
  return { frequency, gain };
}

/**
 * One percussive hit at an absolute audio-clock time.
 *
 * A sine with a downward pitch bend to 0.85× over the decay — that bend is what
 * makes it read as a struck drum rather than a beep, and it is the single
 * biggest difference from a plain oscillator tone. Routed through the shared
 * compressor only: no chorus, filter, or reverb (AC-2.4.5).
 */
export function playPercussive(ctx, _destination, accent, when) {
  const compressor = ensureCompressor(ctx);
  const { frequency, gain: amp } = accentVoice(accent);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, when);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.85, when + DECAY_SECONDS);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.001, when);
  env.gain.linearRampToValueAtTime(amp, when + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, when + DECAY_SECONDS);

  osc.connect(env);
  env.connect(compressor);
  osc.start(when);
  osc.stop(when + DECAY_SECONDS + 0.01);
  return osc;
}

/**
 * The metronome click: a short square at 1100 Hz.
 *
 * Deliberately above the percussive voices' 200–620 Hz range and a different
 * waveform, so the reference pulse is never mistaken for Pattern content
 * (Constitution, Audio clarity).
 */
export function playClick(ctx, _destination, { downbeat = false, when = 0 } = {}) {
  const compressor = ensureCompressor(ctx);

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 1100;

  const env = ctx.createGain();
  env.gain.setValueAtTime(downbeat ? 0.3 : 0.22, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.025);

  osc.connect(env);
  env.connect(compressor);
  osc.start(when);
  osc.stop(when + 0.03);
  return osc;
}
