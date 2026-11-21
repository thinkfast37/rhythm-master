/**
 * Asking whether a newer build has been published. US-21.1, research.md D-031.
 *
 * The host keeps a copy of the page for ten minutes and each build's page names
 * its own script, so a reload can be handed the build before the last one. The
 * app therefore fetches its own page past every kept copy and compares stamps
 * (`core/buildVersion.js`).
 *
 * Nothing is sent and nothing is stored: the request is for the app's own page,
 * on its own origin.
 */
import { readBuildStamp, isNewerBuild } from '../core/buildVersion.js';

/** How often an open, visible page asks again. AC-21.1.2/1 */
export const CHECK_EVERY_MS = 5 * 60 * 1000;

/** The page's own address with a query that differs each time, and nothing else. AC-21.1.1/1 */
export function freshAddress(href, now) {
  const url = new URL(href);
  return `${url.origin}${url.pathname}?fresh=${now}`;
}

/** The text of a fresh copy of this page. Rejects when it cannot be had. */
export async function fetchFreshPage(href = location.href, now = Date.now()) {
  const response = await fetch(freshAddress(href, now), { cache: 'no-store' });
  if (!response.ok) throw new Error(`fresh page: ${response.status}`);
  return response.text();
}

/**
 * A checker for one running build.
 *
 * `running` is this page's own stamp, or null when it has none — a development
 * server's page — in which case nothing is ever requested (AC-21.1.5/2). Inside
 * the store shell nothing is requested either: a store build is updated by its
 * store (AC-21.1.5/3). A request that fails is not an error to anyone
 * (AC-21.1.5/1), and only a later build is reported (AC-21.1.4).
 *
 * @param {{ running: {time:number, commit:string}|null, native: boolean,
 *           fetchPage: () => Promise<string>, onNewer: (found: {time:number, commit:string}) => void }} options
 */
export function createBuildCheck({ running, native, fetchPage, onNewer }) {
  const enabled = Boolean(running) && !native;
  let pending = null;

  async function ask() {
    try {
      const found = readBuildStamp(await fetchPage());
      if (!isNewerBuild(running, found)) return null;
      onNewer(found);
      return found;
    } catch {
      return null;
    }
  }

  return {
    enabled,
    /** Resolves with the newer build found, or null. One request at a time. */
    check() {
      if (!enabled) return Promise.resolve(null);
      pending ??= ask().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}

/**
 * Ask again each time the tab is shown again, and every five minutes while it
 * stays shown. AC-21.1.2/1
 */
export function watchForNewerBuild(checker, { doc = document, every = setInterval } = {}) {
  if (!checker.enabled) return;
  const shown = () => doc.visibilityState === 'visible';
  doc.addEventListener('visibilitychange', () => {
    if (shown()) checker.check();
  });
  every(() => {
    if (shown()) checker.check();
  }, CHECK_EVERY_MS);
}
