/**
 * A stand-in AudioContext that records what is built and scheduled, for the
 * audio modules' unit tests. Every node connects, every param schedules, and
 * nothing makes a sound.
 */
function param(value = 0) {
  const calls = [];
  const p = { value, calls };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime']) {
    p[m] = (...args) => {
      calls.push([m, ...args]);
      return p;
    };
  }
  return p;
}

function node(kind, ctx) {
  const n = {
    kind,
    connected: [],
    connect(to) {
      n.connected.push(to);
      return to;
    },
    disconnect() {},
  };
  ctx.nodes.push(n);
  return n;
}

export function fakeContext({ decode } = {}) {
  const ctx = {
    nodes: [],
    sources: [],
    decoded: [],
    currentTime: 0,
    sampleRate: 44100,
    destination: { kind: 'destination' },
    decodeAudioData(bytes) {
      ctx.decoded.push(bytes);
      return decode ? decode(bytes) : Promise.resolve({ decodedFrom: bytes });
    },
    createDynamicsCompressor() {
      return Object.assign(node('compressor', ctx), { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
    },
    createGain() {
      return Object.assign(node('gain', ctx), { gain: param(1) });
    },
    createBufferSource() {
      const s = Object.assign(node('source', ctx), { buffer: null, playbackRate: param(1), started: null, stopped: null });
      s.start = (t) => (s.started = t);
      s.stop = (t) => (s.stopped = t);
      ctx.sources.push(s);
      return s;
    },
    createOscillator() {
      const o = Object.assign(node('oscillator', ctx), { type: 'sine', frequency: param(), detune: param() });
      o.start = () => {};
      o.stop = () => {};
      return o;
    },
    createBiquadFilter() {
      return Object.assign(node('filter', ctx), { type: 'lowpass', frequency: param(), Q: param() });
    },
    createConvolver() {
      return Object.assign(node('convolver', ctx), { buffer: null });
    },
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (c) => data[c] };
    },
  };
  return ctx;
}
