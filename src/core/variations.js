/**
 * Variations: a loop lengthened by a copy of its phrase with one compositional
 * device applied (US-10.3, research.md D-020).
 *
 * A device is one exact rule, `(phrase, context) → phrase`, with an
 * availability beside it that says why it cannot apply — nothing here guesses,
 * and nothing here rolls dice: `pick` takes its random number from the caller,
 * as Give me one does (US-14.1), so `core/` stays deterministic.
 *
 * The phrase is the Pattern's first N Measures (the original) or its last N
 * (the latest copy). Each device returns those Measures altered; `addVariation`
 * appends them through the same `append` Double Length uses, so the result is
 * ordinary Pattern content (AC-10.3.5).
 */
import { append, MAX_MEASURES } from './pattern.js';
import { beatNoteValue } from './meter.js';
import { slotCount } from './recipes.js';
import { defaultAccent, effectiveAccent, WEAK, MEDIUM, STRONG } from './accents.js';
import { degreeSemitones, MIN_OCTAVE, MAX_OCTAVE, BASE_OCTAVE } from './pitch.js';
import { chromaticStrip, DEFAULT_SCALE, isValidScale } from './scales.js';
import {
  hasHarmony,
  chordIn,
  memberFor,
  hasTone,
  arpeggioDeal,
  soundingPitch,
  stepAsDegree,
  fillIndexOf,
  withArpeggio,
  ARPEGGIOS,
} from './harmony.js';

const clone = (v) => structuredClone(v);
const mod12 = (n) => ((n % 12) + 12) % 12;
const MIN_OFFSET = MIN_OCTAVE - BASE_OCTAVE;
const MAX_OFFSET = MAX_OCTAVE - BASE_OCTAVE;

export const GROUPS = ['Rhythm', 'Dynamics', 'Pitch', 'Fill'];

/* --- the phrase ------------------------------------------------------------- */

/** Whether a copy of `phraseLength` Measures still fits under the cap (AC-10.3.1/5). */
export function canAddVariation(pattern, phraseLength) {
  return phraseLength >= 1 && phraseLength <= pattern.measures.length && pattern.measures.length + phraseLength <= MAX_MEASURES;
}

/** The phrase length the picker opens on: the remembered one, else the whole Pattern (AC-10.3.2/1). */
export function defaultPhraseLength(pattern, remembered) {
  const n = pattern.measures.length;
  return Number.isInteger(remembered) && remembered >= 1 && remembered <= n ? remembered : n;
}

/** Whether there is a choice of base at all: only once the Pattern is longer than the phrase (AC-10.3.2/2). */
export function hasBaseChoice(pattern, phraseLength) {
  return pattern.measures.length > phraseLength;
}

/**
 * The base phrase: its Measures (cloned) and where they start in the Pattern,
 * which is what the chord in force for each of them depends on.
 */
function basePhrase(pattern, phraseLength, base = 'original') {
  const n = pattern.measures.length;
  if (!Number.isInteger(phraseLength) || phraseLength < 1 || phraseLength > n) {
    throw new Error(`Phrase length must be 1 to ${n}, got ${phraseLength}`);
  }
  const start = base === 'latest' ? n - phraseLength : 0;
  return { measures: clone(pattern.measures.slice(start, start + phraseLength)), start };
}

/* --- addressing -------------------------------------------------------------- */

/** Every Slot of the phrase in order: Measure, Beat, Slot. */
function positions(measures) {
  const out = [];
  measures.forEach((measure, m) =>
    measure.beats.forEach((beat, b) => beat.slots.forEach((slot, s) => out.push({ m, b, s, slot, measure, beat })))
  );
  return out;
}
const sounding = (measures) => positions(measures).filter((p) => p.slot.on);
const at = (measures, p) => measures[p.m].beats[p.b].slots[p.s];
const isMelodic = (pattern) => pattern.soundMode === 'melodic';
const hasNote = (p) => Boolean(p.slot.pitch);
const notes = (measures) => sounding(measures).filter(hasNote);

