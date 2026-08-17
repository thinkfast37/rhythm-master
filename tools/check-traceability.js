#!/usr/bin/env node
/**
 * The traceability gate (Constitution Principle IV, CLAUDE.md §4).
 *
 * `coverage:ac` proved an AC ID had been *typed* into a test file. It could not tell
 * whether the test had anything to do with the AC, so US-2.2's pitch strip and
 * US-11.1/US-11.2's duplicate and Family views both read 100% covered while unbuilt.
 * This gate checks the chain the spec actually promises:
 *
 *     AC (or one of its Cases)  →  plan item  →  implementation task + test task
 *                              →  a test whose name matches the criterion it proves
 *
 * Seven checks, each independently reported so a failure names its own cause:
 *
 *   T1  Every AC traces to a numbered plan item in plan.md's Traceability Matrix.
 *   T2  Every plan item has at least one implementation task AND one test task.
 *   T3  Every file path named by a task exists.
 *   T4  A compound AC declares explicit Cases; a simple one needs none.
 *   T5  Every AC or Case has a test whose NAME matches its title.
 *   T6  A UI-level criterion has a test that can reach the DOM.
 *   T7  No test names an AC or Case ID the spec does not declare.
 *
 * Usage:
 *   node tools/check-traceability.js           # human-readable report
 *   node tools/check-traceability.js --json    # machine-readable
 *   node tools/check-traceability.js --summary # one line per check
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = join(ROOT, 'specs/001-rhythm-master-mvp/spec.md');
const PLAN = join(ROOT, 'specs/001-rhythm-master-mvp/plan.md');
const TASKS = join(ROOT, 'specs/001-rhythm-master-mvp/tasks.md');
const TEST_DIRS = [join(ROOT, 'tests/unit'), join(ROOT, 'tests/e2e')];

/** A criterion ID is an AC, optionally narrowed to one of its Cases: AC-1.2.2/7 */
const CRITERION_ID = /AC-\d+\.\d+\.\d+(?:\/\d+)?/g;

/**
 * A test's name MUST be its criterion's own title, verbatim:
 *
 *     it('AC-1.1.9 — Measure removal is always from the end', …)
 *
 * Not a paraphrase. Judging a paraphrase needs a similarity threshold, and a threshold
 * has a grey band where a correct test is flagged and a wrong one is let through — which
 * is how AC-11.1.5's "findDuplicates never reports a Pattern against itself" passed for a
 * criterion about a deletion dialog. Verbatim is mechanical, has no grey band, and makes
 * the spec's wording travel into the suite: rewording an AC then fails the gate until
 * someone opens the test and confirms it still proves the new wording.
 *
 * A criterion may have several tests. Each appends its own qualifier after the title:
 *
 *     it('AC-1.1.9 — Measure removal is always from the end: from six down to one', …)
 *
 * The similarity score below is used only to sort findings, never to pass one: a test
 * whose name shares nothing with its criterion is proving something else and is reported
 * ahead of one that has merely drifted in wording.
 */
const MISMATCH_THRESHOLD = 0.34;

/**
 * Vocabulary that makes a criterion UI-level: it can only be proved by something that
 * can see a rendered document. `src/core/` is pure by construction (CLAUDE.md §6), so a
 * `tests/unit/core/` test cannot possibly satisfy one of these, whatever it is named.
 */
const UI_VOCABULARY = [
  'button', 'control', 'picker', 'menu', 'dropdown', 'dialog', 'prompt', 'panel',
  'view', 'screen', 'viewport', 'strip', 'toggle', 'field', 'link', 'pill', 'row',
  'tap', 'taps', 'tapped', 'click', 'clicks', 'drag', 'scroll', 'scrolls',
  'shown', 'shows', 'show', 'displayed', 'displays', 'visible', 'hidden', 'render',
  'renders', 'rendered', 'disabled', 'enabled', 'greyed', 'grayed', 'highlight',
  'highlighted', 'dimmed', 'px', 'looks', 'sees', 'onscreen', 'on-screen',
];

