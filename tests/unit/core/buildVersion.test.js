import { describe, it, expect } from 'vitest';
import {
  parseBuildStamp,
  readBuildStamp,
  isNewerBuild,
  reloadAddress,
  tidyAddress,
  cameForBuild,
} from '../../../src/core/buildVersion.js';

const page = (content) => `<!doctype html><html><head><meta charset="utf-8"><meta name="build-version" content="${content}"></head><body></body></html>`;

describe('core/buildVersion — US-21.1', () => {
  it('AC-21.1.4/1 — A build stamp is a build time in UTC and a commit, and a build is newer only when its build time is later', () => {
    const running = parseBuildStamp('2026-11-21 05:39:58 UTC (a6e3024)');
    expect(running).toEqual({ time: Date.UTC(2026, 10, 21, 5, 39, 58), commit: 'a6e3024' });
    const later = parseBuildStamp('2026-11-21 05:47:25 UTC (0748a5f)');
    expect(isNewerBuild(running, later)).toBe(true);
    // One second is enough, and so is a year; the commit plays no part.
    expect(isNewerBuild(running, parseBuildStamp('2026-11-21 05:39:59 UTC (a6e3024)'))).toBe(true);
    expect(isNewerBuild(running, parseBuildStamp('2027-01-01 00:00:00 UTC (uncommitted)'))).toBe(true);
    // The stamp as a built page carries it, wherever the tag sits and however it is quoted.
    expect(readBuildStamp(page('2026-11-21 05:47:25 UTC (0748a5f)'))).toEqual(later);
    expect(readBuildStamp(`<meta content='2026-11-21 05:47:25 UTC (0748a5f)' name='build-version'>`)).toEqual(later);
  });

  it('AC-21.1.4/2 — The same build time, an earlier build time, and a stamp that cannot be read are none of them newer', () => {
    const running = parseBuildStamp('2026-11-21 05:39:58 UTC (a6e3024)');
    // The same time, whatever the commit says.
    expect(isNewerBuild(running, parseBuildStamp('2026-11-21 05:39:58 UTC (a6e3024)'))).toBe(false);
    expect(isNewerBuild(running, parseBuildStamp('2026-11-21 05:39:58 UTC (fffffff)'))).toBe(false);
    // Earlier: the copy a part of the host that has not caught up would hand over.
    expect(isNewerBuild(running, parseBuildStamp('2026-11-21 05:29:40 UTC (b178954)'))).toBe(false);
    // Unreadable, either side.
    for (const bad of ['', 'yesterday', '2026-11-21 05:47:25 (0748a5f)', '2026-13-41 05:47:25 UTC (0748a5f)', '2026-11-21T05:47:25Z', null, undefined]) {
      expect(parseBuildStamp(bad)).toBeNull();
      expect(isNewerBuild(running, parseBuildStamp(bad))).toBe(false);
    }
    expect(readBuildStamp('<html><head></head></html>')).toBeNull();
    expect(readBuildStamp(page('soon'))).toBeNull();
    expect(readBuildStamp(null)).toBeNull();
    expect(isNewerBuild(null, parseBuildStamp('2026-11-21 05:47:25 UTC (0748a5f)'))).toBe(false);
  });

  it('the reload address carries the commit and keeps the rest; tidying takes only the commit back out', () => {
    const there = reloadAddress('https://example.org/rhythm-master/?billing=fake#top', '0748a5f');
    expect(there).toBe('https://example.org/rhythm-master/?billing=fake&v=0748a5f#top');
    expect(cameForBuild(there)).toBe(true);
    expect(tidyAddress(there)).toBe('https://example.org/rhythm-master/?billing=fake#top');
    expect(reloadAddress('https://example.org/rhythm-master/?v=old', 'new')).toBe('https://example.org/rhythm-master/?v=new');
    expect(tidyAddress('https://example.org/rhythm-master/?v=0748a5f')).toBe('https://example.org/rhythm-master/');
    expect(cameForBuild('https://example.org/rhythm-master/')).toBe(false);
    expect(tidyAddress('https://example.org/rhythm-master/')).toBeNull();
  });
});
