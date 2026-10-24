/**
 * The melodic voice (US-2.13): which voice a note sounds with, and which
 * piano recording plays it at what rate. Pure; the DOM-level proof of each
 * criterion is in `tests/e2e/voice.spec.js`.
 */
import { describe, it, expect } from 'vitest';
import {
  VOICES,
  DEFAULT_VOICE,
  normaliseVoice,
  resolveVoice,
  PIANO_SAMPLE_NOTES,
  pianoSampleFile,
  pianoSampleFor,
  PIANO_HOLD_SECONDS,
} from '../../../src/core/voice.js';
import { DEFAULTS } from '../../../src/storage/settings.js';

describe('core/voice — the choice', () => {
  it('AC-2.13.1/2 — Piano is the default; the choice is one app preference, the same on every Pattern and remembered across loads, and never Pattern content — choosing a voice never prompts on a shipped Pattern, never changes the Pattern, and no Pattern export carries it: the stored default and its reading', () => {
    expect(VOICES).toEqual(['piano', 'synth', 'guitar']);
    expect(DEFAULT_VOICE).toBe('piano');
    expect(DEFAULTS.melodicVoice).toBe('piano');
    expect(normaliseVoice(undefined)).toBe('piano');
    expect(normaliseVoice('harpsichord')).toBe('piano');
    for (const v of VOICES) expect(normaliseVoice(v)).toBe(v);
  });

  it('AC-2.13.2/2 — Under Synth, a melodic note sounds through the ported synthesis chain of AC-2.4.1: Practice plays the chosen voice', () => {
    for (const voice of VOICES) expect(resolveVoice({ composer: false, instrument: 'guitar', voice })).toBe(voice);
    expect(resolveVoice({ composer: false, instrument: 'piano', voice: undefined })).toBe('piano');
  });

  it('AC-2.13.3/1 — In the Guitar view every melodic note sounds through the guitar, whatever voice is chosen: resolveVoice', () => {
    for (const voice of [...VOICES, undefined]) expect(resolveVoice({ composer: true, instrument: 'guitar', voice })).toBe('guitar');
  });

  it('AC-2.13.3/2 — In the Piano view every melodic note sounds through the synth when Synth is the chosen voice, and through the sampled piano when Piano or Guitar is: resolveVoice', () => {
    expect(resolveVoice({ composer: true, instrument: 'piano', voice: 'synth' })).toBe('synth');
    expect(resolveVoice({ composer: true, instrument: 'piano', voice: 'piano' })).toBe('piano');
    expect(resolveVoice({ composer: true, instrument: 'piano', voice: 'guitar' })).toBe('piano');
  });
});

describe('core/voice — the piano recordings', () => {
  it('AC-2.13.2/1 — Under Piano, a melodic note sounds through the Salamander Grand recording nearest its MIDI note, re-pitched to that note, louder at each stronger Accent Level: the nearest recording and its rate, for every key of an 88-key piano', () => {
    expect(PIANO_SAMPLE_NOTES).toHaveLength(29);
    expect(PIANO_SAMPLE_NOTES[0]).toBe(21);
    expect(PIANO_SAMPLE_NOTES.at(-1)).toBe(105);
    for (let midi = 21; midi <= 108; midi++) {
      const { sampleMidi, playbackRate } = pianoSampleFor(midi);
      expect(PIANO_SAMPLE_NOTES).toContain(sampleMidi);
      // Nearest: no shipped recording is closer.
      for (const other of PIANO_SAMPLE_NOTES) expect(Math.abs(sampleMidi - midi)).toBeLessThanOrEqual(Math.abs(other - midi));
      // Re-pitched to the note exactly.
      expect(Math.log2(playbackRate) * 12 + sampleMidi).toBeCloseTo(midi, 9);
      if (midi <= 105) expect(Math.abs(sampleMidi - midi)).toBeLessThanOrEqual(1);
    }
    // A#7–C8 play from A7, since C8's recording is sharp.
    expect(pianoSampleFor(108).sampleMidi).toBe(105);
    expect(pianoSampleFile(21)).toBe('A0.mp3');
    expect(pianoSampleFile(63)).toBe('Ds4.mp3');
    expect(pianoSampleFile(66)).toBe('Fs4.mp3');
    expect(pianoSampleFile(60)).toBe('C4.mp3');
    // A stronger accent holds longer as well as sounding louder.
    expect(PIANO_HOLD_SECONDS[1]).toBeLessThan(PIANO_HOLD_SECONDS[2]);
    expect(PIANO_HOLD_SECONDS[2]).toBeLessThan(PIANO_HOLD_SECONDS[3]);
  });
});
