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
  normaliseTempo,
  setTempo,
  sequencePasses,
  entryAtPass,
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

describe('core/arrangement — the sequence as it plays (US-20.2)', () => {
  /** Intro twice, Verse three times, Outro once; once through each is 1, 3 and 2 passes. */
  const entries = [
    { kind: 'pattern', id: 'a', name: 'Intro', repeats: 2 },
    { kind: 'pattern', id: 'b', name: 'Verse', repeats: 3 },
    { kind: 'section', id: 'c', name: 'Outro', repeats: 1 },
  ];
  const once = { a: 1, b: 3, c: 2 };
  const passesOf = (e) => once[e.id];

  it('AC-20.2.1/1 — Play sounds every sequence entry in order, each for its repeats, the next taking over at a pass boundary with nothing stopped, and after the last entry the first sounds again: which entry a pass belongs to', () => {
    // 2×1, 3×3 and 1×2 passes: thirteen in all.
    expect(sequencePasses(entries, passesOf)).toEqual([2, 9, 2]);
    const order = Array.from({ length: 13 }, (_, loop) => entryAtPass(entries, passesOf, loop).index);
    expect(order).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2]);
    // Past the end it is the first again, and so on round.
    expect(entryAtPass(entries, passesOf, 13)).toEqual({ index: 0, passInEntry: 0, repeat: 0 });
    expect(entryAtPass(entries, passesOf, 13 * 4 + 11).index).toBe(2);
    // Nothing laid, nothing sounds.
    expect(entryAtPass([], passesOf, 0)).toBeNull();
  });

  it('AC-20.2.1/2 — One repeat is once through what the entry plays: a Pattern once, or one harmonic cycle when it carries a progression; a Section once through its combined loop; a Chain once through its entries: repeats count whole times through', () => {
    // The Verse is three passes once through, played three times: the repeat turns over every third pass.
    const verse = Array.from({ length: 9 }, (_, k) => entryAtPass(entries, passesOf, 2 + k));
    expect(verse.map((v) => v.repeat)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(verse.every((v) => v.index === 1)).toBe(true);
    // Changing an entry's repeats changes only how long it lasts.
    const longer = entries.map((e) => (e.id === 'a' ? { ...e, repeats: 4 } : e));
    expect(sequencePasses(longer, passesOf)).toEqual([4, 9, 2]);
  });

  it('AC-20.2.1/3 — A progression starts from its first chord each time an entry begins, whatever was sounding before it: the pass counted from where the entry began', () => {
    // The Verse begins on the third pass of the run and is counted from nought there.
    expect(entryAtPass(entries, passesOf, 2)).toEqual({ index: 1, passInEntry: 0, repeat: 0 });
    expect(entryAtPass(entries, passesOf, 4).passInEntry).toBe(2);
    expect(entryAtPass(entries, passesOf, 10).passInEntry).toBe(8);
    // And from nought again the next time round the sequence.
    expect(entryAtPass(entries, passesOf, 13 + 2)).toEqual({ index: 1, passInEntry: 0, repeat: 0 });
    expect(entryAtPass(entries, passesOf, 11)).toEqual({ index: 2, passInEntry: 0, repeat: 0 });
  });

  it('AC-20.2.1/6 — An entry whose Pattern, Section or Chain is no longer in the library is passed over, and the rest of the sequence plays: an entry with nothing to play lasts no passes', () => {
    const gone = (e) => (e.id === 'b' ? 0 : once[e.id]);
    expect(sequencePasses(entries, gone)).toEqual([2, 0, 2]);
    expect(Array.from({ length: 5 }, (_, loop) => entryAtPass(entries, gone, loop).index)).toEqual([0, 0, 2, 2, 0]);
    // Everything gone: nothing sounds at all.
    expect(entryAtPass(entries, () => 0, 0)).toBeNull();
    expect(entryAtPass(entries, () => undefined, 3)).toBeNull();
  });

  it('AC-20.2.3/1 — An Arrangement takes its tempo, in quarter notes a minute, from the first entry laid in its sequence, and from then on the tempo is its own: the tempo is a whole number held to 18–300', () => {
    const a = createArrangement('Sunday song');
    expect(a.tempo).toBeUndefined();
    expect(setTempo(a, 96).tempo).toBe(96);
    expect(setTempo(a, 95.6).tempo).toBe(96);
    expect(setTempo(a, 5).tempo).toBe(18);
    expect(setTempo(a, 999).tempo).toBe(300);
    expect(normaliseTempo('fast')).toBe(18);
    // Nothing else of the Arrangement is touched, and the one handed in is not changed.
    expect(setTempo(addEntry(a, 'pattern', 's_21', 'Intro'), 120).entries).toHaveLength(1);
    expect(a.tempo).toBeUndefined();
    // Stored, it must be a whole number in range; absent is sound.
    const laid = addEntry(a, 'pattern', 's_21', 'Intro');
    expect(validateArrangement(laid)).toEqual([]);
    expect(validateArrangement({ ...laid, tempo: 96 })).toEqual([]);
    expect(validateArrangement({ ...laid, tempo: 400 })).toContain('A tempo must be a whole number from 18 to 300');
    expect(validateArrangement({ ...laid, tempo: 96.5 })).toContain('A tempo must be a whole number from 18 to 300');
  });
});
