/**
 * The keyboard's geometry (US-19.3): which keys a count shows, which are
 * black, and when the keyboard goes to two rows. Pure.
 *
 * Counts are centred on middle C where the arithmetic allows — 25 and 49 keys
 * are C to C with C4 in the middle — and take the range such a keyboard is
 * built with otherwise (AC-19.3.1/2).
 */

export const MIDDLE_C = 60;
export const KEY_COUNTS = [25, 37, 49, 61, 76, 88];
export const DEFAULT_KEY_COUNT = 49;
/** A white key narrower than this is not a key a finger can aim at (AC-19.3.2/1). */
export const MIN_WHITE_KEY_PX = 18;

/** Lowest MIDI note for each count; the highest follows from the count. */
const LOW_NOTE = {
  25: 48, // C3–C5
  37: 48, // C3–C6
  49: 36, // C2–C6
  61: 36, // C2–C7
  76: 28, // E1–G7
  88: 21, // A0–C8
};

const BLACK = new Set([1, 3, 6, 8, 10]);
const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function isValidKeyCount(count) {
  return KEY_COUNTS.includes(Number(count));
}

/** The range a count spans, as inclusive MIDI bounds. */
export function rangeFor(count) {
  const n = Number(count);
  if (!isValidKeyCount(n)) throw new Error(`Unsupported key count: ${count}`);
  const low = LOW_NOTE[n];
  return { low, high: low + n - 1 };
}

export function isBlackKey(midi) {
  return BLACK.has(((midi % 12) + 12) % 12);
}

/** Scientific pitch name of a key by pitch class — the C labels use it. */
export function keyName(midi) {
  return `${LETTERS[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Every key in a range, in order, each with its white-key index — the column
 * it sits over — so a renderer can place black keys between the whites they
 * belong to (AC-19.3.2/2).
 */
export function keysIn(range) {
  const keys = [];
  let whiteIndex = -1;
  for (let midi = range.low; midi <= range.high; midi++) {
    const black = isBlackKey(midi);
    if (!black) whiteIndex += 1;
    keys.push({ midi, black, whiteIndex: black ? whiteIndex : whiteIndex, isC: midi % 12 === 0 });
  }
  return keys;
}

export function whiteKeyCount(range) {
  return keysIn(range).filter((k) => !k.black).length;
}

/**
 * The rows the keyboard is laid out in for a panel width: one, or two split at
 * the C nearest the middle of the range, the lower half first (AC-19.3.2/1).
 * The upper row begins ON that C, so each row starts where a musician expects.
 */
export function splitRows(range, widthPx, minWhitePx = MIN_WHITE_KEY_PX) {
  const whites = whiteKeyCount(range);
  if (!(widthPx > 0) || widthPx / whites >= minWhitePx) return [range];
  const middle = (range.low + range.high) / 2;
  let split = null;
  for (let midi = range.low + 1; midi <= range.high; midi++) {
    if (midi % 12 !== 0) continue;
    if (split === null || Math.abs(midi - middle) < Math.abs(split - middle)) split = midi;
  }
  if (split === null) return [range];
  return [
    { low: range.low, high: split - 1 },
    { low: split, high: range.high },
  ];
}
