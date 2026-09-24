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
 * Read one song at a time, for practice: Ultimate Guitar's terms do not allow
 * automated bulk access, and nothing here crawls.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { reviewSheet } from './chord-sheet/parse.mjs';
import { planAdditions, compareReview, applyPlan, ARTIST_HEADINGS } from './chord-sheet/catalogue.mjs';

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

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

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
    const file = typeof opts.out === 'string' ? opts.out : `chord-reviews/${slug(review.artist)}--${slug(review.title)}.json`;
    if (file.includes('/')) mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    writeFileSync(file, JSON.stringify(review, null, 2) + '\n');
    printReview(review, file);
    return;
  }

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

  throw new Error('Usage: npm run chords -- read <url|file> | compare <review.json...> | add <review.json...>');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
