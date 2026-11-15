/**
 * The drum kit's map (US-19.13): which drum each MIDI note is. Pure; the
 * sound is proven in `tests/unit/audio/drums.test.js`, the keys' labels in
 * `tests/e2e/drums.spec.js`.
 */
import { describe, it, expect } from 'vitest';
import { DRUMS, drumFor, drumName, closesHat, OPEN_HAT } from '../../../src/core/drums.js';

describe('core/drums — the map', () => {
  it("AC-19.13.1/1 — Each MIDI note from 35 to 81 is the drum General MIDI's percussion key map gives it, as Logic's Drum Kit Designer plays them: Kick on 36, Rim on 37, Snare on 38, Clap on 39, Closed hat on 42, Pedal hat on 44, Open hat on 46, Crash on 49, Ride on 51", () => {
    // Every note of the map, and no other.
    expect(Object.keys(DRUMS).map(Number)).toEqual(Array.from({ length: 47 }, (_, i) => 35 + i));
    // The kit itself, on the keys General MIDI and Logic put it.
    expect({ 36: drumName(36), 37: drumName(37), 38: drumName(38), 39: drumName(39), 42: drumName(42), 44: drumName(44), 46: drumName(46), 49: drumName(49), 51: drumName(51) }).toEqual({
      36: 'Kick',
      37: 'Rim',
      38: 'Snare',
      39: 'Clap',
      42: 'Closed hat',
      44: 'Pedal hat',
      46: 'Open hat',
      49: 'Crash',
      51: 'Ride',
    });
    // The rest of General MIDI's map, family by family.
    const kindOf = (midi) => drumFor(midi).kind;
    for (const tom of [41, 43, 45, 47, 48, 50]) expect(kindOf(tom)).toBe('tom');
    for (const cymbal of [49, 51, 52, 55, 57, 59]) expect(kindOf(cymbal)).toBe('cymbal');
    for (const hat of [42, 44, 46]) expect(kindOf(hat)).toBe('hat');
    expect(kindOf(35)).toBe('kick');
    expect(kindOf(40)).toBe('snare');
    expect(drumName(53)).toBe('Ride bell');
    expect(drumName(54)).toBe('Tambourine');
    expect(drumName(56)).toBe('Cowbell');
    expect(drumName(81)).toBe('Triangle');
    // The toms fall in pitch with the keys, as a kit's do.
    const toms = [50, 48, 47, 45, 43, 41].map((m) => drumFor(m).hz);
    expect([...toms].sort((a, b) => b - a)).toEqual(toms);
    // Every name is its own, and short enough to be written up a key.
    const names = Object.values(DRUMS).map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.length > 0 && n.length <= 13)).toBe(true);
  });

  it('AC-19.13.1/3 — A note below 35 or above 81 has no drum and is silent: the map holds none', () => {
    for (const midi of [0, 21, 34, 82, 84, 108, 127]) {
      expect(drumFor(midi)).toBeNull();
      expect(drumName(midi)).toBe('');
    }
  });

  it("AC-19.13.1/4 — A drum is louder at each stronger Accent Level and scaled by its part's volume, and a closed or pedal hat cuts off an open hat still ringing in the same part and in no other: which notes close the hat", () => {
    expect(OPEN_HAT).toBe(46);
    expect(Object.keys(DRUMS).map(Number).filter(closesHat)).toEqual([42, 44]);
  });
});
