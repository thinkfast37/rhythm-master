import { describe, it, expect } from 'vitest';
import {
  createChain,
  addEntry,
  removeEntry,
  moveEntry,
  setEntryRepeats,
  entryPasses,
  totalPasses,
  entryAt,
  playingAt,
  validateChain,
  MAX_REPEATS,
} from '../../../src/core/chain.js';
import { create, cycleAccent, setPitch, validate, MAX_MEASURES } from '../../../src/core/pattern.js';
import { chainMeasureCount, chainWriteOutRefusal, chainAsPattern } from '../../../src/core/composer.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import { buildChainMidi } from '../../../src/export/midi.js';
import { setProgression, setChange, cyclePasses, setArpeggio } from '../../../src/core/harmony.js';

/** A one-Measure melodic Pattern under I–IV–V changing every pass: three passes per cycle. */
function harmonicPattern() {
  let p = { ...create('Harmonic'), id: 'p_1', soundMode: 'melodic', key: 'C', tempo: 120 };
  p = setProgression(p, 'I-IV-V');
  p = setChange(p, 'pass');
  p = cycleAccent(p, 0, 0, 0);
  p = setPitch(p, 0, 0, 0, { tone: 1, octaveOffset: 0 });
  return setArpeggio(p, 'up');
}

const library = (...patterns) => (id) => patterns.find((p) => p.id === id) ?? null;

