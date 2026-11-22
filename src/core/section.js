/**
 * Layers under the composition (US-19.11, research.md D-026).
 *
 * A Section is the Composer's composition with library Patterns sounding
 * under it, each a distinct layer that repeats to fill the longest. Everything
 * here is pure: this module measures each Pattern's length, fits the set into
 * the shortest common loop, and merges every layer's own timeline into ONE
 * list of events per combined pass — the list the transport, the cursor and
 * the screen-off handover all consume (Constitution Principle III). Polyphony
 * is two events sharing an instant in that list, not a mode.
 *
 * Nothing is stored about lengths or repeats: they are derived from the
 * Patterns at play time, so a layer edited in the library plays as it now is.
 */
import { buildTimeline, loopDurationSeconds, buildBeatGrid } from './timeline.js';
import { cyclePasses, hasHarmony } from './harmony.js';
import { beatCount, beatNoteValue, tempoUnitOf } from './meter.js';
import { VOICES, MIN_VOLUME, MAX_VOLUME, hasFixedNotes } from './voice.js';

/** How many layers may sit under a composition (AC-19.11.1/3). */
export const MAX_LAYERS = 8;
/** How often anything may repeat within one combined loop before the set is refused (AC-19.11.3/4). */
export const MAX_REPEATS = 32;

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const lcm = (a, b) => (a / gcd(a, b)) * b;

/**
 * One harmonic cycle of the Pattern, in eighth notes — an integer for every
 * supported Time Signature (denominators 4 and 8), so lengths compare exactly
 * and the common loop is an exact multiple of each (AC-19.11.3/1).
 */
export function cycleEighths(pattern) {
  const once = pattern.measures.reduce(
    (total, m) => total + beatCount(m.timeSignature) * (beatNoteValue(m.timeSignature) === 'quarter' ? 2 : 1),
    0
  );
  return once * cyclePasses(pattern);
}

/**
 * Fit the composition and its layers into the shortest loop in which each
 * plays a whole number of times. The first entry is the composition. Returns
 * the loop's length in eighth notes and each entry's repeat count, in order;
 * a muted layer counts exactly as an unmuted one, so muting never changes the
 * loop (AC-19.11.1/4, AC-19.11.3/1).
 */
export function fitLoop(patterns) {
  const lengths = patterns.map(cycleEighths);
  const eighths = lengths.reduce((acc, n) => lcm(acc, n), 1);
  return { eighths, repeats: lengths.map((n) => eighths / n) };
}

/** Whether every entry stays within the repeat cap once `candidate` joins (AC-19.11.3/4). */
export function fits(patterns, candidate) {
  const { repeats } = fitLoop([...patterns, candidate]);
  return repeats.every((r) => r <= MAX_REPEATS);
}

/** Why `candidate` cannot be layered under `patterns`, or null when it can. */
export function refusal(patterns, candidate) {
  const { repeats } = fitLoop([...patterns, candidate]);
  if (repeats.every((r) => r <= MAX_REPEATS)) return null;
  const compositionLen = cycleEighths(patterns[0]) / 8;
  const candidateLen = cycleEighths(candidate) / 8;
  return `"${candidate.name}" doesn’t fit: ${describeLength(candidateLen)} against the composition’s ${describeLength(compositionLen)} would need more than ${MAX_REPEATS} repeats in one loop.`;
}

function describeLength(wholeNotes) {
  const n = Math.round(wholeNotes * 100) / 100;
  return `${n} whole ${n === 1 ? 'note' : 'notes'}`;
}

/**
 * Why the Pattern `candidate`, in the library as `id`, cannot join the saved
 * `section` as its last layer, or null when it can (AC-19.11.10/5).
 * `patterns` are the Section's own as they resolve, its composition first.
 */
export function joinRefusal(section, patterns, candidate, id) {
  if (usesPattern(section, id)) return `"${candidate.name}" is already a part of "${section.name}".`;
  if (section.layers.length >= MAX_LAYERS) return `"${section.name}" already has ${MAX_LAYERS} layers, the most a Section holds.`;
  return refusal(patterns, candidate);
}

