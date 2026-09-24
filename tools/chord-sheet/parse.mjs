/**
 * Reading a chord sheet: from a page to each section's chord loop as scale
 * degrees. Pure — no network, no files — so every step can be tested.
 *
 * A chord sheet is chords over lyrics. The lyrics are never kept: a line is
 * reduced to its chord symbols the moment it is read, and nothing downstream
 * ever sees the words: the catalogue holds chords only (AC-2.6.1 and its
 * 2026-09-24 note), and a review file is safe to keep because it holds no text.
 *
 * Two inputs are understood:
 *   - an Ultimate Guitar tab page, whose sheet sits JSON-encoded in the
 *     `js-store` element with chords marked `[ch]Am[/ch]` and sections marked
 *     `[Verse 1]`;
 *   - a plain-text sheet, chords on their own lines above the words, sections
 *     marked `[Chorus]` or `Chorus:`.
 */

const CHROMATIC = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Chord-symbol suffixes, as written on sheets, to the app's qualities
 * (core/harmony.js QUALITIES). An entry with a `note` is a simplification: the
 * app has no such chord, and the nearest it has is used.
 */
const SUFFIXES = [
  [['', 'maj', 'M', 'major'], 'maj'],
  [['m', 'min', '-', 'minor'], 'min'],
  [['5'], 'maj', 'power chord read as major'],
  [['dim', '°', 'o'], 'dim'],
  [['dim7', '°7', 'o7'], 'dim7'],
  [['aug', '+', '#5', '+5'], 'aug'],
  [['sus2'], 'sus2'],
  [['sus4', 'sus'], 'sus4'],
  [['7sus4', '7sus'], '7sus4'],
  [['7sus2'], '7sus4', '7sus2 read as 7sus4'],
  [['6'], '6'],
  [['m6', 'min6'], 'm6'],
  [['6/9', '69', '6add9'], '6', '6/9 read as 6'],
  [['maj7', 'M7', 'Δ', 'Δ7', 'ma7', 'j7'], 'maj7'],
  [['maj9', 'M9', 'Δ9'], 'maj9'],
  [['maj7#11', 'maj13', 'M7#11', 'maj7add13'], 'maj7', 'extension dropped'],
  [['m7', 'min7', '-7', 'mi7'], 'm7'],
  [['m9', 'min9', '-9'], 'm9'],
  [['m11', 'min11', 'm7add11', 'm13'], 'm7', 'm11/m13 read as m7'],
  [['m7b5', 'ø', 'ø7', 'm7-5', 'min7b5'], 'm7b5'],
  [['mMaj7', 'mM7', 'm(maj7)', 'minmaj7', 'm(M7)', 'mmaj7'], 'mMaj7'],
  [['7'], '7'],
  [['9'], '9'],
  [['11', '13', '7b9', '7#9', '7#11', '7b13', '7b5', '7#5', '9sus4', '13sus4'], '7', 'altered/extended dominant read as 7'],
  [['add9', 'add2', '2', '(add9)'], 'add9'],
  [['madd9', 'm(add9)', 'madd2', 'm2'], 'min', 'minor add9 read as minor'],
  [['add11', 'add4', '(add11)', 'add13'], 'maj', 'add11 read as major'],
  [['sus2sus4', 'sus24'], 'sus4', 'sus2sus4 read as sus4'],
];
const SUFFIX = new Map();
for (const [spellings, quality, note] of SUFFIXES) for (const s of spellings) SUFFIX.set(s, { quality, note: note ?? null });

const CHORD_RE = /^([A-G])([#b♯♭]?)([^/\s]*)(?:\/([A-G][#b♯♭]?))?$/;

/**
 * One chord symbol → `{ symbol, root, quality, note }`, root a pitch class.
 * A slash chord keeps its upper chord and drops the bass (the catalogue has no
 * inversions), and says so. Null when the symbol is not a chord.
 */
export function parseChord(symbol) {
  const m = CHORD_RE.exec(symbol.trim());
  if (!m) return null;
  const [, letter, accidental, suffix, bass] = m;
  const found = SUFFIX.get(suffix);
  if (!found) return null;
  const shift = accidental === '#' || accidental === '♯' ? 1 : accidental === 'b' || accidental === '♭' ? -1 : 0;
  const notes = [found.note, bass ? `bass ${bass} dropped` : null].filter(Boolean);
  return {
    symbol: symbol.trim(),
    root: (NOTE[letter] + shift + 12) % 12,
    quality: found.quality,
    note: notes.length ? notes.join('; ') : null,
  };
}

/* --- from a page to the sheet ---------------------------------------------- */

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/**
 * The sheet a page carries, with what the page says about it. An Ultimate
 * Guitar page is read from its embedded store; anything else is taken to be the
 * sheet itself.
 */
export function extractSheet(input) {
  const store = /class="js-store"\s+data-content="([^"]*)"/.exec(input);
  if (!store) return { content: input, artist: null, title: null, tonality: null, capo: null };
  const data = JSON.parse(decodeEntities(store[1]));
  const view = data?.store?.page?.data;
  const content = view?.tab_view?.wiki_tab?.content;
  if (typeof content !== 'string') throw new Error('The page holds no chord sheet (is it a Chords page?)');
  const tab = view?.tab ?? {};
  const meta = view?.tab_view?.meta ?? {};
  return {
    content,
    artist: tab.artist_name ?? null,
    title: tab.song_name ?? null,
    tonality: tab.tonality_name || meta.tonality || null,
    capo: meta.capo ?? null,
  };
}

