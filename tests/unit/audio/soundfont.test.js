/**
 * The fetched voices of US-19.12: the electric guitar, bass, sax and trumpet,
 * each a FluidR3_GM instrument behind the loader the guitar has always used.
 * The loader is stubbed; what is proven is which instrument each asks for,
 * that a held voice lets go of a part's note when its next begins, and that a
 * part's volume scales the level the sample is played at.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSoundfontVoice } from '../../../src/audio/soundfont.js';
import { fetched, PLAYERS, isFetched, statusOf } from '../../../src/audio/instruments.js';
import { VOICES, volumeGain } from '../../../src/core/voice.js';
import { ACCENT_AMPS } from '../../../src/audio/voices.js';

const ctx = { id: 'A' };
const note = (midiNote, extra = {}) => ({ accent: 2, pitch: { midiNote, frequency: 440 }, ...extra });

/** A fake soundfont instrument: every played note is a node whose stop is recorded. */
function fakeInstrument() {
  const nodes = [];
  return {
    nodes,
    play: vi.fn((midi, when, options) => {
      const node = { midi, when, options, stop: vi.fn() };
      nodes.push(node);
      return node;
    }),
  };
}

async function ready(voice) {
  const instrument = fakeInstrument();
  voice.seams.setLoader(() => Promise.resolve(instrument));
  await voice.load(ctx);
  return instrument;
}

beforeEach(() => {
  for (const id of Object.keys(fetched)) fetched[id].seams.reset();
});