describe('core/chain', () => {
  it('AC-18.1.3/1 — Each entry is in force for its repeats, one repeat being one harmonic cycle, and the next entry takes over from the very next pass with nothing stopped or restarted, the loop counter still counting: the resolver', () => {
    const p = harmonicPattern();
    expect(cyclePasses(p)).toBe(3);
    let chain = createChain('Study', 'p_1');
    chain = addEntry(chain, 0, 'up', 2);
    chain = addEntry(chain, 0, 'down', 1);
    const byId = library(p);

    expect(entryPasses(p, chain.sections[0].entries[0])).toBe(6);
    expect(entryPasses(p, chain.sections[0].entries[1])).toBe(3);

    const fills = Array.from({ length: 10 }, (_, loop) => entryAt(chain, byId, loop).fill);
    expect(fills).toEqual(['up', 'up', 'up', 'up', 'up', 'up', 'down', 'down', 'down', 'up']);

    // The absolute loop keeps counting; only the entry's own pass restarts.
    expect(entryAt(chain, byId, 5)).toEqual({ sectionIndex: 0, entryIndex: 0, fill: 'up', passInEntry: 5 });
    expect(entryAt(chain, byId, 6)).toEqual({ sectionIndex: 0, entryIndex: 1, fill: 'down', passInEntry: 0 });
    expect(entryAt(chain, byId, 8)).toEqual({ sectionIndex: 0, entryIndex: 1, fill: 'down', passInEntry: 2 });

    // playingAt is the Pattern with that entry's fill in force, as a playback overlay.
    expect(playingAt(chain, byId, 0).harmony.arpeggio).toBe('up');
    expect(playingAt(chain, byId, 7).harmony.arpeggio).toBe('down');
    expect(playingAt(chain, byId, 7).measures).toEqual(p.measures);
    expect(p.harmony.arpeggio).toBe('up'); // the Pattern itself is untouched
  });

  it('AC-18.1.3/2 — After the last entry the first is in force again; the Chain loops until stopped: the resolver', () => {
    const p = harmonicPattern();
    let chain = createChain('Study', 'p_1');
    chain = addEntry(chain, 0, 'up', 2);
    chain = addEntry(chain, 0, 'down', 1);
    const byId = library(p);
    expect(totalPasses(chain, byId)).toBe(9);
    expect(entryAt(chain, byId, 9)).toEqual({ sectionIndex: 0, entryIndex: 0, fill: 'up', passInEntry: 0 });
    expect(entryAt(chain, byId, 9 + 6)).toEqual({ sectionIndex: 0, entryIndex: 1, fill: 'down', passInEntry: 0 });
    expect(entryAt(chain, byId, 9 * 4 + 7).fill).toBe('down');
    expect(entryAt(chain, byId, 9 * 100).fill).toBe('up');
  });

  it('AC-18.1.2/4 — The Chain is shown as an ordered list naming each fill and its repeats, with the total number of passes it plays, and says when it is empty: the resolver', () => {
    const p = harmonicPattern();
    const byId = library(p);
    const empty = createChain('Study', 'p_1');
    expect(totalPasses(empty, byId)).toBe(0);
    expect(entryAt(empty, byId, 0)).toBeNull();
    expect(playingAt(empty, byId, 0)).toBeNull();

    let chain = addEntry(empty, 0, 'up', 2);
    expect(totalPasses(chain, byId)).toBe(6);
    chain = addEntry(chain, 0, 'alberti', 4);
    expect(totalPasses(chain, byId)).toBe(18);
    chain = addEntry(chain, 0, 'root', 1);
    expect(totalPasses(chain, byId)).toBe(21);
    expect(chain.sections[0].entries).toEqual([
      { fill: 'up', repeats: 2 },
      { fill: 'alberti', repeats: 4 },
      { fill: 'root', repeats: 1 },
    ]);

    // Without a progression one repeat is one pass.
    const plain = { ...create('Plain'), id: 'p_2' };
    const plainChain = addEntry(createChain('Plain study', 'p_2'), 0, 'up', 5);
    expect(totalPasses(plainChain, library(plain))).toBe(5);
  });

  it("AC-18.1.2/2 — Each entry's repeats can be set from 1 to 16 in place: the resolver", () => {
    let chain = addEntry(createChain('Study', 'p_1'), 0, 'up', 1);
    chain = setEntryRepeats(chain, 0, 0, 16);
    expect(chain.sections[0].entries[0].repeats).toBe(16);
    chain = setEntryRepeats(chain, 0, 0, 1);
    expect(chain.sections[0].entries[0].repeats).toBe(1);
    expect(MAX_REPEATS).toBe(16);

    expect(() => setEntryRepeats(chain, 0, 0, 0)).toThrow();
    expect(() => setEntryRepeats(chain, 0, 0, 17)).toThrow();
    expect(() => setEntryRepeats(chain, 0, 0, 2.5)).toThrow();
    expect(() => setEntryRepeats(chain, 0, 0, '4')).toThrow();
    expect(() => addEntry(chain, 0, 'up', 0)).toThrow();
    expect(() => addEntry(chain, 0, 'up', 17)).toThrow();
    expect(() => addEntry(chain, 0, 'no-such-fill', 4)).toThrow(/Unknown fill/);
    expect(() => addEntry(chain, 0, 'none', 4)).toThrow(/Unknown fill/);

    // Editors are immutable: the original is left alone.
    const before = JSON.parse(JSON.stringify(chain));
    setEntryRepeats(chain, 0, 0, 8);
    expect(chain).toEqual(before);

    expect(validateChain(chain)).toEqual([]);
    expect(validateChain({ ...chain, name: '' })).toHaveLength(1);
    expect(validateChain({ ...chain, sections: [] })).toHaveLength(1);
    expect(validateChain({ ...chain, sections: [{ patternId: 'p_1', entries: [{ fill: 'up', repeats: 99 }] }] })).toHaveLength(1);
    expect(validateChain({ ...chain, sections: [{ patternId: '', entries: [{ fill: 'nope', repeats: 1 }] }] })).toHaveLength(2);
  });

  it('AC-18.1.2/3 — An entry can be moved up, moved down and removed; the same fill may appear in the Chain more than once: the resolver', () => {
    let chain = createChain('Study', 'p_1');
    chain = addEntry(chain, 0, 'up', 1);
    chain = addEntry(chain, 0, 'down', 2);
    chain = addEntry(chain, 0, 'up', 3);
    const fills = (s) => s.sections[0].entries.map((e) => `${e.fill}×${e.repeats}`);
    expect(fills(chain)).toEqual(['up×1', 'down×2', 'up×3']);

    // Moving at the ends is a no-op.
    expect(moveEntry(chain, 0, 0, -1)).toBe(chain);
    expect(moveEntry(chain, 0, 2, +1)).toBe(chain);

    const down = moveEntry(chain, 0, 0, +1);
    expect(fills(down)).toEqual(['down×2', 'up×1', 'up×3']);
    expect(fills(chain)).toEqual(['up×1', 'down×2', 'up×3']); // untouched

    const up = moveEntry(down, 0, 2, -1);
    expect(fills(up)).toEqual(['down×2', 'up×3', 'up×1']);

    const removed = removeEntry(up, 0, 1);
    expect(fills(removed)).toEqual(['down×2', 'up×1']);
    expect(fills(up)).toEqual(['down×2', 'up×3', 'up×1']);

    expect(() => removeEntry(removed, 0, 5)).toThrow();
    expect(() => moveEntry(removed, 0, 0, 2)).toThrow();
  });
});

