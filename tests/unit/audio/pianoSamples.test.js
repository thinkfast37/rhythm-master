/**
 * The piano's loading contract (US-2.13). Nothing is fetched from the network
 * here: the fetcher is stubbed, so what is proven is the shape around it —
 * nothing until asked, each recording once and from the app's own origin, the
 * synth while loading and after a failure, the recordings once ready, Retry,
 * and the render's own context.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as piano from '../../../src/audio/pianoSamples.js';
import { PIANO_SAMPLE_NOTES, pianoSampleFile, pianoSampleFor } from '../../../src/core/voice.js';
import { fakeContext } from './fakeAudio.js';

const note = (midiNote, accent = 2) => ({ accent, pitch: { midiNote, frequency: 440 * 2 ** ((midiNote - 69) / 12) } });

/** A fetcher whose responses the test releases. */
function deferredFetcher() {
  const calls = [];
  const fetcher = (url) =>
    new Promise((resolve, reject) => {
      calls.push({ url, resolve: () => resolve(new ArrayBuffer(8)), reject });
    });
  return { fetcher, calls, releaseAll: () => calls.forEach((c) => c.resolve()) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  piano.__reset();
});

describe('audio/pianoSamples — loading', () => {
  it("AC-2.13.4/1 — The recordings are served from the app's own origin, and none is requested on page load; the first moment the piano could sound — Play, a note sounded at once, or choosing Piano — requests them, each once: nothing until asked, then every recording once, by a same-origin path", async () => {
    const { fetcher, calls, releaseAll } = deferredFetcher();
    piano.__setFetcher(fetcher);
    expect(piano.getStatus()).toEqual({ status: 'idle', error: null });
    await settle();
    expect(calls).toHaveLength(0);

    const ctx = fakeContext();
    piano.load(ctx);
    piano.load(ctx);
    await settle();
    expect(calls).toHaveLength(PIANO_SAMPLE_NOTES.length);
    for (const c of calls) expect(c.url).toMatch(/^\/audio\/piano\/[A-G]s?\d\.mp3$/);
    expect(piano.getStatus(ctx).status).toBe('loading');

    releaseAll();
    await piano.load(ctx);
    expect(piano.getStatus(ctx).status).toBe('ready');
    // A second context decodes again but fetches nothing new.
    const other = fakeContext();
    await piano.load(other);
    expect(calls).toHaveLength(PIANO_SAMPLE_NOTES.length);
    expect(other.decoded).toHaveLength(PIANO_SAMPLE_NOTES.length);
  });

  it("AC-2.13.4/1 — The recordings are served from the app's own origin, and none is requested on page load; the first moment the piano could sound — Play, a note sounded at once, or choosing Piano — requests them, each once: every recording the sampler asks for ships in public/audio/piano", () => {
    for (const s of PIANO_SAMPLE_NOTES) {
      const path = fileURLToPath(new URL(`../../../public/audio/piano/${pianoSampleFile(s)}`, import.meta.url));
      expect(existsSync(path), pianoSampleFile(s)).toBe(true);
    }
  });

  it("AC-2.13.4/2 — While a note's recording is not ready, the note sounds through the synth instead, and the voice switch shows the piano loading: the fallback sounds, and the load is asked for", async () => {
    const { fetcher, calls } = deferredFetcher();
    piano.__setFetcher(fetcher);
    const ctx = fakeContext();
    const fallback = vi.fn();
    expect(piano.playPiano(ctx, null, note(60), 1.5, fallback)).toBe('fallback');
    expect(fallback).toHaveBeenCalledWith(ctx, null, note(60), 1.5);
    expect(piano.getStatus(ctx).status).toBe('loading');
    await settle();
    expect(calls).toHaveLength(PIANO_SAMPLE_NOTES.length);
    expect(piano.playPiano(ctx, null, note(60), 2, fallback)).toBe('fallback');
    expect(ctx.sources).toHaveLength(0);
    expect(piano.__sampledPlays()).toBe(0);
  });

  it('AC-2.13.4/3 — A failed load shows a non-blocking notice with Retry beside the voice switch; notes keep sounding through the synth, and Retry requests the recordings again: a failure stands until Retry, which refetches only what failed', async () => {
    let fail = true;
    const urls = [];
    piano.__setFetcher((url) => {
      urls.push(url);
      return fail && url.endsWith('/C4.mp3') ? Promise.reject(new Error('offline')) : Promise.resolve(new ArrayBuffer(8));
    });
    const seen = [];
    piano.onStatus((s) => seen.push(s.status));
    const ctx = fakeContext();
    await expect(piano.load(ctx)).rejects.toThrow('offline');
    expect(piano.getStatus(ctx).status).toBe('error');
    expect(seen).toEqual(['loading', 'error']);

    // Notes keep sounding: through the synth for the missing recording, and a
    // failure is not retried by a note.
    const fallback = vi.fn();
    expect(piano.playPiano(ctx, null, note(60), 1, fallback)).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(1);
    const before = urls.length;
    await settle();
    expect(urls.length).toBe(before);

    fail = false;
    await piano.retry(ctx);
    expect(piano.getStatus(ctx).status).toBe('ready');
    expect(urls.slice(before)).toEqual(['/audio/piano/C4.mp3']);
    expect(piano.playPiano(ctx, null, note(60), 2, fallback)).toBe('sampled');
  });
});

