/**
 * The Composer's draft (US-19.4–US-19.9, research.md D-016).
 *
 * A draft is a Melodic Pattern that may hold sounding Slots with no Pitch —
 * which `validate` forbids in storage, and which is exactly the state a line
 * is in while it is being recorded. Everything here is pure: where Record
 * points, what a tapped MIDI note becomes, how a library Pattern turns into a
 * draft, and whether the draft is complete enough to be a Pattern again.
 */
import { resolve, keySemitones, noteName, degreeSemitones, isSupportedKey, octaveNumber, MIN_OCTAVE, MAX_OCTAVE } from './pitch.js';
import { chromaticStrip, DEFAULT_SCALE, isValidScale } from './scales.js';
import { cycleAccent, append, MAX_MEASURES } from './pattern.js';
import { buildTimeline } from './timeline.js';
import { cyclePasses, hasHarmony } from './harmony.js';
import { roleIdFor, intervalLabelFor } from './fretboard.js';

const clone = (v) => structuredClone(v);
const mod12 = (n) => ((n % 12) + 12) % 12;

/* --- notes ---------------------------------------------------------------- */

/**
 * A MIDI note as a Pitch of a Key: the degree token the scale spells that
 * semitone with — `b5` in Locrian, `#4` in Lydian — or the default chromatic
 * token outside the scale, and whatever octave offset makes `resolve` hand the
 * same MIDI note back (AC-19.4.4).
 */
export function pitchFromMidi(midi, key, scaleId = DEFAULT_SCALE) {
  if (!Number.isInteger(midi)) throw new Error(`MIDI note must be an integer, got ${midi}`);
  if (!isSupportedKey(key)) throw new Error(`Unsupported Key: ${key}`);
  const semitone = mod12(midi - keySemitones(key));
  const degree = chromaticStrip(isValidScale(scaleId) ? scaleId : DEFAULT_SCALE)[semitone].token;
  const atZero = resolve({ degree, octaveOffset: 0 }, key).midiNote;
  const octaveOffset = Math.round((midi - atZero) / 12);
  return { degree, octaveOffset };
}

/**
 * How a note reads against a Key and scale: its semitone above the root, whether
 * the scale holds it, its colour role, and its labels in each label mode.
 * Shared by the fretboard, the keyboard and the composing grid.
 */
export function describeNote(midi, key, scaleId = DEFAULT_SCALE) {
  const semitoneFromRoot = mod12(midi - keySemitones(key));
  const strip = chromaticStrip(isValidScale(scaleId) ? scaleId : DEFAULT_SCALE);
  const inScale = strip[semitoneFromRoot].inScale;
  const pitch = pitchFromMidi(midi, key, scaleId);
  let named;
  try {
    named = noteName(pitch, key);
  } catch {
    named = null;
  }
  const letterName = named ? `${named.letter}${named.accidental}` : '';
  return {
    midi,
    semitoneFromRoot,
    inScale,
    isRoot: semitoneFromRoot === 0,
    roleId: roleIdFor(semitoneFromRoot),
    degree: pitch.degree,
    pitch,
    /** Letter and accidental, as a fret or key is labelled. */
    name: letterName,
    /** With the octave, as the composing grid names it. */
    fullName: named?.text ?? letterName,
    interval: intervalLabelFor(semitoneFromRoot),
  };
}

/** The label a note carries under a label mode: in-scale by the mode, out-of-scale always by name (AC-19.2.2/2). */
export function labelFor(note, labelMode) {
  if (!note.inScale) return note.name;
  if (labelMode === 'degrees') return note.degree;
  if (labelMode === 'intervals') return note.interval;
  return note.name;
}

/* --- the sounding Slots, in playing order ---------------------------------- */

/** Every sounding Slot as an address, Measure by Measure, Beat by Beat, Slot by Slot. */
export function soundingSlots(pattern) {
  const out = [];
  pattern.measures.forEach((measure, measureIndex) => {
    measure.beats.forEach((beat, beatIndex) => {
      beat.slots.forEach((slot, slotIndex) => {
        if (slot.on) out.push({ measureIndex, beatIndex, slotIndex });
      });
    });
  });
  return out;
}

export function slotAt(pattern, at) {
  return pattern.measures[at.measureIndex]?.beats[at.beatIndex]?.slots[at.slotIndex] ?? null;
}

export const sameSlot = (a, b) =>
  Boolean(a && b) && a.measureIndex === b.measureIndex && a.beatIndex === b.beatIndex && a.slotIndex === b.slotIndex;

const hasNote = (slot) => Boolean(slot?.on && slot.pitch);

/** How many sounding Slots have no note yet (AC-19.9.1/1). */
export function missingCount(pattern) {
  return soundingSlots(pattern).filter((at) => !hasNote(slotAt(pattern, at))).length;
}

