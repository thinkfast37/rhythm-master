/**
 * Loading a whole spec-kit project and answering questions about it.
 *
 * Kept separate from the CLI so every one of these can be exercised against fixtures:
 * the thing that checks everything else must not be the one unchecked thing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { readSpec, readPlan, readTasks, readSuite } from './parse.mjs';
import { analyse, findingKey } from './analyse.mjs';
import { buildRows, renderMaster } from './matrix.mjs';

/** Read every artefact and run every check. */
export function run(config) {
  const acs = readSpec(join(config.root, config.spec));
  const plan = readPlan(join(config.root, config.plan));
  const tasks = readTasks(join(config.root, config.tasks));
  const suite = readSuite(config.root, config.testDirs);
  return { acs, plan, tasks, suite, ...analyse({ acs, plan, tasks, suite, config }) };
}

export function readBaseline(config) {
  const file = join(config.root, config.baseline);
  if (!existsSync(file)) return new Set();
  return new Set(JSON.parse(readFileSync(file, 'utf8')).accepted ?? []);
}

const BASELINE_NOTE =
  'Traceability findings that pre-date the gate. Reported, but not build-failing. ' +
  'This list may only shrink: `prune-baseline` removes entries that are fixed, and ' +
  'nothing writes new ones. Adding an entry by hand is taking on debt deliberately ' +
  'and needs to be justified in review.';

export function writeBaseline(config, accepted, generated) {
  writeFileSync(
    join(config.root, config.baseline),
    JSON.stringify({ note: BASELINE_NOTE, generated, accepted: [...accepted].sort() }, null, 2) + '\n'
  );
}

/** The master matrix text, and the rows it was built from. */
export function masterMatrix(state, config, baseline) {
  const rows = buildRows({ ...state, baseline, keyOf: findingKey });
  return { rows, text: renderMaster(rows, { generatedFor: config.spec }) };
}

/**
 * T8 — the committed matrix matches what the artefacts currently say.
 * Pushed into the findings so it is baselined, reported and gated like every other check.
 */
export function checkMatrixFreshness(state, config, matrixText) {
  const file = join(config.root, config.matrix);
  if (!existsSync(file)) {
    state.findings.T8.push({ id: config.matrix, why: 'has never been generated' });
  } else if (readFileSync(file, 'utf8') !== matrixText) {
    state.findings.T8.push({
      id: config.matrix,
      why: 'is out of date — regenerate it with `npm run trace:matrix` and review the diff',
    });
  }
}

/**
 * Which criteria a change touches.
 *
 * Three routes, unioned, because a change reaches a criterion in more than one way:
 *
 *   1. a changed TEST file naming the criterion's ID;
 *   2. a changed SOURCE file named by a task that a plan item lists for the criterion;
 *   3. a changed spec, which is handled by the caller passing the spec file through.
 *
 * Route 2 is the one that matters most and the one a diff alone would miss: editing
 * `src/ui/library.js` says nothing about ACs until you go through the tasks that claim it.
 */
export function criteriaTouchedBy(changedFiles, state) {
  const { criteria, tasks, plan, testsFor, acToPlan } = state;
  const touched = new Set();
  const changed = new Set(changedFiles);

  for (const c of criteria) {
    for (const t of testsFor.get(c.id) ?? []) {
      if (changed.has(t.file)) touched.add(c.id);
    }
  }

  const touchedTasks = new Set();
  for (const [tid, task] of tasks) {
    if (task.files.some((f) => changed.has(f))) touchedTasks.add(tid);
  }
  const touchedPlanItems = new Set();
  for (const [pid, item] of plan) {
    if ([...item.impl, ...item.test].some((t) => touchedTasks.has(t))) touchedPlanItems.add(pid);
  }
  for (const c of criteria) {
    if ((acToPlan.get(c.parent) ?? []).some((p) => touchedPlanItems.has(p))) touched.add(c.id);
  }

  return touched;
}

/** Every finding's baseline key, for comparing against the accepted list. */
export function currentKeys(findings) {
  const keys = new Set();
  for (const [check, list] of Object.entries(findings)) {
    for (const f of list) keys.add(findingKey(check, f));
  }
  return keys;
}
