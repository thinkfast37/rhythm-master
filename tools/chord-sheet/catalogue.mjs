/**
 * Filing reviewed songs into the progression catalogue (AC-2.6.1/18) and the
 * songbook (AC-2.6.11). Pure: it takes the catalogue and the two source files as
 * values and returns the edited source, so the plan can be shown before it is
 * written and every rule can be tested.
 *
 * The rules are the ones the spec states:
 *   - a loop the catalogue already holds is credited to that entry, never
 *     duplicated (AC-2.6.1/15);
 *   - a new loop becomes a song entry with every quality explicit, filed after
 *     its heading's own entries under the heading AC-2.6.1/18 gives it;
 *   - every song entry keeps at least one credit (AC-2.6.11/3), so replacing a
 *     song's credits removes an entry nothing credits any more.
 */

const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII' };
const LOWER = new Set(['min', 'm7', 'm6', 'm9', 'mMaj7', 'dim', 'm7b5', 'dim7']);
const SUSPENDED = new Set(['sus2', 'sus4', 'add9', '7sus4']);
const OUTSIDE = new Set(['b2', 'b3', '#4', 'b6', 'b7']);
const DEGREE = /^(b2|b3|b6|b7|#4|[1-7])$/;

/**
 * The heading an artist's otherwise-diatonic loops file under (AC-2.6.1/18).
 * An artist not named here has no heading until the criterion names one, so the
 * tool asks for it rather than guessing.
 */
export const ARTIST_HEADINGS = {
  Radiohead: 'indie',
  'The National': 'indie',
  Wilco: 'indie',
  'Bon Iver': 'indie',
  Coldplay: 'pop',
  'Bob Dylan': 'classical',
};

/** The heading a song loop files under (AC-2.6.1/18). */
export function headingFor(numerals, artist, headings = ARTIST_HEADINGS) {
  if (numerals.some((n) => SUSPENDED.has(n.quality))) return 'sus';
  const tonic = numerals.find((n) => n.degree === '1');
  if (tonic && LOWER.has(tonic.quality)) return 'minor';
  if (numerals.some((n) => OUTSIDE.has(n.degree))) return 'modal';
  return headings[artist] ?? null;
}

/** A numeral as the catalogue labels it (`♭VIImaj7`), or as its ids spell it (`bVIImaj7`). */
export function numeral({ degree, quality }, qualities, ascii = false) {
  const accidental = degree.length > 1 ? degree[0] : '';
  const roman = ROMAN[degree.slice(-1)];
  const body = LOWER.has(quality) ? roman.toLowerCase() : roman;
  let suffix = quality === 'maj' || quality === 'min' ? '' : qualities.find((q) => q.id === quality).numeral;
  if (ascii) suffix = suffix.replace('°', 'o').replace('ø', 'hd').replace('♭', 'b').replace('+', 'aug');
  const acc = ascii ? accidental : accidental.replace('b', '♭').replace('#', '♯');
  return acc + body + suffix;
}

/** A title as the songbook writes it: curly apostrophes, no featured artist. */
export function songbookTitle(title) {
  return title
    .replace(/\s*\((with|feat\.?|ft\.?)\s[^)]*\)/i, '')
    .replace(/'/g, '’')
    .trim();
}

const sameTitle = (a, b) => {
  const norm = (t) => songbookTitle(t).toLowerCase().replace(/’/g, "'").replace(/\s*\([^)]*\)/g, '');
  return norm(a) === norm(b);
};
const keyOf = (chords) => JSON.stringify(chords.map((c) => [c.degree, c.quality]));

/**
 * What a review would change, without changing anything: the entries to add,
 * the credits to add, the credits it replaces, and anything that stops it.
 */
export function planAdditions(reviews, catalogue, { replace = false, headings = ARTIST_HEADINGS } = {}) {
  const { PROGRESSIONS, spellProgression, QUALITIES, SONGBOOK } = catalogue;
  const existing = new Map(PROGRESSIONS.map((p) => [keyOf(spellProgression(p.id)), p.id]));
  const ids = new Set(PROGRESSIONS.map((p) => p.id));
  const fresh = new Map();
  const plan = { entries: [], credits: [], removedCredits: [], skipped: [], problems: [] };

  for (const review of reviews) {
    const artist = review.artist;
    const title = songbookTitle(review.title ?? '');
    if (!artist || !title) {
      plan.problems.push(`a review names no artist or title (${review.sources?.[0] ?? 'no source'})`);
      continue;
    }
    const shipped = SONGBOOK.filter((c) => c.artist === artist && sameTitle(c.title, title));
    if (shipped.length && !replace) {
      plan.skipped.push(`${artist} — ${title}: already credited (compare it, or add with --replace)`);
      continue;
    }
    plan.removedCredits.push(...shipped);

    for (const section of review.sections) {
      const tag = `${artist} — ${title} (${section.section})`;
      const nums = section.numerals;
      if (nums.length < 2) {
        plan.problems.push(`${tag}: one chord is not a progression`);
        continue;
      }
      if (nums.length > 16) {
        plan.problems.push(`${tag}: ${nums.length} chords, the catalogue holds at most 16`);
        continue;
      }
      const bad = nums.find((n) => !DEGREE.test(n.degree) || !QUALITIES.some((q) => q.id === n.quality));
      if (bad) {
        plan.problems.push(`${tag}: unreadable chord ${JSON.stringify(bad)}`);
        continue;
      }
      const k = keyOf(nums);
      let id = existing.get(k) ?? fresh.get(k)?.id;
      if (!id) {
        const group = headingFor(nums, artist, headings);
        if (!group) {
          plan.problems.push(`${tag}: ${artist} has no heading in AC-2.6.1/18 — pass --heading, and revise the criterion`);
          continue;
        }
        const base = nums.map((n) => numeral(n, QUALITIES, true)).join('-');
        id = base;
        if (ids.has(id)) id = `${base}-${nums.every((n) => n.quality === 'maj' || n.quality === 'min') ? 'triads' : 'song'}`;
        for (let i = 2; ids.has(id); i++) id = `${base}-song${i}`;
        ids.add(id);
        const label = `${nums.map((n) => numeral(n, QUALITIES)).join('–')} (${title})`;
        const entry = { id, label, group, steps: nums };
        fresh.set(k, entry);
        plan.entries.push(entry);
      }
      plan.credits.push({ artist, title, section: section.section, progression: id });
    }
  }
  return plan;
}

