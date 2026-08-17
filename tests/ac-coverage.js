#!/usr/bin/env node
/**
 * Per-AC coverage reporter (FR-014, Constitution Principle IV).
 *
 * Reads every Acceptance Criterion ID out of spec.md, reads every test name out of
 * the Vitest and Playwright suites, and reports any AC with no test referencing it.
 * Exits non-zero on a gap, so "every AC has a test" is enforced rather than claimed.
 *
 * Test names must contain their AC ID, e.g.
 *   it('AC-1.3.4 — quarter-note Recipe menu offers exactly five Recipes', ...)
 * A single test may cover several ACs by naming each one.
 *
 * Usage:
 *   node tests/ac-coverage.js            # scan test SOURCE files (no run required)
 *   node tests/ac-coverage.js --json     # machine-readable summary
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = join(ROOT, 'specs/001-rhythm-master-mvp/spec.md');
const TEST_DIRS = [join(ROOT, 'tests/unit'), join(ROOT, 'tests/e2e')];

const AC_ID = /AC-\d+\.\d+\.\d+/g;

/** Every AC ID declared in the spec, in document order, de-duplicated. */
function specAcIds() {
  if (!existsSync(SPEC)) {
    console.error(`ac-coverage: spec not found at ${SPEC}`);
    process.exit(2);
  }
  const ids = [];
  const seen = new Set();
  for (const line of readFileSync(SPEC, 'utf8').split('\n')) {
    // Only headings declare an AC; prose and cross-references merely cite one.
    const m = line.match(/^- \*\*(AC-\d+\.\d+\.\d+)\*\*/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return ids;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(test|spec)\.js$/.test(entry) ? [full] : [];
  });
}

/** Map of AC ID -> [test files referencing it]. */
function coveredAcIds() {
  const covered = new Map();
  for (const dir of TEST_DIRS) {
    for (const file of walk(dir)) {
      const src = readFileSync(file, 'utf8');
      for (const id of src.match(AC_ID) ?? []) {
        if (!covered.has(id)) covered.set(id, []);
        const list = covered.get(id);
        const rel = file.slice(ROOT.length + 1);
        if (!list.includes(rel)) list.push(rel);
      }
    }
  }
  return covered;
}

const declared = specAcIds();
const covered = coveredAcIds();
const uncovered = declared.filter((id) => !covered.has(id));
const orphans = [...covered.keys()].filter((id) => !declared.includes(id));

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      { total: declared.length, covered: declared.length - uncovered.length, uncovered, orphans },
      null,
      2
    )
  );
} else {
  const done = declared.length - uncovered.length;
  const pct = declared.length ? ((done / declared.length) * 100).toFixed(1) : '0.0';
  console.log(`AC coverage: ${done}/${declared.length} (${pct}%)`);

  if (orphans.length) {
    console.log(`\nTests reference ${orphans.length} AC ID(s) not declared in the spec:`);
    for (const id of orphans) console.log(`  ? ${id}  (${covered.get(id).join(', ')})`);
    console.log('  A renumbered or retired AC leaves its tests behind — see Principle IV.');
  }

  if (uncovered.length) {
    console.log(`\n${uncovered.length} AC(s) have no test:`);
    // Group by story so the output points at a phase of tasks.md, not a flat wall of IDs.
    const byStory = new Map();
    for (const id of uncovered) {
      const story = id.replace(/^AC-(\d+\.\d+)\.\d+$/, 'US-$1');
      if (!byStory.has(story)) byStory.set(story, []);
      byStory.get(story).push(id);
    }
    for (const [story, ids] of byStory) {
      console.log(`  ${story}: ${ids.join(', ')}`);
    }
  } else {
    console.log('\nEvery Acceptance Criterion is covered by at least one test.');
  }
}

// Orphans are a warning, not a failure: they surface stale IDs without blocking work.
process.exit(uncovered.length ? 1 : 0);
