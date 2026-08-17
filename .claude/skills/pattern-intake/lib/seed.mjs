/**
 * Adding an accepted Pattern to the shipped library.
 *
 * Curation is a data change (CLAUDE.md §7): this edits `data/seed-patterns.json`
 * and nothing else, so there is exactly one way shipped Patterns come into
 * being and no maintainer mode to drift from the file.
 *
 * APPENDED, NEVER INSERTED. Shipped ids are positional — `seedId(i)` is
 * `s_${i + 1}` — so inserting anywhere but the end renumbers every later Pattern
 * and orphans the ratings and added Tags that `rm.overlays.v1` keys by id. That
 * is silent data loss for every user who has ever rated a Pattern, which is why
 * this module refuses to write anywhere but the end.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** The seed file, parsed, with its Patterns' positional ids attached. */
export function readSeed(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw.schemaVersion !== 1) {
    throw new Error(`seed schemaVersion is ${raw.schemaVersion}, expected 1`);
  }
  return raw;
}

/** The id a Pattern appended at `index` will be given. Mirrors storage/seed.js. */
export const seedId = (index) => `s_${index + 1}`;

/**
 * A name already in the library, if there is one.
 *
 * Case-insensitive, because two Patterns whose names differ only in case are
 * indistinguishable in a list — the same rule the app applies to a user naming
 * their own Pattern (AC-7.3.5).
 */
export function findNameClash(seed, name) {
  const target = name.trim().toLowerCase();
  return seed.patterns.find((p) => p.name.trim().toLowerCase() === target) ?? null;
}

/**
 * Append Patterns and write the file back.
 *
 * Returns what was added and the id each was given, so the caller can report it
 * rather than the maintainer having to go and look.
 *
 * @param {string} path
 * @param {Array<object>} patterns  in seed-file shape
 * @param {{force?: boolean}} [options]  force accepts a name that already exists
 */
export function appendPatterns(path, patterns, { force = false } = {}) {
  const seed = readSeed(path);
  const before = seed.patterns.length;

  const clashes = [];
  for (const p of patterns) {
    const clash = findNameClash(seed, p.name);
    if (clash) clashes.push(`"${p.name}" is already in the library`);
  }
  // Names within this same batch, too — two new Patterns called the same thing
  // would pass the check above and still be indistinguishable afterwards.
  const seen = new Set();
  for (const p of patterns) {
    const key = p.name.trim().toLowerCase();
    if (seen.has(key)) clashes.push(`"${p.name}" appears twice in this batch`);
    seen.add(key);
  }
  if (clashes.length && !force) {
    throw new Error(`Refusing to append:\n  ${clashes.join('\n  ')}\nRename, or pass --force.`);
  }

  const added = patterns.map((pattern, i) => ({ id: seedId(before + i), name: pattern.name }));
  seed.patterns.push(...patterns);

  // Two-space indent with a trailing newline: what the file already uses, so the
  // diff is the Patterns added and nothing else.
  writeFileSync(path, JSON.stringify(seed, null, 2) + '\n');

  return { added, before, after: seed.patterns.length };
}
