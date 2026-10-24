/**
 * The fretboard's geometry (US-19.2), ported from fret-navigator's `theory.js`
 * and `fretboard.js` (research.md D-016) with everything the Composer fixes
 * left out: one tuning, absolute fret numbers, no chord view.
 *
 * Pure: what a string and fret sound, which frets a capo mutes, where a fret
 * sits for a visible range, and which chromatic degree takes which colour role.
 * Names and degrees are NOT decided here — `core/pitch.js` and `core/scales.js`
 * spell them, so the board and the composing grid cannot disagree.
 */

/** Standard tuning as MIDI, string 1 (high E) first — top row to bottom row. */
export const STANDARD_TUNING_MIDI = [64, 59, 55, 50, 45, 40];
export const STRING_COUNT = STANDARD_TUNING_MIDI.length;
/** Frets 1–24; fret 0 is the open string. */
export const FRET_COUNT = 24;
export const MAX_CAPO = 12;

export const SINGLE_DOT_FRETS = [3, 5, 7, 9, 15, 17, 19, 21];
export const DOUBLE_DOT_FRETS = [12, 24];
const MARKER_FRETS = new Set([...SINGLE_DOT_FRETS, ...DOUBLE_DOT_FRETS]);

/**
 * fret-navigator's twelve colour roles, one per chromatic degree above the
 * root, in semitone order. The ids are CSS class suffixes (`role-4s5b` is the
 * tritone, spelled #4 or b5 by the scale).
 */
export const DEGREE_ROLE_IDS = ['1', 'b2', '2', 'b3', '3', '4', '4s5b', '5', 'b6', '6', 'b7', '7'];

/** Interval shorthand per chromatic degree above the root — the Intervals label mode. */
export const INTERVAL_LABELS = ['R', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];

export const LABEL_MODES = ['notes', 'degrees', 'intervals'];
export const LABEL_MODE_LABELS = { notes: 'Notes', degrees: 'Degrees', intervals: 'Intervals' };

/** The board's drawn size, fixed whatever range is visible (fret-navigator FR-043).
 * The side margin is a quarter of the vertical one — the maintainer asked
 * twice for the side space to go to the fret columns; the vertical margin
 * still holds the fret numbers above and below the board. */
export const MARGIN = 24;
export const MARGIN_X = 6;
export const OPEN_COL_WIDTH = 56;
export const FRET_COL_WIDTH = 44;
export const ROW_HEIGHT = 48;
export const NOTE_RADIUS = 14;
export const BOARD_WIDTH = MARGIN_X * 2 + OPEN_COL_WIDTH + FRET_COUNT * FRET_COL_WIDTH;
export const BOARD_HEIGHT = MARGIN * 2 + STRING_COUNT * ROW_HEIGHT;

const mod12 = (n) => ((n % 12) + 12) % 12;

/** The board's on-screen height cap — tokens.css `.fretboard { max-height }` mirrors it. */
const BOARD_CAP_PX = 420;

/**
 * The drawn width for a panel `widthPx` wide: never narrower than the fixed
 * board, and stretched halfway to the width that would fill the panel at the
 * height cap — so the letterboxed dead margin a wide panel shows is cut in
 * half, at the same height, while the board's proportions stay close to the
 * fixed drawing's (the maintainer's choice, 2026-10-24: wider, not taller, and
 * not the full stretch). An unknown width keeps the fixed board.
 */
export function boardWidthFor(widthPx) {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return BOARD_WIDTH;
  const fillsWidthAtCap = (BOARD_HEIGHT * widthPx) / BOARD_CAP_PX;
  if (fillsWidthAtCap <= BOARD_WIDTH) return BOARD_WIDTH;
  return Math.round((BOARD_WIDTH + fillsWidthAtCap) / 2);
}

/** The MIDI note at a string (0 = high E) and fret (0 = open). AC-19.2.1/2 */
export function noteAt(stringIndex, fret) {
  if (stringIndex < 0 || stringIndex >= STRING_COUNT) throw new Error(`No string ${stringIndex}`);
  if (fret < 0 || fret > FRET_COUNT) throw new Error(`No fret ${fret}`);
  return STANDARD_TUNING_MIDI[stringIndex] + fret;
}

/** Frets below an active capo are muted and inert (AC-19.2.2/3). */
export function isPlayable(fret, capo) {
  return fret >= capo;
}

export function isMarkerFret(fret) {
  return MARKER_FRETS.has(fret);
}

export function roleIdFor(semitoneFromRoot) {
  return DEGREE_ROLE_IDS[mod12(semitoneFromRoot)];
}

export function intervalLabelFor(semitoneFromRoot) {
  return INTERVAL_LABELS[mod12(semitoneFromRoot)];
}

/** A visible range, clamped to the board and ordered. */
export function clampRange(range) {
  const clamp = (n) => Math.max(0, Math.min(FRET_COUNT, Math.round(Number(n) || 0)));
  let lower = clamp(range?.[0] ?? 0);
  let upper = clamp(range?.[1] ?? FRET_COUNT);
  if (upper < lower) [lower, upper] = [upper, lower];
  return [lower, upper];
}

export function clampCapo(capo) {
  return Math.max(0, Math.min(MAX_CAPO, Math.round(Number(capo) || 0)));
}

/**
 * The visible range after a capo is set: the lower bound follows the capo up,
 * and the upper bound keeps the span where the board allows (AC-19.2.2/3) —
 * fret-navigator's rule, so the frets the capo just muted leave the view.
 */
export function rangeAfterCapo(range, capo) {
  const [lower, upper] = clampRange(range);
  const c = clampCapo(capo);
  if (c <= lower) return [lower, upper];
  const delta = c - lower;
  return [c, Math.min(FRET_COUNT, upper + delta)];
}

/**
 * Where everything sits for a visible range (AC-19.2.2/4): the open column
 * only when fret 0 is in range, and the fretted columns sharing the rest of
 * the fixed width equally, so fewer visible frets are wider.
 */
export function layoutFor(range, boardWidth = BOARD_WIDTH) {
  const [lowerBound, upperBound] = clampRange(range);
  const showOpenColumn = lowerBound === 0;
  const firstFret = showOpenColumn ? 1 : lowerBound;
  const lastFret = Math.max(upperBound, firstFret - 1);
  const visibleFrettedCount = Math.max(0, lastFret - firstFret + 1);
  const openWidth = showOpenColumn ? OPEN_COL_WIDTH : 0;
  const availableWidth = boardWidth - MARGIN_X * 2 - openWidth;
  const colWidth = visibleFrettedCount > 0 ? availableWidth / visibleFrettedCount : availableWidth;

  /** x of the wire ending fret f (f = 0 is the nut when the open column shows). */
  const wireX = (f) => MARGIN_X + openWidth + (f - (firstFret - 1)) * colWidth;
  /** x of the centre of fret f's cell. */
  const noteX = (fret) => (fret === 0 ? MARGIN_X + OPEN_COL_WIDTH / 2 : wireX(fret - 1) + colWidth / 2);
  const stringY = (stringIndex) => MARGIN + stringIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
  const isVisible = (fret) => fret >= lowerBound && fret <= upperBound;

  return { lowerBound, upperBound, showOpenColumn, firstFret, lastFret, colWidth, wireX, noteX, stringY, isVisible };
}
