#!/usr/bin/env node
/**
 * Songs into the progression catalogue, from their chord sheets.
 *
 *   npm run chords -- read <url|file> [--artist A] [--title T] [--out review.json]
 *       Fetch one song's chord sheet (an Ultimate Guitar Chords page, or a saved
 *       page or plain-text sheet on disk), keep only its chords — the words are
 *       discarded as each line is read — and write a review file: the key, each
 *       distinct section loop as chords and numerals, and a confidence.
 *
 *   npm run chords -- compare <review.json ...>
 *       Check reviews against what the songbook already credits for those songs.
 *
 *   npm run chords -- add <review.json ...> [--replace] [--heading <group>] [--dry-run]
 *       File reviewed songs into src/core/harmony.js and src/core/songbook.js
 *       (AC-2.6.1/18, AC-2.6.11). A song already credited is skipped unless
 *       --replace, which swaps its credits for the review's. Then run the gates.
 *
 *   npm run chords -- songbook [--artist A] [--song T] [--refresh] [--delay 8]
 *       Re-read every song the songbook credits from its most-rated Ultimate
 *       Guitar Chords version: search, read, keep the review in chord-reviews/,
 *       then write chord-reviews/REPORT.md setting each shipped credit beside
 *       the sheet. Paced (one request every --delay seconds, default 8) and
 *       resumable: a song already reviewed is skipped unless --refresh.
 *
 *   npm run chords -- report
 *       Rewrite chord-reviews/REPORT.md from the reviews on disk, fetching nothing.
 *
 *   npm run chords -- respell [--dry-run]
 *       Rebuild every song entry and credit by AC-2.6.1/19 — each song spelled
 *       from the Ionian tonic of its key signature — from the shipped credits and
 *       the corrections in chord-reviews/overrides.json, and write the ids that
 *       disappear to src/storage/progressionRenames.js (AC-2.12.1/4).
 *
 *   npm run chords -- rekey
 *       Re-spell the review files on disk by AC-2.6.1/19 from the chords they
 *       hold, fetching nothing, then rewrite the report.
 *
 * Ultimate Guitar's terms do not allow automated access. The maintainer chose
 * on 2026-10-23 to re-read the songbook's songs this way anyway — personal use,
 * about two requests a song, paced, never more than the songbook — so `songbook`
 * looks up only songs already credited and never follows links beyond them.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { reviewSheet } from './chord-sheet/parse.mjs';
import { planAdditions, compareReview, applyPlan, ARTIST_HEADINGS } from './chord-sheet/catalogue.mjs';
import { respell, mergeRenames } from './chord-sheet/respell.mjs';
import { parseChord, sectionKeys, toNumeral } from './chord-sheet/parse.mjs';
import { REVIEW_DIR, reviewPath, songbookSongs, searchUrl, pickChords, buildReport } from './chord-sheet/songbook-run.mjs';

const HARMONY = new URL('../src/core/harmony.js', import.meta.url);
const SONGBOOK = new URL('../src/core/songbook.js', import.meta.url);

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
      else out[a.slice(2)] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

/** A page by URL through curl — which honours a proxy — or a file from disk. */
function load(where) {
  if (!/^https?:\/\//.test(where)) return readFileSync(where, 'utf8');
  try {
    return execFileSync('curl', ['-sSLf', '--max-time', '30', '-A', 'Mozilla/5.0 (rhythm-master chord reader)', where], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error(`Could not fetch ${where} (${e.stderr?.trim() || e.message}). Save the page and pass the file instead.`);
  }
}

function printReview(r, file) {
  console.log(`${r.artist} — ${r.title}   [${r.confidence}]  ${r.note}`);
  for (const s of r.sections) {
    const nums = s.numerals.map((n) => n.degree + (n.quality === 'maj' ? '' : n.quality)).join(' ');
    console.log(`  ${s.section.padEnd(14)} ${s.chords.join(' ').padEnd(28)} ${nums}${s.note ? `   (${s.note})` : ''}`);
  }
  if (file) console.log(`  → ${file}`);
}

async function catalogue() {
  const harmony = await import(HARMONY.href);
  const songbook = await import(SONGBOOK.href);
  return { ...harmony, ...songbook };
}

const sleep = (s) => new Promise((done) => setTimeout(done, s * 1000));

function writeReport(cat) {
  const reviews = existsSync(REVIEW_DIR)
    ? readdirSync(REVIEW_DIR)
        .filter((f) => f.endsWith('.json') && f !== 'overrides.json')
        .map((f) => JSON.parse(readFileSync(`${REVIEW_DIR}/${f}`, 'utf8')))
    : [];
  const file = `${REVIEW_DIR}/REPORT.md`;
  mkdirSync(REVIEW_DIR, { recursive: true });
  writeFileSync(file, buildReport(songbookSongs(cat.SONGBOOK), reviews, cat));
  console.log(`Report → ${file}`);
}

async function songbook(opts, cat) {
  const songs = songbookSongs(cat.SONGBOOK, {
    artist: typeof opts.artist === 'string' ? opts.artist : null,
    song: typeof opts.song === 'string' ? opts.song : null,
  });
  if (!songs.length) throw new Error('No songbook song matches --artist/--song');
  const delay = Math.max(3, Number(opts.delay ?? 8));
  mkdirSync(REVIEW_DIR, { recursive: true });
  let fetched = 0;
  const failures = [];
  for (const [i, s] of songs.entries()) {
    const file = reviewPath(s.artist, s.title);
    const tag = `[${i + 1}/${songs.length}] ${s.artist} — ${s.title}`;
    if (existsSync(file) && !opts.refresh) {
      console.log(`${tag}: already reviewed, skipped`);
      continue;
    }
    try {
      if (fetched++) await sleep(delay);
      const searched = searchUrl(s.artist, s.title);
      const found = pickChords(load(searched), s);
      const stamp = new Date().toISOString().slice(0, 10);
      if (!found) {
        writeFileSync(file, JSON.stringify({ artist: s.artist, title: s.title, notFound: true, searched, read: stamp }, null, 2) + '\n');
        console.log(`${tag}: no Chords version found`);
        continue;
      }
      await sleep(delay);
      const review = reviewSheet(load(found.url), { artist: s.artist, title: s.title, source: found.url });
      writeFileSync(file, JSON.stringify({ ...review, found, read: stamp }, null, 2) + '\n');
      printReview(review);
    } catch (e) {
      // A fetch or read that fails is not recorded, so the next run tries again.
      failures.push(`${tag}: ${e.message}`);
      console.log(`${tag}: FAILED — ${e.message}`);
    }
  }
  writeReport(cat);
  if (failures.length) {
    console.log(`\n${failures.length} failed; run again to retry them:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  }
}

const RENAMES = new URL('../src/storage/progressionRenames.js', import.meta.url);
const OVERRIDES = `${REVIEW_DIR}/overrides.json`;

async function respellCommand(opts, cat) {
  const overrides = existsSync(OVERRIDES) ? JSON.parse(readFileSync(OVERRIDES, 'utf8')).songs : [];
  const result = respell({
    catalogue: cat,
    sources: { harmony: readFileSync(HARMONY, 'utf8'), songbook: readFileSync(SONGBOOK, 'utf8') },
    overrides,
    headings: ARTIST_HEADINGS,
  });
  for (const p of result.plan.problems) console.log(`PROBLEM  ${p}`);
  if (result.plan.problems.length) {
    process.exitCode = 1;
    return;
  }
  const label = (id) => cat.PROGRESSIONS.find((p) => p.id === id)?.label.replace(/\s*\([^)]*\)$/, '') ?? id;
  const fresh = new Map(result.plan.entries.map((e) => [e.id, e.label.replace(/\s*\([^)]*\)$/, '')]));
  for (const c of result.plan.credits) {
    const before = cat.SONGBOOK.find((b) => b.artist === c.artist && b.title === c.title && b.section === c.section);
    const now = fresh.get(c.progression) ?? label(c.progression);
    const was = before ? label(before.progression) : '(new section)';
    console.log(`${was === now ? '  ' : '→ '}${c.artist} — ${c.title} (${c.section}): ${was === now ? now : `${was}  →  ${now}`}`);
  }
  console.log(`\n${result.plan.entries.length} song entries, ${result.plan.credits.length} credits; ${Object.keys(result.renames).length} ids renamed.`);
  if (opts['dry-run']) return;
  writeFileSync(HARMONY, result.sources.harmony);
  writeFileSync(SONGBOOK, result.sources.songbook);
  const { PROGRESSION_RENAMES } = await import(RENAMES.href);
  const ids = new Set([...cat.PROGRESSIONS.filter((p) => !p.fromSongs).map((p) => p.id), ...result.plan.entries.map((e) => e.id)]);
  const merged = mergeRenames(PROGRESSION_RENAMES, result.renames, (id) => ids.has(id));
  const text = readFileSync(RENAMES, 'utf8').replace(
    /export const PROGRESSION_RENAMES = \{[\s\S]*?\n?\};/,
    `export const PROGRESSION_RENAMES = {\n${Object.entries(merged)
      .map(([from, to]) => `  '${from}': [${to.map((id) => `'${id}'`).join(', ')}],`)
      .join('\n')}\n};`
  );
  writeFileSync(RENAMES, text);
  console.log('Wrote harmony.js, songbook.js and progressionRenames.js. Now: regenerate the matrix and run every gate (CLAUDE.md §4).');
}

async function rekey(cat) {
  for (const f of readdirSync(REVIEW_DIR).filter((f) => f.endsWith('.json') && f !== 'overrides.json')) {
    const file = `${REVIEW_DIR}/${f}`;
    const r = JSON.parse(readFileSync(file, 'utf8'));
    if (r.notFound || !r.sections?.length) continue;
    const loops = r.sections.map((s) => s.chords.map(parseChord));
    const { song, keys } = sectionKeys(loops);
    r.key = song.name;
    r.sections = r.sections.map((s, i) => ({
      ...s,
      numerals: loops[i].map((c) => toNumeral(c, keys[i].tonic)),
      note:
        [keys[i].tonic !== song.tonic ? `spelled in ${keys[i].name}, the key this section lies in` : null, ...(s.note ?? '').split('; ').filter((n) => n && !n.startsWith('spelled in '))]
          .filter(Boolean)
          .join('; ') || null,
    }));
    r.note = r.note?.replace(/^key [A-G][b#]? (major|minor), \d+% of chords diatonic/, `key ${song.name}`) ?? null;
    writeFileSync(file, JSON.stringify(r, null, 2) + '\n');
  }
  writeReport(cat);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const opts = args(rest);

  if (command === 'read') {
    const where = opts._[0];
    if (!where) throw new Error('read needs a URL or a file');
    const review = reviewSheet(load(where), {
      artist: typeof opts.artist === 'string' ? opts.artist : null,
      title: typeof opts.title === 'string' ? opts.title : null,
      source: /^https?:/.test(where) ? where : null,
    });
    const file = typeof opts.out === 'string' ? opts.out : reviewPath(review.artist, review.title);
    if (file.includes('/')) mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    writeFileSync(file, JSON.stringify(review, null, 2) + '\n');
    printReview(review, file);
    return;
  }

  if (command === 'songbook') return songbook(opts, await catalogue());
  if (command === 'report') return writeReport(await catalogue());
  if (command === 'respell') return respellCommand(opts, await catalogue());
  if (command === 'rekey') return rekey(await catalogue());

  const files = opts._;
  if (!files.length) throw new Error(`${command ?? 'a command'} needs review files`);
  const reviews = files.map((f) => JSON.parse(readFileSync(f, 'utf8'))).flat();
  const cat = await catalogue();

  if (command === 'compare') {
    for (const r of reviews) {
      const c = compareReview(r, cat);
      if (!c.shipped) {
        console.log(`${c.artist} — ${c.title}: not in the songbook yet`);
        continue;
      }
      const ok = c.unmatchedShipped.length === 0;
      console.log(`${c.artist} — ${c.title}: ${ok ? 'every shipped credit confirmed' : 'DIFFERS'}`);
      if (c.matched.length) console.log(`  matches:   ${c.matched.join(', ')}`);
      for (const s of c.unmatchedShipped) console.log(`  shipped, not on the sheet: ${s}`);
      for (const n of c.newLoops) console.log(`  on the sheet, not shipped: ${n}`);
    }
    return;
  }

  if (command === 'add') {
    const headings = { ...ARTIST_HEADINGS };
    if (typeof opts.heading === 'string') for (const r of reviews) headings[r.artist] ??= opts.heading;
    const plan = planAdditions(reviews, cat, { replace: Boolean(opts.replace), headings });
    for (const s of plan.skipped) console.log(`skip     ${s}`);
    for (const c of plan.removedCredits) console.log(`remove   ${c.artist} — ${c.title} (${c.section}) → ${c.progression}`);
    for (const e of plan.entries) console.log(`entry    [${e.group}] ${e.label}`);
    for (const c of plan.credits) console.log(`credit   ${c.artist} — ${c.title} (${c.section}) → ${c.progression}`);
    for (const p of plan.problems) console.log(`PROBLEM  ${p}`);
    if (plan.problems.length) process.exitCode = 1;
    if (opts['dry-run'] || (!plan.credits.length && !plan.removedCredits.length)) return;
    const groupLabels = Object.fromEntries(cat.PROGRESSION_GROUPS.map((g) => [g.id, g.label]));
    const out = applyPlan(
      { harmony: readFileSync(HARMONY, 'utf8'), songbook: readFileSync(SONGBOOK, 'utf8') },
      plan,
      { groupLabels, SONGBOOK: cat.SONGBOOK }
    );
    writeFileSync(HARMONY, out.harmony);
    writeFileSync(SONGBOOK, out.songbook);
    console.log(
      `\nWrote ${plan.entries.length} entries and ${plan.credits.length} credits. Now: regenerate the matrix and run every gate (CLAUDE.md §4).`
    );
    return;
  }

  throw new Error('Usage: npm run chords -- read <url|file> | compare <review.json...> | add <review.json...> | songbook | report');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
