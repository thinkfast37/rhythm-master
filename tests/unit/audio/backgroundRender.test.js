/**
 * The background render's arithmetic (AC-4.1.15).
 *
 * The render itself needs a real OfflineAudioContext and is proven through the
 * DOM in `tests/e2e/playback.spec.js`. What is unit-testable here is the part
 * a phone's memory depends on — how much of a cycle is rendered — and the WAV
 * encoding the element is handed.
 */
import { describe, it, expect } from 'vitest';
import { planRender, encodeWav, renderCycle } from '../../../src/audio/backgroundRender.js';
import { PROGRESSIONS } from '../../../src/core/harmony.js';
import { create } from '../../../src/core/pattern.js';
import { loopDurationSeconds, buildTimeline } from '../../../src/core/timeline.js';
import seed from '../../../data/seed-patterns.json';
import { fakeContext } from './fakeAudio.js';

const SAMPLE_RATE = 44100;
/** Seconds of 16-bit mono audio that fit in the module's 60 MB ceiling. */
const CEILING_SECONDS = (60 * 1024 * 1024) / (SAMPLE_RATE * 2);

describe('audio/backgroundRender — how much of the cycle is rendered (AC-4.1.15/4)', () => {
  it('AC-4.1.15/4 — What is rendered is the whole cycle — every pass until the fills and progressions in force repeat — so a cycling run keeps cycling with the screen off, up to a memory ceiling past which the whole passes that fit are rendered and repeat: a cycle under the ceiling is rendered whole', () => {
    // 114 progressions at a 3-second pass — the maintainer's own case, and the
    // reason the whole cycle was chosen over a single pass.
    const passes = Array.from({ length: 114 }, () => 3);
    const plan = planRender(passes, SAMPLE_RATE);
    expect(plan.whole).toBe(true);
    expect(plan.passes).toBe(114);
    expect(plan.seconds).toBeCloseTo(342, 6);
    expect(plan.seconds).toBeLessThan(CEILING_SECONDS);
  });

  it('AC-4.1.15/4 — What is rendered is the whole cycle — every pass until the fills and progressions in force repeat — so a cycling run keeps cycling with the screen off, up to a memory ceiling past which the whole passes that fit are rendered and repeat: the whole catalogue with its song progressions is rendered whole', () => {
    // The song progressions (T342) doubled the catalogue; the ceiling was
    // raised so cycling through every entry at a 3-second pass still fits.
    expect(PROGRESSIONS.length).toBeGreaterThan(200);
    const passes = PROGRESSIONS.map(() => 3);
    const plan = planRender(passes, SAMPLE_RATE);
    expect(plan.whole).toBe(true);
    expect(plan.passes).toBe(PROGRESSIONS.length);
    expect(plan.seconds).toBeLessThan(CEILING_SECONDS);
  });

  it('AC-4.1.15/4 — What is rendered is the whole cycle — every pass until the fills and progressions in force repeat — so a cycling run keeps cycling with the screen off, up to a memory ceiling past which the whole passes that fit are rendered and repeat: a cycle over the ceiling falls back to whole passes', () => {
    // A slow, long cycle: 200 passes of 10 seconds is over half an hour.
    const passes = Array.from({ length: 200 }, () => 10);
    const plan = planRender(passes, SAMPLE_RATE);
    expect(plan.whole).toBe(false);
    expect(plan.passes).toBeLessThan(200);
    expect(plan.seconds).toBeLessThanOrEqual(180);
    // Whole passes only — never a fraction of one, which would loop mid-bar.
    expect(plan.seconds % 10).toBeCloseTo(0, 6);
  });

  it('AC-4.1.15/4 — What is rendered is the whole cycle — every pass until the fills and progressions in force repeat — so a cycling run keeps cycling with the screen off, up to a memory ceiling past which the whole passes that fit are rendered and repeat: one pass longer than the window is still rendered', () => {
    // A single pass past the fallback window is rendered anyway: half a loop
    // would repeat from the middle of a bar, which is worse than the memory.
    const plan = planRender([600], SAMPLE_RATE);
    expect(plan.passes).toBe(1);
    expect(plan.seconds).toBe(600);
  });
});

describe('audio/backgroundRender — a cycle of millions of passes (AC-4.1.15/4, T396)', () => {
  it('AC-4.1.15/4 — What is rendered is the whole cycle — every pass until the fills and progressions in force repeat — so a cycling run keeps cycling with the screen off, up to a memory ceiling past which the whole passes that fit are rendered and repeat: a cycle counted short of its end is never whole', () => {
    // The first passes of a cycle known to run on past them: under the
    // ceiling as listed, but not the whole cycle, so the fallback applies.
    const plan = planRender(Array.from({ length: 300 }, () => 3), SAMPLE_RATE, true);
    expect(plan.whole).toBe(false);
    expect(plan.seconds).toBeLessThanOrEqual(180);
    expect(plan.passes).toBe(60);
  });

  it('AC-4.1.15/4 — What is rendered is the whole cycle — every pass until the fills and progressions in force repeat — so a cycling run keeps cycling with the screen off, up to a memory ceiling past which the whole passes that fit are rendered and repeat: a cycle of millions of passes stops counting at the ceiling', async () => {
    // Every progression in the catalogue cycling at once, each turning its own
    // chords over by the pass, repeats only after millions of passes. Building
    // each of them before rendering hung the page; only those up to the
    // ceiling are needed, since the fallback renders fewer still.
    const pattern = { ...create('Long'), tempo: 80 };
    const pass = loopDurationSeconds(pattern);
    let built = 0;
    const saved = globalThis.OfflineAudioContext;
    globalThis.OfflineAudioContext = class {
      constructor() {
        throw new Error('not rendering in a unit test');
      }
    };
    try {
      const result = await renderCycle({
        patternAt: () => {
          built += 1;
          return pattern;
        },
        passes: 7_308_840,
        settings: {},
        sampleRate: SAMPLE_RATE,
      });
      expect(result).toBeNull();
    } finally {
      if (saved === undefined) delete globalThis.OfflineAudioContext;
      else globalThis.OfflineAudioContext = saved;
    }
    expect(built).toBe(Math.floor(CEILING_SECONDS / pass) + 1);
  });
});