/** Test directories whose tests can reach a rendered DOM. */
const DOM_CAPABLE = ['tests/e2e/', 'tests/unit/ui/'];

const STOPWORDS = new Set(
  ('a an the is are was were be been being and or of to in on for with that it its by as at ' +
   'from not no this than then when given but each every only into over under any all ' +
   'does doing done have has had will would can could may might must shall should ' +
   'there here what which who whom whose how why where more most less least same other ' +
   'itself again still just also both either neither')
    .split(' ')
);

/**
 * Vocabulary this project uses interchangeably. Without these, a test that says "meter"
 * for the spec's "Time Signature" scores as a total mismatch, and a gate that flags
 * correct tests is a gate that gets switched off.
 */
const SYNONYMS = [
  ['meter', 'time', 'signature', 'timesignature'],
  ['tap', 'click', 'press', 'taps', 'clicks'],
  ['slot', 'slots'],
  ['add', 'added', 'adding', 'append', 'appended', 'appending'],
  ['remove', 'removed', 'removal', 'delete', 'deleted', 'deletion', 'drop', 'drops'],
  ['prior', 'preceding', 'previous', 'last', 'earlier'],
  ['default', 'defaults', 'defaulted'],
  ['show', 'shows', 'shown', 'display', 'displays', 'displayed', 'visible', 'render'],
  ['hidden', 'absent', 'gone', 'none'],
  ['change', 'changes', 'changed', 'changing', 'switch', 'switches', 'switching', 'set'],
  ['reset', 'resets', 'clears', 'cleared', 'clear'],
  ['compute', 'computed', 'recompute', 'recomputed', 'derived', 'derive'],
  ['keep', 'keeps', 'kept', 'retain', 'retains', 'survive', 'survives', 'preserved'],
  ['pattern', 'patterns'],
  ['measure', 'measures'],
  ['beat', 'beats'],
  ['recipe', 'recipes'],
  ['pitch', 'pitches', 'pitched'],
  ['tag', 'tags', 'tagged'],
  ['disabled', 'refused', 'rejected', 'blocked', 'capped', 'cap'],
];

/** Words collapsed onto a single canonical token, so synonyms score as matches. */
const CANONICAL = new Map();
for (const group of SYNONYMS) for (const w of group) CANONICAL.set(w, group[0]);

/** Crude suffix stripping — enough to make "inherits"/"inherit" the same word. */
function stem(word) {
  if (CANONICAL.has(word)) return CANONICAL.get(word);
  let w = word;
  for (const suffix of ['ically', 'ingly', 'edly', 'ing', 'ies', 'ied', 'es', 'ed', 's']) {
    if (w.length - suffix.length >= 4 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return CANONICAL.get(w) ?? w;
}

/** Significant, stemmed words of a title, for overlap scoring. */
function significantWords(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/ac-\d+\.\d+\.\d+(\/\d+)?/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem)
  );
}

function share(a, b) {
  if (a.size === 0) return 1;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / a.size;
}

/**
 * Bidirectional: a terse AC title ("Default Key") against a longer test name should not
 * be penalised for the test saying more, and vice versa. What we are detecting is two
 * sentences with nothing in common, which stays near zero in both directions.
 */
function overlap(criterionTitle, testTitle) {
  const want = significantWords(criterionTitle);
  const got = significantWords(testTitle);
  return Math.max(share(want, got), share(got, want));
}

// ---------------------------------------------------------------------------
// spec.md — criteria, their titles, their bodies, and their declared Cases
// ---------------------------------------------------------------------------

/**
 * @returns {Map<string, {title: string, body: string[], cases: Map<string,string>}>}
 *   keyed by AC ID, in document order.
 */
