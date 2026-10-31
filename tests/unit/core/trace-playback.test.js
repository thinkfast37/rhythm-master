/**
 * Playback timing, swing and the Percussive voice, each proved as its criterion is
 * written (US-4.1, US-4.4, US-2.4).
 *
 * The timing criteria are claims about the transport, so they are measured on the
 * transport itself: a fake AudioContext whose clock the test moves, a fake timer for
 * the polling cadence, and every `start(when)` the voices hand to Web Audio recorded.
 * Nothing here sleeps on the wall clock — the point of AC-4.1.1 is that the wall
 * clock is not what event times come from.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTransport } from '../../../src/audio/scheduler.js';
import { __reset as resetContext, getContext } from '../../../src/audio/context.js';
import { __reset as resetNodes } from '../../../src/audio/nodes.js';
import { fakeContext } from '../audio/fakeAudio.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import { isValidSwing, MIN_SWING, MAX_SWING } from '../../../src/core/swing.js';
import {
  create,
  cycleAccent,
  addMeasure,
  setRecipe,
  setGroupSwing,
  setSwingAmount,
} from '../../../src/core/pattern.js';

/** Every osc.start() the transport causes, with the audio clock at call time. */
let starts = [];

class FakeParam {
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

/** A running context with a settable clock, recording each scheduled start. */
class ClockContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = { name: 'destination' };
  }
  async resume() {}
  async close() {}
  addEventListener() {}
  createOscillator() {
    const ctx = this;
    return {
      type: 'sine',
      frequency: new FakeParam(),
      detune: { value: 0 },
      connect() {},
      start(when) {
        starts.push({ when, clockAtCall: ctx.currentTime });
      },
      stop() {},
    };
  }
  createGain() {
    return { gain: Object.assign(new FakeParam(), { value: 0 }), connect() {} };
  }
  createDynamicsCompressor() {
    return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect() {} };
  }
}

/** Fill every Slot of one Beat. */
function fillBeat(pattern, m, b) {
  const n = pattern.measures[m].beats[b].slots.length;
  for (let s = 0; s < n; s++) pattern = cycleAccent(pattern, m, b, s);
  return pattern;
}

/** 4/4 at 120 BPM with a note on every Beat's first Slot: four events a pass. */
function quarterNotes() {
  let p = { ...create(), tempo: 120 };
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
  return p;
}

const OFF = { metronomeEnabled: false, countInEnabled: false };

