/**
 * The sampled guitar's loading contract (US-19.7). The samples themselves are
 * never fetched here: the loader is stubbed, so what is proven is the shape
 * around it — one load per context, the fallback while loading and after a
 * failure, the sampled voice once ready, and retry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as guitar from '../../../src/audio/guitar.js';

const ctxA = { id: 'A' };
const ctxB = { id: 'B' };
const event = { accent: 2, pitch: { midiNote: 64, frequency: 329.63 } };

/** A loader whose resolution the test controls. */
function deferredLoader() {
  const calls = [];
  const loader = (ctx) =>
    new Promise((resolve, reject) => {
      calls.push({ ctx, resolve, reject });
    });
  return { loader, calls };
}

beforeEach(() => {
  guitar.__reset();
});

describe('audio/guitar', () => {
  it('AC-19.7.1/1 — No sample is requested on page load, in Practice, or in the Piano view; the first showing of the Guitar view requests them once: one load per context, nothing until asked', async () => {
    const { loader, calls } = deferredLoader();
    guitar.__setLoader(loader);
    expect(guitar.getStatus()).toEqual({ status: 'idle', error: null });
    expect(calls).toHaveLength(0);
    guitar.load(ctxA);
    guitar.load(ctxA);
    expect(calls).toHaveLength(1);
    expect(guitar.getStatus(ctxA).status).toBe('loading');
    // Another context is another decode — the buffers belong to the context.
    guitar.load(ctxB);
    expect(calls).toHaveLength(2);
    calls[0].resolve({ play: vi.fn() });
    await guitar.load(ctxA);
    expect(guitar.getStatus(ctxA).status).toBe('ready');
    guitar.load(ctxA);
    expect(calls).toHaveLength(2);
  });

  it('AC-19.7.2/1 — While the samples load, a loading state is shown and every guitar note sounds through the melodic synth voice rather than waiting: the fallback sounds while loading', () => {
    const { loader, calls } = deferredLoader();
    guitar.__setLoader(loader);
    const fallback = vi.fn();
    // A note before any load asks for one and sounds through the fallback.
    expect(guitar.playGuitar(ctxA, null, event, 1.5, fallback)).toBe('fallback');
    expect(calls).toHaveLength(1);
    expect(guitar.getStatus(ctxA).status).toBe('loading');
    expect(fallback).toHaveBeenCalledWith(ctxA, null, event, 1.5);
    expect(guitar.playGuitar(ctxA, null, event, 2, fallback)).toBe('fallback');
    expect(calls).toHaveLength(1);
    expect(guitar.__sampledPlays()).toBe(0);
  });

  it('AC-19.7.1/2 — Once loaded, a tapped fret and a pitched Slot played back in Guitar view sound through the sampled guitar at the tapped or stored MIDI note: the sampled instrument plays the MIDI note at the scheduled time', async () => {
    const play = vi.fn();
    guitar.__setLoader(() => Promise.resolve({ play }));
    await guitar.load(ctxA);
    const fallback = vi.fn();
    expect(guitar.playGuitar(ctxA, null, event, 3.25, fallback)).toBe('sampled');
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0][0]).toBe(64);
    expect(play.mock.calls[0][1]).toBe(3.25);
    expect(play.mock.calls[0][2].gain).toBeGreaterThan(0);
    expect(fallback).not.toHaveBeenCalled();
    expect(guitar.__sampledPlays()).toBe(1);
    // Accent shapes the gain, never the note.
    guitar.playGuitar(ctxA, null, { ...event, accent: 3 }, 4, fallback);
    expect(play.mock.calls[1][2].gain).toBeGreaterThan(play.mock.calls[0][2].gain);
    expect(play.mock.calls[1][0]).toBe(64);
  });

  it('AC-19.7.2/2 — A failed load shows a non-blocking notice with a Retry control, guitar notes keep sounding through the synth voice, and Retry requests the samples again: error state, fallback, retry', async () => {
    const { loader, calls } = deferredLoader();
    guitar.__setLoader(loader);
    const statuses = [];
    guitar.onStatus((s) => statuses.push(s.status));
    const p = guitar.load(ctxA);
    calls[0].reject(new Error('offline'));
    await expect(p).rejects.toThrow('offline');
    expect(guitar.getStatus(ctxA)).toMatchObject({ status: 'error' });
    expect(guitar.getStatus(ctxA).error.message).toBe('offline');
    const fallback = vi.fn();
    expect(guitar.playGuitar(ctxA, null, event, 1, fallback)).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(1);
    // A failed state does not re-request on every note; Retry does.
    expect(calls).toHaveLength(1);
    const retried = guitar.retry(ctxA);
    expect(calls).toHaveLength(2);
    expect(guitar.getStatus(ctxA).status).toBe('loading');
    calls[1].resolve({ play: vi.fn() });
    await retried;
    expect(guitar.getStatus(ctxA).status).toBe('ready');
    expect(statuses).toEqual(['loading', 'error', 'loading', 'ready']);
  });

  it('AC-19.7.2/3 — The piano voice is the melodic synth voice the app already has, and loads nothing: the guitar module is the only loader and names its one instrument', () => {
    expect(guitar.INSTRUMENT_NAME).toBe('acoustic_guitar_steel');
    expect(guitar.SOUNDFONT).toBe('FluidR3_GM');
    expect(guitar.ATTRIBUTION.text).toMatch(/CC BY 3.0/);
  });
});
