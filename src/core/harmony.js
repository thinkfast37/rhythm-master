/**
 * Chord progressions layered on a rhythm. US-2.6, research.md D-011.
 *
 * A Pattern may carry a `harmony`: a list of concrete chords — a chromatic
 * degree of the Key with a quality — and a `change` setting saying whether the
 * chord in force moves on every pass or every Measure. A Slot may then hold a
 * chord-tone Pitch, `{ tone, octaveOffset }`, whose role (Root, 3rd, 5th, 7th,
 * 9th) resolves to a note through whichever chord is in force when it sounds.
 *
 * Everything here is pure: the catalogue, the spelling of a progression from a
 * Key and scale, the chord in force for a (pass, Measure), the resolution and
 * naming of a chord tone, the arpeggio fill, and every harmony mutation. The
 * timeline calls `resolveChordTone`, so playback and MIDI export agree by
 * construction (AC-2.6.4/6).
 */
import {
  BASE_MIDI,
  keySemitones,
  degreeSemitones,
  midiToFrequency,
  splitDegree,
  noteName,
  letterAbove,
  spellFromLetter,
} from './pitch.js';
import { SCALES, DEFAULT_SCALE, chromaticToken } from './scales.js';

const clone = (v) => structuredClone(v);

/* --- catalogues ----------------------------------------------------------- */

/**
 * Chord qualities, in picker order (AC-2.6.2/1). `intervals` are semitones above
 * the root; `suffix` is what follows the root's name; `numeral` what follows the
 * roman numeral. A minor third makes the numeral lowercase.
 */
