import { describe, it, expect } from 'vitest';
import {
  KEYS,
  resolve,
  degreeSemitones,
  isSupportedKey,
  midiToFrequency,
  BASE_OCTAVE,
  MIN_OCTAVE,
  MAX_OCTAVE,
  splitDegree,
  octaveNumber,
  octaveOffsetFor,
  clampOctave,
  noteName,
} from '../../../src/core/pitch.js';

describe('core/pitch', () => {
  it('AC-2.3.1 — exactly twelve Keys are supported', () => {
    expect(KEYS).toEqual(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']);
    for (const k of KEYS) expect(isSupportedKey(k)).toBe(true);
    for (const k of ['H', 'C#m', '', 'db']) expect(isSupportedKey(k)).toBe(false);
    expect(() => resolve({ degree: '1', octaveOffset: 0 }, 'H')).toThrow(/Unsupported Key/);
  });

  it('AC-2.2.1 — major-scale degrees resolve to the right semitones', () => {
    const expected = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
    for (const [degree, semis] of Object.entries(expected)) {
      expect(degreeSemitones(degree), `degree ${degree}`).toBe(semis);
    }
  });

  it('AC-2.2.2 — accidentals alter a degree by one semitone', () => {
    expect(degreeSemitones('b3')).toBe(3);
    expect(degreeSemitones('#4')).toBe(6);
    expect(degreeSemitones('b7')).toBe(10);
  });

  it('AC-2.2.3 — degrees beyond 7 continue upward by octave', () => {
    expect(degreeSemitones('8')).toBe(12);
    expect(degreeSemitones('9')).toBe(14);
    expect(degreeSemitones('13')).toBe(21);
    expect(degreeSemitones('b10')).toBe(15);
  });

  it('AC-2.2.4 — degree 1 in C at offset 0 is middle C', () => {
    expect(resolve({ degree: '1', octaveOffset: 0 }, 'C').midiNote).toBe(60);
  });

  it('AC-2.2.5 — octaveOffset shifts by exactly twelve semitones per step', () => {
    const base = resolve({ degree: '1', octaveOffset: 0 }, 'C').midiNote;
    expect(resolve({ degree: '1', octaveOffset: -1 }, 'C').midiNote).toBe(base - 12);
    expect(resolve({ degree: '1', octaveOffset: 1 }, 'C').midiNote).toBe(base + 12);
    expect(resolve({ degree: '1', octaveOffset: -2 }, 'C').midiNote).toBe(base - 24);
  });

  it('AC-2.3.2 — changing Key transposes every degree by the same interval', () => {
    for (const [i, key] of KEYS.entries()) {
      for (const degree of ['1', '3', '5', 'b7']) {
        const inC = resolve({ degree, octaveOffset: 0 }, 'C').midiNote;
        expect(resolve({ degree, octaveOffset: 0 }, key).midiNote, `${degree} in ${key}`).toBe(inC + i);
      }
    }
  });

  it('AC-2.2.6 — every degree resolves across the full octave range in all twelve Keys', () => {
    const degrees = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
    for (const key of KEYS) {
      for (const octaveOffset of [-3, -2, -1, 0, 1, 2, 3]) {
        for (const degree of degrees) {
          const { midiNote, frequency } = resolve({ degree, octaveOffset }, key);
          expect(Number.isInteger(midiNote), `${degree} ${key} ${octaveOffset}`).toBe(true);
          expect(frequency).toBeGreaterThan(0);
        }
      }
    }
  });

  it('AC-2.2.7 — frequency is equal temperament with A4 = 440 Hz', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 10);
    expect(midiToFrequency(60)).toBeCloseTo(261.6255653, 6);
    expect(midiToFrequency(81)).toBeCloseTo(880, 10);
  });

  it('AC-2.2.8 — an invalid degree or octave is rejected rather than guessed', () => {
    expect(() => degreeSemitones('0')).toThrow(/Invalid scale degree/);
    expect(() => degreeSemitones('x')).toThrow(/Invalid scale degree/);
    expect(() => degreeSemitones('')).toThrow(/Invalid scale degree/);
    expect(() => resolve({ degree: '1', octaveOffset: 0.5 }, 'C')).toThrow(/integer/);
  });

  it('AC-2.2.9 — resolution is pure: the same input always gives the same pitch', () => {
    const a = resolve({ degree: 'b3', octaveOffset: -1 }, 'Eb');
    const b = resolve({ degree: 'b3', octaveOffset: -1 }, 'Eb');
    expect(a).toEqual(b);
  });
});