/** The override a level needs: none when it is the Slot's own default. */
function setLevel(measures, p, level) {
  const slot = at(measures, p);
  if (level === defaultAccent(measures[p.m], p.b, p.s)) delete slot.accent;
  else slot.accent = level;
}

/**
 * The Pitch a Slot turned on by a rhythm device takes in a Melodic Pattern: the
 * nearest earlier sounding Slot's, else the phrase's first note's, else the
 * tonic in the base octave (AC-10.3.3's rule). A Slot never sounds pitchless.
 */
function borrowedPitch(measures, p) {
  const all = positions(measures);
  const index = all.findIndex((q) => q.m === p.m && q.b === p.b && q.s === p.s);
  for (let i = index - 1; i >= 0; i--) if (all[i].slot.on && all[i].slot.pitch) return clone(all[i].slot.pitch);
  const first = notes(measures)[0];
  return first ? clone(first.slot.pitch) : { degree: '1', octaveOffset: 0 };
}

function turnOn(measures, p, pattern, pitch = null) {
  const slot = at(measures, p);
  slot.on = true;
  delete slot.accent;
  if (isMelodic(pattern)) slot.pitch = pitch ?? borrowedPitch(measures, p);
}

function turnOff(measures, p) {
  measures[p.m].beats[p.b].slots[p.s] = { on: false };
}

/* --- pitch arithmetic ------------------------------------------------------- */

const scaleOf = (pattern) => (isValidScale(pattern.scale) ? pattern.scale : DEFAULT_SCALE);
const strip = (pattern) => chromaticStrip(scaleOf(pattern));
const inScalePcs = (pattern) => strip(pattern).map((c, i) => (c.inScale ? i : -1)).filter((i) => i >= 0);

/** A Pitch as semitones above the tonic in the base octave, reading a chord tone through its chord (AC-2.6.1/6's rule). */
function absOf(pitch, chord) {
  const octave = pitch.octaveOffset ?? 0;
  if (pitch.tone !== undefined) {
    const semis = chord ? memberFor(chord, pitch.tone).offset : 0;
    return semis + 12 * octave;
  }
  return degreeSemitones(pitch.degree) + 12 * octave;
}

/** Semitones above the tonic back to a stored Pitch, spelled by the scale. */
function pitchOf(abs, pattern) {
  const pc = mod12(abs);
  return { degree: strip(pattern)[pc].token, octaveOffset: Math.floor(abs / 12) };
}

const inRange = (abs) => Math.floor(abs / 12) >= MIN_OFFSET && Math.floor(abs / 12) <= MAX_OFFSET;

/** The next scale degree strictly above (dir 1) or below (dir -1) `abs`, as semitones. */
function scaleStep(abs, pattern, dir) {
  const pcs = inScalePcs(pattern);
  const pc = mod12(abs);
  const base = abs - pc;
  if (dir > 0) {
    const next = pcs.find((x) => x > pc);
    return next !== undefined ? base + next : base + 12 + pcs[0];
  }
  const prev = [...pcs].reverse().find((x) => x < pc);
  return prev !== undefined ? base + prev : base - 12 + pcs[pcs.length - 1];
}

/** Where a note sits on the scale's ladder, or null when it is outside the scale. */
function ladder(abs, pattern) {
  const pcs = inScalePcs(pattern);
  const i = pcs.indexOf(mod12(abs));
  return i < 0 ? null : Math.floor(abs / 12) * pcs.length + i;
}
function fromLadder(index, pattern) {
  const pcs = inScalePcs(pattern);
  const octave = Math.floor(index / pcs.length);
  return 12 * octave + pcs[((index % pcs.length) + pcs.length) % pcs.length];
}

