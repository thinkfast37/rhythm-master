/**
 * The transport under a throttled wall-clock timer (AC-4.1.1, FR-009).
 *
 * TV and set-top browsers (the Hisense/VIDAA browser was the one heard) clamp
 * setInterval far past POLL_MS. When a tick arrives later than the lookahead
 * covers, the naive scheduler hands Web Audio event times that are already in
 * the past — which all sound at once, heard as "pauses too long, then speeds
 * up". These tests drive the transport with a fake audio clock and stalled
 * ticks and require that sounding times stay on the tempo grid regardless.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTransport } from '../../../src/audio/scheduler.js';
import { __reset as resetContext } from '../../../src/audio/context.js';
import { __reset as resetNodes } from '../../../src/audio/nodes.js';
import { create, cycleAccent, setPitch, addMeasure } from '../../../src/core/pattern.js';
import { setProgression, setChange } from '../../../src/core/harmony.js';

/** Every osc.start() the transport causes: its `when`, and the clock at call time. */
let starts = [];

class FakeParam {
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

/** Set by a test so every FakeAudioContext constructed while it is true — the
 *  original and any replacement `context.js`'s recovery logic builds — starts
 *  and stays stuck, simulating a device that never gives audio back
 *  (AC-4.1.6/2). */
let allContextsStuck = false;

class FakeAudioContext {
  constructor() {
    this.stuck = allContextsStuck;
    this.state = this.stuck ? 'suspended' : 'running';
    this.currentTime = 0;
    this.destination = { name: 'destination' };
    this._listeners = {};
  }

  async resume() {
    if (!this.stuck) this.state = 'running';
  }

  async close() {
    this.state = 'closed';
  }

  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }

  /** Test seam: change state as a real AudioContext's own machinery would,
   *  firing any registered statechange listeners exactly as the browser does. */
  _setState(state) {
    this.state = state;
    for (const fn of this._listeners.statechange ?? []) fn();
  }

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
    return {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect() {},
    };
  }
}

/** 4/4 at 120 BPM, Beat 1's four sixteenths sounding: events every 0.125s, 2s loop. */
function pattern() {
  let p = { ...create(), tempo: 120 };
  for (let s = 0; s < 4; s++) p = cycleAccent(p, 0, 0, s);
  return p;
}

let ctx;
let transport;

beforeEach(() => {
  vi.useFakeTimers();
  resetContext();
  resetNodes();
  starts = [];
  allContextsStuck = false;
  globalThis.AudioContext = FakeAudioContext;
  transport = createTransport({});
});

afterEach(() => {
  transport.stop();
  vi.useRealTimers();
  delete globalThis.AudioContext;
});

/** The context the transport is actually using — created lazily by start(). */
async function startTransport() {
  const startP = transport.start(pattern(), { metronomeEnabled: false, countInEnabled: false });
  await vi.runOnlyPendingTimersAsync?.() ?? Promise.resolve();
  await startP;
  // context.js caches one context per test thanks to resetContext(); the fake
  // records itself nowhere, so reach it through what the voices were given.
  ctx = (await import('../../../src/audio/context.js')).getContext();
}

/** One poll tick with the audio clock moved to `now`. */
async function tickAt(now) {
  ctx.currentTime = now;
  await vi.advanceTimersByTimeAsync(25);
}

