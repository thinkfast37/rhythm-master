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
import { create, cycleAccent, setPitch, addMeasure, setTimeSignature } from '../../../src/core/pattern.js';
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
  it('AC-4.1.5/1 — A context that reports `suspended` or `interrupted` pauses the run, holding its position and loop counter: found suspended at a scheduling tick, with no statechange fired', async () => {
    const suspends = [];
    transport = createTransport({ onSuspend: () => suspends.push(true) });
    await startTransport();
    await tickAt(0.5);
    const startsBeforeSuspend = starts.length;
    const patternBeforeSuspend = transport._snapshot().pattern;
    expect(startsBeforeSuspend).toBeGreaterThan(0);

    // A mobile browser that suspends without announcing it: the state changes
    // and no statechange listener ever runs. The tick is what has to notice —
    // the page being hidden no longer stands in for this (revised 2026-09-19).
    ctx.state = 'suspended';
    await tickAt(0.6);

    expect(suspends).toEqual([true]);
    expect(transport.isRunning).toBe(false);
    // Held, not reset: the same Pattern, ready for the context to come back.
    expect(transport._snapshot().suspendedForRecovery).toBe(true);
    expect(transport._snapshot().pattern).toBe(patternBeforeSuspend);
    // And nothing more is scheduled into a context that cannot sound it.
    await vi.advanceTimersByTimeAsync(500);
    expect(starts.length).toBe(startsBeforeSuspend);
  });

  it('AC-4.1.5/1 — A context that reports `suspended` or `interrupted` pauses the run, holding its position and loop counter: the iPadOS `interrupted` state does it too', async () => {
    const suspends = [];
    transport = createTransport({ onSuspend: () => suspends.push(true) });
    await startTransport();
    await tickAt(0.5);

    ctx.state = 'interrupted';
    await tickAt(0.6);

    expect(suspends).toEqual([true]);
    expect(transport.isRunning).toBe(false);
    expect(transport._snapshot().suspendedForRecovery).toBe(true);
  });

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

describe('audio/scheduler — the count-in at written lengths (AC-4.2.7)', () => {
  it("AC-4.2.7/4 — With the click counting the Beat, the metronome clicks every Beat at its own length, and the count-in counts the first Measure's Beats at their length: the count-in", async () => {
    // 6/8 then 4/4 at ♩ = 120, nothing sounding: only the count-in clicks.
    let p = { ...create(), tempo: 120, tempoUnit: 'quarter' };
    p = addMeasure(p);
    p = setTimeSignature(p, 0, '6/8');
    const startP = transport.start(p, { metronomeEnabled: false, countInEnabled: true });
    await vi.runOnlyPendingTimersAsync?.();
    await startP;
    const whens = [...new Set(starts.map((s) => s.when))].sort((a, b) => a - b);
    expect(whens).toHaveLength(6);
    // Six eighth-note Beats of 0.25 s — not the loop's average Beat of 0.35 s.
    whens.slice(1).forEach((w, i) => expect(w - whens[i]).toBeCloseTo(0.25, 6));
  });
});


/* --- layers under the composition (US-19.11) -------------------------------- */

import { layered } from '../../../src/core/section.js';

