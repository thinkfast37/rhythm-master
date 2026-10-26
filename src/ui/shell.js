/**
 * The app shell (research.md D-018, phase 2): one frame shared by every goal
 * (AC-15.1.20) — the sidebar, the pinned bar with the goal strip under it,
 * the rhythm band, one work surface, the Composer's panel, the goals screen —
 * and the per-render pass that fills them.
 *
 * Nothing here owns state: `ctx` hands in the state object, the handlers and
 * the few functions the render pass reads from the container (`subscribe`,
 * `render`, `libraryEntries`, `familyMembers`, `canUndo`, `fillLabel`,
 * `storeSignature`). Rendering stays a pure function of the Pattern and the
 * transport position (FR-013).
 */
import { automaticTags } from '../core/pattern.js';
import { surfaceFor } from '../core/goals.js';
import { buildScore } from '../core/notation.js';
import { renderGrid, renderChordStrip, moveCursor } from './grid.js';
import { balanceBeatLines, forgetBeatWidths, observeGridWidth } from './beat-layout.js';
import {
  renderHeader,
  renderPlayControls,
  renderMelodyGroup,
  renderRhythmGroup,
  renderPracticeGroup,
  renderPracticePanel,
  renderBrushHint,
  renderFamilyMembers,
  renderActionControls,
  heldControl,
} from './controls.js';
import {
  applyViewport,
  applyAccordions,
  applyWorkbench,
  workbenchTabFor,
  applyPanelLayout,
  observePanelWidth,
  scrollContainerOf,
  WORKBENCH_TABS,
  collapseLibrary,
  openLibrary,
  isLibraryOpen,
  scrollMeasureIntoView,
} from './responsive.js';
import { renderComposeGroup } from './compose.js';
import { renderGoals, renderGoalStrip } from './goals.js';
import { placeHelp } from './help.js';
import { renderLibrary } from './library.js';
import { renderScore } from './score.js';
import { renderComposer, moveComposerCursor } from './composer.js';

/** Every field of the library memo key, compared without building a string. */
function sameLibrarySignature(a, b) {
  return (
    a !== null &&
    a.patterns === b.patterns &&
    a.overlays === b.overlays &&
    a.query === b.query &&
    a.minRating === b.minRating &&
    a.tags === b.tags &&
    a.currentId === b.currentId
  );
}

/** A plain button for the pinned bar, built once. */
function barButton(className, action, text) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.dataset.action = action;
  b.textContent = text;
  return b;
}

/**
 * Build the app shell.
 *
 * The frame (AC-15.1.20): the pinned bar — ‹ Goals, Library, Related,
 * Play/Stop with the tempo entry, Prev/Next — with the goal strip as its
 * second row; then the rhythm band — Pattern header, chord strip, the grid or
 * the sheet with the View control at its head and the brush line under it;
 * then one work surface — the tabbed workbench, Pattern actions and the family
 * members under Lab and the making goals, the settings rail under Practise a
 * rhythm. The order is AC-15.1.8's and does not vary by viewport: DOM order is
 * the priority order.
 */