/** Whether any note is recorded at all — what Double Length has to ask about (AC-19.5.4/1, /5). */
export function hasAnyNote(pattern) {
  return soundingSlots(pattern).some((at) => hasNote(slotAt(pattern, at)));
}

/** Complete when every sounding Slot has a note — the condition for being a Pattern again. */
export function isComplete(pattern) {
  return missingCount(pattern) === 0;
}

/** Where Record starts: the first sounding Slot with no note, or null when none (AC-19.4.1). */
export function recordTarget(pattern) {
  return soundingSlots(pattern).find((at) => !hasNote(slotAt(pattern, at))) ?? null;
}

/** The next sounding Slot after `at` with no note, or null when none remains (AC-19.4.2/2). */
export function nextTarget(pattern, at) {
  const order = soundingSlots(pattern);
  const index = order.findIndex((a) => sameSlot(a, at));
  return order.slice(index + 1).find((a) => !hasNote(slotAt(pattern, a))) ?? null;
}

/** The nearest sounding Slot before `at`, or null at the first (AC-19.4.3). */
export function previousSounding(pattern, at) {
  const order = soundingSlots(pattern);
  const index = order.findIndex((a) => sameSlot(a, at));
  return index > 0 ? order[index - 1] : null;
}

/* --- mutations: every one returns a NEW Pattern ------------------------------ */

/**
 * The same notes in another Key: every pitch re-spelled so it resolves to the
 * MIDI note it did before. What a Key change does to a part whose notes name
 * drums rather than degrees (AC-19.13.3, research.md D-029).
 */
export function retune(pattern, key) {
  if (!isSupportedKey(key)) throw new Error(`Unsupported Key: ${key}`);
  const from = pattern.key;
  if (!isSupportedKey(from) || from === key) return { ...pattern, key };
  const next = clone(pattern);
  const scale = next.scale ?? DEFAULT_SCALE;
  for (const measure of next.measures) {
    for (const beat of measure.beats) {
      for (const slot of beat.slots) {
        if (!slot.pitch) continue;
        slot.pitch = { ...slot.pitch, ...pitchFromMidi(resolve(slot.pitch, from).midiNote, key, scale) };
      }
    }
  }
  next.key = key;
  return next;
}

/** Give a sounding Slot the note a MIDI number names in this draft's Key (AC-19.4.2/1). */
export function recordNote(pattern, at, midi) {
  const next = clone(pattern);
  const slot = slotAt(next, at);
  if (!slot?.on) throw new Error('A note may only be recorded onto a sounding Slot');
  slot.pitch = pitchFromMidi(midi, next.key, next.scale ?? DEFAULT_SCALE);
  return next;
}

/** Take a Slot's note away; it sounds percussively until recorded again (AC-19.5.2/3). */
export function clearNote(pattern, at) {
  const next = clone(pattern);
  const slot = slotAt(next, at);
  if (slot) delete slot.pitch;
  return next;
}

/**
 * Take every Slot's note away at once; the rhythm itself — which Slots sound,
 * and how hard — is untouched, so it sounds percussively until recorded again
 * and Record starts on the first syllable (AC-19.5.6/2).
 */
export function clearAllNotes(pattern) {
  const next = clone(pattern);
  for (const measure of next.measures) {
    for (const beat of measure.beats) for (const slot of beat.slots) delete slot.pitch;
  }
  return next;
}

/* --- a whole part, an octave at a time (US-19.14) ---------------------------- */

/** Every note's octave number, lowest and highest, or null for a part with no note. */
function octaveSpan(pattern) {
  let low = Infinity;
  let high = -Infinity;
  for (const at of soundingSlots(pattern)) {
    const slot = slotAt(pattern, at);
    if (!hasNote(slot)) continue;
    const octave = octaveNumber(slot.pitch.octaveOffset ?? 0);
    low = Math.min(low, octave);
    high = Math.max(high, octave);
  }
  return high === -Infinity ? null : { low, high };
}

/**
 * Why a part cannot move an octave the way asked, or null when it can
 * (AC-19.14.1/2): there is no note to move, or one already sits in the last
 * octave a note can be stored in. Refused rather than squashed — notes held at
 * the edge while the rest moved could not be shifted back.
 */
export function octaveShiftRefusal(pattern, direction) {
  const span = octaveSpan(pattern);
  if (!span) return 'No note to move';
  if (direction > 0 && span.high >= MAX_OCTAVE) return `A note is already in octave ${MAX_OCTAVE}, the highest`;
  if (direction < 0 && span.low <= MIN_OCTAVE) return `A note is already in octave ${MIN_OCTAVE}, the lowest`;
  return null;
}

/**
 * Every note one octave up (`direction` 1) or down (-1), and nothing else: each
 * Pitch keeps its degree or its chord-tone role, each Slot its accent
 * (AC-19.14.3/1). The Pattern handed in is returned when the shift is refused.
 */
