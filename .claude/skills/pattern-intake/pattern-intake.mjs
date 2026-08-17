#!/usr/bin/env node
/**
 * pattern-intake — review Patterns submitted through US-13.1, and add the good ones.
 *
 * Usage:
 *   pattern-intake list                 open new-pattern issues, one line each
 *   pattern-intake show <issue…>        decode and render, changing nothing
 *   pattern-intake accept <issue…>      append to data/seed-patterns.json
 *       --force                         accept a name that already exists
 *       --dry-run                       render what would be appended, write nothing
 *
 * `accept` writes the seed file and stops. Validating and committing are separate
 * on purpose: `npm run validate:seed` is the gate that decides whether the write
 * was any good, and a tool that both writes and blesses its own write is a tool
 * whose gate proves nothing.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patternsFromIssue } from './lib/decode.mjs';
import { renderPattern } from './lib/render.mjs';
import { appendPatterns, readSeed, seedId } from './lib/seed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SEED = join(ROOT, 'data/seed-patterns.json');
const LABEL = 'new-pattern';

const die = (message) => {
  console.error(message);
  process.exit(1);
};

function gh(args) {
  try {
    return execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    die(
      `gh failed: ${err.stderr?.trim() || err.message}\n` +
        'Is the GitHub CLI installed and authenticated (`gh auth status`)?'
    );
  }
}

const fetchIssues = (numbers) =>
  numbers.length
    ? numbers.map((n) => JSON.parse(gh(['issue', 'view', String(n), '--json', 'number,title,body,author,url'])))
    : JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,title,body,author,url', '--limit', '100']));

async function decodeAll(issues) {
  const entries = [];
  const failures = [];
  for (const issue of issues) {
    try {
      entries.push(...(await patternsFromIssue(issue)));
    } catch (err) {
      // One unreadable issue must not hide the readable ones behind it.
      failures.push(err.message);
    }
  }
  return { entries, failures };
}

const report = (failures) => failures.forEach((f) => console.error(`  ! ${f}`));

async function list() {
  const issues = fetchIssues([]);
  if (issues.length === 0) return console.log(`No open issues labelled \`${LABEL}\`.`);

  const { failures } = await decodeAll(issues);
  for (const issue of issues) {
    const { entries } = await decodeAll([issue]);
    const count = entries.length ? `${entries.length} Pattern${entries.length === 1 ? '' : 's'}` : 'unreadable';
    console.log(`#${issue.number}  ${issue.title}  — ${count}, by ${issue.author?.login ?? 'unknown'}`);
  }
  if (failures.length) {
    console.error('\nCould not decode:');
    report(failures);
  }
}

async function show(numbers) {
  const { entries, failures } = await decodeAll(fetchIssues(numbers));
  report(failures);
  if (entries.length === 0) return die('Nothing to show.');

  const seed = readSeed(SEED);
  entries.forEach((e, i) => {
    if (i) console.log('\n' + '─'.repeat(60) + '\n');
    console.log(renderPattern(e.pattern, { issue: e.issue, author: e.author }));
    const clash = seed.patterns.find(
      (p) => p.name.trim().toLowerCase() === e.pattern.name.trim().toLowerCase()
    );
    if (clash) console.log(`\n  ! "${e.pattern.name}" is already in the shipped library.`);
  });
}

async function accept(numbers, { force, dryRun }) {
  if (numbers.length === 0) die('accept needs at least one issue number.');
  const { entries, failures } = await decodeAll(fetchIssues(numbers));
  report(failures);
  if (failures.length) die('Refusing to append while an issue could not be decoded.');
  if (entries.length === 0) die('Nothing to append.');

  const patterns = entries.map((e) => e.pattern);
  const before = readSeed(SEED).patterns.length;

  if (dryRun) {
    console.log(`Would append ${patterns.length} Pattern(s) to data/seed-patterns.json:\n`);
    patterns.forEach((p, i) => console.log(`  ${seedId(before + i)}  ${p.name}`));
    return;
  }

  const { added, after } = appendPatterns(SEED, patterns, { force });
  console.log(`Appended ${added.length} Pattern(s) — the library goes ${before} → ${after}.\n`);
  added.forEach((a) => console.log(`  ${a.id}  ${a.name}`));
  console.log('\nNow run the gates before committing:\n  npm run validate:seed\n  npm test');
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const numbers = rest.filter((a) => !a.startsWith('--')).map((a) => Number(a.replace('#', '')));
if (numbers.some((n) => !Number.isInteger(n) || n <= 0)) die('Issue numbers must be positive integers.');

const commands = {
  list: () => list(),
  show: () => show(numbers),
  accept: () => accept(numbers, { force: flags.has('--force'), dryRun: flags.has('--dry-run') }),
};

if (!commands[command]) {
  die('Usage: pattern-intake <list|show|accept> [issue…] [--force] [--dry-run]');
}
await commands[command]();