describe('audio/backgroundRender — the WAV handed to the element (AC-4.1.15/1)', () => {
  it('AC-4.1.15/1 — Play renders the run and gives it to the element, which keeps playing inaudibly until the screen goes off: the render is encoded as 16-bit mono WAV', () => {
    const frames = 8;
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2, 0]);
    const wav = encodeWav({
      sampleRate: SAMPLE_RATE,
      getChannelData: () => samples,
    });

    const header = String.fromCharCode(...wav.slice(0, 4), ...wav.slice(8, 12));
    expect(header).toBe('RIFFWAVE');
    expect(wav.length).toBe(44 + frames * 2);

    const view = new DataView(wav.buffer);
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    const at = (i) => view.getInt16(44 + i * 2, true);
    expect(at(0)).toBe(0);
    expect(at(1)).toBe(Math.round(0.5 * 32767));
    expect(at(3)).toBe(32767);
    expect(at(4)).toBe(-32767);
    // Anything past full scale is clamped, never wrapped — a wrapped sample is
    // a click, and the loudest moment of a Pattern is where it would land.
    expect(at(5)).toBe(32767);
    expect(at(6)).toBe(-32767);
  });
});

describe('audio/backgroundRender — a browser that cannot render (AC-4.1.15/6)', () => {
  it('AC-4.1.15/6 — A browser with no `OfflineAudioContext`, or a render that fails, is unaffected: the live transport plays exactly as it would without any of this and nothing throws', async () => {
    // This suite's environment has none, which is the case being guarded.
    expect(globalThis.OfflineAudioContext).toBeUndefined();
    await expect(
      renderCycle({ patternAt: () => null, passes: 1, settings: {}, sampleRate: SAMPLE_RATE })
    ).resolves.toBeNull();
  });
});

describe('audio/backgroundRender — the melodic voice (AC-2.13.5)', () => {
  /** A melodic Pattern from the shipped library, so every sounding Slot is pitched. */
  const melodic = seed.patterns.find((p) => p.soundMode === 'melodic');

  async function renderWith(prepareMelodic) {
    const saved = globalThis.OfflineAudioContext;
    const contexts = [];
    globalThis.OfflineAudioContext = class {
      constructor(channels, frames, rate) {
        Object.assign(this, fakeContext());
        this.frames = frames;
        this.sampleRate = rate;
        contexts.push(this);
      }
      startRendering() {
        const samples = new Float32Array(this.frames);
        return Promise.resolve({ sampleRate: this.sampleRate, getChannelData: () => samples });
      }
    };
    try {
      const result = await renderCycle({ patternAt: () => melodic, passes: 1, settings: {}, sampleRate: 8000, prepareMelodic });
      return { result, ctx: contexts[0] };
    } finally {
      if (saved === undefined) delete globalThis.OfflineAudioContext;
      else globalThis.OfflineAudioContext = saved;
    }
  }

  it('AC-2.13.5/1 — With the piano in force and its recordings loaded, the render sounds its melodic notes through the piano; with them not loaded, through the synth: the render plays through what prepareMelodic returns, on its own context', async () => {
    const played = [];
    const { result, ctx } = await renderWith(async () => ({ voice: 'piano', play: (pc, d, e, w) => played.push({ pc, midi: e.pitch.midiNote, w }) }));
    expect(result.voice).toBe('piano');
    expect(played.length).toBe(buildTimeline(melodic, 0).filter((e) => e.pitch).length);
    expect(played.every((p) => p.pc === ctx)).toBe(true);
    // No synth note was built: the synth's oscillators are absent.
    expect(ctx.nodes.some((n) => n.kind === 'oscillator' && n.detune)).toBe(false);
    URL.revokeObjectURL(result.url);
  });

  it('AC-2.13.5/1 — With the piano in force and its recordings loaded, the render sounds its melodic notes through the piano; with them not loaded, through the synth: a voice not ready renders the synth', async () => {
    const { result, ctx } = await renderWith(async () => null);
    expect(result.voice).toBe('synth');
    expect(ctx.nodes.filter((n) => n.kind === 'oscillator').length).toBeGreaterThan(0);
    URL.revokeObjectURL(result.url);
  });

  it('AC-2.13.5/2 — With the guitar in force and its samples loaded, the render sounds its melodic notes through the guitar; with them not loaded, through the synth: the render reports the voice it used', async () => {
    const played = [];
    const { result } = await renderWith(async () => ({ voice: 'guitar', play: (_c, _d, e) => played.push(e.pitch.midiNote) }));
    expect(result.voice).toBe('guitar');
    expect(played.length).toBeGreaterThan(0);
    URL.revokeObjectURL(result.url);
    const synth = await renderWith(null);
    expect(synth.result.voice).toBe('synth');
    URL.revokeObjectURL(synth.result.url);
  });
});
