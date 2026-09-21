/**
 * The lookahead transport. FR-009, Constitution Principle III.
 *
 * A wall-clock timer drives the scheduler's POLLING CADENCE only. Every event's
 * sounding time is computed as `origin + loopIndex × loopDuration + eventOffset`
 * from an absolute audio-clock origin captured once at start. Nothing is ever
 * accumulated by adding intervals, which is what compounds error and makes a
 * long practice session drift.
 *
 * The visual cursor is driven from this same queue rather than a separate
 * animation loop, so the highlighted Slot cannot disagree with what is heard.
 */
import { buildTimeline, loopDurationSeconds, buildBeatGrid } from '../core/timeline.js';
import { hasHarmony } from '../core/harmony.js';
import { resume, onSuspended, onResumed } from './context.js';
import { startTicking } from './tickSource.js';
import { playPercussive, playClick } from './voices.js';

/** How far ahead events are scheduled. The cadence it is topped up at comes
 *  from `tickSource.js` — the audio thread where that is available, so a
 *  backgrounded page keeps scheduling (AC-4.1.14). */
const LOOKAHEAD_SECONDS = 0.2;

/*
 * TV and set-top browsers (the Hisense/VIDAA browser, notably) clamp timers
 * far past POLL_MS. LOOKAHEAD_SECONDS is therefore a floor, not the size: a
 * tick that arrives after a gap the current lookahead could not have covered
 * widens it to STALL_MARGIN times that gap, so the starve-and-lurch happens at
 * most once per throttle level rather than every second. On a device whose
 * timer keeps up, no gap ever exceeds the floor and nothing changes.
 *
 * The cap bounds how much already-scheduled audio can trail a Stop on a
 * throttled device; timely devices keep today's ≤0.2s trail.
 */
const MAX_LOOKAHEAD_SECONDS = 1.5;
const STALL_MARGIN = 2.5;

/** The same safety offset start() uses, reused when a stall re-anchors. */
const START_OFFSET_SECONDS = 0.06;

