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
 * The measured minimum, cached by the shape of the Measure.
 *
 * Playback re-renders the grid on every Slot, and measuring forces a layout, so
 * an uncached probe would run tens of times a second for an answer that only
 * changes when the Pattern or the font does. The key is the Measure's Slot
 * structure; the cache is cleared on resize, since a resize is also when a
 * reflowed font would change the answer.
 */
const minWidths = new Map();

/** Slot counts per Beat — what a Measure's minimum width actually depends on. */
function shapeOf(measureEl) {
  return [...measureEl.querySelectorAll('.beat')]
    .map((beat) => beat.querySelectorAll('.slot').length)
    .join(',');
}

/**
 * Balance every Measure in a grid to the width it currently has.
 *
 * Reads first and writes second, in two passes over all Measures rather than a
 * read-write pair per Measure, so eight Measures cost one forced layout and not
 * eight.
 *
 * @param {HTMLElement} gridEl
 * @returns {number[]} The column count applied to each Measure, in order.
 */
export function balanceBeatLines(gridEl) {
  if (!gridEl) return [];
  const measures = [...gridEl.querySelectorAll('.measure')];
  if (measures.length === 0) return [];

  // Pass 1 — what each Measure has to work with, and what it needs.
  const jobs = measures.map((measureEl) => {
    const beatsEl = measureEl.querySelector('.beats');
    if (!beatsEl) return null;
    const style = getComputedStyle(beatsEl);
    return {
      beatsEl,
      shape: shapeOf(measureEl),
      beatCount: measureEl.querySelectorAll('.beat').length,
      available: beatsEl.clientWidth,
      gap: parseFloat(style.columnGap) || 0,
    };
  });

  // Pass 2 — probe only the shapes not seen before. `measuring` collapses the
  // grid to a single min-content column, so every Beat reports the width of the
  // hungriest Beat in its Measure: the one number the column count turns on.
  const unmeasured = jobs.filter((job) => job && !minWidths.has(job.shape));
  if (unmeasured.length > 0) {
    for (const job of unmeasured) job.beatsEl.classList.add('measuring');
    for (const job of unmeasured) {
      const beat = job.beatsEl.querySelector('.beat');
      minWidths.set(job.shape, beat ? beat.getBoundingClientRect().width : 0);
    }
    for (const job of unmeasured) job.beatsEl.classList.remove('measuring');
  }

  // Pass 3 — write.
  return jobs.map((job) => {
    if (!job) return 0;
    const cols = balancedColumns(
      job.beatCount,
      job.available,
      minWidths.get(job.shape) ?? 0,
      job.gap
    );
    job.beatsEl.style.setProperty('--beat-cols', String(cols));
    return cols;
  });
}

/** Forget the measured minimums — a resize may have changed the font too. */
export function forgetBeatWidths() {
  minWidths.clear();
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
