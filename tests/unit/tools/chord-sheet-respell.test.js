/**
 * Re-spelling the songbook by AC-2.6.1/19 (tools/chord-sheet/respell.mjs), the
 * per-section keys it rests on (tools/chord-sheet/parse.mjs), and the looser
 * comparison the report uses (tools/chord-sheet/songbook-run.mjs).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseChord, sectionKeys, ionianKey } from '../../../tools/chord-sheet/parse.mjs';
import { songSections, ionianReviews, stripSongs, respell, mergeRenames } from '../../../tools/chord-sheet/respell.mjs';
import { collapse, matchLoop, songStatus } from '../../../tools/chord-sheet/songbook-run.mjs';
import { ARTIST_HEADINGS } from '../../../tools/chord-sheet/catalogue.mjs';
import { PROGRESSIONS, PROGRESSION_GROUPS, spellProgression, QUALITIES } from '../../../src/core/harmony.js';
import { SONGBOOK, ARTISTS } from '../../../src/core/songbook.js';

const c = (s) => s.split(' ').map(parseChord);
const n = (spec) =>
  spec.split(' ').map((t) => {
    const [degree, quality = 'maj'] = t.split(':');
    return { degree, quality };
  });
const degrees = (numerals) => numerals.map((x) => (x.quality === 'maj' ? x.degree : `${x.degree}:${x.quality}`)).join(' ');
const catalogue = { PROGRESSIONS, PROGRESSION_GROUPS, spellProgression, QUALITIES, SONGBOOK, ARTISTS };

describe('tools/chord-sheet — the key each section is spelled in', () => {
  it('breaks a tie between keys by the tonic chord played most often', () => {
    // Am, C and F fit both C and F; C is played more.
    expect(ionianKey(c('Am C C F')).name).toBe('C major');
  });

  it('gives a section its own key only when three or more chords lie wholly in it', () => {
    // Clocks: the riff in G, the outro wholly in C.
    expect(sectionKeys([c('D Am Am Em'), c('Fmaj7 C G')]).keys.map((k) => k.name)).toEqual(['G major', 'C major']);
    // D–C is a borrowed chord in D, not a move to G.
    expect(sectionKeys([c('D C'), c('A Bm D G A'), c('C D')]).keys.map((k) => k.name)).toEqual(['D major', 'D major', 'D major']);
    // A section the song's key holds stays in it.
    expect(sectionKeys([c('G Em C D'), c('C D Em')]).keys.map((k) => k.name)).toEqual(['G major', 'G major']);
  });
});

describe('tools/chord-sheet — re-spelling the songbook (AC-2.6.1/19)', () => {
  it('reads each song from its shipped credits, or from the corrections where it is listed', () => {
    const songs = songSections(SONGBOOK, spellProgression, [
      { artist: 'Radiohead', title: 'Reckoner', sections: [{ section: 'verse', chords: ['Em', 'D', 'C', 'Em', 'C'] }, { section: 'bridge', chords: ['C', 'Em', 'B'] }] },
    ]);
    expect(songs.length).toBe(new Set(SONGBOOK.map((x) => `${x.artist}|${x.title}`)).size);
    const reckoner = songs.find((s) => s.title === 'Reckoner');
    expect(reckoner.sections.map((s) => s.section)).toEqual(['verse', 'bridge']);
    // Each corrected section remembers which shipped credit it takes over.
    expect(reckoner.sections.map((s) => s.was)).toEqual(SONGBOOK.filter((x) => x.title === 'Reckoner').map((x) => x.progression));
    expect(() => songSections(SONGBOOK, spellProgression, [{ artist: 'Nobody', title: 'Nothing', sections: [] }])).toThrow(/does not credit/);
    expect(() => songSections(SONGBOOK, spellProgression, [{ artist: 'Radiohead', title: 'Reckoner', sections: [{ section: 'verse', chords: ['Hello'] }] }])).toThrow(/cannot read Hello/);
  });

  it('spells a minor-key song from its relative major, and a loop with Dm7 in C', () => {
    const [girl, england] = ionianReviews([
      { artist: 'A', title: 'Girl', sections: [{ section: 'verse', chords: c('Am F C G') }] },
      { artist: 'B', title: 'England', sections: [{ section: 'main loop', chords: c('G Am7 C Dm7 C Am7') }] },
    ]);
    expect(degrees(girl.sections[0].numerals)).toBe('6:min 4 1 5');
    expect(england.key).toBe('C major');
    expect(degrees(england.sections[0].numerals)).toBe('5 6:m7 1 2:m7 1 6:m7');
  });

  it('takes every song entry and credit out of the sources, and nothing else', () => {
    const sources = {
      harmony: readFileSync(new URL('../../../src/core/harmony.js', import.meta.url), 'utf8'),
      songbook: readFileSync(new URL('../../../src/core/songbook.js', import.meta.url), 'utf8'),
    };
    const out = stripSongs(sources);
    expect(out.harmony).not.toMatch(/^ {2}songEntry\(/m);
    expect(out.songbook).not.toMatch(/^ {2}\['Radiohead'/m);
    expect(out.harmony).toContain("entry('jazz', 'ii-V-I'");
    expect(out.songbook).toContain('export const SONGBOOK = [');
    expect(sources.harmony.split('\n').length - out.harmony.split('\n').length).toBe(
      PROGRESSIONS.filter((p) => p.fromSongs).length + (sources.harmony.match(/\/\/ Song progressions \(AC-2\.6\.1\/18\)/g) ?? []).length
    );
  });

  it('respelling the shipped songbook again changes nothing and renames nothing', () => {
    const sources = {
      harmony: readFileSync(new URL('../../../src/core/harmony.js', import.meta.url), 'utf8'),
      songbook: readFileSync(new URL('../../../src/core/songbook.js', import.meta.url), 'utf8'),
    };
    const overrides = JSON.parse(readFileSync(new URL('../../../chord-reviews/overrides.json', import.meta.url), 'utf8')).songs;
    const r = respell({ catalogue, sources, overrides, headings: ARTIST_HEADINGS });
    expect(r.plan.problems).toEqual([]);
    expect(r.renames).toEqual({});
    expect(r.plan.credits.length).toBe(SONGBOOK.length);
    for (const credit of r.plan.credits) {
      const shipped = SONGBOOK.find((x) => x.artist === credit.artist && x.title === credit.title && x.section === credit.section);
      expect(shipped?.progression, `${credit.title} (${credit.section})`).toBe(credit.progression);
    }
  });

  it('merges renames: chains followed, an id that exists again dropped', () => {
    const exists = (id) => ['c', 'd', 'x'].includes(id);
    expect(mergeRenames({ a: ['b'] }, { b: ['c'], e: ['d'] }, exists)).toEqual({ a: ['c'], b: ['c'], e: ['d'] });
    expect(mergeRenames({ x: ['c'] }, {}, exists)).toEqual({});
    expect(mergeRenames({ a: ['gone'] }, {}, exists)).toEqual({});
  });
});

describe('tools/chord-sheet — how closely a shipped loop is on the sheet', () => {
  const sheet = (spec, chords = []) => ({ section: 'part', chords, numerals: n(spec) });

  it('counts a held chord once, and a loop written out twice once', () => {
    expect(degrees(collapse(n('1 5 2:min 2:min 1 5 4 4')))).toBe('1 5 2:min 1 5 4');
    expect(degrees(collapse(n('1 4 1 4')))).toBe('1 4');
    expect(degrees(collapse(n('1 5 6:min 1')))).toBe('1 5 6:min');
  });

  it('matches exactly, then started elsewhere, then but for colour, then in another key, then inside a longer passage', () => {
    const want = n('1 5 6:min 4');
    expect(matchLoop(want, [sheet('1 5 6:min 4 4')]).level).toBe('exact');
    expect(matchLoop(want, [sheet('6:min 4 1 5')]).level).toBe('rotation');
    expect(matchLoop(want, [sheet('1 5 6:m7 4:maj7')]).level).toBe('colour');
    expect(matchLoop(want, [sheet('4 1 2:min b7')]).level).toBe('key');
    expect(matchLoop(want, [sheet('2:min 1 5 6:min 4 3:min 2:min')]).level).toBe('within');
    expect(matchLoop(want, [sheet('1 4 5')])).toBeNull();
  });

  it('calls a song close when every shipped credit is on the sheet but only loosely', () => {
    const credits = SONGBOOK.filter((x) => x.title === 'Creep');
    const steps = spellProgression(credits[0].progression).map(({ degree, quality }) => ({ degree, quality }));
    const shifted = steps.map((s) => ({ ...s, degree: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'][(['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'].indexOf(s.degree) + 9) % 12] }));
    const review = { artist: 'Radiohead', title: 'Creep', sections: [{ section: 'verse', chords: [], numerals: shifted }] };
    expect(songStatus(review, catalogue).status).toBe('close');
  });
});