export function createTransport({ onPosition, onLoop, onStop, onSuspend, onResume, playMelodic = null } = {}) {
  let ctx = null;
  let master = null;
  /** The polling cadence in force, or null when nothing is running
   *  (AC-4.1.14). Replaces the raw `setInterval` handle this once held. */
  let ticker = null;

  /** Absolute audio-clock time of loop 0, Slot 0. Moves only at a pass-boundary
   *  re-anchor (AC-4.1.9) or a stall recovery — never by per-tick accumulation. */
  let origin = 0;
  let loopDuration = 0;
  let timeline = [];
  let beatGrid = [];
  let pattern = null;
  let settings = { metronomeEnabled: false, countInEnabled: false };

  /** Index of the next event to schedule, as a running (loop, index) cursor. */
  let nextLoop = 0;
  let nextIndex = 0;
  let nextBeatIndex = 0;
  let countInSeconds = 0;
  /** Full passes completed before the current origin — the re-anchors' carry. */
  let loopOffset = 0;
  /** An edited Pattern waiting for the next pass boundary (AC-4.1.9). */
  let pending = null;
  let running = false;
  /** Paused by a recoverable device suspension, waiting for the context to
   *  come back (AC-4.1.5, AC-4.1.6) — distinct from `running` false because
   *  the transport is not stopped: its position is held, not reset. */
  let suspendedForRecovery = false;
  const pendingVisuals = [];

  /** Adaptive horizon (see MAX_LOOKAHEAD_SECONDS above). Kept across starts:
   *  a browser that throttled once will throttle the next run too. */
  let lookahead = LOOKAHEAD_SECONDS;
  /** Audio-clock time of the previous tick, for measuring timer gaps. */
  let lastTick = 0;
  /** Handle of the pending animation frame, or null when the loop is stopped. */
  let frame = null;

  function eventTime(loop, offset) {
    return origin + countInSeconds + loop * loopDuration + offset;
  }

  /** The pass about to be scheduled, counted from Play across every re-anchor. */
  const currentPass = () => loopOffset + nextLoop;

  /*
   * Both cursors — Slots and metronome Beats — walk one pass at a time and only
   * advance to the next pass together, so a Pattern edit can swap the timeline,
   * beat grid and loop duration at a pass boundary without the two disagreeing
   * about which Pattern the current pass belongs to (AC-4.1.9).
   */
  function scheduleUntil(horizon) {
    for (;;) {
      let blocked = false;

      // Pattern events of the current pass
      while (nextIndex < timeline.length) {
        const event = timeline[nextIndex];
        const when = eventTime(nextLoop, event.timeSeconds);
        if (when > horizon) {
          blocked = true;
          break;
        }

        if (event.pitch && playMelodic) playMelodic(ctx, master, event, when);
        else playPercussive(ctx, master, event.accent, when);

        pendingVisuals.push({ when, position: { ...event, loop: loopOffset + nextLoop } });
        nextIndex += 1;
      }

      // Metronome, on Beats rather than Slots
      if (settings.metronomeEnabled) {
        while (nextBeatIndex < beatGrid.length) {
          const beat = beatGrid[nextBeatIndex];
          const when = eventTime(nextLoop, beat.timeSeconds);
          if (when > horizon) {
            blocked = true;
            break;
          }
          playClick(ctx, master, { downbeat: beat.isDownbeat, when });
          nextBeatIndex += 1;
        }
      }

      if (blocked) return;

      // The pass is fully scheduled. Cross into the next one only once its
      // start is within the horizon, so an eventless pass cannot spin here.
      if (eventTime(nextLoop + 1, 0) > horizon) return;
      nextLoop += 1;
      nextIndex = 0;
      nextBeatIndex = 0;
      onLoop?.(loopOffset + nextLoop);

      // Under a progression the next pass may be a different chord, so its
      // timeline is this pass's rebuilt for that pass — the same function, the
      // same timing, only the chord tones resolved anew (US-2.6, D-011).
      if (!pending && hasHarmony(pattern)) timeline = buildTimeline(pattern, currentPass());

      if (pending) {
        // Re-anchor the origin at this boundary — still a product of the old
        // origin, never a per-pass accumulation (FR-009) — then swap in the
        // edited Pattern for the pass that starts here. The display counter
        // carries on across the re-anchor (AC-4.1.9/4).
        origin = eventTime(nextLoop, 0);
        countInSeconds = 0;
        loopOffset += nextLoop;
        nextLoop = 0;
        pattern = pending.pattern;
        settings = pending.settings ?? settings;
        pending = null;
        timeline = buildTimeline(pattern, currentPass());
        beatGrid = buildBeatGrid(pattern);
        loopDuration = loopDurationSeconds(pattern);
      }
    }
  }

  /**
   * The absolute time of the next event not yet handed to Web Audio — the
   * upcoming Slot, metronome Beat, or failing both, the next pass boundary.
   */
  function nextUnscheduledTime() {
    let next = eventTime(nextLoop + 1, 0);
    if (nextIndex < timeline.length) {
      next = Math.min(next, eventTime(nextLoop, timeline[nextIndex].timeSeconds));
    }
    if (settings.metronomeEnabled && nextBeatIndex < beatGrid.length) {
      next = Math.min(next, eventTime(nextLoop, beatGrid[nextBeatIndex].timeSeconds));
    }
    return next;
  }

  /*
   * A tick that arrives after the scheduled horizon has passed leaves events
   * in the past, and Web Audio sounds a past-scheduled event immediately —
   * every starved event at once, heard as a lurch. Shift the origin forward by
   * the deficit instead: the stall stays a pause, and everything after it
   * sounds on the tempo grid. The shift is measured against the audio clock,
   * never accumulated per tick (FR-009).
   */
  function recoverFromStall(now) {
    const next = nextUnscheduledTime();
    if (next >= now) return;
    origin += now + START_OFFSET_SECONDS - next;
  }

  function tick() {
    if (!running) return;
    /*
     * A mobile browser can suspend a context without firing statechange, and
     * scheduling into a suspended context is silence with no error. Reading
     * the state here is what catches that (AC-4.1.5, revised 2026-09-19) —
     * the page merely being hidden no longer stands in for it.
     */
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      transport._handleSuspend();
      return;
    }
    const now = ctx.currentTime;
    const gap = now - lastTick;
    lastTick = now;
    if (gap * STALL_MARGIN > lookahead) {
      lookahead = Math.min(gap * STALL_MARGIN, MAX_LOOKAHEAD_SECONDS);
    }
    recoverFromStall(now);
    scheduleUntil(now + lookahead);
    flushVisuals();
  }

  /**
   * Visual updates fire from the scheduled queue as their audio time arrives —
   * the same list the audio came from, so they cannot drift apart.
   */
  function flushVisuals() {
    const now = ctx.currentTime;
    while (pendingVisuals.length > 0 && pendingVisuals[0].when <= now) {
      const { position } = pendingVisuals.shift();
      onPosition?.(position);
    }
  }

  /*
   * The visual half of the throttling the lookahead above already survives
   * (AC-4.1.2). Widening the lookahead keeps the AUDIO on the grid, because
   * events are handed to Web Audio far ahead of when they sound. It does
   * nothing for the highlight, which is flushed from inside the same clamped
   * tick — so on a browser polling once a second the audio is correct and the
   * highlight is up to a whole clamp behind it. Heard from a Samsung TV as the
   * sound running more than a beat ahead of the lit Slot at 80 BPM.
   *
   * An animation frame is driven by the compositor, not the timer, and keeps
   * arriving at the panel's refresh while setInterval is clamped. It is a
   * FLUSH ONLY: it never schedules audio and never touches the origin, so
   * nothing about what is heard depends on it running — a browser with no
   * requestAnimationFrame at all keeps exactly today's tick-driven highlight.
   * The queue is still read against `ctx.currentTime`, so the frame decides
   * only how often the queue is looked at, never what time an event carries.
   */
  function requestFrame(cb) {
    return typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame(cb) : null;
  }

  function frameLoop() {
    if (!running) {
      frame = null;
      return;
    }
    flushVisuals();
    frame = requestFrame(frameLoop);
  }

  function stopFrameLoop() {
    if (frame !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(frame);
    }
    frame = null;
  }

  /** A count-in Measure of clicks before the Pattern starts (US-4.3). */
  function scheduleCountIn() {
    if (!settings.countInEnabled || beatGrid.length === 0) return 0;
    const first = pattern.measures[0];
    const beatDuration = loopDuration / totalBeats();
    const count = first.beats.length;
    for (let i = 0; i < count; i++) {
      playClick(ctx, master, { downbeat: i === 0, when: origin + i * beatDuration });
    }
    return count * beatDuration;
  }

  const totalBeats = () => pattern.measures.reduce((n, m) => n + m.beats.length, 0);

  // Named rather than returned anonymously, so `tick` can reach the suspend
  // handler that a context found already suspended has to go through.
  const transport = {
    get isRunning() {
      return running;
    },

    /** MUST be called from a user-gesture handler (FR-010, FR-011). */
    async start(nextPattern, nextSettings = settings) {
      pattern = nextPattern;
      settings = nextSettings;

      // resume() may hand back a REPLACEMENT context when the old one was left
      // dead by an OS suspension (AC-4.1.10/2) — so take what it returns, and
      // rebuild the master gain when it no longer belongs to this context.
      ctx = await resume();

      if (!master || master.context !== ctx) {
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
      }

      timeline = buildTimeline(pattern, 0);
      beatGrid = buildBeatGrid(pattern);
      loopDuration = loopDurationSeconds(pattern);

      // A small offset so the first events are scheduled ahead of the clock
      // rather than in the past.
      origin = ctx.currentTime + 0.06;
      countInSeconds = scheduleCountIn();

      nextLoop = 0;
      nextIndex = 0;
      nextBeatIndex = 0;
      loopOffset = 0;
      pending = null;
      pendingVisuals.length = 0;
      running = true;

      // Every start (fresh Play or a restart) begins a new run at loop 0
      // (AC-4.2.2), reported directly rather than left to whenever the first
      // loop happens to complete.
      onLoop?.(0);

      // The device taking audio away pauses the run — position held, nothing
      // scheduled or sounding — and best-effort auto-resumes it from the same
      // place once the context comes back (AC-4.1.5, AC-4.1.6). A context that
      // never comes back falls back to today's stop-and-reset.
      this._unwatchSuspend = onSuspended(() => this._handleSuspend());
      this._unwatchResume = onResumed(() => this._handleResume());

      lastTick = ctx.currentTime;
      tick();
      ticker?.stop();
      ticker = startTicking(ctx, tick);
      stopFrameLoop();
      frame = requestFrame(frameLoop);
    },

    stop(silent = false) {
      if (!running && !suspendedForRecovery) return;
      running = false;
      suspendedForRecovery = false;
      ticker?.stop();
      ticker = null;
      stopFrameLoop();
      pendingVisuals.length = 0;
      this._unwatchSuspend?.();
      this._unwatchResume?.();
      if (!silent) onStop?.();
    },

    /**
     * The device took audio away mid-run (AC-4.1.5). Scheduling and sounding
     * stop at once — nothing is scheduled or sounds while suspended — but the
     * pass and the position within it are held rather than reset, so a
     * recovered context can pick the run up from exactly here (AC-4.1.6).
     */
    _handleSuspend() {
      if (!running) return;
      running = false;
      ticker?.stop();
      ticker = null;
      stopFrameLoop();
      pendingVisuals.length = 0;
      suspendedForRecovery = true;
      onSuspend?.();
    },

    /**
     * The device offered the context back (AC-4.1.6). Best-effort: a context
     * that comes back running re-anchors the origin exactly as a throttled
     * timer's stall does (`recoverFromStall`) and the run continues from the
     * same loop and Slot it paused at — no restart, no reset. A context that
     * stays stuck (`resume()`'s STUCK_STATES replace-and-close already having
     * had its say) falls back to today's stop-and-reset, unchanged.
     *
     * A REPLACED context also falls back rather than continuing in place: its
     * clock starts from a new origin unrelated to the suspended context's, so
     * `origin` — anchored against the old context's `currentTime` — cannot be
     * reused against it, and that is not "the same run it interrupted"
     * (AC-4.1.6's own wording). AC-4.1.10/2's gesture-time recovery is what
     * rebuilds the graph against a replacement, at a fresh Play.
     */
    async _handleResume() {
      if (!suspendedForRecovery) return;
      const suspendedCtx = ctx;
      const next = await resume();
      if (next.state !== 'running' || next !== suspendedCtx) {
        this.stop();
        return;
      }
      suspendedForRecovery = false;
      ctx = next;
      if (!master || master.context !== ctx) {
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
      }
      lastTick = ctx.currentTime;
      recoverFromStall(ctx.currentTime);
      running = true;
      tick();
      ticker?.stop();
      ticker = startTicking(ctx, tick);
      stopFrameLoop();
      frame = requestFrame(frameLoop);
      onResume?.();
    },

    /**
     * Tempo change restarts from the top at the new tempo and resets the loop
     * counter, rather than retiming in place (AC-4.2.2).
     *
     * The stop() half of this is an internal implementation detail, not the
     * musician stopping playback, so it must not fire the `onStop` notification
     * — that notification means "reset to the top and require a deliberate Play"
     * (AC-4.1.5, AC-4.1.6), which is exactly the opposite of what a restart does.
     */
    async restart(nextPattern, nextSettings) {
      const wasRunning = running;
      this.stop(/* silent */ true);
      if (wasRunning) await this.start(nextPattern, nextSettings);
    },

    /**
     * A content edit made while playing: the current pass finishes under the
     * Pattern as it sounded, and the next pass plays the edit (AC-4.1.9).
     * Only the latest edit matters — a newer one simply replaces the pending
     * one. A stopped transport ignores this; the next start() reads state.
     */
    update(nextPattern, nextSettings) {
      if (!running) return;
      pending = { pattern: nextPattern, settings: nextSettings };
    },

    /** Test seam: the absolute time an event would sound at. */
    _eventTime: (loop, offset) => eventTime(loop, offset),

    /**
     * Seconds of Pattern heard since this run began, past any count-in — what
     * a background render is seeked to when it takes the sound over
     * (AC-4.1.15/2). Read against the audio clock, like everything else here,
     * so a suspended context reports the moment it stopped rather than drifting.
     */
    elapsed() {
      if (!ctx) return 0;
      return Math.max(0, ctx.currentTime - origin - countInSeconds);
    },

    /** Test seam: what the transport is actually sounding right now. */
    _snapshot: () => ({
      pattern,
      loopDuration,
      timelineLength: timeline.length,
      pendingEdit: Boolean(pending),
      lookaheadSeconds: lookahead,
      suspendedForRecovery,
      /** `'worklet'` or `'timer'`, or null when stopped (AC-4.1.14). */
      tickSource: ticker?.source ?? null,
    }),
  };

  return transport;
}
