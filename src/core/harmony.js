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
 * The headings the picker files the catalogue under (AC-2.6.1/1), in order.
 */
export const PROGRESSION_GROUPS = [
  { id: 'three', label: 'Three chords and repeats' },
  { id: 'pop', label: 'Pop' },
  { id: 'minor', label: 'Minor' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'blues', label: 'Blues' },
  { id: 'modal', label: 'Modal and rock' },
  { id: 'classical', label: 'Classical and folk' },
];

/**
 * Named progressions (AC-2.6.1/1, /8–/14). A step is a degree of the Key;
 * `seventh` asks for the diatonic seventh chord, and an explicit `quality`
 * overrides the scale — the blues is dominant sevenths whatever the scale
 * says, a borrowed chord is what it is, and a minor-key entry is minor under
 * any scale so it is what it says.
 *
 * The repeat shapes of a three-chord progression — first, middle or last
 * chord doubled — are entries of their own: a four-chord loop with one chord
 * held is a different thing to practise from the three-chord loop it came from.
 */
const s = (degree, extra = {}) => ({ degree, ...extra });
const seq = (...degrees) => degrees.map((d) => s(d));
const sevenths = (...degrees) => degrees.map((d) => s(d, { seventh: true }));
const doms = (...degrees) => degrees.map((d) => s(d, { quality: '7' }));
const min = (degree) => s(degree, { quality: 'min' });
const maj = (degree) => s(degree, { quality: 'maj' });
const entry = (group, id, label, steps) => ({ id, label, group, steps });