describe('audio/scheduler under a throttled timer', () => {
  it('AC-4.1.1 — Playback stays sample-accurate over long loops: a stall past the lookahead never sounds an event in the past', async () => {
    await startTransport();

    // The timer stalls for 1.5s — far past the 0.2s lookahead — then one tick.
    await tickAt(1.5);

    for (const { when, clockAtCall } of starts) {
      expect(when).toBeGreaterThanOrEqual(clockAtCall - 1e-9);
    }
  });

  it('AC-4.1.1 — Playback stays sample-accurate over long loops: after a stall the remaining events stay on the tempo grid', async () => {
    await startTransport();
    const before = starts.length;

    await tickAt(1.5);

    // Whatever re-anchoring happened, consecutive events scheduled after the
    // stall keep the Pattern's own spacing — 0.125s within the Beat — rather
    // than bunching up.
    const after = starts.slice(before).map((s) => s.when);
    expect(after.length).toBeGreaterThanOrEqual(2);
    expect(after[1] - after[0]).toBeCloseTo(0.125, 6);
  });

  it('AC-4.1.1 — Playback stays sample-accurate over long loops: the lookahead widens to cover a throttled timer', async () => {
    await startTransport();
    expect(transport._snapshot().lookaheadSeconds).toBeCloseTo(0.2, 10);

    await tickAt(1.5);

    // A 1.5s gap must leave the lookahead covering a recurrence of the same
    // throttle, so the stall-and-lurch happens once, not every second.
    expect(transport._snapshot().lookaheadSeconds).toBeGreaterThanOrEqual(1.5);
  });

  it('AC-4.1.1 — Playback stays sample-accurate over long loops: timely polling keeps the stock lookahead unchanged', async () => {
    await startTransport();

    // A healthy device: the clock and the timer advance together.
    for (let i = 1; i <= 20; i++) await tickAt(i * 0.025);

    expect(transport._snapshot().lookaheadSeconds).toBeCloseTo(0.2, 10);
  });
});

describe('audio/scheduler under a device suspension (AC-4.1.5, AC-4.1.6)', () => {
  it('AC-4.1.6/1 — A recoverable suspension continues the same run: the loop keeps counting and the pass in progress finishes from where it paused, with no restart', async () => {
    const suspends = [];
    const resumes = [];
    transport = createTransport({ onSuspend: () => suspends.push(true), onResume: () => resumes.push(true) });
    await startTransport();
    await tickAt(0.5);
    const startsBeforeSuspend = starts.length;
    const patternBeforeSuspend = transport._snapshot().pattern;
    expect(startsBeforeSuspend).toBeGreaterThan(0);

    // The device takes audio away mid-run (AC-4.1.5): scheduling stops at
    // once, and nothing about the pass or Slot position is reset.
    transport._handleSuspend();
    expect(transport.isRunning).toBe(false);
    expect(transport._snapshot().suspendedForRecovery).toBe(true);
    expect(suspends).toEqual([true]);
    expect(transport._snapshot().pattern).toBe(patternBeforeSuspend);

    // Nothing sounds while suspended, even as time and the (cleared) timer move on.
    await vi.advanceTimersByTimeAsync(500);
    expect(starts.length).toBe(startsBeforeSuspend);

    // The context comes back: the run continues from exactly here, no restart.
    ctx.currentTime += 2; // time the tab was away
    await transport._handleResume();
    expect(transport.isRunning).toBe(true);
    expect(transport._snapshot().suspendedForRecovery).toBe(false);
    expect(resumes).toEqual([true]);
    expect(transport._snapshot().pattern).toBe(patternBeforeSuspend);

    // And scheduling picks back up: further ticks sound further events.
    await tickAt(ctx.currentTime + 0.1);
    expect(starts.length).toBeGreaterThan(startsBeforeSuspend);
  });

  it("AC-4.1.6/2 — An unrecoverable suspension — the context stays stuck even after `src/audio/context.js`'s STUCK_STATES replace-and-close recovery has had its say, or that recovery hands back a genuinely different context object rather than the one that was interrupted — falls back to stop-and-reset, exactly as before this revision: the transport goes to stopped, the cursor returns to the first Slot of Measure 1, the loop counter resets to 0, and pressing Play starts a fresh run: the context never comes back at all", async () => {
    const stops = [];
    transport = createTransport({ onStop: () => stops.push(true) });
    await startTransport();
    await tickAt(0.5);

    transport._handleSuspend();
    expect(transport.isRunning).toBe(false);
    expect(transport._snapshot().suspendedForRecovery).toBe(true);

    // The device never gives the context back — resume() and the
    // replace-and-close it falls through to both stay stuck (AC-4.1.10/2).
    ctx.stuck = true;
    allContextsStuck = true;
    ctx._setState('suspended');
    await transport._handleResume();

    // Falls back to exactly what a stop always did: not running, and the
    // ordinary stop notification fires so app-level state resets to the top.
    expect(transport.isRunning).toBe(false);
    expect(transport._snapshot().suspendedForRecovery).toBe(false);
    expect(stops).toEqual([true]);

    // And it stays stopped — no further scheduling resumes on its own.
    const before = starts.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts.length).toBe(before);
  });

  it("AC-4.1.6/2 — An unrecoverable suspension — the context stays stuck even after `src/audio/context.js`'s STUCK_STATES replace-and-close recovery has had its say, or that recovery hands back a genuinely different context object rather than the one that was interrupted — falls back to stop-and-reset, exactly as before this revision: the transport goes to stopped, the cursor returns to the first Slot of Measure 1, the loop counter resets to 0, and pressing Play starts a fresh run: a replacement context handed back running still falls back, since its clock cannot be re-anchored to a paused run", async () => {
    const stops = [];
    transport = createTransport({ onStop: () => stops.push(true) });
    await startTransport();
    await tickAt(0.5);

    transport._handleSuspend();
    expect(transport._snapshot().suspendedForRecovery).toBe(true);

    // The original context never comes back (STUCK_STATES stays true for it
    // forever), so context.js's own replace-and-close builds a fresh one —
    // which, unlike the original, is not stuck and reports running at once.
    // Its clock (currentTime) starts from 0 again, unrelated to the
    // suspended run's.
    ctx.stuck = true;
    ctx._setState('suspended');

    await transport._handleResume();

    // A different context object came back running, but this must not be
    // treated as the same run continuing — falls back exactly as an
    // unrecoverable suspension does.
    expect(transport.isRunning).toBe(false);
    expect(transport._snapshot().suspendedForRecovery).toBe(false);
    expect(stops).toEqual([true]);

    const before = starts.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts.length).toBe(before);
  });
});

