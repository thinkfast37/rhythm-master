/**
 * The drum kit's sound (US-19.13): every drum synthesised in Web Audio from
 * the recipe `core/drums.js` gives its MIDI note. No asset, nothing to load —
 * a drum sounds at once (AC-19.13.1/2), which is also why there is no
 * fallback and no status here.
 *
 * A handful of recipes cover the kit: a pitch-swept sine for the kick and the
 * toms and skins; noise through a filter for the snare, the hats, the cymbals
 * and the shakers; a pair of detuned squares for anything struck metal. Each
 * routes itself through the shared compressor, dry, as the percussive voice
 * does. A drum's level is its Accent Level's, scaled by its part's volume
 * (AC-19.13.1/4).
 */
import { ensureCompressor } from './nodes.js';
import { ACCENT_AMPS } from './voices.js';
import { drumFor, closesHat, OPEN_HAT } from '../core/drums.js';

/** One second of white noise per context, made once and shared by every noisy drum. */
const noises = new WeakMap();
function noiseBuffer(ctx) {
  let buffer = noises.get(ctx);
  if (!buffer) {
    const length = Math.max(1, Math.floor(ctx.sampleRate ?? 44100));
    buffer = ctx.createBuffer(1, length, ctx.sampleRate ?? 44100);
    const data = buffer.getChannelData?.(0);
    // A fixed sequence, so every render of a drum is the same drum.
    let seed = 22222;
    for (let i = 0; data && i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    noises.set(ctx, buffer);
  }
  return buffer;
}

/** The open hats still ringing, by context and by part, so a closed one can cut them off. */
const ringing = new WeakMap();
function hatsOf(ctx) {
  let lines = ringing.get(ctx);
  if (!lines) {
    lines = new Map();
    ringing.set(ctx, lines);
  }
  return lines;
}

/** Which part a note belongs to: a tap, the part on screen, or a layer. */
const lineOf = (event) => (event.tap ? 'tap' : (event.layer ?? 'own'));

/** A gain shaped as a strike: up at once, then down to silence over `decay`. */
function strike(ctx, when, peak, decay, attack = 0.002) {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.linearRampToValueAtTime(peak, when + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  env.connect(ensureCompressor(ctx));
  return env;
}

function tone(ctx, when, { type = 'sine', hz, to = hz, sweep = 0.08, stop }, out) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, when);
  if (to !== hz) osc.frequency.exponentialRampToValueAtTime(to, when + sweep);
  osc.connect(out);
  osc.start(when);
  osc.stop(when + stop);
  return osc;
}

function noise(ctx, when, { type, hz, q = 0.8, stop }, out) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(hz, when);
  filter.Q.value = q;
  source.connect(filter);
  filter.connect(out);
  source.start(when);
  source.stop(when + stop);
  return source;
}