/** The nearest `target` pitch class to `abs` — the lower of two equally near (AC-10.3.3/12). */
function nearest(abs, targetPc) {
  const below = abs - mod12(abs - targetPc);
  const above = below + 12;
  return above - abs < abs - below ? above : below;
}

const chordFor = (pattern, phrase, p) => chordIn(pattern, 0, phrase.start + p.m);

/* --- the devices --------------------------------------------------------------- */

const needsNote = (pattern, phrase) =>
  !isMelodic(pattern) ? 'Needs a melody: this Pattern is percussive' : notes(phrase.measures).length === 0 ? 'Needs a note in the phrase' : null;

const underFill = (pattern) => (hasHarmony(pattern) && pattern.harmony.arpeggio ? `The fill, ${fillLabel(pattern)}, deals the notes; set it to None to vary pitch` : null);

function fillLabel(pattern) {
  return ARPEGGIOS.find((a) => a.id === pattern.harmony?.arpeggio)?.label ?? 'None';
}

/** A note device that moves every note by `step(abs) → abs`, refusing a result outside octaves 1–7. */
function eachNote(reason) {
  return (pattern, phrase, step) => {
    const measures = clone(phrase.measures);
    for (const p of notes(measures)) {
      const abs = step(absOf(p.slot.pitch, chordFor(pattern, phrase, p)), p);
      if (abs === null) continue;
      if (!inRange(abs)) return { reason };
      at(measures, p).pitch = pitchOf(abs, pattern);
    }
    return { measures };
  };
}
const moveNotes = eachNote('A note would leave the octaves the strip reaches');

/** Beats a device at the end of the phrase works on: the last, or the last two when the phrase has two or more Measures (AC-10.3.3/1). */
function endingBeats(measures) {
  const last = measures.length - 1;
  const beats = measures[last].beats.length;
  const out = [{ m: last, b: beats - 1 }];
  if (measures.length >= 2) {
    if (beats >= 2) out.unshift({ m: last, b: beats - 2 });
    else out.unshift({ m: last - 1, b: measures[last - 1].beats.length - 1 });
  }
  return out;
}

const DENSER = { quarter: { 'straight-8ths': 'straight-16ths' }, eighth: { undivided: 'straight-16ths' } };
const COARSER = { quarter: { 'straight-16ths': 'straight-8ths' }, eighth: { 'straight-16ths': 'undivided' } };

function lastBeat(measures) {
  const m = measures.length - 1;
  return { m, b: measures[m].beats.length - 1 };
}