describe('audio/scheduler under a progression (US-2.6)', () => {
  /** Two 4/4 Measures at 120 (a 4s pass), Slot 1 of each on as a Root, under I–IV–V. */
  function harmonicPattern(change) {
    let p = { ...create(), soundMode: 'melodic', key: 'C', tempo: 120 };
    p = addMeasure(p);
    p = setChange(setProgression(p, 'I-IV-V'), change);
    for (const m of [0, 1]) {
      p = cycleAccent(p, m, 0, 0);
      p = setPitch(p, m, 0, 0, { tone: 1, octaveOffset: 0 });
    }
    return p;
  }

  it('AC-2.6.3/4 — Changing the setting while playing is heard from the next pass', async () => {
    const notes = [];
    transport = createTransport({
      playMelodic: (c, master, event, when) => notes.push({ when, midi: event.pitch.midiNote }),
    });
    const startP = transport.start(harmonicPattern('pass'), { metronomeEnabled: false, countInEnabled: false });
    await vi.runOnlyPendingTimersAsync?.();
    await startP;
    ctx = (await import('../../../src/audio/context.js')).getContext();

    // Pass 0 under "every pass": both Measures on the I. The edit lands now,
    // before the pass is over, and must not touch it.
    transport.update(harmonicPattern('measure'), { metronomeEnabled: false, countInEnabled: false });
    for (let t = 0.5; t <= 6.5; t += 0.5) await tickAt(t);

    // Pass 1 under "every Measure": Measure 1 sounds chord (1 × 2 + 0) mod 3 = V,
    // Measure 2 chord 3 mod 3 = I.
    expect(notes.map((n) => n.midi).slice(0, 4)).toEqual([60, 60, 67, 60]);
    expect(notes[2].when - notes[0].when).toBeCloseTo(4, 6);
  });
});

/*
 * The visual half of the same throttling (AC-4.1.2).
 *
 * The Hisense fix (T242) widened the lookahead so a clamped setInterval can no
 * longer starve the AUDIO queue. It left the highlight where it was: flushed
 * only from inside that same clamped tick. So on a browser polling once a
 * second the audio sounds dead on the grid, scheduled a second ahead, while
 * the highlight arrives up to a whole clamp behind it — reported from a
 * Samsung TV as "the sound is ahead of the notes lighting up", more than a
 * beat out at 80 BPM.
 *
 * These tests drive the transport with the timer clamped and only animation
 * frames running, and require the highlight to arrive with its audio anyway.
 */
