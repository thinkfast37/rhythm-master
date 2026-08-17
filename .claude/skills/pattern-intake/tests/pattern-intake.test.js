/**
 * The intake path, end to end without GitHub.
 *
 * A decoder that silently drops a Measure is invisible until a wrong Pattern has
 * shipped, and by then it is in `data/seed-patterns.json` with an id that other
 * users' ratings key off. So the round trip is asserted against the app's own
 * encoder rather than against a fixture someone typed.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create, addMeasure, setTimeSignature, setRecipe, cycleAccent } from '../../../../src/core/pattern.js';
import { buildSubmission, buildIssueBody, buildIssueTitle } from '../../../../src/export/submit.js';
import { patternsFromIssue } from '../lib/decode.mjs';
import { renderPattern, renderMeasure, countNotes } from '../lib/render.mjs';
import { appendPatterns, findNameClash, seedId } from '../lib/seed.mjs';
import { SUBMISSION_LABEL, looksLikeSubmission, isLabelled, mergeSubmissions } from '../lib/select.mjs';

const issueFrom = (body, number = 42) => ({
  number,
  title: 'New Pattern: test',
  body,
  author: { login: 'some-contributor' },
  url: 'https://github.com/x/y/issues/42',
});

/** A Pattern dense enough that the app compresses it (AC-13.1.3/1). */
function dense() {
  let p = create('Dense Line');
  p = setTimeSignature(p, 0, '12/8');
  for (let i = 1; i < 8; i++) p = addMeasure(p);
  for (let m = 0; m < 8; m++) {
    for (let b = 0; b < p.measures[m].beats.length; b++) {
      p = setRecipe(p, m, b, 'straight-16ths');
      p = cycleAccent(p, m, b, 0);
    }
  }
  return p;
}

const seedFile = (patterns) => {
  const dir = mkdtempSync(join(tmpdir(), 'intake-'));
  const path = join(dir, 'seed-patterns.json');
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, patterns }, null, 2) + '\n');
  return path;
};

describe('pattern-intake/decode', () => {
  it('reads a readable submission back to the Pattern that was sent', async () => {
    const p = cycleAccent(create('Samba Break'), 0, 0, 0);
    const entries = await patternsFromIssue(issueFrom(buildIssueBody([p])));

    expect(entries).toHaveLength(1);
    expect(entries[0].pattern.name).toBe('Samba Break');
    expect(entries[0].pattern.measures).toHaveLength(1);
    expect(entries[0].issue).toBe(42);
    expect(entries[0].author).toBe('some-contributor');
  });

  it('reads a compressed submission back to the same Pattern', async () => {
    const p = dense();
    const { url, compressed } = await buildSubmission([p]);
    // Guard the premise: if this stopped compressing, the test would prove nothing.
    expect(compressed).toBe(true);

    const body = new URL(url).searchParams.get('body');
    const entries = await patternsFromIssue(issueFrom(body));

    expect(entries).toHaveLength(1);
    expect(entries[0].pattern).toEqual(JSON.parse(JSON.stringify(entries[0].pattern)));
    expect(entries[0].pattern.name).toBe('Dense Line');
    expect(entries[0].pattern.measures).toHaveLength(8);
    expect(entries[0].pattern.measures[0].beats).toHaveLength(12);
    expect(countNotes(entries[0].pattern)).toBe(96);
  });

  it('reads every Pattern out of a bulk submission', async () => {
    const three = ['One', 'Two', 'Three'].map((n) => cycleAccent(create(n), 0, 0, 0));
    const entries = await patternsFromIssue(issueFrom(buildIssueBody(three)));
    expect(entries.map((e) => e.pattern.name)).toEqual(['One', 'Two', 'Three']);
  });

  it('says which issue is unreadable rather than failing anonymously', async () => {
    await expect(patternsFromIssue(issueFrom('I would like to submit a groove please'))).rejects.toThrow(
      /Issue #42: no Pattern found/
    );
  });

  it('refuses a block whose format it does not know, rather than guessing', async () => {
    const body = '```rhythm-master\nv9 brotli base64url\nAAAA\n```';
    await expect(patternsFromIssue(issueFrom(body))).rejects.toThrow(/Unknown submission format "v9 brotli base64url"/);
  });
});

describe('pattern-intake/render', () => {
  it('shows accents as they will sound, computed defaults included', () => {
    const p = cycleAccent(create('Show Me'), 0, 0, 0);
    const line = renderMeasure(p.measures[0]);

    // Slot 1 of Beat 1 is on and metrically strongest; the rest are silent.
    expect(line.startsWith('|X · · ·|')).toBe(true);
    expect(line.match(/·/g).length).toBe(15);
  });

  it('leads with what decides whether a Pattern ships', () => {
    const text = renderPattern(dense(), { issue: 7, author: 'someone' });
    expect(text).toContain('Dense Line');
    expect(text).toContain('8 Measures');
    expect(text).toContain('12/8');
    expect(text).toContain('96 notes');
    expect(text).toContain('From issue #7 by someone');
  });

  it('names every meter in a Pattern that changes meter', () => {
    let p = addMeasure(create('Shifting'));
    p = setTimeSignature(p, 1, '6/8');
    expect(renderPattern(p)).toContain('4/4 → 6/8');
  });
});