const DEVICES = [
  // --- Rhythm -------------------------------------------------------------------
  {
    id: 'fill-ending',
    group: 'Rhythm',
    label: 'Fill the ending',
    description: 'The last Beat — the last two in a longer phrase — fills with 16ths, every one sounding.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      let changed = false;
      for (const { m, b } of endingBeats(measures)) {
        const measure = measures[m];
        const noteValue = beatNoteValue(measure.timeSignature);
        const beat = measure.beats[b];
        const count = slotCount('straight-16ths', noteValue);
        const already = beat.slots.length >= 4 && beat.slots.every((s) => s.on);
        if (already) continue;
        if (beat.slots.length === count && beat.slots.every((s) => s.on)) continue;
        if (beat.recipe !== 'straight-16ths') {
          measure.beats[b] = { recipe: 'straight-16ths', slots: Array.from({ length: count }, () => ({ on: false })) };
        }
        for (let s = 0; s < count; s++) if (!measure.beats[b].slots[s].on) turnOn(measures, { m, b, s }, pattern);
        changed = true;
      }
      return changed ? { measures } : { reason: 'The ending is already full' };
    },
  },
  {
    id: 'anticipate',
    group: 'Rhythm',
    label: 'Anticipate',
    description: 'The last note lands one Slot early.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const all = positions(measures);
      const sounds = sounding(measures);
      if (sounds.length === 0) return { reason: 'Nothing sounds in the phrase' };
      const last = sounds[sounds.length - 1];
      const i = all.findIndex((q) => q.m === last.m && q.b === last.b && q.s === last.s);
      if (i === 0) return { reason: 'The last note is already the first Slot' };
      const before = all[i - 1];
      if (before.slot.on) return { reason: 'The Slot before the last note already sounds' };
      measures[before.m].beats[before.b].slots[before.s] = clone(last.slot);
      turnOff(measures, last);
      return { measures };
    },
  },
  {
    id: 'delay',
    group: 'Rhythm',
    label: 'Delay',
    description: 'In the last Measure, the first note after the downbeat lands one Slot late.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const all = positions(measures);
      const m = measures.length - 1;
      const inLast = all.filter((p) => p.m === m);
      const first = inLast.slice(1).find((p) => p.slot.on);
      if (!first) return { reason: 'No note after the downbeat of the last Measure' };
      const i = all.findIndex((q) => q.m === first.m && q.b === first.b && q.s === first.s);
      if (i === all.length - 1) return { reason: 'That note is already the last Slot' };
      const after = all[i + 1];
      if (after.slot.on) return { reason: 'The Slot after it already sounds' };
      measures[after.m].beats[after.b].slots[after.s] = clone(first.slot);
      turnOff(measures, first);
      return { measures };
    },
  },
  {
    id: 'add-note',
    group: 'Rhythm',
    label: 'Add a note',
    description: 'The first silent "&" sounds.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const p = positions(measures).find((q) => !q.slot.on && defaultAccent(q.measure, q.b, q.s) === MEDIUM);
      if (!p) return { reason: 'No silent "&" to add' };
      turnOn(measures, p, pattern);
      return { measures };
    },
  },
  {
    id: 'drop-note',
    group: 'Rhythm',
    label: 'Drop a note',
    description: 'The last weak note, off a downbeat, falls silent.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const p = [...sounding(measures)].reverse().find((q) => !(q.b === 0 && q.s === 0) && effectiveAccent(q.measure, q.b, q.s) === WEAK);
      if (!p) return { reason: 'No weak note off a downbeat to drop' };
      turnOff(measures, p);
      return { measures };
    },
  },
  {
    id: 'breathe',
    group: 'Rhythm',
    label: 'Breathe',
    description: 'The last Beat falls silent.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const { m, b } = lastBeat(measures);
      const beat = measures[m].beats[b];
      if (!beat.slots.some((s) => s.on)) return { reason: 'The last Beat is already silent' };
      beat.slots = beat.slots.map(() => ({ on: false }));
      return { measures };
    },
  },
  {
    id: 'double-ending',
    group: 'Rhythm',
    label: 'Double the last Beat',
    description: 'The last Beat’s notes on a grid twice as fine, with room between them.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const { m, b } = lastBeat(measures);
      const measure = measures[m];
      const noteValue = beatNoteValue(measure.timeSignature);
      const to = DENSER[noteValue]?.[measure.beats[b].recipe];
      if (!to) return { reason: 'The last Beat has no Recipe twice as fine' };
      const old = measure.beats[b].slots;
      const slots = Array.from({ length: slotCount(to, noteValue) }, () => ({ on: false }));
      old.forEach((slot, i) => {
        if (slot.on) slots[2 * i] = clone(slot);
      });
      measure.beats[b] = { recipe: to, slots };
      return { measures };
    },
  },
  {
    id: 'halve-ending',
    group: 'Rhythm',
    label: 'Halve the last Beat',
    description: 'The last Beat on a grid half as fine; the notes between its lines are dropped.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const { m, b } = lastBeat(measures);
      const measure = measures[m];
      const noteValue = beatNoteValue(measure.timeSignature);
      const to = COARSER[noteValue]?.[measure.beats[b].recipe];
      if (!to) return { reason: 'The last Beat has no Recipe half as fine' };
      const old = measure.beats[b].slots;
      const slots = Array.from({ length: slotCount(to, noteValue) }, (_, i) => (old[2 * i].on ? clone(old[2 * i]) : { on: false }));
      measure.beats[b] = { recipe: to, slots };
      return { measures };
    },
  },
  // --- Dynamics ---------------------------------------------------------------
  {
    id: 'lift',
    group: 'Dynamics',
    label: 'Lift',
    description: 'Every note one level louder; Strong stays Strong.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      let changed = false;
      for (const p of sounding(measures)) {
        const level = effectiveAccent(p.measure, p.b, p.s);
        if (level < STRONG) {
          setLevel(measures, p, level + 1);
          changed = true;
        }
      }
      return changed ? { measures } : { reason: 'Every note is already Strong' };
    },
  },
  {
    id: 'soften',
    group: 'Dynamics',
    label: 'Soften',
    description: 'Every note one level quieter; Weak stays Weak, nothing goes silent.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      let changed = false;
      for (const p of sounding(measures)) {
        const level = effectiveAccent(p.measure, p.b, p.s);
        if (level > WEAK) {
          setLevel(measures, p, level - 1);
          changed = true;
        }
      }
      return changed ? { measures } : { reason: 'Every note is already Weak' };
    },
  },
  {
    id: 'shift-accent',
    group: 'Dynamics',
    label: 'Shift the accent',
    description: 'In each Measure the downbeat goes Weak and Beat 2 takes the Strong.',
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      let changed = false;
      measures.forEach((measure, m) => {
        if (measure.beats.length < 2) return;
        if (measure.beats[0].slots[0].on) {
          setLevel(measures, { m, b: 0, s: 0 }, WEAK);
          changed = true;
        }
        if (measure.beats[1].slots[0].on) {
          setLevel(measures, { m, b: 1, s: 0 }, STRONG);
          changed = true;
        }
      });
      return changed ? { measures } : { reason: 'No Measure has a note on Beat 1 or Beat 2 to shift' };
    },
  },
  // --- Pitch ----------------------------------------------------------------------
  {
    id: 'resolve-ending',
    group: 'Pitch',
    label: 'Resolve the ending',
    description: 'The last note becomes the nearest tonic.',
    pitch: true,
    apply(pattern, phrase) {
      return endingTo(pattern, phrase, 0, 'the tonic');
    },
  },
  {
    id: 'open-ending',
    group: 'Pitch',
    label: 'Open the ending',
    description: 'The last note becomes the nearest fifth, leaving the phrase open.',
    pitch: true,
    apply(pattern, phrase) {
      return endingTo(pattern, phrase, 7, 'the fifth');
    },
  },
  {
    id: 'sequence-up',
    group: 'Pitch',
    label: 'Sequence up',
    description: 'Every note one scale step higher.',
    pitch: true,
    apply: (pattern, phrase) => moveNotes(pattern, phrase, (abs) => scaleStep(abs, pattern, 1)),
  },
  {
    id: 'sequence-down',
    group: 'Pitch',
    label: 'Sequence down',
    description: 'Every note one scale step lower.',
    pitch: true,
    apply: (pattern, phrase) => moveNotes(pattern, phrase, (abs) => scaleStep(abs, pattern, -1)),
  },
  {
    id: 'octave-up',
    group: 'Pitch',
    label: 'Octave up',
    description: 'Every note an octave higher.',
    pitch: true,
    octave: true,
    apply: (pattern, phrase) => shiftOctave(pattern, phrase, 1),
  },
  {
    id: 'octave-down',
    group: 'Pitch',
    label: 'Octave down',
    description: 'Every note an octave lower.',
    pitch: true,
    octave: true,
    apply: (pattern, phrase) => shiftOctave(pattern, phrase, -1),
  },
  {
    id: 'fill-gaps',
    group: 'Pitch',
    label: 'Fill the gaps',
    description: 'A passing note between notes a third apart, where a Slot is free.',
    pitch: true,
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const all = positions(measures);
      const ns = notes(measures);
      let changed = false;
      for (let k = 0; k + 1 < ns.length; k++) {
        const a = ns[k];
        const b = ns[k + 1];
        const la = ladder(absOf(a.slot.pitch, chordFor(pattern, phrase, a)), pattern);
        const lb = ladder(absOf(b.slot.pitch, chordFor(pattern, phrase, b)), pattern);
        if (la === null || lb === null || Math.abs(lb - la) !== 2) continue;
        const ia = all.findIndex((q) => q.m === a.m && q.b === a.b && q.s === a.s);
        const ib = all.findIndex((q) => q.m === b.m && q.b === b.b && q.s === b.s);
        const between = all.slice(ia + 1, ib).filter((q) => !q.slot.on);
        if (between.length === 0) continue;
        const target = between[between.length - 1];
        const abs = fromLadder((la + lb) / 2, pattern);
        if (!inRange(abs)) continue;
        turnOn(measures, target, pattern, pitchOf(abs, pattern));
        changed = true;
      }
      return changed ? { measures } : { reason: 'No two notes a third apart with a free Slot between them' };
    },
  },
  {
    id: 'neighbour',
    group: 'Pitch',
    label: 'Neighbour',
    description: 'The longest-held note gets its upper neighbour just before the next note.',
    pitch: true,
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const all = positions(measures);
      let best = null;
      for (const n of notes(measures)) {
        const i = all.findIndex((q) => q.m === n.m && q.b === n.b && q.s === n.s);
        let run = 0;
        while (i + run + 1 < all.length && !all[i + run + 1].slot.on) run++;
        if (run > 0 && (!best || run > best.run)) best = { n, run, last: all[i + run] };
      }
      if (!best) return { reason: 'No note is followed by a silent Slot' };
      const abs = scaleStep(absOf(best.n.slot.pitch, chordFor(pattern, phrase, best.n)), pattern, 1);
      if (!inRange(abs)) return { reason: 'The neighbour would leave the octaves the strip reaches' };
      turnOn(measures, best.last, pattern, pitchOf(abs, pattern));
      return { measures };
    },
  },
  {
    id: 'chord-tone-swap',
    group: 'Pitch',
    label: 'Chord-tone swap',
    description: 'Each 3rd of the chord in force becomes its 5th, and each 5th its 3rd.',
    pitch: true,
    apply(pattern, phrase) {
      if (!hasHarmony(pattern)) return { reason: 'Needs a progression' };
      const measures = clone(phrase.measures);
      let changed = false;
      for (const p of notes(measures)) {
        const chord = chordFor(pattern, phrase, p);
        if (!chord) continue;
        const slot = at(measures, p);
        if (slot.pitch.tone !== undefined) {
          if (slot.pitch.tone === 3 || slot.pitch.tone === 5) {
            slot.pitch = { ...slot.pitch, tone: slot.pitch.tone === 3 ? 5 : 3 };
            changed = true;
          }
          continue;
        }
        const abs = absOf(slot.pitch, chord);
        const third = memberFor(chord, 3).offset;
        const fifth = memberFor(chord, 5).offset;
        let next = null;
        if (hasTone(chord, 3) && mod12(abs) === mod12(third)) next = abs - third + fifth;
        else if (hasTone(chord, 5) && mod12(abs) === mod12(fifth)) next = abs - fifth + third;
        if (next === null) continue;
        if (!inRange(next)) return { reason: 'A note would leave the octaves the strip reaches' };
        slot.pitch = pitchOf(next, pattern);
        changed = true;
      }
      return changed ? { measures } : { reason: 'No note is the 3rd or 5th of its chord' };
    },
  },
  {
    id: 'invert',
    group: 'Pitch',
    label: 'Invert',
    description: 'The line mirrored around its first note: what rose now falls.',
    pitch: true,
    apply(pattern, phrase) {
      const ns = notes(phrase.measures);
      const first = ns[0];
      const ref = absOf(first.slot.pitch, chordFor(pattern, phrase, first));
      const refLadder = ladder(ref, pattern);
      let moved = false;
      const result = moveNotes(pattern, phrase, (abs) => {
        const l = ladder(abs, pattern);
        const next = refLadder !== null && l !== null ? fromLadder(2 * refLadder - l, pattern) : 2 * ref - abs;
        if (next !== abs) moved = true;
        return next;
      });
      if (result.reason) return result;
      return moved ? result : { reason: 'Every note is the first note' };
    },
  },
  {
    id: 'retrograde',
    group: 'Pitch',
    label: 'Retrograde',
    description: 'The notes in reverse order, over the same rhythm.',
    pitch: true,
    apply(pattern, phrase) {
      const measures = clone(phrase.measures);
      const ns = notes(measures);
      const pitches = ns.map((p) => clone(p.slot.pitch));
      const distinct = new Set(pitches.map((p) => JSON.stringify(p)));
      if (distinct.size < 2) return { reason: 'Fewer than two different notes to reverse' };
      ns.forEach((p, i) => {
        at(measures, p).pitch = pitches[pitches.length - 1 - i];
      });
      return { measures };
    },
  },
  // --- Fill --------------------------------------------------------------------------
  {
    id: 'change-fill',
    group: 'Fill',
    label: 'Change the fill',
    description: 'Writes the current fill into these Measures and the next fill into the copy; the fill is then None.',
    fill: true,
    // Applied by `addVariation` itself, since it rewrites the Pattern as well as the copy.
    apply() {
      throw new Error('Change the fill is applied to the whole Pattern');
    },
  },
];

