/**
 * The songs credited to catalogue progressions (AC-2.6.11). What the Heard in
 * line shows is proved in tests/e2e/harmony.spec.js; this proves the credits
 * themselves hold together.
 */
import { describe, it, expect } from 'vitest';
import { PROGRESSIONS, spellProgression } from '../../../src/core/harmony.js';
import { SONGBOOK, ARTISTS, heardIn } from '../../../src/core/songbook.js';

describe('core/songbook', () => {
  it('AC-2.6.11/3 — Every song credit names a catalogue entry, and every song progression is credited to at least one song', () => {
    const ids = new Set(PROGRESSIONS.map((p) => p.id));
    for (const c of SONGBOOK) expect(ids.has(c.progression), `${c.title} names ${c.progression}`).toBe(true);
    const credited = new Set(SONGBOOK.map((c) => c.progression));
    const songEntries = PROGRESSIONS.filter((p) => p.fromSongs);
    expect(songEntries.length).toBeGreaterThan(0);
    for (const p of songEntries) expect(credited.has(p.id), `${p.id} has no song`).toBe(true);
    // Every credit is complete, by an artist the songbook lists, and no song
    // section is credited twice.
    for (const c of SONGBOOK) {
      expect(ARTISTS).toContain(c.artist);
      expect(c.title.length && c.section.length).toBeTruthy();
    }
    const keys = SONGBOOK.map((c) => `${c.artist}|${c.title}|${c.section}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Every artist asked for is credited.
    for (const artist of ARTISTS) expect(SONGBOOK.some((c) => c.artist === artist), artist).toBe(true);
  });

  it('AC-2.6.11/3 — Every song credit names a catalogue entry, and every song progression is credited to at least one song: heardIn groups them by artist', () => {
    expect(heardIn('I-III-IV-iv')).toEqual([{ artist: 'Radiohead', songs: [{ title: 'Creep', section: 'verse and chorus' }] }]);
    expect(heardIn('ii-V-I')).toEqual([]);
    expect(heardIn('I-iii-vi-V').map((g) => g.artist)).toEqual(['The National', 'Coldplay']);
  });
  it("AC-2.6.1/19 — Every song progression is spelled from the Ionian tonic of the major key whose signature holds the most of its song's chords: a loop of Am, F, C and G is vi–IV–I–V, never i–♭VI–♭III–♭VII, and a loop of G, Am7, C and Dm7 is spelled in C, since Dm7 rules out G", () => {
    const DEGREE = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
    const MAJOR = { 0: 'M', 2: 'm', 4: 'm', 5: 'M', 7: 'M', 9: 'm', 11: 'd' };
    const family = (q) => (/^(min|m6|m7|m9|mMaj7)$/.test(q) ? 'm' : /^(dim|dim7|m7b5)$/.test(q) ? 'd' : /sus/.test(q) ? 's' : 'M');
    const holds = (chords, tonic) =>
      chords.filter((c) => {
        const i = (c.root - tonic + 12) % 12;
        return i in MAJOR && (c.family === 's' || MAJOR[i] === c.family);
      }).length;
    const songs = new Map();
    for (const c of SONGBOOK) {
      const k = `${c.artist} — ${c.title}`;
      const chords = spellProgression(c.progression).map((x) => ({ root: DEGREE.indexOf(x.degree), family: family(x.quality) }));
      songs.set(k, [...(songs.get(k) ?? []), ...chords]);
    }
    const credit = (title, section) => SONGBOOK.find((c) => c.title === title && c.section === section).progression;
    const spell = (id) => spellProgression(id).map((x) => `${x.degree}:${x.quality}`).join(' ');
    // No other major key holds more of a song's chords than the one its numerals count from.
    for (const [song, chords] of songs) {
      const own = holds(chords, 0);
      for (let k = 1; k < 12; k++) expect(holds(chords, k), `${song}: the key on ${DEGREE[k]} holds more`).toBeLessThanOrEqual(own);
    }
    // A minor-key song reads from its relative major: Reckoner's Em loop starts on vi.
    expect(spell(credit('Reckoner', 'verse'))).toBe('6:min 5:maj 4:maj 6:min 4:maj');
    // The two loops the criterion names.
    expect(spell(credit('I Need My Girl', 'verse'))).toBe('6:min 4:maj 1:maj 1:maj');
    expect(spell(credit('England', 'main loop'))).toBe('5:maj 6:m7 1:maj 2:m7 1:maj 6:m7');
  });
});
