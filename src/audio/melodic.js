/**
 * Melodic voice, ported from the predecessor's engine.
 *
 * The full quality chain, unchanged from the app the maintainer practises with:
 *   3× detuned sine oscillators (chorus)
 *     → shared gain envelope, shaped per Accent Level
 *     → low-pass filter sweeping 2000 Hz → 600 Hz over the decay
 *     → dry path (compressor) + wet send (shared reverb → compressor)
 *
 * Accent changes the envelope shape and decay length, never the pitch
 * (AC-3.1.15). Pitch arrives already resolved by core/pitch.js — the same
 * resolution MIDI export uses, so the two cannot disagree.
 *
 * This replaces an earlier sampled-piano implementation. See US-2.4.
 */
import { ensureCompressor, ensureReverb } from './nodes.js';

/**
 * Envelope per Accent Level. The Medium shape has an extra sustain step, which
 * is what stops it reading as a quiet Strong rather than its own dynamic.
 */
const ENVELOPES = {
  3: { peak: 0.88, attack: 0.01, decay: 0.55, sustain: null },
  2: { peak: 0.65, attack: 0.005, decay: 0.32, sustain: { level: 0.5, at: 0.025 } },
  1: { peak: 0.1, attack: 0.012, decay: 0.18, sustain: null },
};

/** Gain is divided across the chorus voices so 3 oscillators ≈ one in loudness. */
const CHORUS_DETUNE = [0, 5, -5];

/** Melodic playback needs no assets, so it is always ready. */
export function getStatus() {
  return { status: 'ready', error: null };
}

export function load() {
  return Promise.resolve(getStatus());
}

/** Exposed for the accent-mapping test (AC-3.1.15). */
export const DYNAMICS = {
  1: { gain: ENVELOPES[1].peak, decay: ENVELOPES[1].decay },
  2: { gain: ENVELOPES[2].peak, decay: ENVELOPES[2].decay },
  3: { gain: ENVELOPES[3].peak, decay: ENVELOPES[3].decay },
};

/**
 * Schedule one melodic note at an absolute audio-clock time.
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} _destination  unused: the chain routes itself through the shared bus
 * @param {{accent: 1|2|3, pitch: {frequency: number}}} event
 * @param {number} when
 */
export function playMelodic(ctx, _destination, event, when) {
  const compressor = ensureCompressor(ctx);
  const reverb = ensureReverb(ctx);
  const env = ENVELOPES[event.accent] ?? ENVELOPES[1];
  const frequency = event.pitch.frequency;
  const voices = CHORUS_DETUNE.length;

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.001, when);
  gainNode.gain.linearRampToValueAtTime(env.peak / voices, when + env.attack);
  if (env.sustain) {
    gainNode.gain.exponentialRampToValueAtTime(env.sustain.level / voices, when + env.sustain.at);
  }
  gainNode.gain.exponentialRampToValueAtTime(0.001, when + env.decay);

  // Bright at the attack, darkening through the decay — the classic pad shape.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, when);
  filter.frequency.exponentialRampToValueAtTime(600, when + env.decay);
  filter.Q.value = 0.5;

  gainNode.connect(filter);
  filter.connect(compressor); // dry
  filter.connect(reverb); // wet send

  for (const detune of CHORUS_DETUNE) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, when);
    // A slight downward drift over the decay; keeps a sustained note from
    // sounding mechanically static.
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.97, when + env.decay);
    osc.detune.value = detune;
    osc.connect(gainNode);
    osc.start(when);
    osc.stop(when + env.decay + 0.01);
  }
}

export function __reset() {}