/** The last note to the nearest `pc` (AC-10.3.3/12, /13). */
function endingTo(pattern, phrase, pc, what) {
  const measures = clone(phrase.measures);
  const ns = notes(measures);
  const last = ns[ns.length - 1];
  const abs = absOf(last.slot.pitch, chordFor(pattern, phrase, last));
  if (mod12(abs) === pc) return { reason: `The last note is already ${what}` };
  const next = nearest(abs, pc);
  if (!inRange(next)) return { reason: 'The note would leave the octaves the strip reaches' };
  at(measures, last).pitch = pitchOf(next, pattern);
  return { measures };
}

/** Every note's octave by `by`, roles kept (AC-10.3.3/16, /17). */
function shiftOctave(pattern, phrase, by) {
  const measures = clone(phrase.measures);
  for (const p of notes(measures)) {
    const slot = at(measures, p);
    const octave = (slot.pitch.octaveOffset ?? 0) + by;
    if (octave < MIN_OFFSET || octave > MAX_OFFSET) {
      return { reason: by > 0 ? 'A note is already in the highest octave' : 'A note is already in the lowest octave' };
    }
    slot.pitch = { ...slot.pitch, octaveOffset: octave };
  }
  return { measures };
}

/* --- the fill --------------------------------------------------------------------- */