const RECIPES = {
  kick(ctx, when, level, d) {
    const env = strike(ctx, when, level, d.decay);
    tone(ctx, when, { hz: d.hz, to: d.to, sweep: 0.1, stop: d.decay + 0.05 }, env);
    return env;
  },
  tom(ctx, when, level, d) {
    const env = strike(ctx, when, level * 0.9, d.decay);
    tone(ctx, when, { hz: d.hz * 1.5, to: d.hz, sweep: 0.06, stop: d.decay + 0.05 }, env);
    return env;
  },
  skin(ctx, when, level, d) {
    const env = strike(ctx, when, level * 0.8, d.decay);
    tone(ctx, when, { type: 'triangle', hz: d.hz * 1.25, to: d.hz, sweep: 0.03, stop: d.decay + 0.05 }, env);
    return env;
  },
  snare(ctx, when, level, d) {
    const body = strike(ctx, when, level * 0.55, d.decay * 0.6);
    tone(ctx, when, { type: 'triangle', hz: d.hz * 1.4, to: d.hz, sweep: 0.04, stop: d.decay + 0.05 }, body);
    const wires = strike(ctx, when, level * 0.75, d.decay);
    noise(ctx, when, { type: 'highpass', hz: d.tone, stop: d.decay + 0.05 }, wires);
    return wires;
  },
  clap(ctx, when, level, d) {
    // Three hands a few milliseconds apart, then the room.
    for (const offset of [0, 0.011, 0.023]) {
      const env = strike(ctx, when + offset, level * 0.6, offset === 0.023 ? d.decay : 0.012, 0.001);
      noise(ctx, when + offset, { type: 'bandpass', hz: d.tone, q: 1.4, stop: d.decay + 0.05 }, env);
    }
    return null;
  },
  hat(ctx, when, level, d) {
    const env = strike(ctx, when, level * 0.5, d.decay, 0.001);
    noise(ctx, when, { type: 'highpass', hz: d.tone, stop: d.decay + 0.05 }, env);
    return env;
  },
  cymbal(ctx, when, level, d) {
    const env = strike(ctx, when, level * 0.45, d.decay, 0.003);
    noise(ctx, when, { type: 'highpass', hz: d.tone, stop: d.decay + 0.05 }, env);
    // A ride has a stick on it: a short metallic ping over the wash.
    if (d.ping) RECIPES.bell(ctx, when, level * 0.5, { hz: d.ping, decay: 0.12 });
    return env;
  },
  shaker(ctx, when, level, d) {
    const env = strike(ctx, when, level * 0.45, d.decay, 0.006);
    noise(ctx, when, { type: 'highpass', hz: d.tone, stop: d.decay + 0.05 }, env);
    return env;
  },
  rattle(ctx, when, level, d) {
    // Noise chopped by a slow square: a scrape, or a vibraslap's chatter.
    const env = strike(ctx, when, level * 0.45, d.decay, 0.004);
    const chop = ctx.createGain();
    chop.gain.setValueAtTime(0.5, when);
    tone(ctx, when, { type: 'square', hz: 38, stop: d.decay + 0.05 }, chop.gain);
    chop.connect(env);
    noise(ctx, when, { type: 'bandpass', hz: d.tone, q: 1.2, stop: d.decay + 0.05 }, chop);
    return env;
  },
  bell(ctx, when, level, d) {
    const env = strike(ctx, when, level * 0.3, d.decay, 0.001);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(d.hz * 1.2, when);
    filter.Q.value = 1.5;
    filter.connect(env);
    // Two squares a fifth-and-a-bit apart: the inharmonic pair that reads as struck metal.
    tone(ctx, when, { type: 'square', hz: d.hz, stop: d.decay + 0.05 }, filter);
    tone(ctx, when, { type: 'square', hz: d.hz * 1.48, stop: d.decay + 0.05 }, filter);
    return env;
  },
  click(ctx, when, level, d) {
    const env = strike(ctx, when, level * 0.6, d.decay, 0.001);
    tone(ctx, when, { type: 'triangle', hz: d.hz, stop: d.decay + 0.05 }, env);
    return env;
  },
  whistle(ctx, when, level, d) {
    const env = strike(ctx, when, level * 0.3, d.decay, 0.01);
    tone(ctx, when, { hz: d.hz, to: d.hz * 1.04, sweep: d.decay, stop: d.decay + 0.05 }, env);
    return env;
  },
};

/**
 * Sound one drum at an absolute audio-clock time, the same signature as
 * `playMelodic`. A note the kit has no drum for is silent (AC-19.13.1/3).
 *
 * @param {AudioContext} ctx
 * @param {AudioNode} _destination  unused: every drum routes itself through the shared bus
 * @param {{accent: 1|2|3, gain?: number, pitch: {midiNote: number}}} event
 * @param {number} when
 * @returns {'drum'|'silent'}
 */
export function playDrum(ctx, _destination, event, when) {
  const midi = event.pitch?.midiNote;
  const d = drumFor(midi);
  if (!d) return 'silent';
  const level = (ACCENT_AMPS[event.accent] ?? ACCENT_AMPS[2]) * (event.gain ?? 1);
  const hats = hatsOf(ctx);
  const line = lineOf(event);
  // The pedal closes the hat: an open one still ringing in this part stops here (AC-19.13.1/4).
  if (closesHat(midi) || midi === OPEN_HAT) {
    const open = hats.get(line);
    if (open && open.when <= when && open.until > when) {
      if (typeof open.env.gain.cancelAndHoldAtTime === 'function') open.env.gain.cancelAndHoldAtTime(when);
      else open.env.gain.cancelScheduledValues(when);
      open.env.gain.setTargetAtTime(0.0001, when, 0.008);
    }
    hats.delete(line);
  }
  const env = RECIPES[d.kind](ctx, when, level, d);
  if (midi === OPEN_HAT && env) hats.set(line, { env, when, until: when + d.decay });
  return 'drum';
}