export function mountShell(root, ctx) {
  const { state, handlers, subscribe, render, libraryEntries, familyMembers, canUndo, fillLabel, storeSignature } = ctx;
  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'shell';

  // --- sidebar (library) ---
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  const libraryEl = document.createElement('div');
  sidebar.appendChild(libraryEl);

  /*
   * The one way back to a collapsed library, at every width (AC-15.1.13). It is
   * sticky within the main panel rather than merely first in it, so a musician
   * who has scrolled down to the edit controls can still reach it.
   */
  const libraryToggle = barButton('library-toggle', 'toggle-library', 'Library');
  const syncLibraryToggle = () => {
    const open = isLibraryOpen(shell);
    libraryToggle.textContent = open ? 'Close Library' : 'Library';
    libraryToggle.setAttribute('aria-expanded', String(open));
  };
  libraryToggle.addEventListener('click', () => {
    if (isLibraryOpen(shell)) collapseLibrary(shell);
    else openLibrary(shell);
    syncLibraryToggle();
  });

  const scrim = document.createElement('div');
  scrim.className = 'drawer-scrim';
  scrim.addEventListener('click', () => {
    collapseLibrary(shell);
    syncLibraryToggle();
  });

  // --- the pinned bar's own controls (AC-15.1.20/1) ---

  // The way back to the goals screen, first in the bar under every goal, Lab
  // included (AC-14.1.1/3).
  const goalsButton = barButton('goals-button', 'show-goals', '');
  // The word is dropped at phone width, as the navigation's are (AC-15.1.17/3).
  const goalsWord = document.createElement('span');
  goalsWord.className = 'goals-word';
  goalsWord.textContent = ' Goals';
  goalsButton.append('\u2039', goalsWord);
  goalsButton.setAttribute('aria-label', 'Goals');
  goalsButton.setAttribute('title', 'Back to the goals screen');
  goalsButton.addEventListener('click', () => handlers.onShowGoals?.());

  // Related: the family of the rhythm on screen, from the bar. A placeholder
  // until Share and tidy up lands (D-018 phase 7): present where it will live,
  // disabled, and saying so, rather than a control that appears later in a
  // place nothing prepared the eye for.
  const relatedButton = barButton('related-button', 'show-related', 'Related');
  relatedButton.disabled = true;
  relatedButton.setAttribute('aria-disabled', 'true');
  relatedButton.setAttribute('title', 'Related rhythms — coming with Share and tidy up');

  // --- main panel, in priority order ---
  const main = document.createElement('main');
  main.className = 'main-panel';

  const headerEl = document.createElement('header');
  // The progression, above the grid it governs, so Now and Next are read in
  // the same glance as the Measure being played (AC-2.6.7/1). Empty and hidden
  // without a progression.
  const chordStripEl = document.createElement('section');
  chordStripEl.dataset.section = 'chords';
  chordStripEl.dataset.primary = 'true';
  /*
   * The grid section holds the grid or the sheet music in its place, chosen by
   * the View control at its head (AC-12.2.1). One section, so the fixed order
   * of AC-15.1.8 is unchanged by which of the two it shows.
   */
  const viewEl = document.createElement('div');
  viewEl.className = 'pattern-view';
  const viewBar = document.createElement('div');
  viewBar.className = 'view-toggle';
  viewBar.setAttribute('role', 'group');
  viewBar.setAttribute('aria-label', 'Pattern view');
  for (const [view, label] of [
    ['grid', 'Grid'],
    ['sheet', 'Sheet'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'view-button';
    b.dataset.action = `view-${view}`;
    b.dataset.view = view;
    b.textContent = label;
    b.addEventListener('click', () => handlers.onPatternView(view));
    viewBar.appendChild(b);
  }
  // Note aids: names and colours on the melodic score, a toggle shown only
  // while Sheet shows a Melodic Pattern (AC-12.3.1/1).
  const aidsButton = document.createElement('button');
  aidsButton.type = 'button';
  aidsButton.className = 'aids-button';
  aidsButton.dataset.action = 'sheet-aids';
  aidsButton.textContent = 'Note aids';
  aidsButton.addEventListener('click', () => handlers.onSheetAids(!state.settings.sheetAids));
  viewBar.appendChild(aidsButton);
  const printButton = document.createElement('button');
  printButton.type = 'button';
  printButton.className = 'print-button';
  printButton.dataset.action = 'print-score';
  printButton.textContent = 'Print / PDF';
  printButton.addEventListener('click', () => handlers.onPrintScore());
  viewBar.appendChild(printButton);
  const gridEl = document.createElement('div');
  const scoreEl = document.createElement('div');
  scoreEl.className = 'score';
  viewEl.append(viewBar, gridEl, scoreEl);
  // The brush line, directly under the grid it describes (AC-1.3.12). The two
  // strips it reports on live in different groups, and on a phone only one
  // group is on screen at a time, so it cannot sit in either.
  const brushEl = document.createElement('p');
  viewEl.appendChild(brushEl);

  // The transport rides in the pinned bar (AC-15.1.17), reached from any scroll
  // offset — on a four-bar Pattern it sat below the fold of a phone.
  const playEl = document.createElement('section');
  playEl.dataset.primary = 'true';
  playEl.dataset.section = 'play';

  /*
   * The workbench (AC-15.1.7, AC-15.1.8): four groups named for the job —
   * Melody, Rhythm, Practice, Compose — one on screen at a time, chosen by the
   * tab bar, at every width. Melody is absent, not empty, on a Percussive
   * Pattern (AC-2.2.13). It is what Lab and the making goals put on the work
   * surface (AC-15.1.20/4).
   */
  const tabsEl = document.createElement('nav');
  tabsEl.className = 'workbench-tabs';
  tabsEl.setAttribute('role', 'tablist');
  tabsEl.setAttribute('aria-label', 'Workbench');
  for (const [tab, label] of WORKBENCH_TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'workbench-tab';
    b.setAttribute('role', 'tab');
    b.dataset.action = `tab-${tab}`;
    b.dataset.tab = tab;
    b.textContent = label;
    b.addEventListener('click', () => handlers.onWorkbenchTab(tab));
    tabsEl.appendChild(b);
  }
  const group = (tab) => {
    const section = document.createElement('section');
    section.dataset.section = tab;
    section.dataset.tab = tab;
    return section;
  };
  const melodyEl = group('melody');
  const rhythmEl = group('rhythm');
  const practiceEl = group('practice');
  const composeEl = group('compose');

  const actionsEl = document.createElement('details');
  actionsEl.dataset.section = 'actions';
  const actionsSummary = document.createElement('summary');
  actionsSummary.textContent = 'Pattern actions';
  const actionsBody = document.createElement('div');
  actionsEl.append(actionsSummary, actionsBody);
  actionsEl.addEventListener('toggle', () => {
    actionsEl.dataset.touched = 'true';
  });

  const familyEl = document.createElement('section');
  familyEl.dataset.section = 'family';

  /*
   * Prev/Next lives in the pinned bar at the top of the main panel, at its
   * right, rather than at the panel's foot (AC-5.5.3). Stepping to the next
   * rhythm is the gesture a practice run repeats most, and at the foot it cost
   * a scroll past the whole grid and every accordion first.
   *
   * One control, not one at each end: two bars would have to agree about their
   * state, and the toggle is already pinned here for the same reason.
   */
  const navEl = document.createElement('nav');
  navEl.className = 'pattern-nav';
  for (const direction of ['previous', 'next']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nav-button';
    b.dataset.action = direction === 'previous' ? 'prev-pattern' : 'next-pattern';
    // The word is dropped at phone width, where the bar also holds the
    // transport; the glyph alone is the control there.
    const word = document.createElement('span');
    word.className = 'nav-word';
    word.textContent = direction === 'previous' ? 'Prev' : 'Next';
    if (direction === 'previous') b.append('‹ ', word);
    else b.append(word, ' ›');
    b.addEventListener('click', () => handlers.onNavigate(direction));
    navEl.appendChild(b);
  }

  /*
   * The pinned bar (AC-15.1.17, AC-15.1.20/1): identical under every goal —
   * ‹ Goals, Library, Related, Play/Stop with the tempo entry, Prev/Next —
   * with the goal strip as its second row (AC-15.1.20/2): the goal's name and
   * its own quick controls, reached from any scroll offset like the transport
   * above them.
   */
  const topBarEl = document.createElement('div');
  topBarEl.className = 'main-top-bar';
  const stripEl = document.createElement('div');
  topBarEl.append(goalsButton, libraryToggle, relatedButton, playEl, navEl, stripEl);

  // The goals screen (AC-14.1.1): stands in for the library and the main
  // panel together while open, so it is a child of the shell beside them.
  const goalsEl = document.createElement('section');

  /*
   * The frame's two parts under the pinned bar (AC-15.1.20/3, /4): the rhythm
   * band — header, chord strip, grid or sheet — across the panel's full width,
   * and one work surface under it — tab bar, groups, actions, family, or the
   * goal's own rail. On a wide panel each scrolls on its own (AC-15.1.18); on
   * a narrow one they are plain blocks and the panel scrolls as one. The order
   * AC-15.1.8 fixes is the same list either way.
   *
   * `pane-pattern` and `pane-workbench` are kept as second names for the
   * criteria the frame does not revise in this phase — the Composer's
   * AC-19.1.1, the column of AC-15.2.8 — whose tests reach the two by them.
   * D-018 phase 9 drops them.
   */
  const bandEl = document.createElement('div');
  bandEl.className = 'rhythm-band pane pane-pattern';
  bandEl.append(headerEl, chordStripEl, viewEl);
  const surfaceEl = document.createElement('div');
  surfaceEl.className = 'work-surface pane pane-workbench';
  surfaceEl.append(tabsEl, melodyEl, rhythmEl, practiceEl, composeEl, actionsEl, familyEl);
  // The Composer's panel stands in for the band and the surface while its mode
  // is in force (AC-19.1.1/2); empty and hidden otherwise, so none of its
  // controls can be found in Practice.
  const composerEl = document.createElement('section');
  composerEl.className = 'composer-panel';
  composerEl.dataset.section = 'composer';
  composerEl.hidden = true;
  main.append(topBarEl, bandEl, surfaceEl, composerEl);
  shell.append(goalsEl, sidebar, scrim, main);
  root.appendChild(shell);
  // In the tree now, so the panel has a width to be laid out by (AC-15.1.18).
  applyPanelLayout(main);
  observePanelWidth(main);
  // The pinned bar's height, for the autoscroll to clear (AC-15.1.11): two
  // rows with the goal strip, and its wrapping depends on the width.
  const measurePinned = () => main.style.setProperty('--pinned-height', `${topBarEl.offsetHeight}px`);
  measurePinned();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measurePinned).observe(topBarEl);

  // Delegated rather than bound per Slot, so a re-render cannot leave stale
  // listeners behind.
  gridEl.addEventListener('click', (event) => {
    // Under Practise a rhythm the grid is looked at and played, never edited
    // (AC-14.1.5/1): no accent, no stamp, no Time Signature prompt.
    if (surfaceFor(state.settings.goal).readOnly) return;
    /*
     * An armed Recipe turns the grid into a Recipe brush: a tap anywhere within a
     * Beat gives that Beat the armed subdivision (AC-1.3.11/2). Checked before the
     * per-Slot actions, because the Slot is what the tap actually lands on and the
     * Beat is what the gesture means while a Recipe is armed.
     *
     * Unarmed, this is inert and the grid behaves exactly as before (AC-1.3.11/1).
     */
    const beatEl = event.target.closest('.beat');
    if (state.armedRecipe && beatEl) {
      const measureEl = beatEl.closest('.measure');
      handlers.onRecipe(
        state.armedRecipe,
        Number(measureEl.dataset.measure),
        Number(beatEl.dataset.beat)
      );
      return;
    }

    const target = event.target.closest('[data-action]');
    if (!target) return;
    const m = Number(target.dataset.measure);
    const b = Number(target.dataset.beat);
    const s = Number(target.dataset.slot);
    if (target.dataset.action === 'cycle-accent') {
      handlers.onSlotTap(m, b, s);
    } else if (target.dataset.action === 'stamp-pitch') {
      handlers.onStampPitch(m, b, s);
    } else if (target.dataset.action === 'change-time-signature') {
      handlers.onTimeSignature(m);
    }
  });

  // The composing grid's two boxes per Slot (AC-19.5.1), delegated like the grid's.
  composerEl.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const m = Number(target.dataset.measure);
    const b = Number(target.dataset.beat);
    const sl = Number(target.dataset.slot);
    if (target.dataset.action === 'select-note') handlers.onComposerSelect(m, b, sl);
    else if (target.dataset.action === 'cycle-syllable') handlers.onComposerSyllable(m, b, sl);
  });

  // The Delete and Backspace keys do what the Delete control does (AC-19.4.3/3),
  // unless the musician is typing or a dialog is up.
  document.addEventListener('keydown', (event) => {
    if (state.composer.mode !== 'composer' || !state.composer.draft) return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
    if (document.querySelector('.dialog')) return;
    event.preventDefault();
    handlers.onComposerDelete();
  });

  // The keyboard lays itself out to the width it has (AC-19.3.2), and follows a change of it.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const width = composerEl.clientWidth;
      if (width === state.composer.widthPx) return;
      state.composer.widthPx = width;
      if (state.composer.mode === 'composer') render();
    }).observe(composerEl);
  }

  /*
   * Anything that loads a Pattern into the main panel collapses the library, at
   * every width, so the musician sees what just happened instead of keeping a
   * column of the list they have finished with (AC-15.1.6).
   *
   * The rule is "did this change what the main panel shows", not "was this a
   * particular button" — searching, filtering, rating and tagging all leave the
   * library open, because you are still working in it.
   *
   * The main panel goes back to its top with it: the panel keeps its own scroll
   * offset now (AC-15.1.12), and an offset chosen for the previous Pattern means
   * nothing for this one.
   */
  const LOADS_A_PATTERN = ['open-pattern', 'new-pattern'];
  sidebar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (LOADS_A_PATTERN.includes(action)) {
      collapseLibrary(shell);
      syncLibraryToggle();
      // Whichever of them scrolls in the layout in force (AC-15.1.18).
      appScrolled();
      for (const el of [main, bandEl, surfaceEl]) el.scrollTop = 0;
    }
  });

  applyViewport(shell, { openLibrary: true });
  syncLibraryToggle();
  applyAccordions([actionsEl]);
  window.addEventListener('resize', () => {
    applyViewport(shell);
    applyPanelLayout(main);
    syncLibraryToggle();
    applyAccordions([actionsEl]);
    // A resize can change the font the Slots lay out in as well as the room they
    // have, so the measured minimums go with it (AC-15.1.14/5).
    forgetBeatWidths();
    balanceBeatLines(gridEl);
  });

  // The library opening or collapsing changes the grid's width without a resize
  // event, so the element is watched rather than the window (AC-15.1.14/5).
  observeGridWidth(gridEl);
  // The score is laid out to its width, so it follows the same changes (AC-12.2.10).
  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = 0;
    new ResizeObserver(() => {
      if (scoreEl.hidden || scoreEl.clientWidth === lastWidth) return;
      lastWidth = scoreEl.clientWidth;
      render();
    }).observe(scoreEl);
  }

  /*
   * Hands on the main panel mean the view belongs to the musician, not to the
   * playback autoscroll (AC-15.1.16/2) — and it stays theirs for the rest of
   * the playback run, not for a fixed window. Adjusting a tempo or a melody
   * while listening takes as long as it takes; any timer is a guess that
   * expires mid-experiment, and the loop back to Measure 1 (AC-15.1.11) then
   * hauls the view to the top of the Pattern.
   *
   * Captured, so it sees the interaction whatever the control does with the
   * event. The Play button is itself on the panel, so pressing it sets this —
   * which is why the run transition below clears it: the render Play triggers
   * runs after the pointerdown that started it, restoring hands-off tracking.
   */
  let autoscrollStoodDown = false;
  const noteInteraction = () => {
    autoscrollStoodDown = true;
  };
  for (const type of ['pointerdown', 'input', 'keydown', 'wheel', 'touchstart']) {
    main.addEventListener(type, noteInteraction, true);
  }

  /*
   * The view having moved is the real signal, not any particular input
   * (AC-15.1.16/9). The listeners above are the gestures a browser reports as
   * input, and a finger drag happens to raise `pointerdown` before it scrolls —
   * which is why /2 passed everywhere it was checked. A scroll that raises no
   * input event at all does not: momentum carrying on after the finger lifts,
   * and whatever iOS does in a Home-Screen app, where this was reported still
   * standing. So the panel scrolling is itself the stand-down: if the view moved
   * and the app did not move it, the musician did.
   *
   * On `window`, because `scroll` does not bubble and the scrolling element
   * differs by layout — the panel at narrow widths, the band or the surface
   * when wide (AC-15.1.18), the document if a browser scrolls that instead.
   * Capture sees them all, and the target check keeps the library's own
   * scrolling out of it.
   */
  let appScrollUntil = 0;
  /*
   * Scrolls the app performs are not the musician's: the autoscroll itself, the
   * height compensation (AC-15.1.16/3), the reset on loading a Pattern
   * (AC-15.1.12). Without this the autoscroll's first scroll would stand the
   * autoscroll down, and hands-off tracking (AC-15.1.11) would never survive
   * one. The window covers a smooth scroll's animation, which keeps raising
   * events long after the call that started it; a real gesture inside that
   * window still stands down through the input listeners above, which no
   * programmatic scroll can raise.
   */
  const APP_SCROLL_MS = 900;
  const appScrolled = () => {
    appScrollUntil = performance.now() + APP_SCROLL_MS;
  };
  window.addEventListener(
    'scroll',
    (event) => {
      if (performance.now() < appScrollUntil) return;
      const target = event.target;
      const ours =
        target === document ||
        target === document.scrollingElement ||
        (target instanceof Node && main.contains(target));
      if (ours) autoscrollStoodDown = true;
    },
    true
  );
  let wasPlaying = false;
  /** Memo keys for the two lists that are expensive and rarely change. */
  let lastLibrarySignature = null;
  let lastFamilySignature = null;

  /*
   * Keep what is sounding on screen (AC-15.1.11) — unless the musician has
   * touched the panel during this run (AC-15.1.16/2). Shared by both render
   * paths, because the cursor moving is exactly when it has work to do.
   */
  const followCursor = (position) => {
    if (!position || gridEl.hidden || autoscrollStoodDown) return;
    // Only when it actually scrolls. Playback renders on every sounding event
    // and the sounding Measure is usually already in view, so marking every
    // render as an app scroll would hold the window permanently open and the
    // musician's own scrolling would never be seen (AC-15.1.16/9).
    if (scrollMeasureIntoView(gridEl, position.measureIndex)) appScrolled();
  };

  subscribe((pattern, position, s, kind) => {
    /*
     * The cursor path (see `render`): the highlight moving within a pass. The
     * grid keeps its DOM and one class moves; the chord strip is redrawn
     * because the chord in force is marked per Measure, and it is one small
     * row. Everything else — header, control groups, workbench, library,
     * Family — cannot have changed, so it is not touched.
     *
     * No anchor bookkeeping either: that exists to put the view back when a
     * render changes the height of what is above the operated control
     * (AC-15.1.16/3), and this render changes no heights. Reading
     * getBoundingClientRect here would force a synchronous layout on every
     * sounding event for nothing.
     */
    if (kind === 'cursor') {
      // In the Composer the cursor runs in the composing grid (AC-19.6.1/1).
      if (s.composer.mode === 'composer') {
        moveComposerCursor(composerEl, position);
        return;
      }
      if (s.settings.patternView === 'sheet') {
        renderScore(scoreEl, buildScore(pattern, { countingSystem: s.settings.countingSystem, fill: fillLabel() }), {
          width: scoreEl.clientWidth || main.clientWidth || 680,
          transportPosition: position,
          aids: s.settings.sheetAids,
        });
      } else {
        moveCursor(gridEl, position);
      }
      renderChordStrip(chordStripEl, pattern, position);
      followCursor(position);
      return;
    }

    // Where the operated control sits on screen, so the view can be put back if
    // this render changes the height of what is above it (AC-15.1.16/3). Touch
    // moves no focus onto a slider, so the pointer-held control is the anchor
    // when nothing in the panel holds focus (AC-15.1.16/5).
    const focused = document.activeElement;
    const held = heldControl();
    const anchorEl =
      focused && focused !== document.body && main.contains(focused)
        ? focused
        : held && main.contains(held)
          ? held
          : null;
    const anchor = anchorEl ? { el: anchorEl, top: anchorEl.getBoundingClientRect().top } : null;
    // The header needs the same Tag breakdown the library computes, so the two
    // cannot disagree about what is removable.
    const entry = libraryEntries().find((e) => e.pattern.id === pattern.id);
    const currentTags = entry
      ? { autoTags: entry.autoTags, lockedTags: entry.lockedTags, userTags: entry.userTags }
      : { autoTags: automaticTags(pattern, s.isOwned), lockedTags: [], userTags: pattern.tags ?? [] };

    // The goals screen in place of everything else while it is open
    // (AC-14.1.1/1); the goal strip otherwise.
    shell.dataset.goals = s.goalsOpen ? 'open' : 'closed';
    renderGoals(goalsEl, s, handlers);
    renderGoalStrip(stripEl, s, handlers);
    // The pinned bar's ?s on the parts built once; the rebuilt parts place
    // their own (AC-14.1.3/3).
    placeHelp(topBarEl, 'bar', s, ['Goals', 'Library', 'Related']);
    placeHelp(navEl, 'bar', s, ['Prev / Next']);
    // What the goal offers (AC-14.1.2): the groups, Pattern actions and the
    // family members it has a use for. Lab offers everything (AC-14.1.3/1).
    // Practise a rhythm offers none of it and edits nothing (AC-14.1.5).
    const surface = surfaceFor(s.settings.goal);
    shell.dataset.readonly = String(surface.readOnly);
    // The frame's proportion (AC-15.1.20/5): Playback under Practise, where
    // the music takes the room; Design elsewhere, where the tools do.
    main.dataset.frame = surface.layout;
    // Practice or Composer (AC-19.1.1): the shell carries the mode so the band
    // and the surface and the Composer's panel can stand in for each other.
    shell.dataset.mode = s.composer.mode;
    if (!state.composer.widthPx && composerEl.clientWidth) state.composer.widthPx = composerEl.clientWidth;
    // While a variation is auditioned the Composer's grid shows the candidate
    // in the draft's place; the picker is modal, so nothing can edit it (AC-10.3.1/7).
    renderComposer(
      composerEl,
      s.variationCandidate && s.composer.mode === 'composer' ? { ...s, composer: { ...s.composer, draft: s.variationCandidate, selected: null, target: null } } : s,
      handlers
    );

    renderHeader(headerEl, pattern, { ...s, canUndo: canUndo(), currentTags, readOnly: surface.readOnly }, handlers);
    renderChordStrip(chordStripEl, pattern, position);
    const sheet = s.settings.patternView === 'sheet';
    for (const b of viewBar.querySelectorAll('.view-button')) {
      b.setAttribute('aria-pressed', String((b.dataset.view === 'sheet') === sheet));
      b.classList.toggle('on', (b.dataset.view === 'sheet') === sheet);
    }
    printButton.hidden = !sheet;
    // The aids toggle belongs to the melodic score alone (AC-12.3.1/1, /4).
    const aidsShown = sheet && pattern.soundMode === 'melodic';
    aidsButton.hidden = !aidsShown;
    aidsButton.setAttribute('aria-pressed', String(Boolean(s.settings.sheetAids)));
    aidsButton.classList.toggle('on', Boolean(s.settings.sheetAids));
    gridEl.hidden = sheet;
    scoreEl.hidden = !sheet;
    // The brush line describes grid taps; the score takes none (AC-12.2.9),
    // and neither does Practise a rhythm's grid (AC-14.1.5/1).
    brushEl.hidden = sheet || surface.readOnly;
    if (sheet) {
      // Read-only, from the same Pattern and position the grid renders from
      // (AC-12.2.1/4, AC-12.2.9); laid out to the width it has (AC-12.2.10).
      renderScore(scoreEl, buildScore(pattern, { countingSystem: s.settings.countingSystem, fill: fillLabel() }), {
        width: scoreEl.clientWidth || main.clientWidth || 680,
        transportPosition: position,
        aids: s.settings.sheetAids,
      });
    } else {
      renderGrid(gridEl, pattern, position, {
        countingSystem: s.settings.countingSystem,
        recipeArmed: Boolean(s.armedRecipe),
      });
      // Immediately after the render that built the Beats, and before this task
      // yields to paint, so the one-line fallback is never seen (AC-15.1.14).
      balanceBeatLines(gridEl);
    }
    renderBrushHint(brushEl, pattern, s);
    renderPlayControls(playEl, pattern, s, handlers);
    renderMelodyGroup(melodyEl, pattern, s, handlers);
    renderRhythmGroup(rhythmEl, pattern, s, handlers);
    if (surface.readOnly) {
      // The settings rail stands in the Practice group's place (AC-14.1.5/3):
      // the one section of the workbench Practise a rhythm shows, so the
      // section order AC-15.1.8 fixes is unchanged. Click and Count-in are in
      // the strip (AC-14.1.5/4); the rail holds the rest.
      renderPracticePanel(
        practiceEl,
        pattern,
        s,
        handlers,
        surface.panel.filter((item) => item !== 'click')
      );
    } else {
      renderPracticeGroup(practiceEl, pattern, s, handlers);
    }
    renderComposeGroup(composeEl, pattern, s, handlers);
    renderActionControls(actionsBody, pattern, s, handlers);
    // A group the goal has no use for is absent, exactly as Melody already is
    // in Percussive: the renderers above decide whether the Pattern can use a
    // group, and the goal decides whether it is offered at all (AC-14.1.2/1).
    const groups = [melodyEl, rhythmEl, practiceEl, composeEl];
    for (const g of groups) {
      const usable = g === rhythmEl || g === practiceEl ? true : !g.hidden;
      g.hidden = !usable || !surface.tabs.includes(g.dataset.tab);
    }
    applyWorkbench(tabsEl, groups, workbenchTabFor(pattern, s.workbenchTab, surface.tabs));
    // No workbench at all under Practise a rhythm: the tab bar goes, and the
    // rail is on screen in the Practice group's place.
    tabsEl.hidden = surface.readOnly;
    if (surface.readOnly) {
      practiceEl.hidden = false;
      practiceEl.dataset.tabActive = 'true';
    }
    actionsEl.hidden = !surface.actions;
    /*
     * The library list is the most expensive thing on the page — three hundred
     * rows, rebuilt from scratch — and almost every render leaves it identical:
     * changing the tempo, arming a Recipe, crossing a pass boundary. Skip it
     * when nothing it draws from has changed.
     *
     * The signature is the two stores' RAW strings plus the view state. Raw
     * rather than parsed, so the check costs a string comparison instead of the
     * work it is trying to avoid; a write from anywhere changes the string, so
     * this cannot go stale. `libraryEntries()` is inside the guard because
     * building the entries is itself most of the cost.
     */
    const librarySignature = {
      ...storeSignature(),
      query: s.view.query,
      minRating: s.view.minRating,
      tags: s.view.tags.join('\u0000'),
      currentId: s.view.currentId,
    };
    if (!sameLibrarySignature(lastLibrarySignature, librarySignature)) {
      lastLibrarySignature = librarySignature;
      renderLibrary(libraryEl, libraryEntries(), s.view, handlers);
    }

    // The Family list reads the owned-Pattern store and the current Pattern's
    // family, so it turns over on that same string plus which Pattern is loaded.
    if (
      lastFamilySignature === null ||
      lastFamilySignature.patterns !== librarySignature.patterns ||
      lastFamilySignature.id !== pattern.id ||
      lastFamilySignature.offered !== surface.family
    ) {
      lastFamilySignature = { patterns: librarySignature.patterns, id: pattern.id, offered: surface.family };
      renderFamilyMembers(familyEl, familyMembers(), handlers);
      // Absent under a goal that has no use for it (AC-14.1.2/4).
      if (!surface.family) familyEl.hidden = true;
    }

    // The render moved the focused control — the pitch strip appearing above
    // it, say — so move the panel's scroll with it, as far as it can go, and
    // the control stays put on screen (AC-15.1.16/3).
    if (anchor && anchor.el.isConnected) {
      const delta = anchor.el.getBoundingClientRect().top - anchor.top;
      if (delta !== 0) {
        appScrolled();
        scrollContainerOf(anchor.el, main).scrollTop += delta;
      }
    }

    // Every Start is a fresh run, and a fresh run tracks (AC-15.1.16/2).
    if (s.isPlaying && !wasPlaying) autoscrollStoodDown = false;
    wasPlaying = s.isPlaying;

    followCursor(position);
  });

  return {
    shell,
    /** Opens the library at every width, the toggle following (AC-14.1.4/3). */
    showLibrary() {
      openLibrary(shell);
      syncLibraryToggle();
    },
    /** Collapses it, the toggle following (AC-14.1.1/1). */
    hideLibrary() {
      collapseLibrary(shell);
      syncLibraryToggle();
    },
    sidebar,
    libraryEl,
    libraryToggle,
    goalsButton,
    relatedButton,
    main,
    topBarEl,
    stripEl,
    bandEl,
    surfaceEl,
    headerEl,
    gridEl,
    scoreEl,
    viewEl,
    chordStripEl,
    brushEl,
    playEl,
    tabsEl,
    melodyEl,
    rhythmEl,
    practiceEl,
    actionsEl,
    navEl,
    familyEl,
    composerEl,
  };
}