/**
 * The fill the copy takes under Change the fill: the next in `order` — the
 * catalogue indexes a cycle steps through (AC-2.12.3) — after the Pattern's
 * own, wrapping round; a fill the order does not hold moves to the first listed
 * after it (AC-10.3.3/24).
 */
function nextFill(pattern, order = null) {
  const own = fillIndexOf(pattern);
  const list = order?.length ? order : ARPEGGIOS.map((_, i) => i);
  const i = list.indexOf(own);
  const next = i >= 0 ? list[(i + 1) % list.length] : (list.find((x) => x > own) ?? list[0]);
  return ARPEGGIOS[next].id;
}

/** The first-pass deal of `source` written into `measures` as fixed Pitches, Measures `from` onward. */
function bakeDeal(source, measures, from = 0) {
  const deal = arpeggioDeal(source, 0);
  if (!deal) return;
  measures.forEach((measure, m) => {
    if (m < from) return;
    const chord = chordIn(source, 0, m);
    measure.beats.forEach((beat, b) =>
      beat.slots.forEach((slot, s) => {
        if (!slot.on) return;
        const sound = soundingPitch(slot, deal, m, b, s);
        if (sound?.step) slot.pitch = stepAsDegree(sound.step, chord, source, sound.octaveOffset);
      })
    );
  });
}