describe('audio/scheduler under layers (US-19.11)', () => {
  /** A one-Measure 4/4 Pattern, one syllable per Beat: events every 0.5s at 120 BPM. */
  function fourBeats(name) {
    let p = { ...create(name), tempo: 120 };
    for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
    return p;
  }

  async function startWith(set) {
    const startP = transport.start(set, { metronomeEnabled: false, countInEnabled: false });
    await vi.runOnlyPendingTimersAsync?.() ?? Promise.resolve();
    await startP;
    ctx = (await import('../../../src/audio/context.js')).getContext();
  }

  /** Poll every 0.1s of audio time up to `until`, as a timely browser would. */
  async function runUntil(until) {
    for (let t = ctx.currentTime + 0.1; t <= until + 1e-9; t += 0.1) await tickAt(Math.round(t * 10) / 10);
  }

  it('AC-19.11.2/1 — Play sounds the composition and every unmuted layer at once, from one timeline: two notes falling on the same instant both sound', async () => {
    // The composition's Beat 1 sixteenths and a layer's four Beats: at the
    // Beat-1 downbeat both have an event, so two oscillators start at one time.
    const set = layered(pattern(), [{ pattern: fourBeats('Bed') }]);
    await startWith(set);
    const origin = transport._eventTime(0, 0);
    await runUntil(1.9);
    const whens = starts.map((s) => Math.round((s.when - origin) * 1000) / 1000);
    const downbeat = whens.filter((w) => w === 0);
    expect(downbeat).toHaveLength(2);
    // And the layer's other Beats are in the same run, between the composition's events.
    expect(whens.filter((w) => w === 0.5 || w === 1 || w === 1.5)).toHaveLength(3);
    expect(whens.filter((w) => w === 0.125 || w === 0.25 || w === 0.375)).toHaveLength(3);
  });

  it('AC-19.11.2/4 — Adding, removing, muting or unmuting a layer while playing is heard from the next pass of the combined loop, with nothing stopped or restarted', async () => {
    await startTransport();
    const origin = transport._eventTime(0, 0);
    await runUntil(0.1);
    // A layer added mid-pass: pending until the boundary, then its events join from pass 1.
    transport.update(layered(pattern(), [{ pattern: fourBeats('Bed') }]), { metronomeEnabled: false, countInEnabled: false });
    await runUntil(1.0);
    const firstPass = starts.filter((s) => s.when < origin + 2 - 1e-9).length;
    expect(firstPass).toBe(4); // the composition alone: nothing was restarted
    await runUntil(3.9);
    const secondPass = starts.filter((s) => s.when >= origin + 2 - 1e-9 && s.when < origin + 4 - 1e-9);
    expect(secondPass).toHaveLength(8); // four of each
    // The second pass's boundary is exactly where the first pass ended: no re-anchor gap.
    expect(Math.min(...secondPass.map((s) => s.when))).toBeCloseTo(origin + 2, 6);
    expect(transport.isRunning).toBe(true);
    // Muting it is heard from the next boundary not yet scheduled, in the same way:
    // the lookahead has already handed pass 2's start to Web Audio, so pass 3.
    transport.update(layered(pattern(), [{ pattern: fourBeats('Bed'), muted: true }]), { metronomeEnabled: false, countInEnabled: false });
    await runUntil(7.9);
    const thirdPass = starts.filter((s) => s.when >= origin + 4 - 1e-9 && s.when < origin + 6 - 1e-9);
    expect(thirdPass).toHaveLength(8);
    const fourthPass = starts.filter((s) => s.when >= origin + 6 - 1e-9 && s.when < origin + 8 - 1e-9);
    expect(fourthPass).toHaveLength(4);
  });
});