export const PROGRESSIONS = [
  // --- Three chords and repeats (AC-2.6.1/8) ---
  entry('three', 'I-IV-V', 'I–IV–V', seq('1', '4', '5')),
  entry('three', 'I-I-IV-V', 'I–I–IV–V', seq('1', '1', '4', '5')),
  entry('three', 'I-IV-IV-V', 'I–IV–IV–V', seq('1', '4', '4', '5')),
  entry('three', 'I-IV-V-V', 'I–IV–V–V (La Bamba)', seq('1', '4', '5', '5')),
  entry('three', 'I-IV-V-IV', 'I–IV–V–IV (Wild Thing)', seq('1', '4', '5', '4')),
  entry('three', 'I-IV-V-I', 'I–IV–V–I', seq('1', '4', '5', '1')),
  entry('three', 'I-IV-I-V', 'I–IV–I–V', seq('1', '4', '1', '5')),
  entry('three', 'I-V-IV', 'I–V–IV', seq('1', '5', '4')),
  entry('three', 'I-V-IV-I', 'I–V–IV–I', seq('1', '5', '4', '1')),
  entry('three', 'I-IV', 'I–IV', seq('1', '4')),
  entry('three', 'I-V', 'I–V', seq('1', '5')),

  // --- Pop (AC-2.6.1/9) ---
  entry('pop', 'I-V-vi-IV', 'I–V–vi–IV (pop)', seq('1', '5', '6', '4')),
  entry('pop', 'vi-IV-I-V', 'vi–IV–I–V', seq('6', '4', '1', '5')),
  entry('pop', 'IV-I-V-vi', 'IV–I–V–vi', seq('4', '1', '5', '6')),
  entry('pop', 'V-vi-IV-I', 'V–vi–IV–I', seq('5', '6', '4', '1')),
  entry('pop', 'IV-V-vi-I', 'IV–V–vi–I', seq('4', '5', '6', '1')),
  entry('pop', 'I-vi-IV-V', 'I–vi–IV–V (’50s)', seq('1', '6', '4', '5')),
  entry('pop', 'I-IV-vi-V', 'I–IV–vi–V', seq('1', '4', '6', '5')),
  entry('pop', 'I-V-vi-iii', 'I–V–vi–iii', seq('1', '5', '6', '3')),
  entry('pop', 'I-iii-vi-IV', 'I–iii–vi–IV', seq('1', '3', '6', '4')),
  entry('pop', 'I-ii-IV-V', 'I–ii–IV–V', seq('1', '2', '4', '5')),
  entry('pop', 'I-IV-ii-V', 'I–IV–ii–V', seq('1', '4', '2', '5')),
  entry('pop', 'I-ii-iii-IV', 'I–ii–iii–IV (ascending)', seq('1', '2', '3', '4')),
  entry('pop', 'vi-V-IV-III', 'vi–V–IV–III (Andalusian, relative minor)', [...seq('6', '5', '4'), maj('3')]),
  entry('pop', 'IV-V-iii-vi', 'IV–V–iii–vi (Royal Road)', [...sevenths('4', '5', '3'), s('6')]),
  entry('pop', 'I-III-IV-iv', 'I–III–IV–iv (Creep)', [s('1'), maj('3'), s('4'), min('4')]),
  entry('pop', 'I-IV-iv-I', 'I–IV–iv–I (minor four)', [s('1'), s('4'), min('4'), s('1')]),
  entry('pop', 'I-Imaj7-I7-IV', 'I–Imaj7–I7–IV (Something)', [
    s('1'),
    s('1', { quality: 'maj7' }),
    s('1', { quality: '7' }),
    s('4'),
  ]),
  entry('pop', 'vi-I-V-II', 'vi–I–V–II (Wonderwall)', [
    s('6', { seventh: true }),
    s('1'),
    s('5'),
    s('2', { quality: '7sus4' }),
  ]),

  // --- Minor (AC-2.6.1/10) ---
  entry('minor', 'i-iv-v', 'i–iv–v', [min('1'), min('4'), min('5')]),
  entry('minor', 'i-i-iv-v', 'i–i–iv–v', [min('1'), min('1'), min('4'), min('5')]),
  entry('minor', 'i-iv-iv-v', 'i–iv–iv–v', [min('1'), min('4'), min('4'), min('5')]),
  entry('minor', 'i-iv-v-v', 'i–iv–v–v', [min('1'), min('4'), min('5'), min('5')]),
  entry('minor', 'i-iv-V', 'i–iv–V (harmonic minor)', [min('1'), min('4'), maj('5')]),
  entry('minor', 'i-i-iv-V', 'i–i–iv–V', [min('1'), min('1'), min('4'), maj('5')]),
  entry('minor', 'i-iv-iv-V', 'i–iv–iv–V', [min('1'), min('4'), min('4'), maj('5')]),
  entry('minor', 'i-iv-V-V', 'i–iv–V–V', [min('1'), min('4'), maj('5'), maj('5')]),
  entry('minor', 'i-iv-i-V', 'i–iv–i–V', [min('1'), min('4'), min('1'), maj('5')]),
  entry('minor', 'i-bVI-bIII-bVII', 'i–♭VI–♭III–♭VII', [min('1'), s('b6'), s('b3'), s('b7')]),
  entry('minor', 'andalusian', 'i–♭VII–♭VI–V (Andalusian)', [min('1'), s('b7'), s('b6'), maj('5')]),
  entry('minor', 'i-bVII-bVI-bVII', 'i–♭VII–♭VI–♭VII (Aeolian vamp)', [min('1'), s('b7'), s('b6'), s('b7')]),
  entry('minor', 'i-bVI-bVII', 'i–♭VI–♭VII', [min('1'), s('b6'), s('b7')]),
  entry('minor', 'i-bVII-bVI', 'i–♭VII–♭VI', [min('1'), s('b7'), s('b6')]),
  entry('minor', 'i-bIII-bVII-bVI', 'i–♭III–♭VII–♭VI', [min('1'), s('b3'), s('b7'), s('b6')]),
  entry('minor', 'i-iv-bVII-bIII', 'i–iv–♭VII–♭III', [min('1'), min('4'), s('b7'), s('b3')]),
  entry('minor', 'bVI-bVII-i', '♭VI–♭VII–i', [s('b6'), s('b7'), min('1')]),
  entry('minor', 'hotel-california', 'i–V–♭VII–IV–♭VI–♭III–iv–V (Hotel California)', [
    min('1'),
    maj('5'),
    s('b7'),
    maj('4'),
    s('b6'),
    s('b3'),
    min('4'),
    maj('5'),
  ]),

  // --- Jazz (AC-2.6.1/11) ---
  entry('jazz', 'ii-V-I', 'ii–V–I (jazz)', sevenths('2', '5', '1')),
  entry('jazz', 'ii-V', 'ii–V', sevenths('2', '5')),
  entry('jazz', 'ii-V-I-I', 'ii–V–I–I', sevenths('2', '5', '1', '1')),
  entry('jazz', 'ii-V-I-VI7', 'ii–V–I–VI7 (turnaround)', [...sevenths('2', '5', '1'), ...doms('6')]),
  entry('jazz', 'I-vi-ii-V', 'I–vi–ii–V (turnaround)', sevenths('1', '6', '2', '5')),
  entry('jazz', 'iii-vi-ii-V', 'iii–vi–ii–V', sevenths('3', '6', '2', '5')),
  entry('jazz', 'I-VI7-ii-V', 'I–VI7–ii–V', [...sevenths('1'), ...doms('6'), ...sevenths('2', '5')]),
  entry('jazz', 'iio-V-i', 'ii°–V–i (minor)', [s('2', { quality: 'm7b5' }), ...doms('5'), s('1', { quality: 'm7' })]),
  entry('jazz', 'ragtime', 'III7–VI7–II7–V7–I (ragtime)', [...doms('3', '6', '2', '5'), ...sevenths('1')]),
  entry('jazz', 'backdoor', 'iv–♭VII–I (backdoor)', [s('4', { quality: 'm7' }), ...doms('b7'), ...sevenths('1')]),
  entry('jazz', 'tritone', 'ii–♭II–I (tritone substitution)', [...sevenths('2'), ...doms('b2'), ...sevenths('1')]),
  entry('jazz', 'autumn-leaves', 'iv–♭VII–♭III–♭VI–ii°–V–i (Autumn Leaves)', [
    s('4', { quality: 'm7' }),
    ...doms('b7'),
    s('b3', { quality: 'maj7' }),
    s('b6', { quality: 'maj7' }),
    s('2', { quality: 'm7b5' }),
    ...doms('5'),
    s('1', { quality: 'm7' }),
  ]),
  entry('jazz', 'coltrane', 'I–♭III7–♭VI–VII7–III–V7–I (Coltrane changes)', [
    ...sevenths('1'),
    ...doms('b3'),
    s('b6', { quality: 'maj7' }),
    ...doms('7'),
    s('3', { quality: 'maj7' }),
    ...doms('5'),
    ...sevenths('1'),
  ]),
  entry('jazz', 'circle-sevenths', 'I–IV–vii°–iii–vi–ii–V–I (circle of fifths, sevenths)', sevenths('1', '4', '7', '3', '6', '2', '5', '1')),

  // --- Blues (AC-2.6.1/12) ---
  entry('blues', 'twelve-bar-blues', 'Twelve-bar blues', doms('1', '1', '1', '1', '4', '4', '1', '1', '5', '4', '1', '5')),
  entry('blues', 'quick-change-blues', 'Twelve-bar blues, quick change', doms('1', '4', '1', '1', '4', '4', '1', '1', '5', '4', '1', '5')),
  entry('blues', 'v-v-blues', 'Twelve-bar blues, V–V', doms('1', '1', '1', '1', '4', '4', '1', '1', '5', '5', '1', '1')),
  entry('blues', 'no-turnaround-blues', 'Twelve-bar blues, no turnaround', doms('1', '1', '1', '1', '4', '4', '1', '1', '5', '4', '1', '1')),
  entry('blues', 'minor-blues', 'Twelve-bar minor blues', [
    ...['1', '1', '1', '1', '4', '4', '1', '1'].map((d) => s(d, { quality: 'm7' })),
    ...doms('b6', '5'),
    s('1', { quality: 'm7' }),
    ...doms('5'),
  ]),
  entry('blues', 'jazz-blues', 'Twelve-bar jazz blues', [
    ...doms('1', '4', '1', '1', '4', '4', '1', '6'),
    s('2', { quality: 'm7' }),
    ...doms('5', '1', '5'),
  ]),
  entry('blues', 'eight-bar-blues', 'Eight-bar blues', doms('1', '5', '4', '4', '1', '5', '1', '5')),
  entry('blues', 'I7-IV7-V7', 'I7–IV7–V7', doms('1', '4', '5')),

  // --- Modal and rock (AC-2.6.1/13) ---
  entry('modal', 'I-bVII-IV', 'I–♭VII–IV (Mixolydian)', seq('1', 'b7', '4')),
  entry('modal', 'I-bVII-IV-I', 'I–♭VII–IV–I', seq('1', 'b7', '4', '1')),
  entry('modal', 'I-I-bVII-IV', 'I–I–♭VII–IV', seq('1', '1', 'b7', '4')),
  entry('modal', 'I-bVII-IV-IV', 'I–♭VII–IV–IV', seq('1', 'b7', '4', '4')),
  entry('modal', 'I-bVII', 'I–♭VII (Mixolydian vamp)', seq('1', 'b7')),
  entry('modal', 'bVI-bVII-I', '♭VI–♭VII–I (Mario cadence)', seq('b6', 'b7', '1')),
  entry('modal', 'I-bIII-IV', 'I–♭III–IV', seq('1', 'b3', '4')),
  entry('modal', 'i-IV', 'i–IV (Dorian)', [min('1'), maj('4')]),
  entry('modal', 'i-bVII', 'i–♭VII', [min('1'), s('b7')]),
  entry('modal', 'I-II', 'I–II (Lydian)', [s('1'), maj('2')]),
  entry('modal', 'i-bII', 'i–♭II (Phrygian)', [min('1'), s('b2')]),

  // --- Classical and folk (AC-2.6.1/14) ---
  entry('classical', 'pachelbel', 'I–V–vi–iii–IV–I–IV–V (Pachelbel)', seq('1', '5', '6', '3', '4', '1', '4', '5')),
  entry('classical', 'passamezzo-antico', 'i–♭VII–i–V–♭III–♭VII–i–V (Passamezzo antico)', [
    min('1'),
    s('b7'),
    min('1'),
    maj('5'),
    s('b3'),
    s('b7'),
    min('1'),
    maj('5'),
  ]),
  entry('classical', 'romanesca', '♭III–♭VII–i–V (Romanesca)', [s('b3'), s('b7'), min('1'), maj('5')]),
  entry('classical', 'folia', 'i–V–i–♭VII–♭III–♭VII–i–V (Folia)', [
    min('1'),
    maj('5'),
    min('1'),
    s('b7'),
    s('b3'),
    s('b7'),
    min('1'),
    maj('5'),
  ]),
  entry('classical', 'circle-triads', 'I–IV–vii°–iii–vi–ii–V–I (circle of fifths, triads)', seq('1', '4', '7', '3', '6', '2', '5', '1')),
  entry('classical', 'I-ii-V-I', 'I–ii–V–I', seq('1', '2', '5', '1')),
];

