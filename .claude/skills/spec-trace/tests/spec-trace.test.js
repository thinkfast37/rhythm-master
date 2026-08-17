/**
 * Self-tests for spec-trace.
 *
 * The tool's whole job is to stop a requirement being reported as proven when it is not.
 * Left untested it would be the one unchecked thing in a repository that checks
 * everything else — and a false PASS here is invisible by construction, because a gate
 * that never fires looks exactly like a gate with nothing to find.
 *
 * Each case takes the `good` fixture — a miniature spec-kit project in which every rule
 * holds — introduces exactly one defect, and asserts both that the intended check fires
 * and that no other check does. The second half matters as much as the first: a checker
 * that flags everything gets switched off.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULTS } from '../lib/config.mjs';
import { run, masterMatrix, checkMatrixFreshness, criteriaTouchedBy } from '../lib/project.mjs';
import { assertionCount, claimedTitle, normalise, findingKey, buildCriteria } from '../lib/analyse.mjs';
import { expandRange, readSpec } from '../lib/parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOOD = join(HERE, 'fixtures/good');

let root;

/** A throwaway copy of the good fixture, so a case can damage it freely. */
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spec-trace-'));
  cpSync(GOOD, root, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const config = () => ({
  ...DEFAULTS,
  root,
  spec: 'specs/spec.md',
  plan: 'specs/plan.md',
  tasks: 'specs/tasks.md',
  matrix: 'specs/traceability-matrix.md',
  baseline: 'specs/traceability-baseline.json',
});

/** Run every check, including the matrix-freshness one, with the matrix up to date. */
function checkAll({ freshMatrix = true } = {}) {
  const cfg = config();
  const state = run(cfg);
  const { text, rows } = masterMatrix(state, cfg, new Set());
  if (freshMatrix) writeFileSync(join(root, cfg.matrix), text);
  checkMatrixFreshness(state, cfg, text);
  return { state, findings: state.findings, rows, text, cfg };
}

/** Which checks fired, as a sorted list of ids — the shape every case asserts on. */
const fired = (findings) =>
  Object.entries(findings)
    .filter(([, list]) => list.length > 0)
    .map(([id]) => id)
    .sort();

const edit = (file, fn) => {
  const path = join(root, file);
  writeFileSync(path, fn(readFileSync(path, 'utf8')));
};

describe('the good fixture', () => {
  it('passes every check, so a failure elsewhere is the defect and not the fixture', () => {
    const { findings } = checkAll();
    expect(fired(findings)).toEqual([]);
  });

  it('counts one criterion per assertion, expanding a compound AC into its Cases', () => {
    const { rows } = checkAll();
    // AC-1.1.1, AC-1.1.2, and AC-1.1.3's two Cases — not AC-1.1.3 itself.
    expect(rows.map((r) => r.id)).toEqual(['AC-1.1.1', 'AC-1.1.2', 'AC-1.1.3/1', 'AC-1.1.3/2']);
  });
});

describe('T1 — every AC traces to a plan item', () => {
  it('fires when an AC is specified but no plan item claims it', () => {
    edit('specs/spec.md', (s) =>
      s.replace('## Requirements', '- **AC-1.1.9** — An unscheduled criterion\n  - **Then** it happens\n\n## Requirements')
    );
    const { findings } = checkAll();
    expect(findings.T1.map((f) => f.id)).toEqual(['AC-1.1.9']);
    // It has no test either, which is the point: specifying without scheduling.
    expect(fired(findings)).toEqual(['T1', 'T5']);
  });
});

describe('T2 — every plan item has both kinds of task', () => {
  it('fires when a plan item carrying ACs has no test task', () => {
    edit('specs/plan.md', (s) => s.replace('| T002 | T003 |', '| T002 | — |'));
    const { findings } = checkAll();
    expect(findings.T2).toHaveLength(1);
    expect(findings.T2[0].why).toContain('no test task');
  });

  it('does NOT fire for an infrastructure item, which asserts no behaviour', () => {
    // P-001 already carries no ACs and no test task.
    const { findings } = checkAll();
    expect(findings.T2).toEqual([]);
  });

  it('fires when a plan item names a task that does not exist', () => {
    edit('specs/plan.md', (s) => s.replace('| T002 | T003 |', '| T002, T099 | T003 |'));
    const { findings } = checkAll();
    expect(findings.T2[0].why).toContain('T099');
  });
});

describe('T3 — a completed task names files that exist', () => {
  it('fires when a completed task names a file that was never written', () => {
    rmSync(join(root, 'src/widget.js'));
    const { findings } = checkAll();
    expect(findings.T3.map((f) => f.id)).toEqual(['T002']);
  });

  it('does NOT fire for an OPEN task, whose named file is the work still to do', () => {
    edit('specs/tasks.md', (s) => `${s}- [ ] T004 Build it in \`src/not-yet.js\`\n`);
    const { findings } = checkAll();
    expect(findings.T3).toEqual([]);
  });
});

describe('T4 — a compound AC declares its Cases', () => {
  it('fires when an AC asserting several things declares none', () => {
    edit('specs/spec.md', (s) =>
      s.replace(/  - \*\*Cases\*\*:\n(    - \*\*AC-1\.1\.3\/\d\*\*.*\n)+/, '')
    );
    const { findings } = checkAll();
    expect(findings.T4.map((f) => f.id)).toEqual(['AC-1.1.3']);
  });

  it('counts a table as one assertion per data row, and not the Then that introduces it', () => {
    const acs = readSpec(join(root, 'specs/spec.md'));
    // Two data rows. "Then the totals are exactly:" introduces the table rather than
    // asserting anything alongside it, so it is not a third assertion.
    expect(assertionCount(acs.get('AC-1.1.3').body)).toBe(2);
    expect(assertionCount(acs.get('AC-1.1.1').body)).toBe(1);
  });
});

describe('T5 — a test named for its criterion, verbatim', () => {
  it('fires when the test proves something else, and says so', () => {
    edit('tests/unit/core/widget.test.js', (s) =>
      s.replace('AC-1.1.1 — A widget has a name', 'AC-1.1.1 — sprockets rotate counterclockwise')
    );
    const { findings } = checkAll();
    expect(findings.T5).toHaveLength(1);
    expect(findings.T5[0]).toMatchObject({ id: 'AC-1.1.1', kind: 'mismatched' });
  });

  it('fires more gently when the test is right but paraphrases the criterion', () => {
    edit('tests/unit/core/widget.test.js', (s) =>
      s.replace('AC-1.1.1 — A widget has a name', 'AC-1.1.1 — a widget carries its own name')
    );
    const { findings } = checkAll();
    expect(findings.T5[0]).toMatchObject({ id: 'AC-1.1.1', kind: 'reworded' });
  });

  it('fires when nothing names the criterion at all', () => {
    edit('tests/unit/core/widget.test.js', (s) => s.replace(/AC-1\.1\.3\/2/, 'AC-1.1.3/1'));
    const { findings } = checkAll();
    expect(findings.T5[0]).toMatchObject({ id: 'AC-1.1.3/2', kind: 'untested' });
  });

  it('accepts a qualifier after the title, so one criterion may have several tests', () => {
    edit('tests/unit/core/widget.test.js', (s) =>
      s.replace(
        "it('AC-1.1.1 — A widget has a name', () => {});",
        "it('AC-1.1.1 — A widget has a name: when empty', () => {});\n" +
          "it('AC-1.1.1 — A widget has a name: when renamed', () => {});"
      )
    );
    const { findings } = checkAll();
    expect(findings.T5).toEqual([]);
  });

  it('requires EVERY test naming a criterion to be named for it, not merely one', () => {
    // The hole this closes: a criterion with two tests, one of them repurposed, still
    // reads as covered if only one test has to match.
    edit('tests/unit/core/widget.test.js', (s) =>
      s.replace(
        "it('AC-1.1.1 — A widget has a name', () => {});",
        "it('AC-1.1.1 — A widget has a name', () => {});\n" +
          "it('AC-1.1.1 — sprockets rotate counterclockwise', () => {});"
      )
    );
    const { findings } = checkAll();
    expect(findings.T5).toHaveLength(1);
    expect(findings.T5[0].kind).toBe('mismatched');
  });

  it('is not fooled by curly quotes or dash style, which are typography and not meaning', () => {
    edit('specs/spec.md', (s) => s.replace('A widget has a name', 'A widget has a ‘name’'));
    // Double-quoted in the fixture, so the apostrophes are part of the name rather than
    // ending the JS string early.
    edit('tests/unit/core/widget.test.js', (s) =>
      s.replace(
        "it('AC-1.1.1 — A widget has a name'",
        `it("AC-1.1.1 - A widget has a 'name'"`
      )
    );
    const { findings } = checkAll();
    expect(findings.T5).toEqual([]);
  });

  it('reads a test name containing a quote character, rather than truncating at it', () => {
    // The bug this replaces: a name ending at its first quote was read as `the `, and
    // the criterion failed for a reason that had nothing to do with the test.
    edit('specs/spec.md', (s) => s.replace('A widget has a name', 'The "&" widget has a name'));
    edit('tests/unit/core/widget.test.js', (s) =>
      s.replace("it('AC-1.1.1 — A widget has a name'", `it('AC-1.1.1 — The "&" widget has a name'`)
    );
    const { findings } = checkAll();
    expect(findings.T5).toEqual([]);
  });
});

describe('T6 — a UI-level criterion needs a test that can reach the DOM', () => {
  it('fires when a criterion about a control is proved only by a pure unit test', () => {
    // Move the button test from e2e into the pure core, keeping its name intact.
    const spec = readFileSync(join(root, 'tests/e2e/widget.spec.js'), 'utf8');
    rmSync(join(root, 'tests/e2e/widget.spec.js'));
    edit('tests/unit/core/widget.test.js', (s) =>
      `${s}\nit('AC-1.1.2 — The widget button is disabled at the cap', () => {});\n`
    );
    expect(spec).toContain('AC-1.1.2');
    const { findings } = checkAll();
    expect(findings.T6.map((f) => f.id)).toEqual(['AC-1.1.2']);
    // The name is still correct, so T5 stays quiet — the two checks are independent.
    expect(findings.T5).toEqual([]);
  });

  it('does NOT fire for a criterion that describes arithmetic rather than a screen', () => {
    const { findings } = checkAll();
    expect(findings.T6).toEqual([]);
  });
});

describe('T7 — no test names a criterion the spec does not declare', () => {
  it('fires on an ID left behind by a renumbered or retired AC', () => {
    edit('tests/unit/core/widget.test.js', (s) => `${s}\nit('AC-9.9.9 — a ghost', () => {});\n`);
    const { findings } = checkAll();
    expect(findings.T7.map((f) => f.id)).toEqual(['AC-9.9.9']);
  });
});

describe('T8 — the committed matrix is up to date', () => {
  it('fires when the matrix has never been generated', () => {
    const { findings } = checkAll({ freshMatrix: false });
    expect(findings.T8).toHaveLength(1);
    expect(findings.T8[0].why).toContain('never been generated');
  });

  it('fires when the artefacts have moved on and the matrix has not', () => {
    const cfg = config();
    writeFileSync(join(root, cfg.matrix), '# Traceability Matrix\n\nstale\n');
    const state = run(cfg);
    const { text } = masterMatrix(state, cfg, new Set());
    checkMatrixFreshness(state, cfg, text);
    expect(state.findings.T8[0].why).toContain('out of date');
  });

  it('passes once regenerated, and the regeneration is deterministic', () => {
    const { text, cfg } = checkAll();
    const second = masterMatrix(run(cfg), cfg, new Set()).text;
    expect(second).toBe(text);
    expect(existsSync(join(root, cfg.matrix))).toBe(true);
  });
});

describe('the master matrix', () => {
  it('shows the story, criterion, plan item, and both kinds of task separately', () => {
    const { rows, text } = checkAll();
    const row = rows.find((r) => r.id === 'AC-1.1.1');
    expect(row).toMatchObject({ story: 'US-1.1', plan: ['P-002'], impl: ['T002'], test: ['T003'] });
    expect(text).toContain('| Story | Criterion | What it requires | Plan | Implementation tasks | Test tasks |');
  });

  it('marks a criterion by its worst problem, so a row cannot look better than it is', () => {
    edit('tests/unit/core/widget.test.js', (s) =>
      s.replace('AC-1.1.1 — A widget has a name', 'AC-1.1.1 — sprockets rotate counterclockwise')
    );
    const { rows } = checkAll();
    expect(rows.find((r) => r.id === 'AC-1.1.1').status.mark).toBe('WRONG TEST');
  });

  it('distinguishes an accepted finding from a clean row, without hiding it', () => {
    edit('tests/unit/core/widget.test.js', (s) =>
      s.replace('AC-1.1.1 — A widget has a name', 'AC-1.1.1 — sprockets rotate counterclockwise')
    );
    const cfg = config();
    const state = run(cfg);
    const baseline = new Set(['T5 AC-1.1.1 mismatched']);
    const { rows } = masterMatrix(state, cfg, baseline);
    const row = rows.find((r) => r.id === 'AC-1.1.1');
    expect(row.status.mark).toBe('WRONG TEST');
    expect(row.status.accepted).toBe(true);
  });
});

describe('the change matrix', () => {
  it('reaches a criterion through a changed SOURCE file, via the task that claims it', () => {
    // The route a diff alone misses: src/widget.js names no AC anywhere in it.
    const { state } = checkAll();
    const touched = criteriaTouchedBy(['src/widget.js'], state);
    expect([...touched].sort()).toEqual(['AC-1.1.1', 'AC-1.1.2', 'AC-1.1.3/1', 'AC-1.1.3/2']);
  });

  it('reaches a criterion through a changed TEST file that names it', () => {
    const { state } = checkAll();
    const touched = criteriaTouchedBy(['tests/e2e/widget.spec.js'], state);
    // Deliberately the union of both routes, not just the ID in the file: the changed
    // file is also named by test task T003, which the plan lists for all of P-002. A
    // change matrix that under-reports is worse than one that over-reports — the point
    // is to show a reviewer everything this change could have affected.
    expect([...touched].sort()).toEqual(['AC-1.1.1', 'AC-1.1.2', 'AC-1.1.3/1', 'AC-1.1.3/2']);
  });

  it('reports nothing for a change that touches no traced file', () => {
    const { state } = checkAll();
    expect([...criteriaTouchedBy(['README.md'], state)]).toEqual([]);
  });
});

describe('the baseline', () => {
  it('keys a T5 finding by its severity, so a misnamed test cannot decay unnoticed', () => {
    expect(findingKey('T5', { id: 'AC-1.1.1', kind: 'reworded' })).not.toBe(
      findingKey('T5', { id: 'AC-1.1.1', kind: 'mismatched' })
    );
  });

  it('does not key a finding by anything that moves when an unrelated test is edited', () => {
    const a = findingKey('T5', { id: 'AC-1.1.1', kind: 'reworded', why: '20% in common' });
    const b = findingKey('T5', { id: 'AC-1.1.1', kind: 'reworded', why: '31% in common' });
    expect(a).toBe(b);
  });

  it('distinguishes several findings raised against one task', () => {
    const a = findingKey('T3', { id: 'T002', why: 'names `a.js`, which does not exist' });
    const b = findingKey('T3', { id: 'T002', why: 'names `b.js`, which does not exist' });
    expect(a).not.toBe(b);
  });
});

describe('parsing', () => {
  it('expands an AC range written with an en dash, em dash, or hyphen', () => {
    for (const dash of ['–', '—', '-']) {
      expect([...expandRange(`AC-1.1.1${dash}AC-1.1.3`)]).toEqual(['AC-1.1.1', 'AC-1.1.2', 'AC-1.1.3']);
    }
  });

  it('leaves a range across different stories alone rather than inventing IDs', () => {
    expect([...expandRange('AC-1.1.1–AC-2.1.3')].sort()).toEqual(['AC-1.1.1', 'AC-2.1.3']);
  });

  it('strips the ID and separator from a test name to get what it claims', () => {
    expect(claimedTitle('AC-1.1.1 — A widget has a name', 'AC-1.1.1')).toBe('a widget has a name');
    expect(claimedTitle('AC-1.1.3/2 — A large widget', 'AC-1.1.3/2')).toBe('a large widget');
  });

  it('normalises typography but not words', () => {
    expect(normalise('A “quoted” thing — here')).toBe('a "quoted" thing - here');
  });

  it('treats a criterion with Cases as its Cases, and never also as itself', () => {
    const acs = readSpec(join(root, 'specs/spec.md'));
    const ids = buildCriteria(acs, DEFAULTS).map((c) => c.id);
    expect(ids).toContain('AC-1.1.3/1');
    expect(ids).not.toContain('AC-1.1.3');
  });
});
