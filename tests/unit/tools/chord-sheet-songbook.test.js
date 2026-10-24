/**
 * Re-reading the songbook from chord sheets (tools/chord-sheet/songbook-run.mjs)
 * and the stanza-aware loop finding it relies on (tools/chord-sheet/parse.mjs).
 * The fixtures are invented: placeholder words under real chord shapes, so no
 * song text lives in the repository.
 */
import { describe, it, expect } from 'vitest';
import { parseChord, readParts, readSections, stanzaLoop, reviewSheet } from '../../../tools/chord-sheet/parse.mjs';
import {
  reviewPath,
  songbookSongs,
  searchUrl,
  pickChords,
  isRotation,
  songStatus,
  buildReport,
} from '../../../tools/chord-sheet/songbook-run.mjs';
import { PROGRESSIONS, spellProgression, QUALITIES } from '../../../src/core/harmony.js';
import { SONGBOOK, ARTISTS } from '../../../src/core/songbook.js';

const WORDS = 'la la placeholder words here';
const catalogue = { PROGRESSIONS, spellProgression, QUALITIES, SONGBOOK, ARTISTS };

const encode = (data) => JSON.stringify(data).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const ugPage = (content) =>
  `<div class="js-store" data-content="${encode({ store: { page: { data: { tab: {}, tab_view: { wiki_tab: { content }, meta: {} } } } } })}"></div>`;
const searchPage = (results) => `<div class="js-store" data-content="${encode({ store: { page: { data: { results } } } })}"></div>`;

const lines = (...ls) => ls.map((l) => l.split(' ').map(parseChord));
const names = (loop) => loop.map((c) => c.symbol).join(' ');

describe('tools/chord-sheet — loops in sheets that label only some parts', () => {
  it('keeps each section’s stanzas apart, split at blank lines, every line its own phrase', () => {
    const sheet = ['[Intro]', 'Am F', '', '[Verse]', 'Am G F', WORDS, 'Am G F', WORDS, '', 'C E', WORDS, 'C E', WORDS].join('\n');
    expect(readParts(sheet)).toEqual([
      { section: 'intro', stanzas: [[['Am', 'F']]] },
      {
        section: 'verse',
        stanzas: [
          [['Am', 'G', 'F'], ['Am', 'G', 'F']],
          [['C', 'E'], ['C', 'E']],
        ],
      },
    ]);
    // readSections still gives each section's chords in one run.
    expect(readSections(sheet)[1].symbols).toEqual(['Am', 'G', 'F', 'Am', 'G', 'F', 'C', 'E', 'C', 'E']);
  });

  it('takes the loop a stanza repeats exactly, a half pass at the end allowed', () => {
    expect(stanzaLoop(lines('G D', 'Em C', 'G D'))).toEqual({ loop: expect.anything(), strays: 0 });
    expect(names(stanzaLoop(lines('G D', 'Em C', 'G D')).loop)).toBe('G D Em C');
    expect(names(stanzaLoop(lines('Em D C Em C Em D C Em C')).loop)).toBe('Em D C Em C');
  });

  it('finds a loop through a passing chord or a turnaround, and counts where the sheet strays', () => {
    // Three passes of a five-chord loop, the last bent by a passing A.
    const r = stanzaLoop(lines('Em D C Em C', 'Em D C Em C', 'Em D C Em C Em D A C'));
    expect(names(r.loop)).toBe('Em D C Em C');
    expect(r.strays).toBe(2);
    // Halves of a loop on separate lines, the last half varied.
    expect(names(stanzaLoop(lines('G D', 'Em C', 'G D', 'Am C')).loop)).toBe('G D Em C');
  });

  it('falls back to the loop most lines play, and to the whole stanza when none repeats', () => {
    const r = stanzaLoop(lines('C Em B', 'C Em B Bm Em', 'C Em B', 'C Em B C'));
    expect(names(r.loop)).toBe('C Em B');
    expect(r.strays).toBe(1);
    expect(names(stanzaLoop(lines('C G Am F D')).loop)).toBe('C G Am F D');
  });

  it('a long phrase whose opening comes back at its end is not a loop', () => {
    // Its first three chords recur at the end, which is not a seven-chord loop.
    expect(names(stanzaLoop(lines('C G Am F D Em Bm C G Am')).loop)).toBe('C G Am F D Em Bm C G Am');
  });

  it('reviews each unlabelled part of a section as its own loop, and keeps no words', () => {
    const sheet = [
      '[Intro]',
      `[tab]${'C Em D C Em C Em D C Em C'.split(' ').map((c) => `[ch]${c}[/ch]`).join(' ')}[/tab]`,
      '',
      '[Verse]',
      ...['Em D C Em C', 'Em D C Em C', 'Em D C Em C Em D A C'].flatMap((l) => [
        `[tab]${l.split(' ').map((c) => `[ch]${c}[/ch]`).join(' ')}`,
        `${WORDS}[/tab]`,
      ]),
      '',
      ...['C Em B', 'C Em B Bm Em', 'C Em B'].flatMap((l) => [`[tab]${l.split(' ').map((c) => `[ch]${c}[/ch]`).join(' ')}`, `${WORDS}[/tab]`]),
    ].join('\n');
    const r = reviewSheet(ugPage(sheet), { artist: 'Test Band', title: 'Test Song' });
    expect(r.key).toBe('E minor');
    expect(r.sections.map((s) => [s.section, s.chords.join(' ')])).toEqual([
      ['intro', 'C Em D C Em'],
      ['verse', 'Em D C Em C'],
      ['verse 2', 'C Em B'],
    ]);
    expect(r.sections[1].note).toMatch(/strays from this loop in 2 places/);
    expect(JSON.stringify(r)).not.toMatch(/placeholder|la la/);
  });
});