/*
 * A fill pattern is a sequence of STEPS (AC-2.6.6/9), each one of:
 *   { tone, octave? }            a chord tone at an octave (Root, 3rd, …, R↑)
 *   { drone: 'tonic'|'root', octave }   the Key's tonic or the chord's root, fixed
 *   { scale: kind, step, octave? }      the n-th step of a scale rooted on the chord
 * Every catalogue entry builds its sequence from the progression's roles and,
 * for a walk, the scale it names. Nothing here is stored: the deal is derived.
 */
const T = (tone, octave = 0) => (octave ? { tone, octave } : { tone });
const DRONE_UP = { drone: 'tonic', octave: 1 };
const DRONE_DOWN = { drone: 'tonic', octave: -1 };
const ROOT_UP = { drone: 'root', octave: 1 };
const tones = (roles) => roles.map((r) => T(r));
const interleave = (roles, between) => roles.flatMap((r) => [T(r), between]);
const upDown = (roles) => (roles.length < 3 ? roles : [...roles, ...roles.slice(1, -1).reverse()]);

/** The scales a walk can take (AC-2.6.6/11); `pattern` walks the Pattern's own. */
export const WALK_SCALES = [
  { id: 'major', label: 'major', scale: 'ionian' },
  { id: 'minor', label: 'natural minor', scale: 'aeolian' },
  { id: 'major-pentatonic', label: 'major pentatonic', scale: 'major-pentatonic' },
  { id: 'minor-pentatonic', label: 'minor pentatonic', scale: 'minor-pentatonic' },
  { id: 'pattern', label: "the Pattern's scale", scale: null },
];

