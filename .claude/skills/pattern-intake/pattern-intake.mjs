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
 *   pattern-intake close <issue…>       close a submission that has actually shipped
 *       --dry-run                       print the comment, post nothing
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
import { SUBMISSION_LABEL, mergeSubmissions, isLabelled } from './lib/select.mjs';
import { locateInLibrary, closingComment } from './lib/landed.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SEED = join(ROOT, 'data/seed-patterns.json');
const LABEL = SUBMISSION_LABEL;

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

const FIELDS = 'number,title,body,author,url,labels';

const listIssues = (args) =>
  JSON.parse(gh(['issue', 'list', '--state', 'open', '--json', FIELDS, '--limit', '100', ...args]));

/** Does the repo actually have the label the app's submission URL asks for? */
const labelExists = () =>
  JSON.parse(gh(['label', 'list', '--json', 'name', '--limit', '200'])).some((l) => l.name === LABEL);

/**
 * Every open submission: those carrying the label, plus those whose title says
 * they are one and whose label GitHub dropped (see lib/select.mjs).
 */
function gitOut(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
  } catch (err) {
    return die(`git failed: ${err.stderr?.trim() || err.message}`);
  }
}

const fetchIssues = (numbers) =>
  numbers.length
    ? numbers.map((n) => {
        const issue = JSON.parse(gh(['issue', 'view', String(n), '--json', FIELDS]));
        return { ...issue, unlabelled: !isLabelled(issue) };
      })
    : mergeSubmissions(listIssues(['--label', LABEL]), listIssues([]));

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

/**
 * A repo with no `new-pattern` label silently strips it from every submission
 * (lib/select.mjs), so say so loudly and give the one command that fixes it.
 * Reported whether or not anything was found: the symptom of this misconfiguration
 * is an empty list, which is indistinguishable from nobody having submitted.
 */
function warnIfLabelMissing() {
  if (labelExists()) return;
  console.error(
    `\nThe \`${LABEL}\` label does not exist in this repo, so GitHub is dropping it\n` +
      'from every submission the app prefills. Create it, and future submissions\n' +
      'will label themselves:\n\n' +
      `  gh label create ${LABEL} --description "A Pattern submitted for the shared library (US-13.1)" --color 0e8a16\n`
  );
}

async function list() {
  const issues = fetchIssues([]);
  if (issues.length === 0) {
    console.log(`No open issues labelled \`${LABEL}\`.`);
    return warnIfLabelMissing();
  }

  const { failures } = await decodeAll(issues);
  for (const issue of issues) {
    const { entries } = await decodeAll([issue]);
    const count = entries.length ? `${entries.length} Pattern${entries.length === 1 ? '' : 's'}` : 'unreadable';
    const mark = issue.unlabelled ? '  [unlabelled]' : '';
    console.log(`#${issue.number}  ${issue.title}  — ${count}, by ${issue.author?.login ?? 'unknown'}${mark}`);
  }

  const bare = issues.filter((i) => i.unlabelled);
  if (bare.length) {
    console.error(
      `\nFound by title, not by label — GitHub dropped the \`${LABEL}\` label. Label them so\n` +
        'they stay findable:\n' +
        bare.map((i) => `  gh issue edit ${i.number} --add-label ${LABEL}`).join('\n') +
        '\n'
    );
  }
  if (failures.length) {
    console.error('\nCould not decode:');
    report(failures);
  }
  warnIfLabelMissing();
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

/**
 * The shipped library as it exists on the DEFAULT BRANCH, not in this working tree.
 *
 * `main` is the live site (CLAUDE.md §5), so it is the only thing that answers
 * "has this Pattern shipped". A working tree can hold an accept that was never
 * committed, a branch that never merged, or a change a gate sent back.
 */
function shippedLibrary() {
  const branch = gitOut(['symbolic-ref', 'refs/remotes/origin/HEAD']).replace('refs/remotes/', '') || 'origin/main';
  gitOut(['fetch', '--quiet', 'origin']);
  const raw = gitOut(['show', `${branch}:data/seed-patterns.json`]);
  if (!raw) die(`Could not read data/seed-patterns.json from ${branch}.`);
  return { branch, patterns: JSON.parse(raw).patterns };
}

/**
 * Close a submission, saying which id it shipped as.
 *
 * REFUSES unless every Pattern the issue carries is actually in the shipped
 * library on the default branch. That check is the whole point: this is the only
 * command that speaks to the Contributor, and a "your Pattern is in the library"
 * posted against a change that never landed is a lie nothing would ever correct.
 */
async function close(numbers, { dryRun }) {
  if (numbers.length === 0) die('close needs at least one issue number.');
  const { entries, failures } = await decodeAll(fetchIssues(numbers));
  report(failures);
  if (failures.length) die('Refusing to close while an issue could not be decoded.');
  if (entries.length === 0) die('Nothing to close.');

  const { branch, patterns: shipped } = shippedLibrary();

  for (const number of numbers) {
    const mine = entries.filter((e) => e.issue === number);
    const { found, missing } = locateInLibrary(mine.map((e) => e.pattern), shipped);
    if (missing.length) {
      die(
        `Refusing to close #${number} — not in the shipped library on ${branch}:\n` +
          missing.map((n) => `  ${n}`).join('\n') +
          '\n\nAccept it, land the PR and let the deploy go green first. Closing an issue\n' +
          'for a change that has not shipped tells the Contributor something untrue.'
      );
    }

    const comment = closingComment(found);
    if (dryRun) {
      console.log(`Would comment on #${number} and close it:\n\n${comment}\n`);
      continue;
    }
    gh(['issue', 'comment', String(number), '--body', comment]);
    gh(['issue', 'close', String(number)]);
    console.log(`Closed #${number} — ${found.map((f) => f.id).join(', ')}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const numbers = rest.filter((a) => !a.startsWith('--')).map((a) => Number(a.replace('#', '')));
if (numbers.some((n) => !Number.isInteger(n) || n <= 0)) die('Issue numbers must be positive integers.');

const commands = {
  list: () => list(),
  show: () => show(numbers),
  accept: () => accept(numbers, { force: flags.has('--force'), dryRun: flags.has('--dry-run') }),
  close: () => close(numbers, { dryRun: flags.has('--dry-run') }),
};

if (!commands[command]) {
  die('Usage: pattern-intake <list|show|accept|close> [issue…] [--force] [--dry-run]');
}
await commands[command]();