describe('pattern-intake/seed', () => {
  const existing = [{ name: 'Already Here', soundMode: 'percussive', tempo: 80, tags: [], rating: 0, measures: [] }];

  it('appends at the end, so no existing id moves', () => {
    const path = seedFile(existing);
    const { added, before, after } = appendPatterns(path, [{ ...create('Newcomer') }]);

    expect(before).toBe(1);
    expect(after).toBe(2);
    expect(added).toEqual([{ id: 's_2', name: 'Newcomer' }]);

    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.patterns[0].name).toBe('Already Here');
    expect(written.patterns[1].name).toBe('Newcomer');
  });

  it('refuses a name the library already has, case-insensitively', () => {
    const path = seedFile(existing);
    expect(() => appendPatterns(path, [{ ...create('already here') }])).toThrow(
      /"already here" is already in the library/
    );
    // …and wrote nothing.
    expect(JSON.parse(readFileSync(path, 'utf8')).patterns).toHaveLength(1);
  });

  it('refuses two Patterns in one batch sharing a name', () => {
    const path = seedFile(existing);
    expect(() => appendPatterns(path, [{ ...create('Twin') }, { ...create('twin') }])).toThrow(
      /"twin" appears twice in this batch/
    );
  });

  it('accepts a clashing name only when forced', () => {
    const path = seedFile(existing);
    const { added } = appendPatterns(path, [{ ...create('Already Here') }], { force: true });
    expect(added[0].id).toBe('s_2');
  });

  it('assigns the same ids storage/seed.js will derive from position', () => {
    expect(seedId(0)).toBe('s_1');
    expect(seedId(206)).toBe('s_207');
  });

  it('finds a clash by name, ignoring surrounding space', () => {
    expect(findNameClash({ patterns: existing }, '  already here  ')?.name).toBe('Already Here');
    expect(findNameClash({ patterns: existing }, 'Something Else')).toBeNull();
  });
});

describe('pattern-intake/select', () => {
  const labelled = (number, title) => ({ number, title, labels: [{ name: SUBMISSION_LABEL }] });
  const bare = (number, title) => ({ number, title, labels: [] });

  it('recognises the titles the app actually builds, single and bulk', () => {
    const one = create('Samba Break');
    expect(looksLikeSubmission(buildIssueTitle([one]))).toBe(true);
    expect(looksLikeSubmission(buildIssueTitle([one, create('My Fill'), create('Bossa Take 2')]))).toBe(true);
  });

  it('leaves issues that are not submissions alone', () => {
    expect(looksLikeSubmission('Cursor drifts at 200 BPM')).toBe(false);
    expect(looksLikeSubmission('')).toBe(false);
    expect(looksLikeSubmission(undefined)).toBe(false);
  });

  it('finds a submission GitHub stripped the label from, and says it is bare', () => {
    const merged = mergeSubmissions([], [bare(32, 'New Pattern: Another One Bites the Dust')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].number).toBe(32);
    expect(merged[0].unlabelled).toBe(true);
  });

  it('trusts the issue\u2019s own labels, not the lagging label query that returned it', () => {
    // `gh issue list --label` is search-indexed and keeps returning an issue whose
    // label was just removed. Believing it would hide the very misconfiguration
    // the title fallback exists to surface.
    const stale = bare(32, 'New Pattern: Samba Break');
    expect(mergeSubmissions([stale], [])[0].unlabelled).toBe(true);
  });

  it('reports a labelled submission as labelled', () => {
    expect(mergeSubmissions([labelled(7, 'New Pattern: Samba Break')], [])[0].unlabelled).toBe(false);
    expect(isLabelled(labelled(7, 'x'))).toBe(true);
    expect(isLabelled(bare(7, 'x'))).toBe(false);
  });

  it('lists an issue once when both queries return it', () => {
    const issue = labelled(7, 'New Pattern: Samba Break');
    expect(mergeSubmissions([issue], [issue])).toHaveLength(1);
  });

  it('ignores an unlabelled issue that is not shaped like a submission', () => {
    expect(mergeSubmissions([], [bare(9, 'Cursor drifts at 200 BPM')])).toHaveLength(0);
  });

  it('returns submissions in issue order however the queries were ordered', () => {
    const merged = mergeSubmissions(
      [labelled(30, 'New Pattern: C')],
      [bare(12, 'New Pattern: A'), bare(21, 'New Pattern: B')]
    );
    expect(merged.map((i) => i.number)).toEqual([12, 21, 30]);
  });

  it('keeps a labelled issue labelled even if it has other labels too', () => {
    const issue = { number: 5, title: 'anything', labels: [{ name: 'bug' }, { name: SUBMISSION_LABEL }] };
    expect(mergeSubmissions([issue], [])[0].unlabelled).toBe(false);
  });
});