describe('audio/scheduler — an edit to the part on screen under layers (AC-19.11.2/5)', () => {
  function bars(n, hits) {
    let p = { ...create('P' + n), tempo: 120 };
    for (let i = 1; i < n; i++) p = addMeasure(p);
    for (const [m, b] of hits) p = cycleAccent(p, m, b, 0);
    return p;
  }
  async function runUntil(until) {
    for (let t = ctx.currentTime + 0.1; t <= until + 1e-9; t += 0.1) await tickAt(Math.round(t * 10) / 10);
  }

  it("AC-19.11.2/5 — Recording and editing carry on under layers as they do without: the target, the selection and the cursor in the composing grid are the part on screen's, and a note recorded, a syllable turned on or off, or a Measure added or removed on that part is heard from its own next pass, not the combined loop's, every layer carrying on where it is: spliced at the part's next boundary", async () => {
    // A four-bar bed with a hit on each downbeat (2 s a bar at 120): an 8 s combined loop.
    const bed = bars(4, [[0, 0], [1, 0], [2, 0], [3, 0]]);
    const part = bars(1, [[0, 0]]);
    const startP = transport.start(layered(part, [{ pattern: bed }]), { metronomeEnabled: false, countInEnabled: false });
    await vi.runOnlyPendingTimersAsync?.() ?? Promise.resolve();
    await startP;
    ctx = (await import('../../../src/audio/context.js')).getContext();
    const origin = transport._eventTime(0, 0);
    await runUntil(0.5);
    // Mid-bar 1: a syllable on beat 2 of the one-bar part. Heard from bar 2 (2 s), not after the 8 s loop.
    transport.update(layered(cycleAccent(part, 0, 1, 0), [{ pattern: bed }]), { metronomeEnabled: false, countInEnabled: false }, { boundary: 2 });
    await runUntil(7.9);
    const rel = () => starts.map((s) => Math.round((s.when - origin) * 1000) / 1000).sort((a, b) => a - b);
    const first = rel();
    expect(first.filter((t) => t === 0.5)).toHaveLength(0); // bar 1 played as it was
    expect(first.filter((t) => t === 2.5 || t === 4.5 || t === 6.5)).toHaveLength(3); // the edit from bar 2 on
    // The bed carried on in place: one hit on every downbeat, two per downbeat with the part's own, no restart.
    for (const t of [0, 2, 4, 6]) expect(first.filter((x) => x === t)).toHaveLength(2);
    expect(transport.isRunning).toBe(true);

    // A Measure added mid-loop, its second bar given a syllable: the part is two bars now, the bed still four.
    const before = starts.length;
    const two = cycleAccent(addMeasure(cycleAccent(part, 0, 1, 0)), 1, 2, 0);
    await runUntil(9.2);
    transport.update(layered(two, [{ pattern: bed }]), { metronomeEnabled: false, countInEnabled: false }, { boundary: 2 });
    await runUntil(15.9);
    const later = rel().filter((t) => t >= 8 - 1e-9);
    // The cut is the part's next boundary, 10 s; from there the new part plays its second bar (beat 3 at +1 s).
    expect(later.filter((t) => t === 11)).toHaveLength(1);
    expect(later.filter((t) => t === 15)).toHaveLength(1);
    // The bed's downbeats every 2 s, unbroken across the cut.
    for (const t of [8, 10, 12, 14]) expect(later.filter((x) => x === t).length).toBeGreaterThanOrEqual(1);
    expect(starts.length).toBeGreaterThan(before);
  });

  it("AC-19.11.2/5 — Recording and editing carry on under layers as they do without: the target, the selection and the cursor in the composing grid are the part on screen's, and a note recorded, a syllable turned on or off, or a Measure added or removed on that part is heard from its own next pass, not the combined loop's, every layer carrying on where it is: with no boundary the swap waits for the pass's end, as before", async () => {
    const bed = bars(4, [[0, 0], [1, 0], [2, 0], [3, 0]]);
    const part = bars(1, [[0, 0]]);
    const startP = transport.start(layered(part, [{ pattern: bed }]), { metronomeEnabled: false, countInEnabled: false });
    await vi.runOnlyPendingTimersAsync?.() ?? Promise.resolve();
    await startP;
    ctx = (await import('../../../src/audio/context.js')).getContext();
    const origin = transport._eventTime(0, 0);
    await runUntil(0.5);
    transport.update(layered(cycleAccent(part, 0, 1, 0), [{ pattern: bed }]), { metronomeEnabled: false, countInEnabled: false });
    await runUntil(9.9);
    const rel = starts.map((s) => Math.round((s.when - origin) * 1000) / 1000);
    expect(rel.filter((t) => t === 2.5 || t === 4.5 || t === 6.5)).toHaveLength(0);
    expect(rel.filter((t) => t === 8.5)).toHaveLength(1);
  });
});

describe('audio/scheduler — the click switched under a run (AC-19.6.3)', () => {
  it('AC-19.6.3/3 — Switching it while playing stops and restarts nothing: the click begins or ceases from the next Beat and every part carries on: the transport', async () => {
    // 4/4 at 120: Beats at 0, 0.5, 1 and 1.5s of a 2s pass.
    await startTransport();
    const origin = transport._eventTime(0, 0);
    for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) await tickAt(origin + t);
    expect(transport._snapshot().clicksScheduled).toBe(0);
    const notesBefore = starts.length;

    transport.setMetronome(true);
    expect(transport._snapshot().metronomeEnabled).toBe(true);
    for (const t of [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7]) await tickAt(origin + t);
    // Within this pass the Beats at 1 and 1.5s click, each at its own time; the
    // two already passed do not, and nothing sounds at once. (The Pattern's own
    // events of this pass all fall before 0.6s, so what starts here is a click.)
    const inPass = starts
      .slice(notesBefore)
      .map((s) => Math.round((s.when - origin) * 1000) / 1000)
      .filter((t) => t < 2);
    expect([...new Set(inPass)]).toEqual([1, 1.5]);
    expect(transport._snapshot().clicksScheduled).toBeGreaterThanOrEqual(2);
    // Nothing restarted: the run is anchored where it was, with no edit pending.
    expect(transport._eventTime(0, 0)).toBe(origin);
    expect(transport._snapshot().pendingEdit).toBe(false);

    // Into the next pass the click carries on, and the Pattern with it.
    for (const t of [1.8, 1.9, 2.0, 2.1, 2.2, 2.3]) await tickAt(origin + t);
    const on = transport._snapshot().clicksScheduled;
    expect(on).toBeGreaterThanOrEqual(3);

    transport.setMetronome(false);
    const offAt = starts.length;
    for (const t of [2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.0, 4.1, 4.2, 4.3]) await tickAt(origin + t);
    expect(transport._snapshot().clicksScheduled).toBe(on);
    // The Pattern's own events went on sounding: the third pass's first Beat.
    expect(starts.length).toBeGreaterThan(offAt);
    expect(transport._eventTime(0, 0)).toBe(origin);
  });
});

