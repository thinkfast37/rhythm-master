/**
 * Viewport behaviour: sidebar, drawer, accordions, playback autoscroll.
 * US-15.1.
 *
 * Three classes, by width:
 *   desktop ≥ 1101px — persistent 300px sidebar
 *   tablet  768–1100 — persistent 240px sidebar
 *   mobile  ≤ 767px  — off-canvas drawer, 85vw capped at 320px
 *
 * The breakpoints and sizes are carried over from the predecessor, where they
 * were arrived at by use rather than by theory.
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
 * Apply the viewport class to the shell and open the drawer if we have just
 * arrived at mobile width.
 *
 * The drawer auto-opens on EVERY load at mobile width, not only the first
 * (AC-15.1.5): the library is the reason to open the app, and a musician
 * reaching for their phone mid-practice should not have to find a toggle first.
 */
export function applyViewport(shell, { openDrawerOnMobile = false } = {}) {
  const klass = viewportClass();
  shell.dataset.viewport = klass;

  if (klass === 'mobile') {
    if (openDrawerOnMobile) shell.dataset.drawer = 'open';
    else shell.dataset.drawer ??= 'closed';
  } else {
    // Above mobile the sidebar is a column, never a drawer, so any drawer state
    // is meaningless and is cleared rather than left to leak back on resize.
    delete shell.dataset.drawer;
  }
  return klass;
}

export function openDrawer(shell) {
  if (viewportClass() === 'mobile') shell.dataset.drawer = 'open';
}

export function closeDrawer(shell) {
  if (viewportClass() === 'mobile') shell.dataset.drawer = 'closed';
}

export function isDrawerOpen(shell) {
  return shell.dataset.drawer === 'open';
}

/**
 * Keep the sounding Measure on screen during playback. AC-15.1.11.
 *
 * Without this, vertical Measure stacking means a long Pattern plays out of
 * view — the musician would be watching Measure 1 while hearing Measure 5.
 * Only scrolls when the Measure is actually outside the viewport, so a Pattern
 * that already fits never jitters.
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