export const QUALITIES = [
  { id: 'maj', label: 'major', suffix: '', numeral: '', intervals: [0, 4, 7] },
  { id: 'min', label: 'minor', suffix: 'm', numeral: '', intervals: [0, 3, 7] },
  { id: 'dim', label: 'diminished', suffix: 'dim', numeral: '°', intervals: [0, 3, 6] },
  { id: 'aug', label: 'augmented', suffix: 'aug', numeral: '+', intervals: [0, 4, 8] },
  { id: 'sus2', label: 'sus2', suffix: 'sus2', numeral: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', label: 'sus4', suffix: 'sus4', numeral: 'sus4', intervals: [0, 5, 7] },
  { id: '6', label: '6', suffix: '6', numeral: '6', intervals: [0, 4, 7, 9] },
  { id: 'm6', label: 'm6', suffix: 'm6', numeral: '6', intervals: [0, 3, 7, 9] },
  { id: 'maj7', label: 'maj7', suffix: 'maj7', numeral: 'maj7', intervals: [0, 4, 7, 11] },
  { id: 'm7', label: 'm7', suffix: 'm7', numeral: '7', intervals: [0, 3, 7, 10] },
  { id: '7', label: '7', suffix: '7', numeral: '7', intervals: [0, 4, 7, 10] },
  { id: 'm7b5', label: 'm7♭5', suffix: 'm7♭5', numeral: 'ø7', intervals: [0, 3, 6, 10] },
  { id: 'dim7', label: 'dim7', suffix: 'dim7', numeral: '°7', intervals: [0, 3, 6, 9] },
  { id: 'mMaj7', label: 'mMaj7', suffix: 'mMaj7', numeral: 'mMaj7', intervals: [0, 3, 7, 11] },
  { id: '7sus4', label: '7sus4', suffix: '7sus4', numeral: '7sus4', intervals: [0, 5, 7, 10] },
  { id: 'add9', label: 'add9', suffix: 'add9', numeral: 'add9', intervals: [0, 4, 7, 14] },
  { id: '9', label: '9', suffix: '9', numeral: '9', intervals: [0, 4, 7, 10, 14] },
  { id: 'maj9', label: 'maj9', suffix: 'maj9', numeral: 'maj9', intervals: [0, 4, 7, 11, 14] },
  { id: 'm9', label: 'm9', suffix: 'm9', numeral: '9', intervals: [0, 3, 7, 10, 14] },
];

export function isValidQuality(id) {
  return QUALITIES.some((q) => q.id === id);
}

function quality(id) {
  const q = QUALITIES.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown chord quality: ${id}`);
  return q;
}

/** The roles a chord-tone Pitch can hold, in strip order. Stored as numbers. */
export const TONES = [1, 3, 5, 7, 9];
const TONE_LABEL = { 1: 'R', 3: '3', 5: '5', 7: '7', 9: '9' };

/** A role as the strip and the grid write it: `R` for the root, else its number. */
export function toneLabel(tone) {
  return TONE_LABEL[tone] ?? String(tone);
}

export function isValidTone(tone) {
  return TONES.includes(tone);
}

/*
 * Which interval fills each role's position in a chord. A sus chord's 2nd or 4th
 * stands where the 3rd would; a 6th stands where a 7th would. Anything in the
 * range is the member for that role.
 */
const TONE_RANGE = { 1: [0, 0], 3: [2, 5], 5: [6, 8], 7: [9, 11], 9: [13, 14] };

/* Letters up from the root for each interval, so a chord tone is spelled as the
   interval it is — the 3rd of D♭ is F, not E (AC-2.2.15/5's rule, per chord). */
const LETTER_STEPS = { 0: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 13: 8, 14: 8 };

/**
 * The interval a role sounds on a chord. A role the chord lacks falls back to
 * the chord's next-lower member (AC-2.6.4/2) — never silence, never the scale.
 *
 * @returns {{interval: number, tone: number}} the member and the role it is
 */
export function memberFor(chord, tone) {
  const { intervals } = quality(chord.quality);
  const order = TONES.slice(0, TONES.indexOf(tone) + 1).reverse();
  for (const role of order) {
    const [lo, hi] = TONE_RANGE[role];
    const interval = intervals.find((i) => i >= lo && i <= hi);
    if (interval !== undefined) return { interval, tone: role };
  }
  return { interval: 0, tone: 1 };
}

/** Whether a chord has a member of its own in a role's position. */
export function hasTone(chord, tone) {
  return memberFor(chord, tone).tone === tone;
}

/**
 * Named progressions (AC-2.6.1/1). A step is a degree of the Key; `seventh`
 * asks for the diatonic seventh chord, and an explicit `quality` overrides
 * the scale — the blues is dominant sevenths whatever the scale says, and a
 * borrowed chord is what it is.
 */
const s = (degree, extra = {}) => ({ degree, ...extra });
export const PROGRESSIONS = [
  { id: 'I-IV-V', label: 'I–IV–V', steps: [s('1'), s('4'), s('5')] },
  { id: 'I-V-vi-IV', label: 'I–V–vi–IV (pop)', steps: [s('1'), s('5'), s('6'), s('4')] },
  { id: 'vi-IV-I-V', label: 'vi–IV–I–V', steps: [s('6'), s('4'), s('1'), s('5')] },
  { id: 'I-vi-IV-V', label: 'I–vi–IV–V (’50s)', steps: [s('1'), s('6'), s('4'), s('5')] },
  {
    id: 'ii-V-I',
    label: 'ii–V–I (jazz)',
    steps: [s('2', { seventh: true }), s('5', { seventh: true }), s('1', { seventh: true })],
  },
  {
    id: 'I-vi-ii-V',
    label: 'I–vi–ii–V (turnaround)',
    steps: [
      s('1', { seventh: true }),
      s('6', { seventh: true }),
      s('2', { seventh: true }),
      s('5', { seventh: true }),
    ],
  },
  {
    id: 'twelve-bar-blues',
    label: 'Twelve-bar blues',
    steps: ['1', '1', '1', '1', '4', '4', '1', '1', '5', '4', '1', '5'].map((d) => s(d, { quality: '7' })),
  },
  {
    id: 'andalusian',
    label: 'i–♭VII–♭VI–V (Andalusian)',
    steps: [s('1', { quality: 'min' }), s('b7'), s('b6'), s('5', { quality: 'maj' })],
  },
  { id: 'i-iv-v', label: 'i–iv–v', steps: [s('1', { quality: 'min' }), s('4', { quality: 'min' }), s('5', { quality: 'min' })] },
  {
    id: 'i-bVI-bIII-bVII',
    label: 'i–♭VI–♭III–♭VII',
    steps: [s('1', { quality: 'min' }), s('b6'), s('b3'), s('b7')],
  },
  { id: 'I-IV-vi-V', label: 'I–IV–vi–V', steps: [s('1'), s('4'), s('6'), s('5')] },
  {
    id: 'pachelbel',
    label: 'I–V–vi–iii–IV–I–IV–V (Pachelbel)',
    steps: ['1', '5', '6', '3', '4', '1', '4', '5'].map((d) => s(d)),
  },
  { id: 'I-bVII-IV', label: 'I–♭VII–IV (Mixolydian)', steps: [s('1'), s('b7'), s('4')] },
  { id: 'I-IV', label: 'I–IV', steps: [s('1'), s('4')] },
  { id: 'ii-V', label: 'ii–V', steps: [s('2', { seventh: true }), s('5', { seventh: true })] },
];

/** The arpeggios a Pattern can follow (AC-2.6.6/1). Absent on the Pattern means None. */
export const ARPEGGIOS = [
  { id: 'up', label: 'Ascending' },
  { id: 'down', label: 'Descending' },
  { id: 'up-down', label: 'Up and down' },
  { id: 'alberti', label: 'Alberti' },
  { id: 'root', label: 'Root only' },
  { id: 'root-fifth', label: 'Root and fifth' },
];

export const CHANGES = ['pass', 'measure'];
export const DEFAULT_CHANGE = 'pass';
export const MAX_CHORDS = 16;

/* --- spelling a progression from Key and scale ---------------------------- */

/**
 * The seven degrees chords are stacked from. A seven-note scale is its own; a
 * pentatonic or blues scale has no thirds to stack, so it borrows the parallel
 * Ionian, or Aeolian when it has ♭3 and no 3 (AC-2.6.1/4).
 */
function stackingDegrees(scaleId) {
  const scale = SCALES.find((x) => x.id === scaleId);
  if (!scale) throw new Error(`Unknown scale: ${scaleId}`);
  if (scale.degrees.length === 7) return scale.degrees;
  const minor = scale.degrees.includes('b3') && !scale.degrees.includes('3');
  return SCALES.find((x) => x.id === (minor ? 'aeolian' : 'ionian')).degrees;
}

/**
 * The chord a progression step spells under a scale: thirds stacked from the
 * scale's own degrees, matched to the catalogue. A root outside the scale takes
 * the step's own quality or a major triad (AC-2.6.1/5).
 */
export function diatonicChord(scaleId, degree, { seventh = false, quality: fixed = null } = {}) {
  if (fixed) return { degree, quality: fixed };
  const semis = stackingDegrees(scaleId).map((d) => degreeSemitones(d) % 12);
  const root = degreeSemitones(degree) % 12;
  const i = semis.indexOf(root);
  if (i < 0) return { degree, quality: seventh ? '7' : 'maj' };

  const above = (k) => (semis[(i + k) % 7] - root + 12) % 12;
  const third = above(2);
  const fifth = above(4);
  const sev = above(6);
  const match = (n, extra) =>
    QUALITIES.find(
      (q) =>
        q.intervals.length === n &&
        q.intervals[1] === third &&
        q.intervals[2] === fifth &&
        (n === 3 || q.intervals[3] === extra)
    );
  const chord = (seventh && match(4, sev)) || match(3);
  return { degree, quality: chord?.id ?? (seventh ? '7' : 'maj') };
}

/** Every chord a catalogue entry spells under this Pattern's scale. */
export function spellProgression(progressionId, scaleId = DEFAULT_SCALE) {
  const entry = PROGRESSIONS.find((p) => p.id === progressionId);
  if (!entry) throw new Error(`Unknown progression: ${progressionId}`);
  return entry.steps.map((step) => diatonicChord(scaleId, step.degree, step));
}

/**
 * Which catalogue entry the Pattern's chords are, spelled under its scale — or
 * null once the Composer has edited them into something of their own.
 */
export function matchProgression(pattern) {
  if (!hasHarmony(pattern)) return null;
  const chords = pattern.harmony.chords;
  const same = (a, b) => a.length === b.length && a.every((c, i) => c.degree === b[i].degree && c.quality === b[i].quality);
  return PROGRESSIONS.find((p) => same(spellProgression(p.id, pattern.scale ?? DEFAULT_SCALE), chords))?.id ?? null;
}

/* --- the chord in force --------------------------------------------------- */

export function hasHarmony(pattern) {
  return Boolean(pattern?.harmony?.chords?.length);
}

export function isValidArpeggio(id) {
  return ARPEGGIOS.some((a) => a.id === id);
}

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/**
 * The index of the chord in force for a Measure of a pass (AC-2.6.3), or null
 * without a progression. Every pass: chord p mod n. Every Measure: the chords
 * are dealt across Measures continuously, so chord (p × M + m) mod n.
 */
export function chordAt(pattern, pass, measureIndex) {
  if (!hasHarmony(pattern)) return null;
  const n = pattern.harmony.chords.length;
  if (pattern.harmony.change === 'measure') {
    return (pass * pattern.measures.length + measureIndex) % n;
  }
  return pass % n;
}

/** The chord itself, or null. */
export function chordIn(pattern, pass, measureIndex) {
  const i = chordAt(pattern, pass, measureIndex);
  return i === null ? null : pattern.harmony.chords[i];
}

/** The chord in force at the position that follows this one — what to play next. */
export function nextChordAt(pattern, pass, measureIndex) {
  if (!hasHarmony(pattern)) return null;
  if (pattern.harmony.change === 'measure') {
    const last = measureIndex >= pattern.measures.length - 1;
    return chordAt(pattern, last ? pass + 1 : pass, last ? 0 : measureIndex + 1);
  }
  return chordAt(pattern, pass + 1, 0);
}

/**
 * Passes until the progression is back at its first chord on Measure 1 — what
 * a MIDI export spans (AC-2.6.10/1). One without a progression.
 */
export function cyclePasses(pattern) {
  if (!hasHarmony(pattern)) return 1;
  const n = pattern.harmony.chords.length;
  if (pattern.harmony.change !== 'measure') return n;
  const m = pattern.measures.length;
  return (n * m) / gcd(n, m) / m;
}

/* --- resolving and naming a chord tone ------------------------------------ */

/**
 * A chord-tone Pitch against a chord and a Key (AC-2.6.4). The chord's root
 * sits at the Pitch's octave and its members stack above it, so the 5th of G
 * in C at octave 4 is D5 — the shape the arpeggio has when played.
 *
 * @param {{tone: number, octaveOffset?: number}} pitch
 * @returns {{midiNote: number, frequency: number}}
 */
export function resolveChordTone(pitch, chord, key) {
  if (!chord) throw new Error('A chord-tone Pitch needs a chord to resolve against');
  if (!isValidTone(pitch?.tone)) throw new Error(`Invalid chord tone: ${pitch?.tone}`);
  const octaveOffset = pitch.octaveOffset ?? 0;
  if (!Number.isInteger(octaveOffset)) {
    throw new Error(`octaveOffset must be an integer, got ${octaveOffset}`);
  }
  const midiNote =
    BASE_MIDI +
    keySemitones(key) +
    degreeSemitones(chord.degree) +
    memberFor(chord, pitch.tone).interval +
    12 * octaveOffset;
  return { midiNote, frequency: midiToFrequency(midiNote) };
}

/**
 * The note a chord tone sounds, spelled from the chord's root letter by the
 * interval it is — so it reads as the member it is on a stave.
 */
export function chordToneName(pitch, chord, key) {
  const { midiNote } = resolveChordTone(pitch, chord, key);
  const { interval } = memberFor(chord, pitch.tone);
  const [, digits] = splitDegree(chord.degree);
  const rootLetter = letterAbove(key[0], Number(digits) - 1);
  return spellFromLetter(midiNote, letterAbove(rootLetter, LETTER_STEPS[interval] ?? 0), `Tone ${pitch.tone} of ${chordName(chord, key)}`);
}

/** The chord's name in the Key: root letter and accidental, then the quality's suffix (AC-2.6.7/1). */
export function chordName(chord, key) {
  const root = noteName({ degree: chord.degree, octaveOffset: 0 }, key);
  return `${root.letter}${root.accidental}${quality(chord.quality).suffix}`;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** The chord as a roman numeral: case from the third, accidental from the degree. */
export function chordNumeral(chord) {
  const [accidental, digits] = splitDegree(chord.degree);
  const q = quality(chord.quality);
  let numeral = ROMAN[(Number(digits) - 1) % 7];
  if (q.intervals[1] === 3) numeral = numeral.toLowerCase();
  const glyph = accidental === 'b' ? '♭' : accidental === '#' ? '♯' : '';
  return `${glyph}${numeral}${q.numeral}`;
}

/* --- mutations (every one returns a new Pattern) -------------------------- */

/**
 * A fixed degree read against a chord: the role it is a member as, at the
 * octave that keeps it sounding where it was — or null when the degree is not
 * a member of the chord at all (AC-2.6.1/7). A tonic under chord I is that
 * chord's Root; degree 7 under a G triad is its 3rd; degree 2 under C is nothing.
 *
 * @param {{degree: string, octaveOffset?: number}} pitch
 * @returns {{tone: number, octaveOffset: number}|null}
 */
export function degreeAsTone(pitch, chord) {
  if (!chord || pitch?.degree === undefined) return null;
  const semis = degreeSemitones(pitch.degree);
  const root = degreeSemitones(chord.degree);
  for (const tone of TONES) {
    const member = memberFor(chord, tone);
    if (member.tone !== tone) continue;
    const gap = semis - root - member.interval;
    if (((gap % 12) + 12) % 12 !== 0) continue;
    return { tone, octaveOffset: (pitch.octaveOffset ?? 0) + gap / 12 };
  }
  return null;
}

/**
 * Give the Pattern a catalogue progression, spelled under its Key and scale
 * (AC-2.6.1/2). Every fixed degree that is a member of the first chord becomes
 * that role, so a Pattern of tonics follows the progression at once; degrees
 * that are not members stay fixed, so a written melody is not flattened
 * (AC-2.6.1/7).
 */
export function setProgression(pattern, progressionId) {
  const chords = spellProgression(progressionId, pattern.scale ?? DEFAULT_SCALE);
  const next = {
    ...clone(pattern),
    harmony: { change: pattern.harmony?.change ?? DEFAULT_CHANGE, chords },
  };
  for (const measure of next.measures) {
    for (const beat of measure.beats) {
      for (const slot of beat.slots) {
        if (!slot.on || !slot.pitch) continue;
        const role = degreeAsTone(slot.pitch, chords[0]);
        if (role) slot.pitch = role;
      }
    }
  }
  return next;
}

/**
 * Remove the progression. Every chord-tone Pitch becomes the degree it sounded
 * under the first chord, so the first pass is unchanged and no Slot is left
 * holding a role with nothing to resolve it (AC-2.6.1/6).
 */
export function clearHarmony(pattern) {
  const next = clone(pattern);
  const first = next.harmony?.chords?.[0];
  // Under an arpeggio what sounded was the dealt role, so that is what bakes.
  const deal = arpeggioDeal(next);
  next.measures.forEach((measure, m) => {
    measure.beats.forEach((beat, b) => {
      beat.slots.forEach((slot, s) => {
        const dealt = deal?.get(dealKey(m, b, s));
        if (dealt !== undefined) slot.pitch = { tone: dealt, octaveOffset: slot.pitch?.octaveOffset ?? 0 };
      });
    });
  });
  for (const measure of next.measures) {
    for (const beat of measure.beats) {
      for (const slot of beat.slots) {
        if (slot.pitch?.tone === undefined) continue;
        if (!first) {
          slot.pitch = { degree: '1', octaveOffset: slot.pitch.octaveOffset ?? 0 };
          continue;
        }
        const semis = degreeSemitones(first.degree) + memberFor(first, slot.pitch.tone).interval;
        slot.pitch = {
          degree: chromaticToken(semis),
          octaveOffset: (slot.pitch.octaveOffset ?? 0) + Math.floor(semis / 12),
        };
      }
    }
  }
  delete next.harmony;
  return next;
}

function withHarmony(pattern, edit) {
  if (!hasHarmony(pattern)) throw new Error('The Pattern has no progression');
  const next = clone(pattern);
  edit(next.harmony);
  return next;
}

export function setChange(pattern, change) {
  if (!CHANGES.includes(change)) throw new Error(`Chord change must be one of ${CHANGES.join(', ')}`);
  return withHarmony(pattern, (h) => {
    h.change = change;
  });
}

export function setChordQuality(pattern, index, qualityId) {
  if (!isValidQuality(qualityId)) throw new Error(`Unknown chord quality: ${qualityId}`);
  return withHarmony(pattern, (h) => {
    h.chords[index].quality = qualityId;
  });
}

export function setChordDegree(pattern, index, degree) {
  splitDegree(degree); // throws on a malformed token
  return withHarmony(pattern, (h) => {
    h.chords[index].degree = degree;
  });
}

/** A chord is added as a copy of the last, ready to be edited (AC-2.6.2/4). */
export function addChord(pattern) {
  return withHarmony(pattern, (h) => {
    if (h.chords.length >= MAX_CHORDS) throw new Error(`A progression holds at most ${MAX_CHORDS} chords`);
    h.chords.push({ ...h.chords[h.chords.length - 1] });
  });
}

export function removeChord(pattern, index) {
  return withHarmony(pattern, (h) => {
    if (h.chords.length <= 1) throw new Error('A progression keeps at least one chord');
    h.chords.splice(index, 1);
  });
}

/** Set which arpeggio the notes follow; None removes it and the stored Pitches sound again. */
export function setArpeggio(pattern, id) {
  if (id !== null && id !== 'none' && !isValidArpeggio(id)) throw new Error(`Unknown arpeggio: ${id}`);
  return withHarmony(pattern, (h) => {
    if (id === null || id === 'none') delete h.arpeggio;
    else h.arpeggio = id;
  });
}

/** The roles an arpeggio deals: the members of the progression's fullest chord (AC-2.6.6/5). */
export function arpeggioRoles(pattern) {
  const chords = pattern.harmony?.chords ?? [];
  return TONES.filter((tone) => chords.some((c) => hasTone(c, tone)));
}

/** The role sequence an arpeggio deals, given the roles available. */
export function arpeggioSequence(order, roles) {
  switch (order) {
    case 'up':
      return roles;
    case 'down':
      return [...roles].reverse();
    case 'up-down':
      return roles.length < 3 ? roles : [...roles, ...roles.slice(1, -1).reverse()];
    case 'alberti':
      return [1, 5, 3, 5].filter((t) => roles.includes(t));
    case 'root':
      return [1];
    case 'root-fifth':
      return roles.includes(5) ? [1, 5] : [1];
    default:
      throw new Error(`Unknown arpeggio: ${order}`);
  }
}

/** The key a dealt role is filed under: Measure, Beat and Slot index. */
export function dealKey(measureIndex, beatIndex, slotIndex) {
  return `${measureIndex}:${beatIndex}:${slotIndex}`;
}

/**
 * The arpeggio's deal: which role each sounding Slot sounds, dealt in time
 * order continuously through the pass and restarting at its top (AC-2.6.6/2).
 * Derived on every read and never stored, so it follows the rhythm as it is
 * edited (AC-2.6.6/6); null when the Pattern has no arpeggio.
 *
 * @returns {Map<string, number>|null} dealKey → tone
 */
export function arpeggioDeal(pattern) {
  const order = pattern?.harmony?.arpeggio;
  if (!order || !hasHarmony(pattern)) return null;
  const sequence = arpeggioSequence(order, arpeggioRoles(pattern));
  const deal = new Map();
  let k = 0;
  pattern.measures.forEach((measure, m) => {
    measure.beats.forEach((beat, b) => {
      beat.slots.forEach((slot, s) => {
        if (!slot.on) return;
        deal.set(dealKey(m, b, s), sequence[k % sequence.length]);
        k += 1;
      });
    });
  });
  return deal;
}

/**
 * The Pitch a Slot actually sounds: the dealt role under an arpeggio, at the
 * Slot's own octave, else the Pitch it holds. The one place the two are
 * reconciled, so the timeline and the grid cannot disagree.
 */
export function soundingPitch(slot, deal, measureIndex, beatIndex, slotIndex) {
  const dealt = deal?.get(dealKey(measureIndex, beatIndex, slotIndex));
  if (dealt === undefined) return slot.pitch ?? null;
  return { tone: dealt, octaveOffset: slot.pitch?.octaveOffset ?? 0 };
}