describe('trace: playback timing (US-4.1)', () => {
  let transport;

  beforeEach(() => {
    vi.useFakeTimers();
    resetContext();
    resetNodes();
    starts = [];
    globalThis.AudioContext = ClockContext;
  });

  afterEach(() => {
    transport?.stop();
    vi.useRealTimers();
    delete globalThis.AudioContext;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });

  it('AC-4.1.1 — Playback stays sample-accurate over long loops: loop 500 lands within 10ms of the time predicted from the tempo and loop 1, under an irregular timer', async () => {
    const pattern = quarterNotes();
    transport = createTransport({});
    await transport.start(pattern, OFF);
    const ctx = getContext();

    // The tempo's own arithmetic, done here rather than read back from the code:
    // four quarter-note Beats at 120 BPM is a 2-second pass.
    const passSeconds = 4 * (60 / pattern.tempo);
    const loopOneStart = starts[0].when;
    const predicted = loopOneStart + 499 * passSeconds;

    // Advance the audio clock past loop 500, with the polling timer firing at an
    // irregular cadence — 10 to 40 ms — as a busy or throttled page's would. A
    // scheduler that took its times from the timer would drift with it.
    const jitter = [0.01, 0.04, 0.025, 0.017, 0.033, 0.021];
    let i = 0;
    while (ctx.currentTime < predicted + 0.5) {
      ctx.currentTime += jitter[i++ % jitter.length];
      vi.advanceTimersByTime(25);
    }

    const loopFiveHundred = starts.find((s) => s.when > predicted - 60 / pattern.tempo / 2) // half a Beat early, at most;
    expect(loopFiveHundred).toBeDefined();
    // It is the first Slot of loop 500, not a neighbour: four events a pass.
    expect(starts.indexOf(loopFiveHundred)).toBe(499 * 4);
    expect(Math.abs(loopFiveHundred.when - predicted)).toBeLessThan(0.010);
  });

  it('AC-4.1.2 — Visual highlight stays in sync with audio: every highlight lands within 20ms of its own audio event, never before it', async () => {
    // A compositor-driven frame every 16 ms, on the same fake clock as everything else.
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

    const shown = [];
    transport = createTransport({
      onPosition: (position) => shown.push({ position, at: getContext().currentTime }),
    });
    await transport.start(quarterNotes(), OFF);
    const ctx = getContext();

    // Three passes, the clock and the timers moving together a millisecond at a time.
    for (let ms = 0; ms < 6000; ms++) {
      ctx.currentTime += 0.001;
      vi.advanceTimersByTime(1);
    }

    // One highlight per scheduled audio event, in the same order: they come off one queue.
    const sounded = starts.filter((s) => s.when <= ctx.currentTime);
    expect(shown.length).toBeGreaterThanOrEqual(12);
    expect(shown.length).toBe(sounded.length);
    shown.forEach(({ position, at }, k) => {
      const lag = at - sounded[k].when;
      expect(lag, `highlight ${k} (beat ${position.beatIndex})`).toBeGreaterThanOrEqual(-1e-9);
      expect(lag, `highlight ${k} (beat ${position.beatIndex})`).toBeLessThan(0.020);
      expect(position.beatIndex).toBe(k % 4);
    });
  });
});