describe('core/composer — a Chain written out as a Pattern (AC-18.1.6)', () => {
  /** The MIDI notes a Pattern sounds over one pass, in order. */
  const notesOf = (pattern, pass = 0) => buildTimeline(pattern, pass).filter((e) => e.pitch).map((e) => e.pitch.midiNote);

  it('AC-18.1.6/2 — The new Pattern holds as stored notes every pass of the Chain in order, each entry for its repeats, one Measure for each Measure of each pass, with no progression and no Register, in the Key, scale, tempo and swing of the Pattern the Chain plays over', () => {
    const base = { ...harmonicPattern(), key: 'D', scale: 'dorian', tempo: 96, swingAmount: 30, register: 1 };
    const lib = library(base);
    let chain = createChain('Study', 'p_1');
    chain = addEntry(chain, 0, 'up', 2);
    chain = addEntry(chain, 0, 'down', 1);
    // Three passes a cycle: two repeats and one, nine passes, nine Measures.
    expect(totalPasses(chain, lib)).toBe(9);
    expect(chainMeasureCount(chain, lib)).toBe(9);

    const written = chainAsPattern(chain, lib, 'Study written out');
    expect(written.measures).toHaveLength(9);
    expect(written.name).toBe('Study written out');
    expect(validate({ ...written, id: 'p_9' })).toEqual({ valid: true, errors: [] });
    // No progression, no Register, no id of the Pattern it came from; its Key, scale, tempo and swing kept.
    expect(written.harmony).toBeUndefined();
    expect(written.register).toBeUndefined();
    expect(written.id).toBeUndefined();
    expect(written).toMatchObject({ soundMode: 'melodic', key: 'D', scale: 'dorian', tempo: 96, swingAmount: 30 });

    // Pass by pass, what the written Pattern sounds is what the Chain sounds: each
    // entry for its repeats, the progression restarting when an entry takes over.
    const heard = [];
    for (let loop = 0; loop < 9; loop++) {
      const at = entryAt(chain, lib, loop);
      heard.push(...notesOf(playingAt(chain, lib, loop), at.passInEntry));
    }
    expect(heard).toHaveLength(9);
    expect(notesOf(written)).toEqual(heard);
    // And the first entry's fill is not the second's: the switch is in the notes.
    const perPass = heard.length / 9;
    expect(heard.slice(0, perPass * 3)).not.toEqual(heard.slice(perPass * 6, perPass * 9));
    // The same notes, in the same order, as the Chain's own MIDI file carries.
    const noteOns = (bytes) => {
      const out = [];
      for (let i = 0; i < bytes.length - 2; i++) if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 2] > 0 && bytes[i + 1] < 0x80) out.push(bytes[i + 1]);
      return out;
    };
    const fromFile = noteOns(buildChainMidi(chain, lib));
    expect(heard.every((n) => fromFile.includes(n))).toBe(true);
    // Nothing handed in was changed.
    expect(base.harmony).toBeDefined();
    expect(base.measures).toHaveLength(1);
    expect(chain.sections[0].entries).toHaveLength(2);
  });

  it('AC-18.1.6/4 — A Chain that would need more than 32 Measures is refused with the number it needs, and Write out as Pattern is unavailable while the Chain is empty: the rule', () => {
    const lib = library(harmonicPattern());
    const empty = createChain('Study', 'p_1');
    expect(chainWriteOutRefusal(empty, lib)).toBe('The Chain is empty');
    expect(chainAsPattern(empty, lib, 'x')).toBeNull();

    // Ten repeats of a three-pass cycle is 30 Measures: within reach.
    const thirty = addEntry(empty, 0, 'up', 10);
    expect(chainMeasureCount(thirty, lib)).toBe(30);
    expect(chainWriteOutRefusal(thirty, lib)).toBeNull();
    expect(chainAsPattern(thirty, lib, 'x').measures).toHaveLength(30);

    // One more repeat is 33: refused, naming the number, and nothing is cut short.
    const over = addEntry(thirty, 0, 'down', 1);
    expect(chainMeasureCount(over, lib)).toBe(33);
    expect(MAX_MEASURES).toBe(32);
    expect(chainWriteOutRefusal(over, lib)).toMatch(/33 Measures/);
    expect(chainWriteOutRefusal(over, lib)).toMatch(/32/);
    expect(chainAsPattern(over, lib, 'x')).toBeNull();
  });
});