function readSpec() {
  if (!existsSync(SPEC)) fail(`spec not found at ${SPEC}`);
  const acs = new Map();
  let current = null;
  let inCases = false;

  for (const line of readFileSync(SPEC, 'utf8').split('\n')) {
    const declaration = line.match(/^- \*\*(AC-\d+\.\d+\.\d+)\*\*\s*(?:—\s*(.*))?$/);
    if (declaration) {
      const [, id, title] = declaration;
      current = acs.get(id) ?? { title: (title ?? '').trim(), body: [], cases: new Map() };
      acs.set(id, current);
      inCases = false;
      continue;
    }
    if (!current) continue;

    // A new AC, FR, SC, or any heading closes the block.
    if (/^- \*\*(FR|SC|NFR)-/.test(line) || /^#{2,4} /.test(line)) {
      current = null;
      inCases = false;
      continue;
    }

    if (/^\s*- \*\*Cases\*\*:/.test(line)) {
      inCases = true;
      continue;
    }
    if (inCases) {
      const c = line.match(/^\s+- \*\*(AC-\d+\.\d+\.\d+\/\d+)\*\*\s*—\s*(.+)$/);
      if (c) {
        current.cases.set(c[1], c[2].trim());
        continue;
      }
      if (line.trim() !== '') inCases = false;
    }
    current.body.push(line);
  }
  return acs;
}

/**
 * How many separate assertions an AC makes. A criterion with more than one is compound
 * and must name its Cases, so that "one criterion, one test" stays a real statement
 * rather than one test standing in for twelve rows of a table.
 */
function assertionCount(body) {
  let clauses = 0;
  let tableRows = 0;
  for (const line of body) {
    if (/^\s*- \*\*(Then|And)\*\*/.test(line)) clauses++;
    // A table data row — not the header separator, not the header itself.
    if (/^\s*\|/.test(line) && !/^\s*\|[\s\-:|]+\|\s*$/.test(line)) tableRows++;
  }
  // The header row is structure, not an assertion.
  if (tableRows > 0) tableRows -= 1;
  return Math.max(1, clauses + tableRows);
}

function isUiLevel(title, body) {
  const text = (title + ' ' + body.join(' ')).toLowerCase();
  return UI_VOCABULARY.some((w) => new RegExp(`\\b${w}\\b`).test(text));
}

// ---------------------------------------------------------------------------
// plan.md — the Traceability Matrix
// ---------------------------------------------------------------------------

/** Expand `AC-1.2.1–AC-1.2.4` (or a hyphen) into every ID in the run. */
function expandRange(text) {
  const ids = new Set();
  const range = /AC-(\d+)\.(\d+)\.(\d+)\s*[–—-]\s*AC-(\d+)\.(\d+)\.(\d+)/g;
  let consumed = text;
  for (const m of text.matchAll(range)) {
    const [, e1, s1, n1, e2, s2, n2] = m;
    if (e1 === e2 && s1 === s2) {
      for (let n = Number(n1); n <= Number(n2); n++) ids.add(`AC-${e1}.${s1}.${n}`);
    }
    consumed = consumed.replace(m[0], ' ');
  }
  for (const m of consumed.matchAll(/AC-\d+\.\d+\.\d+/g)) ids.add(m[0]);
  return ids;
}