describe('trace: swing (US-4.4)', () => {
  it('AC-4.4.1 — Swing default and range: a straight group swings by 0 until set, and only integers 0–100 are accepted', () => {
    let p = { ...create(), tempo: 120 };
    p = fillBeat(p, 0, 0);
    // Created with no swing anywhere: Pattern-wide and per-group both absent.
    expect(p.swingAmount).toBeUndefined();
    expect(p.measures[0].beats[0].swing).toBeUndefined();
    // So it plays at its nominal, evenly spaced onsets — a swing of 0.
    expect(buildTimeline(p).map((e) => e.timeSeconds)).toEqual([0, 0.125, 0.25, 0.375]);

    // A group created later — a new Measure, a re-subdivided Beat — starts at 0 too.
    p = addMeasure(p);
    p = setRecipe(p, 1, 0, 'straight-8ths');
    p = fillBeat(p, 1, 0);
    const second = buildTimeline(p).filter((e) => e.measureIndex === 1).map((e) => e.timeSeconds);
    expect(second[0]).toBeCloseTo(2.0, 10);
    expect(second[1]).toBeCloseTo(2.25, 10);

    // Adjustable from 0 to 100 in integer steps, at the Pattern-wide control and per group.
    expect([MIN_SWING, MAX_SWING]).toEqual([0, 100]);
    for (const ok of [0, 1, 50, 99, 100]) {
      expect(isValidSwing(ok)).toBe(true);
      expect(setSwingAmount(p, ok).swingAmount).toBe(ok);
      expect(setGroupSwing(p, 0, 0, 0, ok).measures[0].beats[0].swing[0]).toBe(ok);
    }
    for (const bad of [-1, 101, 33.5, '40', NaN]) {
      expect(isValidSwing(bad)).toBe(false);
      expect(() => setSwingAmount(p, bad)).toThrow(/0–100/);
      expect(() => setGroupSwing(p, 0, 0, 0, bad)).toThrow(/0–100/);
    }
  });

  it('AC-4.4.4 — Swing only affects the straight portion of a mixed Beat: Slot 2 moves by the formula at swing 60, Slots 3–5 keep their triplet timing', () => {
    let p = { ...create(), tempo: 120 }; // quarter = 0.5s, half-Beat = 0.25s
    p = setRecipe(p, 0, 0, 'straight-triplet-split');
    p = fillBeat(p, 0, 0);
    const d = 0.125; // a straight Slot is half of the half-Beat
    const triplet = [0.25, 0.25 + 0.25 / 3, 0.25 + (2 * 0.25) / 3];

    // The straight group's own amount, and the Pattern-wide amount it would
    // otherwise inherit (AC-4.4.13): either way the straight group's swing is 60.
    for (const swung of [setGroupSwing(p, 0, 0, 0, 60), setSwingAmount(p, 60)]) {
      const times = buildTimeline(swung).map((e) => e.timeSeconds);
      expect(times).toHaveLength(5);
      expect(times[0]).toBeCloseTo(0, 10);
      expect(times[1]).toBeCloseTo(d + Math.min(0.6 * d, 0.95 * d), 10); // 0.2s
      times.slice(2).forEach((t, k) => expect(t).toBeCloseTo(triplet[k], 10));
    }

    // Regardless of the straight group's value: at 100 the triplet still does not move.
    const extreme = buildTimeline(setGroupSwing(p, 0, 0, 0, 100)).map((e) => e.timeSeconds);
    extreme.slice(2).forEach((t, k) => expect(t).toBeCloseTo(triplet[k], 10));
  });

  it("AC-4.4.2 — Per-group swing amounts carried in a Pattern's data play as authored", () => {
    // 4/4 at 120 BPM: a quarter is 0.5s. Beat 1 on Straight → Triplet split, Beats 2
    // and 3 on Straight 16ths, every Slot sounding.
    let p = { ...create(), tempo: 120 };
    p = setRecipe(p, 0, 0, 'straight-triplet-split');
    for (const b of [0, 1, 2]) p = fillBeat(p, 0, b);
    p = setSwingAmount(p, 20); // the Pattern-wide default
    p = setGroupSwing(p, 0, 0, 0, 40); // Beat 1's straight half carries 40
    p = setGroupSwing(p, 0, 1, 0, 60); // Beat 2's group carries 60
    const at = (b, s) => buildTimeline(p).find((e) => e.beatIndex === b && e.slotIndex === s).timeSeconds;

    // Beat 1's straight half swings at its own 40: Slot 2 at 0.125 + 0.4 × 0.125.
    expect(at(0, 1)).toBeCloseTo(0.125 + 0.4 * 0.125, 10);
    // Its triplet half is not swung at all.
    [0.25, 0.25 + 0.25 / 3, 0.25 + (2 * 0.25) / 3].forEach((t, k) => expect(at(0, 2 + k)).toBeCloseTo(t, 10));
    // Beat 2 swings at its own 60: the "&" at 0.5 + 0.25 + 0.6 × 0.125.
    expect(at(1, 2)).toBeCloseTo(0.5 + 0.25 + 0.6 * 0.125, 10);
    // Beat 3 carries no amount of its own, so it takes the Pattern-wide 20.
    expect(at(2, 2)).toBeCloseTo(1.0 + 0.25 + 0.2 * 0.125, 10);
  });

  it('AC-4.4.5 — Swing timing formula: the worked example, 4/4 at 120 BPM on Straight 16ths with swing 67, as the timeline plays it', () => {
    let p = { ...create(), tempo: 120 };
    p = fillBeat(p, 0, 0);
    p = setSwingAmount(p, 67);
    const times = buildTimeline(p).filter((e) => e.beatIndex === 0).map((e) => e.timeSeconds);

    // Slot 3 (position N/2 + 1) onsets at 0.250 + min(0.67 × 0.125, 0.95 × 0.125) = 0.334s.
    expect(times[2]).toBeCloseTo(0.25 + 0.67 * 0.125, 10);
    expect(times[2]).toBeCloseTo(0.334, 3);
    // Slots 1, 2 and 4 are unaffected.
    expect(times[0]).toBeCloseTo(0, 10);
    expect(times[1]).toBeCloseTo(0.125, 10);
    expect(times[3]).toBeCloseTo(0.375, 10);
  });

  it('AC-4.4.5 — Swing timing formula: N = 2 delays position 2, and the delay caps at 0.95 × d', () => {
    let p = { ...create(), tempo: 120 };
    p = setRecipe(p, 0, 0, 'straight-8ths'); // N = 2, d = 0.25s
    p = fillBeat(p, 0, 0);
    const at = (swing) => buildTimeline(setSwingAmount(p, swing)).map((e) => e.timeSeconds);

    expect(at(40)).toEqual([0, expect.closeTo(0.25 + 0.4 * 0.25, 10)]);
    // At 100 the uncapped delay would be a whole Slot; the cap holds it at 0.95 × d.
    expect(at(100)[1]).toBeCloseTo(0.25 + 0.95 * 0.25, 10);
    expect(at(100)[0]).toBe(0);
  });
});

