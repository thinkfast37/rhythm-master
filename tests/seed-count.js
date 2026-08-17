import { readFileSync } from 'node:fs';

/**
 * The shipped library's size, read from the data file the library ships from.
 *
 * The library grows by addition — Patterns are appended to
 * `data/seed-patterns.json` and no code changes (US-16.2). A literal count
 * baked into a spec sentence or an assertion is therefore stale the moment the
 * next Pattern lands, so nothing hardcodes one. Tests still assert the count:
 * they assert that the loader, the library list and its counter all agree with
 * the data file, which is the part that can actually break.
 */
export const SEED_PATTERN_COUNT = JSON.parse(
  readFileSync(new URL('../data/seed-patterns.json', import.meta.url), 'utf8')
).patterns.length;