/** @returns {Map<string, {title:string, acs:Set<string>, impl:string[], test:string[]}>} */
function readPlan() {
  if (!existsSync(PLAN)) fail(`plan not found at ${PLAN}`);
  const items = new Map();
  for (const line of readFileSync(PLAN, 'utf8').split('\n')) {
    // | **P-003** | US-16.1 — … | AC-16.1.1–AC-16.1.11 | T032 | T033 |
    const m = line.match(/^\|\s*\*\*(P-\d+)\*\*\s*\|(.*)$/);
    if (!m) continue;
    const cells = m[2].split('|').map((c) => c.trim());
    const [title = '', acCell = '', implCell = '', testCell = ''] = cells;
    items.set(m[1], {
      title,
      acs: expandRange(acCell),
      impl: [...implCell.matchAll(/T\d+/g)].map((t) => t[0]),
      test: [...testCell.matchAll(/T\d+/g)].map((t) => t[0]),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// tasks.md
// ---------------------------------------------------------------------------

/** @returns {Map<string, {done:boolean, text:string, files:string[]}>} */
function readTasks() {
  if (!existsSync(TASKS)) fail(`tasks not found at ${TASKS}`);
  const tasks = new Map();
  for (const line of readFileSync(TASKS, 'utf8').split('\n')) {
    const m = line.match(/^- \[([ xX])\]\s*(T\d+)\s*(.*)$/);
    if (!m) continue;
    const files = [...m[3].matchAll(/`([^`]+\.(?:js|json|css|md|html|yml))`/g)]
      .map((f) => f[1])
      // A path with an ellipsis is prose shorthand, not a path.
      .filter((f) => f.includes('/') && !f.includes('...'));
    tasks.set(m[2], { done: m[1] !== ' ', text: m[3], files });
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// the suite
// ---------------------------------------------------------------------------

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(test|spec)\.js$/.test(entry) ? [full] : [];
  });
}

/**
 * Every test name in the suite, with the file it lives in.
 * @returns {{titles: Array<{id:string,title:string,file:string}>, mentions: Map<string,string[]>}}
 *   `titles` is what a criterion is judged against; `mentions` is every ID appearing
 *   anywhere in a test file, which is all the old gate ever looked at.
 */
function readSuite() {
  const titles = [];
  const mentions = new Map();
  for (const dir of TEST_DIRS) {
    for (const file of walk(dir)) {
      const rel = file.slice(ROOT.length + 1);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(CRITERION_ID)) {
        if (!mentions.has(m[0])) mentions.set(m[0], []);
        if (!mentions.get(m[0]).includes(rel)) mentions.get(m[0]).push(rel);
      }
      // The closing delimiter is whichever one opened the string — a name may legitimately
      // contain the other two, as AC-3.1.4's does ('… the "&" is Medium …'). Matching on
      // "any quote" truncated that name to "the ", which then failed the title check for
      // a reason that had nothing to do with the test.
      const call = /\b(?:it|test)\s*(?:\.\w+)?\s*\(\s*(`|'|")((?:\\.|(?!\1)[^\\])*)\1/g;
      for (const m of src.matchAll(call)) {
        const title = m[2];
        for (const id of title.matchAll(CRITERION_ID)) {
          titles.push({ id: id[0], title, file: rel });
        }
      }
    }
  }
  return { titles, mentions };
}

function fail(message) {
  console.error(`check-traceability: ${message}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// the checks
// ---------------------------------------------------------------------------

const acs = readSpec();
const plan = readPlan();
const tasks = readTasks();
const { titles, mentions } = readSuite();

const testsFor = new Map();
for (const t of titles) {
  if (!testsFor.has(t.id)) testsFor.set(t.id, []);
  testsFor.get(t.id).push(t);
}

/** Every criterion the suite must prove: a simple AC, or each Case of a compound one. */
const criteria = [];
for (const [id, ac] of acs) {
  if (ac.cases.size > 0) {
    for (const [caseId, caseTitle] of ac.cases) {
      criteria.push({ id: caseId, title: caseTitle, parent: id, ui: isUiLevel(caseTitle, ac.body) });
    }
  } else {
    criteria.push({ id, title: ac.title, parent: id, ui: isUiLevel(ac.title, ac.body) });
  }
}

const findings = { T1: [], T2: [], T3: [], T4: [], T5: [], T6: [], T7: [] };

// T1 — every AC traces to a plan item.
const acToPlan = new Map();
for (const [pid, item] of plan) {
  for (const acId of item.acs) {
    if (!acToPlan.has(acId)) acToPlan.set(acId, []);
    acToPlan.get(acId).push(pid);
  }
}
for (const id of acs.keys()) {
  if (!acToPlan.has(id)) findings.T1.push({ id, why: 'no plan item in plan.md claims this AC' });
}

// T2 — every plan item carries both kinds of task.
for (const [pid, item] of plan) {
  const missing = [];
  if (item.impl.length === 0) missing.push('implementation');
  // An item carrying no AC is infrastructure — tooling, config, the deploy workflow.
  // It asserts no behaviour, so demanding a test task of it would only invite a
  // test written to satisfy the gate, which is the failure this gate exists to stop.
  if (item.test.length === 0 && item.acs.size > 0) missing.push('test');
  const unknown = [...item.impl, ...item.test].filter((t) => !tasks.has(t));
  if (missing.length) findings.T2.push({ id: pid, why: `no ${missing.join(' and ')} task`, title: item.title });
  for (const t of unknown) findings.T2.push({ id: pid, why: `names ${t}, which is not a task in tasks.md`, title: item.title });
}

// T3 — a COMPLETED task's named files exist.
//
// Only completed tasks: a finished task naming a file that does not exist is a false
// record — the thing it claims to have written was never written, or was written
// somewhere else and the log never caught up. An *open* task naming a missing file is
// ordinary: the file is the work, or the task is about the file's absence. Checking open
// tasks would flag the burn-down tasks for this very finding, which would push whoever
// wrote them toward wording the path so the gate cannot see it.
for (const [tid, task] of tasks) {
  if (!task.done) continue;
  for (const f of task.files) {
    if (!existsSync(join(ROOT, f))) {
      findings.T3.push({ id: tid, why: `names \`${f}\`, which does not exist` });
    }
  }
}

