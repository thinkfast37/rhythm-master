import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  exportsOf,
  mentionsBesidesDeclaration,
  findUnwired,
  jsFiles,
} from '../../../tools/check-unwired.mjs';

/*
 * The checker's own tests. `check:unwired` is one of the places where a false PASS
 * is invisible — a gate that never fires looks exactly like a gate with nothing to
 * find — so changing the checker means changing these.
 */

describe('tools/check-unwired — reading exports', () => {
  it('finds every declaration form it claims to', () => {
    const src = [
      'export function a() {}',
      'export async function b() {}',
      'export const c = 1;',
      'export let d = 2;',
      'export class E {}',
    ].join('\n');
    expect(exportsOf(src)).toEqual(['a', 'b', 'c', 'd', 'E']);
  });

  it('ignores re-exports, which declare nothing', () => {
    expect(exportsOf("export { a } from './x.js';\nexport * from './y.js';")).toEqual([]);
  });

  it('does not mistake a longer name that merely starts the same', () => {
    expect(mentionsBesidesDeclaration('const x = removeMeasureGroup();', 'removeMeasure')).toBe(false);
    expect(mentionsBesidesDeclaration('const x = removeMeasure(p, 0);', 'removeMeasure')).toBe(true);
  });

  it('does not count the declaration itself as a use', () => {
    expect(mentionsBesidesDeclaration('export function lonely() {}', 'lonely')).toBe(false);
  });

  it('counts a use inside the declaring module', () => {
    const text = ['export function helper() {}', 'export function caller() { return helper(); }'].join('\n');
    expect(mentionsBesidesDeclaration(text, 'helper')).toBe(true);
  });
});

describe('tools/check-unwired — the gate', () => {
  it('flags an export nothing reaches, and passes one that something does', () => {
    // Written against the real tree rather than a fixture, because the failure this
    // gate exists for is a property of the real tree.
    const findings = findUnwired(jsFiles('src'));
    const names = findings.map((f) => f.name);

    // The finding the gate was built for: AC-1.1.8/AC-1.1.9 specify a −Measure
    // control, and the mutator behind it has never been called.
    expect(names).toContain('removeMeasure');

    // And its neighbour in the same module, which the app does call, is not flagged.
    expect(names).not.toContain('addMeasure');
    expect(names).not.toContain('cycleAccent');
  });

  it('reports a stable key of file and name, so the baseline cannot drift', () => {
    const finding = findUnwired(jsFiles('src')).find((f) => f.name === 'removeMeasure');
    expect(finding.key).toBe('src/core/pattern.js removeMeasure');
  });

  it('every current finding is either baselined or a build failure — no third state', () => {
    const baseline = JSON.parse(readFileSync('tools/unwired-baseline.json', 'utf8'));
    const findings = findUnwired(jsFiles('src'));
    const fresh = findings.filter((f) => !(f.key in baseline.accepted));
    expect(fresh).toEqual([]);
  });

  it('the baseline holds no entry that is no longer a finding', () => {
    // The rule that keeps the list honest: it may only shrink. A stale entry could
    // otherwise re-excuse a regression years later.
    const baseline = JSON.parse(readFileSync('tools/unwired-baseline.json', 'utf8'));
    const keys = new Set(findUnwired(jsFiles('src')).map((f) => f.key));
    expect(Object.keys(baseline.accepted).filter((k) => !keys.has(k))).toEqual([]);
  });

  it('every baseline entry carries a real reason, so the file cannot rot into a blanket pass', () => {
    const baseline = JSON.parse(readFileSync('tools/unwired-baseline.json', 'utf8'));
    for (const [key, reason] of Object.entries(baseline.accepted)) {
      expect(reason.length, key).toBeGreaterThan(30);
    }
  });
});
