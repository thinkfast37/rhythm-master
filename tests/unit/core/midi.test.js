import { describe, it, expect } from 'vitest';
import { parseNoteOn, fretsFor, placeFor, acceptsFrom, pickerFor, ALL_DEVICES } from '../../../src/core/midi.js';

describe('core/midi — reading a MIDI message (US-19.10)', () => {
  it('reads a note-on on any channel, whatever its velocity', () => {
    expect(parseNoteOn([0x90, 60, 100])).toEqual({ note: 60, channel: 0 });
    expect(parseNoteOn([0x9f, 61, 1])).toEqual({ note: 61, channel: 15 });
    expect(parseNoteOn(new Uint8Array([0x93, 127, 127]))).toEqual({ note: 127, channel: 3 });
  });

  it('takes a note-off, a note-on at velocity 0 and anything else as nothing', () => {
    expect(parseNoteOn([0x80, 60, 64])).toBeNull();
    expect(parseNoteOn([0x90, 60, 0])).toBeNull();
    expect(parseNoteOn([0xb0, 64, 127])).toBeNull(); // sustain pedal
    expect(parseNoteOn([0xe0, 0, 64])).toBeNull(); // pitch bend
    expect(parseNoteOn([0xf8])).toBeNull(); // clock
    expect(parseNoteOn([])).toBeNull();
    expect(parseNoteOn(undefined)).toBeNull();
  });
});

describe('core/midi — where a note sits on the instrument view', () => {
  it('finds every visible, playable fret for a note', () => {
    expect(fretsFor(64, 0, [0, 24])).toEqual([
      { string: 0, fret: 0 },
      { string: 1, fret: 5 },
      { string: 2, fret: 9 },
      { string: 3, fret: 14 },
      { string: 4, fret: 19 },
      { string: 5, fret: 24 },
    ]);
    expect(fretsFor(64, 0, [5, 12])).toEqual([
      { string: 1, fret: 5 },
      { string: 2, fret: 9 },
    ]);
    // A capo at 5 mutes the open E; fret 5 on the B string still plays.
    expect(fretsFor(64, 5, [0, 24]).map((p) => p.fret)).toEqual([5, 9, 14, 19, 24]);
    expect(fretsFor(39)).toEqual([]);
    expect(fretsFor(89)).toEqual([]);
  });

  it('says a piano note outside the key count is out of range, naming it and the count', () => {
    expect(placeFor(36, { instrument: 'piano', count: 49 })).toEqual({ inRange: true });
    expect(placeFor(84, { instrument: 'piano', count: 49 })).toEqual({ inRange: true });
    expect(placeFor(35, { instrument: 'piano', count: 49 })).toEqual({ inRange: false, message: 'B1 — out of range for 49 keys' });
    expect(placeFor(96, { instrument: 'piano', count: 49 })).toEqual({ inRange: false, message: 'C7 — out of range for 49 keys' });
    expect(placeFor(21, { instrument: 'piano', count: 88 })).toEqual({ inRange: true });
    expect(placeFor(30, { instrument: 'piano', count: 'nonsense' }).inRange).toBe(false); // read as 49 keys
  });

  it('says a guitar note with no visible, playable fret is not on the visible frets', () => {
    const board = { instrument: 'guitar', capo: 0, range: [0, 24] };
    expect(placeFor(40, board)).toEqual({ inRange: true });
    expect(placeFor(88, board)).toEqual({ inRange: true });
    expect(placeFor(39, board)).toEqual({ inRange: false, message: 'D#2 — not on the visible frets' });
    expect(placeFor(41, { ...board, capo: 3 })).toEqual({ inRange: false, message: 'F2 — not on the visible frets' });
    expect(placeFor(40, { ...board, range: [5, 24] }).inRange).toBe(false);
  });
});

describe('core/midi — which devices are listened to, and the picker', () => {
  const two = [{ name: 'Keystation 49' }, { name: 'TriplePlay' }];

  it('takes every device unless one is chosen and connected', () => {
    expect(acceptsFrom(two, ALL_DEVICES, 'TriplePlay')).toBe(true);
    expect(acceptsFrom(two, undefined, 'TriplePlay')).toBe(true);
    expect(acceptsFrom(two, 'Keystation 49', 'Keystation 49')).toBe(true);
    expect(acceptsFrom(two, 'Keystation 49', 'TriplePlay')).toBe(false);
    expect(acceptsFrom([{ name: 'TriplePlay' }], 'Keystation 49', 'TriplePlay')).toBe(true);
  });

  it('disables the picker with no access, no device or one, saying why', () => {
    expect(pickerFor('unsupported', [], 'all')).toMatchObject({ disabled: true, reason: 'MIDI input needs Chrome, Edge or Firefox' });
    expect(pickerFor('denied', [], 'all')).toMatchObject({ disabled: true, reason: 'MIDI access was not allowed' });
    expect(pickerFor('pending', [], 'all').disabled).toBe(true);
    expect(pickerFor('ready', [], 'all')).toMatchObject({ disabled: true, options: [{ value: '', label: 'No device connected' }] });
    expect(pickerFor('ready', [two[0]], 'all')).toMatchObject({ disabled: true, value: 'Keystation 49', options: [{ value: 'Keystation 49', label: 'Keystation 49' }] });
  });

  it('offers All devices and each device with two or more, the choice in force only while it is connected', () => {
    const p = pickerFor('ready', two, 'all');
    expect(p.disabled).toBe(false);
    expect(p.options.map((o) => o.label)).toEqual(['All devices', 'Keystation 49', 'TriplePlay']);
    expect(p.value).toBe(ALL_DEVICES);
    expect(pickerFor('ready', two, 'TriplePlay').value).toBe('TriplePlay');
    expect(pickerFor('ready', two, 'Gone').value).toBe(ALL_DEVICES);
    // Two ports with one name are one device to the musician.
    expect(pickerFor('ready', [two[0], { name: 'Keystation 49' }], 'all').disabled).toBe(true);
  });
});