function changeFill(pattern, phrase, context) {
  const next = nextFill(pattern, context.fillOrder);
  // The Measures already there take the current fill's notes.
  const written = clone(pattern);
  bakeDeal(pattern, written.measures);
  // The copy takes the next fill's notes, dealt through the lengthened Pattern.
  const lengthened = append(pattern, { measures: phrase.measures });
  const under = withArpeggio(lengthened, next);
  const copy = clone(lengthened.measures);
  bakeDeal(under, copy, pattern.measures.length);
  written.measures = [...written.measures, ...copy.slice(pattern.measures.length)];
  delete written.harmony.arpeggio;
  return written;
}

/* --- the catalogue ---------------------------------------------------------------- */

/**
 * Why a device cannot apply to this base phrase, or null when it can
 * (AC-10.3.3). Pitch devices need a melody with a note, and — Octave aside — no
 * fill (AC-10.3.3/23); Change the fill needs a progression and a fill whose
 * next is not itself.
 */
function availability(deviceId, pattern, phraseLength, base = 'original', context = {}) {
  const device = DEVICES.find((d) => d.id === deviceId);
  if (!device) throw new Error(`Unknown device: ${deviceId}`);
  if (!canAddVariation(pattern, phraseLength)) return `A Pattern may hold at most ${MAX_MEASURES} Measures`;
  const phrase = basePhrase(pattern, phraseLength, base);
  if (device.fill) {
    if (!isMelodic(pattern) || !hasHarmony(pattern)) return 'Needs a progression and a fill';
    if (!pattern.harmony.arpeggio) return 'Needs a fill: set one in Melody';
    if (nextFill(pattern, context.fillOrder) === pattern.harmony.arpeggio) return 'No other fill to change to';
    return null;
  }
  if (device.pitch) {
    const gap = needsNote(pattern, phrase);
    if (gap) return gap;
    if (!device.octave) {
      const fill = underFill(pattern);
      if (fill) return fill;
    }
  }
  return device.apply(pattern, phrase).reason ?? null;
}

