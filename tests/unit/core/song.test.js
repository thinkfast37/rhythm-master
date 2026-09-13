import { describe, it, expect } from 'vitest';
import {
  createSong,
  addEntry,
  removeEntry,
  moveEntry,
  setEntryRepeats,
  entryPasses,
  totalPasses,
  entryAt,
  playingAt,
  validateSong,
  MAX_REPEATS,
} from '../../../src/core/song.js';
import { create, cycleAccent, setPitch } from '../../../src/core/pattern.js';
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

describe('core/song', () => {
  it('AC-18.1.3/1 — Each entry is in force for its repeats, one repeat being one harmonic cycle, and the next entry takes over from the very next pass with nothing stopped or restarted, the loop counter still counting: the resolver', () => {
    const p = harmonicPattern();
    expect(cyclePasses(p)).toBe(3);
    let song = createSong('Study', 'p_1');
    song = addEntry(song, 0, 'up', 2);
    song = addEntry(song, 0, 'down', 1);
    const byId = library(p);

    expect(entryPasses(p, song.sections[0].entries[0])).toBe(6);
    expect(entryPasses(p, song.sections[0].entries[1])).toBe(3);

    const fills = Array.from({ length: 10 }, (_, loop) => entryAt(song, byId, loop).fill);
    expect(fills).toEqual(['up', 'up', 'up', 'up', 'up', 'up', 'down', 'down', 'down', 'up']);

    // The absolute loop keeps counting; only the entry's own pass restarts.
    expect(entryAt(song, byId, 5)).toEqual({ sectionIndex: 0, entryIndex: 0, fill: 'up', passInEntry: 5 });
    expect(entryAt(song, byId, 6)).toEqual({ sectionIndex: 0, entryIndex: 1, fill: 'down', passInEntry: 0 });
    expect(entryAt(song, byId, 8)).toEqual({ sectionIndex: 0, entryIndex: 1, fill: 'down', passInEntry: 2 });

    // playingAt is the Pattern with that entry's fill in force, as a playback overlay.
    expect(playingAt(song, byId, 0).harmony.arpeggio).toBe('up');
    expect(playingAt(song, byId, 7).harmony.arpeggio).toBe('down');
    expect(playingAt(song, byId, 7).measures).toEqual(p.measures);
    expect(p.harmony.arpeggio).toBe('up'); // the Pattern itself is untouched
  });

  it('AC-18.1.3/2 — After the last entry the first is in force again; the Section loops until stopped: the resolver', () => {
    const p = harmonicPattern();
    let song = createSong('Study', 'p_1');
    song = addEntry(song, 0, 'up', 2);
    song = addEntry(song, 0, 'down', 1);
    const byId = library(p);
    expect(totalPasses(song, byId)).toBe(9);
    expect(entryAt(song, byId, 9)).toEqual({ sectionIndex: 0, entryIndex: 0, fill: 'up', passInEntry: 0 });
    expect(entryAt(song, byId, 9 + 6)).toEqual({ sectionIndex: 0, entryIndex: 1, fill: 'down', passInEntry: 0 });
    expect(entryAt(song, byId, 9 * 4 + 7).fill).toBe('down');
    expect(entryAt(song, byId, 9 * 100).fill).toBe('up');
  });

  it('AC-18.1.2/4 — The Section is shown as an ordered list naming each fill and its repeats, with the total number of passes it plays, and says when it is empty: the resolver', () => {
    const p = harmonicPattern();
    const byId = library(p);
    const empty = createSong('Study', 'p_1');
    expect(totalPasses(empty, byId)).toBe(0);
    expect(entryAt(empty, byId, 0)).toBeNull();
    expect(playingAt(empty, byId, 0)).toBeNull();

    let song = addEntry(empty, 0, 'up', 2);
    expect(totalPasses(song, byId)).toBe(6);
    song = addEntry(song, 0, 'alberti', 4);
    expect(totalPasses(song, byId)).toBe(18);
    song = addEntry(song, 0, 'root', 1);
    expect(totalPasses(song, byId)).toBe(21);
    expect(song.sections[0].entries).toEqual([
      { fill: 'up', repeats: 2 },
      { fill: 'alberti', repeats: 4 },
      { fill: 'root', repeats: 1 },
    ]);

    // Without a progression one repeat is one pass.
    const plain = { ...create('Plain'), id: 'p_2' };
    const plainSong = addEntry(createSong('Plain study', 'p_2'), 0, 'up', 5);
    expect(totalPasses(plainSong, library(plain))).toBe(5);
  });

  it("AC-18.1.2/2 — Each entry's repeats can be set from 1 to 16 in place: the resolver", () => {
    let song = addEntry(createSong('Study', 'p_1'), 0, 'up', 1);
    song = setEntryRepeats(song, 0, 0, 16);
    expect(song.sections[0].entries[0].repeats).toBe(16);
    song = setEntryRepeats(song, 0, 0, 1);
    expect(song.sections[0].entries[0].repeats).toBe(1);
    expect(MAX_REPEATS).toBe(16);

    expect(() => setEntryRepeats(song, 0, 0, 0)).toThrow();
    expect(() => setEntryRepeats(song, 0, 0, 17)).toThrow();
    expect(() => setEntryRepeats(song, 0, 0, 2.5)).toThrow();
    expect(() => setEntryRepeats(song, 0, 0, '4')).toThrow();
    expect(() => addEntry(song, 0, 'up', 0)).toThrow();
    expect(() => addEntry(song, 0, 'up', 17)).toThrow();
    expect(() => addEntry(song, 0, 'no-such-fill', 4)).toThrow(/Unknown fill/);
    expect(() => addEntry(song, 0, 'none', 4)).toThrow(/Unknown fill/);

    // Editors are immutable: the original is left alone.
    const before = JSON.parse(JSON.stringify(song));
    setEntryRepeats(song, 0, 0, 8);
    expect(song).toEqual(before);

    expect(validateSong(song)).toEqual([]);
    expect(validateSong({ ...song, name: '' })).toHaveLength(1);
    expect(validateSong({ ...song, sections: [] })).toHaveLength(1);
    expect(validateSong({ ...song, sections: [{ patternId: 'p_1', entries: [{ fill: 'up', repeats: 99 }] }] })).toHaveLength(1);
    expect(validateSong({ ...song, sections: [{ patternId: '', entries: [{ fill: 'nope', repeats: 1 }] }] })).toHaveLength(2);
  });

  it('AC-18.1.2/3 — An entry can be moved up, moved down and removed; the same fill may appear in the Section more than once: the resolver', () => {
    let song = createSong('Study', 'p_1');
    song = addEntry(song, 0, 'up', 1);
    song = addEntry(song, 0, 'down', 2);
    song = addEntry(song, 0, 'up', 3);
    const fills = (s) => s.sections[0].entries.map((e) => `${e.fill}×${e.repeats}`);
    expect(fills(song)).toEqual(['up×1', 'down×2', 'up×3']);

    // Moving at the ends is a no-op.
    expect(moveEntry(song, 0, 0, -1)).toBe(song);
    expect(moveEntry(song, 0, 2, +1)).toBe(song);

    const down = moveEntry(song, 0, 0, +1);
    expect(fills(down)).toEqual(['down×2', 'up×1', 'up×3']);
    expect(fills(song)).toEqual(['up×1', 'down×2', 'up×3']); // untouched

    const up = moveEntry(down, 0, 2, -1);
    expect(fills(up)).toEqual(['down×2', 'up×3', 'up×1']);

    const removed = removeEntry(up, 0, 1);
    expect(fills(removed)).toEqual(['down×2', 'up×1']);
    expect(fills(up)).toEqual(['down×2', 'up×3', 'up×1']);

    expect(() => removeEntry(removed, 0, 5)).toThrow();
    expect(() => moveEntry(removed, 0, 0, 2)).toThrow();
  });
});
