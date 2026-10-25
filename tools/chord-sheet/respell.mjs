/**
 * Re-spelling the songbook by AC-2.6.1/19: every song progression from the
 * Ionian tonic of the major key whose signature holds most of its chords. Pure —
 * it takes the catalogue and the two source files as values — so the result can
 * be shown before it is written, and every rule is tested.
 *
 * Each song's sections come from the corrections file where it lists the song
 * (chords as the sheet writes them), and from its shipped credits otherwise. The
 * song entries and credits are then rebuilt from nothing, under the same filing
 * rules `add` uses (AC-2.6.1/15, /18, AC-2.6.11/3), and every old song entry id
 * that disappears is mapped to the entries that now hold its songs' sections, so
 * a tick on My list follows the song (AC-2.12.1/4).
 */
import { parseChord, sectionKeys, toNumeral } from './parse.mjs';
import { planAdditions, applyPlan, songbookTitle } from './catalogue.mjs';

const CHROMATIC = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];

/** A spelled step as a chord with a pitch-class root, the song's old tonic at 0. */
const asChord = (step) => ({ root: CHROMATIC.indexOf(step.degree), quality: step.quality });

/** The songbook's songs, in order, each with its sections as chords. */
export function songSections(SONGBOOK, spellProgression, overrides = []) {
  const songs = [];
  const index = new Map();
  // A corrected song's credits are replaced wholesale, so they are never spelled:
  // a correction may take over a credit to an entry the catalogue has retired.
  const corrected = new Set(overrides.map((o) => `${o.artist}\n${songbookTitle(o.title)}`));
  for (const c of SONGBOOK) {
    const k = `${c.artist}\n${c.title}`;
    if (!index.has(k)) {
      index.set(k, songs.length);
      songs.push({ artist: c.artist, title: c.title, sections: [] });
    }
    const chords = corrected.has(k) ? null : spellProgression(c.progression).map(asChord);
    songs[index.get(k)].sections.push({ section: c.section, chords, was: c.progression });
  }
  for (const o of overrides) {
    const song = songs.find((s) => s.artist === o.artist && s.title === songbookTitle(o.title));
    if (!song) throw new Error(`The corrections name a song the songbook does not credit: ${o.artist} — ${o.title}`);
    const was = song.sections;
    song.sections = o.sections.map((s) => {
      const chords = s.chords.map((symbol) => {
        const c = parseChord(symbol);
        if (!c) throw new Error(`${o.artist} — ${o.title} (${s.section}): cannot read ${symbol}`);
        return c;
      });
      // The old credit this section takes over: the same section name, else the song's first.
      return { section: s.section, chords, was: (was.find((w) => w.section === s.section) ?? was[0]).was };
    });
  }
  return songs;
}

/** Each song as a review: its sections' numerals in the Ionian key(s) AC-2.6.1/19 gives. */
export function ionianReviews(songs) {
  return songs.map((song) => {
    const { song: key, keys } = sectionKeys(song.sections.map((s) => s.chords));
    return {
      artist: song.artist,
      title: song.title,
      key: key.name,
      sections: song.sections.map((s, i) => ({
        section: s.section,
        numerals: s.chords.map((c) => toNumeral(c, keys[i].tonic)),
        key: keys[i].name,
      })),
    };
  });
}

/** The two source files with every song entry and every credit taken out. */
export function stripSongs({ harmony, songbook }) {
  return {
    harmony: harmony
      .split('\n')
      .filter((l) => !/^ {2}songEntry\(/.test(l) && l !== '  // Song progressions (AC-2.6.1/18), credited in core/songbook.js.')
      .join('\n'),
    songbook: songbook
      .split('\n')
      .filter((l) => !/^ {2}\['[^']*', '[^']*', '[^']*', '[^']*'\],$/.test(l))
      .join('\n'),
  };
}

/**
 * The respelled songbook: the plan (entries and credits rebuilt from nothing),
 * the edited sources, and the renames — each old song entry id that is gone,
 * mapped to the entries that now hold the sections that were credited to it.
 */
export function respell({ catalogue, sources, overrides = [], headings }) {
  const { PROGRESSIONS, spellProgression, QUALITIES, SONGBOOK, PROGRESSION_GROUPS } = catalogue;
  const songs = songSections(SONGBOOK, spellProgression, overrides);
  const reviews = ionianReviews(songs);
  const own = PROGRESSIONS.filter((p) => !p.fromSongs);
  const plan = planAdditions(reviews, { PROGRESSIONS: own, spellProgression, QUALITIES, SONGBOOK: [] }, { headings });
  if (plan.problems.length) return { plan, reviews, songs };

  const groupLabels = Object.fromEntries(PROGRESSION_GROUPS.map((g) => [g.id, g.label]));
  const out = applyPlan(stripSongs(sources), plan, { groupLabels, SONGBOOK: [] });

  const kept = new Set([...own.map((p) => p.id), ...plan.entries.map((e) => e.id)]);
  const renames = {};
  const credits = [...plan.credits];
  for (const song of songs) {
    for (const s of song.sections) {
      const credit = credits.find((c) => c.artist === song.artist && c.title === songbookTitle(song.title) && c.section === s.section);
      if (!credit || kept.has(s.was) || s.was === credit.progression) continue;
      (renames[s.was] ??= []).includes(credit.progression) || renames[s.was].push(credit.progression);
    }
  }
  return { plan, reviews, songs, sources: out, renames };
}

/** A rename map merged into an earlier one: chains followed, ids that exist again dropped. */
export function mergeRenames(earlier, next, exists) {
  const merged = {};
  const follow = (ids) => [...new Set(ids.flatMap((id) => (next[id] ? next[id] : [id])))];
  for (const [from, to] of Object.entries(earlier)) merged[from] = follow(to);
  for (const [from, to] of Object.entries(next)) if (!(from in merged)) merged[from] = to;
  for (const from of Object.keys(merged)) {
    merged[from] = merged[from].filter(exists);
    if (exists(from) || !merged[from].length) delete merged[from];
  }
  return merged;
}
