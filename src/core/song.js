/**
 * Songs: an ordered list of Sections, each Section a Pattern and an ordered
 * list of entries `{ fill, repeats }` (US-18.1). One repeat is one harmonic
 * cycle of the Section's Pattern — the passes its progression needs to return
 * to its first chord (AC-2.7.2/1) — so an entry is in force for
 * `repeats × cyclePasses(pattern)` passes, and the next takes over from the
 * very next pass with nothing stopped or restarted (AC-18.1.3/1). After the
 * last entry the first is in force again (AC-18.1.3/2).
 *
 * Pure. Every editor returns a new Song and leaves its argument alone. The id
 * is assigned by the store, never here.
 */
import { ARPEGGIOS, cyclePasses, withArpeggio } from './harmony.js';

export const MIN_REPEATS = 1;
export const MAX_REPEATS = 16;

const isFill = (fill) => ARPEGGIOS.some((a) => a.id === fill);
const isRepeats = (repeats) => Number.isInteger(repeats) && repeats >= MIN_REPEATS && repeats <= MAX_REPEATS;

function assertEntry(fill, repeats) {
  if (!isFill(fill)) throw new Error(`Unknown fill: ${fill}`);
  if (!isRepeats(repeats)) throw new Error(`Repeats must be a whole number from ${MIN_REPEATS} to ${MAX_REPEATS}`);
}

const clone = (song) => JSON.parse(JSON.stringify(song));

function section(song, sectionIndex) {
  const s = song.sections[sectionIndex];
  if (!s) throw new Error(`No Section at index ${sectionIndex}`);
  return s;
}

function entry(song, sectionIndex, entryIndex) {
  const e = section(song, sectionIndex).entries[entryIndex];
  if (!e) throw new Error(`No entry at index ${entryIndex} in Section ${sectionIndex}`);
  return e;
}

/** A new, empty Song over one Pattern. `id` is null until the store assigns one. */
export function createSong(name, patternId) {
  return { id: null, name, sections: [{ patternId, entries: [] }] };
}

export function addEntry(song, sectionIndex, fill, repeats) {
  assertEntry(fill, repeats);
  const next = clone(song);
  section(next, sectionIndex).entries.push({ fill, repeats });
  return next;
}

export function removeEntry(song, sectionIndex, entryIndex) {
  entry(song, sectionIndex, entryIndex);
  const next = clone(song);
  section(next, sectionIndex).entries.splice(entryIndex, 1);
  return next;
}

/** Move an entry one place up (-1) or down (+1); a no-op at either end. */
export function moveEntry(song, sectionIndex, entryIndex, direction) {
  entry(song, sectionIndex, entryIndex);
  if (direction !== -1 && direction !== 1) throw new Error('Direction must be -1 or +1');
  const entries = section(song, sectionIndex).entries;
  const target = entryIndex + direction;
  if (target < 0 || target >= entries.length) return song;
  const next = clone(song);
  const list = section(next, sectionIndex).entries;
  [list[entryIndex], list[target]] = [list[target], list[entryIndex]];
  return next;
}

export function setEntryRepeats(song, sectionIndex, entryIndex, repeats) {
  const e = entry(song, sectionIndex, entryIndex);
  assertEntry(e.fill, repeats);
  const next = clone(song);
  section(next, sectionIndex).entries[entryIndex].repeats = repeats;
  return next;
}

/** Passes an entry is in force for over `pattern`: its repeats, each one harmonic cycle. */
export function entryPasses(pattern, entry) {
  return entry.repeats * cyclePasses(pattern);
}

const sectionPasses = (s, patternById) => {
  const pattern = patternById(s.patternId);
  if (!pattern) return 0;
  return s.entries.reduce((sum, e) => sum + entryPasses(pattern, e), 0);
};

/** Passes the whole Song plays once through: the sum over every Section's entries. */
export function totalPasses(song, patternById) {
  return (song?.sections ?? []).reduce((sum, s) => sum + sectionPasses(s, patternById), 0);
}

/**
 * The entry in force for absolute pass `loop`, looping the whole Song once past
 * the end (AC-18.1.3/2). Null for a Song with nothing in it.
 *
 * @returns {{ sectionIndex: number, entryIndex: number, fill: string, passInEntry: number }|null}
 */
export function entryAt(song, patternById, loop) {
  const total = totalPasses(song, patternById);
  if (total <= 0) return null;
  let remaining = ((Math.floor(loop) % total) + total) % total;
  for (let sectionIndex = 0; sectionIndex < song.sections.length; sectionIndex++) {
    const s = song.sections[sectionIndex];
    const pattern = patternById(s.patternId);
    if (!pattern) continue;
    for (let entryIndex = 0; entryIndex < s.entries.length; entryIndex++) {
      const span = entryPasses(pattern, s.entries[entryIndex]);
      if (remaining < span) {
        return { sectionIndex, entryIndex, fill: s.entries[entryIndex].fill, passInEntry: remaining };
      }
      remaining -= span;
    }
  }
  return null;
}

/**
 * The Pattern sounding on pass `loop`: the Section's Pattern with the entry's
 * fill in force — a playback overlay, never stored (AC-2.7.1/4). Null when the
 * Song is empty.
 */
export function playingAt(song, patternById, loop) {
  const at = entryAt(song, patternById, loop);
  if (!at) return null;
  return withArpeggio(patternById(song.sections[at.sectionIndex].patternId), at.fill);
}

/** Problems with a Song's shape; empty when it is valid. */
export function validateSong(song) {
  const problems = [];
  if (!song || typeof song !== 'object') return ['Song must be an object'];
  if (typeof song.name !== 'string' || song.name.trim() === '') problems.push('Song name must be a non-empty string');
  if (!Array.isArray(song.sections) || song.sections.length < 1) {
    problems.push('Song must have at least one Section');
    return problems;
  }
  song.sections.forEach((s, i) => {
    if (!s || typeof s.patternId !== 'string' || s.patternId === '') problems.push(`Section ${i} must name a Pattern`);
    if (!s || !Array.isArray(s.entries)) {
      problems.push(`Section ${i} must have an entries array`);
      return;
    }
    s.entries.forEach((e, j) => {
      if (!e || !isFill(e.fill)) problems.push(`Section ${i} entry ${j} has an unknown fill: ${e?.fill}`);
      if (!e || !isRepeats(e.repeats)) {
        problems.push(`Section ${i} entry ${j} repeats must be a whole number from ${MIN_REPEATS} to ${MAX_REPEATS}`);
      }
    });
  });
  return problems;
}