export function shiftOctave(pattern, direction) {
  const step = direction > 0 ? 1 : -1;
  if (octaveShiftRefusal(pattern, step)) return pattern;
  const next = clone(pattern);
  for (const measure of next.measures) {
    for (const beat of measure.beats) {
      for (const slot of beat.slots) {
        if (hasNote(slot)) slot.pitch.octaveOffset = (slot.pitch.octaveOffset ?? 0) + step;
      }
    }
  }
  return next;
}

/** A part as a new Pattern an octave away, under another name (AC-19.14.4/2). */
export function octaveCopy(pattern, direction, name) {
  const next = shiftOctave(pattern, direction);
  const copy = { ...clone(next), name, rating: 0 };
  delete copy.id;
  return copy;
}

/**
 * The syllable box's tap: the grid's own accent cycle (AC-19.5.3/1). A Slot
 * that comes on has no note until recorded, so nothing is stamped here, unlike
 * `onSlotTap` in Practice; a Slot cycled off loses its Pitch with its accent,
 * which `cycleAccent` already does.
 */
export function cycleSyllable(pattern, at) {
  return cycleAccent(pattern, at.measureIndex, at.beatIndex, at.slotIndex);
}

/** Double Length, starting percussive: the copy without its notes (AC-19.5.4/2). */
export function duplicateUnpitched(pattern) {
  const copy = clone(pattern);
  for (const measure of copy.measures) {
    for (const beat of measure.beats) for (const slot of beat.slots) delete slot.pitch;
  }
  return append(pattern, copy);
}

// Double Length keeping the notes is `duplicate` from core/pattern.js (US-10.1):
// a clone carries every Pitch, which is exactly AC-19.5.4/4.

export function canDuplicate(pattern) {
  return pattern.measures.length * 2 <= MAX_MEASURES;
}

/* --- from the library ---------------------------------------------------- */

/** What the Composer needs to know about a Pattern before opening it (US-19.8). */
export function loadKind(pattern) {
  if (pattern.soundMode !== 'melodic') return 'percussive';
  if (hasHarmony(pattern)) return 'harmonic';
  return 'melodic';
}

/** A percussive rhythm as an empty line in C Ionian, accents kept (AC-19.8.1/2). */
export function fromPercussive(pattern, name) {
  const next = clone(pattern);
  delete next.id;
  delete next.harmony;
  delete next.register;
  for (const measure of next.measures) {
    for (const beat of measure.beats) for (const slot of beat.slots) delete slot.pitch;
  }
  return { ...next, name, soundMode: 'melodic', key: 'C', scale: DEFAULT_SCALE, rating: 0 };
}

/**
 * A Pattern with a progression, as the notes it would sound (AC-19.8.2): the
 * timeline of each pass — the same one playback and the MIDI file use, Register
 * included — written back as stored degrees, the harmonic cycle unrolled into
 * Measures while it fits within the cap and the first pass alone otherwise.
 */
export function bakeHarmony(pattern, name) {
  const passes = cyclePasses(pattern);
  const perPass = pattern.measures.length;
  const unrolled = passes * perPass <= MAX_MEASURES;
  const passCount = unrolled ? passes : 1;
  const key = pattern.key;
  const scale = pattern.scale ?? DEFAULT_SCALE;

  const measures = [];
  for (let pass = 0; pass < passCount; pass++) {
    const chunk = clone(pattern.measures);
    for (const measure of chunk) {
      for (const beat of measure.beats) for (const slot of beat.slots) delete slot.pitch;
    }
    for (const event of buildTimeline(pattern, pass)) {
      if (!event.pitch) continue;
      const slot = chunk[event.measureIndex].beats[event.beatIndex].slots[event.slotIndex];
      slot.pitch = pitchFromMidi(event.pitch.midiNote, key, scale);
    }
    measures.push(...chunk);
  }

  const next = { ...clone(pattern), name, measures, rating: 0 };
  delete next.id;
  delete next.harmony;
  delete next.register;
  next.scale = scale;
  return { pattern: next, unrolled, passes };
}

/** A melody with its Register folded into every note's octave, so what is shown is what sounds (AC-19.8.3/3). */
export function foldRegister(pattern) {
  const next = clone(pattern);
  const register = next.register ?? 0;
  delete next.register;
  if (register === 0) return next;
  for (const measure of next.measures) {
    for (const beat of measure.beats) {
      for (const slot of beat.slots) {
        if (slot.pitch?.degree !== undefined) {
          slot.pitch.octaveOffset = (slot.pitch.octaveOffset ?? 0) + register;
        }
      }
    }
  }
  return next;
}

/** A melody as a new, unsaved composition under another name (AC-19.8.3/1, /2). */
export function copyMelody(pattern, name) {
  const next = foldRegister(pattern);
  delete next.id;
  return { ...next, name, rating: 0 };
}

/** The semitones a stored degree token spans — exposed for the keyboard's octave marks. */
export { degreeSemitones };
