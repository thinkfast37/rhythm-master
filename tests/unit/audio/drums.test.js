/**
 * The drum kit's sound (US-19.13), against a fake AudioContext that records
 * what is built: every drum is synthesis, a note with no drum builds nothing,
 * level follows accent and volume, and the hat closes.
 */
import { describe, it, expect } from 'vitest';
import { playDrum } from '../../../src/audio/drums.js';
import { PLAYERS, statusOf, isFetched, prepare } from '../../../src/audio/instruments.js';
import { DRUMS } from '../../../src/core/drums.js';
import { volumeGain } from '../../../src/core/voice.js';
import { ACCENT_AMPS } from '../../../src/audio/voices.js';
import { fakeContext } from './fakeAudio.js';

const hit = (midiNote, extra = {}) => ({ accent: 2, pitch: { midiNote, frequency: 100 }, ...extra });
/** The highest level any envelope built since `from` ramps up to. */
const peak = (ctx, from = 0) =>
  Math.max(...ctx.nodes.slice(from).filter((n) => n.kind === 'gain').flatMap((n) => n.gain.calls.filter((c) => c[0] === 'linearRampToValueAtTime').map((c) => c[1])));

describe('audio/drums', () => {
  it('AC-19.13.1/2 — Every drum is Web Audio synthesis: choosing Drums requests no audio file, and a drum sounds at once', async () => {
    expect(PLAYERS.drums).toBe(playDrum);
    expect(isFetched('drums')).toBe(false);
    expect(statusOf('drums')).toEqual({ status: 'ready', error: null });
    for (const midi of Object.keys(DRUMS).map(Number)) {
      const ctx = fakeContext();
      expect(playDrum(ctx, null, hit(midi), 2)).toBe('drum');
      // Built from oscillators and generated noise, scheduled at the time asked for: nothing decoded, nothing fetched.
      const made = ctx.nodes.filter((n) => n.kind === 'oscillator' || n.kind === 'source');
      expect(made.length).toBeGreaterThan(0);
      expect(ctx.decoded).toHaveLength(0);
      expect(ctx.sources.every((s) => s.started >= 2 && s.buffer && typeof s.buffer.getChannelData === 'function')).toBe(true);
      const envelopes = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.calls.some((c) => c[0] === 'linearRampToValueAtTime'));
      expect(envelopes.length).toBeGreaterThan(0);
      expect(envelopes.every((e) => e.gain.calls[0][2] >= 2)).toBe(true);
    }
    // The screen-off render needs nothing prepared: the same synthesis on its own context.
    expect(await prepare('drums', fakeContext())).toBe(playDrum);
  });

  it('AC-19.13.1/3 — A note below 35 or above 81 has no drum and is silent', () => {
    for (const midi of [21, 34, 82, 96]) {
      const ctx = fakeContext();
      expect(playDrum(ctx, null, hit(midi), 1)).toBe('silent');
      expect(ctx.nodes).toHaveLength(0);
    }
  });

  it("AC-19.13.1/4 — A drum is louder at each stronger Accent Level and scaled by its part's volume, and a closed or pedal hat cuts off an open hat still ringing in the same part and in no other", () => {
    // Louder at each stronger Accent Level, in the percussive voice's own ratios.
    const levels = [1, 2, 3].map((accent) => {
      const ctx = fakeContext();
      playDrum(ctx, null, hit(36, { accent }), 1);
      return peak(ctx);
    });
    expect(levels[0]).toBeLessThan(levels[1]);
    expect(levels[1]).toBeLessThan(levels[2]);
    expect(levels[2] / levels[1]).toBeCloseTo(ACCENT_AMPS[3] / ACCENT_AMPS[2], 9);
    // Scaled by the part's volume: 50 is 20 dB under full.
    const quiet = fakeContext();
    playDrum(quiet, null, hit(36, { gain: volumeGain(50) }), 1);
    expect(20 * Math.log10(peak(quiet) / levels[1])).toBeCloseTo(-20, 9);

    // The hat: an open one ringing in a part is cut off by a closed or a pedal hat in that part.
    const cutAt = (env) => env.gain.calls.filter((c) => c[0] === 'setTargetAtTime').map((c) => c[2]);
    const openEnvelope = (ctx, from) => ctx.nodes.slice(from).find((n) => n.kind === 'gain' && n.gain.calls.some((c) => c[0] === 'linearRampToValueAtTime'));
    for (const closer of [42, 44]) {
      const ctx = fakeContext();
      playDrum(ctx, null, hit(46, { layer: 1 }), 1);
      const open = openEnvelope(ctx, 0);
      expect(cutAt(open)).toEqual([]);
      playDrum(ctx, null, hit(closer, { layer: 1 }), 1.1);
      expect(cutAt(open)).toEqual([1.1]);
    }
    // And in no other part: the hats of one part leave another's ringing.
    const ctx = fakeContext();
    playDrum(ctx, null, hit(46, { layer: 1 }), 1);
    const open = openEnvelope(ctx, 0);
    playDrum(ctx, null, hit(42, { layer: 2 }), 1.1);
    playDrum(ctx, null, hit(42), 1.1);
    expect(cutAt(open)).toEqual([]);
    // No other drum closes it, and one that has rung out is left alone.
    playDrum(ctx, null, hit(38, { layer: 1 }), 1.2);
    expect(cutAt(open)).toEqual([]);
    playDrum(ctx, null, hit(42, { layer: 1 }), 9);
    expect(cutAt(open)).toEqual([]);
  });
});
