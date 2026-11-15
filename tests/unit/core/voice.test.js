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
  INSTRUMENTS,
  FETCHED,
  instrumentOf,
  viewOf,
  volumeDb,
  volumeGain,
  normaliseVolume,
  MIN_VOLUME,
  MAX_VOLUME,
  DEFAULT_VOLUME,
  hasFixedNotes,
} from '../../../src/core/voice.js';
import { DEFAULTS } from '../../../src/storage/settings.js';

describe('core/voice — the choice', () => {
  it('AC-2.13.1/2 — Piano is the voice of a Pattern until another is chosen for it; the choice is remembered for that Pattern alone across loads, and is never Pattern content — choosing a voice never prompts on a shipped Pattern, never changes the Pattern, and no Pattern export carries it: a voice not yet chosen reads as Piano', () => {
    // Revised with AC-2.13.1 (2026-11-15): the switch offers all seven instruments.
    expect(VOICES).toEqual(['piano', 'synth', 'guitar', 'electric', 'bass', 'sax', 'trumpet', 'flute', 'drums']);
    expect(DEFAULT_VOICE).toBe('piano');
    // Revised 2026-11-15 (T504): there is no app-wide voice any more, so no stored default to read.
    expect('melodicVoice' in DEFAULTS).toBe(false);
    expect(normaliseVoice(undefined)).toBe('piano');
    expect(normaliseVoice('harpsichord')).toBe('piano');
    for (const v of VOICES) expect(normaliseVoice(v)).toBe(v);
  });

  it('AC-2.13.2/2 — Under Synth, a melodic note sounds through the ported synthesis chain: Practice plays the chosen voice', () => {
    for (const voice of VOICES) expect(resolveVoice({ composer: false, instrument: 'guitar', voice })).toBe(voice);
    expect(resolveVoice({ composer: false, instrument: 'piano', voice: undefined })).toBe('piano');
  });

  it("AC-2.13.3/1 — A part's melodic notes sound through the instrument chosen for that part, whatever voice Practice has chosen: resolveVoice", () => {
    for (const instrument of VOICES) {
      for (const voice of [...VOICES, undefined]) expect(resolveVoice({ composer: true, instrument, voice })).toBe(instrument);
    }
    // A Composer that has never chosen is on the guitar (AC-19.1.3/1).
    expect(resolveVoice({ composer: true, instrument: undefined, voice: 'sax' })).toBe('guitar');
  });

  it('AC-2.13.3/2 — Synth is an instrument of its own: a part on Piano sounds the sampled piano and a part on Synth the synth, whatever voice Practice has chosen: resolveVoice', () => {
    // Rewritten 2026-11-15 with AC-2.13.3/2's revision: the old rule — the Piano
    // view plays the synth when Practice is on Synth — is retired.
    for (const voice of VOICES) {
      expect(resolveVoice({ composer: true, instrument: 'piano', voice })).toBe('piano');
      expect(resolveVoice({ composer: true, instrument: 'synth', voice })).toBe('synth');
    }
  });

  it('AC-19.12.1/1 — The instruments are Piano, Synth, Guitar, Electric guitar, Bass, Sax, Trumpet, Flute and Drums, in that order', () => {
    expect(INSTRUMENTS.map((i) => i.label)).toEqual(['Piano', 'Synth', 'Guitar', 'Electric guitar', 'Bass', 'Sax', 'Trumpet', 'Flute', 'Drums']);
    expect(INSTRUMENTS.map((i) => i.id)).toEqual(VOICES);
    expect(instrumentOf('sax').label).toBe('Sax');
    expect(instrumentOf('harpsichord').id).toBe('piano');
  });

  it('AC-19.12.1/2 — Guitar and Electric guitar are played on the fretboard, and every other instrument on the keyboard', () => {
    expect(VOICES.filter((id) => viewOf(id) === 'guitar')).toEqual(['guitar', 'electric']);
    expect(VOICES.filter((id) => viewOf(id) === 'piano')).toEqual(['piano', 'synth', 'bass', 'sax', 'trumpet', 'flute', 'drums']);
  });

  it('AC-19.12.5/1 — Electric guitar, Bass, Sax and Trumpet are the FluidR3_GM `overdriven_guitar`, `electric_bass_finger`, `alto_sax` and `trumpet` samples, each requested once, when a part in the Composer is first set to it or at the first melodic note in Practice under it, and never on page load: the catalogue names them', () => {
    const fonts = Object.fromEntries(INSTRUMENTS.filter((i) => i.soundfont).map((i) => [i.id, i.soundfont]));
    expect(fonts).toMatchObject({ guitar: 'acoustic_guitar_steel', electric: 'overdriven_guitar', bass: 'electric_bass_finger', sax: 'alto_sax', trumpet: 'trumpet' });
    expect(FETCHED.slice(0, 5)).toEqual(['guitar', 'electric', 'bass', 'sax', 'trumpet']);
  });

  it('AC-19.12.5/5 — Flute is the FluidR3_GM `flute` samples, requested, held and falling back exactly as the four above are: the catalogue names it, and the drums are no fetched voice', () => {
    expect(instrumentOf('flute')).toMatchObject({ soundfont: 'flute', held: true, view: 'piano' });
    expect(FETCHED).toEqual(['guitar', 'electric', 'bass', 'sax', 'trumpet', 'flute']);
    expect(instrumentOf('drums').soundfont).toBeUndefined();
    // Only the drums' notes are fixed against the Key (AC-19.13.3).
    expect(VOICES.filter(hasFixedNotes)).toEqual(['drums']);
    expect(hasFixedNotes(undefined)).toBe(false);
  });
});

describe('core/voice — a part\'s volume', () => {
  it('AC-19.12.3/3 — A volume scales the loudness of every note of its part by 0.4 dB a step: 100 is the full level, 80 is 8 dB under it and 1 is 39.6 dB under it', () => {
    expect(volumeDb(100)).toBe(0);
    expect(volumeGain(100)).toBe(1);
    expect(volumeDb(80)).toBeCloseTo(-8, 9);
    expect(volumeGain(80)).toBeCloseTo(10 ** (-8 / 20), 9);
    expect(volumeDb(1)).toBeCloseTo(-39.6, 9);
    for (let v = MIN_VOLUME; v < MAX_VOLUME; v++) expect(volumeDb(v + 1) - volumeDb(v)).toBeCloseTo(0.4, 9);
    expect(DEFAULT_VOLUME).toBe(80);
    // Six parts at the default, adding by power, land at about one part at full.
    expect(10 * Math.log10(6) + volumeDb(DEFAULT_VOLUME)).toBeCloseTo(0, 0);
  });

  it('AC-19.12.3/2 — Moving the slider or typing a number sets both, and a typed number outside 1 to 100 is held to the nearest end: the reading of a stored or typed value', () => {
    expect(normaliseVolume(0)).toBe(1);
    expect(normaliseVolume(-5)).toBe(1);
    expect(normaliseVolume(101)).toBe(100);
    expect(normaliseVolume(999)).toBe(100);
    expect(normaliseVolume(49.6)).toBe(50);
    expect(normaliseVolume('37')).toBe(37);
    expect(normaliseVolume(undefined)).toBe(80);
    expect(normaliseVolume(null)).toBe(80);
    expect(normaliseVolume('loud')).toBe(80);
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