/** The kind a layer is shown as: rhythm, melody or chords (AC-19.11.1/1). */
export function layerKind(pattern) {
  if (pattern.soundMode !== 'melodic') return 'rhythm';
  return hasHarmony(pattern) ? 'chords' : 'melody';
}

/**
 * A layer as it plays under the composition: the composition's tempo, tempo
 * unit, swing amount and feel, and — melodic layers only, and not a part on
 * an instrument with fixed notes (`keepKey`) — its Key. The
 * Pattern in the library is untouched (AC-19.11.2/3).
 */
export function underComposition(layer, composition, { keepKey = false } = {}) {
  // The unit is stated outright: a Pattern that states none counts its own
  // first Measure's Beat (AC-4.2.7/5), and a 7/8 layer under a 4/4 composition
  // must count the composition's quarter, not its own eighth.
  const next = {
    ...layer,
    tempo: composition.tempo,
    tempoUnit: tempoUnitOf(composition),
    swingAmount: composition.swingAmount ?? 0,
    swingFeel: composition.swingFeel,
  };
  // A part whose notes name drums keeps the Key they were written in, and so
  // the MIDI notes themselves (AC-19.13.3/2).
  if (layer.soundMode === 'melodic' && composition.key && !keepKey) next.key = composition.key;
  return next;
}

/**
 * The Pattern-shaped set the transport is handed (D-026). It carries the
 * composition's `measures`, `tempo`, `tempoUnit` and `name`, so the count-in
 * and the lock-screen title read it as they read a Pattern, plus `layers`:
 * the composition first, each with its Pattern as it plays and its repeats.
 *
 * @param {object} composition  the draft
 * @param {Array<{pattern: object, muted?: boolean, instrument?: string, volume?: number}>} layers
 * @param {{instrument?: string}} [own]  the composition's own instrument, for the export (AC-19.11.5/5)
 */
export function layered(composition, layers, { instrument } = {}) {
  const under = layers.map((l) => underComposition(l.pattern, composition, { keepKey: hasFixedNotes(l.instrument) }));
  const { eighths, repeats } = fitLoop([composition, ...under]);
  return {
    layered: true,
    name: composition.name,
    measures: composition.measures,
    tempo: composition.tempo,
    tempoUnit: tempoUnitOf(composition),
    soundMode: composition.soundMode,
    loopEighths: eighths,
    layers: [
      { pattern: composition, repeats: repeats[0], muted: false, composition: true, ...(instrument ? { instrument } : {}) },
      // Each layer's instrument and volume travel with it (US-19.12), so every
      // event can say how its part sounds.
      ...under.map((pattern, i) => ({
        pattern,
        repeats: repeats[i + 1],
        muted: Boolean(layers[i].muted),
        composition: false,
        instrument: layers[i].instrument,
        volume: layers[i].volume,
      })),
    ],
  };
}

export const isLayered = (p) => Boolean(p?.layered);

/**
 * Every unmuted layer's events for one combined pass, merged and sorted by
 * time (AC-19.11.2/1). Each layer's own timeline is built once per repeat —
 * for the sub-pass `pass × repeats + k`, so a progression layer walks its
 * chords across the repeats exactly as it does alone — and offset by the
 * repeat's start. An event says which layer it belongs to and whether that
 * is the composition; the composition's events sort first at a shared instant
 * so the cursor reads the line being written. `everySlot` adds the silent
 * Slots of the composition alone — the part on screen, the only one the
 * cursor follows (AC-19.6.4/2).
 */
export function layeredTimeline(set, pass = 0, { everySlot = false } = {}) {
  const events = [];
  set.layers.forEach((layer, index) => {
    if (layer.muted) return;
    const once = loopDurationSeconds(layer.pattern);
    const passes = passesPerLoop(layer);
    for (let k = 0; k < passes; k++) {
      for (const event of buildTimeline(layer.pattern, pass * passes + k, { everySlot: everySlot && layer.composition })) {
        events.push({
          ...event,
          timeSeconds: event.timeSeconds + k * once,
          repeat: k,
          layer: index,
          composition: layer.composition,
          instrument: layer.instrument,
          volume: layer.volume,
        });
      }
    }
  });
  return events.sort((a, b) => a.timeSeconds - b.timeSeconds || Number(b.composition) - Number(a.composition) || a.layer - b.layer);
}