// T4 — a compound AC declares its Cases.
for (const [id, ac] of acs) {
  const n = assertionCount(ac.body);
  if (n > 1 && ac.cases.size === 0) {
    findings.T4.push({ id, why: `makes ${n} assertions but declares no Cases`, title: ac.title });
  } else if (ac.cases.size > 0 && ac.cases.size < n) {
    findings.T4.push({
      id,
      why: `makes ${n} assertions but declares only ${ac.cases.size} Cases`,
      title: ac.title,
    });
  }
}

/** Normalise for verbatim comparison: curly quotes, dashes, and runs of whitespace. */
function normalise(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The part of a test name after `AC-x.y.z — `, with any trailing qualifier removed. */
function claimedTitle(testTitle, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const stripped = testTitle.replace(new RegExp(`^\\s*${escaped}\\s*[—–:-]?\\s*`), '');
  return normalise(stripped);
}

// T5 — a test named for the criterion, in the criterion's own words.
for (const c of criteria) {
  const found = testsFor.get(c.id) ?? [];
  if (found.length === 0) {
    findings.T5.push({ id: c.id, kind: 'untested', why: 'no test names this criterion', title: c.title });
    continue;
  }
  const want = normalise(c.title);
  const literal = want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = (t) => {
    const claimed = claimedTitle(t.title, c.id);
    // Exact, or the title followed by a qualifier introduced by ':' or a dash.
    return claimed === want || new RegExp(`^${literal}\\s*[:\\-]`).test(claimed);
  };

  // EVERY test naming this criterion must be named for it — not merely one of them.
  // Requiring only one leaves a criterion with several tests able to have one of them
  // quietly repurposed to prove something else while the criterion still reads as
  // covered, which is this gate's entire subject.
  const offenders = found.filter((t) => !matches(t));
  if (offenders.length === 0) continue;

  let best = 0;
  let bestTitle = '';
  for (const t of offenders) {
    const score = overlap(c.title, t.title);
    if (score >= best) {
      best = score;
      bestTitle = `${t.title}  [${t.file}]`;
    }
  }
  findings.T5.push({
    id: c.id,
    kind: best < MISMATCH_THRESHOLD ? 'mismatched' : 'reworded',
    score: best,
    why:
      best < MISMATCH_THRESHOLD
        ? `is proved by a test about something else (${(best * 100).toFixed(0)}% in common)`
        : `has a test, but its name is a paraphrase rather than the criterion (${(best * 100).toFixed(0)}% in common)`,
    title: c.title,
    got: bestTitle,
  });
}
// Worst first: a test proving the wrong thing outranks one that is merely misnamed.
const RANK = { untested: 0, mismatched: 1, reworded: 2 };
findings.T5.sort((a, b) => RANK[a.kind] - RANK[b.kind] || (a.score ?? 0) - (b.score ?? 0));

// T6 — a UI-level criterion needs a test that can reach the DOM.
for (const c of criteria) {
  if (!c.ui) continue;
  const found = testsFor.get(c.id) ?? [];
  if (found.length === 0) continue; // already reported by T5
  const reachable = found.some((t) => DOM_CAPABLE.some((d) => t.file.startsWith(d)));
  if (!reachable) {
    findings.T6.push({
      id: c.id,
      why: 'is UI-level but every test for it is a pure unit test',
      title: c.title,
      got: found.map((t) => t.file).join(', '),
    });
  }
}

// T7 — no test names an ID the spec does not declare.
const declared = new Set(criteria.map((c) => c.id));
for (const id of acs.keys()) declared.add(id);
for (const id of mentions.keys()) {
  if (!declared.has(id)) {
    findings.T7.push({ id, why: `is named by ${mentions.get(id).join(', ')} but the spec declares no such criterion` });
  }
}

// ---------------------------------------------------------------------------
// baseline
//
// This gate was added to a codebase that already had ~300 findings, and a gate that is
// permanently red gates nothing — every future change would be red whatever it did, so
// nobody would read it. The baseline is the debt that existed the day the gate landed.
// A finding in it is reported but does not fail the build; anything else does.
//
// The baseline can only SHRINK. There is no flag that adds to it: `--prune-baseline`
// removes entries that are no longer findings, and nothing else writes the file. Taking
// on new debt therefore means hand-editing a checked-in file, which shows up in a diff
// and has to be justified — which is the whole point.
// ---------------------------------------------------------------------------

const BASELINE = join(ROOT, 'specs/001-rhythm-master-mvp/traceability-baseline.json');

/**
 * A finding's stable identity: which check, and which criterion or task.
 *
 * T2 and T3 can raise several findings against one id (a task naming two missing files,
 * a plan item missing both kinds of task), so they carry a discriminator.
 *
 * T5 carries its severity, so that a criterion accepted as merely misnamed cannot quietly
 * decay into one whose test proves something else: that is a different key, so it is a new
 * finding and it fails. It deliberately does NOT carry `why`, which quotes a similarity
 * percentage that moves whenever a test is edited — a baseline entry that drifts every
 * commit excuses nothing.
 */
const key = (check, f) => {
  if (check === 'T2' || check === 'T3') return `${check} ${f.id} ${f.why}`;
  if (check === 'T5') return `${check} ${f.id} ${f.kind}`;
  return `${check} ${f.id}`;
};

function readBaseline() {
  if (!existsSync(BASELINE)) return new Set();
  const parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));
  return new Set(parsed.accepted ?? []);
}

