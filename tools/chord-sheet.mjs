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
 * Ultimate Guitar's terms do not allow automated access. The maintainer chose
 * on 2026-10-23 to re-read the songbook's songs this way anyway — personal use,
 * about two requests a song, paced, never more than the songbook — so `songbook`
 * looks up only songs already credited and never follows links beyond them.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { reviewSheet } from './chord-sheet/parse.mjs';
import { planAdditions, compareReview, applyPlan, ARTIST_HEADINGS } from './chord-sheet/catalogue.mjs';
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
        .filter((f) => f.endsWith('.json'))
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
