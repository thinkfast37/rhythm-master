/**
 * The background render (AC-4.1.15).
 *
 * iOS suspends Web Audio when the screen locks, and nothing a page can do
 * changes that — AC-4.1.12's keep-alive holds the *media session*, which is
 * why the lock screen keeps showing the app, but the synthesis stops dead.
 *
 * A media element is the one thing iOS does keep playing with the screen off.
 * So the run is rendered ahead of time into an audio file and handed to the
 * element already playing: when the screen goes dark, the element takes the
 * sound over from the live transport, and hands it back on waking.
 *
 * What is rendered is the whole cycle — every pass until the fills and
 * progressions in force repeat — so a cycling practice run keeps cycling with
 * the screen off rather than freezing on one chord. The catalogues are large
 * (31 fills, 114 progressions), so a full progression cycle can reach several
 * minutes; `MAX_BYTES` is the ceiling that keeps a phone's memory out of it,
 * and a cycle past it renders the whole passes that fit in `FALLBACK_SECONDS`
 * and repeats those.
 *
 * The audio comes from the same voices the transport plays — `playPercussive`,
 * `playMelodic`, `playClick`, each taking its context as an argument — so what
 * is heard with the screen off is the same synthesis, not an approximation of
 * it. `core/timeline` decides when every event sounds, here as everywhere
 * (Constitution: one timeline).
 */
import { buildTimeline, loopDurationSeconds, buildBeatGrid } from '../core/timeline.js';
import { playPercussive, playClick } from './voices.js';
import { playMelodic } from './melodic.js';

/** 16-bit mono: two bytes a frame. */
const BYTES_PER_FRAME = 2;

/** Roughly 30 MB — the most of a phone's memory this may hold. */
const MAX_BYTES = 30 * 1024 * 1024;

/** What a cycle too long for the ceiling renders instead, in seconds. */
const FALLBACK_SECONDS = 180;

/**
 * How many of `passes` to render, and how long that is.
 *
 * The whole cycle when it fits under the ceiling; otherwise the whole passes
 * that fit in FALLBACK_SECONDS, and never fewer than one — a single pass is
 * always worth rendering however long it is.
 */
export function planRender(passSeconds, sampleRate) {
  const total = passSeconds.reduce((n, s) => n + s, 0);
  if (total * sampleRate * BYTES_PER_FRAME <= MAX_BYTES) {
    return { passes: passSeconds.length, seconds: total, whole: true };
  }

  let seconds = 0;
  let passes = 0;
  for (const s of passSeconds) {
    if (passes > 0 && seconds + s > FALLBACK_SECONDS) break;
    seconds += s;
    passes += 1;
  }
  return { passes, seconds, whole: passes === passSeconds.length };
}

/** A 16-bit mono WAV of an AudioBuffer's first channel. */
export function encodeWav(buffer) {
  const samples = buffer.getChannelData(0);
  const bytes = new Uint8Array(44 + samples.length * BYTES_PER_FRAME);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * BYTES_PER_FRAME, true);
  view.setUint16(32, BYTES_PER_FRAME, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * BYTES_PER_FRAME, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamped before scaling: the compressor keeps peaks in range, but a
    // wrapped sample is a click and is not worth risking for a branch.
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * BYTES_PER_FRAME, Math.round(sample * 32767), true);
  }
  return bytes;
}

/**
 * Render `patternAt(pass)` for each pass of the cycle into a WAV Blob.
 *
 * Returns `{ url, seconds, passes, whole }`, or null when this browser has no
 * OfflineAudioContext or the render fails — in which case the run simply does
 * without the handover, exactly as it did before this module existed.
 *
 * The caller revokes `url` when it is done with it.
 */
export async function renderCycle({ patternAt, passes, settings, sampleRate }) {
  const Offline = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
  if (typeof Offline !== 'function' || passes < 1) return null;

  const patterns = [];
  const passSeconds = [];
  for (let pass = 0; pass < passes; pass++) {
    const pattern = patternAt(pass);
    patterns.push(pattern);
    passSeconds.push(loopDurationSeconds(pattern));
  }

  const plan = planRender(passSeconds, sampleRate);
  const frames = Math.ceil(plan.seconds * sampleRate);
  if (frames < 1) return null;

  let buffer;
  try {
    const ctx = new Offline(1, frames, sampleRate);
    let at = 0;
    for (let pass = 0; pass < plan.passes; pass++) {
      const pattern = patterns[pass];
      for (const event of buildTimeline(pattern, pass)) {
        const when = at + event.timeSeconds;
        if (event.pitch) playMelodic(ctx, null, event, when);
        else playPercussive(ctx, null, event.accent, when);
      }
      if (settings.metronomeEnabled) {
        for (const beat of buildBeatGrid(pattern)) {
          playClick(ctx, null, { downbeat: beat.isDownbeat, when: at + beat.timeSeconds });
        }
      }
      at += passSeconds[pass];
    }
    buffer = await ctx.startRendering();
  } catch {
    // A browser that cannot render this offline keeps the live transport and
    // loses only the handover.
    return null;
  }

  const url = URL.createObjectURL(new Blob([encodeWav(buffer)], { type: 'audio/wav' }));
  return { url, seconds: plan.seconds, passes: plan.passes, whole: plan.whole };
}