/* --- from the sheet to sections of chords --------------------------------- */

const SECTION_NAMES = [
  ['pre-chorus', /^pre[\s-]?chorus/],
  ['post-chorus', /^post[\s-]?chorus/],
  ['chorus', /^(chorus|hook)/],
  ['verse', /^verse/],
  ['bridge', /^(bridge|middle 8|middle eight)/],
  ['intro', /^intro/],
  ['outro', /^(outro|coda|ending|end)\b/],
  ['interlude', /^(interlude|instrumental|break)/],
  ['solo', /^solo/],
  ['refrain', /^refrain/],
];

/** A section header's plain name, or null when the line is not one. */
export function sectionName(line) {
  const bracket = /^\s*\[([^\]]+)\]\s*$/.exec(line);
  const colon = /^\s*([A-Za-z][A-Za-z \-]*\d*)\s*:\s*$/.exec(line);
  const raw = (bracket ?? colon)?.[1]?.trim().toLowerCase();
  if (!raw || raw === 'tab' || raw === '/tab' || raw === 'ch' || raw === '/ch') return null;
  for (const [name, re] of SECTION_NAMES) if (re.test(raw)) return name;
  return bracket ? raw.replace(/\s*\d+$/, '') : null;
}

const NOISE = /^(\||\|\||-+|x\d+|\(?x\d+\)?|\d+x|n\.?c\.?|%|\(|\)|\.+|\/)$/i;

/** The chord symbols on one line, in order — never its words. */
export function chordsOnLine(line) {
  const marked = [...line.matchAll(/\[ch\]([^[]+)\[\/ch\]/g)].map((m) => m[1]);
  if (marked.length) return marked;
  // A plain line is a chord line only when every token is a chord (or bar
  // noise): a single stray capitalised word must not read as a chord.
  const tokens = line
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NOISE.test(t));
  if (!tokens.length || !tokens.every((t) => parseChord(t))) return [];
  return tokens;
}

/**
 * The sheet as sections in order, each its label and the chord symbols in it.
 * Chords before the first header are an intro. Words are discarded line by line.
 */
export function readSections(content) {
  const sections = [];
  let current = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\[\/?tab\]/g, '');
    const name = sectionName(line);
    if (name) {
      current = { section: name, symbols: [] };
      sections.push(current);
      continue;
    }
    const symbols = chordsOnLine(line);
    if (!symbols.length) continue;
    if (!current) {
      current = { section: 'intro', symbols: [] };
      sections.push(current);
    }
    current.symbols.push(...symbols);
  }
  return sections.filter((s) => s.symbols.length);
}

/* --- the loop, the key, the numerals --------------------------------------- */

const same = (a, b) => a.root === b.root && a.quality === b.quality;

/**
 * A section's repeating loop. A sheet shows where chords change, not how long
 * they last, so a chord repeated back to back is one chord; the loop is the
 * shortest period the sequence repeats at, a partial last pass allowed.
 */
export function findLoop(chords) {
  const seq = chords.filter((c, i) => i === 0 || !same(c, chords[i - 1]));
  // A chord repeated across the loop's seam is the same chord held over.
  while (seq.length > 1 && same(seq[0], seq[seq.length - 1])) {
    const p = periodOf(seq.slice(0, -1));
    if (p < seq.length - 1) break;
    seq.pop();
  }
  return seq.slice(0, periodOf(seq));
}

function periodOf(seq) {
  for (let p = 1; p <= seq.length; p++) {
    if (seq.every((c, i) => same(c, seq[i % p]))) return p;
  }
  return seq.length;
}