describe('trace: the Percussive voice during playback (US-2.4)', () => {
  let transport;
  let ctx;

  beforeEach(() => {
    vi.useFakeTimers();
    resetContext();
    resetNodes();
    // The recording fake from the audio suites, made constructible and running.
    globalThis.AudioContext = function FakeRunning() {
      ctx = Object.assign(fakeContext(), {
        state: 'running',
        resume: async () => {},
        close: async () => {},
        addEventListener() {},
      });
      return ctx;
    };
  });

  afterEach(() => {
    transport?.stop();
    vi.useRealTimers();
    delete globalThis.AudioContext;
  });

  it('AC-2.4.5 — Percussive playback stays dry and single-oscillator: every note is one sine bending to 0.85× over 0.1 s, into the shared compressor and nothing else', async () => {
    let p = { ...create(), tempo: 120 };
    p = fillBeat(p, 0, 0); // Strong, Weak, Medium, Weak — every Accent Level that sounds
    transport = createTransport({});
    await transport.start(p, OFF);
    for (let k = 0; k < 40; k++) {
      ctx.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }

    const oscillators = ctx.nodes.filter((n) => n.kind === 'oscillator');
    const compressors = ctx.nodes.filter((n) => n.kind === 'compressor');
    expect(oscillators.length).toBeGreaterThanOrEqual(4);
    // One shared compressor for the whole run, and it feeds the output.
    expect(compressors).toHaveLength(1);
    expect(compressors[0].connected).toEqual([ctx.destination]);

    for (const osc of oscillators) {
      expect(osc.type).toBe('sine');
      // Starts at its frequency and bends exponentially to 0.85× of it, 0.1 s later.
      const [set, ramp, ...more] = osc.frequency.calls;
      expect(set[0]).toBe('setValueAtTime');
      expect(ramp[0]).toBe('exponentialRampToValueAtTime');
      expect(more).toEqual([]);
      const [, f0, when] = set;
      expect(ramp[1] / f0).toBeCloseTo(0.85, 10);
      expect(ramp[2] - when).toBeCloseTo(0.1, 10);
      // Single path: oscillator → its envelope → the shared compressor.
      expect(osc.connected).toHaveLength(1);
      const env = osc.connected[0];
      expect(env.kind).toBe('gain');
      expect(env.connected).toEqual([compressors[0]]);
    }

    // No chorus, no filter, no reverb anywhere in the graph the run built.
    expect(ctx.nodes.filter((n) => !['oscillator', 'gain', 'compressor'].includes(n.kind))).toEqual([]);
    // One note per sounding event: as many oscillators as envelopes feeding the compressor.
    const envelopes = ctx.nodes.filter((n) => n.kind === 'gain' && n.connected.includes(compressors[0]));
    expect(envelopes).toHaveLength(oscillators.length);
  });
});