/**
 * A review against what the songbook already credits for that song, loop by
 * loop: which read loops match a shipped credit, which shipped credits no read
 * loop matches, and which read loops are new.
 */
export function compareReview(review, catalogue) {
  const { PROGRESSIONS, spellProgression, SONGBOOK } = catalogue;
  const title = songbookTitle(review.title ?? '');
  const shipped = SONGBOOK.filter((c) => c.artist === review.artist && sameTitle(c.title, title)).map((c) => ({
    ...c,
    key: keyOf(spellProgression(c.progression)),
    label: PROGRESSIONS.find((p) => p.id === c.progression)?.label,
  }));
  const read = review.sections.map((s) => ({ ...s, key: keyOf(s.numerals) }));
  return {
    artist: review.artist,
    title,
    shipped: shipped.length > 0,
    matched: read.filter((r) => shipped.some((s) => s.key === r.key)).map((r) => r.section),
    unmatchedShipped: shipped.filter((s) => !read.some((r) => r.key === s.key)).map((s) => `${s.section}: ${s.label}`),
    newLoops: read.filter((r) => !shipped.some((s) => s.key === r.key)).map((r) => `${r.section}: ${r.chords.join(' ')}`),
  };
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, '’')}'`;

/** A catalogue entry as a source line, the way harmony.js writes its song entries. */
export function entryLine(e) {
  const steps = e.steps.map((n) => `q('${n.degree}', '${n.quality}')`).join(', ');
  return `  songEntry('${e.group}', '${e.id}', ${q(e.label)}, [${steps}]),`;
}

/** A credit as a source line, the way songbook.js writes it. */
export function creditLine(c) {
  return `  [${q(c.artist)}, ${q(c.title)}, ${q(c.section)}, '${c.progression}'],`;
}

const HEADER = '  // Song progressions (AC-2.6.1/18), credited in core/songbook.js.';

/**
 * The two source files with a plan applied: removed credits and the entries
 * they orphan taken out, new entries appended to their headings' song blocks,
 * new credits appended, and any new artist added to ARTISTS.
 */
export function applyPlan({ harmony, songbook }, plan, { groupLabels, SONGBOOK }) {
  // Credits out, then any song entry nothing credits any more.
  const removed = new Set(plan.removedCredits.map((c) => creditLine(c)));
  let book = songbook
    .split('\n')
    .filter((line) => !removed.has(line))
    .join('\n');
  const stillCredited = new Set([
    ...SONGBOOK.filter((c) => !removed.has(creditLine(c))).map((c) => c.progression),
    ...plan.credits.map((c) => c.progression),
  ]);
  let harm = harmony
    .split('\n')
    .filter((line) => {
      const m = /^ {2}songEntry\('\w+', '([^']+)'/.exec(line);
      return !m || stillCredited.has(m[1]);
    })
    .join('\n');

  // New entries, at the end of each heading's block.
  for (const [group, label] of Object.entries(groupLabels)) {
    const lines = plan.entries.filter((e) => e.group === group).map(entryLine);
    if (!lines.length) continue;
    const start = harm.indexOf(`  // --- ${label} (`);
    if (start < 0) throw new Error(`No "${label}" heading in harmony.js`);
    const nextHeading = harm.indexOf('\n  // --- ', start + 1);
    const close = harm.indexOf('\n];', start);
    let end = nextHeading >= 0 && nextHeading < close ? nextHeading : close;
    // Step back over the blank line that separates headings.
    while (harm[end - 1] === '\n') end -= 1;
    const block = harm.slice(start, end);
    const insert = (block.includes(HEADER) ? '' : `\n${HEADER}`) + `\n${lines.join('\n')}`;
    harm = harm.slice(0, end) + insert + harm.slice(end);
  }

  // New credits, and any artist not yet listed.
  const closeAt = book.indexOf('\n].map(([artist, title, section, progression])');
  if (closeAt < 0) throw new Error('songbook.js has no SONGBOOK list to append to');
  if (plan.credits.length) book = book.slice(0, closeAt) + '\n' + plan.credits.map(creditLine).join('\n') + book.slice(closeAt);
  const artists = /export const ARTISTS = \[([^\]]*)\];/.exec(book);
  const listed = [...artists[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const added = [...new Set(plan.credits.map((c) => c.artist))].filter((a) => !listed.includes(a));
  if (added.length) {
    const all = [...listed, ...added].map((a) => `'${a}'`).join(', ');
    book = book.replace(artists[0], `export const ARTISTS = [${all}];`);
  }
  return { harmony: harm, songbook: book };
}
