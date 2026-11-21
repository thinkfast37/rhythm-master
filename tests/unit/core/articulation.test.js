import { describe, it, expect } from 'vitest';
import { ARTICULATIONS, DEFAULT_ARTICULATION, normaliseArticulation, legatoTicks } from '../../../src/core/articulation.js';
import { ringSeconds, GM_PROGRAM, VOICES, PIANO_HOLD_SECONDS } from '../../../src/core/voice.js';

describe('core/articulation — how long an exported note lasts (US-12.5)', () => {
  it('AC-12.5.2/1 — On Legato a pitched note lasts until the next note of its part begins and then for the ring of its instrument, the ring turned from seconds into ticks at the tempo of the file: the rule in ticks', () => {
    // Four notes a quarter apart, each ringing 100 ticks, in a file four quarters long.
    const notes = [0, 480, 960, 1440].map((tick, i) => ({ tick, pitch: 60 + i, ringTicks: 100 }));
    expect(legatoTicks(notes, 1920)).toEqual([580, 580, 580, 480]);
    // A longer ring overlaps more of what follows; none at all ends exactly at the next note.
    expect(legatoTicks(notes.map((n) => ({ ...n, ringTicks: 700 })), 1920).slice(0, 2)).toEqual([1180, 1180]);
    expect(legatoTicks(notes.map((n) => ({ ...n, ringTicks: 0 })), 1920)).toEqual([480, 480, 480, 480]);
    // Notes that begin together share the onset after them.
    const chord = [
      { tick: 0, pitch: 60, ringTicks: 0 },
      { tick: 0, pitch: 64, ringTicks: 0 },
      { tick: 480, pitch: 67, ringTicks: 0 },
    ];
    expect(legatoTicks(chord, 960)).toEqual([480, 480, 480]);
    // The order the notes are given in is the order the lengths come back in.
    expect(legatoTicks([notes[2], notes[0]], 1920)).toEqual([960, 1060]);
  });

  it('AC-12.5.2/2 — A note ends one tick before the same pitch is struck again in its part, the last note of a part lasts to the end of the file and then its ring, and no note runs past the end of the file: the rule in ticks', () => {
    // C, D, C: the first C would ring past the second, and is cut a tick before it.
    const notes = [
      { tick: 0, pitch: 60, ringTicks: 2000 },
      { tick: 480, pitch: 62, ringTicks: 2000 },
      { tick: 960, pitch: 60, ringTicks: 2000 },
    ];
    const lengths = legatoTicks(notes, 1920);
    expect(lengths[0]).toBe(959);
    // The D has no later D: it rings on, but not past the end of the file.
    expect(480 + lengths[1]).toBe(1920);
    // The last note: to the end of the file, its ring clipped there.
    expect(960 + lengths[2]).toBe(1920);
    for (const [i, n] of notes.entries()) expect(n.tick + lengths[i]).toBeLessThanOrEqual(1920);
    // The same pitch struck on the very next tick still leaves a note of one tick, never none.
    expect(legatoTicks([{ tick: 0, pitch: 60, ringTicks: 50 }, { tick: 1, pitch: 60, ringTicks: 50 }], 480)[0]).toBe(1);
    // A repeated note with room between: cut only where the repeat is.
    expect(legatoTicks([{ tick: 0, pitch: 60, ringTicks: 100 }, { tick: 480, pitch: 60, ringTicks: 100 }], 960)).toEqual([479, 480]);
  });

  it('AC-12.5.2/3 — The ring is the instrument’s own by Accent Level — the piano’s hold, the guitar’s and the synth’s decay — and nothing for an instrument the app holds until its next note: electric guitar, bass, sax, trumpet and flute', () => {
    expect([1, 2, 3].map((a) => ringSeconds('piano', a))).toEqual([0.8, 1.2, 1.6]);
    expect([1, 2, 3].map((a) => ringSeconds('piano', a))).toEqual([1, 2, 3].map((a) => PIANO_HOLD_SECONDS[a]));
    expect([1, 2, 3].map((a) => ringSeconds('guitar', a))).toEqual([1.2, 1.6, 2.0]);
    expect([1, 2, 3].map((a) => ringSeconds('synth', a))).toEqual([0.18, 0.32, 0.55]);
    for (const held of ['electric', 'bass', 'sax', 'trumpet', 'flute']) for (const a of [1, 2, 3]) expect(ringSeconds(held, a), held).toBe(0);
    // Drums have no length to give, and an accent that sounds nothing rings for nothing.
    expect(ringSeconds('drums', 3)).toBe(0);
    expect(ringSeconds('piano', 0)).toBe(0);
    // A voice the catalogue does not know is read as Piano, as everywhere.
    expect(ringSeconds('harpsichord', 2)).toBe(1.2);
    // Louder rings longer on every instrument that rings.
    for (const v of ['piano', 'guitar', 'synth']) expect(ringSeconds(v, 3)).toBeGreaterThan(ringSeconds(v, 1));
  });

  it('AC-12.5.1/1 — Beside each MIDI export — of a Pattern, a Chain, a Section and an Arrangement — a note-length choice offers Staccato and Legato, with Staccato chosen until Legato is: the two lengths', () => {
    expect(ARTICULATIONS.map((a) => [a.id, a.label])).toEqual([
      ['staccato', 'Staccato'],
      ['legato', 'Legato'],
    ]);
    expect(DEFAULT_ARTICULATION).toBe('staccato');
    expect(normaliseArticulation(undefined)).toBe('staccato');
    expect(normaliseArticulation('tenuto')).toBe('staccato');
    expect(normaliseArticulation('legato')).toBe('legato');
  });

  it('AC-20.3.1/4 — Each pitched track is on a channel of its own with the General MIDI program of its instrument, and a rhythm, a percussive part and a part on Drums are on the drum channel: a program for every pitched instrument', () => {
    // Zero-based, as a file carries them: piano 1, steel guitar 26, overdriven guitar 30, fingered bass 34, alto sax 66, trumpet 57, flute 74, pad 89.
    expect(GM_PROGRAM).toEqual({ piano: 0, synth: 88, guitar: 25, electric: 29, bass: 33, sax: 65, trumpet: 56, flute: 73 });
    // Every instrument but the drums has one.
    expect(Object.keys(GM_PROGRAM).sort()).toEqual(VOICES.filter((v) => v !== 'drums').sort());
  });
});
