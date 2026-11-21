/**
 * The build stamp, read and compared. US-21.1, research.md D-031.
 *
 * Every deployed page carries `<meta name="build-version">`: the UTC build time
 * to the second, and the commit (`vite.config.js`). The app compares its own
 * stamp with one read from a freshly fetched copy of its page to learn whether
 * a newer build has been published.
 *
 * Pure: text in, values out. The request, the clock and the page live in
 * `src/update/buildCheck.js` and `src/main.js`.
 */

const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC \(([^()\s]+)\)$/;
const META = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** The query parameter a reload carries, naming the build it came for. */
export const BUILD_PARAM = 'v';

const daysIn = (year, month) => {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/**
 * A stamp as `{ time, commit }` — `time` in milliseconds since the epoch — or
 * null when the text is not a stamp. AC-21.1.4/1, /2
 */
export function parseBuildStamp(text) {
  const match = typeof text === 'string' ? STAMP.exec(text.trim()) : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { time: Date.UTC(year, month - 1, day, hour, minute, second), commit: match[7] };
}

/** The stamp a page's text carries, or null when it carries none that can be read. AC-21.1.4/2 */
export function readBuildStamp(html) {
  if (typeof html !== 'string') return null;
  for (const tag of html.match(META) ?? []) {
    const attributes = {};
    for (const [, name, double, single] of tag.matchAll(ATTRIBUTE)) attributes[name.toLowerCase()] = double ?? single;
    if (attributes.name === 'build-version') return parseBuildStamp(attributes.content);
  }
  return null;
}

/**
 * Whether `found` is a later build than `running`. Only a later build time
 * counts: a copy that merely differs may be an older one, and moving to it
 * would take the musician backwards. AC-21.1.4/1, /2
 */
export function isNewerBuild(running, found) {
  return Boolean(running && found && found.time > running.time);
}

/**
 * The address a reload goes to: this one, carrying the commit of the newer
 * build, so that a kept copy of the plain address cannot be handed over again.
 * AC-21.1.3/1
 */
export function reloadAddress(href, commit) {
  const url = new URL(href);
  url.searchParams.set(BUILD_PARAM, commit);
  return url.href;
}

/** Whether this page was loaded for a newer build. AC-21.1.1/2 */
export function cameForBuild(href) {
  return new URL(href).searchParams.has(BUILD_PARAM);
}

/** The address without the commit it was loaded with, or null when it carries none. AC-21.1.3/1 */
export function tidyAddress(href) {
  const url = new URL(href);
  if (!url.searchParams.has(BUILD_PARAM)) return null;
  url.searchParams.delete(BUILD_PARAM);
  return url.href;
}
