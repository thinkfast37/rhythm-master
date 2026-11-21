/**
 * An Arrangement (US-20.1): the Sections, Patterns and Chains a piece is made
 * of, gathered in a palette and laid out one after another as a sequence of
 * entries, each with a name of its own and a number of repeats.
 *
 * It names what it is made of by kind and id and never carries a copy
 * (AC-20.1.4/6). Pure. Every editor returns a new Arrangement and leaves its
 * argument alone; the id is assigned by the store, never here.
 */

import { MIN_TEMPO, MAX_TEMPO } from './pattern.js';

/** What an Arrangement can be made of. */
export const ITEM_KINDS = Object.freeze(['pattern', 'section', 'chain']);

export const MIN_REPEATS = 1;
export const MAX_REPEATS = 16;

const clone = (v) => structuredClone(v);
const isKind = (kind) => ITEM_KINDS.includes(kind);
const same = (a, kind, id) => a.kind === kind && a.id === id;

/** A new, empty Arrangement. `id` is null until the store assigns one. */
export function createArrangement(name = '') {
  return { id: null, name, palette: [], entries: [] };
}

/** Repeats as a whole number held to 1–16 (AC-20.1.3/2). */
export function normaliseRepeats(repeats) {
  const n = Math.round(Number(repeats));
  if (!Number.isFinite(n)) return MIN_REPEATS;
  return Math.min(MAX_REPEATS, Math.max(MIN_REPEATS, n));
}

/** Whether the palette already holds this item (AC-20.1.2/2). */
export function inPalette(arrangement, kind, id) {
  return (arrangement.palette ?? []).some((p) => same(p, kind, id));
}

/** Put an item in the palette, at the end; one already there is not added again (AC-20.1.2/2). */
export function addToPalette(arrangement, kind, id) {
  if (!isKind(kind)) throw new Error(`Unknown kind: ${kind}`);
  if (typeof id !== 'string' || id === '') throw new Error('A palette entry needs an id');
  if (inPalette(arrangement, kind, id)) return arrangement;
  return { ...arrangement, palette: [...arrangement.palette, { kind, id }] };
}

/** Take a palette entry out. The sequence is left as it is: the palette is a shortlist (AC-20.1.2/3). */
export function removeFromPalette(arrangement, index) {
  if (!arrangement.palette[index]) throw new Error(`No palette entry at index ${index}`);
  return { ...arrangement, palette: arrangement.palette.filter((_, i) => i !== index) };
}

/** Lay an item at the end of the sequence, named and played once unless told otherwise (AC-20.1.3/1). */
export function addEntry(arrangement, kind, id, name, repeats = MIN_REPEATS) {
  if (!isKind(kind)) throw new Error(`Unknown kind: ${kind}`);
  if (typeof id !== 'string' || id === '') throw new Error('A sequence entry needs an id');
  return { ...arrangement, entries: [...arrangement.entries, { kind, id, name: String(name ?? ''), repeats: normaliseRepeats(repeats) }] };
}

function entryAt(arrangement, index) {
  if (!arrangement.entries[index]) throw new Error(`No sequence entry at index ${index}`);
  return arrangement.entries[index];
}

export function removeEntry(arrangement, index) {
  entryAt(arrangement, index);
  return { ...arrangement, entries: arrangement.entries.filter((_, i) => i !== index) };
}

/** Move an entry one place up (`direction` -1) or down (1); at either end it stays (AC-20.1.3/3). */
export function moveEntry(arrangement, index, direction) {
  entryAt(arrangement, index);
  const target = index + (direction > 0 ? 1 : -1);
  if (target < 0 || target >= arrangement.entries.length) return arrangement;
  const entries = clone(arrangement.entries);
  [entries[index], entries[target]] = [entries[target], entries[index]];
  return { ...arrangement, entries };
}

export function setEntryRepeats(arrangement, index, repeats) {
  entryAt(arrangement, index);
  return { ...arrangement, entries: arrangement.entries.map((e, i) => (i === index ? { ...e, repeats: normaliseRepeats(repeats) } : e)) };
}

/** The Arrangement's own name for an entry; an empty one is refused and the entry keeps its name (AC-20.1.3/2). */
export function setEntryName(arrangement, index, name) {
  const entry = entryAt(arrangement, index);
  const trimmed = String(name ?? '').trim();
  if (trimmed === '' || trimmed === entry.name) return arrangement;
  return { ...arrangement, entries: arrangement.entries.map((e, i) => (i === index ? { ...e, name: trimmed } : e)) };
}

