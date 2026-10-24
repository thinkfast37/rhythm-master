/**
 * Re-reading the songbook from real chord sheets: which songs to look up, which
 * Ultimate Guitar version to read for each, where its review is kept, and the
 * report that sets every shipped credit beside what the sheet says. Pure — the
 * fetching and pacing live in tools/chord-sheet.mjs — so every rule is tested.
 *
 * The reviews are kept in the repository (chord-reviews/), one file per song, so
 * each shipped song carries a record of where its chords came from. They hold
 * chords, numerals and the source only; no word of a sheet survives reading.
 */
import { readStore } from './parse.mjs';
import { numeral, songbookTitle } from './catalogue.mjs';

export const REVIEW_DIR = 'chord-reviews';

export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Where a song's review is kept. */
export const reviewPath = (artist, title) => `${REVIEW_DIR}/${slug(artist)}--${slug(songbookTitle(title))}.json`;

/** The songs the songbook credits, once each, in songbook order, optionally narrowed. */
export function songbookSongs(SONGBOOK, { artist = null, song = null } = {}) {
  const seen = new Set();
  const out = [];
  for (const c of SONGBOOK) {
    if (artist && c.artist.toLowerCase() !== artist.toLowerCase()) continue;
    if (song && norm(c.title) !== norm(song)) continue;
    const k = `${c.artist}\n${c.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ artist: c.artist, title: c.title });
  }
  return out;
}

/** A title or name reduced for matching: no brackets, punctuation, case or leading "The". */
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

/** The Ultimate Guitar search for a song. */
export function searchUrl(artist, title) {
  const q = `${artist} ${songbookTitle(title).replace(/\([^)]*\)/g, '')}`.replace(/\s+/g, ' ').trim();
  return `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`;
}

/**
 * The version to read from a search page: a Chords version by this artist of
 * this song, the one with the most ratings (a tab, a bass tab, or a live or
 * acoustic arrangement is never taken).
 * Null when the page lists none.
 */
const ALTERNATE = /\b(live|acoustic|demo|remix|piano|ukulele|instrumental|unplugged|cover)\b/i;

export function pickChords(html, { artist, title }) {
  const results = readStore(html)?.store?.page?.data?.results ?? [];
  const candidates = results.filter(
    (r) =>
      r.type === 'Chords' &&
      r.tab_url &&
      norm(r.artist_name) === norm(artist) &&
      norm(r.song_name) === norm(title) &&
      // A live or acoustic arrangement is not the record, unless the song is.
      (!ALTERNATE.test(r.song_name) || ALTERNATE.test(title))
  );
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => ((b.votes ?? 0) > (a.votes ?? 0) ? b : a));
  return { url: best.tab_url, votes: best.votes ?? 0, rating: best.rating ?? null, version: best.version ?? null };
}

/* --- the report ------------------------------------------------------------ */

const label = (numerals, QUALITIES) => numerals.map((n) => numeral(n, QUALITIES)).join('–');
const token = (numerals) => numerals.map((n) => `${n.degree}:${n.quality}`);
/** Whether two loops are the same chords started at a different point. */
export function isRotation(a, b) {
  const x = token(a);
  const y = token(b);
  if (!x.length || x.length !== y.length) return false;
  return x.some((_, i) => [...x.slice(i), ...x.slice(0, i)].join(' ') === y.join(' '));
}

const DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
const FAMILY = (q) => (/^(min|m6|m7|m9|mMaj7)$/.test(q) ? 'm' : /^(dim|dim7|m7b5)$/.test(q) ? 'o' : /sus/.test(q) ? 's' : 'M');

/**
 * A loop as it sounds round and round: a chord held over (written twice in a
 * row, or across the seam) is one chord, and a loop written out twice is once.
 */
export function collapse(numerals) {
  const seq = numerals.filter((n, i) => i === 0 || n.degree !== numerals[i - 1].degree || n.quality !== numerals[i - 1].quality);
  while (seq.length > 1 && seq[0].degree === seq.at(-1).degree && seq[0].quality === seq.at(-1).quality) seq.pop();
  const t = token(seq);
  for (let p = 1; p < t.length; p++) if (t.length % p === 0 && t.every((x, i) => x === t[i % p])) return seq.slice(0, p);
  return seq;
}

const rotationsOf = (t) => t.map((_, i) => [...t.slice(i), ...t.slice(0, i)].join(' '));
const shape = (numerals, shift = 0) =>
  numerals.map((n) => `${(DEGREES.indexOf(n.degree) + shift) % 12}${FAMILY(n.quality)}`);

/**
 * How closely a shipped loop is on the sheet, best first:
 *   exact    — the same chords, a held chord counted once;
 *   rotation — the same chords, the sheet starting the loop at another one;
 *   colour   — the same roots and chord types, one side adding a 7th, a sus or an add9;
 *   key      — the same chords relative to each other, the reader having put
 *              the song in another key (the numerals all shift together);
 *   within   — the loop played straight through inside a longer passage the
 *              reader found no loop in (in the sheet's key or, shifted, in another);
 * or null when no loop on the sheet is it.
 */
export function matchLoop(steps, sections) {
  const want = collapse(steps);
  const exact = token(want).join(' ');
  const tries = [
    ['exact', (s) => token(collapse(s.numerals)).join(' ') === exact],
    ['rotation', (s) => rotationsOf(token(collapse(s.numerals))).includes(exact)],
    ['colour', (s) => rotationsOf(shape(collapse(s.numerals))).includes(shape(want).join(' '))],
    [
      'key',
      (s) => {
        const have = collapse(s.numerals);
        return DEGREES.some((_, k) => rotationsOf(shape(have, k)).includes(shape(want).join(' ')));
      },
    ],
    [
      'within',
      (s) => {
        const have = collapse(s.numerals);
        if (have.length <= want.length) return false;
        const w = ` ${shape(want).join(' ')} `;
        return DEGREES.some((_, k) => ` ${shape(have, k).join(' ')} `.includes(w));
      },
    ],
  ];
  for (const [level, test] of tries) {
    const hit = sections.find(test);
    if (hit) return { level, section: hit };
  }
  return null;
}

/** One song's standing: confirmed, close (colour, key or within only), differs, not found, or not yet read. */
export function songStatus(review, catalogue) {
  if (!review) return { status: 'not read' };
  if (review.notFound) return { status: 'not found' };
  const { SONGBOOK, spellProgression } = catalogue;
  const title = songbookTitle(review.title ?? '');
  const matches = SONGBOOK.filter((c) => c.artist === review.artist && c.title === title).map((c) => ({
    credit: c,
    match: matchLoop(spellProgression(c.progression), review.sections),
  }));
  const status = matches.some((m) => !m.match)
    ? 'differs'
    : matches.every((m) => m.match.level === 'exact' || m.match.level === 'rotation')
      ? 'confirmed'
      : 'close';
  return { status, matches };
}

/**
 * The whole songbook against the reviews read so far, as Markdown: a summary,
 * then each song with its shipped credits marked as on the sheet or not, and the
 * sheet's own loops as chords and numerals, with the source to check by ear.
 */
export function buildReport(songs, reviews, catalogue) {
  const { PROGRESSIONS, QUALITIES } = catalogue;
  const byPath = new Map(reviews.map((r) => [reviewPath(r.artist, r.title), r]));
  const rows = songs.map((s) => {
    const review = byPath.get(reviewPath(s.artist, s.title)) ?? null;
    return { ...s, review, ...songStatus(review, catalogue) };
  });
  const count = (st) => rows.filter((r) => r.status === st).length;

  const lines = [
    '# Songbook against the chord sheets',
    '',
    'Generated by `npm run chords -- songbook` (or `-- report`). Do not edit by hand.',
    'Each shipped credit is checked against the most-rated Ultimate Guitar Chords version of the song.',
    'A sheet is one guitarist’s reading, not the record: **differs** is a question to settle by ear, not a verdict.',
    '',
    `| Status | Songs |`,
    `|---|---|`,
    `| ✅ confirmed — every shipped credit is on the sheet | ${count('confirmed')} |`,
    `| 🟨 close — on the sheet but for a 7th, a sus, the key the reader chose, or inside a longer passage | ${count('close')} |`,
    `| ❌ differs — a shipped credit is not on the sheet | ${count('differs')} |`,
    `| ❔ not found — no Chords version on Ultimate Guitar | ${count('not found')} |`,
    `| ⏳ not read yet | ${count('not read')} |`,
    '',
  ];
  const mark = { confirmed: '✅', close: '🟨', differs: '❌', 'not found': '❔', 'not read': '⏳' };
  const verdicts = {
    exact: (s) => `✅ on the sheet (${s})`,
    rotation: (s) => `🔁 on the sheet, started at another chord (${s})`,
    colour: (s) => `🟨 on the sheet but for a 7th, sus or add9 (${s})`,
    key: (s) => `🟨 on the sheet, read in another key (${s})`,
    within: (s) => `🟨 inside a longer passage on the sheet (${s})`,
  };

  for (const r of rows) {
    if (r.status === 'not read') continue;
    lines.push(`## ${mark[r.status]} ${r.artist} — ${r.title}`, '');
    if (r.status === 'not found') {
      lines.push(`No Chords version found. Searched: ${r.review.searched}`, '');
      continue;
    }
    const v = r.review;
    const found = v.found ?? {};
    const about = [
      v.sources?.[0] ? `[source](${v.sources[0]})` : null,
      found.version ? `version ${found.version}` : null,
      typeof found.votes === 'number' ? `${found.votes} ratings` : null,
      found.rating ? `★${Number(found.rating).toFixed(2)}` : null,
      `key ${v.key}`,
      `confidence ${v.confidence}`,
    ].filter(Boolean);
    lines.push(about.join(' · '), '');
    if (v.note) lines.push(`> ${v.note}`, '');

    lines.push('| | Section | Numerals | Chords on the sheet |', '|---|---|---|---|');
    const used = new Set();
    for (const { credit: c, match } of r.matches) {
      const plain = PROGRESSIONS.find((p) => p.id === c.progression)?.label.replace(/\s*\([^)]*\)$/, '') ?? c.progression;
      if (match) used.add(match.section);
      const verdict = match ? verdicts[match.level](match.section.section) : '❌ shipped, not on the sheet';
      lines.push(`| ${verdict} | ${c.section} | ${plain} | ${match ? match.section.chords.join(' ') : ''} |`);
    }
    for (const s of v.sections) {
      if (used.has(s)) continue;
      lines.push(`| ➕ on the sheet only | ${s.section} | ${label(s.numerals, QUALITIES)} | ${s.chords.join(' ')}${s.note ? ` — ${s.note}` : ''} |`);
    }
    lines.push('');
  }
  const unread = rows.filter((r) => r.status === 'not read');
  if (unread.length) lines.push(`## ${mark['not read']} Not read yet`, '', ...unread.map((r) => `- ${r.artist} — ${r.title}`), '');
  return lines.join('\n') + '\n';
}
