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
import { layered } from '../../../src/core/section.js';
import { volumeGain } from '../../../src/core/voice.js';
import { autoDrumNote } from '../../../src/core/drums.js';

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

  async function renderWith(prepareMelodic, { pattern = melodic, gainOf = null } = {}) {
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
      const result = await renderCycle({ patternAt: () => pattern, passes: 1, settings: {}, sampleRate: 8000, prepareMelodic, gainOf });
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

  it("AC-19.12.5/4 — The screen-off render sounds every part through its own instrument at its own volume, and through the synth where an instrument's samples are not ready", async () => {
    // A layered set: the part on screen and one melodic layer on its own instrument and volume.
    const set = layered(melodic, [{ pattern: { ...melodic, name: 'Under' }, instrument: 'sax', volume: 50 }]);
    const played = [];
    const players = {
      sax: (_c, _d, e) => played.push({ via: 'sax', layer: e.layer, gain: e.gain }),
      // The part on screen's instrument is not ready: the synth sounds it.
    };
    const instrumentFor = (e) => (e.composition === false ? e.instrument : 'trumpet');
    const gainOf = (e) => volumeGain(e.composition === false ? e.volume : 80);
    const { result, ctx } = await renderWith(
      async () => ({
        voice: 'synth',
        voices: ['sax'],
        play: (c, d, e, w) => (players[instrumentFor(e)] ?? ((cc, dd, ee) => played.push({ via: 'synth', layer: ee.layer, gain: ee.gain })))(c, d, e, w),
      }),
      { pattern: set, gainOf }
    );
    expect(result.voices).toEqual(['sax']);
    const pitched = buildTimeline(melodic, 0).filter((e) => e.pitch).length;
    // Every layer note through the sax at −20 dB; every note of the part on screen through the synth at −8 dB.
    const under = played.filter((p) => p.layer === 1);
    const own = played.filter((p) => p.layer === 0);
    expect(under).toHaveLength(pitched);
    expect(under.every((p) => p.via === 'sax' && Math.abs(20 * Math.log10(p.gain) + 20) < 1e-9)).toBe(true);
    expect(own).toHaveLength(pitched);
    expect(own.every((p) => p.via === 'synth' && Math.abs(20 * Math.log10(p.gain) + 8) < 1e-9)).toBe(true);
    expect(ctx).toBeDefined();
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

describe('audio/backgroundRender — layers under the composition (US-19.11)', () => {
  it('AC-19.11.2/6 — The screen-off handover renders the combined loop with every unmuted layer, as the transport plays it', async () => {
    const { layered, layeredTimeline, layeredLoopDuration } = await import('../../../src/core/section.js');
    const { cycleAccent, addMeasure } = await import('../../../src/core/pattern.js');
    let composition = { ...create('Line'), tempo: 120 };
    for (let b = 0; b < 4; b++) composition = cycleAccent(composition, 0, b, 0);
    let bed = addMeasure({ ...create('Bed'), tempo: 120 });
    for (let m = 0; m < 2; m++) for (let b = 0; b < 4; b++) bed = cycleAccent(bed, m, b, 0);
    const set = layered(composition, [{ pattern: bed }, { pattern: seed.patterns.find((p) => p.soundMode === 'melodic'), muted: true }]);
    const saved = globalThis.OfflineAudioContext;
    const contexts = [];
    globalThis.OfflineAudioContext = class {
      constructor(channels, frames, rate) {
        Object.assign(this, fakeContext());
        this.frames = frames;
        this.sampleRate = rate;
        // Every oscillator start, with its time: what the percussive voice schedules.
        this.started = [];
        const base = this.createOscillator;
        this.createOscillator = () => {
          const o = base();
          o.start = (t) => this.started.push(t);
          return o;
        };
        contexts.push(this);
      }
      startRendering() {
        const samples = new Float32Array(this.frames);
        return Promise.resolve({ sampleRate: this.sampleRate, getChannelData: () => samples });
      }
    };
    try {
      // The composition alone: how many oscillators one percussive event takes.
      const alone = await renderCycle({ patternAt: () => composition, passes: 1, settings: {}, sampleRate: 8000 });
      expect(alone.passes).toBe(1);
      const perEvent = contexts[0].started.length / 4;
      expect(perEvent).toBeGreaterThan(0);
      const result = await renderCycle({ patternAt: () => set, passes: 1, settings: {}, sampleRate: 8000 });
      // One combined pass: the composition twice under the two-Measure bed, the muted melody absent.
      expect(result.passes).toBe(1);
      expect(result.seconds).toBeCloseTo(layeredLoopDuration(set), 6);
      // The muted layer still counts in the loop: longer than the bed's two bars when it is.
      const [own, bedLayer, muted] = set.layers;
      expect(result.seconds).toBeCloseTo(2 * own.repeats, 6);
      expect(own.repeats).toBe(2 * bedLayer.repeats);
      expect(muted.muted).toBe(true);
      const expected = layeredTimeline(set, 0);
      expect(expected).toHaveLength(4 * own.repeats + 8 * bedLayer.repeats);
      // Every event in the merged list was scheduled on the offline context, coincident ones both.
      const started = contexts[1].started;
      expect(started.length).toBe(expected.length * perEvent);
      const times = [...new Set(started.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
      expect(times).toEqual([...new Set(expected.map((e) => Math.round(e.timeSeconds * 1000) / 1000))].sort((a, b) => a - b));
      expect(times).toHaveLength(4 * own.repeats);
    } finally {
      if (saved === undefined) delete globalThis.OfflineAudioContext;
      else globalThis.OfflineAudioContext = saved;
    }
  });
});

describe('audio/backgroundRender — a Percussive Pattern on the kit (AC-2.18.2/4)', () => {
  const percussive = seed.patterns.find((p) => p.soundMode !== 'melodic');

  async function render(playUnpitched) {
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
      const result = await renderCycle({ patternAt: () => percussive, passes: 1, settings: {}, sampleRate: 8000, playUnpitched });
      return { result, ctx: contexts[0] };
    } finally {
      if (saved === undefined) delete globalThis.OfflineAudioContext;
      else globalThis.OfflineAudioContext = saved;
    }
  }

  it('AC-2.18.2/4 — The offline render of a Percussive Pattern on Drum kit sounds the drums, and on Accents the accent tones', async () => {
    const events = buildTimeline(percussive, 0);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => !e.pitch)).toBe(true);

    // On Accents: one accent tone, an oscillator, for every note.
    const accents = await render(null);
    expect(accents.ctx.nodes.filter((n) => n.kind === 'oscillator')).toHaveLength(events.length);
    URL.revokeObjectURL(accents.result.url);

    // On Drum kit: every note is handed to the kit on the render's own context,
    // with its accent and its time, and no accent tone is built.
    const drums = [];
    const kit = await render((ctx, _destination, event, when, level) => drums.push({ ctx, midi: autoDrumNote(event.accent), when, level }));
    expect(drums).toHaveLength(events.length);
    expect(drums.every((d) => d.ctx === kit.ctx && d.level === 1)).toBe(true);
    expect(drums.map((d) => d.midi)).toEqual(events.map((e) => ({ 3: 36, 2: 38, 1: 43 })[e.accent]));
    expect(drums.map((d) => d.when)).toEqual(events.map((e) => e.timeSeconds));
    expect(kit.ctx.nodes.filter((n) => n.kind === 'oscillator')).toHaveLength(0);
    URL.revokeObjectURL(kit.result.url);
  });
});