describe('audio/soundfont — the fetched instruments', () => {
  it('AC-19.12.5/1 — Electric guitar, Bass, Sax and Trumpet are the FluidR3_GM `overdriven_guitar`, `electric_bass_finger`, `alto_sax` and `trumpet` samples, each requested once, when a part in the Composer is first set to it or at the first melodic note in Practice under it, and never on page load', async () => {
    expect({ electric: fetched.electric.name, bass: fetched.bass.name, sax: fetched.sax.name, trumpet: fetched.trumpet.name }).toEqual({
      electric: 'overdriven_guitar',
      bass: 'electric_bass_finger',
      sax: 'alto_sax',
      trumpet: 'trumpet',
    });
    // Every instrument has a player, and only the five are fetched.
    expect(Object.keys(PLAYERS).sort()).toEqual([...VOICES].sort());
    expect(VOICES.filter(isFetched)).toEqual(['guitar', 'electric', 'bass', 'sax', 'trumpet', 'flute']);
    for (const id of ['electric', 'bass', 'sax', 'trumpet']) {
      const voice = fetched[id];
      const loader = vi.fn(() => new Promise(() => {}));
      voice.seams.setLoader(loader);
      // Nothing until asked: making the voice requests nothing.
      expect(loader).not.toHaveBeenCalled();
      expect(statusOf(id).status).toBe('idle');
      // The first note asks, once, and later notes do not ask again.
      const fallback = vi.fn();
      expect(voice.play(ctx, null, note(60), 1, fallback)).toBe('fallback');
      voice.play(ctx, null, note(62), 2, fallback);
      voice.load(ctx);
      expect(loader).toHaveBeenCalledTimes(1);
      expect(statusOf(id, ctx).status).toBe('loading');
    }
  });

  it("AC-19.12.5/2 — While an instrument's samples load, or when they cannot, its notes sound through the synth; the record bar in the Composer and the voice switch in Practice say which instrument is loading, and a failure shows a non-blocking notice with Retry, which requests the samples again: fallback while loading and after failure, one voice failing alone, and retry", async () => {
    const sax = fetched.sax;
    let fail;
    const loader = vi.fn(() => new Promise((_, reject) => (fail = reject)));
    sax.seams.setLoader(loader);
    const fallback = vi.fn();
    expect(sax.play(ctx, null, note(60), 1, fallback)).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(1);
    fail(new Error('offline'));
    await sax.load(ctx).catch(() => {});
    expect(sax.getStatus(ctx).status).toBe('error');
    expect(sax.play(ctx, null, note(60), 2, fallback)).toBe('fallback');
    expect(fallback).toHaveBeenCalledTimes(2);
    // A failure stands until Retry: a note does not hammer the CDN.
    expect(loader).toHaveBeenCalledTimes(1);
    // The trumpet is untouched by the sax failing.
    expect(fetched.trumpet.getStatus(ctx).status).toBe('idle');
    const instrument = fakeInstrument();
    sax.seams.setLoader(() => Promise.resolve(instrument));
    await sax.retry(ctx);
    expect(sax.getStatus(ctx).status).toBe('ready');
    expect(sax.play(ctx, null, note(60), 3, fallback)).toBe('sampled');
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it("AC-19.12.5/3 — On Electric guitar, Bass, Sax and Trumpet a note is held until that part's next note begins or its recording ends; Piano, Synth and Guitar ring as they did", async () => {
    for (const id of ['electric', 'bass', 'sax', 'trumpet']) {
      expect(fetched[id].held).toBe(true);
      const instrument = await ready(fetched[id]);
      fetched[id].play(ctx, null, note(60), 1);
      fetched[id].play(ctx, null, note(62), 1.5);
      fetched[id].play(ctx, null, note(64), 2);
      // Each note is let go exactly when the next of its part begins; the last rings on.
      expect(instrument.nodes[0].stop).toHaveBeenCalledWith(1.5);
      expect(instrument.nodes[1].stop).toHaveBeenCalledWith(2);
      expect(instrument.nodes[2].stop).not.toHaveBeenCalled();
    }
    // Another part's note stops nothing of this part's: two parts on one instrument both sound.
    const sax = fetched.sax;
    sax.seams.reset();
    const instrument = await ready(sax);
    sax.play(ctx, null, note(60, { layer: 1 }), 1);
    sax.play(ctx, null, note(67, { layer: 2 }), 1);
    sax.play(ctx, null, note(69, { layer: 2 }), 1.5);
    expect(instrument.nodes[0].stop).not.toHaveBeenCalled();
    expect(instrument.nodes[1].stop).toHaveBeenCalledWith(1.5);
    // A tap never cuts off a note the transport has queued ahead of it.
    sax.play(ctx, null, note(72, { layer: 1 }), 5);
    sax.play(ctx, null, note(74, { tap: true }), 4);
    expect(instrument.nodes[3].stop).not.toHaveBeenCalled();
    // The guitar rings: nothing stops a note.
    expect(fetched.guitar.held).toBe(false);
    const strings = await ready(fetched.guitar);
    fetched.guitar.play(ctx, null, note(60), 1);
    fetched.guitar.play(ctx, null, note(62), 1.5);
    expect(strings.nodes[0].stop).not.toHaveBeenCalled();
  });

  it('AC-19.12.5/5 — Flute is the FluidR3_GM `flute` samples, requested, held and falling back exactly as the four above are', async () => {
    const flute = fetched.flute;
    expect(flute.name).toBe('flute');
    expect(flute.held).toBe(true);
    // Requested once, at the first note, with the fallback sounding meanwhile.
    let arrive;
    const loader = vi.fn(() => new Promise((resolve) => (arrive = resolve)));
    flute.seams.setLoader(loader);
    expect(loader).not.toHaveBeenCalled();
    const fallback = vi.fn();
    expect(flute.play(ctx, null, note(72), 1, fallback)).toBe('fallback');
    expect(flute.play(ctx, null, note(74), 2, fallback)).toBe('fallback');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(2);
    const instrument = fakeInstrument();
    arrive(instrument);
    await flute.load(ctx);
    // Held: each note is let go as the next begins.
    flute.play(ctx, null, note(72), 3, fallback);
    flute.play(ctx, null, note(74), 3.5, fallback);
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(instrument.nodes[0].stop).toHaveBeenCalledWith(3.5);
    expect(instrument.nodes[1].stop).not.toHaveBeenCalled();
  });

  it("AC-19.12.3/3 — A volume scales the loudness of every note of its part by 0.4 dB a step: 100 is the full level, 80 is 8 dB under it and 1 is 39.6 dB under it: a sampled note is played at its Accent Level scaled by the part's gain", async () => {
    const voice = createSoundfontVoice('alto_sax', { held: true });
    const instrument = await ready(voice);
    voice.play(ctx, null, note(60), 1);
    voice.play(ctx, null, note(60, { gain: volumeGain(80) }), 2);
    voice.play(ctx, null, note(60, { gain: volumeGain(50), accent: 3 }), 3);
    const levels = instrument.play.mock.calls.map((c) => c[2].gain);
    expect(levels[0]).toBe(ACCENT_AMPS[2]);
    expect(20 * Math.log10(levels[1] / levels[0])).toBeCloseTo(-8, 9);
    expect(20 * Math.log10(levels[2] / ACCENT_AMPS[3])).toBeCloseTo(-20, 9);
  });
});
