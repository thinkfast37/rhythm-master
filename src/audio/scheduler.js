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
import { getContext, resume, onSuspended } from './context.js';
import { playPercussive, playClick } from './voices.js';

/** How far ahead events are scheduled, and how often we top up. */
const LOOKAHEAD_SECONDS = 0.2;
const POLL_MS = 25;

export function createTransport({ onPosition, onLoop, onStop, playMelodic = null } = {}) {
  let ctx = null;
  let master = null;
  let timer = null;

  /** Absolute audio-clock time of loop 0, Slot 0. Never mutated once set. */
  let origin = 0;
  let loopDuration = 0;
  let timeline = [];
  let beatGrid = [];
  let pattern = null;
  let settings = { metronomeEnabled: false, countInEnabled: false };

  /** Index of the next event to schedule, as a running (loop, index) cursor. */
  let nextLoop = 0;
  let nextIndex = 0;
  let nextBeatLoop = 0;
  let nextBeatIndex = 0;
  let countInSeconds = 0;
  let running = false;
  const pendingVisuals = [];

  function eventTime(loop, offset) {
    return origin + countInSeconds + loop * loopDuration + offset;
  }

  function scheduleUntil(horizon) {
    // Pattern events
    while (timeline.length > 0) {
      const event = timeline[nextIndex];
      const when = eventTime(nextLoop, event.timeSeconds);
      if (when > horizon) break;

      if (event.pitch && playMelodic) playMelodic(ctx, master, event, when);
      else playPercussive(ctx, master, event.accent, when);

      pendingVisuals.push({ when, position: { ...event, loop: nextLoop } });

      nextIndex += 1;
      if (nextIndex >= timeline.length) {
        nextIndex = 0;
        nextLoop += 1;
        onLoop?.(nextLoop);
      }
    }

    // Metronome, on Beats rather than Slots
    if (settings.metronomeEnabled) {
      while (beatGrid.length > 0) {
        const beat = beatGrid[nextBeatIndex];
        const when = eventTime(nextBeatLoop, beat.timeSeconds);
        if (when > horizon) break;
        playClick(ctx, master, { downbeat: beat.isDownbeat, when });
        nextBeatIndex += 1;
        if (nextBeatIndex >= beatGrid.length) {
          nextBeatIndex = 0;
          nextBeatLoop += 1;
        }
      }
    }
  }

  function tick() {
    if (!running) return;
    scheduleUntil(ctx.currentTime + LOOKAHEAD_SECONDS);
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

      ctx = getContext();
      await resume();

      if (!master) {
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
      nextBeatLoop = 0;
      nextBeatIndex = 0;
      pendingVisuals.length = 0;
      running = true;

      // Every start (fresh Play or a restart) begins a new run at loop 0
      // (AC-4.2.2), reported directly rather than left to whenever the first
      // loop happens to complete.
      onLoop?.(0);

      // The device taking audio away stops and resets; it never auto-resumes
      // on return (AC-4.1.5, AC-4.1.6).
      this._unwatch = onSuspended(() => this.stop());

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

    /** Test seam: the absolute time an event would sound at. */
    _eventTime: (loop, offset) => eventTime(loop, offset),
  };
}
