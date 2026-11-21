import { describe, it, expect } from 'vitest';
import {
  ITEM_KINDS,
  MIN_REPEATS,
  MAX_REPEATS,
  createArrangement,
  normaliseRepeats,
  inPalette,
  addToPalette,
  removeFromPalette,
  addEntry,
  removeEntry,
  moveEntry,
  setEntryRepeats,
  setEntryName,
  usesItem,
  isEmpty,
  validateArrangement,
} from '../../../src/core/arrangement.js';

/** A palette of a Section, a Pattern and a Chain, with nothing laid out yet. */
const palette = () => addToPalette(addToPalette(addToPalette(createArrangement('Sunday song'), 'section', 'arr_1'), 'pattern', 's_21'), 'chain', 'song_2');

describe('core/arrangement', () => {
  it('AC-20.1.2/2 — A palette entry shows its name and its type, a Percussive Pattern saying that it plays on the drum kit, and nothing is in the palette twice: the palette holds each item once, by kind and id', () => {
    const a = palette();
    expect(ITEM_KINDS).toEqual(['pattern', 'section', 'chain']);
    expect(a.palette).toEqual([
      { kind: 'section', id: 'arr_1' },
      { kind: 'pattern', id: 's_21' },
      { kind: 'chain', id: 'song_2' },
    ]);
    expect(inPalette(a, 'pattern', 's_21')).toBe(true);
    // Added again, it is not there twice, and the Arrangement handed in is returned as it was.
    expect(addToPalette(a, 'pattern', 's_21')).toBe(a);
    // A Section and a Pattern may share an id's text and still be two things.
    expect(addToPalette(a, 'pattern', 'arr_1').palette).toHaveLength(4);
    expect(() => addToPalette(a, 'opera', 'x')).toThrow();
    expect(() => addToPalette(a, 'pattern', '')).toThrow();
    // Nothing handed in is changed.
    expect(createArrangement('x')).toEqual({ id: null, name: 'x', palette: [], entries: [] });
  });

  it('AC-20.1.2/3 — Remove takes an entry out of the palette and leaves every sequence entry made from it: the rule', () => {
    let a = addEntry(addEntry(palette(), 'pattern', 's_21', 'Intro'), 'section', 'arr_1', 'Verse');
    a = removeFromPalette(a, 1);
    expect(a.palette).toEqual([
      { kind: 'section', id: 'arr_1' },
      { kind: 'chain', id: 'song_2' },
    ]);
    expect(a.entries.map((e) => e.id)).toEqual(['s_21', 'arr_1']);
    // Still named by the Arrangement, so still in use.
    expect(usesItem(a, 'pattern', 's_21')).toBe(true);
    expect(() => removeFromPalette(a, 5)).toThrow();
  });

  it('AC-20.1.3/1 — Tapping a palette entry appends it to the sequence as an entry named after it, played once: the rule', () => {
    const a = addEntry(palette(), 'pattern', 's_21', 'Bossa Nova');
    expect(a.entries).toEqual([{ kind: 'pattern', id: 's_21', name: 'Bossa Nova', repeats: 1 }]);
    expect(MIN_REPEATS).toBe(1);
    // Appended, in order.
    expect(addEntry(a, 'section', 'arr_1', 'Verse bed').entries.map((e) => e.name)).toEqual(['Bossa Nova', 'Verse bed']);
  });

  it('AC-20.1.3/2 — The name of a sequence entry can be changed in place, and its repeats set from 1 to 16: the rule', () => {
    let a = addEntry(palette(), 'pattern', 's_21', 'Bossa Nova');
    a = setEntryName(a, 0, '  Intro ');
    expect(a.entries[0].name).toBe('Intro');
    // An empty name is refused: the entry keeps the one it had.
    expect(setEntryName(a, 0, '   ')).toBe(a);
    a = setEntryRepeats(a, 0, 4);
    expect(a.entries[0].repeats).toBe(4);
    expect(MAX_REPEATS).toBe(16);
    expect(setEntryRepeats(a, 0, 99).entries[0].repeats).toBe(16);
    expect(setEntryRepeats(a, 0, 0).entries[0].repeats).toBe(1);
    expect(setEntryRepeats(a, 0, 2.6).entries[0].repeats).toBe(3);
    expect(normaliseRepeats('abc')).toBe(1);
    // What it plays is untouched by either.
    expect(a.entries[0]).toMatchObject({ kind: 'pattern', id: 's_21' });
    expect(() => setEntryRepeats(a, 3, 2)).toThrow();
  });

  it('AC-20.1.3/3 — A sequence entry can be moved up, moved down and removed, and the same palette entry may be in the sequence more than once: the rule', () => {
    let a = palette();
    a = addEntry(a, 'pattern', 's_21', 'Intro');
    a = addEntry(a, 'section', 'arr_1', 'Verse');
    a = addEntry(a, 'pattern', 's_21', 'Outro');
    const names = (x) => x.entries.map((e) => e.name);
    expect(names(a)).toEqual(['Intro', 'Verse', 'Outro']);
    expect(a.entries.filter((e) => e.id === 's_21')).toHaveLength(2);
    expect(names(moveEntry(a, 2, -1))).toEqual(['Intro', 'Outro', 'Verse']);
    expect(names(moveEntry(a, 0, 1))).toEqual(['Verse', 'Intro', 'Outro']);
    // At either end it stays where it is.
    expect(moveEntry(a, 0, -1)).toBe(a);
    expect(moveEntry(a, 2, 1)).toBe(a);
    expect(names(removeEntry(a, 1))).toEqual(['Intro', 'Outro']);
    // The Arrangement handed in is not changed.
    expect(names(a)).toEqual(['Intro', 'Verse', 'Outro']);
  });

  it('AC-20.1.4/5 — Deleting a Pattern, a Section or a Chain that an Arrangement uses is refused with a message naming the Arrangement or Arrangements, until they no longer use it: what counts as using', () => {
    const a = addEntry(palette(), 'pattern', 'p_9', 'Bridge');
    // In the palette, in the sequence, or both.
    expect(usesItem(a, 'section', 'arr_1')).toBe(true);
    expect(usesItem(a, 'chain', 'song_2')).toBe(true);
    expect(usesItem(a, 'pattern', 'p_9')).toBe(true);
    // The kind matters: a Pattern is not the Section that shares its id.
    expect(usesItem(a, 'pattern', 'arr_1')).toBe(false);
    expect(usesItem(a, 'pattern', 'p_1')).toBe(false);
    expect(isEmpty(createArrangement())).toBe(true);
    expect(isEmpty(a)).toBe(false);
  });

  it('AC-20.1.4/1 — Save asks a name, unique among Arrangements, and stores the name, the palette and the sequence in order; it is unavailable while the sequence is empty: a sound Arrangement', () => {
    const a = addEntry(palette(), 'pattern', 's_21', 'Intro', 2);
    expect(validateArrangement(a)).toEqual([]);
    expect(validateArrangement({ ...a, name: ' ' })).toContain('An Arrangement needs a name');
    expect(validateArrangement({ ...a, palette: [...a.palette, { kind: 'pattern', id: 's_21' }] })).toContain('"s_21" is in the palette twice');
    expect(validateArrangement({ ...a, entries: [{ kind: 'pattern', id: 's_21', name: 'x', repeats: 17 }] })).toContain('Entry 1 repeats must be a whole number from 1 to 16');
    expect(validateArrangement({ ...a, entries: [{ kind: 'opera', id: 's_21', name: 'x', repeats: 1 }] })).toContain('Entry 1 needs a kind and an id');
    expect(validateArrangement({ ...a, entries: [{ kind: 'pattern', id: 's_21', name: '', repeats: 1 }] })).toContain('Entry 1 needs a name');
    expect(validateArrangement(null)).toEqual(['An Arrangement must be an object']);
  });
});
