/**
 * Rendering the traceability matrix.
 *
 * Two shapes, one function underneath:
 *
 *   - the MASTER matrix, one row per criterion across the whole application, written to
 *     a committed file so it diffs in review like anything else;
 *   - a CHANGE matrix, the same rows filtered to what a given change actually touches,
 *     for the pull request body.
 *
 * The matrix is generated, never hand-edited. The authored decisions live in the plan's
 * own Traceability Matrix (which AC belongs to which plan item, and which tasks build and
 * prove it); this file is that expanded, cross-referenced against the suite, and marked
 * with what is actually true right now.
 */

/** Status of one criterion, worst-first so a row's mark is its most serious problem. */
export function statusOf(id, findings, baseline, keyOf) {
  const hit = (check) => findings[check].find((f) => f.id === id);

  const t5 = hit('T5');
  if (t5) {
    const accepted = baseline.has(keyOf('T5', t5));
    if (t5.kind === 'untested') return { mark: 'NO TEST', accepted, note: 'no test names this criterion' };
    if (t5.kind === 'mismatched') {
      return { mark: 'WRONG TEST', accepted, note: 'the test named for it proves something else' };
    }
  }
  const t6 = hit('T6');
  if (t6) {
    return {
      mark: 'NOT PROVABLE',
      accepted: baseline.has(keyOf('T6', t6)),
      note: 'UI-level, but only a pure unit test',
    };
  }
  const t4 = hit('T4');
  if (t4) {
    return { mark: 'NEEDS CASES', accepted: baseline.has(keyOf('T4', t4)), note: t4.why };
  }
  if (t5) {
    return { mark: 'MISNAMED', accepted: baseline.has(keyOf('T5', t5)), note: 'test name is a paraphrase' };
  }
  return { mark: 'OK', accepted: false, note: '' };
}

const escapeCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Build every row of the matrix.
 * @returns {Array<object>} one row per criterion, in spec order.
 */
export function buildRows({ criteria, acs, plan, tasks, testsFor, acToPlan, findings, baseline, keyOf }) {
  return criteria.map((c) => {
    const planIds = acToPlan.get(c.parent) ?? [];
    const impl = [];
    const test = [];
    for (const pid of planIds) {
      const item = plan.get(pid);
      if (!item) continue;
      impl.push(...item.impl);
      test.push(...item.test);
    }
    const tests = testsFor.get(c.id) ?? [];
    const status = statusOf(c.id, findings, baseline, keyOf);
    return {
      story: c.story,
      id: c.id,
      title: c.title,
      isCase: c.id.includes('/'),
      ui: c.ui,
      plan: planIds,
      planTitles: planIds.map((p) => plan.get(p)?.title ?? ''),
      impl: [...new Set(impl)],
      test: [...new Set(test)],
      implDone: [...new Set(impl)].filter((t) => tasks.get(t)?.done).length,
      testDone: [...new Set(test)].filter((t) => tasks.get(t)?.done).length,
      tests: tests.map((t) => ({ title: t.title, file: t.file })),
      status,
      acTitle: acs.get(c.parent)?.title ?? '',
    };
  });
}

function renderTable(rows) {
  const out = [
    '| Story | Criterion | What it requires | Plan | Implementation tasks | Test tasks | Proving test | Status |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const taskCell = (ids, done) =>
      ids.length === 0 ? '**none**' : `${ids.join(', ')} (${done}/${ids.length} done)`;
    const testCell =
      r.tests.length === 0
        ? '**none**'
        : r.tests.map((t) => `\`${t.file.split('/').pop()}\``).join(', ');
    const mark = r.status.mark === 'OK' ? 'OK' : `**${r.status.mark}**${r.status.accepted ? ' ᵃ' : ''}`;
    out.push(
      `| ${r.story} | \`${r.id}\`${r.ui ? ' 🖵' : ''} | ${escapeCell(r.title)} | ` +
        `${r.plan.join(', ') || '**none**'} | ${taskCell(r.impl, r.implDone)} | ` +
        `${taskCell(r.test, r.testDone)} | ${testCell} | ${mark} |`
    );
  }
  return out.join('\n');
}

function summarise(rows) {
  const counts = {};
  for (const r of rows) counts[r.status.mark] = (counts[r.status.mark] ?? 0) + 1;
  const order = ['OK', 'MISNAMED', 'NEEDS CASES', 'NOT PROVABLE', 'WRONG TEST', 'NO TEST'];
  return order.filter((k) => counts[k]).map((k) => `${k}: ${counts[k]}`);
}

/** The master matrix — the whole application, written to a committed file. */
export function renderMaster(rows, { generatedFor }) {
  const stories = [...new Set(rows.map((r) => r.story))];
  const accepted = rows.filter((r) => r.status.accepted).length;

  return `# Traceability Matrix

<!--
  GENERATED FILE — do not edit by hand.

  Regenerate with:  npm run trace:matrix
  It is checked by  npm run check:trace  (check T8), so an out-of-date matrix fails
  the build rather than sitting quietly out of step with the spec.

  The decisions live elsewhere. Which AC belongs to which plan item, and which tasks
  build and prove it, are authored in the plan's own Traceability Matrix. This file is
  that expanded one row per criterion, cross-referenced against the test suite, and
  marked with what is true right now.
-->

**Feature**: ${generatedFor}
**Criteria**: ${rows.length} across ${stories.length} User Stories
**Status**: ${summarise(rows).join(' · ')}

A row is one *criterion*: an Acceptance Criterion that asserts one thing, or one Case of
an AC that asserts several. 🖵 marks a criterion that describes something a person sees or
does, which cannot be proved by a test with no document to look at.

**Status marks**, worst first:

| Mark | Meaning |
|---|---|
| **NO TEST** | Nothing in the suite names this criterion. |
| **WRONG TEST** | A test names it, but proves something else. Treat as unbuilt. |
| **NOT PROVABLE** | UI-level, but every test for it is a pure unit test. |
| **NEEDS CASES** | The AC asserts several things and has not been decomposed. |
| **MISNAMED** | The right test, named in its own words rather than the spec's. |
| OK | Named for its criterion, in the criterion's own words, at the right level. |

ᵃ marks a finding accepted as pre-existing debt (${accepted} rows). It is reported but does
not fail the build, and it is outstanding work — never a settled decision.

${renderTable(rows)}
`;
}

/** The change matrix — the same rows, filtered to what one change touches. */
export function renderChange(rows, { touchedFiles, reason }) {
  if (rows.length === 0) {
    return (
      '### Traceability\n\nNo Acceptance Criteria are touched by this change.\n\n' +
      `_Files considered: ${touchedFiles.length}. ${reason}_\n`
    );
  }
  return `### Traceability

This change touches **${rows.length}** criteri${rows.length === 1 ? 'on' : 'a'} across ` +
    `**${[...new Set(rows.map((r) => r.story))].length}** User Stor${
      new Set(rows.map((r) => r.story)).size === 1 ? 'y' : 'ies'
    }. Rows are the affected slice of the master matrix.

**Status**: ${summarise(rows).join(' · ')}

${renderTable(rows)}

_Derived from ${touchedFiles.length} changed file(s). ${reason}_
`;
}
