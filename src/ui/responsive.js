import { hasHarmony } from '../core/harmony.js';
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
 *
 * The main panel has a layout of its own, keyed on ITS width rather than the
 * viewport's (AC-15.1.18) — see `panelLayout` below.
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
 * Keep the sounding Measure on screen during playback. AC-15.1.11, AC-15.1.18/5.
 *
 * Without this, a long Pattern plays out of view — the musician would be
 * watching Measure 1 while hearing Measure 5. Only scrolls when the Measure is
 * actually outside the box it scrolls in, so a Pattern that already fits never
 * jitters.
 *
 * The box is whatever scrolls the grid: the main panel on a narrow one, which
 * is bounded to the viewport and starts at its top, or the grid pane on a wide
 * one, which starts under the pinned bar (AC-15.1.18). `scrollIntoView` walks
 * up to the same ancestor.
 */
export function scrollMeasureIntoView(gridEl, measureIndex) {
  const measure = gridEl.querySelector(`.measure[data-measure="${measureIndex}"]`);
  if (!measure) return false;

  const rect = measure.getBoundingClientRect();
  const box = scrollContainerOf(measure, null)?.getBoundingClientRect();
  const top = box?.top ?? 0;
  const bottom = box?.bottom ?? window.innerHeight;
  const fullyVisible = rect.top >= top && rect.bottom <= bottom;
  if (fullyVisible) return false;

  measure.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return true;
}

/**
 * The Pattern actions section collapses to an accordion on mobile and renders
 * expanded above it (AC-15.1.7/5). Primary sections — the grid and the
 * transport — are never collapsible: they are why the app is open.
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

/**
 * The workbench (AC-15.1.7): four groups named for the job, one on screen at a
 * time at every width, chosen by a tab bar. Where the bar and the groups SIT —
 * under the grid, or beside it on a wide panel (AC-15.1.18) — is the panel
 * layout's business, below; nothing here checks a width.
 */
export const WORKBENCH_TABS = [
  ['melody', 'Melody'],
  ['rhythm', 'Rhythm'],
  ['practice', 'Practice'],
  ['compose', 'Compose'],
];

/**
 * The tab in force: the one the musician chose, or the Mode's own — Melody on
 * a Melodic Pattern, Rhythm on a Percussive one (AC-15.1.7/3). A chosen Melody
 * tab on a Pattern that has since gone Percussive falls back the same way, so
 * the screen is never left showing nothing.
 */
export function workbenchTabFor(pattern, chosen, offered = WORKBENCH_TABS.map(([tab]) => tab)) {
  const melodic = pattern.soundMode === 'melodic';
  // Compose needs a progression as well as the Mode (AC-18.1.1/1).
  const composable = melodic && hasHarmony(pattern);
  // A tab is on offer when the goal names it (AC-14.1.2/1) and the Pattern
  // can use it: Melody and Compose are absent in Percussive, Compose also
  // without a progression (AC-15.1.7/4).
  const applies = (tab) =>
    offered.includes(tab) && (tab === 'melody' ? melodic : tab === 'compose' ? composable : true);
  if (chosen && applies(chosen)) return chosen;
  // The Mode's own group first — Melody on a Melodic Pattern, Rhythm on a
  // Percussive one (AC-15.1.7/3) — then the rest in AC-15.1.8's order.
  const preferred = melodic
    ? ['melody', 'rhythm', 'practice', 'compose']
    : ['rhythm', 'practice', 'melody', 'compose'];
  return preferred.find(applies) ?? null;
}

/**
 * Mark the tab bar and the groups with the tab in force. The Melody tab is
 * absent, not disabled, on a Percussive Pattern (AC-15.1.7/4), matching the
 * group it opens (AC-2.2.13).
 */
export function applyWorkbench(tabsEl, groups, active) {
  for (const tab of tabsEl.querySelectorAll('[data-tab]')) {
    // A tab is absent exactly when its group is (AC-15.1.7/4): Melody and
    // Compose on a Percussive Pattern, Compose on one without a progression.
    tab.hidden = Boolean(groups.find((g) => g.dataset.tab === tab.dataset.tab)?.hidden);
    tab.setAttribute('aria-selected', String(tab.dataset.tab === active));
  }
  for (const group of groups) group.dataset.tabActive = String(group.dataset.tab === active);
}

/**
 * The main panel's own layout (AC-15.1.18), by its width and not the
 * viewport's:
 *
 *   wide   ≥ 1024px — two panes side by side under the pinned bar, the grid on
 *                     the left and the tabbed workbench on the right, each
 *                     scrolling on its own; the panel itself never scrolls
 *   narrow <  1024px — one column, the workbench tabbed under the grid, and the
 *                     panel scrolls as one (AC-15.1.12)
 *
 * Its width and not the viewport's because the library takes 240–300px beside
 * it: the same window is wide enough for two panes with the library collapsed
 * and not with it open, and collapsing fires no resize event.
 *
 * 1024 is the narrowest panel whose grid pane still holds a plain 4/4 Measure
 * on one line — a 548px box beside the workbench pane's 400px floor (the pane's
 * width is the CSS's, `--workbench-col`). A tablet in landscape with the
 * library collapsed is above it; one in portrait is not.
 */
export const WIDE_PANEL_MIN = 1024;

export function panelLayout(panelWidth) {
  return panelWidth >= WIDE_PANEL_MIN ? 'wide' : 'narrow';
}

/** Mark the panel with the layout its current width calls for. */
export function applyPanelLayout(main, width = main.clientWidth) {
  const layout = panelLayout(width);
  main.dataset.layout = layout;
  return layout;
}

/**
 * Re-mark the panel whenever its width changes — the window resizing, or the
 * library taking or giving back its column (AC-15.1.18/4). Height changes are
 * ignored: the layout changes the panel's content height, and reacting to that
 * would loop.
 */
export function observePanelWidth(main) {
  if (typeof ResizeObserver === 'undefined') return null;
  let lastWidth = null;
  const observer = new ResizeObserver(() => {
    const width = main.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    applyPanelLayout(main, width);
  });
  observer.observe(main);
  return observer;
}

/**
 * The element that scrolls `el`: the nearest ancestor with a scrolling
 * overflow, stopping at `fallback`. On a wide panel that is the pane the
 * control sits in; on a narrow one the panes do not scroll and it is the panel
 * itself (AC-15.1.16/3 puts a control back where it was by moving whichever
 * of them actually moved).
 */
export function scrollContainerOf(el, fallback) {
  let node = el?.parentElement ?? null;
  while (node && node !== fallback) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return fallback;
}