/**
 * The arithmetic behind the pitch strip. It lives in core/ for the same reason
 * every other musical conversion does: the strip must not be the second place
 * that knows what octave an offset means.
 */
describe('core/pitch — the pitch strip’s vocabulary (US-2.2)', () => {
  it('AC-2.2.3 — the octave stepper clamps at 1 and 7 rather than wrapping', () => {
    expect(clampOctave(MIN_OCTAVE - 1)).toBe(MIN_OCTAVE);
    expect(clampOctave(MAX_OCTAVE + 1)).toBe(MAX_OCTAVE);
    expect(clampOctave(-40)).toBe(MIN_OCTAVE);
    expect(clampOctave(40)).toBe(MAX_OCTAVE);
    for (let o = MIN_OCTAVE; o <= MAX_OCTAVE; o++) expect(clampOctave(o)).toBe(o);
  });

  it('AC-2.2.3 — octave number and stored offset are inverses, based at octave 4', () => {
    expect(BASE_OCTAVE).toBe(4);
    expect(octaveNumber(0)).toBe(BASE_OCTAVE);
    expect(octaveOffsetFor(BASE_OCTAVE)).toBe(0);
    // The strip's full span is exactly octaves 1-7, so -3..+3 and nothing more.
    expect([...Array(7).keys()].map((i) => octaveOffsetFor(i + MIN_OCTAVE)))
      .toEqual([-3, -2, -1, 0, 1, 2, 3]);
    for (let offset = -3; offset <= 3; offset++) {
      expect(octaveOffsetFor(octaveNumber(offset))).toBe(offset);
    }
    // The readout is a view of stored data, so it must agree with resolution:
    // degree 1 in C at octave 4 is middle C.
    expect(resolve({ degree: '1', octaveOffset: octaveOffsetFor(4) }, 'C').midiNote).toBe(60);
  });

  it('every degree token the data model allows resolves, at every octave the strip offers', () => {
    // The strip now offers the twelve chromatic tokens (AC-2.2.4, proven in
    // e2e); stored data may still carry any token up to 15, altered either way.
    for (let n = 1; n <= 15; n++) {
      for (const accidental of ['b', '', '#']) {
        for (let offset = -3; offset <= 3; offset++) {
          const { midiNote } = resolve({ degree: `${accidental}${n}`, octaveOffset: offset }, 'B');
          expect(Number.isInteger(midiNote), `${accidental}${n} at ${offset}`).toBe(true);
        }
      }
    }
  });

  it('a degree token splits into accidental and number', () => {
    expect(splitDegree('b3')).toEqual(['b', '3']);
    expect(splitDegree('#4')).toEqual(['#', '4']);
    expect(splitDegree('10')).toEqual(['', '10']);
    for (const token of ['1', 'b3', '#4', 'b7', '9', '15']) {
      const [accidental, number] = splitDegree(token);
      expect(`${accidental}${number}`).toBe(token);
    }
    // A malformed token has to fail here rather than reach a Pattern.
    expect(() => splitDegree('0')).toThrow(/Invalid scale degree/);
    expect(() => splitDegree('x3')).toThrow(/Invalid scale degree/);
  });

  it('AC-2.2.15/5 — The note name is spelled diatonically against the Key: each degree takes its own letter, so degree 3 in D♭ is `F` and `b3` is `Fb` rather than `E`, which is how the interval is written on a stave: the major scale of every Key', () => {
    // Each Key's seven degrees, spelled the way its key signature is written.
    // The property that matters is not any single name but that the seven use
    // seven different letters — that is what makes a scale readable, and it is
    // what pitch-class naming would break.
    const expected = {
      C: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
      G: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5'],
      F: ['F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5'],
      Db: ['Db4', 'Eb4', 'F4', 'Gb4', 'Ab4', 'Bb4', 'C5'],
      B: ['B4', 'C#5', 'D#5', 'E5', 'F#5', 'G#5', 'A#5'],
      Gb: ['Gb4', 'Ab4', 'Bb4', 'Cb5', 'Db5', 'Eb5', 'F5'],
    };

    for (const [key, names] of Object.entries(expected)) {
      const got = ['1', '2', '3', '4', '5', '6', '7'].map(
        (degree) => noteName({ degree, octaveOffset: 0 }, key).text
      );
      expect(got, key).toEqual(names);
    }

    // The seven-different-letters property, across every supported Key.
    for (const key of KEYS) {
      const letters = ['1', '2', '3', '4', '5', '6', '7'].map(
        (degree) => noteName({ degree, octaveOffset: 0 }, key).letter
      );
      expect(new Set(letters).size, key).toBe(7);
    }
  });

  it('AC-2.2.15/5 — The note name is spelled diatonically against the Key: each degree takes its own letter, so degree 3 in D♭ is `F` and `b3` is `Fb` rather than `E`, which is how the interval is written on a stave: altered degrees keep their own letter', () => {
    // The point of diatonic spelling. b3 in Db sounds the same key as E, but a
    // third must be spelled on the third's letter, so it is Fb.
    expect(noteName({ degree: 'b3', octaveOffset: 0 }, 'Db').text).toBe('Fb4');
    expect(noteName({ degree: 'b3', octaveOffset: 0 }, 'C').text).toBe('Eb4');
    expect(noteName({ degree: '#4', octaveOffset: 0 }, 'C').text).toBe('F#4');
    expect(noteName({ degree: 'b7', octaveOffset: 0 }, 'C').text).toBe('Bb4');
    // A double accidental is a real spelling, not an error: the second degree
    // of Gb is Ab, and flattening it gives Abb.
    expect(noteName({ degree: 'b2', octaveOffset: 0 }, 'Gb').text).toBe('Abb4');
  });

  it("AC-2.2.15/2 — The band shows the note name that degree resolves to in the Pattern's Key — letter, accidental where the spelling has one, and absolute octave number: the octave follows the letter, not the sounding note", () => {
    // Cb5 sounds MIDI 71, which is B4's number — but it is a C, so it belongs
    // to octave 5. Naming it B4 would put it on the wrong line of the stave.
    const cb = noteName({ degree: '4', octaveOffset: 0 }, 'Gb');
    expect(cb.text).toBe('Cb5');
    expect(resolve({ degree: '4', octaveOffset: 0 }, 'Gb').midiNote).toBe(
      resolve({ degree: '7', octaveOffset: 0 }, 'C').midiNote
    );

    // Degree 8 is the octave, so it names the tonic one octave up.
    expect(noteName({ degree: '8', octaveOffset: 0 }, 'C').text).toBe('C5');
    expect(noteName({ degree: '15', octaveOffset: 0 }, 'C').text).toBe('C6');

    // The stepper's range moves the octave number and nothing else.
    expect(noteName({ degree: '1', octaveOffset: -3 }, 'C').text).toBe('C1');
    expect(noteName({ degree: '1', octaveOffset: 3 }, 'C').text).toBe('C7');
  });

  it("AC-2.2.15/2 — The band shows the note name that degree resolves to in the Pattern's Key — letter, accidental where the spelling has one, and absolute octave number: the name always agrees with what sounds", () => {
    // The name is a label on the resolved pitch, so it can never drift from it:
    // re-deriving the pitch class from the printed name must return the note
    // that resolve() produced. This is the invariant that keeps SC-003 honest
    // on screen as well as in the .mid file.
    const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const SHIFT = { bb: -2, b: -1, '': 0, '#': 1, '##': 2 };

    for (const key of KEYS) {
      for (let n = 1; n <= 15; n++) {
        for (const accidental of ['', 'b', '#']) {
          for (const octaveOffset of [-3, 0, 3]) {
            const pitch = { degree: `${accidental}${n}`, octaveOffset };
            let named;
            try {
              named = noteName(pitch, key);
            } catch {
              continue; // a spelling beyond a double accidental; refused, not guessed
            }
            const { midiNote } = resolve(pitch, key);
            const fromName = (NATURAL[named.letter] + SHIFT[named.accidental] + 12) % 12;
            expect(fromName, `${pitch.degree} in ${key} -> ${named.text}`).toBe(
              ((midiNote % 12) + 12) % 12
            );
          }
        }
      }
    }
  });

  it('every degree the shipped library uses still splits and resolves', () => {
    // Four shipped Patterns use 8, 9 and 10; tokens above the strip's chromatic
    // octave remain valid stored data (AC-2.2.4/3).
    for (const degree of ['1', '3', '4', '5', '6', '7', '8', '9', '10', 'b7']) {
      const [accidental, number] = splitDegree(degree);
      expect(`${accidental}${number}`).toBe(degree);
      expect(Number.isInteger(resolve({ degree, octaveOffset: 0 }, 'C').midiNote)).toBe(true);
    }
  });
});