/** The degree tokens a walk steps through, rooted on the chord. */
export function walkDegrees(kind, pattern) {
  const walk = WALK_SCALES.find((w) => w.id === kind);
  if (!walk) throw new Error(`Unknown scale walk: ${kind}`);
  const id = walk.scale ?? pattern?.scale ?? DEFAULT_SCALE;
  return SCALES.find((x) => x.id === id).degrees;
}

const walkUp = (kind) => (ctx) => ctx.walk(kind).map((_, i) => ({ scale: kind, step: i + 1 }));
const walkUpDown = (kind) => (ctx) => {
  const n = ctx.walk(kind).length;
  const up = Array.from({ length: n }, (_, i) => ({ scale: kind, step: i + 1 }));
  return [...up, ...up.slice(1, -1).reverse()];
};

/**
 * The arpeggios a Pattern can follow (AC-2.6.6/1), in three groups. Absent on
 * the Pattern means None. `steps(ctx)` takes `{ roles, walk(kind) }`.
 */
export const ARPEGGIOS = [
  { id: 'up', label: 'Ascending', group: 'Chord tones', steps: ({ roles }) => tones(roles) },
  { id: 'down', label: 'Descending', group: 'Chord tones', steps: ({ roles }) => tones([...roles].reverse()) },
  { id: 'up-down', label: 'Up and down', group: 'Chord tones', steps: ({ roles }) => tones(upDown(roles)) },
  {
    id: 'up-down-turn',
    label: 'Up and down, repeating the turn',
    group: 'Chord tones',
    steps: ({ roles }) => tones([...roles, ...[...roles].reverse()]),
  },
  { id: 'alberti', label: 'Alberti', group: 'Chord tones', steps: ({ roles }) => tones([1, 5, 3, 5].filter((t) => roles.includes(t))) },
  { id: 'root', label: 'Root only', group: 'Chord tones', steps: () => [T(1)] },
  { id: 'root-fifth', label: 'Root and fifth', group: 'Chord tones', steps: ({ roles }) => tones(roles.includes(5) ? [1, 5] : [1]) },
  { id: 'up-octave', label: 'Up to the octave', group: 'Chord tones', steps: ({ roles }) => [...tones(roles), T(1, 1)] },
  { id: 'down-octave', label: 'Down from the octave', group: 'Chord tones', steps: ({ roles }) => [T(1, 1), ...tones([...roles].reverse())] },
  {
    id: 'up-over-down',
    label: 'Up over and down',
    group: 'Chord tones',
    steps: ({ roles }) => [...tones(roles), T(1, 1), ...tones([...roles].reverse().slice(0, -1))],
  },
  { id: 'drone-above', label: 'Drone above (tonic)', group: 'Drones', steps: ({ roles }) => interleave(roles, DRONE_UP) },
  { id: 'drone-below', label: 'Drone below (tonic)', group: 'Drones', steps: ({ roles }) => interleave(roles, DRONE_DOWN) },
  { id: 'root-drone', label: 'Chord root drone', group: 'Drones', steps: ({ roles }) => interleave(roles, ROOT_UP) },
  ...WALK_SCALES.map((w) => ({ id: `scale-up-${w.id}`, label: `Scale up, ${w.label}`, group: 'Scale walks', steps: walkUp(w.id) })),
  ...WALK_SCALES.map((w) => ({
    id: `scale-up-down-${w.id}`,
    label: `Scale up and down, ${w.label}`,
    group: 'Scale walks',
    steps: walkUpDown(w.id),
  })),
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
  // Under an arpeggio what sounded in the first pass was the dealt step under
  // the chord in force, so that is what bakes.
  const deal = arpeggioDeal(next, 0);
  next.measures.forEach((measure, m) => {
    const chord = chordIn(next, 0, m);
    measure.beats.forEach((beat, b) => {
      beat.slots.forEach((slot, s) => {
        const step = deal?.get(dealKey(m, b, s));
        if (step !== undefined) slot.pitch = stepAsDegree(step, chord, next, slot.pitch?.octaveOffset ?? 0);
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

/* --- cycle mode: the fill in force (US-2.7) -------------------------------- */

/** The catalogue index of a Pattern's own fill, or 0 — the first — when it has none (AC-2.7.1/3). */
export function fillIndexOf(pattern) {
  const i = ARPEGGIOS.findIndex((a) => a.id === pattern?.harmony?.arpeggio);
  return i < 0 ? 0 : i;
}

/**
 * The catalogue index of the fill in force under cycle mode for the pass `loop`
 * (AC-2.7.2/1, /3): the starting fill, stepped forward once for every `repeats`
 * harmonic cycles played since `baseLoop`, wrapping round the catalogue. None
 * is never in the cycle. Pure, so the grid, the score and the transport agree
 * about which fill a pass is under by construction.
 */
export function fillIndexFor(pattern, { start = 0, baseLoop = 0, repeats = 4 } = {}, loop = 0) {
  const period = Math.max(1, Math.floor(repeats)) * cyclePasses(pattern);
  const steps = Math.floor(Math.max(0, loop - baseLoop) / period);
  const n = ARPEGGIOS.length;
  return (((start + steps) % n) + n) % n;
}

/**
 * The Pattern as played with the fill `id` in force — a playback overlay handed
 * to whoever renders or sounds it, never stored (AC-2.7.1/4). The Pattern
 * itself is returned when it has no progression or already carries that fill.
 */
export function withArpeggio(pattern, id) {
  if (!hasHarmony(pattern) || (pattern.harmony.arpeggio ?? null) === id) return pattern;
  return { ...pattern, harmony: { ...pattern.harmony, arpeggio: id } };
}

/** The roles an arpeggio deals: the members of the progression's fullest chord (AC-2.6.6/5). */
export function arpeggioRoles(pattern) {
  const chords = pattern.harmony?.chords ?? [];
  return TONES.filter((tone) => chords.some((c) => hasTone(c, tone)));
}

/** The step sequence an arpeggio deals for this Pattern. */
export function arpeggioSequence(order, pattern) {
  const entry = ARPEGGIOS.find((a) => a.id === order);
  if (!entry) throw new Error(`Unknown arpeggio: ${order}`);
  return entry.steps({ roles: arpeggioRoles(pattern), walk: (kind) => walkDegrees(kind, pattern) });
}

/** The key a dealt role is filed under: Measure, Beat and Slot index. */
export function dealKey(measureIndex, beatIndex, slotIndex) {
  return `${measureIndex}:${beatIndex}:${slotIndex}`;
}

/**
 * The arpeggio's deal: which step each sounding Slot sounds, dealt in time
 * order continuously through the pass, restarting at its top and whenever the
 * chord in force changes so each chord opens on its own first step
 * (AC-2.6.6/2). Derived on every read and never stored, so it follows the
 * rhythm as it is edited (AC-2.6.6/6); null when the Pattern has no arpeggio.
 *
 * @returns {Map<string, object>|null} dealKey → step
 */
export function arpeggioDeal(pattern, pass = 0) {
  const order = pattern?.harmony?.arpeggio;
  if (!order || !hasHarmony(pattern)) return null;
  const sequence = arpeggioSequence(order, pattern);
  const deal = new Map();
  let k = 0;
  let previous = null;
  pattern.measures.forEach((measure, m) => {
    const chord = chordAt(pattern, pass, m);
    if (m === 0 || chord !== previous) k = 0;
    previous = chord;
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
 * What a Slot actually sounds: the dealt step under an arpeggio, at the Slot's
 * own octave, else the Pitch it holds. The one place the two are reconciled,
 * so the timeline and the grid cannot disagree.
 *
 * @returns {{step: object, octaveOffset: number}|{degree: string}|{tone: number}|null}
 */
export function soundingPitch(slot, deal, measureIndex, beatIndex, slotIndex) {
  const step = deal?.get(dealKey(measureIndex, beatIndex, slotIndex));
  if (step === undefined) return slot.pitch ?? null;
  return { step, octaveOffset: slot.pitch?.octaveOffset ?? 0 };
}

/* --- steps: resolving, naming, baking ------------------------------------ */

/** Semitones above the Key's tonic a step sounds, before the Slot's own octave. */
function stepSemitones(step, chord, pattern) {
  const shift = 12 * (step.octave ?? 0);
  if (step.tone !== undefined) return degreeSemitones(chord.degree) + memberFor(chord, step.tone).interval + shift;
  if (step.drone !== undefined) return (step.drone === 'root' ? degreeSemitones(chord.degree) : 0) + shift;
  if (step.scale !== undefined) {
    const degrees = walkDegrees(step.scale, pattern);
    const i = step.step - 1;
    return (
      degreeSemitones(chord.degree) +
      degreeSemitones(degrees[i % degrees.length]) +
      12 * Math.floor(i / degrees.length) +
      shift
    );
  }
  throw new Error('Unknown step kind');
}

/** A dealt step against the chord in force, the Key and the Slot's octave (AC-2.6.6/9–/11). */
export function resolveStep(step, chord, key, pattern, octaveOffset = 0) {
  if (!chord) throw new Error('A dealt step needs a chord to resolve against');
  const midiNote = BASE_MIDI + keySemitones(key) + stepSemitones(step, chord, pattern) + 12 * octaveOffset;
  return { midiNote, frequency: midiToFrequency(midiNote) };
}

/** The degree a step sounds as, for baking it into a fixed Pitch (AC-2.6.1/6). */
export function stepAsDegree(step, chord, pattern, octaveOffset = 0) {
  const semis = stepSemitones(step, chord, pattern);
  return { degree: chromaticToken(semis), octaveOffset: octaveOffset + Math.floor(semis / 12) };
}

const OCTAVE_MARK = (octave) => (octave > 0 ? '↑'.repeat(octave) : octave < 0 ? '↓'.repeat(-octave) : '');

/** How the band writes a step: `R↑`, `T↑` for the tonic drone, `s3` for a scale step (AC-2.6.6/12). */
export function stepLabel(step) {
  if (step.tone !== undefined) return `${toneLabel(step.tone)}${OCTAVE_MARK(step.octave ?? 0)}`;
  if (step.drone !== undefined) return `${step.drone === 'root' ? 'R' : 'T'}${OCTAVE_MARK(step.octave ?? 0)}`;
  return `s${step.step}`;
}

/** The note a step sounds, spelled against the Key. */
export function stepName(step, chord, key, pattern, octaveOffset = 0) {
  if (step.tone !== undefined) {
    return chordToneName({ tone: step.tone, octaveOffset: octaveOffset + (step.octave ?? 0) }, chord, key);
  }
  return noteName(stepAsDegree(step, chord, pattern, octaveOffset), key);
}
