/**
 * How a Measure's Beats divide the width it has. AC-15.1.14.
 *
 * A Measure lays its Beats out on ONE shared column width — every Beat the same
 * width as every other, whatever Recipe it holds — and where they cannot all fit
 * a line it wraps them into lines that are as evenly filled as the Beat count
 * allows. Four Beats where three fit lay out two and two.
 *
 * This used to be a wrapping flexbox, and a flexbox grows whatever landed on a
 * line to fill that line. At 390px a 4/4 Measure came out 110, 110, 110 and then
 * a single Beat spread across the entire second line — three narrow Beats and one
 * four times their size, all sounding the same duration.
 *
 * The column COUNT is the only thing that cannot be expressed in CSS: it depends
 * on how wide a Beat's own Slots need to be at the 24px tap minimum, which
 * depends on the reader's font as much as on the Recipe. So it is measured here
 * and written to `--beat-cols`, and the grid itself is CSS
 * (`repeat(var(--beat-cols), minmax(min-content, 1fr))`) — equal tracks that can
 * never be driven below a Beat's minimum, so nothing overflows sideways
 * (AC-15.1.10).
 *
 * The columns' CEILING is measured the same way (AC-15.2.7). Equal `1fr` tracks
 * fill whatever width they are given, so a one-Beat Measure on a wide line was
 * one enormous cell, and a Pattern's cells were sized by how many Beats it
 * happened to have. Each Measure's Beats are also laid out at the preferred
 * cell size — `--slot-size`, or the cell's own content where that is wider —
 * and the width the columns come to at that size is written to `--beats-max`.
 * The line's spare room stays spare; a line with no spare room is unchanged.
 *
 * Deliberately NOT inside `renderGrid`: rendering stays a pure function of
 * (pattern, transportPosition) per Constitution Principle II, and how much room
 * the grid has is neither of those. This runs after it, and again whenever the
 * available width changes.
 */

/**
 * How many Beats to put on a line.
 *
 * Not "as many as fit" — that is what leaves the remainder stranded. The most
 * that fit gives the LINE COUNT; the Beats are then divided evenly between those
 * lines (AC-15.1.14/3). Four Beats where three fit is two lines, so two per line.
 *
 * Pure, and the only arithmetic in this file, so it can be tested without a DOM.
 *
 * @param {number} beatCount   Beats in the Measure — always the numerator.
 * @param {number} available   Width the Beats have, in CSS pixels.
 * @param {number} minBeatWidth Widest minimum any Beat in the Measure needs.
 * @param {number} gap         Gap between Beats, in CSS pixels.
 * @returns {number} Columns to lay the Measure out on, 1 ≤ n ≤ beatCount.
 */
export function balancedColumns(beatCount, available, minBeatWidth, gap) {
  if (!(beatCount > 1)) return 1;
  if (!(minBeatWidth > 0)) return beatCount;

  // A Beat is never squeezed below its minimum (AC-15.1.14/2), so one per line
  // is the floor even when a single Beat is wider than the viewport.
  const perLine = Math.max(1, Math.floor((available + gap) / (minBeatWidth + gap)));
  if (perLine >= beatCount) return beatCount;

  const lines = Math.ceil(beatCount / perLine);
  return Math.ceil(beatCount / lines);
}

/**
 * The most width a Measure's Beat lines may take (AC-15.2.7).
 *
 * `columns` tracks at the preferred Beat width, plus the gaps between them:
 * the width the line comes to when every cell is at `--slot-size`. `null` when
 * the preferred width is unknown, which the CSS reads as no cap at all — the
 * fill-the-line fallback rather than a zero-width one.
 *
 * Pure, so it can be tested without a DOM.
 *
 * @param {number} columns        Columns the Measure lays out on, per `balancedColumns`.
 * @param {number} preferredWidth Width of the hungriest Beat with every cell at its preferred size.
 * @param {number} gap            Gap between Beats, in CSS pixels.
 * @returns {number|null} The cap in CSS pixels, or null for none.
 */
export function beatsMaxWidth(columns, preferredWidth, gap) {
  if (!(columns > 0) || !(preferredWidth > 0)) return null;
  return columns * preferredWidth + (columns - 1) * (gap > 0 ? gap : 0);
}

/**
 * The answers already worked out, so a re-render costs no measurement at all.
 *
 * This cache is a requirement, not a tuning: playback re-renders the whole grid
 * on every Slot, and a measuring pass forces a layout — on a 192-Slot Melodic
 * grid that trebled the cost of a render and pushed a Playwright test from 9.8
 * to over 30 seconds on CI. What a Measure's columns depend on is its Slot
 * shape, its meter label, and the grid's width; while those hold, the answer
 * holds, so the render path only writes `--beat-cols` and `--beats-max` and
 * never reads.
 *
 * Cleared whenever the grid's width changes, which is also when a reflowed font
 * would change the measurement.
 *
 * @type {Map<string, {cols: number, max: number|null}>}
 */
const layouts = new Map();

/** Slot counts per Beat — what a Measure's minimum width actually depends on. */
function shapeOf(measureEl) {
  return [...measureEl.querySelectorAll('.beat')]
    .map((beat) => beat.querySelectorAll('.slot').length)
    .join(',');
}

/**
 * What makes two Measures lay out identically: the same Slot shape inside the
 * same meter label at the same grid width. The label is in the key because it
 * sits beside the Beats and takes width from them, and `12/8` is wider than
 * `4/4`.
 */