describe('audio/scheduler visuals under a throttled timer', () => {
  /** Every pending animation-frame callback, run by flushFrames(). */
  let frames = [];

  function installFrames() {
    frames = [];
    let id = 0;
    globalThis.requestAnimationFrame = (cb) => {
      frames.push({ id: ++id, cb });
      return id;
    };
    globalThis.cancelAnimationFrame = (target) => {
      frames = frames.filter((f) => f.id !== target);
    };
  }

  /** One frame: run what is queued, letting each re-queue for the next. */
  function flushFrames() {
    const due = frames;
    frames = [];
    for (const { cb } of due) cb();
  }

  afterEach(() => {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });

  /** 4/4 at 120 BPM with every sixteenth sounding: an event every 0.125s. */
  function densePattern() {
    let p = { ...create(), tempo: 120 };
    for (let b = 0; b < 4; b++) for (let s = 0; s < 4; s++) p = cycleAccent(p, 0, b, s);
    return p;
  }

  /** The clock at which each highlight was delivered. */
  async function playThrottled() {
    const seen = [];
    transport = createTransport({ onPosition: () => seen.push(ctx.currentTime) });
    installFrames();

    const startP = transport.start(densePattern(), { metronomeEnabled: false, countInEnabled: false });
    await vi.runOnlyPendingTimersAsync?.();
    await startP;
    ctx = (await import('../../../src/audio/context.js')).getContext();

    // The clock advances a frame at a time. The poll timer fires ONCE, at
    // 0.5s — a browser clamping it to half a second — and never again inside
    // the window under test. Everything after that must come from frames.
    let ticked = false;
    for (let t = 0; t <= 1.6; t += 1 / 60) {
      ctx.currentTime = t;
      if (!ticked && t >= 0.5) {
        ticked = true;
        await vi.advanceTimersByTimeAsync(25);
      }
      flushFrames();
    }
    return seen;
  }

  it('AC-4.1.2 — Visual highlight stays in sync with audio: the highlight keeps pace when the poll timer is clamped', async () => {
    const seen = await playThrottled();

    // Pair each delivery with the audio event it belongs to: both come off the
    // same queue in the same order, so the nth highlight belongs to the nth
    // distinct sounding time.
    const sounded = [...new Set(starts.map((s) => s.when))].sort((a, b) => a - b).filter((w) => w <= 1.6);

    expect(sounded.length).toBeGreaterThan(8);
    expect(seen.length).toBe(sounded.length);
    sounded.forEach((when, i) => {
      expect(seen[i] - when).toBeLessThanOrEqual(0.02 + 1e-9);
    });
  });

  it('AC-4.1.2 — Visual highlight stays in sync with audio: no highlight arrives before the event it marks', async () => {
    const seen = await playThrottled();
    const sounded = [...new Set(starts.map((s) => s.when))].sort((a, b) => a - b).filter((w) => w <= 1.6);

    sounded.forEach((when, i) => {
      expect(seen[i]).toBeGreaterThanOrEqual(when - 1e-9);
    });
  });

  it('AC-4.1.2 — Visual highlight stays in sync with audio: a browser without animation frames still highlights from the poll', async () => {
    // No requestAnimationFrame installed at all: the frame flush is an
    // addition, never the only path, so the tick must still deliver.
    const seen = [];
    transport = createTransport({ onPosition: () => seen.push(ctx.currentTime) });
    const startP = transport.start(densePattern(), { metronomeEnabled: false, countInEnabled: false });
    await vi.runOnlyPendingTimersAsync?.();
    await startP;
    ctx = (await import('../../../src/audio/context.js')).getContext();

    for (let i = 1; i <= 20; i++) await tickAt(i * 0.025);

    expect(seen.length).toBeGreaterThan(0);
  });
});