/**
 * How many passes of its Pattern a layer plays in one combined loop: its
 * repeats are of its harmonic cycle, and a cycle is `cyclePasses` passes.
 */
export function passesPerLoop(layer) {
  return layer.repeats * cyclePasses(layer.pattern);
}

/** The combined loop's length: the composition's own, repeated to fill it. */
export function layeredLoopDuration(set) {
  const composition = set.layers[0];
  return loopDurationSeconds(composition.pattern) * passesPerLoop(composition);
}

/** The metronome's Beats: the composition's, once per pass. */
export function layeredBeatGrid(set, clickValue) {
  const composition = set.layers[0];
  const once = loopDurationSeconds(composition.pattern);
  const grid = buildBeatGrid(composition.pattern, clickValue);
  const beats = [];
  for (let k = 0; k < passesPerLoop(composition); k++) {
    for (const beat of grid) beats.push({ ...beat, timeSeconds: beat.timeSeconds + k * once });
  }
  return beats;
}

/** Whether any layer's timeline differs by pass — a progression anywhere. */
export function layeredHasHarmony(set) {
  return set.layers.some((l) => hasHarmony(l.pattern));
}

/* --- the timeline dispatchers the transport and the renderer call ------------ */

/**
 * One pass of an Arrangement's entry, as the transport is handed it (US-20.2):
 * a Pattern or a layered set (`inner`) with the pass it is on fixed — counted
 * from where the entry began, so the transport's own running count, which
 * spans the whole sequence, never reaches the timeline (AC-20.2.1/3). `mark`
 * rides on every event: how a bare Pattern sounds, which the event of a
 * layered set already says for itself.
 *
 * It carries what the transport reads off a Pattern — `measures`, `tempo`,
 * `tempoUnit`, `name` — as a layered set does.
 */
export function arranged(inner, pass = 0, mark = {}) {
  return {
    arranged: true,
    inner,
    pass,
    mark,
    name: inner.name,
    measures: inner.measures,
    tempo: inner.tempo,
    tempoUnit: tempoUnitOf(inner),
    soundMode: inner.soundMode,
  };
}

export const isArranged = (p) => Boolean(p?.arranged);

const innerTimeline = (p, pass, options) => (isLayered(p) ? layeredTimeline(p, pass, options) : buildTimeline(p, pass, options));

/** `options.everySlot` (AC-19.6.4) reaches a Pattern or a layered set; an Arrangement's cursor follows no Slot. */
export const timelineOf = (p, pass = 0, options = {}) =>
  isArranged(p) ? innerTimeline(p.inner, p.pass).map((event) => ({ ...event, ...p.mark, arranged: true })) : innerTimeline(p, pass, options);
export const loopDurationOf = (p) => (isArranged(p) ? loopDurationOf(p.inner) : isLayered(p) ? layeredLoopDuration(p) : loopDurationSeconds(p));
export const beatGridOf = (p, clickValue) => (isArranged(p) ? beatGridOf(p.inner, clickValue) : isLayered(p) ? layeredBeatGrid(p, clickValue) : buildBeatGrid(p, clickValue));
// An arranged pass is never the pass before it: the transport must not reuse its timeline.
export const anyHarmony = (p) => (isArranged(p) ? true : isLayered(p) ? layeredHasHarmony(p) : hasHarmony(p));

/* --- the Section: what is saved (AC-19.11.4) ---------------------------- */

/** A new, unsaved Section over a composition. `id` is null until the store assigns one. */
export function createSection(name, compositionId, layers = [], active = 0, sound = {}) {
  return { id: null, name, compositionId, ...soundOf(sound), layers: layers.map((l) => ({ patternId: l.patternId, muted: Boolean(l.muted), ...soundOf(l) })), active };
}

/**
 * A part's instrument and volume, where it has them (US-19.12). Left out when
 * unset, so a Section saved before parts had either reads back exactly
 * as it was written (AC-19.12.4/3).
 */
