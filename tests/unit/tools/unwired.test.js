import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
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
  /*
   * A two-module tree with one export nothing reaches. Until T274 these tests
   * used the real tree's `removeMeasure` — the finding the gate was built for —
   * as the example; once that control was built the example was gone, so the
   * shape is pinned here where nothing can wire it.
   */
  const withFixture = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'unwired-'));
    try {
      writeFileSync(join(dir, 'a.js'), 'export function lonely() {}\nexport function used() {}\n');
      writeFileSync(join(dir, 'b.js'), "import { used } from './a.js';\nused();\n");
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('flags an export nothing reaches, and passes one that something does', () => {
    withFixture((dir) => {
      const names = findUnwired(jsFiles(dir)).map((f) => f.name);
      expect(names).toContain('lonely');
      expect(names).not.toContain('used');
    });

    // And on the real tree: the finding the gate was built for — AC-1.1.8 and
    // AC-1.1.9's −Measure control, whose mutator nothing called for the life of
    // the project — is wired now (T274), and stays wired.
    const real = findUnwired(jsFiles('src')).map((f) => f.name);
    expect(real).not.toContain('removeMeasure');
    expect(real).not.toContain('addMeasure');
    expect(real).not.toContain('cycleAccent');
  });

  it('reports a stable key of file and name, so the baseline cannot drift', () => {
    withFixture((dir) => {
      const finding = findUnwired(jsFiles(dir)).find((f) => f.name === 'lonely');
      expect(finding.key).toBe(`${relative('.', join(dir, 'a.js'))} lonely`);
    });
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
