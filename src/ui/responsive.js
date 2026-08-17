/**
 * Viewport behaviour: sidebar, library collapse, accordions, playback autoscroll.
 * US-15.1.
 *
 * Three classes, by width:
 *   desktop ≥ 1101px — 300px sidebar column
 *   tablet  768–1100 — 240px sidebar column
 *   mobile  ≤ 767px  — off-canvas drawer, 85vw capped at 320px
 *
 * The breakpoints and sizes are carried over from the predecessor, where they
 * were arrived at by use rather than by theory.
 *
 * Open-or-collapsed is ONE state — `data-library` — meaningful at all three
 * widths (AC-15.1.2, AC-15.1.3, AC-15.1.6). Only the presentation differs:
 * mobile slides a drawer off-canvas, the others drop the column out of the
 * layout. It is deliberately not called `data-drawer` any more, because above
 * mobile there is no drawer for it to describe.
 */

export const BREAKPOINTS = { tablet: 768, desktop: 1101 };
export const SIDEBAR_WIDTH = { desktop: 300, tablet: 240 };
export const DRAWER_MAX_WIDTH = 320;

export function viewportClass(width = window.innerWidth) {
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

export const isMobile = (width = window.innerWidth) => viewportClass(width) === 'mobile';

/**
 * Apply the viewport class to the shell, and optionally open the library.
 *
 * The library opens on EVERY load, at every width, not only the first
 * (AC-15.1.5, AC-15.1.13): it is the reason to open the app, and a musician
 * reaching for their phone mid-practice should not have to find a toggle first.
 * Collapsed is therefore a within-session position and is never stored — an app
 * that remembered it would eventually open with no library and no explanation.
 *
 * A resize passes no flag, so it carries the current state across rather than
 * re-opening the library under the musician.
 */
export function applyViewport(shell, { openLibrary: open = false } = {}) {
  const klass = viewportClass();
  shell.dataset.viewport = klass;

  if (open) shell.dataset.library = 'open';
  else shell.dataset.library ??= 'open';
  return klass;
}

export function openLibrary(shell) {
  shell.dataset.library = 'open';
}

export function collapseLibrary(shell) {
  shell.dataset.library = 'collapsed';
}

export function isLibraryOpen(shell) {
  return shell.dataset.library === 'open';
}

/**
 * Keep the sounding Measure on screen during playback. AC-15.1.11.
 *
 * Without this, vertical Measure stacking means a long Pattern plays out of
 * view — the musician would be watching Measure 1 while hearing Measure 5.
 * Only scrolls when the Measure is actually outside the viewport, so a Pattern
 * that already fits never jitters.
 *
 * The comparison stays against the viewport even though the main panel is the
 * scroll container (AC-15.1.12): the panel is bounded to the viewport height and
 * starts at its top, so the two agree, and `scrollIntoView` walks up to whatever
 * ancestor actually scrolls.
 */
export function scrollMeasureIntoView(gridEl, measureIndex) {
  const measure = gridEl.querySelector(`.measure[data-measure="${measureIndex}"]`);
  if (!measure) return false;

  const rect = measure.getBoundingClientRect();
  const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (fullyVisible) return false;

  measure.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return true;
}

/**
 * Secondary control sections collapse to accordions on mobile and render
 * expanded above it (AC-15.1.7). Primary sections — the grid and the transport
 * — are never collapsible: they are why the app is open.
 */
export function applyAccordions(sections) {
  const mobile = isMobile();
  for (const section of sections) {
    if (section.dataset.primary === 'true') continue;
    section.dataset.accordion = String(mobile);
    if (mobile) {
      // Collapsed by default, and left alone once the musician has opened one.
      section.open = section.dataset.touched === 'true' ? section.open : false;
    } else {
      section.open = true;
    }
  }
}