describe('audio/pianoSamples — the Piano view', () => {
  it("AC-19.7.2/3 — The Piano view's sampled piano falls back the same way: while its recordings load, or when they cannot, each note sounds through the synth", async () => {
    const { fetcher, calls } = deferredFetcher();
    piano.__setFetcher(fetcher);
    const ctx = fakeContext();
    const fallback = vi.fn();
    // Loading: the synth sounds.
    expect(piano.playPiano(ctx, null, note(64), 1, fallback)).toBe('fallback');
    await settle();
    // Cannot: every request fails, and the synth still sounds.
    for (const c of calls) c.reject(new Error('offline'));
    await expect(piano.load(ctx)).rejects.toThrow('offline');
    expect(piano.playPiano(ctx, null, note(64), 2, fallback)).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(ctx.sources).toHaveLength(0);
  });
});

describe('audio/pianoSamples — playing', () => {
  it('AC-2.13.2/1 — Under Piano, a melodic note sounds through the Salamander Grand recording nearest its MIDI note, re-pitched to that note, louder at each stronger Accent Level: the decoded recording, its rate, and a gain per accent', async () => {
    piano.__setFetcher(() => Promise.resolve(new ArrayBuffer(8)));
    const ctx = fakeContext();
    await piano.load(ctx);
    const fallback = vi.fn();
    const peaks = [];
    for (const [i, accent] of [1, 2, 3].entries()) {
      const midi = 61 + i * 5;
      expect(piano.playPiano(ctx, null, note(midi, accent), 1 + i, fallback)).toBe('sampled');
      const source = ctx.sources.at(-1);
      expect(source.started).toBe(1 + i);
      expect(source.playbackRate.value).toBeCloseTo(pianoSampleFor(midi).playbackRate, 9);
      const gain = source.connected[0];
      peaks.push(gain.gain.calls[0][1]);
      // Into the shared compressor, which feeds the speakers.
      expect(gain.connected[0].kind).toBe('compressor');
    }
    expect(fallback).not.toHaveBeenCalled();
    expect(peaks[0]).toBeLessThan(peaks[1]);
    expect(peaks[1]).toBeLessThan(peaks[2]);
    expect(piano.__sampledPlays()).toBe(3);
  });

  it('AC-2.13.2/1 — Under Piano, a melodic note sounds through the Salamander Grand recording nearest its MIDI note, re-pitched to that note, louder at each stronger Accent Level: a key struck again damps what it was sounding', async () => {
    piano.__setFetcher(() => Promise.resolve(new ArrayBuffer(8)));
    const ctx = fakeContext();
    await piano.load(ctx);
    piano.playPiano(ctx, null, note(64), 1, vi.fn());
    const first = ctx.sources[0].connected[0];
    piano.playPiano(ctx, null, note(64), 1.25, vi.fn());
    expect(first.gain.calls.some(([m, t]) => (m === 'cancelAndHoldAtTime' || m === 'cancelScheduledValues') && t === 1.25)).toBe(true);
    expect(first.gain.calls.some(([m, , t]) => m === 'setTargetAtTime' && t === 1.25)).toBe(true);
    // A different key leaves it ringing.
    piano.playPiano(ctx, null, note(67), 1.3, vi.fn());
    const second = ctx.sources[1].connected[0];
    expect(second.gain.calls.some(([m]) => m === 'setTargetAtTime')).toBe(false);
  });

  it("AC-2.13.5/1 — With the piano in force and its recordings loaded, the render sounds its melodic notes through the piano; with them not loaded, through the synth: prepare decodes on the render's context only once the live one is ready", async () => {
    const { fetcher, releaseAll } = deferredFetcher();
    piano.__setFetcher(fetcher);
    const live = fakeContext();
    const offline = fakeContext();
    piano.load(live);
    expect(await piano.prepare(offline)).toBe(false);
    expect(offline.decoded).toHaveLength(0);
    await settle();
    releaseAll();
    await piano.load(live);
    expect(await piano.prepare(offline)).toBe(true);
    expect(offline.decoded).toHaveLength(PIANO_SAMPLE_NOTES.length);
    expect(piano.playPiano(offline, null, note(60), 0.5, vi.fn())).toBe('sampled');
    // The live context's status is untouched by the render's.
    expect(piano.getStatus().status).toBe('ready');
  });
});
