import { describe, it, expect } from 'vitest';
import { createBuildCheck, freshAddress } from '../../../src/update/buildCheck.js';
import { parseBuildStamp } from '../../../src/core/buildVersion.js';

const RUNNING = parseBuildStamp('2026-11-21 05:39:58 UTC (a6e3024)');
const page = (content) => `<html><head><meta name="build-version" content="${content}"></head></html>`;

/** A checker over a scripted page, recording every request and every offer. */
function harness({ running = RUNNING, native = false, answer = () => page('2026-11-21 05:47:25 UTC (0748a5f)') } = {}) {
  const requests = [];
  const offered = [];
  const check = createBuildCheck({
    running,
    native,
    fetchPage: async () => {
      requests.push(1);
      return answer();
    },
    onNewer: (found) => offered.push(found),
  });
  return { check, requests, offered };
}

describe('update/buildCheck — US-21.1', () => {
  it('AC-21.1.5/2 — A page that carries no build stamp, as a development server serves it, makes no request at all', async () => {
    const h = harness({ running: null });
    expect(h.check.enabled).toBe(false);
    expect(await h.check.check()).toBeNull();
    expect(await h.check.check()).toBeNull();
    expect(h.requests).toHaveLength(0);
    expect(h.offered).toHaveLength(0);
  });

  it('AC-21.1.5/3 — Inside the store shell no request is made: a store build is updated by its store', async () => {
    const h = harness({ native: true });
    expect(h.check.enabled).toBe(false);
    expect(await h.check.check()).toBeNull();
    expect(h.requests).toHaveLength(0);
    expect(h.offered).toHaveLength(0);
    // The same page outside the shell does ask, and is told.
    const web = harness();
    expect(web.check.enabled).toBe(true);
    expect((await web.check.check()).commit).toBe('0748a5f');
    expect(web.requests).toHaveLength(1);
    expect(web.offered.map((f) => f.commit)).toEqual(['0748a5f']);
  });

  it('a request that fails, or a page with no readable stamp, offers nothing and throws nothing', async () => {
    const failing = harness({
      answer: () => {
        throw new Error('offline');
      },
    });
    expect(await failing.check.check()).toBeNull();
    expect(failing.offered).toHaveLength(0);
    const blank = harness({ answer: () => '<html></html>' });
    expect(await blank.check.check()).toBeNull();
    const older = harness({ answer: () => page('2026-11-21 05:29:40 UTC (b178954)') });
    expect(await older.check.check()).toBeNull();
    expect(older.offered).toHaveLength(0);
  });

  it('two checks at once make one request', async () => {
    const h = harness();
    await Promise.all([h.check.check(), h.check.check()]);
    expect(h.requests).toHaveLength(1);
  });

  it('the fresh address is the page itself with a query that differs each time, and nothing else', () => {
    expect(freshAddress('https://example.org/rhythm-master/?billing=fake&v=abc#top', 1234)).toBe('https://example.org/rhythm-master/?fresh=1234');
  });
});
