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
import { resume, onSuspended } from './context.js';
import { playPercussive, playClick } from './voices.js';

/** How far ahead events are scheduled, and how often we top up. */
const LOOKAHEAD_SECONDS = 0.2;
const POLL_MS = 25;

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

export function createTransport({ onPosition, onLoop, onStop, playMelodic = null } = {}) {
  let ctx = null;
  let master = null;
  let timer = null;

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
  const pendingVisuals = [];

  /** Adaptive horizon (see MAX_LOOKAHEAD_SECONDS above). Kept across starts:
   *  a browser that throttled once will throttle the next run too. */
  let lookahead = LOOKAHEAD_SECONDS;
  /** Audio-clock time of the previous tick, for measuring timer gaps. */
  let lastTick = 0;

  function eventTime(loop, offset) {
    return origin + countInSeconds + loop * loopDuration + offset;
  }

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
        timeline = buildTimeline(pattern);
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

  return {
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

      timeline = buildTimeline(pattern);
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

      // The device taking audio away stops and resets; it never auto-resumes
      // on return (AC-4.1.5, AC-4.1.6).
      this._unwatch = onSuspended(() => this.stop());

      lastTick = ctx.currentTime;
      tick();
      timer = setInterval(tick, POLL_MS);
    },

    stop(silent = false) {
      if (!running) return;
      running = false;
      clearInterval(timer);
      timer = null;
      pendingVisuals.length = 0;
      this._unwatch?.();
      if (!silent) onStop?.();
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

    /** Test seam: what the transport is actually sounding right now. */
    _snapshot: () => ({
      pattern,
      loopDuration,
      timelineLength: timeline.length,
      pendingEdit: Boolean(pending),
      lookaheadSeconds: lookahead,
    }),
  };
}
