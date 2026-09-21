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
 * replaced (a hard suspend on iOS), the cached nodes must be rebuilt rather
 * than reused.
 *
 * A WeakMap rather than one slot plus a reset, because two contexts are now
 * live at once: the transport's, and the OfflineAudioContext a background
 * render builds beside it (AC-4.1.15). A single slot made the render evict the
 * playing context's bus and rebuild it underneath a run — a second compressor
 * on the destination for every render, and the old one orphaned but still
 * connected. Keyed by context, neither can see the other's nodes at all.
 */
const buses = new WeakMap();

function busFor(ctx) {
  if (!buses.has(ctx)) buses.set(ctx, { compressor: null, reverb: null, reverbWet: null });
  return buses.get(ctx);
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
  const bus = busFor(ctx);
  if (bus.compressor) return bus.compressor;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 8;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;
  compressor.connect(ctx.destination);

  bus.compressor = compressor;
  return compressor;
}

/**
 * The reverb send — melodic voices only, and built on first melodic note rather
 * than up front. A rhythm-only practice session never needs it, and the impulse
 * response is 1.5 seconds of synthesised stereo noise: not free to build.
 */
export function ensureReverb(ctx) {
  const cached = busFor(ctx);
  if (cached.reverb) return cached.reverb;

  const destination = ensureCompressor(ctx);
  const reverb = ctx.createConvolver();
  reverb.buffer = buildReverbImpulse(ctx);
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = 0.35; // 35% wet
  reverb.connect(reverbWet);
  reverbWet.connect(destination);

  cached.reverb = reverb;
  cached.reverbWet = reverbWet;
  return reverb;
}

/**
 * Test seam, kept for the suites that call it between cases.
 *
 * There is nothing left to clear: the cache is keyed by context, so a test
 * that builds a fresh context already gets a fresh bus, and one that keeps its
 * context wants the bus it has.
 */
export function __reset() {}