export function soundOf(part) {
  const sound = {};
  if (part?.instrument) sound.instrument = part.instrument;
  if (part?.volume !== undefined && part?.volume !== null) sound.volume = part.volume;
  return sound;
}

/** Set a layer's instrument or volume (AC-19.12.2/2, AC-19.12.3/2). */
export function setLayerSound(section, index, sound) {
  if (!section.layers[index]) throw new Error(`No layer at index ${index}`);
  return { ...section, layers: section.layers.map((l, i) => (i === index ? { ...l, ...sound } : l)) };
}

/**
 * Add a layer at the end. The same Pattern is never layered twice, the
 * composition is never a layer of itself, and the count is capped
 * (AC-19.11.1/3). Whether it FITS is the caller's check, since that needs the
 * Patterns themselves (`refusal`).
 */
export function addLayer(section, patternId, sound = {}) {
  if (patternId === section.compositionId) throw new Error('The composition cannot be a layer under itself');
  if (section.layers.some((l) => l.patternId === patternId)) throw new Error('That Pattern is already a layer');
  if (section.layers.length >= MAX_LAYERS) throw new Error(`At most ${MAX_LAYERS} layers`);
  return { ...section, layers: [...section.layers, { patternId, muted: false, ...soundOf(sound) }] };
}

export function removeLayer(section, index) {
  if (!section.layers[index]) throw new Error(`No layer at index ${index}`);
  return { ...section, layers: section.layers.filter((_, i) => i !== index) };
}

export function setLayerMuted(section, index, muted) {
  if (!section.layers[index]) throw new Error(`No layer at index ${index}`);
  return { ...section, layers: section.layers.map((l, i) => (i === index ? { ...l, muted: Boolean(muted) } : l)) };
}

/** Problems with a Section's shape, as messages; empty when it is sound. */
export function validateSection(section) {
  const problems = [];
  if (!section || typeof section !== 'object') return ['A Section must be an object'];
  if (typeof section.name !== 'string' || !section.name.trim()) problems.push('A Section needs a name');
  if (typeof section.compositionId !== 'string' || !section.compositionId) problems.push('A Section needs a composition');
  // No layers is a Section of the composition alone (AC-19.11.4/1).
  if (!Array.isArray(section.layers)) problems.push('A Section needs its layers as a list');
  else {
    // The part on screen: the composition (0) or a layer, by position (AC-19.11.6/6).
    const active = section.active ?? 0;
    if (!Number.isInteger(active) || active < 0 || active > section.layers.length) problems.push('The part on screen must be one of the parts');
    if (section.layers.length > MAX_LAYERS) problems.push(`At most ${MAX_LAYERS} layers`);
    const seen = new Set();
    for (const layer of section.layers) {
      if (!layer || typeof layer.patternId !== 'string') problems.push('A layer needs a Pattern');
      else if (seen.has(layer.patternId)) problems.push(`"${layer.patternId}" is layered twice`);
      else if (layer.patternId === section.compositionId) problems.push('The composition cannot be a layer under itself');
      seen.add(layer?.patternId);
      problems.push(...soundProblems(layer));
    }
    problems.push(...soundProblems(section));
  }
  return problems;
}

/** A part's instrument must be one of the catalogue's and its volume a whole number from 1 to 100 (AC-19.12.4/1). */
function soundProblems(part) {
  const problems = [];
  if (part?.instrument !== undefined && !VOICES.includes(part.instrument)) problems.push(`"${part.instrument}" is not an instrument`);
  if (part?.volume !== undefined && (!Number.isInteger(part.volume) || part.volume < MIN_VOLUME || part.volume > MAX_VOLUME)) {
    problems.push(`A volume must be a whole number from ${MIN_VOLUME} to ${MAX_VOLUME}`);
  }
  return problems;
}

/** Whether the Section uses `patternId` as its composition or a layer (AC-19.11.4/5). */
export function usesPattern(section, patternId) {
  return section.compositionId === patternId || (section.layers ?? []).some((l) => l.patternId === patternId);
}
