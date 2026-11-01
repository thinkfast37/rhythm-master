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
  degreeLabel,
  noteName,
  letterAbove,
  spellFromLetter,
} from './pitch.js';
import { SCALES, DEFAULT_SCALE, chromaticToken } from './scales.js';

const clone = (v) => structuredClone(v);

/* --- catalogues ----------------------------------------------------------- */

/** The headings the quality picker files the catalogue under (AC-2.16.3/1), in order. */
export const QUALITY_GROUPS = ['Triads', 'Suspended', 'Sixths', 'Sevenths', 'Added', 'Ninths', 'Elevenths', 'Thirteenths'];

/**
 * Chord qualities, in picker order within their groups (AC-2.6.2/1,
 * AC-2.16.3/1). `intervals` are semitones above the root; `suffix` is what
 * follows the root's name; `numeral` what follows the roman numeral. A minor
 * third makes the numeral lowercase. No quality lists two members in one role
 * (research.md D-023): the stack finds a role's member by its role. The
 * thirteenths leave the 11th out, as a chart does.
 */
const Q = (group, id, label, suffix, numeral, intervals) => ({ id, label, group, suffix, numeral, intervals });
export const QUALITIES = [
  Q('Triads', 'maj', 'major', '', '', [0, 4, 7]),
  Q('Triads', 'min', 'minor', 'm', '', [0, 3, 7]),
  Q('Triads', 'dim', 'diminished', 'dim', '°', [0, 3, 6]),
  Q('Triads', 'aug', 'augmented', 'aug', '+', [0, 4, 8]),
  Q('Triads', '5', '5', '5', '5', [0, 7]),
  Q('Suspended', 'sus2', 'sus2', 'sus2', 'sus2', [0, 2, 7]),
  Q('Suspended', 'sus4', 'sus4', 'sus4', 'sus4', [0, 5, 7]),
  Q('Suspended', '7sus4', '7sus4', '7sus4', '7sus4', [0, 5, 7, 10]),
  Q('Suspended', '7sus2', '7sus2', '7sus2', '7sus2', [0, 2, 7, 10]),
  Q('Suspended', '9sus4', '9sus4', '9sus4', '9sus4', [0, 5, 7, 10, 14]),
  Q('Sixths', '6', '6', '6', '6', [0, 4, 7, 9]),
  Q('Sixths', 'm6', 'm6', 'm6', '6', [0, 3, 7, 9]),
  Q('Sixths', '69', '6/9', '6/9', '6/9', [0, 4, 7, 9, 14]),
  Q('Sixths', 'm69', 'm6/9', 'm6/9', '6/9', [0, 3, 7, 9, 14]),
  Q('Sevenths', 'maj7', 'maj7', 'maj7', 'maj7', [0, 4, 7, 11]),
  Q('Sevenths', 'm7', 'm7', 'm7', '7', [0, 3, 7, 10]),
  Q('Sevenths', '7', '7', '7', '7', [0, 4, 7, 10]),
  Q('Sevenths', 'm7b5', 'm7♭5', 'm7♭5', 'ø7', [0, 3, 6, 10]),
  Q('Sevenths', 'dim7', 'dim7', 'dim7', '°7', [0, 3, 6, 9]),
  Q('Sevenths', 'mMaj7', 'mMaj7', 'mMaj7', 'mMaj7', [0, 3, 7, 11]),
  Q('Sevenths', '7b5', '7♭5', '7♭5', '7♭5', [0, 4, 6, 10]),
  Q('Sevenths', '7#5', '7♯5', '7♯5', '7♯5', [0, 4, 8, 10]),
  Q('Sevenths', 'maj7#5', 'maj7♯5', 'maj7♯5', 'maj7♯5', [0, 4, 8, 11]),
  Q('Added', 'add9', 'add9', 'add9', 'add9', [0, 4, 7, 14]),
  Q('Added', 'madd9', 'madd9', 'madd9', 'add9', [0, 3, 7, 14]),
  Q('Added', 'add11', 'add11', 'add11', 'add11', [0, 4, 7, 17]),
  Q('Added', 'madd11', 'madd11', 'madd11', 'add11', [0, 3, 7, 17]),
  Q('Ninths', '9', '9', '9', '9', [0, 4, 7, 10, 14]),
  Q('Ninths', 'maj9', 'maj9', 'maj9', 'maj9', [0, 4, 7, 11, 14]),
  Q('Ninths', 'm9', 'm9', 'm9', '9', [0, 3, 7, 10, 14]),
  Q('Ninths', '7b9', '7♭9', '7♭9', '7♭9', [0, 4, 7, 10, 13]),
  Q('Ninths', '7#9', '7♯9', '7♯9', '7♯9', [0, 4, 7, 10, 15]),
  Q('Elevenths', '11', '11', '11', '11', [0, 4, 7, 10, 14, 17]),
  Q('Elevenths', 'm11', 'm11', 'm11', '11', [0, 3, 7, 10, 14, 17]),
  Q('Elevenths', 'maj7#11', 'maj7♯11', 'maj7♯11', 'maj7♯11', [0, 4, 7, 11, 18]),
  Q('Elevenths', '7#11', '7♯11', '7♯11', '7♯11', [0, 4, 7, 10, 18]),
  Q('Elevenths', 'maj9#11', 'maj9♯11', 'maj9♯11', 'maj9♯11', [0, 4, 7, 11, 14, 18]),
  Q('Thirteenths', '13', '13', '13', '13', [0, 4, 7, 10, 14, 21]),
  Q('Thirteenths', 'maj13', 'maj13', 'maj13', 'maj13', [0, 4, 7, 11, 14, 21]),
  Q('Thirteenths', 'm13', 'm13', 'm13', '13', [0, 3, 7, 10, 14, 21]),
  Q('Thirteenths', '7b13', '7♭13', '7♭13', '7♭13', [0, 4, 7, 10, 20]),
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
export const TONES = [1, 3, 5, 7, 9, 11, 13];
const TONE_LABEL = { 1: 'R', 3: '3', 5: '5', 7: '7', 9: '9', 11: '11', 13: '13' };

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
const TONE_RANGE = { 1: [0, 0], 3: [2, 5], 5: [6, 8], 7: [9, 11], 9: [13, 15], 11: [17, 18], 13: [20, 21] };

/* Letters up from the root for each interval, so a chord tone is spelled as the
   interval it is — the 3rd of D♭ is F, not E (AC-2.2.15/5's rule, per chord). */
const LETTER_STEPS = { 0: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 13: 8, 14: 8, 15: 8, 17: 10, 18: 10, 20: 12, 21: 12 };

/* What a chart calls the member at each interval — the label an Omit toggle
   wears and the name says (AC-2.16.1/1, /2): a sus chord's 2 or 4, a sixth
   chord's 6; otherwise the role. */
const MEMBER_LABEL = { 2: '2', 5: '4', 9: '6' };

/** The role a listed interval of a quality holds: 0 → Root, 2–5 → 3rd, 6–8 → 5th, 9–11 → 7th, 13–15 → 9th, 17–18 → 11th, 20–21 → 13th. */
function roleOf(interval) {
  return TONES.find((role) => interval >= TONE_RANGE[role][0] && interval <= TONE_RANGE[role][1]) ?? 1;
}

/** The role a quality's interval holds, for a reader outside this module (rule 14). */
export function roleOfInterval(interval) {
  return roleOf(interval);
}

/** The member at an interval, named as a chart names it. */
export function memberLabel(interval) {
  return MEMBER_LABEL[interval] ?? toneLabel(roleOf(interval));
}

const mod12 = (n) => ((n % 12) + 12) % 12;

/** The fewest members a chord keeps: its root and one other (AC-2.16.1/3). */
export const MIN_MEMBERS = 2;

/** The roles struck from a chord (US-2.16); none unless the chord says so. */
export function omitOf(chord) {
  return Array.isArray(chord?.omit) ? chord.omit : [];
}

/**
 * The intervals a chord actually has: its quality's, less the members struck
 * from it (AC-2.16.2). Every reading of a chord's members goes through here,
 * so a struck member is gone from the stack, the bass, the deal and the name
 * alike (research.md D-023).
 */
function intervalsOf(chord) {
  const omit = omitOf(chord);
  const { intervals } = quality(chord.quality);
  return omit.length ? intervals.filter((i) => !omit.includes(roleOf(i))) : intervals;
}

/** How many members a chord has — the basses it offers (AC-2.11.1/1). */
export function memberCount(chord) {
  return intervalsOf(chord).length;
}

/** Which member is in the bass: the stored inversion, clamped to the members the chord has; 0 is the root. */
export function inversionOf(chord) {
  const k = chord?.inversion ?? 0;
  if (!Number.isInteger(k) || k < 0) return 0;
  return Math.min(k, memberCount(chord) - 1);
}

/**
 * The chord's stack, bass first (US-2.11, research.md D-014): each member's
 * role, the interval the quality lists it at, and `offset` — semitones above
 * the Key's tonic at the armed octave. The bass's pitch class sits in the
 * armed octave and the other members stack above it in the chord's own order,
 * so the members below the bass are lifted an octave (AC-2.11.2/1, /2). Over
 * its root a chord is its intervals above its root, exactly as it always was
 * (AC-2.11.2/6).
 *
 * @returns {Array<{tone: number, interval: number, offset: number}>}
 */
export function chordStack(chord) {
  const intervals = intervalsOf(chord);
  const root = degreeSemitones(chord.degree);
  const k = inversionOf(chord);
  const stack = [];
  let previous = -1;
  for (let j = 0; j < intervals.length; j++) {
    const interval = intervals[(k + j) % intervals.length];
    let offset = k === 0 ? root + interval : mod12(root + interval);
    while (offset <= previous) offset += 12;
    stack.push({ tone: roleOf(interval), interval, offset });
    previous = offset;
  }
  return stack;
}

/**
 * The member a role sounds on a chord, where it sits in the chord's stack. A
 * role the chord lacks falls back to the chord's next-lower member
 * (AC-2.6.4/2) — never silence, never the scale.
 *
 * @returns {{interval: number, tone: number, offset: number}} the member, the
 *   role it is, and its semitones above the Key's tonic at the armed octave
 */
export function memberFor(chord, tone) {
  const stack = chordStack(chord);
  const order = TONES.slice(0, TONES.indexOf(tone) + 1).reverse();
  for (const role of order) {
    const member = stack.find((m) => m.tone === role);
    if (member) return member;
  }
  return stack[0];
}

/** The member in the bass. */
export function bassOf(chord) {
  return chordStack(chord)[0];
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
  { id: 'indie', label: 'Indie and alt' },
  { id: 'sus', label: 'Sus and open chords' },
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
 * Those five keep their three-chord original beside them; every other entry of
 * a heading's own has a chord doubled, so it fills four Measures (AC-2.6.1/20).
 */
const s = (degree, extra = {}) => ({ degree, ...extra });
const seq = (...degrees) => degrees.map((d) => s(d));
const sevenths = (...degrees) => degrees.map((d) => s(d, { seventh: true }));
const doms = (...degrees) => degrees.map((d) => s(d, { quality: '7' }));
const min = (degree) => s(degree, { quality: 'min' });
const sus2 = (degree) => s(degree, { quality: 'sus2' });
const sus4 = (degree) => s(degree, { quality: 'sus4' });
const add9 = (degree) => s(degree, { quality: 'add9' });
const maj = (degree) => s(degree, { quality: 'maj' });
/* A song progression's chord, its quality always explicit (AC-2.6.1/18). */
const q = (degree, quality) => s(degree, { quality });
const entry = (group, id, label, steps) => ({ id, label, group, steps });
/* An entry transcribed from a song (AC-2.6.1/18); the songs are credited in core/songbook.js. */
const songEntry = (group, id, label, steps) => ({ ...entry(group, id, label, steps), fromSongs: true });

export const PROGRESSIONS = [
  // --- Three chords and repeats (AC-2.6.1/8) ---
  entry('three', 'I-IV-V', 'I–IV–V', seq('1', '4', '5')),
  entry('three', 'I-I-IV-V', 'I–I–IV–V', seq('1', '1', '4', '5')),
  entry('three', 'I-IV-IV-V', 'I–IV–IV–V', seq('1', '4', '4', '5')),
  entry('three', 'I-IV-V-V', 'I–IV–V–V (La Bamba)', seq('1', '4', '5', '5')),
  entry('three', 'I-IV-V-IV', 'I–IV–V–IV (Wild Thing)', seq('1', '4', '5', '4')),
  entry('three', 'I-IV-V-I', 'I–IV–V–I', seq('1', '4', '5', '1')),
  entry('three', 'I-IV-I-V', 'I–IV–I–V', seq('1', '4', '1', '5')),
  entry('three', 'I-I-V-IV', 'I–I–V–IV', seq('1', '1', '5', '4')),
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
  // Song progressions (AC-2.6.1/18), credited in core/songbook.js.
  songEntry('pop', 'I-V6-IVmaj7-I', 'I–V6–IVmaj7–I (Yellow)', [q('1', 'maj'), q('5', '6'), q('4', 'maj7'), q('1', 'maj')]),
  songEntry('pop', 'IV-V-vi-V', 'IV–V–vi–V (Something Just Like This)', [q('4', 'maj'), q('5', 'maj'), q('6', 'min'), q('5', 'maj')]),
  songEntry('pop', 'IV-V-I-vi', 'IV–V–I–vi (Viva La Vida)', [q('4', 'maj'), q('5', 'maj'), q('1', 'maj'), q('6', 'min')]),
  songEntry('pop', 'IV-V-iii-vi-triads', 'IV–V–iii–vi (Viva La Vida)', [q('4', 'maj'), q('5', 'maj'), q('3', 'min'), q('6', 'min')]),
  songEntry('pop', 'ii-V-vi-vi', 'ii–V–vi–vi (Hymn for the Weekend)', [q('2', 'min'), q('5', 'maj'), q('6', 'min'), q('6', 'min')]),
  songEntry('pop', 'IV-V-vi', 'IV–V–vi (Hymn for the Weekend)', [q('4', 'maj'), q('5', 'maj'), q('6', 'min')]),
  songEntry('pop', 'Imaj7-vi', 'Imaj7–vi (Sparks)', [q('1', 'maj7'), q('6', 'min')]),
  songEntry('pop', 'IV-I-V-IV', 'IV–I–V–IV (Fix You)', [q('4', 'maj'), q('1', 'maj'), q('5', 'maj'), q('4', 'maj')]),
  songEntry('pop', 'ii-V-vi-I', 'ii–V–vi–I (Paradise)', [q('2', 'min'), q('5', 'maj'), q('6', 'min'), q('1', 'maj')]),
  songEntry('pop', 'ii-IV-I-V', 'ii–IV–I–V (Paradise)', [q('2', 'min'), q('4', 'maj'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('pop', 'IV-I-V-I', 'IV–I–V–I (My Universe)', [q('4', 'maj'), q('1', 'maj'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('pop', 'V-ii-ii-vi', 'V–ii–ii–vi (Clocks)', [q('5', 'maj'), q('2', 'min'), q('2', 'min'), q('6', 'min')]),
  songEntry('pop', 'IVmaj7-I-V', 'IVmaj7–I–V (Clocks)', [q('4', 'maj7'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('pop', 'iii-V-vi-I', 'iii–V–vi–I (Princess of China)', [q('3', 'min'), q('5', 'maj'), q('6', 'min'), q('1', 'maj')]),


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
  entry('minor', 'i-i-bVI-bVII', 'i–i–♭VI–♭VII', [min('1'), min('1'), s('b6'), s('b7')]),
  entry('minor', 'i-i-bVII-bVI', 'i–i–♭VII–♭VI', [min('1'), min('1'), s('b7'), s('b6')]),
  entry('minor', 'i-bIII-bVII-bVI', 'i–♭III–♭VII–♭VI', [min('1'), s('b3'), s('b7'), s('b6')]),
  entry('minor', 'i-iv-bVII-bIII', 'i–iv–♭VII–♭III', [min('1'), min('4'), s('b7'), s('b3')]),
  entry('minor', 'bVI-bVII-i-i', '♭VI–♭VII–i–i', [s('b6'), s('b7'), min('1'), min('1')]),
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
  // Song progressions (AC-2.6.1/18), credited in core/songbook.js.
  songEntry('minor', 'vi-iii', 'vi–iii (Street Spirit)', [q('6', 'min'), q('3', 'min')]),
  songEntry('minor', 'vi-V-IV-vi-IV', 'vi–V–IV–vi–IV (Reckoner)', [q('6', 'min'), q('5', 'maj'), q('4', 'maj'), q('6', 'min'), q('4', 'maj')]),
  songEntry('minor', 'vi-ii-I-iii-vi-IV-I-iii', 'vi–ii–I–iii–vi–IV–I–iii (Lucky)', [q('6', 'min'), q('2', 'min'), q('1', 'maj'), q('3', 'min'), q('6', 'min'), q('4', 'maj'), q('1', 'maj'), q('3', 'min')]),
  songEntry('minor', 'vi-bVI-V-#IV-IV', 'vi–♭VI–V–♯IV–IV (Just)', [q('6', 'min'), q('b6', 'maj'), q('5', 'maj'), q('#4', 'maj'), q('4', 'maj')]),
  songEntry('minor', 'vi-IV-I-I', 'vi–IV–I–I (I Need My Girl)', [q('6', 'min'), q('4', 'maj'), q('1', 'maj'), q('1', 'maj')]),
  songEntry('minor', 'vi-I-IV-I', 'vi–I–IV–I (Graceless)', [q('6', 'min'), q('1', 'maj'), q('4', 'maj'), q('1', 'maj')]),
  songEntry('minor', 'vi-I-iii-V', 'vi–I–iii–V (Terrible Love)', [q('6', 'min'), q('1', 'maj'), q('3', 'min'), q('5', 'maj')]),
  songEntry('minor', 'vi-I-ii-V', 'vi–I–ii–V (Conversation 16)', [q('6', 'min'), q('1', 'maj'), q('2', 'min'), q('5', 'maj')]),
  songEntry('minor', 'vi-I-IV-IV', 'vi–I–IV–IV (Conversation 16)', [q('6', 'min'), q('1', 'maj'), q('4', 'maj'), q('4', 'maj')]),
  songEntry('minor', 'vi-I-IV-ii', 'vi–I–IV–ii (Afraid of Everyone)', [q('6', 'min'), q('1', 'maj'), q('4', 'maj'), q('2', 'min')]),
  songEntry('minor', 'vi-iii-IV-I-ii-V', 'vi–iii–IV–I–ii–V (Jesus, Etc.)', [q('6', 'min'), q('3', 'min'), q('4', 'maj'), q('1', 'maj'), q('2', 'min'), q('5', 'maj')]),
  songEntry('minor', 'vi-V6-IV-III', 'vi–V6–IV–III (How to Fight Loneliness)', [q('6', 'min'), q('5', '6'), q('4', 'maj'), q('3', 'maj')]),
  songEntry('minor', 'vi7-Imaj7', 'vi7–Imaj7 (Impossible Germany)', [q('6', 'm7'), q('1', 'maj7')]),
  songEntry('minor', 'vi7-Imaj7-V-iii7', 'vi7–Imaj7–V–iii7 (Impossible Germany)', [q('6', 'm7'), q('1', 'maj7'), q('5', 'maj'), q('3', 'm7')]),
  songEntry('minor', 'vi-I', 'vi–I (Skinny Love)', [q('6', 'min'), q('1', 'maj')]),
  songEntry('minor', 'vi-I-vi-I-IV-V-IV-V', 'vi–I–vi–I–IV–V–IV–V (Hey, Ma)', [q('6', 'min'), q('1', 'maj'), q('6', 'min'), q('1', 'maj'), q('4', 'maj'), q('5', 'maj'), q('4', 'maj'), q('5', 'maj')]),
  songEntry('minor', 'vi-IV-vi-IV-vi-V-I', 'vi–IV–vi–IV–vi–V–I (Hey, Ma)', [q('6', 'min'), q('4', 'maj'), q('6', 'min'), q('4', 'maj'), q('6', 'min'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('minor', 'vi7-V-IV-IV', 'vi7–V–IV–IV (Blood Bank)', [q('6', 'm7'), q('5', 'maj'), q('4', 'maj'), q('4', 'maj')]),
  songEntry('minor', 'vi-IV-ii-V', 'vi–IV–ii–V (Hymn for the Weekend)', [q('6', 'min'), q('4', 'maj'), q('2', 'min'), q('5', 'maj')]),
  songEntry('minor', 'vi-vimMaj7-vi9-vi6-IVmaj7', 'vi–vimMaj7–vi9–vi6–IVmaj7 (Sparks)', [q('6', 'min'), q('6', 'mMaj7'), q('6', 'm9'), q('6', 'm6'), q('4', 'maj7')]),
  songEntry('minor', 'vi-IV-I-iii', 'vi–IV–I–iii (A Sky Full of Stars)', [q('6', 'min'), q('4', 'maj'), q('1', 'maj'), q('3', 'min')]),
  songEntry('minor', 'vi-IVmaj7-I-V6', 'vi–IVmaj7–I–V6 (Til Kingdom Come)', [q('6', 'min'), q('4', 'maj7'), q('1', 'maj'), q('5', '6')]),
  songEntry('minor', 'vi-IV', 'vi–IV (Hurricane)', [q('6', 'min'), q('4', 'maj')]),


  // --- Jazz (AC-2.6.1/11) ---
  entry('jazz', 'ii-V-I', 'ii–V–I (jazz)', sevenths('2', '5', '1')),
  entry('jazz', 'ii-V', 'ii–V', sevenths('2', '5')),
  entry('jazz', 'ii-V-I-I', 'ii–V–I–I', sevenths('2', '5', '1', '1')),
  entry('jazz', 'ii-V-I-VI7', 'ii–V–I–VI7 (turnaround)', [...sevenths('2', '5', '1'), ...doms('6')]),
  entry('jazz', 'I-vi-ii-V', 'I–vi–ii–V (turnaround)', sevenths('1', '6', '2', '5')),
  entry('jazz', 'iii-vi-ii-V', 'iii–vi–ii–V', sevenths('3', '6', '2', '5')),
  entry('jazz', 'I-VI7-ii-V', 'I–VI7–ii–V', [...sevenths('1'), ...doms('6'), ...sevenths('2', '5')]),
  entry('jazz', 'iio-V-V-i', 'ii°–V–V–i (minor)', [s('2', { quality: 'm7b5' }), ...doms('5', '5'), s('1', { quality: 'm7' })]),
  entry('jazz', 'ragtime', 'III7–VI7–II7–V7–I (ragtime)', [...doms('3', '6', '2', '5'), ...sevenths('1')]),
  entry('jazz', 'backdoor', 'iv–♭VII–♭VII–I (backdoor)', [s('4', { quality: 'm7' }), ...doms('b7', 'b7'), ...sevenths('1')]),
  entry('jazz', 'tritone', 'ii–♭II–♭II–I (tritone substitution)', [...sevenths('2'), ...doms('b2', 'b2'), ...sevenths('1')]),
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
  entry('blues', 'I7-IV7-IV7-V7', 'I7–IV7–IV7–V7', doms('1', '4', '4', '5')),

  // --- Modal and rock (AC-2.6.1/13) ---
  entry('modal', 'I-bVII-IV', 'I–♭VII–IV (Mixolydian)', seq('1', 'b7', '4')),
  entry('modal', 'I-bVII-IV-I', 'I–♭VII–IV–I', seq('1', 'b7', '4', '1')),
  entry('modal', 'I-I-bVII-IV', 'I–I–♭VII–IV', seq('1', '1', 'b7', '4')),
  entry('modal', 'I-bVII-IV-IV', 'I–♭VII–IV–IV', seq('1', 'b7', '4', '4')),
  entry('modal', 'I-bVII', 'I–♭VII (Mixolydian vamp)', seq('1', 'b7')),
  entry('modal', 'bVI-bVII-I-I', '♭VI–♭VII–I–I (Mario cadence)', seq('b6', 'b7', '1', '1')),
  entry('modal', 'I-bIII-IV-IV', 'I–♭III–IV–IV', seq('1', 'b3', '4', '4')),
  entry('modal', 'i-IV', 'i–IV (Dorian)', [min('1'), maj('4')]),
  entry('modal', 'i-bVII', 'i–♭VII', [min('1'), s('b7')]),
  entry('modal', 'I-II', 'I–II (Lydian)', [s('1'), maj('2')]),
  entry('modal', 'i-bII', 'i–♭II (Phrygian)', [min('1'), s('b2')]),
  // Song progressions (AC-2.6.1/18), credited in core/songbook.js.
  songEntry('modal', 'ii-V-vi-I-ii-bVII-vi-I', 'ii–V–vi–I–ii–♭VII–vi–I (Karma Police)', [q('2', 'min'), q('5', 'maj'), q('6', 'min'), q('1', 'maj'), q('2', 'min'), q('b7', 'maj'), q('6', 'min'), q('1', 'maj')]),
  songEntry('modal', 'i-V-bIII-IV-i-V-I', 'i–V–♭III–IV–i–V–I (Exit Music)', [q('1', 'min'), q('5', 'maj'), q('b3', 'maj'), q('4', 'maj'), q('1', 'min'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('modal', 'I-bIII-II-IV', 'I–♭III–II–IV (Just)', [q('1', 'maj'), q('b3', 'maj'), q('2', 'maj'), q('4', 'maj')]),
  songEntry('modal', 'ii-V-bvio7-vi', 'ii–V–♭vi°7–vi (How to Fight Loneliness)', [q('2', 'min'), q('5', 'maj'), q('b6', 'dim7'), q('6', 'min')]),
  songEntry('modal', 'I-I-bVII-V', 'I–I–♭VII–V (Heavy Metal Drummer)', [q('1', 'maj'), q('1', 'maj'), q('b7', 'maj'), q('5', 'maj')]),
  songEntry('modal', 'IV-iv-I-bVI-IV-I', 'IV–iv–I–♭VI–IV–I (Poor Places)', [q('4', 'maj'), q('4', 'min'), q('1', 'maj'), q('b6', 'maj'), q('4', 'maj'), q('1', 'maj')]),
  songEntry('modal', 'I-IV-bIII-I', 'I–IV–♭III–I (Handshake Drugs)', [q('1', 'maj'), q('4', 'maj'), q('b3', 'maj'), q('1', 'maj')]),
  songEntry('modal', 'I-iii-bVII-ii', 'I–iii–♭VII–ii (Lay, Lady, Lay)', [q('1', 'maj'), q('3', 'min'), q('b7', 'maj'), q('2', 'min')]),
  songEntry('modal', 'bVII-I', '♭VII–I (Tangled Up in Blue)', [q('b7', 'maj'), q('1', 'maj')]),


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
  // Song progressions (AC-2.6.1/18), credited in core/songbook.js.
  songEntry('classical', 'I-V-ii-ii-I-V-IV-IV', 'I–V–ii–ii–I–V–IV–IV (Knockin’ on Heaven’s Door)', [q('1', 'maj'), q('5', 'maj'), q('2', 'min'), q('2', 'min'), q('1', 'maj'), q('5', 'maj'), q('4', 'maj'), q('4', 'maj')]),
  songEntry('classical', 'I-ii-iii-IV-V', 'I–ii–iii–IV–V (Like a Rolling Stone)', [q('1', 'maj'), q('2', 'min'), q('3', 'min'), q('4', 'maj'), q('5', 'maj')]),
  songEntry('classical', 'IV-iii-ii-I-ii-IV-V', 'IV–iii–ii–I–ii–IV–V (Like a Rolling Stone)', [q('4', 'maj'), q('3', 'min'), q('2', 'min'), q('1', 'maj'), q('2', 'min'), q('4', 'maj'), q('5', 'maj')]),
  songEntry('classical', 'I-vi-IV-I-I-ii-IV-V', 'I–vi–IV–I–I–ii–IV–V (The Times They Are A-Changin’)', [q('1', 'maj'), q('6', 'min'), q('4', 'maj'), q('1', 'maj'), q('1', 'maj'), q('2', 'min'), q('4', 'maj'), q('5', 'maj')]),
  songEntry('classical', 'I-ii-V-I-V-IV-V-I-IV-V-I', 'I–ii–V–I–V–IV–V–I–IV–V–I (The Times They Are A-Changin’)', [q('1', 'maj'), q('2', 'min'), q('5', 'maj'), q('1', 'maj'), q('5', 'maj'), q('4', 'maj'), q('5', 'maj'), q('1', 'maj'), q('4', 'maj'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('classical', 'I-IV-V-I-I-IV-V', 'I–IV–V–I–I–IV–V (Blowin’ in the Wind)', [q('1', 'maj'), q('4', 'maj'), q('5', 'maj'), q('1', 'maj'), q('1', 'maj'), q('4', 'maj'), q('5', 'maj')]),
  songEntry('classical', 'IV-V-I-vi-IV-V-I', 'IV–V–I–vi–IV–V–I (Blowin’ in the Wind)', [q('4', 'maj'), q('5', 'maj'), q('1', 'maj'), q('6', 'min'), q('4', 'maj'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('classical', 'I-V-vi-IV-I-V', 'I–V–vi–IV–I–V (Don’t Think Twice, It’s All Right)', [q('1', 'maj'), q('5', 'maj'), q('6', 'min'), q('4', 'maj'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('classical', 'IV-I-ii-V7-I-I7', 'IV–I–ii–V7–I–I7 (Don’t Think Twice, It’s All Right)', [q('4', 'maj'), q('1', 'maj'), q('2', 'min'), q('5', '7'), q('1', 'maj'), q('1', '7')]),
  songEntry('classical', 'I-I7-IV-II7-I-V-I', 'I–I7–IV–II7–I–V–I (Don’t Think Twice, It’s All Right)', [q('1', 'maj'), q('1', '7'), q('4', 'maj'), q('2', '7'), q('1', 'maj'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('classical', 'V-vi-I-I', 'V–vi–I–I (Lay, Lady, Lay)', [q('5', 'maj'), q('6', 'min'), q('1', 'maj'), q('1', 'maj')]),
  songEntry('classical', 'iii-vi-IV-I-V', 'iii–vi–IV–I–V (Hurricane)', [q('3', 'min'), q('6', 'min'), q('4', 'maj'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('classical', 'IV-V-I-IV-I-IV-V', 'IV–V–I–IV–I–IV–V (Mr. Tambourine Man)', [q('4', 'maj'), q('5', 'maj'), q('1', 'maj'), q('4', 'maj'), q('1', 'maj'), q('4', 'maj'), q('5', 'maj')]),
  songEntry('classical', 'IV-V-I-IV-I-IV-ii-V', 'IV–V–I–IV–I–IV–ii–V (Mr. Tambourine Man)', [q('4', 'maj'), q('5', 'maj'), q('1', 'maj'), q('4', 'maj'), q('1', 'maj'), q('4', 'maj'), q('2', 'min'), q('5', 'maj')]),
  songEntry('classical', 'I7-IV7-I7', 'I7–IV7–I7 (Subterranean Homesick Blues)', [q('1', '7'), q('4', '7'), q('1', '7')]),
  songEntry('classical', 'V7-I7', 'V7–I7 (Subterranean Homesick Blues)', [q('5', '7'), q('1', '7')]),
  songEntry('classical', 'IV-V-I', 'IV–V–I (It Ain’t Me Babe)', [q('4', 'maj'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('classical', 'V-vi-I-IV-V', 'V–vi–I–IV–V (Tangled Up in Blue)', [q('5', 'maj'), q('6', 'min'), q('1', 'maj'), q('4', 'maj'), q('5', 'maj')]),
  songEntry('classical', 'I-iii-ii-IV', 'I–iii–ii–IV (Just Like a Woman)', [q('1', 'maj'), q('3', 'min'), q('2', 'min'), q('4', 'maj')]),
  songEntry('classical', 'I-iii-IV-I-IV-I-V-I', 'I–iii–IV–I–IV–I–V–I (Girl from the North Country)', [q('1', 'maj'), q('3', 'min'), q('4', 'maj'), q('1', 'maj'), q('4', 'maj'), q('1', 'maj'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('classical', 'IV-III-IV-III-vi-V-IV-III', 'IV–III–IV–III–vi–V–IV–III (One More Cup of Coffee)', [q('4', 'maj'), q('3', 'maj'), q('4', 'maj'), q('3', 'maj'), q('6', 'min'), q('5', 'maj'), q('4', 'maj'), q('3', 'maj')]),


  // --- Indie and alt (AC-2.6.1/16) ---
  entry('indie', 'vi-vi-V-I', 'vi–vi–V–I', seq('6', '6', '5', '1')),
  entry('indie', 'vi-IV-V-V', 'vi–IV–V–V', seq('6', '4', '5', '5')),
  entry('indie', 'vi-V-IV-V', 'vi–V–IV–V', seq('6', '5', '4', '5')),
  entry('indie', 'IV-vi-I-V', 'IV–vi–I–V', seq('4', '6', '1', '5')),
  entry('indie', 'I-V-vi-V', 'I–V–vi–V', seq('1', '5', '6', '5')),
  entry('indie', 'vi-iii-IV-I', 'vi–iii–IV–I', seq('6', '3', '4', '1')),
  entry('indie', 'I-iii-vi-V', 'I–iii–vi–V', seq('1', '3', '6', '5')),
  entry('indie', 'bVII-IV-IV-I', '♭VII–IV–IV–I (double plagal)', seq('b7', '4', '4', '1')),
  entry('indie', 'I-V-bVII-IV', 'I–V–♭VII–IV', seq('1', '5', 'b7', '4')),
  entry('indie', 'i-bVII-bVII-IV', 'i–♭VII–♭VII–IV (Dorian vamp)', [min('1'), s('b7'), s('b7'), maj('4')]),
  entry('indie', 'i-bIII-bVII-IV', 'i–♭III–♭VII–IV (Dorian)', [min('1'), s('b3'), s('b7'), maj('4')]),
  entry('indie', 'i-i-bIII-iv', 'i–i–♭III–iv', [min('1'), min('1'), s('b3'), min('4')]),
  entry('indie', 'Imaj7-V-iii-II', 'Imaj7–V–iii–II (Fast Car)', [s('1', { quality: 'maj7' }), s('5'), s('3'), maj('2')]),
  // Song progressions (AC-2.6.1/18), credited in core/songbook.js.
  songEntry('indie', 'I-vi7-ii-V-I-iv', 'I–vi7–ii–V–I–iv (No Surprises)', [q('1', 'maj'), q('6', 'm7'), q('2', 'min'), q('5', 'maj'), q('1', 'maj'), q('4', 'min')]),
  songEntry('indie', 'ii-V-triads', 'ii–V (No Surprises)', [q('2', 'min'), q('5', 'maj')]),
  songEntry('indie', 'IV-V-I-VII7', 'IV–V–I–VII7 (Karma Police)', [q('4', 'maj'), q('5', 'maj'), q('1', 'maj'), q('7', '7')]),
  songEntry('indie', 'iii-V-I-V-I-V-VI7', 'iii–V–I–V–I–V–VI7 (Karma Police)', [q('3', 'min'), q('5', 'maj'), q('1', 'maj'), q('5', 'maj'), q('1', 'maj'), q('5', 'maj'), q('6', '7')]),
  songEntry('indie', 'IV-I', 'IV–I (Let Down)', [q('4', 'maj'), q('1', 'maj')]),
  songEntry('indie', 'ii7-IV-I-I', 'ii7–IV–I–I (High and Dry)', [q('2', 'm7'), q('4', 'maj'), q('1', 'maj'), q('1', 'maj')]),
  songEntry('indie', 'I-vi-V-IV', 'I–vi–V–IV (Fake Plastic Trees)', [q('1', 'maj'), q('6', 'min'), q('5', 'maj'), q('4', 'maj')]),
  songEntry('indie', 'ii7-I', 'ii7–I (Fake Plastic Trees)', [q('2', 'm7'), q('1', 'maj')]),
  songEntry('indie', 'ii7-iii7-V-IVmaj7', 'ii7–iii7–V–IVmaj7 (Weird Fishes/Arpeggi)', [q('2', 'm7'), q('3', 'm7'), q('5', 'maj'), q('4', 'maj7')]),
  songEntry('indie', 'III-IVmaj7-V', 'III–IVmaj7–V (Everything in Its Right Place)', [q('3', 'maj'), q('4', 'maj7'), q('5', 'maj')]),
  songEntry('indie', 'I-iii-vi-vi', 'I–iii–vi–vi (Street Spirit)', [q('1', 'maj'), q('3', 'min'), q('6', 'min'), q('6', 'min')]),
  songEntry('indie', 'IV-vi-III', 'IV–vi–III (Reckoner)', [q('4', 'maj'), q('6', 'min'), q('3', 'maj')]),
  songEntry('indie', 'II-vi-II-vi-II-vi-IV-III7', 'II–vi–II–vi–II–vi–IV–III7 (Lucky)', [q('2', 'maj'), q('6', 'min'), q('2', 'maj'), q('6', 'min'), q('2', 'maj'), q('6', 'min'), q('4', 'maj'), q('3', '7')]),
  songEntry('indie', 'IV-vi-V', 'IV–vi–V (I Need My Girl)', [q('4', 'maj'), q('6', 'min'), q('5', 'maj')]),
  songEntry('indie', 'I-vi', 'I–vi (Bloodbuzz Ohio)', [q('1', 'maj'), q('6', 'min')]),
  songEntry('indie', 'IV-vi-vi-V', 'IV–vi–vi–V (About Today)', [q('4', 'maj'), q('6', 'min'), q('6', 'min'), q('5', 'maj')]),
  songEntry('indie', 'I-IVmaj7-I-iii', 'I–IVmaj7–I–iii (Runaway)', [q('1', 'maj'), q('4', 'maj7'), q('1', 'maj'), q('3', 'min')]),
  songEntry('indie', 'ii-V-I-vi', 'ii–V–I–vi (Pink Rabbits)', [q('2', 'min'), q('5', 'maj'), q('1', 'maj'), q('6', 'min')]),
  songEntry('indie', 'ii-V-I-IV', 'ii–V–I–IV (Pink Rabbits)', [q('2', 'min'), q('5', 'maj'), q('1', 'maj'), q('4', 'maj')]),
  songEntry('indie', 'V-vi7-I-ii7-I-vi7', 'V–vi7–I–ii7–I–vi7 (England)', [q('5', 'maj'), q('6', 'm7'), q('1', 'maj'), q('2', 'm7'), q('1', 'maj'), q('6', 'm7')]),
  songEntry('indie', 'I-IV-I-IV-I-IV-I-V', 'I–IV–I–IV–I–IV–I–V (Graceless)', [q('1', 'maj'), q('4', 'maj'), q('1', 'maj'), q('4', 'maj'), q('1', 'maj'), q('4', 'maj'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('indie', 'I-iii-vi-ii7-I-V', 'I–iii–vi–ii7–I–V (Guilty Party)', [q('1', 'maj'), q('3', 'min'), q('6', 'min'), q('2', 'm7'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('indie', 'I-vi-vimMaj7-IV-I-V', 'I–vi–vimMaj7–IV–I–V (Jesus, Etc.)', [q('1', 'maj'), q('6', 'min'), q('6', 'mMaj7'), q('4', 'maj'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('indie', 'I-I-vi-V-IV', 'I–I–vi–V–IV (Say You Miss Me)', [q('1', 'maj'), q('1', 'maj'), q('6', 'min'), q('5', 'maj'), q('4', 'maj')]),
  songEntry('indie', 'I-III-vi-IV', 'I–III–vi–IV (Say You Miss Me)', [q('1', 'maj'), q('3', 'maj'), q('6', 'min'), q('4', 'maj')]),
  songEntry('indie', 'I-V-vi-IV-II7-IV', 'I–V–vi–IV–II7–IV (Poor Places)', [q('1', 'maj'), q('5', 'maj'), q('6', 'min'), q('4', 'maj'), q('2', '7'), q('4', 'maj')]),
  songEntry('indie', 'I-V-vi-I7', 'I–V–vi–I7 (Poor Places)', [q('1', 'maj'), q('5', 'maj'), q('6', 'min'), q('1', '7')]),
  songEntry('indie', 'IV-ii7-I-II', 'IV–ii7–I–II (Poor Places)', [q('4', 'maj'), q('2', 'm7'), q('1', 'maj'), q('2', 'maj')]),
  songEntry('indie', 'I-IV-V-IV-I-V', 'I–IV–V–IV–I–V (Kamera)', [q('1', 'maj'), q('4', 'maj'), q('5', 'maj'), q('4', 'maj'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('indie', 'V-ii-V-I', 'V–ii–V–I (War on War)', [q('5', 'maj'), q('2', 'min'), q('5', 'maj'), q('1', 'maj')]),
  songEntry('indie', 'Imaj7-I-V-IV', 'Imaj7–I–V–IV (Via Chicago)', [q('1', 'maj7'), q('1', 'maj'), q('5', 'maj'), q('4', 'maj')]),
  songEntry('indie', 'I-IV-iii-IV', 'I–IV–iii–IV (Hate It Here)', [q('1', 'maj'), q('4', 'maj'), q('3', 'min'), q('4', 'maj')]),
  songEntry('indie', 'I-V-IV-ii-IV', 'I–V–IV–ii–IV (Box Full of Letters)', [q('1', 'maj'), q('5', 'maj'), q('4', 'maj'), q('2', 'min'), q('4', 'maj')]),
  songEntry('indie', 'I-I-IV', 'I–I–IV (Skinny Love)', [q('1', 'maj'), q('1', 'maj'), q('4', 'maj')]),
  songEntry('indie', 'I-vi-V-vi-IV', 'I–vi–V–vi–IV (Holocene)', [q('1', 'maj'), q('6', 'min'), q('5', 'maj'), q('6', 'min'), q('4', 'maj')]),
  songEntry('indie', 'I-IV-vi-V-I-iii-IV-V', 'I–IV–vi–V–I–iii–IV–V (Hey, Ma)', [q('1', 'maj'), q('4', 'maj'), q('6', 'min'), q('5', 'maj'), q('1', 'maj'), q('3', 'min'), q('4', 'maj'), q('5', 'maj')]),
  songEntry('indie', 'I-V-vi7-IV', 'I–V–vi7–IV (Blood Bank)', [q('1', 'maj'), q('5', 'maj'), q('6', 'm7'), q('4', 'maj')]),
  songEntry('indie', 'IV-I-V-V-vi-IV-I-I', 'IV–I–V–V–vi–IV–I–I (8 (circle))', [q('4', 'maj'), q('1', 'maj'), q('5', 'maj'), q('5', 'maj'), q('6', 'min'), q('4', 'maj'), q('1', 'maj'), q('1', 'maj')]),
  songEntry('indie', 'I-iii-IV-I', 'I–iii–IV–I (For Emma)', [q('1', 'maj'), q('3', 'min'), q('4', 'maj'), q('1', 'maj')]),


  // --- Sus and open chords (AC-2.6.1/17) ---
  entry('sus', 'I-Isus4-I-Isus2', 'I–Isus4–I–Isus2 (open-string embellishment)', [s('1'), sus4('1'), s('1'), sus2('1')]),
  entry('sus', 'Isus2-Isus2-Isus4-I', 'Isus2–Isus2–Isus4–I', [sus2('1'), sus2('1'), sus4('1'), s('1')]),
  entry('sus', 'I-Isus4-IV-V', 'I–Isus4–IV–V', [s('1'), sus4('1'), s('4'), s('5')]),
  entry('sus', 'Vsus4-V-I-I', 'Vsus4–V–I–I (delayed dominant)', [sus4('5'), s('5'), s('1'), s('1')]),
  entry('sus', 'V7sus4-V7-I-I', 'V7sus4–V7–I–I', [s('5', { quality: '7sus4' }), s('5', { quality: '7' }), s('1'), s('1')]),
  entry('sus', 'ii7-ii7-V7sus4-Imaj7', 'ii7–ii7–V7sus4–Imaj7 (suspended cadence)', [
    s('2', { quality: 'm7' }),
    s('2', { quality: 'm7' }),
    s('5', { quality: '7sus4' }),
    s('1', { quality: 'maj7' }),
  ]),
  entry('sus', 'I-IVsus2-I-V', 'I–IVsus2–I–V (Free Fallin’)', [s('1'), sus2('4'), s('1'), s('5')]),
  entry('sus', 'Isus2-IVsus2-IVsus2-Vsus4', 'Isus2–IVsus2–IVsus2–Vsus4 (open sus loop)', [sus2('1'), sus2('4'), sus2('4'), sus4('5')]),
  entry('sus', 'I-V-vi-IVsus2', 'I–V–vi–IVsus2 (the pop loop, suspended)', [s('1'), s('5'), s('6'), sus2('4')]),
  entry('sus', 'vi-IV-Isus2-Vsus4', 'vi–IV–Isus2–Vsus4', [s('6'), s('4'), sus2('1'), sus4('5')]),
  entry('sus', 'I-bVIIsus2-bVIIsus2-IVsus2', 'I–♭VIIsus2–♭VIIsus2–IVsus2 (Mixolydian sus)', [s('1'), sus2('b7'), sus2('b7'), sus2('4')]),
  entry('sus', 'i-bVIIsus2-bVIIsus2-bVIsus2', 'i–♭VIIsus2–♭VIIsus2–♭VIsus2 (minor sus vamp)', [min('1'), sus2('b7'), sus2('b7'), sus2('b6')]),
  entry('sus', 'IVadd9-I-I-V', 'IVadd9–I–I–V (open folk trio)', [add9('4'), s('1'), s('1'), s('5')]),
  entry('sus', 'Iadd9-IVadd9-IVadd9-V', 'Iadd9–IVadd9–IVadd9–V', [add9('1'), add9('4'), add9('4'), s('5')]),
  entry('sus', 'I-IVadd9-vi7-V', 'I–IVadd9–vi7–V', [s('1'), add9('4'), s('6', { quality: 'm7' }), s('5')]),
  // Song progressions (AC-2.6.1/18), credited in core/songbook.js.
  songEntry('sus', 'ii-IV-I-Vsus4', 'ii–IV–I–Vsus4 (Light Years)', [q('2', 'min'), q('4', 'maj'), q('1', 'maj'), q('5', 'sus4')]),
  songEntry('sus', 'IIsus4-V-Iadd9', 'IIsus4–V–Iadd9 (re: Stacks)', [q('2', 'sus4'), q('5', 'maj'), q('1', 'add9')]),
  songEntry('sus', 'IIsus4-iii7-I', 'IIsus4–iii7–I (re: Stacks)', [q('2', 'sus4'), q('3', 'm7'), q('1', 'maj')]),
  songEntry('sus', 'vi7-IV-I-Isus2', 'vi7–IV–I–Isus2 (The Scientist)', [q('6', 'm7'), q('4', 'maj'), q('1', 'maj'), q('1', 'sus2')]),
  songEntry('sus', 'IVadd9-I-V', 'IVadd9–I–V (The Scientist)', [q('4', 'add9'), q('1', 'maj'), q('5', 'maj')]),
  songEntry('sus', 'IVsus2-I', 'IVsus2–I (Every Teardrop Is a Waterfall)', [q('4', 'sus2'), q('1', 'maj')]),
  songEntry('sus', 'IVsus2-I-vi-V', 'IVsus2–I–vi–V (Every Teardrop Is a Waterfall)', [q('4', 'sus2'), q('1', 'maj'), q('6', 'min'), q('5', 'maj')]),
  songEntry('sus', 'I-V-I7-IV-iv-I-II9-V7sus4', 'I–V–I7–IV–iv–I–II9–V7sus4 (Make You Feel My Love)', [q('1', 'maj'), q('5', 'maj'), q('1', '7'), q('4', 'maj'), q('4', 'min'), q('1', 'maj'), q('2', '9'), q('5', '7sus4')]),
];

/*
 * A fill pattern is a sequence of STEPS (AC-2.6.6/9), each one of:
 *   { tone, octave? }            a chord tone at an octave (Root, 3rd, …, R↑)
 *   { drone: 'tonic'|'root', octave }   the Key's tonic or the chord's root, fixed
 *   { drone: 'second'|'fifth'|'seventh', octave } the scale's 2nd, 5th or 7th above the Key, fixed
 *   { scale: kind, step, octave? }      the n-th step of a scale rooted on the chord
 *   { neighbour: 1|-1, of, octave? }    the Pattern's scale note next above or below the chord tone `of`
 *   { interval, octave? }               a fixed interval above the chord's root, whatever the Key
 *   { chromatic: 1|-1, of, octave? }    the semitone above or below the chord tone `of`, whatever the Key
 *   { approach: 1|-1, target }          the semitone above or below the next chord's bass, `target`
 *                                       semitones above the tonic — written by the deal, never by an entry
 * Every catalogue entry builds its sequence from the progression's roles and,
 * for a walk, the scale it names. Nothing here is stored: the deal is derived.
 */
const T = (tone, octave = 0) => (octave ? { tone, octave } : { tone });
const DRONE_UP = { drone: 'tonic', octave: 1 };
const DRONE_DOWN = { drone: 'tonic', octave: -1 };
const ROOT_UP = { drone: 'root', octave: 1 };
const tones = (roles) => roles.map((r) => T(r));
/*
 * The role at a position of the stack, bass first — a fill's shape is
 * positional (AC-2.11.2/3). The shapes are written for three members; over
 * two — power chords, or every chord struck to root and 5th — the 3rd's
 * position falls to the bass and the 5th's is the other member (AC-2.16.4/1).
 */
const position = (roles, i) => (roles.length >= 3 ? roles[i] : roles[i === 2 ? 1 : 0]);
/** The roles at the given positions of the stack. */
const at = (roles, positions) => positions.map((i) => position(roles, i));
const interleave = (roles, between) => roles.flatMap((r) => [T(r), between]);
/** A scale drone (AC-2.6.6/14): a degree of the Pattern's scale above the Key, whatever the chord. */
const D = (drone, octave = 0) => (octave ? { drone, octave } : { drone });
/** Rising chord tones interleaved with drones taken in turn, until both line up again. */
const alternate = (roles, drones) => {
  const n = (roles.length * drones.length) / gcd(roles.length, drones.length);
  return Array.from({ length: n }, (_, i) => [T(roles[i % roles.length]), drones[i % drones.length]]).flat();
};
const upDown = (roles) => (roles.length < 3 ? roles : [...roles, ...roles.slice(1, -1).reverse()]);
/**
 * A fingerpicking shape (AC-2.6.6/13): `[tone, octave]` pairs, the thumb's bass
 * at the Slot's octave and the fingers' treble an octave up. Written as the
 * roles of a chord over its root; under a bass they are the same positions of
 * the stack (AC-2.11.2/3).
 */
const POSITION = { 1: 0, 3: 1, 5: 2 };
const picking = (shape) => ({ roles }) => shape.map(([t, o]) => T(position(roles, POSITION[t]), o));

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
/** Rising chord tones in runs of `run`, each run opened by the pedal (AC-2.6.6/15). */
const pedalEvery = (run, pedal) => ({ roles }) => {
  const n = (roles.length * run) / gcd(roles.length, run);
  return Array.from({ length: n / run }, (_, i) => [pedal, ...Array.from({ length: run }, (__, j) => T(roles[(i * run + j) % roles.length]))]).flat();
};
/** The Pattern's scale walked from the chord's root, the pedal after every step (AC-2.6.6/15). */
const walkOverPedal = (pedal, down = false) => (ctx) => {
  const n = ctx.walk('pattern').length;
  const steps = Array.from({ length: n }, (_, i) => ({ scale: 'pattern', step: down ? n + 1 - i : i + 1 }));
  return steps.flatMap((step) => [step, pedal]);
};
/** The scale note next above (+1) or below (−1) a chord tone, from the Key (AC-2.6.6/18). */
const N = (of, neighbour) => ({ neighbour, of });
/** A fixed interval above the chord's root (AC-2.6.6/19). */
const above = (interval) => ({ interval });
/** The semitone above (+1) or below (−1) a chord tone, whatever the Key (AC-2.6.6/20). */
const C = (of, chromatic) => ({ chromatic, of });
/** Each rising chord tone reached from the steps `before` it builds (AC-2.6.6/20). */
const approached = (roles, before) => roles.flatMap((r) => [...before(r), T(r)]);
/** Fixed intervals above the chord's root, each at an octave (AC-2.6.6/21, /22). */
const intervals = (pairs) => pairs.map(([interval, octave]) => (octave ? { interval, octave } : { interval }));
/** Each role of `roles` dealt `times` times before the next (AC-2.6.6/16). */
const repeatEach = (roles, times) => roles.flatMap((r) => Array(times).fill(T(r)));
const walkUpDown = (kind) => (ctx) => {
  const n = ctx.walk(kind).length;
  const up = Array.from({ length: n }, (_, i) => ({ scale: kind, step: i + 1 }));
  return [...up, ...up.slice(1, -1).reverse()];
};

/**
 * The arpeggios a Pattern can follow (AC-2.6.6/1), in seven groups. Absent on
 * the Pattern means None. `steps(ctx)` takes `{ roles, walk(kind) }`. An entry
 * carrying `approach` has the deal turn the last sounding Slot before each
 * chord change into the semitone beside the next chord's bass (AC-2.6.6/23).
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
  { id: 'alberti', label: 'Alberti', group: 'Chord tones', steps: ({ roles }) => tones(at(roles, [0, 2, 1, 2])) },
  { id: 'root', label: 'Root only', group: 'Chord tones', steps: ({ roles }) => tones(at(roles, [0])) },
  { id: 'root-fifth', label: 'Root and fifth', group: 'Chord tones', steps: ({ roles }) => tones(at(roles, [0, 2])) },
  { id: 'up-octave', label: 'Up to the octave', group: 'Chord tones', steps: ({ roles }) => [...tones(roles), T(roles[0], 1)] },
  { id: 'down-octave', label: 'Down from the octave', group: 'Chord tones', steps: ({ roles }) => [T(roles[0], 1), ...tones([...roles].reverse())] },
  {
    id: 'up-over-down',
    label: 'Up over and down',
    group: 'Chord tones',
    steps: ({ roles }) => [...tones(roles), T(roles[0], 1), ...tones([...roles].reverse().slice(0, -1))],
  },
  { id: 'travis', label: 'Travis picking', group: 'Fingerpicking', steps: picking([[1], [3, 1], [5], [1, 1]]) },
  { id: 'travis-down', label: 'Travis picking, treble descending', group: 'Fingerpicking', steps: picking([[1], [1, 1], [5], [3, 1]]) },
  { id: 'bass-treble-pair', label: 'Alternating bass, treble pair', group: 'Fingerpicking', steps: picking([[1], [3, 1], [5, 1], [5], [3, 1], [5, 1]]) },
  { id: 'backward-roll', label: 'Backward roll', group: 'Fingerpicking', steps: picking([[1], [1, 1], [5], [3]]) },
  { id: 'inside-out', label: 'Inside out', group: 'Fingerpicking', steps: picking([[1], [3], [1, 1], [5]]) },
  { id: 'outside-in', label: 'Outside in', group: 'Fingerpicking', steps: picking([[1], [1, 1], [3], [5]]) },
  { id: 'sweep', label: 'Six-string sweep', group: 'Fingerpicking', steps: picking([[1], [5], [1, 1], [3, 1], [5, 1], [1, 2]]) },
  { id: 'sweep-back', label: 'Six-string sweep, up and back', group: 'Fingerpicking', steps: picking([[1], [5], [1, 1], [3, 1], [5, 1], [3, 1], [1, 1], [5]]) },
  { id: 'drone-above', label: 'Drone above (tonic)', group: 'Drones', steps: ({ roles }) => interleave(roles, DRONE_UP) },
  { id: 'drone-below', label: 'Drone below (tonic)', group: 'Drones', steps: ({ roles }) => interleave(roles, DRONE_DOWN) },
  { id: 'root-drone', label: 'Chord root drone', group: 'Drones', steps: ({ roles }) => interleave(roles, ROOT_UP) },
  { id: 'scale-root-drone', label: 'Scale root drone', group: 'Drones', steps: ({ roles }) => interleave(roles, D('tonic')) },
  { id: 'scale-root-octave', label: 'Scale root and octave', group: 'Drones', steps: ({ roles }) => alternate(roles, [D('tonic'), D('tonic', 1)]) },
  { id: 'scale-fifth-drone', label: 'Scale 5th drone', group: 'Drones', steps: ({ roles }) => interleave(roles, D('fifth')) },
  { id: 'scale-fifth-above', label: 'Scale 5th above', group: 'Drones', steps: ({ roles }) => interleave(roles, D('fifth', 1)) },
  { id: 'scale-fifth-below', label: 'Scale 5th below', group: 'Drones', steps: ({ roles }) => interleave(roles, D('fifth', -1)) },
  { id: 'scale-root-fifth', label: 'Scale root and 5th', group: 'Drones', steps: ({ roles }) => alternate(roles, [D('tonic'), D('fifth')]) },
  { id: 'tanpura', label: 'Tanpura (5th and octave)', group: 'Drones', steps: ({ roles }) => alternate(roles, [D('fifth'), D('tonic', 1)]) },
  { id: 'scale-seventh-drone', label: 'Scale 7th drone', group: 'Drones', steps: ({ roles }) => interleave(roles, D('seventh')) },
  { id: 'scale-seventh-above', label: 'Scale 7th above', group: 'Drones', steps: ({ roles }) => interleave(roles, D('seventh', 1)) },
  { id: 'scale-seventh-below', label: 'Scale 7th below', group: 'Drones', steps: ({ roles }) => interleave(roles, D('seventh', -1)) },
  { id: 'pedal-scale-up', label: 'Scale up over a tonic pedal', group: 'Pedal points', steps: walkOverPedal(D('tonic', -1)) },
  { id: 'pedal-scale-down', label: 'Scale down over a tonic pedal', group: 'Pedal points', steps: walkOverPedal(D('tonic', -1), true) },
  { id: 'pedal-scale-up-fifth', label: 'Scale up over a 5th pedal', group: 'Pedal points', steps: walkOverPedal(D('fifth', -1)) },
  { id: 'pedal-every-third', label: 'Pedal every third note', group: 'Pedal points', steps: pedalEvery(2, D('tonic', -1)) },
  { id: 'pedal-every-fourth', label: 'Pedal every fourth note', group: 'Pedal points', steps: pedalEvery(3, D('tonic', -1)) },
  { id: 'pedal-descending', label: 'Descending over a tonic pedal', group: 'Pedal points', steps: ({ roles }) => interleave([...roles].reverse(), D('tonic', -1)) },
  { id: 'pedal-neighbours', label: 'Neighbour notes around the tonic', group: 'Pedal points', steps: () => [D('tonic'), D('second'), D('tonic'), D('seventh', -1)] },
  { id: 'tanpura-cycle', label: 'Tanpura cycle (drone only)', group: 'Pedal points', steps: () => [D('fifth', -1), D('tonic'), D('tonic'), D('tonic', -1)] },
  ...WALK_SCALES.map((w) => ({ id: `scale-up-${w.id}`, label: `Scale up, ${w.label}`, group: 'Scale walks', steps: walkUp(w.id) })),
  ...WALK_SCALES.map((w) => ({
    id: `scale-up-down-${w.id}`,
    label: `Scale up and down, ${w.label}`,
    group: 'Scale walks',
    steps: walkUpDown(w.id),
  })),
  { id: 'doubled-up', label: 'Doubled up', group: 'Repeated notes', steps: ({ roles }) => repeatEach(roles, 2) },
  { id: 'doubled-down', label: 'Doubled down', group: 'Repeated notes', steps: ({ roles }) => repeatEach([...roles].reverse(), 2) },
  { id: 'doubled-up-back', label: 'Doubled up and back', group: 'Repeated notes', steps: ({ roles }) => repeatEach(upDown(roles), 2) },
  { id: 'tripled', label: 'Tripled', group: 'Repeated notes', steps: ({ roles }) => repeatEach(roles, 3) },
  { id: 'four-each', label: 'Four of each, up and back', group: 'Repeated notes', steps: ({ roles }) => repeatEach(upDown(roles), 4) },
  { id: 'tresillo', label: 'Tresillo groups', group: 'Repeated notes', steps: ({ roles }) => tones(at(roles, [0, 0, 0, 1, 1, 1, 2, 2])) },
  { id: 'octave-pump', label: 'Octave pump', group: 'Repeated notes', steps: ({ roles }) => [T(roles[0]), T(roles[0], 1)] },
  { id: 'octave-pairs', label: 'Octave pairs', group: 'Repeated notes', steps: ({ roles }) => [T(roles[0]), T(roles[0]), T(roles[0], 1), T(roles[0], 1)] },
  { id: 'three-and-move', label: 'Three and a move', group: 'Repeated notes', steps: ({ roles }) => tones(at(roles, [0, 0, 0, 2])) },
  { id: 'seven-and-move', label: 'Seven and a move', group: 'Repeated notes', steps: ({ roles }) => tones(at(roles, [0, 0, 0, 0, 0, 0, 0, 2])) },
  { id: 'root-fifth-doubled', label: 'Root and 5th, doubled', group: 'Repeated notes', steps: ({ roles }) => tones(at(roles, [0, 0, 2, 2])) },
  { id: 'pedal-root-riff', label: 'Pedal root riff', group: 'Repeated notes', steps: ({ roles }) => tones(at(roles, [0, 0, 1, 0, 0, 2])) },
  { id: 'root-pedal-below', label: 'Chord root pedal below', group: 'Repeated notes', steps: ({ roles }) => roles.flatMap((r) => [T(roles[0], -1), T(r)]) },
  { id: 'fifth-on-top', label: 'Repeated 5th on top', group: 'Repeated notes', steps: ({ roles }) => interleave(roles, T(roles[2], 1)) },
  { id: 'reciting-fifth', label: 'Reciting on the 5th', group: 'Repeated notes', steps: ({ roles }) => tones(at(roles, [2, 2, 2, 1])) },
  { id: 'reciting-third', label: 'Reciting on the 3rd', group: 'Repeated notes', steps: ({ roles }) => tones(at(roles, [1, 1, 1, 0])) },
  { id: 'upper-neighbour-fifth', label: 'Upper neighbour on the 5th', group: 'Repeated notes', steps: ({ roles }) => [T(roles[2]), T(roles[2]), N(roles[2], 1), T(roles[2])] },
  { id: 'lower-neighbour-root', label: 'Lower neighbour on the root', group: 'Repeated notes', steps: ({ roles }) => [T(roles[0]), T(roles[0]), N(roles[0], -1), T(roles[0])] },
  { id: 'upper-neighbour-third', label: 'Upper neighbour on the 3rd', group: 'Repeated notes', steps: ({ roles }) => [T(roles[1]), T(roles[1]), N(roles[1], 1), T(roles[1])] },
  { id: 'neighbours-root', label: 'Neighbours around the root', group: 'Repeated notes', steps: ({ roles }) => [T(roles[0]), N(roles[0], 1), T(roles[0]), N(roles[0], -1)] },
  {
    id: 'boogie',
    label: 'Boogie',
    group: 'Repeated notes',
    steps: ({ roles }) => [...tones(at(roles, [0, 1, 2])), above('6'), above('b7'), above('6'), ...tones(at(roles, [2, 1]))],
  },
  { id: 'chromatic-approach-below', label: 'Chromatic approach from below', group: 'Chromatic', steps: ({ roles }) => approached(roles, (r) => [C(r, -1)]) },
  { id: 'chromatic-approach-above', label: 'Chromatic approach from above', group: 'Chromatic', steps: ({ roles }) => approached(roles, (r) => [C(r, 1)]) },
  { id: 'enclosure', label: 'Enclosure', group: 'Chromatic', steps: ({ roles }) => approached(roles, (r) => [N(r, 1), C(r, -1)]) },
  { id: 'chromatic-enclosure', label: 'Chromatic enclosure', group: 'Chromatic', steps: ({ roles }) => approached(roles, (r) => [C(r, 1), C(r, -1)]) },
  {
    id: 'chromatic-run-up',
    label: 'Chromatic run up to the 5th',
    group: 'Chromatic',
    steps: () => intervals([['1'], ['b2'], ['2'], ['b3'], ['3'], ['4'], ['#4'], ['5']]),
  },
  {
    id: 'chromatic-run-down',
    label: 'Chromatic run down from the octave',
    group: 'Chromatic',
    steps: () => intervals([['1', 1], ['7'], ['b7'], ['6'], ['b6'], ['5']]),
  },
  { id: 'line-cliche', label: 'Line cliché', group: 'Chromatic', steps: () => intervals([['1'], ['7', -1], ['b7', -1], ['6', -1]]) },
  { id: 'walk-next-below', label: 'Walking into the next chord from below', group: 'Chromatic', approach: -1, steps: ({ roles }) => tones(roles) },
  { id: 'walk-next-above', label: 'Walking into the next chord from above', group: 'Chromatic', approach: 1, steps: ({ roles }) => tones(roles) },
];

export const CHANGES = ['pass', 'measure'];
/* The arpeggio a freshly chosen progression takes: the plainest reading of a
   chord, so the chords are audible the moment they are chosen (AC-2.6.1/7). */
export const DEFAULT_ARPEGGIO = 'up';
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
 * a MIDI export spans (AC-2.6.10/1). One without a progression in force — and a
 * Percussive Pattern's progression, kept unused for when it turns Melodic again,
 * is not in force (AC-2.1.4, AC-2.1.8/1).
 */
export function cyclePasses(pattern) {
  if (pattern?.soundMode !== 'melodic' || !hasHarmony(pattern)) return 1;
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
  const midiNote = BASE_MIDI + keySemitones(key) + memberFor(chord, pitch.tone).offset + 12 * octaveOffset;
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

/** The note name of the member in the bass, spelled from the chord's root letter as the member it is. */
function bassName(chord, key) {
  const bass = bassOf(chord);
  const [, digits] = splitDegree(chord.degree);
  const rootLetter = letterAbove(key[0], Number(digits) - 1);
  const midiNote = BASE_MIDI + keySemitones(key) + bass.offset;
  const named = spellFromLetter(midiNote, letterAbove(rootLetter, LETTER_STEPS[bass.interval] ?? 0), `The bass of ${chord.degree} ${chord.quality}`);
  return `${named.letter}${named.accidental}`;
}

/**
 * The chord's name in the Key: root letter and accidental, then the quality's
 * suffix (AC-2.6.7/1) — and, over a member other than its root, the slash form
 * naming the bass: G/B (AC-2.11.1/2, /3).
 */
export function chordName(chord, key) {
  const root = noteName({ degree: chord.degree, octaveOffset: 0 }, key);
  const name = `${root.letter}${root.accidental}${quality(chord.quality).suffix}${omissionMark(chord)}`;
  return inversionOf(chord) === 0 ? name : `${name}/${bassName(chord, key)}`;
}

/** What the name says is struck from the chord — (no3), (no3,5) — or nothing (AC-2.16.1/2). */
function omissionMark(chord) {
  const omit = omitOf(chord);
  if (!omit.length) return '';
  const struck = quality(chord.quality).intervals.filter((i) => omit.includes(roleOf(i)));
  return `(no${struck.map(memberLabel).join(',')})`;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** The chord as a roman numeral: case from the third, accidental from the degree. */
export function chordNumeral(chord) {
  const [accidental, digits] = splitDegree(chord.degree);
  const q = quality(chord.quality);
  let numeral = ROMAN[(Number(digits) - 1) % 7];
  if (q.intervals[1] === 3) numeral = numeral.toLowerCase();
  const glyph = accidental === 'b' ? '♭' : accidental === '#' ? '♯' : '';
  const name = `${glyph}${numeral}${q.numeral}${omissionMark(chord)}`;
  // Over a member other than the root, the member in the bass: V/3 (AC-2.11.1/3).
  return inversionOf(chord) === 0 ? name : `${name}/${toneLabel(bassOf(chord).tone)}`;
}

/* --- mutations (every one returns a new Pattern) -------------------------- */


/**
 * Give the Pattern a catalogue progression, spelled under its Key and scale
 * (AC-2.6.1/2), keeping the arpeggio in force and every stored Pitch
 * (AC-2.6.1/7).
 */
export function setProgression(pattern, progressionId) {
  // Voiced Closest as it is spelled (AC-2.11.3/7).
  const chords = voiceChords(spellProgression(progressionId, pattern.scale ?? DEFAULT_SCALE), DEFAULT_VOICING);
  // Every stored Pitch is left exactly as it was (AC-2.6.1/7): what makes the
  // progression audible is the arpeggio, not an edit to the Composer's notes.
  // An arpeggio already chosen is kept, so progressions can be auditioned
  // under one fill.
  const harmony = { change: pattern.harmony?.change ?? DEFAULT_CHANGE, chords };
  if (pattern.harmony?.arpeggio) harmony.arpeggio = pattern.harmony.arpeggio;
  return { ...clone(pattern), harmony };
}

/**
 * Start a progression from scratch (AC-2.17.1): one chord, the tonic of the Key
 * spelled from the scale exactly as a catalogue pick spells its steps
 * (AC-2.17.1/2), over its root. The change setting and the arpeggio are carried
 * as `setProgression` carries them (AC-2.17.1/3), and every stored Pitch is left
 * as it was (AC-2.17.1/4). The chord editor builds the rest.
 */
export function startProgression(pattern) {
  const chords = voiceChords([diatonicChord(pattern.scale ?? DEFAULT_SCALE, '1')], DEFAULT_VOICING);
  const harmony = { change: pattern.harmony?.change ?? DEFAULT_CHANGE, chords };
  if (pattern.harmony?.arpeggio) harmony.arpeggio = pattern.harmony.arpeggio;
  return { ...clone(pattern), harmony };
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
        const semis = memberFor(first, slot.pitch.tone).offset;
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

/**
 * The same chord with a new quality or root, its bass member kept where the new
 * chord still has one and returned to the root otherwise (AC-2.11.1/4). A root
 * change keeps the quality, so the member is always there; a quality change
 * looks the role up again.
 */
function rechord(chord, changes) {
  const bass = bassOf(chord).tone;
  const next = { ...chord, ...changes };
  delete next.inversion;
  // The omissions the new chord can carry — every one it has a member for,
  // unless together they would leave it fewer than two members (AC-2.16.1/4).
  delete next.omit;
  const roles = quality(next.quality).intervals.map(roleOf);
  const kept = omitOf(chord).filter((tone) => roles.includes(tone));
  if (kept.length && roles.length - kept.length >= MIN_MEMBERS) next.omit = kept;
  const k = intervalsOf(next).findIndex((i) => roleOf(i) === bass);
  if (k > 0) next.inversion = k;
  return next;
}

export function setChordQuality(pattern, index, qualityId) {
  if (!isValidQuality(qualityId)) throw new Error(`Unknown chord quality: ${qualityId}`);
  return withHarmony(pattern, (h) => {
    h.chords[index] = rechord(h.chords[index], { quality: qualityId });
  });
}

/**
 * The Omit toggles a chord offers (AC-2.16.1/1): one per member of its quality
 * but the root, labelled as a chart names the member, pressed where the member
 * is struck, and disabled where striking it would leave fewer than two members.
 *
 * @returns {Array<{tone: number, label: string, omitted: boolean, disabled: boolean}>}
 */
export function omitOptions(chord) {
  const omit = omitOf(chord);
  const remaining = memberCount(chord);
  return quality(chord.quality)
    .intervals.filter((i) => i !== 0)
    .map((i) => {
      const tone = roleOf(i);
      const omitted = omit.includes(tone);
      return { tone, label: memberLabel(i), omitted, disabled: !omitted && remaining <= MIN_MEMBERS };
    });
}

/**
 * Strike a member from a chord, or restore it (AC-2.16.1/2). The chord keeps
 * its root and at least one other member (AC-2.16.1/3); the bass stays on its
 * member while the member remains and returns to the root when the member is
 * struck (AC-2.16.1/5).
 */
export function setChordOmit(pattern, index, tone, omitted) {
  return withHarmony(pattern, (h) => {
    const chord = h.chords[index];
    if (!chord) throw new Error(`No chord ${index}`);
    const roles = quality(chord.quality).intervals.map(roleOf);
    if (tone === 1 || !roles.includes(tone)) throw new Error(`A ${chord.quality} chord has no member ${tone} to leave out`);
    const next = omitted ? [...new Set([...omitOf(chord), tone])].sort((a, b) => a - b) : omitOf(chord).filter((t) => t !== tone);
    if (roles.length - next.length < MIN_MEMBERS) throw new Error(`A chord keeps at least ${MIN_MEMBERS} members`);
    const bass = bassOf(chord).tone;
    delete chord.inversion;
    delete chord.omit;
    if (next.length) chord.omit = next;
    const k = intervalsOf(chord).findIndex((i) => roleOf(i) === bass);
    if (k > 0) chord.inversion = k;
  });
}

export function setChordDegree(pattern, index, degree) {
  splitDegree(degree); // throws on a malformed token
  return withHarmony(pattern, (h) => {
    h.chords[index] = rechord(h.chords[index], { degree });
  });
}

/** Put the chord's `inversion`-th member in its bass, 0 the root (AC-2.11.1/2). */
export function setChordBass(pattern, index, inversion) {
  return withHarmony(pattern, (h) => {
    const chord = h.chords[index];
    if (!chord) throw new Error(`No chord ${index}`);
    if (!Number.isInteger(inversion) || inversion < 0 || inversion >= memberCount(chord)) {
      throw new Error(`${chordName(chord, pattern.key ?? 'C')} has ${memberCount(chord)} members; no member ${inversion}`);
    }
    if (inversion === 0) delete chord.inversion;
    else chord.inversion = inversion;
  });
}

/** Give every chord the bass the shape chooses (AC-2.11.3). */
export function setVoicing(pattern, id) {
  if (!isValidVoicing(id)) throw new Error(`Unknown voicing: ${id}`);
  return withHarmony(pattern, (h) => {
    h.chords = voiceChords(h.chords, id);
  });
}

/** A chord is added as a copy of the last, ready to be edited (AC-2.6.2/4), with no fill of its own (AC-2.15.1/6). */
export function addChord(pattern) {
  return withHarmony(pattern, (h) => {
    if (h.chords.length >= MAX_CHORDS) throw new Error(`A progression holds at most ${MAX_CHORDS} chords`);
    const added = { ...h.chords[h.chords.length - 1] };
    delete added.fill;
    h.chords.push(added);
  });
}

export function removeChord(pattern, index) {
  return withHarmony(pattern, (h) => {
    if (h.chords.length <= 1) throw new Error('A progression keeps at least one chord');
    h.chords.splice(index, 1);
  });
}

/**
 * Set which arpeggio the notes follow; None removes it and the stored Pitches
 * sound again. A chord's own fill exists only under an arpeggio, so None drops
 * every chord's too (AC-2.15.1/2); a fill chosen keeps them (AC-2.15.1/4).
 */
export function setArpeggio(pattern, id) {
  if (id !== null && id !== 'none' && !isValidArpeggio(id)) throw new Error(`Unknown arpeggio: ${id}`);
  return withHarmony(pattern, (h) => {
    if (id === null || id === 'none') {
      delete h.arpeggio;
      for (const chord of h.chords) delete chord.fill;
    } else h.arpeggio = id;
  });
}

/* --- a fill per chord (US-2.15, research.md D-022) -------------------------- */

/** The fill a chord deals: its own where it carries one, the Pattern's arpeggio otherwise. */
export function fillOf(pattern, chordIndex) {
  return pattern.harmony?.chords?.[chordIndex]?.fill ?? pattern.harmony?.arpeggio ?? null;
}

/**
 * Give one chord a fill of its own in place of the arpeggio, or null — As
 * above — to take it away (AC-2.15.1/3). Only under an arpeggio: with none the
 * notes are as stamped and no chord is dealt (AC-2.15.1/2).
 */
export function setChordFill(pattern, index, id) {
  if (id !== null && !isValidArpeggio(id)) throw new Error(`Unknown arpeggio: ${id}`);
  return withHarmony(pattern, (h) => {
    const chord = h.chords[index];
    if (!chord) throw new Error(`No chord ${index}`);
    if (id !== null && !h.arpeggio) throw new Error("A chord's fill needs an arpeggio to stand in for");
    if (id === null) delete chord.fill;
    else chord.fill = id;
  });
}

/** Every chord back to As above — what the Fill roll does with its new arpeggio (AC-2.15.3/3). */
export function clearChordFills(pattern) {
  if (!hasHarmony(pattern) || !pattern.harmony.chords.some((c) => c.fill)) return pattern;
  return withHarmony(pattern, (h) => {
    for (const chord of h.chords) delete chord.fill;
  });
}

/* --- voicing shapes (US-2.11, research.md D-014) ---------------------------- */

/**
 * The shapes the Voicing picker offers (AC-2.11.3/1), in picker order. Each
 * `choose(chord, previous)` picks the inversion of `chord` to follow the stack
 * of the chord before; the first chord is always over its root.
 */
export const VOICINGS = [
  { id: 'root', label: 'Root position', choose: () => 0 },
  { id: 'closest', label: 'Closest', choose: (chord, previous) => closestTo(chord, previous) },
  { id: 'rising', label: 'Rising bass', choose: (chord, previous) => nextBass(chord, previous, 1) },
  { id: 'falling', label: 'Falling bass', choose: (chord, previous) => nextBass(chord, previous, -1) },
  { id: 'arch', label: 'Rising then falling', choose: (chord, previous, i, n) => nextBass(chord, previous, i <= Math.floor(n / 2) ? 1 : -1) },
];
export const DEFAULT_VOICING = 'closest';

export function isValidVoicing(id) {
  return VOICINGS.some((v) => v.id === id);
}

/** The bass offsets a chord can take, one per member, indexed by inversion. */
function bassOffsets(chord) {
  return Array.from({ length: memberCount(chord) }, (_, k) => bassOf({ ...chord, inversion: k }).offset);
}

/**
 * The inversion whose notes move least from the previous stack: the sum, over
 * the candidate's notes, of the distance to the nearest previous note; a tie
 * goes to the lower inversion (AC-2.11.3/3).
 */
function closestTo(chord, previous) {
  const from = previous.map((m) => m.offset);
  let best = 0;
  let bestCost = Infinity;
  for (let k = 0; k < memberCount(chord); k++) {
    const cost = chordStack({ ...chord, inversion: k }).reduce(
      (sum, m) => sum + Math.min(...from.map((p) => Math.abs(m.offset - p))),
      0
    );
    if (cost < bestCost) {
      best = k;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * The inversion whose bass is the nearest above (direction 1) or below (−1)
 * the previous bass, starting again from the far end of the octave when none
 * is (AC-2.11.3/4).
 */
function nextBass(chord, previous, direction) {
  const bass = previous[0].offset;
  const offsets = bassOffsets(chord);
  const beyond = offsets.map((o, k) => [o, k]).filter(([o]) => (direction > 0 ? o > bass : o < bass));
  const pool = beyond.length ? beyond : offsets.map((o, k) => [o, k]);
  return pool.reduce((pick, c) => (direction > 0 ? (c[0] < pick[0] ? c : pick) : c[0] > pick[0] ? c : pick))[1];
}

/** The chords with the inversions a shape chooses (AC-2.11.3/2–/5); the first always over its root. */
export function voiceChords(chords, id) {
  const shape = VOICINGS.find((v) => v.id === id);
  if (!shape) throw new Error(`Unknown voicing: ${id}`);
  const out = [];
  let previous = null;
  chords.forEach((chord, i) => {
    const bare = { ...chord };
    delete bare.inversion;
    const k = previous === null ? 0 : shape.choose(bare, previous, i, chords.length);
    const voiced = k === 0 ? bare : { ...bare, inversion: k };
    out.push(voiced);
    previous = chordStack(voiced);
  });
  return out;
}

/** The shape the chords' basses match, in picker order, or null — Custom — when they match none (AC-2.11.3/1). */
export function matchVoicing(chords) {
  if (!chords?.length) return null;
  const same = (a, b) => a.length === b.length && a.every((c, i) => inversionOf(c) === inversionOf(b[i]));
  return VOICINGS.find((v) => same(voiceChords(chords, v.id), chords))?.id ?? null;
}

/**
 * The basses a chord offers (AC-2.11.1/1): one per member, in the chord's own
 * order, each with its role and its note name in the Key.
 *
 * @returns {Array<{inversion: number, tone: number, name: string}>}
 */
export function bassOptions(chord, key) {
  return Array.from({ length: memberCount(chord) }, (_, k) => {
    const voiced = { ...chord, inversion: k };
    return { inversion: k, tone: bassOf(voiced).tone, name: bassName(voiced, key) };
  });
}

/* --- what a cycle steps through (US-2.12) ---------------------------------- */

/**
 * The catalogue indices a cycle steps through (AC-2.12.3/1): every entry under
 * All, or under My list the listed ones alone, in the catalogue's order
 * whatever order they were ticked in. A list holding no id the catalogue knows
 * steps through the whole catalogue, so a cycle always has something in force.
 */
export function cycleOrder(catalogue, { from = 'all', list = [] } = {}) {
  const all = catalogue.map((_, i) => i);
  if (from !== 'list' || !Array.isArray(list)) return all;
  const listed = all.filter((i) => list.includes(catalogue[i].id));
  return listed.length ? listed : all;
}

/**
 * Where a cycle begins when it is turned on or reset (AC-2.12.3/2): the
 * Pattern's own entry when the order holds it, otherwise the first entry of the
 * order after it in the catalogue, wrapping round.
 */
export function cycleStart(own, order) {
  if (!order?.length || order.includes(own)) return own;
  return order.find((i) => i > own) ?? order[0];
}

/**
 * `steps` entries on from catalogue index `start` through `order` (null: the
 * whole catalogue of `n`). A start the order does not hold — a fill chosen by
 * hand that is not listed (AC-2.12.3/3) — is in force until its first step,
 * which lands on the first listed entry after it.
 */
function stepThrough(start, steps, order, n) {
  if (!order) return (((start + steps) % n) + n) % n;
  const m = order.length;
  const at = order.indexOf(start);
  if (at >= 0) return order[(at + steps) % m];
  if (steps === 0) return start;
  const next = order.findIndex((i) => i > start);
  return order[((next < 0 ? 0 : next) + steps - 1) % m];
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
export function fillIndexFor(pattern, { start = 0, baseLoop = 0, repeats = 4, order = null } = {}, loop = 0) {
  const period = Math.max(1, Math.floor(repeats)) * cyclePasses(pattern);
  const steps = Math.floor(Math.max(0, loop - baseLoop) / period);
  return stepThrough(start, steps, order, ARPEGGIOS.length);
}

/**
 * The Pattern as played with the fill `id` in force — a playback overlay handed
 * to whoever renders or sounds it, never stored (AC-2.7.1/4). The fill in force
 * deals every chord, each chord's own fill suspended while it lasts
 * (AC-2.15.3/1). The Pattern itself is returned when it has no progression or
 * already plays exactly that.
 */
export function withArpeggio(pattern, id) {
  if (!hasHarmony(pattern)) return pattern;
  const chords = pattern.harmony.chords;
  if ((pattern.harmony.arpeggio ?? null) === id && !chords.some((c) => c.fill)) return pattern;
  const bare = chords.map((c) => {
    const rest = { ...c };
    delete rest.fill;
    return rest;
  });
  return { ...pattern, harmony: { ...pattern.harmony, arpeggio: id, chords: bare } };
}

/* --- cycle mode: the progression in force (US-2.10) ------------------------ */

/**
 * The catalogue index of a Pattern's own progression, matched from its chords
 * under its own scale, or 0 — the first — when it has none or the chords match
 * no entry (AC-2.10.1/3): the starting place a fresh cycle counts from, the
 * same way `fillIndexOf` seeds Cycle fills.
 */
export function progressionIndexOf(pattern) {
  const id = matchProgression(pattern);
  const i = id === null ? -1 : PROGRESSIONS.findIndex((p) => p.id === id);
  return i < 0 ? 0 : i;
}

/**
 * The catalogue index of the progression in force under progression cycling for
 * the pass `loop` (AC-2.10.2/2, /3): identical shape to `fillIndexFor` — the
 * starting progression, stepped forward once for every `repeats` harmonic
 * cycles of the Pattern's OWN progression played since `baseLoop`, wrapping
 * round the catalogue. Cycle fills and Cycle progressions are independent
 * catalogues that can both be driven by the same `repeats`, stepping forward on
 * the same cadence without being coupled into one combined step (AC-2.10.2/1).
 */
export function progressionIndexFor(pattern, { start = 0, baseLoop = 0, repeats = 4, order = null } = {}, loop = 0) {
  const period = Math.max(1, Math.floor(repeats)) * cyclePasses(pattern);
  const steps = Math.floor(Math.max(0, loop - baseLoop) / period);
  return stepThrough(start, steps, order, PROGRESSIONS.length);
}

/**
 * The Pattern as played with the catalogue progression `id` in force — a
 * playback overlay, never stored (AC-2.10.1/4). The arpeggio field, if any, is
 * left untouched so Cycle fills and Cycle progressions compose freely. The
 * Pattern itself is returned when it has no progression or already matches
 * `id`.
 */
export function withProgression(pattern, id) {
  if (!hasHarmony(pattern) || matchProgression(pattern) === id) return pattern;
  // Voiced Closest, as a progression chosen from the catalogue is (AC-2.11.3/7).
  const chords = voiceChords(spellProgression(id, pattern.scale ?? DEFAULT_SCALE), DEFAULT_VOICING);
  return { ...pattern, harmony: { ...pattern.harmony, chords } };
}

/**
 * The roles an arpeggio deals: the members of the progression's fullest chord
 * (AC-2.6.6/5), in the order they sit in the stack of the chord in force — from
 * the bass up — so a fill's shape is positional (AC-2.11.2/3). Over a root the
 * order is Root, 3rd, 5th, 7th, 9th as it always was.
 */
export function arpeggioRoles(pattern, chord = null) {
  const chords = pattern.harmony?.chords ?? [];
  const roles = TONES.filter((tone) => chords.some((c) => hasTone(c, tone)));
  if (!chord) return roles;
  // A member struck from this chord gets no step (AC-2.16.2/1); a member it
  // never had still falls to the next-lower one (AC-2.6.4/2).
  const omit = omitOf(chord);
  return roles
    .filter((tone) => !omit.includes(tone))
    .map((tone, i) => ({ tone, i, offset: memberFor(chord, tone).offset }))
    .sort((a, b) => a.offset - b.offset || a.i - b.i)
    .map((m) => m.tone);
}

/** The step sequence an arpeggio deals for this Pattern, under the chord in force. */
export function arpeggioSequence(order, pattern, chord = null) {
  const entry = ARPEGGIOS.find((a) => a.id === order);
  if (!entry) throw new Error(`Unknown arpeggio: ${order}`);
  return entry.steps({ roles: arpeggioRoles(pattern, chord), walk: (kind) => walkDegrees(kind, pattern) });
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
  if (!pattern?.harmony?.arpeggio || !hasHarmony(pattern)) return null;
  const deal = new Map();
  let sequence = null;
  let approach = null;
  let k = 0;
  let previous = null;
  let lastKey = null;
  const last = pattern.measures.length - 1;
  pattern.measures.forEach((measure, m) => {
    const chord = chordAt(pattern, pass, m);
    if (m === 0 || chord !== previous) {
      // Each chord opens on its own first step, dealt from its own stack
      // (AC-2.11.2/3) — and from its own fill where it carries one, the
      // Pattern's arpeggio otherwise (AC-2.15.2).
      k = 0;
      const order = fillOf(pattern, chord);
      sequence = arpeggioSequence(order, pattern, pattern.harmony.chords[chord]);
      approach = ARPEGGIOS.find((a) => a.id === order)?.approach ?? null;
    }
    previous = chord;
    measure.beats.forEach((beat, b) => {
      beat.slots.forEach((slot, s) => {
        if (!slot.on) return;
        lastKey = dealKey(m, b, s);
        deal.set(lastKey, sequence[k % sequence.length]);
        k += 1;
      });
    });
    // Walking into the next chord: the span's last sounding Slot takes the
    // semitone beside the bass of the chord after it — the next Measure's, or
    // the next pass's at the end, wrapping with the cycle and reckoned within
    // the Pattern alone (AC-2.6.6/23–/26).
    const next = m === last ? chordAt(pattern, pass + 1, 0) : chordAt(pattern, pass, m + 1);
    if (approach && lastKey !== null && (m === last || next !== chord)) {
      deal.set(lastKey, { approach, target: chordStack(pattern.harmony.chords[next])[0].offset });
      lastKey = null;
    }
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

/**
 * Semitones above the Key's tonic a drone sits: the tonic, the chord's root,
 * or the scale's 5th or 7th — taken from the degrees the scale stacks its
 * chords from, so a scale with no 7th borrows one as its chords do (AC-2.6.6/14).
 */
function droneSemitones(drone, chord, pattern) {
  if (drone === 'root') return degreeSemitones(chord.degree);
  if (drone === 'tonic') return 0;
  const degrees = stackingDegrees(pattern?.scale ?? DEFAULT_SCALE);
  if (drone === 'second') return degreeSemitones(degrees[1]);
  if (drone === 'fifth') return degreeSemitones(degrees[4]);
  if (drone === 'seventh') return degreeSemitones(degrees[6]);
  throw new Error(`Unknown drone: ${drone}`);
}

const DRONE_MARK = { tonic: 'T', root: 'R', second: '2̂', fifth: '5̂', seventh: '7̂' };

/**
 * The scale note next above or below a chord tone, in semitones above the Key's
 * tonic: taken from the degrees the scale stacks its chords from, as the scale
 * drones are, so it is diatonic to the Key whatever the chord (AC-2.6.6/18).
 */
function neighbourSemitones(step, chord, pattern) {
  const from = memberFor(chord, step.of).offset;
  const scale = stackingDegrees(pattern?.scale ?? DEFAULT_SCALE).map(degreeSemitones);
  const octave = Math.floor(from / 12) * 12;
  const candidates = [-12, 0, 12].flatMap((o) => scale.map((d) => octave + o + d));
  return step.neighbour > 0
    ? Math.min(...candidates.filter((x) => x > from))
    : Math.max(...candidates.filter((x) => x < from));
}

/** Semitones above the Key's tonic a step sounds, before the Slot's own octave. */
function stepSemitones(step, chord, pattern) {
  const shift = 12 * (step.octave ?? 0);
  if (step.tone !== undefined) return memberFor(chord, step.tone).offset + shift;
  if (step.drone !== undefined) return droneSemitones(step.drone, chord, pattern) + shift;
  if (step.neighbour !== undefined) return neighbourSemitones(step, chord, pattern) + shift;
  if (step.interval !== undefined) return memberFor(chord, 1).offset + degreeSemitones(step.interval) + shift;
  if (step.chromatic !== undefined) return memberFor(chord, step.of).offset + step.chromatic + shift;
  if (step.approach !== undefined) return step.target + step.approach;
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

/** How the band writes a step: `R↑`, `T↑` for the tonic drone, `5̂↑` for the scale's 5th, `s3` for a scale step, `5+` / `R−` for a neighbour, `♭7` for an interval above the root, `3−½` / `R+½` for a chromatic neighbour, `→−½` / `→+½` for an approach to the next chord (AC-2.6.6/12, /14, /18–/20, /27). */
export function stepLabel(step) {
  if (step.tone !== undefined) return `${toneLabel(step.tone)}${OCTAVE_MARK(step.octave ?? 0)}`;
  if (step.drone !== undefined) return `${DRONE_MARK[step.drone]}${OCTAVE_MARK(step.octave ?? 0)}`;
  if (step.neighbour !== undefined) return `${toneLabel(step.of)}${step.neighbour > 0 ? '+' : '−'}${OCTAVE_MARK(step.octave ?? 0)}`;
  if (step.interval !== undefined) return `${degreeLabel(step.interval)}${OCTAVE_MARK(step.octave ?? 0)}`;
  if (step.chromatic !== undefined) return `${toneLabel(step.of)}${step.chromatic > 0 ? '+' : '−'}½${OCTAVE_MARK(step.octave ?? 0)}`;
  if (step.approach !== undefined) return `→${step.approach > 0 ? '+' : '−'}½`;
  return `s${step.step}`;
}

/** The note a step sounds, spelled against the Key. */
export function stepName(step, chord, key, pattern, octaveOffset = 0) {
  if (step.tone !== undefined) {
    return chordToneName({ tone: step.tone, octaveOffset: octaveOffset + (step.octave ?? 0) }, chord, key);
  }
  return noteName(stepAsDegree(step, chord, pattern, octaveOffset), key);
}
