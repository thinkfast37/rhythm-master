/**
 * Percussive voices and the metronome click.
 *
 * Accent Level drives both amplitude and brightness, deterministically — never
 * randomised (AC-3.1.14). In Percussive mode the syllable name is a visual
 * mnemonic only; sonic identity comes entirely from accent.
 */

/** Fixed per level. Carried over from the predecessor's percussive design. */
const VOICE = {
  1: { frequency: 200, gain: 0.35 },
  2: { frequency: 370, gain: 0.6 },
  3: { frequency: 620, gain: 0.88 },
};

const DECAY_SECONDS = 0.1;

export function accentVoice(accent) {
  const voice = VOICE[accent];
  if (!voice) throw new Error(`No percussive voice for Accent Level ${accent}`);
  return voice;
}

/**
 * Schedule one percussive hit at an absolute audio-clock time.
 * Uniform decay across levels, so accents differ by weight rather than length.
 */
export function playPercussive(ctx, destination, accent, when) {
  const { frequency, gain } = accentVoice(accent);

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(frequency, when);

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, when);
  env.gain.exponentialRampToValueAtTime(0.0001, when + DECAY_SECONDS);

  osc.connect(env).connect(destination);
  osc.start(when);
  osc.stop(when + DECAY_SECONDS);
  return osc;
}

/**
 * The metronome click.
 *
 * Deliberately a short high sine well above the percussive voices' 200–620 Hz
 * range, so the reference pulse is never mistaken for Pattern content
 * (Constitution, Audio clarity).
 */
export function playClick(ctx, destination, { downbeat = false, when = 0 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(downbeat ? 1600 : 1200, when);

  const env = ctx.createGain();
  env.gain.setValueAtTime(downbeat ? 0.5 : 0.32, when);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);

  osc.connect(env).connect(destination);
  osc.start(when);
  osc.stop(when + 0.05);
  return osc;
}
