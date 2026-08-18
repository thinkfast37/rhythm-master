#!/usr/bin/env node
/**
 * Reachability gate: every export in `src/` must be used by something in `src/`.
 *
 * This exists because of a specific failure the other gates could not see.
 * `removeMeasure` was specified (AC-1.1.8, AC-1.1.9), written, exported from
 * `core/pattern.js`, unit-tested, and called by nothing outside `core/` for the
 * entire life of the project. Two Acceptance Criteria described a −Measure control
 * that did not exist, and every gate stayed green:
 *
 *   - `coverage:ac` saw an AC ID in a test name and was satisfied.
 *   - `lint` guards the direction `core/` must not import; it never asks whether
 *     anything imports back.
 *   - `check:trace` T6 *did* flag it — and the finding went into the baseline.
 *
 * The rule here is deliberately narrow, because a noisy gate gets switched off:
 * an export is a finding only when **nothing anywhere in `src/` mentions it**.
 * A helper used by its own module, or by one other module, is wired — this is not
 * a dead-code detector and does not care how deep the call sits. It only catches
 * the one shape that matters: code the application literally cannot reach.
 *
 * Tests are not uses. An export whose only consumer is a test is exactly the
 * shape being hunted, so `tests/` is not scanned. Genuine test seams belong in
 * the baseline, named and reasoned, where they can be argued with.
 *
 * Usage:
 *   node tools/check-unwired.mjs                 # check; non-zero exit on a new finding
 *   node tools/check-unwired.mjs --prune         # strike fixed entries off the baseline
 *   node tools/check-unwired.mjs --json          # machine-readable
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = 'src';
const BASELINE = 'tools/unwired-baseline.json';

/** Every `.js` file under a directory, depth-first. */
export function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

const EXPORT = /^export\s+(?:async\s+)?(?:function|const|class|let)\s+([A-Za-z_]\w*)/gm;

/** The names a module exports, as declarations. Re-exports are not declarations. */
export function exportsOf(text) {
  return [...text.matchAll(EXPORT)].map((m) => m[1]);
}

/**
 * Is `name` mentioned anywhere in `text`, other than on the line that declares it?
 *
 * Line-based rather than AST-based on purpose: this has to be right about
 * "mentioned at all", not about scope. Over-counting a use makes the gate quieter
 * and can only produce a false PASS on a name that genuinely appears somewhere —
 * which is a far cheaper mistake than a false FAIL that gets the gate disabled.
 */
export function mentionsBesidesDeclaration(text, name) {
  const word = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const decl = new RegExp(`^\\s*export\\s+(?:async\\s+)?(?:function|const|class|let)\\s+${name}\\b`);
  return text.split('\n').some((line) => !decl.test(line) && word.test(line));
}

/** Every export in `files` that nothing in `files` mentions. */
export function findUnwired(files) {
  const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
  const findings = [];
  for (const [file, text] of texts) {
    for (const name of exportsOf(text)) {
      const used = [...texts].some(([, t]) => mentionsBesidesDeclaration(t, name));
      if (!used) findings.push({ name, file: relative('.', file), key: `${relative('.', file)} ${name}` });
    }
  }
  return findings.sort((a, b) => a.key.localeCompare(b.key));
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {
    return { note: '', accepted: {} };
  }
}

function main() {
  const argv = process.argv.slice(2);
  const findings = findUnwired(jsFiles(SRC));
  const baseline = loadBaseline();
  const accepted = baseline.accepted ?? {};

  const fresh = findings.filter((f) => !(f.key in accepted));
  const stale = Object.keys(accepted).filter((k) => !findings.some((f) => f.key === k));

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ findings, fresh, stale }, null, 2));
    process.exit(fresh.length ? 1 : 0);
  }

  if (argv.includes('--prune')) {
    for (const k of stale) delete accepted[k];
    writeFileSync(BASELINE, JSON.stringify({ ...baseline, accepted }, null, 2) + '\n');
    console.log(`Baseline pruned: ${stale.length} struck off, ${Object.keys(accepted).length} remain.`);
    process.exit(0);
  }

  console.log(`Reachability: ${findings.length} unwired export(s), ${Object.keys(accepted).length} accepted.\n`);

  if (fresh.length) {
    console.log(`FAIL  ${fresh.length} export(s) nothing in src/ can reach:\n`);
    for (const f of fresh) console.log(`        ${f.name}  (${f.file})`);
    console.log(
      '\n      Either wire it up, delete it, or — if it is a genuine test seam —\n' +
        `      add "${fresh[0].key}" to ${BASELINE} with a written reason.\n`
    );
  } else {
    console.log('PASS  Every export outside the baseline is reachable from src/.\n');
  }

  if (stale.length) {
    console.log(`${stale.length} baseline entr(ies) are no longer findings. Run`);
    console.log('  npm run check:unwired -- --prune');
    console.log('to strike them off, so the baseline keeps shrinking:');
    for (const k of stale) console.log(`        ${k}`);
    console.log();
  }

  process.exit(fresh.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