/* --- its tempo, and where a pass falls in the sequence (US-20.2) ------------- */

/** A tempo as a whole number of quarter notes a minute, held to 18–300 (AC-20.2.3/2). */
export function normaliseTempo(bpm) {
  const n = Math.round(Number(bpm));
  if (!Number.isFinite(n)) return MIN_TEMPO;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, n));
}

/** The Arrangement's own tempo; nothing it is made of is touched (AC-20.2.3/3). */
export function setTempo(arrangement, bpm) {
  return { ...arrangement, tempo: normaliseTempo(bpm) };
}

/**
 * How many passes each sequence entry lasts: its repeats, each one once
 * through what it plays (AC-20.2.1/2). `passesOf(entry, index)` says how many
 * passes that is — 0 for an entry with nothing left to play, which is then
 * passed over (AC-20.2.1/6).
 */
export function sequencePasses(entries, passesOf) {
  return (entries ?? []).map((entry, index) => {
    const once = Math.max(0, Math.floor(passesOf(entry, index) || 0));
    return once * entry.repeats;
  });
}

/**
 * The sequence entry sounding on absolute pass `loop`, the sequence looping
 * once past its end (AC-20.2.1/1): which entry, which of its repeats, and the
 * pass counted from where the entry began — so a progression starts from its
 * first chord each time (AC-20.2.1/3). Null when nothing in it can play.
 *
 * @returns {{ index: number, passInEntry: number, repeat: number }|null}
 */
export function entryAtPass(entries, passesOf, loop) {
  const spans = sequencePasses(entries, passesOf);
  const total = spans.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return null;
  let remaining = ((Math.floor(loop) % total) + total) % total;
  for (let index = 0; index < spans.length; index++) {
    if (remaining < spans[index]) {
      const once = spans[index] / entries[index].repeats;
      return { index, passInEntry: remaining, repeat: Math.floor(remaining / once) };
    }
    remaining -= spans[index];
  }
  return null;
}

/** Whether the Arrangement names this item, in its palette or its sequence (AC-20.1.4/5). */
export function usesItem(arrangement, kind, id) {
  return [...(arrangement.palette ?? []), ...(arrangement.entries ?? [])].some((x) => same(x, kind, id));
}

/** Whether there is anything in it at all — what New asks about before discarding (AC-20.1.4/4). */
export function isEmpty(arrangement) {
  return (arrangement?.palette ?? []).length === 0 && (arrangement?.entries ?? []).length === 0;
}

/** Problems with an Arrangement's shape, as messages; empty when it is sound. */
export function validateArrangement(arrangement) {
  if (!arrangement || typeof arrangement !== 'object') return ['An Arrangement must be an object'];
  const problems = [];
  if (typeof arrangement.name !== 'string' || arrangement.name.trim() === '') problems.push('An Arrangement needs a name');
  if (arrangement.tempo !== undefined && (!Number.isInteger(arrangement.tempo) || arrangement.tempo < MIN_TEMPO || arrangement.tempo > MAX_TEMPO)) {
    problems.push(`A tempo must be a whole number from ${MIN_TEMPO} to ${MAX_TEMPO}`);
  }
  if (!Array.isArray(arrangement.palette)) problems.push('An Arrangement needs a palette');
  else {
    const seen = new Set();
    for (const p of arrangement.palette) {
      if (!p || !isKind(p.kind) || typeof p.id !== 'string' || p.id === '') problems.push('A palette entry needs a kind and an id');
      else if (seen.has(`${p.kind}:${p.id}`)) problems.push(`"${p.id}" is in the palette twice`);
      if (p) seen.add(`${p.kind}:${p.id}`);
    }
  }
  if (!Array.isArray(arrangement.entries)) problems.push('An Arrangement needs a sequence');
  else {
    arrangement.entries.forEach((e, i) => {
      if (!e || !isKind(e.kind) || typeof e.id !== 'string' || e.id === '') problems.push(`Entry ${i + 1} needs a kind and an id`);
      if (!e || typeof e.name !== 'string' || e.name.trim() === '') problems.push(`Entry ${i + 1} needs a name`);
      if (!e || !Number.isInteger(e.repeats) || e.repeats < MIN_REPEATS || e.repeats > MAX_REPEATS) {
        problems.push(`Entry ${i + 1} repeats must be a whole number from ${MIN_REPEATS} to ${MAX_REPEATS}`);
      }
    });
  }
  return problems;
}