const baseline = readBaseline();
const current = new Set();
for (const [check, list] of Object.entries(findings)) {
  for (const f of list) current.add(key(check, f));
}

/** Findings the baseline does not excuse — these fail the build. */
const regressions = [];
for (const [check, list] of Object.entries(findings)) {
  for (const f of list) {
    if (!baseline.has(key(check, f))) regressions.push({ check, ...f });
  }
}

/** Baseline entries that are no longer findings — the debt that has been paid off. */
const fixed = [...baseline].filter((k) => !current.has(k));

if (process.argv.includes('--prune-baseline')) {
  const remaining = [...baseline].filter((k) => current.has(k)).sort();
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        note:
          'Traceability findings that pre-date the gate (CLAUDE.md §2b). Reported, but ' +
          'not build-failing. This list may only shrink: `--prune-baseline` removes ' +
          'entries that are fixed, and nothing writes new ones. Adding an entry by hand ' +
          'is taking on debt deliberately and needs to be justified in review.',
        generated: '2026-08-17',
        accepted: remaining,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Baseline pruned: ${baseline.size} → ${remaining.length} (${fixed.length} fixed).`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const CHECKS = {
  T1: 'Every AC traces to a numbered plan item',
  T2: 'Every plan item has an implementation task and a test task',
  T3: 'Every file a task names exists',
  T4: 'Every compound AC declares its Cases',
  T5: 'Every criterion has a test whose name matches it',
  T6: 'Every UI-level criterion has a test that can reach the DOM',
  T7: 'No test names a criterion the spec does not declare',
};

const failed = regressions.length > 0 || fixed.length > 0;

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      { criteria: criteria.length, acs: acs.size, findings, regressions, fixed, baseline: baseline.size },
      null,
      2
    )
  );
} else if (process.argv.includes('--summary')) {
  for (const [checkId, label] of Object.entries(CHECKS)) {
    const all = findings[checkId].length;
    const nu = findings[checkId].filter((f) => !baseline.has(key(checkId, f))).length;
    let detail = all ? ` — ${all} finding(s), ${nu} not in baseline` : '';
    if (checkId === 'T5' && all) {
      const by = { untested: 0, mismatched: 0, reworded: 0 };
      for (const f of findings.T5) by[f.kind]++;
      detail += ` (${by.untested} untested, ${by.mismatched} proving something else, ${by.reworded} misnamed)`;
    }
    console.log(`${nu === 0 ? 'PASS' : 'FAIL'}  ${checkId}  ${label}${detail}`);
  }
  console.log(
    `\n${regressions.length === 0 ? 'PASS' : 'FAIL'}  Overall — ` +
      `${baseline.size} accepted (CLAUDE.md §2b), ${regressions.length} new, ${fixed.length} fixed but still listed.`
  );
} else {
  console.log(`Traceability: ${acs.size} ACs, ${criteria.length} criteria, ${plan.size} plan items, ${tasks.size} tasks.\n`);
  for (const [checkId, label] of Object.entries(CHECKS)) {
    const list = findings[checkId].filter((f) => !baseline.has(key(checkId, f)));
    const accepted = findings[checkId].length - list.length;
    if (list.length === 0) {
      console.log(`PASS  ${checkId}  ${label}${accepted ? ` (${accepted} accepted)` : ''}`);
      continue;
    }
    console.log(`FAIL  ${checkId}  ${label} — ${list.length} new finding(s)${accepted ? `, ${accepted} accepted` : ''}`);
    let kind = null;
    for (const f of list) {
      // T5 is sorted worst-first; label the bands so the urgent ones are not read as
      // clerical. A test proving the wrong thing is unbuilt work; a misnamed one is not.
      if (f.kind && f.kind !== kind) {
        kind = f.kind;
        const banner = {
          untested: 'no test at all',
          mismatched: 'a test exists but proves something else — treat as UNBUILT',
          reworded: 'the right test, named in its own words rather than the spec\'s',
        }[kind];
        console.log(`\n      ── ${banner} ──`);
      }
      console.log(`        ${f.id} ${f.why}`);
      if (f.title) console.log(`           spec: ${f.title}`);
      if (f.got) console.log(`           test: ${f.got}`);
    }
    console.log('');
  }
  console.log(
    `Baseline: ${baseline.size} finding(s) accepted as pre-existing debt (CLAUDE.md §2b).`
  );

  if (fixed.length) {
    console.log(
      `\n${fixed.length} baseline entr(ies) are no longer findings. Run\n` +
        '  npm run check:trace -- --prune-baseline\n' +
        'to strike them off, so the baseline keeps shrinking and cannot hide a later regression:'
    );
    for (const k of fixed.slice(0, 20)) console.log(`        ${k}`);
    if (fixed.length > 20) console.log(`        … and ${fixed.length - 20} more`);
  }

  if (regressions.length) {
    console.log(
      '\nA finding is unbuilt or unproven work, not a formatting complaint.\n' +
        'Fix the code or the spec — never rename a test, or weaken one, to satisfy\n' +
        'the gate (Constitution Principle IV, CLAUDE.md §2a and §2b).'
    );
  } else if (!failed) {
    console.log('\nNo new traceability findings.');
  }
}

process.exit(failed ? 1 : 0);
