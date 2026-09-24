/**
 * The chord-sheet reader and the catalogue filer (tools/chord-sheet/). The
 * fixtures are invented: placeholder words under real chord shapes, so no song
 * text lives in the repository.
 */
import { describe, it, expect } from 'vitest';
import {
  parseChord,
  extractSheet,
  readSections,
  chordsOnLine,
  findLoop,
  detectKey,
  reviewSheet,
} from '../../../tools/chord-sheet/parse.mjs';
import { planAdditions, compareReview, applyPlan, headingFor } from '../../../tools/chord-sheet/catalogue.mjs';
import { PROGRESSIONS, PROGRESSION_GROUPS, spellProgression, QUALITIES } from '../../../src/core/harmony.js';
import { SONGBOOK, ARTISTS } from '../../../src/core/songbook.js';
import { readFileSync } from 'node:fs';

const WORDS = 'la la placeholder words here';

/** An Ultimate Guitar page as it arrives: the sheet JSON-encoded in js-store. */
function ugPage(content, { artist = 'Test Band', song = 'Test Song', tonality = '' } = {}) {
  const store = { store: { page: { data: { tab: { artist_name: artist, song_name: song, tonality_name: tonality }, tab_view: { wiki_tab: { content }, meta: { capo: 2 } } } } } };
  const encoded = JSON.stringify(store).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<html><body><div class="js-store" data-content="${encoded}"></div></body></html>`;
}

const SHEET = [
  '[Intro]',
  '[tab][ch]G[/ch]   [ch]D[/ch]   [ch]Em[/ch]   [ch]C[/ch][/tab]',
  '',
  '[Verse 1]',
  '[tab][ch]G[/ch]        [ch]D[/ch]',
  `${WORDS}[/tab]`,
  '[tab][ch]Em[/ch]          [ch]C[/ch]',
  `${WORDS}[/tab]`,
  '[tab][ch]G[/ch]        [ch]D[/ch]',
  `${WORDS}[/tab]`,
  '',
  '[Chorus]',
  '[tab][ch]C[/ch]        [ch]D/F#[/ch]',
  `${WORDS}[/tab]`,
  '[tab][ch]Em7[/ch]      [ch]C[/ch]',
  `${WORDS}[/tab]`,
  '',
  '[Verse 2]',
  '[tab][ch]G[/ch]        [ch]D[/ch]',
  `${WORDS}[/tab]`,
  '[tab][ch]Em[/ch]          [ch]C[/ch]',
  `${WORDS}[/tab]`,
].join('\n');

describe('tools/chord-sheet — reading', () => {
  it('reads chord symbols into the app’s qualities, noting every simplification', () => {
    expect(parseChord('Am')).toMatchObject({ root: 9, quality: 'min', note: null });
    expect(parseChord('F#m7')).toMatchObject({ root: 6, quality: 'm7' });
    expect(parseChord('Bbmaj7')).toMatchObject({ root: 10, quality: 'maj7' });
    expect(parseChord('D/F#')).toMatchObject({ root: 2, quality: 'maj', note: 'bass F# dropped' });
    expect(parseChord('C5')).toMatchObject({ quality: 'maj', note: 'power chord read as major' });
    expect(parseChord('Em11').quality).toBe('m7');
    expect(parseChord('Asus2').quality).toBe('sus2');
    expect(parseChord('Dsus').quality).toBe('sus4');
    expect(parseChord('Hello')).toBeNull();
    expect(parseChord('I')).toBeNull();
  });

  it('takes an Ultimate Guitar page apart and keeps no words', () => {
    const sheet = extractSheet(ugPage(SHEET, { tonality: 'G' }));
    expect(sheet).toMatchObject({ artist: 'Test Band', title: 'Test Song', tonality: 'G', capo: 2 });
    const sections = readSections(sheet.content);
    expect(sections.map((s) => s.section)).toEqual(['intro', 'verse', 'chorus', 'verse']);
    expect(sections[1].symbols).toEqual(['G', 'D', 'Em', 'C', 'G', 'D']);
    // Nothing read out of the sheet carries a word of the text.
    expect(JSON.stringify(sections)).not.toMatch(/placeholder|la la/);
  });

  it('finds chord lines in a plain-text sheet, and never reads a lyric line as chords', () => {
    expect(chordsOnLine('Am      F       C      G')).toEqual(['Am', 'F', 'C', 'G']);
    expect(chordsOnLine('| Am | F | x2')).toEqual(['Am', 'F']);
    expect(chordsOnLine('A day in the life')).toEqual([]);
    expect(chordsOnLine('Em')).toEqual(['Em']);
    const plain = ['Verse:', 'C    Am', WORDS, 'F    G', WORDS, 'Chorus:', 'F  G  C', WORDS].join('\n');
    expect(readSections(plain)).toEqual([
      { section: 'verse', symbols: ['C', 'Am', 'F', 'G'] },
      { section: 'chorus', symbols: ['F', 'G', 'C'] },
    ]);
  });

  it('reduces a section to its repeating loop', () => {
    const c = (s) => s.split(' ').map(parseChord);
    const names = (loop) => loop.map((x) => x.symbol);
    expect(names(findLoop(c('G D Em C G D Em C G D')))).toEqual(['G', 'D', 'Em', 'C']);
    expect(names(findLoop(c('G G C C D D')))).toEqual(['G', 'C', 'D']);
    expect(names(findLoop(c('Am F C G Am')))).toEqual(['Am', 'F', 'C', 'G']);
    expect(names(findLoop(c('G C G C G')))).toEqual(['G', 'C']);
    expect(names(findLoop(c('C')))).toEqual(['C']);
  });

  it('finds the key the chords belong to, major or minor', () => {
    const c = (s) => s.split(' ').map(parseChord);
    expect(detectKey(c('G D Em C G D C G'))).toMatchObject({ tonic: 7, mode: 'major' });
    expect(detectKey(c('Am F C G Am F C G Am'))).toMatchObject({ tonic: 9, mode: 'minor' });
    expect(detectKey(c('Em C G D Em'))).toMatchObject({ tonic: 4, mode: 'minor' });
    expect(detectKey(c('C F G C')).fit).toBe(1);
  });

  it('turns a page into a review: distinct loops as numerals, a loop already listed not repeated', () => {
    const r = reviewSheet(ugPage(SHEET), { source: 'https://example.test/tab' });
    expect(r).toMatchObject({ artist: 'Test Band', title: 'Test Song', key: 'G major', confidence: 'high' });
    // The verses repeat the intro's loop, so they are not listed again.
    expect(r.sections.map((s) => [s.section, s.chords.join(' ')])).toEqual([
      ['intro', 'G D Em C'],
      ['chorus', 'C D/F# Em7'],
    ]);
    expect(r.sections[1].numerals).toEqual([
      { degree: '4', quality: 'maj' },
      { degree: '5', quality: 'maj' },
      { degree: '6', quality: 'm7' },
    ]);
    expect(r.sections[1].note).toContain('bass F# dropped');
    expect(r.note).toContain('capo 2');
    expect(r.sources).toEqual(['https://example.test/tab']);
    expect(JSON.stringify(r)).not.toMatch(/placeholder|la la/);
  });

  it('refuses a page with no chord sheet on it', () => {
    expect(() => reviewSheet('just some words, no chords at all')).toThrow(/No chords/);
  });
});

const catalogue = { PROGRESSIONS, spellProgression, QUALITIES, SONGBOOK, ARTISTS };
const n = (spec) =>
  spec.split(' ').map((t) => {
    const [degree, quality = 'maj'] = t.split(':');
    return { degree, quality };
  });
const review = (artist, title, sections) => ({
  artist,
  title,
  sections: sections.map(([section, spec]) => ({ section, chords: [], numerals: n(spec) })),
});

describe('tools/chord-sheet — filing into the catalogue', () => {
  it('files a loop under the heading its chords and artist give it', () => {
    expect(headingFor(n('1 4:sus2 5'), 'Wilco')).toBe('sus');
    expect(headingFor(n('1:min b7 b6'), 'Coldplay')).toBe('minor');
    expect(headingFor(n('1 b7 4'), 'Bob Dylan')).toBe('modal');
    expect(headingFor(n('1 5 6:min 4'), 'Coldplay')).toBe('pop');
    expect(headingFor(n('1 5 6:min 4'), 'Bob Dylan')).toBe('classical');
    expect(headingFor(n('1 5 6:min 4'), 'Radiohead')).toBe('indie');
    expect(headingFor(n('1 5 6:min 4'), 'Somebody New')).toBeNull();
  });

  it('credits a loop the catalogue holds instead of duplicating it, and adds one it lacks', () => {
    const plan = planAdditions([review('Wilco', 'Invented Song', [['verse', '1 4 5'], ['chorus', '2:min 6:m7 5 3']])], catalogue);
    expect(plan.problems).toEqual([]);
    expect(plan.credits[0]).toEqual({ artist: 'Wilco', title: 'Invented Song', section: 'verse', progression: 'I-IV-V' });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({ id: 'ii-vi7-V-III', label: 'ii–vi7–V–III (Invented Song)', group: 'indie' });
    expect(plan.credits[1].progression).toBe('ii-vi7-V-III');
  });

  it('skips a song already credited unless replacing, and asks for a heading for a new artist', () => {
    const creep = planAdditions([review('Radiohead', 'Creep', [['verse', '1 3 4 4:min']])], catalogue);
    expect(creep.skipped[0]).toMatch(/already credited/);
    expect(creep.credits).toEqual([]);

    const replaced = planAdditions([review('Radiohead', 'Creep', [['verse', '1 3 4 4:min']])], catalogue, { replace: true });
    expect(replaced.removedCredits.map((c) => c.title)).toEqual(['Creep']);
    expect(replaced.credits[0].progression).toBe('I-III-IV-iv');

    const stranger = planAdditions([review('Somebody New', 'Song', [['verse', '1 3:min 2:min 5']])], catalogue);
    expect(stranger.problems[0]).toMatch(/no heading in AC-2.6.1\/18/);
    const given = planAdditions([review('Somebody New', 'Song', [['verse', '1 3:min 2:min 5']])], catalogue, {
      headings: { 'Somebody New': 'pop' },
    });
    expect(given.entries[0].group).toBe('pop');
  });

  it('refuses a one-chord section and a chord it cannot read', () => {
    const plan = planAdditions([review('Wilco', 'Invented', [['verse', '1'], ['chorus', '1 4:m11']])], catalogue);
    expect(plan.problems).toHaveLength(2);
    expect(plan.credits).toEqual([]);
  });

  it('compares a review with what is shipped for the song', () => {
    const same = compareReview(review('Radiohead', 'Creep', [['verse', '1 3 4 4:min']]), catalogue);
    expect(same).toMatchObject({ shipped: true, matched: ['verse'], unmatchedShipped: [] });
    const differs = compareReview(review('Radiohead', 'Creep', [['verse', '1 3 4 5']]), catalogue);
    expect(differs.unmatchedShipped).toHaveLength(1);
    expect(differs.newLoops).toHaveLength(1);
    expect(compareReview(review('Wilco', 'Unknown Song', [['verse', '1 4']]), catalogue).shipped).toBe(false);
  });

  it('writes entries into their heading’s song block and credits into the songbook, and drops orphaned entries', async () => {
    const harmony = readFileSync(new URL('../../../src/core/harmony.js', import.meta.url), 'utf8');
    const songbook = readFileSync(new URL('../../../src/core/songbook.js', import.meta.url), 'utf8');
    const groupLabels = Object.fromEntries(PROGRESSION_GROUPS.map((g) => [g.id, g.label]));

    // A new song for a new artist, into a heading with no song block yet (Jazz).
    const plan = planAdditions([review('Somebody New', 'Invented', [['verse', '1:maj7 4:maj7 2:m7 5:7']])], catalogue, {
      headings: { 'Somebody New': 'jazz' },
    });
    const out = applyPlan({ harmony, songbook }, plan, { groupLabels, SONGBOOK });
    const jazzAt = out.harmony.indexOf('  // --- Jazz (');
    const bluesAt = out.harmony.indexOf('  // --- Blues (');
    const lineAt = out.harmony.indexOf("songEntry('jazz', 'Imaj7-IVmaj7-ii7-V7'");
    expect(lineAt).toBeGreaterThan(jazzAt);
    expect(lineAt).toBeLessThan(bluesAt);
    expect(out.harmony.slice(jazzAt, bluesAt)).toContain('// Song progressions (AC-2.6.1/18)');
    expect(out.songbook).toContain("['Somebody New', 'Invented', 'verse', 'Imaj7-IVmaj7-ii7-V7'],");
    expect(out.songbook).toMatch(/export const ARTISTS = \[[^\]]*'Somebody New'\];/);

    // Replacing a song whose only credit is its own entry removes the entry too.
    const karma = SONGBOOK.filter((c) => c.title === 'Karma Police');
    const own = karma.map((c) => c.progression).filter((id) => PROGRESSIONS.find((p) => p.id === id)?.fromSongs);
    const onlyTheirs = own.filter((id) => SONGBOOK.filter((c) => c.progression === id).length === 1);
    expect(onlyTheirs.length).toBeGreaterThan(0);
    const swap = planAdditions([review('Radiohead', 'Karma Police', [['verse', '1 4 5']])], catalogue, { replace: true });
    const swapped = applyPlan({ harmony, songbook }, swap, { groupLabels, SONGBOOK });
    for (const id of onlyTheirs) expect(swapped.harmony).not.toContain(`'${id}'`);
    expect(swapped.songbook).toContain("['Radiohead', 'Karma Police', 'verse', 'I-IV-V'],");
    expect(swapped.songbook.match(/'Karma Police'/g)).toHaveLength(1);
  });
});