/** The catalogue for the picker: every device, in AC-10.3.3's order, with its availability on this base. */
export function devicesFor(pattern, phraseLength, base = 'original', context = {}) {
  return DEVICES.map((d) => ({
    id: d.id,
    group: d.group,
    label: d.label,
    description: d.description,
    reason: availability(d.id, pattern, phraseLength, base, context),
  }));
}

/** Add a variation: the base phrase with `deviceId` applied, appended (AC-10.3.1). */
export function addVariation(pattern, deviceId, phraseLength, base = 'original', context = {}) {
  const reason = availability(deviceId, pattern, phraseLength, base, context);
  if (reason) throw new Error(`${deviceId}: ${reason}`);
  const device = DEVICES.find((d) => d.id === deviceId);
  const phrase = basePhrase(pattern, phraseLength, base);
  if (device.fill) return changeFill(pattern, phrase, context);
  const { measures } = device.apply(pattern, phrase);
  return append(pattern, { measures });
}

/** The devices a roll may land on: available, and in no group marked No dice (AC-10.3.4/7). */
export function rollable(devices, noDice = []) {
  return devices.filter((d) => !d.reason && !noDice.includes(d.group));
}

/** One of `list` for a random number in [0, 1) the caller supplies — `core/` rolls no dice. */
export function pick(list, random) {
  if (!list.length) return null;
  const i = Math.min(list.length - 1, Math.max(0, Math.floor(random * list.length)));
  return list[i];
}