const FAMILY = {
  maj: 'M', '6': 'M', maj7: 'M', '7': 'M', '9': 'M', maj9: 'M', add9: 'M', aug: 'M',
  min: 'm', m6: 'm', m7: 'm', m9: 'm', mMaj7: 'm',
  dim: 'd', m7b5: 'd', dim7: 'd',
  sus2: 's', sus4: 's', '7sus4': 's',
};
const MAJOR_KEY = { 0: 'M', 2: 'm', 4: 'm', 5: 'M', 7: 'M', 9: 'm', 11: 'd' };
const MINOR_KEY = { 0: 'm', 2: 'd', 3: 'M', 5: 'm', 7: 'm', 8: 'M', 10: 'M' };

/** Whether a chord belongs to a key; a suspended chord fits any root in it. */
function fits(chord, tonic, mode) {
  const table = mode === 'major' ? MAJOR_KEY : MINOR_KEY;
  const interval = (chord.root - tonic + 12) % 12;
  const family = FAMILY[chord.quality];
  if (mode === 'minor' && interval === 7 && family === 'M') return true; // harmonic-minor V
  return interval in table && (family === 's' || table[interval] === family);
}

const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * The key that explains the most chords, with how well it fits. Opening and
 * closing on the tonic count as evidence, and a major key beats its relative
 * minor unless the song opens on the minor chord.
 */
export function detectKey(chords) {
  const first = chords[0];
  const last = chords[chords.length - 1];
  let best = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['major', 'minor']) {
      const inKey = chords.filter((c) => fits(c, tonic, mode)).length;
      const tonicFamily = mode === 'major' ? 'M' : 'm';
      const isTonic = (c) => c && c.root === tonic && (FAMILY[c.quality] === tonicFamily || FAMILY[c.quality] === 's');
      const score = inKey + (isTonic(first) ? 1.5 : 0) + (isTonic(last) ? 1 : 0) + (mode === 'major' ? 0.1 : 0);
      if (!best || score > best.score) best = { tonic, mode, score, fit: inKey / chords.length };
    }
  }
  return { tonic: best.tonic, mode: best.mode, name: `${NAMES[best.tonic]} ${best.mode}`, fit: best.fit };
}

/** A chord as a scale degree of the key, its quality kept. */
export function toNumeral(chord, tonic) {
  return { degree: CHROMATIC[(chord.root - tonic + 12) % 12], quality: chord.quality };
}

/**
 * A whole sheet read into a review record: the key, and each distinct section
 * loop as chords and numerals, every simplification noted, with a confidence
 * the reviewer can sort by. No words survive into it.
 */
export function reviewSheet(input, { artist = null, title = null, source = null } = {}) {
  const sheet = extractSheet(input);
  const raw = readSections(sheet.content);
  const unknown = [];
  const sections = raw.map((s) => {
    const chords = [];
    for (const symbol of s.symbols) {
      const c = parseChord(symbol);
      if (c) chords.push(c);
      else unknown.push(symbol);
    }
    return { section: s.section, chords };
  });
  const all = sections.flatMap((s) => s.chords);
  if (!all.length) throw new Error('No chords found on the sheet');
  const key = detectKey(all);

  const out = [];
  const seen = new Map();
  for (const s of sections) {
    const loop = findLoop(s.chords);
    if (loop.length < 2) continue; // one chord is not a progression
    const sig = loop.map((c) => `${c.root}:${c.quality}`).join(' ');
    if (seen.has(sig)) continue; // a later verse repeating the first
    const count = out.filter((o) => o.section === s.section || o.section.startsWith(`${s.section} `)).length;
    const name = count ? `${s.section} ${count + 1}` : s.section;
    seen.set(sig, name);
    const notes = [...new Set(loop.map((c) => c.note && `${c.symbol}: ${c.note}`).filter(Boolean))];
    out.push({
      section: name,
      chords: loop.map((c) => c.symbol),
      numerals: loop.map((c) => toNumeral(c, key.tonic)),
      note: [loop.length > 16 ? 'longer than 16 chords — trim before adding' : null, ...notes].filter(Boolean).join('; ') || null,
    });
  }

  const confidence = unknown.length === 0 && key.fit >= 0.85 ? 'high' : key.fit >= 0.7 ? 'medium' : 'low';
  const reasons = [
    `key ${key.name}, ${Math.round(key.fit * 100)}% of chords diatonic`,
    unknown.length ? `unread symbols: ${[...new Set(unknown)].join(' ')}` : null,
    sheet.tonality && sheet.tonality.replace(/m$/, ' minor') !== key.name ? `page says key ${sheet.tonality}` : null,
    sheet.capo ? `capo ${sheet.capo} (numerals are unaffected)` : null,
  ].filter(Boolean);

  return {
    artist: artist ?? sheet.artist,
    title: title ?? sheet.title,
    key: key.name,
    sections: out,
    confidence,
    note: reasons.join('; '),
    sources: source ? [source] : [],
  };
}