describe('tools/chord-sheet — re-reading the songbook', () => {
  it('lists each credited song once, in songbook order, narrowed by artist or song', () => {
    const all = songbookSongs(SONGBOOK);
    const keys = all.map((s) => `${s.artist} — ${s.title}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(all.length).toBe(new Set(SONGBOOK.map((c) => `${c.artist} — ${c.title}`)).size);
    expect(songbookSongs(SONGBOOK, { artist: 'radiohead' }).every((s) => s.artist === 'Radiohead')).toBe(true);
    expect(songbookSongs(SONGBOOK, { song: 'reckoner' })).toEqual([{ artist: 'Radiohead', title: 'Reckoner' }]);
  });

  it('keeps one review file per song, named for it', () => {
    expect(reviewPath('Radiohead', 'Reckoner')).toBe('chord-reviews/radiohead--reckoner.json');
    expect(reviewPath('Bob Dylan', 'Don’t Think Twice, It’s All Right')).toBe('chord-reviews/bob-dylan--dont-think-twice-its-all-right.json');
    expect(reviewPath('Radiohead', 'Weird Fishes/Arpeggi')).toBe('chord-reviews/radiohead--weird-fishes-arpeggi.json');
  });

  it('searches for the song by artist and title', () => {
    const url = new URL(searchUrl('Radiohead', 'Exit Music (For a Film)'));
    expect(url.hostname).toBe('www.ultimate-guitar.com');
    expect(url.searchParams.get('value')).toBe('Radiohead Exit Music');
  });

  it('reads the most-rated Chords version of this song by this artist, never a tab or another song', () => {
    const page = searchPage([
      { type: 'Tabs', artist_name: 'Radiohead', song_name: 'Reckoner', votes: 900, tab_url: 'https://x.test/tab' },
      { type: 'Chords', artist_name: 'Radiohead', song_name: 'Reckoner', votes: 287, rating: 4.66, version: 1, tab_url: 'https://x.test/v1' },
      { type: 'Chords', artist_name: 'Radiohead', song_name: 'Reckoner', votes: 252, version: 2, tab_url: 'https://x.test/v2' },
      { type: 'Chords', artist_name: 'Radiohead', song_name: 'Reckoner (live)', votes: 999, tab_url: 'https://x.test/live' },
      { type: 'Chords', artist_name: 'Radiohead', song_name: 'Reckoner Acoustic', votes: 999, tab_url: 'https://x.test/acoustic' },
      { type: 'Chords', artist_name: 'Someone Else', song_name: 'Reckoner', votes: 999, tab_url: 'https://x.test/cover' },
    ]);
    expect(pickChords(page, { artist: 'Radiohead', title: 'Reckoner' })).toEqual({
      url: 'https://x.test/v1',
      votes: 287,
      rating: 4.66,
      version: 1,
    });
    // Punctuation, brackets, a leading "The" and curly apostrophes do not stop a match.
    // A bracketed subtitle is not a different song.
    const subtitled = searchPage([{ type: 'Chords', artist_name: 'Radiohead', song_name: 'Exit Music (For A Film)', votes: 5, tab_url: 'https://x.test/e' }]);
    expect(pickChords(subtitled, { artist: 'Radiohead', title: 'Exit Music' })?.url).toBe('https://x.test/e');
    const other = searchPage([{ type: 'Chords', artist_name: 'National', song_name: 'Dont Swallow The Cap', votes: 3, tab_url: 'https://x.test/n' }]);
    expect(pickChords(other, { artist: 'The National', title: 'Don’t Swallow the Cap' })?.url).toBe('https://x.test/n');
    expect(pickChords(searchPage([]), { artist: 'Radiohead', title: 'Reckoner' })).toBeNull();
    expect(pickChords('<html>no store</html>', { artist: 'Radiohead', title: 'Reckoner' })).toBeNull();
  });

  it('knows a loop started at a different chord', () => {
    const n = (s) => s.split(' ').map((t) => ({ degree: t.split(':')[0], quality: t.split(':')[1] }));
    expect(isRotation(n('1:min b7:maj b6:maj'), n('b6:maj 1:min b7:maj'))).toBe(true);
    expect(isRotation(n('1:min b7:maj b6:maj'), n('1:min b6:maj b7:maj'))).toBe(false);
    expect(isRotation(n('1:min b7:maj'), n('1:min b7:maj b6:maj'))).toBe(false);
  });

  const shippedReckoner = SONGBOOK.filter((c) => c.artist === 'Radiohead' && c.title === 'Reckoner');
  const asReview = (sections, extra = {}) => ({
    artist: 'Radiohead',
    title: 'Reckoner',
    key: 'E minor',
    confidence: 'high',
    note: 'key E minor',
    sources: ['https://x.test/v1'],
    found: { url: 'https://x.test/v1', votes: 287, rating: 4.66, version: 1 },
    sections,
    ...extra,
  });
  const fromShipped = (c) => ({ section: c.section, chords: [], numerals: spellProgression(c.progression).map(({ degree, quality }) => ({ degree, quality })) });

  it('marks a song confirmed when every shipped credit is on the sheet, else differs', () => {
    expect(songStatus(null, catalogue).status).toBe('not read');
    expect(songStatus({ artist: 'Radiohead', title: 'Reckoner', notFound: true }, catalogue).status).toBe('not found');
    expect(songStatus(asReview(shippedReckoner.map(fromShipped)), catalogue).status).toBe('confirmed');
    expect(songStatus(asReview([fromShipped(shippedReckoner[0])]), catalogue).status).toBe('differs');
  });

  it('reports every song: counts, each shipped credit on the sheet or not, the sheet’s own loops, the source', () => {
    const songs = [
      { artist: 'Radiohead', title: 'Reckoner' },
      { artist: 'Radiohead', title: 'Creep' },
      { artist: 'Radiohead', title: 'Lucky' },
    ];
    const verse = fromShipped(shippedReckoner[0]);
    const extra = { section: 'verse 2', chords: ['C', 'Em', 'B'], numerals: [{ degree: 'b6', quality: 'maj' }, { degree: '1', quality: 'min' }, { degree: '5', quality: 'maj' }], note: null };
    const rotated = { ...verse, section: 'intro', chords: ['C', 'Em', 'D', 'C', 'Em'], numerals: [...verse.numerals.slice(2), ...verse.numerals.slice(0, 2)] };
    const reviews = [
      asReview([verse, extra]),
      { artist: 'Radiohead', title: 'Lucky', notFound: true, searched: 'https://x.test/search' },
    ];
    const md = buildReport(songs, reviews, catalogue);
    expect(md).toMatch(/confirmed[^\n]*\| 0 \|/);
    expect(md).toMatch(/differs[^\n]*\| 1 \|/);
    expect(md).toMatch(/not found[^\n]*\| 1 \|/);
    expect(md).toMatch(/not read yet \| 1 \|/);
    expect(md).toContain('## ❌ Radiohead — Reckoner');
    expect(md).toContain('[source](https://x.test/v1) · version 1 · 287 ratings · ★4.66 · key E minor');
    expect(md).toMatch(/✅ shipped, on the sheet \(verse\) \| verse \| i–♭VII–♭VI–i–♭VI/);
    expect(md).toMatch(/❌ shipped, not on the sheet \| bridge \|/);
    expect(md).toContain('| ➕ on the sheet only | verse 2 | ♭VI–i–V | C Em B |');
    expect(md).toContain('## ❔ Radiohead — Lucky');
    expect(md).toContain('Searched: https://x.test/search');
    expect(md).toMatch(/Not read yet\n\n- Radiohead — Creep/);

    // A shipped loop the sheet starts at another chord is shown as that, not as missing.
    const md2 = buildReport(songs.slice(0, 1), [asReview([rotated])], catalogue);
    expect(md2).toMatch(/🔁 shipped, the sheet starts it elsewhere \(intro\) \| verse \|[^\n]*\| C Em D C Em \|/);
  });
});
