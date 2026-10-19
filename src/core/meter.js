/**
 * Time Signatures and Beat arithmetic. AC-1.2.1 … AC-1.2.4.
 *
 * Constitution Principle I: Beat count ALWAYS equals the numerator, for every
 * supported meter, with no assumed sub-grouping anywhere. 7/8 is seven
 * eighth-note Beats — never three Beats grouped 2+2+3. 6/8 is six eighth-note
 * Beats — never two dotted quarters. Nothing in this app may reinterpret a meter
 * into a grouping the Composer did not author.
 */

/** The closed set of supported Time Signatures, in menu order. AC-1.2.1 */
export const TIME_SIGNATURES = [
  '1/4',
  '2/4',
  '3/4',
  '4/4',
  '5/4',
  '6/4',
  '7/4',
  '2/8',
  '3/8',
  '5/8',
  '6/8',
  '7/8',
  '9/8',
  '12/8',
];

const PARSED = new Map(
  TIME_SIGNATURES.map((ts) => {
    const [num, den] = ts.split('/').map(Number);
    return [ts, { num, den }];
  })
);

export function isSupported(timeSignature) {
  return PARSED.has(timeSignature);
}

function parse(timeSignature) {
  const p = PARSED.get(timeSignature);
  if (!p) throw new Error(`Unsupported Time Signature: ${timeSignature}`);
  return p;
}

/**
 * Beats in one Measure of this meter — the numerator, always.
 * AC-1.2.1 … AC-1.2.4
 */
export function beatCount(timeSignature) {
  return parse(timeSignature).num;
}

/**
 * The note value one Beat occupies, from the denominator alone. This is what
 * selects which Recipe menu a Beat offers (AC-1.3.4 vs AC-1.3.5).
 */
export function beatNoteValue(timeSignature) {
  return parse(timeSignature).den === 4 ? 'quarter' : 'eighth';
}

/** The note values a tempo may count per minute. AC-4.2.7 */
export const TEMPO_UNITS = ['quarter', 'eighth'];

export function isValidTempoUnit(unit) {
  return TEMPO_UNITS.includes(unit);
}

/** Written length in quarter notes. */
const QUARTERS = { quarter: 1, eighth: 0.5 };

/**
 * The note value this Pattern's tempo counts. AC-4.2.7/5
 *
 * A Pattern that does not state one counts its first Measure's Beat — which is
 * what every tempo counted before the unit existed, so a Pattern saved then
 * whose Measures share a note value plays exactly as it did (research.md D-017).
 */
export function tempoUnitOf(pattern) {
  if (isValidTempoUnit(pattern?.tempoUnit)) return pattern.tempoUnit;
  const first = pattern?.measures?.[0]?.timeSignature;
  return first && isSupported(first) ? beatNoteValue(first) : 'quarter';
}

/** Seconds per quarter note at this tempo and unit — what a MIDI file's tempo is in. */
export function quarterSeconds(bpm, tempoUnit = 'quarter') {
  if (!(bpm > 0)) throw new Error(`Tempo must be positive, got ${bpm}`);
  if (!isValidTempoUnit(tempoUnit)) throw new Error(`Unsupported tempo unit: ${tempoUnit}`);
  return 60 / bpm / QUARTERS[tempoUnit];
}

/**
 * Seconds per Beat of this meter. AC-4.2.7/2
 *
 * The tempo counts `tempoUnit` per minute, and a Beat lasts its own written
 * length against it: an eighth-note Beat is half a quarter-note Beat, whatever
 * the unit, so 3/8 then 5/8 last exactly one 4/4 Measure (AC-4.2.7/3). Until
 * 2026-10-18 tempo counted Beats and an eighth-note Beat lasted as long as a
 * quarter-note one; research.md D-017 records why that was reversed.
 */
export function beatDurationSeconds(timeSignature, bpm, tempoUnit = 'quarter') {
  return quarterSeconds(bpm, tempoUnit) * QUARTERS[beatNoteValue(timeSignature)];
}

/** Seconds for one whole Measure of this meter at this tempo. */
export function measureDurationSeconds(timeSignature, bpm, tempoUnit = 'quarter') {
  return beatCount(timeSignature) * beatDurationSeconds(timeSignature, bpm, tempoUnit);
}
