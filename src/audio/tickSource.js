/**
 * The scheduler's polling cadence (AC-4.1.14).
 *
 * `setInterval` is throttled to as little as once a minute in a backgrounded
 * page, and the lookahead reaches at most 1.5 seconds ahead — so a run whose
 * cadence comes from a timer sounds for a second and a half after the screen
 * locks and then gaps. That is what silenced AC-4.1.12's first attempt.
 *
 * An AudioWorklet runs on the AudioContext's own rendering thread, which is
 * not throttled for a page whose audio is playing. It also has a property
 * worth more than that one: it ticks if and only if audio is actually being
 * rendered, so it can never report a cadence the audio is not keeping. When
 * the context suspends, the ticks stop — the same event AC-4.1.5 pauses on.
 *
 * Constitution III is unaffected: this drives the polling cadence only. Every
 * event's sounding time is still computed against `AudioContext.currentTime`.
 *
 * Feature-detected throughout. A browser with no `AudioWorklet`, or one whose
 * module fails to load, falls back to `setInterval` and behaves exactly as it
 * did before this module existed (AC-4.1.14/2).
 */

/** Polling cadence, in milliseconds, for both the worklet and the fallback. */
export const POLL_MS = 25;

/**
 * The worklet processor, as source. It is built here and handed to
 * `addModule` as a Blob URL rather than shipped as a file: the worklet is
 * three lines and this keeps it beside the reason it exists.
 *
 * `process()` is called once per render quantum — 128 frames, about 2.7 ms at
 * 48 kHz — which is far more often than the scheduler needs, so it posts only
 * when a poll interval's worth of frames has passed. It returns true forever:
 * a processor that returns false is torn down by the browser, and this one
 * must live as long as the run does.
 */
const PROCESSOR_SOURCE = `
class TickProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.every = Math.max(1, Math.round((sampleRate * options.processorOptions.pollMs) / 1000));
    this.elapsed = 0;
  }
  process(inputs, outputs) {
    this.elapsed += outputs[0]?.[0]?.length ?? 128;
    if (this.elapsed >= this.every) {
      this.elapsed = 0;
      this.port.postMessage(0);
    }
    return true;
  }
}
registerProcessor('rm-tick', TickProcessor);
`;

/** One module registration per AudioContext — `addModule` is per-context. */
const registered = new WeakMap();

async function register(ctx) {
  if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== 'function') return false;
  if (!registered.has(ctx)) {
    const url = URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' }));
    registered.set(
      ctx,
      ctx.audioWorklet
        .addModule(url)
        .then(() => true)
        .catch(() => false)
        .finally(() => URL.revokeObjectURL(url))
    );
  }
  return registered.get(ctx);
}

/**
 * Start ticking `onTick` at the polling cadence, from the audio thread where
 * that is available and from a wall-clock timer where it is not.
 *
 * Returns a ticker: `stop()` ends it, and `source` reads `'worklet'` or
 * `'timer'` for whichever is currently driving it. Stopping is safe before
 * the async worklet setup has finished — a ticker stopped in the meantime
 * never starts one.
 */
export function startTicking(ctx, onTick) {
  let stopped = false;
  let node = null;
  let timer = null;

  function fallback() {
    if (stopped || timer !== null) return;
    timer = setInterval(onTick, POLL_MS);
  }

  // The fallback starts immediately and is torn down only once the worklet is
  // confirmed running, so no cadence is lost to the await below.
  fallback();

  (async () => {
    let ready = false;
    try {
      ready = await register(ctx);
    } catch {
      ready = false;
    }
    if (stopped || !ready) return;
    try {
      node = new AudioWorkletNode(ctx, 'rm-tick', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { pollMs: POLL_MS },
      });
      node.port.onmessage = () => {
        if (!stopped) onTick();
      };
      // A processor is only rendered while its node is connected to the graph.
      // It writes nothing to its output, so connecting it sounds nothing.
      node.connect(ctx.destination);
      clearInterval(timer);
      timer = null;
    } catch {
      // Anything at all here means the timer keeps the cadence (AC-4.1.14/2).
      node = null;
      fallback();
    }
  })();

  return {
    get source() {
      return node ? 'worklet' : 'timer';
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      timer = null;
      if (node) {
        node.port.onmessage = null;
        try {
          node.disconnect();
        } catch {
          // A node whose context has already gone does not need disconnecting.
        }
        node = null;
      }
    },
  };
}
