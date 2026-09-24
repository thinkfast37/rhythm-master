/**
 * The songs credited to catalogue progressions (AC-2.6.11). What the Heard in
 * line shows is proved in tests/e2e/harmony.spec.js; this proves the credits
 * themselves hold together.
 */
import { describe, it, expect } from 'vitest';
import { PROGRESSIONS } from '../../../src/core/harmony.js';
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
});