function keyOf(measureEl, gridWidth) {
  return `${gridWidth}|${measureEl.dataset.timeSignature ?? ''}|${shapeOf(measureEl)}`;
}

/**
 * Balance every Measure in a grid to the width it currently has.
 *
 * Every Measure whose key is already known is written straight out. Only the
 * unknown ones are measured, and they are measured together — all the probe
 * classes on, all the widths read, all the classes off — so a Pattern of eight
 * new Measures costs one forced layout rather than eight.
 *
 * @param {HTMLElement} gridEl
 * @returns {number[]} The column count applied to each Measure, in order.
 */
export function balanceBeatLines(gridEl) {
  if (!gridEl) return [];
  const measures = [...gridEl.querySelectorAll('.measure')];
  if (measures.length === 0) return [];

  const jobs = measures
    .map((measureEl) => {
      const beatsEl = measureEl.querySelector('.beats');
      return beatsEl ? { measureEl, beatsEl } : null;
    })
    .filter(Boolean);

  const unknown = [];
  for (const job of jobs) {
    // Reading the grid's width once, and only when something is unknown, keeps
    // the steady state — the same Pattern re-rendering at the same width —
    // free of layout reads entirely.
    job.key = keyOf(job.measureEl, gridWidth(gridEl));
    if (!layouts.has(job.key)) unknown.push(job);
  }

  if (unknown.length > 0) measure(unknown);

  return jobs.map((job) => {
    const layout = layouts.get(job.key) ?? { cols: 1, max: null };
    job.beatsEl.style.setProperty('--beat-cols', String(layout.cols));
    if (layout.max === null) job.beatsEl.style.removeProperty('--beats-max');
    else job.beatsEl.style.setProperty('--beats-max', `${layout.max}px`);
    return layout.cols;
  });
}

/**
 * The grid's width, read at most once per balancing pass and remembered until
 * something says it changed.
 */
let width = null;
function gridWidth(gridEl) {
  if (width === null) width = gridEl.clientWidth;
  return width;
}

/**
 * Measure the Measures whose layout is not yet known, and work out their
 * columns.
 *
 * `measuring` collapses a Measure's grid to a single min-content column, so
 * every Beat lays out at the width of the hungriest Beat in that Measure and one
 * `getBoundingClientRect` answers for the whole Measure. `measuring-preferred`
 * does the same at max-content with every cell pinned to its preferred size, for
 * the ceiling (AC-15.2.7). Each is held between two writes with no yield in
 * between, so neither is ever painted — two forced layouts per batch of unknown
 * Measures, and none at all on the cached path.
 */
function measure(jobs) {
  // A Measure being re-balanced in place — the grid's width changed under it —
  // still carries the width from last time. Both probes lift it in CSS, but the
  // read-back below is taken outside them, so it goes now.
  for (const job of jobs) job.beatsEl.style.removeProperty('--beats-max');

  // The Measure box hugs its Beats (AC-15.2.8/2), so while it is being measured
  // it is held at the full width it COULD take — otherwise "available" reads as
  // however wide the box happens to be right now, which is the answer to last
  // time's question. `.measure.measuring` in the CSS.
  for (const job of jobs) job.measureEl.classList.add('measuring');

  for (const job of jobs) job.beatsEl.classList.add('measuring');
  for (const job of jobs) {
    const beat = job.beatsEl.querySelector('.beat');
    const style = getComputedStyle(job.beatsEl);
    job.min = beat ? beat.getBoundingClientRect().width : 0;
    job.available = job.beatsEl.clientWidth;
    job.gap = parseFloat(style.columnGap) || 0;
    job.beatCount = job.measureEl.querySelectorAll('.beat').length;
  }
  for (const job of jobs) job.beatsEl.classList.remove('measuring');

  for (const job of jobs) job.beatsEl.classList.add('measuring-preferred');
  for (const job of jobs) {
    const beat = job.beatsEl.querySelector('.beat');
    job.preferred = beat ? beat.getBoundingClientRect().width : 0;
  }
  for (const job of jobs) job.beatsEl.classList.remove('measuring-preferred');

  // The container is a flex item with `min-width: 0`, so collapsing its columns
  // does not change how wide it is — but read it back rather than trusting that,
  // since a wrong width here silently mislays every Measure of this shape.
  for (const job of jobs) {
    const available = job.beatsEl.clientWidth || job.available;
    const cols = balancedColumns(job.beatCount, available, job.min, job.gap);
    layouts.set(job.key, { cols, max: beatsMaxWidth(cols, job.preferred, job.gap) });
  }

  for (const job of jobs) job.measureEl.classList.remove('measuring');
}

/** Forget the worked-out layouts — the width, and so the answers, have moved. */
export function forgetBeatWidths() {
  layouts.clear();
  width = null;
}

/**
 * Re-balance whenever the grid's own width changes (AC-15.1.14/5).
 *
 * Watching the element rather than the window, because the width available to
 * the grid also changes when the library opens or collapses beside it, which
 * fires no resize event at all. Height changes are ignored: applying a column
 * count changes the grid's height, and reacting to that would loop.
 */
export function observeGridWidth(gridEl) {
  if (typeof ResizeObserver === 'undefined') return null;
  let lastWidth = null;
  const observer = new ResizeObserver(() => {
    const width = gridEl.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    forgetBeatWidths();
    balanceBeatLines(gridEl);
  });
  observer.observe(gridEl);
  return observer;
}
