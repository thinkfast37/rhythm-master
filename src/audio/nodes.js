/**
 * Shared audio nodes, ported from the predecessor's engine.
 *
 * One compressor catches stacked notes and stops clipping; one convolver
 * provides the melodic reverb tail. Both are created once per AudioContext and
 * shared by every voice, so concurrent notes cost nothing extra.
 */

/*
 * Cached per AudioContext, not globally. A node belongs to the context that
 * created it, and connecting across contexts throws — so if the context is ever
 * replaced (a hard suspend on iOS, or a test using an OfflineAudioContext), the
 * cached nodes must be rebuilt rather than reused.
 */
let owner = null;
let compressor = null;
let reverb = null;
let reverbWet = null;

function resetIfNewContext(ctx) {
  if (owner === ctx) return;
  owner = ctx;
  compressor = null;
  reverb = null;
  reverbWet = null;
}

/**
 * A stereo room impulse response, synthesised rather than loaded: a noise burst
 * with an exponential decay envelope gives a natural-enough tail and keeps the
 * app free of audio assets (Constitution Principle V).
 */
function buildReverbImpulse(ctx) {
  const length = Math.floor(ctx.sampleRate * 1.5); // 1.5s tail
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    }
  }
  return impulse;
}

/** The master bus. Every voice, both Modes, routes through this. Idempotent. */
export function ensureCompressor(ctx) {
  resetIfNewContext(ctx);
  if (compressor) return compressor;

  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 8;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;
  compressor.connect(ctx.destination);

  return compressor;
}

/**
 * The reverb send — melodic voices only, and built on first melodic note rather
 * than up front. A rhythm-only practice session never needs it, and the impulse
 * response is 1.5 seconds of synthesised stereo noise: not free to build.
 */
export function ensureReverb(ctx) {
  resetIfNewContext(ctx);
  if (reverb) return reverb;

  const bus = ensureCompressor(ctx);
  reverb = ctx.createConvolver();
  reverb.buffer = buildReverbImpulse(ctx);
  reverbWet = ctx.createGain();
  reverbWet.gain.value = 0.35; // 35% wet
  reverb.connect(reverbWet);
  reverbWet.connect(bus);

  return reverb;
}

export function __reset() {
  owner = null;
  compressor = null;
  reverb = null;
  reverbWet = null;
}