describe('audio/scheduler — what the click counts, changed under a run (AC-4.3.7)', () => {
  it('AC-4.3.7/8 — Changing it while the Composer plays stops and restarts nothing: the click counts the new value from the next click: the transport', async () => {
    // 4/4 at 120, the click on every Beat: 0, 0.5, 1 and 1.5 s of a 2 s pass.
    await startTransport();
    const origin = transport._eventTime(0, 0);
    for (const t of [0.1, 0.2, 0.3]) await tickAt(origin + t);
    const before = starts.length;
    transport.setMetronome(true);
    for (const t of [0.35, 0.4, 0.45]) await tickAt(origin + t);
    // The Beat at 0.5 s is queued before the change.
    expect(transport._snapshot().clicksScheduled).toBeGreaterThanOrEqual(1);

    transport.setClickValue('eighth');
    expect(transport._snapshot().clickValue).toBe('eighth');
    expect(transport._snapshot().beatTimes).toHaveLength(8);
    for (let t = 0.5; t < 1.95; t += 0.05) await tickAt(origin + t);
    // No click lands twice: every onset in the pass is distinct, and after
    // those already queued they fall every 0.25 s.
    const clicksAt = starts
      .slice(before)
      .map((s) => Math.round((s.when - origin) * 1000) / 1000)
      .filter((t) => t < 2);
    const counts = clicksAt.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());
    // The Beat queued at 0.5 s sounds once; from the next click on, every 0.25 s.
    expect(counts.get(0.5)).toBe(1);
    expect(counts.has(0.625)).toBe(false);
    for (const t of [0.75, 1, 1.25, 1.5, 1.75]) expect(counts.get(t), `click at ${t}`).toBe(1);
    // Nothing restarted: the run is anchored where it was, with no edit pending.
    expect(transport._eventTime(0, 0)).toBe(origin);
    expect(transport._snapshot().pendingEdit).toBe(false);
  });

  it('a stopped transport takes the value for its next run, and an unchanged value does nothing', async () => {
    transport.setClickValue('half');
    await startTransport();
    // start() is handed its own settings: the value it was given wins.
    expect(transport._snapshot().clickValue).toBe('beat');
    const grid = transport._snapshot().beatTimes;
    transport.setClickValue('beat');
    expect(transport._snapshot().beatTimes).toEqual(grid);
  });
});

describe('audio/scheduler — an unpitched note sounded another way (US-2.18)', () => {
  /** One pass of the fixture with the click on, under the transport given. */
  async function onePass(options) {
    transport.stop();
    resetContext();
    resetNodes();
    starts = [];
    transport = createTransport(options);
    await startTransport();
    const origin = transport._eventTime(0, 0);
    transport.setMetronome(true);
    for (let t = 0.1; t < 1.95; t += 0.1) await tickAt(origin + t);
    return { clicks: transport._snapshot().clicksScheduled, started: starts.length };
  }

  it('AC-2.18.2/3 — The metronome click is the same on Accents and on Drum kit: the transport', async () => {
    const accents = await onePass({});
    const heard = [];
    const kit = await onePass({ playUnpitched: (_ctx, _destination, event, when, level) => heard.push({ accent: event.accent, when, level }) });
    // Every note of the rhythm went to the kit instead of the accent tone …
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.every((h) => [1, 2, 3].includes(h.accent) && h.level === 1 && Number.isFinite(h.when))).toBe(true);
    // … and the click was scheduled exactly as it is without it.
    expect(accents.clicks).toBeGreaterThan(0);
    expect(kit.clicks).toBe(accents.clicks);
    // What the transport itself started on the kit is the clicks alone: the accent tones are the difference.
    expect(kit.started).toBe(accents.started - heard.length);
  });
});
