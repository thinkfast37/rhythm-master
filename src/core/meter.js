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

/**
 * Seconds per Beat at a given tempo.
 *
 * Tempo is Beats per minute, where "Beat" means the Beat this meter defines —
 * so an eighth-note Beat in 6/8 at 80 BPM lasts the same wall-clock time as a
 * quarter-note Beat in 4/4 at 80 BPM. The musician is counting Beats; the
 * denominator says what a Beat is written as, not how fast it goes.
 */
export function beatDurationSeconds(timeSignature, bpm) {
  parse(timeSignature); // validate
  if (!(bpm > 0)) throw new Error(`Tempo must be positive, got ${bpm}`);
  return 60 / bpm;
}

/** Seconds for one whole Measure of this meter at this tempo. */
export function measureDurationSeconds(timeSignature, bpm) {
  return beatCount(timeSignature) * beatDurationSeconds(timeSignature, bpm);
}
