/**
 * Pattern → score. US-12.2, research.md D-012.
 *
 * The sheet music view is a second rendering of the one Pattern, never a second
 * model. This module turns a Pattern into everything a staff needs written on
 * it — per pass and Measure, each Beat's Slots as notes and rests with their
 * written values, dots, tuplets, ties and beams; each note's staff step from its
 * spelled name; the accidental a reader needs against the key signature and the
 * Measure so far; the accent marks; the counting labels; and the chord names.
 * `ui/score.js` draws it. Nothing here re-derives a pitch or an accent: onsets
 * and accents come from `buildTimeline` (SC-003) and note names from
 * `core/pitch.js` and `core/harmony.js`, so the score and the piano cannot
 * disagree about which note a Slot is.
 *
 * Time within a Measure is counted in ticks of a twelfth of a quarter note, the
 * smallest unit every Recipe divides into exactly: a sixteenth is 3, a triplet
 * eighth 4, an eighth 6, a triplet sixteenth 2.
 */
import { beatNoteValue } from './meter.js';
import { subdivisionGroups } from './recipes.js';
import { STRONG } from './accents.js';
import { labelsFor, effectiveSystem } from './counting.js';
import { noteName } from './pitch.js';
import { SCALES, DEFAULT_SCALE } from './scales.js';
import {
  chordAt,
  chordName,
  chordToneName,
  cyclePasses,
  arpeggioDeal,
  soundingPitch,
  stepName,
} from './harmony.js';
import { buildTimeline } from './timeline.js';

/** Ticks per quarter note — the score's own grid, not MIDI's. */
export const QUARTER = 12;

/** Written note values, in ticks. Nothing the app can author is longer than a Beat. */
export const VALUE_TICKS = { quarter: 12, eighth: 6, sixteenth: 3 };

const LONGER = { sixteenth: 'eighth', eighth: 'quarter' };

/** The value whose plain length is `ticks`, or null. */
function valueOf(ticks) {
  return Object.keys(VALUE_TICKS).find((v) => VALUE_TICKS[v] === ticks) ?? null;
}

/** The ticks a written value occupies, with its dot and tuplet applied. */
export function writtenTicks({ value, dots = 0, tuplet = null }) {
  let t = VALUE_TICKS[value];
  if (dots) t *= 1.5;
  if (tuplet) t *= 2 / tuplet;
  return t;
}

/* --- staff arithmetic ------------------------------------------------------ */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * A note's position on the treble staff: 0 is the bottom line (E4), each step
 * one line or space up, so middle C is -2 (the first ledger line below), B4 the
 * middle line at 4, F5 the top line at 8, A5 the first ledger line above at 10
 * (AC-12.2.5/2). Pure letter-and-octave arithmetic — the accidental never moves
 * a note off its letter's position.
 */
export function staffStep(letter, octave) {
  return (octave - 4) * 7 + LETTERS.indexOf(letter) - LETTERS.indexOf('E');
}

/** Ionian key signatures for each supported Key: sharps positive, flats negative. */
const IONIAN_SIGNATURE = { C: 0, Db: -5, D: 2, Eb: -3, E: 4, F: -1, Gb: -6, G: 1, Ab: -4, A: 3, Bb: -2, B: 5 };

/** A church mode's signature, relative to the parallel Ionian's. */
const MODE_OFFSET = { ionian: 0, dorian: -2, phrygian: -4, lydian: 1, mixolydian: -1, aeolian: -3, locrian: -5 };

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
/** Where each accidental of a treble signature is written, as a staff step. */
const SHARP_STEP = { F: 8, C: 5, G: 9, D: 6, A: 3, E: 7, B: 4 };
const FLAT_STEP = { B: 4, E: 7, A: 3, D: 6, G: 2, C: 5, F: 1 };

/**
 * The key signature of a Key and scale (AC-12.2.5/1). A church mode takes its
 * relative major's; a scale that is not a mode borrows the parallel Ionian's,
 * or Aeolian's when it has ♭3 and no 3 — the rule D-011 spells chords by, so
 * the two never disagree about what "C minor" means. A mode that would need
 * more than seven accidentals falls back to the Key's Ionian signature.
 *
 * @returns {{count: number, accidental: ''|'#'|'b', letters: string[], steps: number[]}}
 */
export function keySignature(key, scaleId = DEFAULT_SCALE) {
  const scale = SCALES.find((s) => s.id === scaleId) ?? SCALES.find((s) => s.id === DEFAULT_SCALE);
  let offset = MODE_OFFSET[scale.id];
  if (offset === undefined) {
    offset = scale.degrees.includes('b3') && !scale.degrees.includes('3') ? MODE_OFFSET.aeolian : 0;
  }
  let count = IONIAN_SIGNATURE[key] + offset;
  if (Math.abs(count) > 7) count = IONIAN_SIGNATURE[key];
  const letters = count > 0 ? SHARP_ORDER.slice(0, count) : FLAT_ORDER.slice(0, -count);
  const stepOf = count > 0 ? SHARP_STEP : FLAT_STEP;
  return {
    count,
    accidental: count > 0 ? '#' : count < 0 ? 'b' : '',
    letters,
    steps: letters.map((l) => stepOf[l]),
  };
}

/** The accidental glyph a note carries, from the stored spelling. */
const GLYPH = { '': 'natural', '#': 'sharp', b: 'flat', '##': 'double-sharp', bb: 'double-flat' };

const PRETTY = { '': '', '#': '♯', b: '♭', '##': '𝄪', bb: '𝄫' };

/** A Key or chord name as a musician writes it: D♭, B♭m7. */
export function prettyName(name) {
  return name.replace(/^([A-G])(bb|b|##|#)?/, (_, letter, acc) => letter + PRETTY[acc ?? '']);
}

/* --- one Beat --------------------------------------------------------------- */

/**
 * The written items of one Beat, in order: notes and rests with their values.
 * `slots` is the Slot the item starts on, `span` how many Slots it covers.
 *
 * A sounding Slot's value runs to the next sounding Slot in its Beat or the
 * Beat's end (AC-12.2.4/3). A run that would cross the boundary between a mixed
 * Recipe's halves is written as tied notes, one in each half (AC-12.2.4/4).
 * Rests before the first sounding Slot are written largest first and never
 * dotted (AC-12.2.4/5). A Beat with nothing sounding is one rest of the Beat's
 * value (AC-12.2.4/6).
 */
export function beatItems(beat, noteValue) {
  const beatTicks = noteValue === 'quarter' ? QUARTER : QUARTER / 2;
  const groups = subdivisionGroups(beat.recipe, noteValue);
  const on = beat.slots.map((s) => Boolean(s.on));

  if (!on.some(Boolean)) {
    return [
      {
        kind: 'rest',
        slotIndex: 0,
        span: beat.slots.length,
        tick: 0,
        ticks: beatTicks,
        value: valueOf(beatTicks),
        dots: 0,
        tuplet: null,
        tie: false,
      },
    ];
  }

  const items = [];
  const groupTicks = beatTicks / groups.length;
  let held = null; // the note sounding into this group from the one before

  groups.forEach((group, gi) => {
    const n = group.slotIndices.length;
    const unitTicks = groupTicks / n;
    const tuplet = group.feel === 'triplet' ? 3 : null;
    // The written unit: a straight group's is its Slot; a triplet's Slot is a
    // written unit shortened by the tuplet.
    const unit = valueOf(tuplet ? (unitTicks * tuplet) / 2 : unitTicks);
    const groupStart = gi * groupTicks;
    const last = gi === groups.length - 1;

    /** A run of `k` Slots from `i`, as one written note (or one rest). */
    const runNote = (kind, i, k) => {
      const base = { kind, slotIndex: group.slotIndices[i], span: k, tick: groupStart + i * unitTicks, ticks: k * unitTicks, tie: false };
      let item;
      if (k === n) item = { ...base, value: valueOf(groupTicks), dots: 0, tuplet: null };
      else if (k === 1) item = { ...base, value: unit, dots: 0, tuplet };
      else if (k === 2) item = { ...base, value: LONGER[unit], dots: 0, tuplet };
      // k === 3 of a straight four: dotted
      else item = { ...base, value: LONGER[unit], dots: 1, tuplet };
      // The written value must be the time it stands for, exactly (AC-12.2.4/9).
      if (writtenTicks(item) !== item.ticks) {
        throw new Error(`${k} Slots of ${beat.recipe} written as ${item.value} do not total their time`);
      }
      return item;
    };

    /** `k` leading off Slots from `i`, as rests written largest first, never dotted. */
    const runRests = (i, k) => {
      const rests = [];
      let at = i;
      let left = k;
      while (left > 0) {
        const take = left === n ? n : left >= 2 ? 2 : 1;
        const rest = runNote('rest', at, take);
        rests.push(rest);
        at += take;
        left -= take;
      }
      return rests;
    };

    let i = 0;
    if (held) {
      let k = 0;
      while (k < n && !on[group.slotIndices[k]]) k += 1;
      if (k > 0) {
        const cont = runNote('note', 0, k);
        cont.continuation = true;
        held.tie = true;
        items.push(cont);
        held = k === n && !last ? cont : null;
        i = k;
      } else {
        held = null;
      }
    }

    let lead = 0;
    while (i + lead < n && !on[group.slotIndices[i + lead]]) lead += 1;
    if (lead > 0) {
      items.push(...runRests(i, lead));
      i += lead;
    }

    while (i < n) {
      let k = 1;
      while (i + k < n && !on[group.slotIndices[i + k]]) k += 1;
      const note = runNote('note', i, k);
      items.push(note);
      if (i + k === n && !last) held = note;
      i += k;
    }
  });

  return items;
}

/* --- the score ------------------------------------------------------------- */

const eventKey = (m, b, s) => `${m}:${b}:${s}`;

/**
 * The name a Slot's sounding note is written as, from the same functions the
 * pitch strip and the note bands use.
 */
function spell(slot, deal, chord, pattern, m, b, s) {
  const sounding = soundingPitch(slot, deal, m, b, s);
  if (!sounding) return null;
  if (sounding.step !== undefined) return stepName(sounding.step, chord, pattern.key, pattern, sounding.octaveOffset);
  if (sounding.tone !== undefined) return chordToneName(sounding, chord, pattern.key);
  return noteName(sounding, pattern.key);
}

/**
 * The whole score of a Pattern: its head, and every pass of its harmonic cycle
 * as Measures of Beats of written items (AC-12.2.8/1).
 *
 * @param {object} pattern
 * @param {{countingSystem?: string}} [options]
 */
export function buildScore(pattern, { countingSystem = 'takadimi' } = {}) {
  const melodic = pattern.soundMode === 'melodic';
  const system = effectiveSystem(pattern, countingSystem);
  const signature = melodic ? keySignature(pattern.key, pattern.scale ?? DEFAULT_SCALE) : null;
  const passes = cyclePasses(pattern);
  const swing =
    (pattern.swingAmount ?? 0) > 0 ||
    pattern.measures.some((m) => m.beats.some((b) => Object.values(b.swing ?? {}).some((v) => v > 0)));

  const scale = SCALES.find((s) => s.id === (pattern.scale ?? DEFAULT_SCALE));

  const score = {
    title: pattern.name,
    tempo: { bpm: pattern.tempo, beatValue: beatNoteValue(pattern.measures[0].timeSignature) },
    swing,
    keyLabel: melodic ? `${prettyName(pattern.key)} ${scale.label}` : null,
    staff: melodic ? 'treble' : 'single',
    keySignature: signature,
    system,
    passCount: passes,
    passes: [],
  };

  for (let pass = 0; pass < passes; pass++) {
    const events = new Map();
    for (const event of buildTimeline(pattern, pass)) {
      events.set(eventKey(event.measureIndex, event.beatIndex, event.slotIndex), event);
    }
    const deal = melodic ? arpeggioDeal(pattern, pass) : null;

    const measures = pattern.measures.map((measure, m) => {
      const noteValue = beatNoteValue(measure.timeSignature);
      const beatTicks = noteValue === 'quarter' ? QUARTER : QUARTER / 2;
      const chordIndex = chordAt(pattern, pass, m);
      const chord = chordIndex === null ? null : pattern.harmony.chords[chordIndex];
      // Named where the chord in force changes — by what it is, so a step that
      // repeats the chord before it is not named twice (AC-12.2.8/2).
      const previous = chord && m > 0 ? pattern.harmony.chords[chordAt(pattern, pass, m - 1)] : null;
      const changed = !previous || previous.degree !== chord.degree || previous.quality !== chord.quality;
      const chordLabel = chord && (m === 0 || changed) ? prettyName(chordName(chord, pattern.key)) : null;

      // Accidentals in force, by letter and octave, reset at every bar line
      // (AC-12.2.5/4). The signature's letters start altered at every octave.
      const inForce = new Map();
      const forceOf = (letter, octave) => {
        const k = `${letter}${octave}`;
        if (inForce.has(k)) return inForce.get(k);
        return signature.letters.includes(letter) ? signature.accidental : '';
      };

      const empty = measure.beats.every((beat) => beat.slots.every((s) => !s.on));

      const beats = measure.beats.map((beat, b) => {
        const items = [];
        if (!empty) {
          for (const item of beatItems(beat, noteValue)) {
            const out = { ...item, tick: b * beatTicks + item.tick, beatIndex: b, measureIndex: m, pass };
            if (item.kind === 'note') {
              const previous = items.at(-1);
              if (item.continuation) {
                // The same note as the one it is tied from.
                Object.assign(out, { accent: false, step: previous.step, name: previous.name, midiNote: previous.midiNote, accidental: null });
              } else {
                const event = events.get(eventKey(m, b, item.slotIndex));
                if (!event) throw new Error(`No timeline event for ${eventKey(m, b, item.slotIndex)}`);
                out.accent = event.accent === STRONG;
                out.midiNote = event.pitch?.midiNote ?? null;
                if (melodic) {
                  const name = spell(beat.slots[item.slotIndex], deal, chord, pattern, m, b, item.slotIndex);
                  if (name) {
                    out.name = name;
                    out.step = staffStep(name.letter, name.octave);
                    out.accidental = name.accidental === forceOf(name.letter, name.octave) ? null : GLYPH[name.accidental];
                    inForce.set(`${name.letter}${name.octave}`, name.accidental);
                  } else {
                    // A sounding Slot between being turned on and being given
                    // its Pitch (AC-2.2.8's invariant is restored by the next
                    // render): written on the middle line, unnamed.
                    out.name = null;
                    out.step = 4;
                    out.accidental = null;
                  }
                } else {
                  out.step = 0;
                }
              }
            } else {
              out.step = 0;
              out.accent = false;
            }
            items.push(out);
          }
        }

        const labels = labelsFor(beat.recipe, noteValue, system, b).map((text, s) => ({
          slotIndex: s,
          tick: b * beatTicks + slotTick(beat, noteValue, s),
          text,
          sounding: Boolean(beat.slots[s].on),
        }));

        return { beatIndex: b, noteValue, ticks: beatTicks, items, labels, groups: groupSpans(beat, noteValue) };
      });

      return {
        measureIndex: m,
        pass,
        timeSignature: measure.timeSignature,
        showMeter: m === 0 || measure.timeSignature !== pattern.measures[m - 1].timeSignature,
        ticks: measure.beats.length * beatTicks,
        chordLabel,
        wholeRest: empty,
        beats,
      };
    });

    score.passes.push({ index: pass, label: passes > 1 ? `Pass ${pass + 1}` : null, measures });
  }

  return score;
}

/** The tick within its Beat a Slot starts on. */
export function slotTick(beat, noteValue, slotIndex) {
  const beatTicks = noteValue === 'quarter' ? QUARTER : QUARTER / 2;
  const groups = subdivisionGroups(beat.recipe, noteValue);
  const groupTicks = beatTicks / groups.length;
  for (let gi = 0; gi < groups.length; gi++) {
    const k = groups[gi].slotIndices.indexOf(slotIndex);
    if (k >= 0) return gi * groupTicks + (k * groupTicks) / groups[gi].slotIndices.length;
  }
  throw new Error(`No Slot ${slotIndex} in this Beat`);
}

/** Each Subdivision Group's tick span and feel, for drawing tuplet numerals. */
function groupSpans(beat, noteValue) {
  const beatTicks = noteValue === 'quarter' ? QUARTER : QUARTER / 2;
  const groups = subdivisionGroups(beat.recipe, noteValue);
  const groupTicks = beatTicks / groups.length;
  return groups.map((g, gi) => ({ feel: g.feel, tick: gi * groupTicks, ticks: groupTicks, slotIndices: g.slotIndices }));
}

/**
 * Beamed segments of a Beat: runs of consecutive notes shorter than a quarter,
 * broken by a rest (AC-12.2.4/7). Each is a list of item indices.
 */
export function beamSegments(items) {
  const segments = [];
  let current = [];
  items.forEach((item, i) => {
    if (item.kind === 'note' && item.value !== 'quarter') current.push(i);
    else {
      if (current.length > 1) segments.push(current);
      current = [];
    }
  });
  if (current.length > 1) segments.push(current);
  return segments;
}

/**
 * Stem direction for a note or a beamed group (AC-12.2.5/7): up below the
 * middle line, down on or above it; a group follows its note farthest from
 * the middle line. A single-line staff's stems are always up (AC-12.2.3).
 */
export function stemDirection(steps, staff = 'treble') {
  if (staff === 'single') return 'up';
  const middle = 4;
  let farthest = 0;
  for (const s of steps) if (Math.abs(s - middle) > Math.abs(farthest)) farthest = s - middle;
  return farthest >= 0 ? 'down' : 'up';
}

/** The item at a transport position, for marking the note being played (AC-12.2.9). */
export function itemAt(score, position) {
  if (!position) return null;
  const pass = score.passes[(position.loop ?? 0) % score.passCount];
  const measure = pass?.measures[position.measureIndex];
  const beat = measure?.beats[position.beatIndex];
  if (!beat) return null;
  return beat.items.find((it) => position.slotIndex >= it.slotIndex && position.slotIndex < it.slotIndex + it.span) ?? null;
}
