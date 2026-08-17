/**
 * Composition root and app state container.
 *
 * FR-013: rendering is a pure function of (pattern, transportPosition). This
 * module owns the only mutable references in the app; every change goes through
 * `apply`, which routes mutations through core/pattern.js and re-renders. No
 * view holds authoritative state of its own.
 */
import {
  create,
  addMeasure,
  setTimeSignature,
  setTimeSignatureAll,
  setRecipe,
  cycleAccent,
  countActiveSlots,
  setGroupSwing,
  setPitch,
  append,
  duplicate,
} from './core/pattern.js';
import { TIME_SIGNATURES } from './core/meter.js';
import { buildTimeline } from './core/timeline.js';
import * as patternStore from './storage/patterns.js';
import * as settingsStore from './storage/settings.js';
import * as seedStore from './storage/seed.js';
import * as overlayStore from './storage/overlays.js';
import { renderGrid } from './ui/grid.js';
import { renderControls } from './ui/controls.js';
import { renderLibrary, buildEntries, neighbours } from './ui/library.js';
import { downloadMidi } from './export/midi.js';
import { buildSubmission } from './export/submit.js';
import { findDuplicates, findFamily, isDuplicate } from './core/similarity.js';
import * as localMetaStore from './storage/localMeta.js';
import {
  ask,
  confirm,
  confirmRecipeChange,
  askApplyToAllMeasures,
  askNewPatternName,
} from './ui/dialogs.js';
import { createTransport } from './audio/scheduler.js';
import * as piano from './audio/piano.js';
import { getContext } from './audio/context.js';

const state = {
  pattern: create(),
  transportPosition: null,
  /** Provenance: true when the Pattern came from the user's own store (data-model §5). */
  isOwned: false,
  isPlaying: false,
  loop: 0,
  /** Which Slot the pitch controls act on, in Melodic mode (US-2.2). */
  selectedSlot: null,
  pianoStatus: piano.getStatus(),
  /** Library view state: search text, active Tag filter, and what is open. */
  view: { query: '', tag: null, currentId: null },
  settings: settingsStore.DEFAULTS,
};

const listeners = new Set();

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function render() {
  for (const fn of listeners) fn(state.pattern, state.transportPosition, state);
}

/**
 * Apply a core mutation, auto-save if the Pattern is ours, re-render.
 *
 * Auto-save is unconditional for owned Patterns — there is no save action to
 * forget (US-7.2). Shipped Patterns never reach here; `guardShipped` intercepts.
 */
export function apply(mutator, ...args) {
  state.pattern = mutator(state.pattern, ...args);
  if (state.isOwned) patternStore.upsert(state.pattern);
  render();
  return state.pattern;
}

/**
 * Editing a shipped Pattern names a copy FIRST, then applies the edit to the
 * copy. Cancelling discards the edit entirely and leaves the original untouched
 * (US-7.3, FR-007).
 *
 * @returns {Promise<boolean>} whether the caller may proceed
 */
async function guardShipped() {
  if (state.isOwned) return true;

  const name = await askNewPatternName(`${state.pattern.name} (my version)`);
  if (name === null) return false;

  const owned = {
    ...structuredClone(state.pattern),
    id: patternStore.nextId(),
    name,
    rating: 0,
  };
  patternStore.upsert(owned);
  state.pattern = owned;
  state.isOwned = true;
  return true;
}

export function loadPattern(pattern, { owned }) {
  state.pattern = pattern;
  state.isOwned = owned;
  state.transportPosition = null;
  state.selectedSlot = null;
  state.view = { ...state.view, currentId: pattern.id ?? null };
  render();
}

/**
 * The library as the UI sees it: shipped Patterns with their user overlays
 * applied, plus owned Patterns as they are.
 */
function libraryEntries() {
  return buildEntries(seedStore.loadAll().map(overlayStore.applyTo), patternStore.loadAll());
}

export function setTransportPosition(position) {
  state.transportPosition = position;
  render();
}

// --- handlers ---------------------------------------------------------------

const handlers = {
  async onAddMeasure() {
    if (!(await guardShipped())) return;
    apply(addMeasure);
  },

  /**
   * Changing the FIRST Measure's meter asks whether to apply it throughout
   * (AC-1.1.5). Any other Measure changes on its own, with no prompt (AC-1.1.6).
   */
  async onTimeSignature(measureIndex) {
    if (!(await guardShipped())) return;

    const options = TIME_SIGNATURES.map((ts) => ({ label: ts, value: ts }));
    options.push({ label: 'Cancel', value: null });
    const chosen = await ask({
      message: `Time signature for Measure ${measureIndex + 1}`,
      options,
    });
    if (chosen === null || chosen === 'null') return;

    if (measureIndex === 0 && state.pattern.measures.length > 1) {
      const scope = await askApplyToAllMeasures(chosen);
      if (scope === 'cancel') return;
      if (scope === 'all') {
        apply(setTimeSignatureAll, chosen);
        return;
      }
    }
    apply(setTimeSignature, measureIndex, chosen);
  },

  /**
   * A Recipe change clears the Beat in EITHER direction, so it prompts whenever
   * the Beat has notes — growing a Recipe destroys content just as surely as
   * shrinking one (AC-1.3.7, AC-1.3.8). An empty Beat changes silently.
   */
  async onRecipe(recipeId, measureIndex = 0, beatIndex = 0) {
    if (!(await guardShipped())) return;
    const active = countActiveSlots(state.pattern, measureIndex, beatIndex);
    if (!(await confirmRecipeChange(active))) return;
    apply(setRecipe, measureIndex, beatIndex, recipeId);
  },

  async onSlotTap(measureIndex, beatIndex, slotIndex) {
    if (!(await guardShipped())) return;
    state.selectedSlot = { measureIndex, beatIndex, slotIndex };
    apply(cycleAccent, measureIndex, beatIndex, slotIndex);

    // A Slot switched on in Melodic mode needs a pitch, or it has no musical
    // content at all. Default to the tonic rather than leaving it undefined.
    const slot = state.pattern.measures[measureIndex].beats[beatIndex].slots[slotIndex];
    if (state.pattern.soundMode === 'melodic' && slot.on && !slot.pitch) {
      apply(setPitch, measureIndex, beatIndex, slotIndex, { degree: '1', octaveOffset: 0 });
    }
  },

  async onSwing(groupIndex, amount, measureIndex = 0, beatIndex = 0) {
    if (!(await guardShipped())) return;
    apply(setGroupSwing, measureIndex, beatIndex, groupIndex, amount);
    if (state.isPlaying) transport.restart(state.pattern, state.settings);
  },

  async onPitch(pitch) {
    if (!state.selectedSlot) return;
    if (!(await guardShipped())) return;
    const { measureIndex, beatIndex, slotIndex } = state.selectedSlot;
    apply(setPitch, measureIndex, beatIndex, slotIndex, pitch);
  },

  onTempo(bpm) {
    state.pattern = { ...state.pattern, tempo: bpm };
    if (state.isOwned) patternStore.upsert(state.pattern);
    state.settings = settingsStore.save({ lastTempo: bpm });
    // Restart from the top at the new tempo, resetting the loop counter, rather
    // than retiming the running loop in place (AC-4.2.2).
    if (state.isPlaying) transport.restart(state.pattern, state.settings);
    render();
  },

  async onSoundMode(mode) {
    if (!(await guardShipped())) return;
    const next = structuredClone(state.pattern);
    next.soundMode = mode;

    if (mode === 'melodic') {
      next.key = next.key ?? 'C';
      // Every sounding Slot needs a pitch for the Pattern to be valid and
      // playable; default them to the tonic rather than producing silence.
      for (const measure of next.measures) {
        for (const beat of measure.beats) {
          for (const slot of beat.slots) {
            if (slot.on && !slot.pitch) slot.pitch = { degree: '1', octaveOffset: 0 };
          }
        }
      }
    } else {
      delete next.key;
      // Pitch is meaningless in Percussive mode and would fail validation.
      for (const measure of next.measures) {
        for (const beat of measure.beats) {
          for (const slot of beat.slots) delete slot.pitch;
        }
      }
    }

    state.pattern = next;
    if (state.isOwned) patternStore.upsert(next);
    render();
  },

  async onKey(key) {
    if (!(await guardShipped())) return;
    state.pattern = { ...state.pattern, key };
    if (state.isOwned) patternStore.upsert(state.pattern);
    render();
  },

  onCountingSystem(system) {
    state.settings = settingsStore.save({ countingSystem: system });
    render();
  },

  onSetting(partial) {
    state.settings = settingsStore.save(partial);
    if (state.isPlaying) transport.restart(state.pattern, state.settings);
    render();
  },

  /** The only entry point to audio, and it is a user gesture (FR-010). */
  async onPlay() {
    state.isPlaying = true;
    state.loop = 0;
    render();

    /*
     * Melodic playback waits for samples and shows a loading state; Percussive
     * never waits on them at all (AC-2.4.3, Principle III).
     */
    if (state.pattern.soundMode === 'melodic') {
      state.pianoStatus = { status: 'loading', error: null };
      render();
      await piano.load(getContext());
      state.pianoStatus = piano.getStatus();
      render();
      if (!state.isPlaying) return; // stopped while loading
    }

    await transport.start(state.pattern, state.settings);
  },

  onStop() {
    transport.stop();
  },

  // --- library ---

  onSearch(query) {
    state.view = { ...state.view, query };
    render();
  },

  onTagFilter(tag) {
    state.view = { ...state.view, tag };
    render();
  },

  onOpen(id, owned) {
    const pattern = owned
      ? patternStore.findById(id)
      : overlayStore.applyTo(seedStore.findById(id));
    if (pattern) loadPattern(owned ? pattern : structuredClone(pattern), { owned });
  },

  /**
   * Rating works on shipped and owned Patterns alike. A shipped Pattern is
   * frozen, so its rating goes to the overlay store rather than onto the
   * Pattern (FR-007).
   */
  onRate(id, rating) {
    const owned = patternStore.findById(id);
    if (owned) patternStore.upsert({ ...owned, rating });
    else overlayStore.update(id, { rating });

    if (state.pattern.id === id) state.pattern = { ...state.pattern, rating };
    render();
  },

  onAddTag(id, tag) {
    const name = String(tag).trim();
    if (!name) return;
    const owned = patternStore.findById(id);
    const existing = owned ? (owned.tags ?? []) : (overlayStore.applyTo(seedStore.findById(id)).tags ?? []);
    // De-duplicate case-insensitively, keeping the spelling already stored.
    if (existing.some((t) => String(t).toLowerCase() === name.toLowerCase())) return;
    const tags = [...existing, name];
    if (owned) patternStore.upsert({ ...owned, tags });
    else overlayStore.update(id, { tags });
    if (state.pattern.id === id) state.pattern = { ...state.pattern, tags };
    render();
  },

  onRemoveTag(id, tag) {
    const owned = patternStore.findById(id);
    const source = owned ?? overlayStore.applyTo(seedStore.findById(id));
    const tags = (source.tags ?? []).filter((t) => String(t).toLowerCase() !== String(tag).toLowerCase());
    if (owned) patternStore.upsert({ ...owned, tags });
    else overlayStore.update(id, { tags });
    if (state.pattern.id === id) state.pattern = { ...state.pattern, tags };
    render();
  },

  // --- whole-Pattern operations ---

  /**
   * An explicit copy under a new name. This is the second of the two moments a
   * duplicate warning may fire — the other is the forced-naming prompt on a
   * shipped Pattern. Duplicates that emerge from ongoing edits surface only in
   * the standing view, because auto-save has no discrete moment to interrupt.
   */
  async onMakeCopy() {
    const name = await askNewPatternName(`${state.pattern.name} copy`);
    if (name === null) return;

    const copy = { ...structuredClone(state.pattern), id: patternStore.nextId(), name, rating: 0 };

    const clash = findDuplicates(copy, [...seedStore.loadAll(), ...patternStore.loadAll()]);
    if (clash.length > 0) {
      const proceed = await confirm(
        `This is note-for-note identical to "${clash[0].name}". Make the copy anyway?`,
        { confirmLabel: 'Make Copy', cancelLabel: 'Cancel' }
      );
      if (!proceed) return;
    }

    patternStore.upsert(copy);
    loadPattern(copy, { owned: true });
  },

  async onDelete() {
    if (!state.isOwned) return; // shipped Patterns are never deletable
    const proceed = await confirm(`Delete "${state.pattern.name}" permanently?`, {
      confirmLabel: 'Delete',
    });
    if (!proceed) return;

    const id = state.pattern.id;
    patternStore.remove(id);
    localMetaStore.forget(id); // its bookkeeping goes with it
    const remaining = patternStore.loadAll();
    const next = remaining[0] ?? structuredClone(seedStore.loadAll()[0]);
    loadPattern(next, { owned: remaining.length > 0 });
  },

  async onAppendPrompt() {
    const entries = libraryEntries();
    const options = entries
      .slice(0, 40)
      .map((e) => ({ label: e.pattern.name, value: e.pattern.id }));
    options.push({ label: 'Cancel', value: null });

    const id = await ask({ message: 'Append which Pattern?', options });
    if (!id || id === 'null') return;
    if (!(await guardShipped())) return;

    const other = entries.find((e) => e.pattern.id === id);
    if (!other) return;
    try {
      apply(append, other.pattern);
    } catch (err) {
      await confirm(err.message, { confirmLabel: 'OK', cancelLabel: 'Dismiss' });
    }
  },

  async onDuplicate() {
    if (!(await guardShipped())) return;
    try {
      apply(duplicate);
    } catch (err) {
      await confirm(err.message, { confirmLabel: 'OK', cancelLabel: 'Dismiss' });
    }
  },

  onExportMidi() {
    downloadMidi(state.pattern);
  },

  onSubmit() {
    const submission = buildSubmission([state.pattern]);
    if (state.pattern.id) localMetaStore.update(state.pattern.id, { submittedAt: nowIso() });
    return submission;
  },

  /** Prev/Next follow the filtered, sorted order on screen (US-5.5). */
  onNavigate(direction) {
    const { previous, next } = neighbours(libraryEntries(), state.view);
    const target = direction === 'previous' ? previous : next;
    if (target) handlers.onOpen(target.pattern.id, target.owned);
  },
};

/**
 * The transport reports position from its own scheduled queue, so the cursor
 * cannot drift from the audio (Principle III).
 */
const transport = createTransport({
  playMelodic: piano.playMelodic,
  onPosition(position) {
    state.transportPosition = position;
    render();
  },
  onLoop(loop) {
    state.loop = loop;
    render();
  },
  onStop() {
    // Reaching here means either the musician stopped, or the device suspended
    // audio. Both reset to the top of the Pattern (AC-4.1.5).
    state.isPlaying = false;
    state.transportPosition = null;
    state.loop = 0;
    render();
  },
});

export { transport };

export { handlers };

// --- mounting ---------------------------------------------------------------

export function mount(root) {
  const controlsEl = document.createElement('div');
  const gridEl = document.createElement('div');
  const navEl = document.createElement('div');
  navEl.className = 'pattern-nav';
  const libraryEl = document.createElement('div');
  root.append(controlsEl, gridEl, navEl, libraryEl);

  for (const direction of ['previous', 'next']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nav-button';
    b.dataset.action = direction === 'previous' ? 'prev-pattern' : 'next-pattern';
    b.textContent = direction === 'previous' ? '‹ Prev' : 'Next ›';
    b.addEventListener('click', () => handlers.onNavigate(direction));
    navEl.appendChild(b);
  }

  // Delegated rather than bound per Slot, so a re-render cannot leave stale
  // listeners behind.
  gridEl.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const m = Number(target.dataset.measure);
    if (target.dataset.action === 'cycle-accent') {
      handlers.onSlotTap(m, Number(target.dataset.beat), Number(target.dataset.slot));
    } else if (target.dataset.action === 'change-time-signature') {
      handlers.onTimeSignature(m);
    }
  });

  subscribe((pattern, position, s) => {
    renderControls(controlsEl, pattern, s, handlers);
    renderGrid(gridEl, pattern, position, { countingSystem: s.settings.countingSystem });
    renderLibrary(libraryEl, libraryEntries(), s.view, handlers);
  });

  return { controlsEl, gridEl, libraryEl, navEl };
}

/** Isolated so tests can pin it; core/ stays clock-free (Principle I). */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Patterns of the musician's that a library update has since duplicated.
 *
 * Prompted once each, and the answer is remembered as Local Metadata rather
 * than on the Pattern — so the fact that you were asked never travels with an
 * export (FR-006, US-11.3).
 */
export function unresolvedLibraryDuplicates() {
  const shipped = seedStore.loadAll();
  return patternStore
    .loadAll()
    .filter((owned) => !localMetaStore.forPattern(owned.id).duplicateResolved)
    .map((owned) => ({ owned, shipped: shipped.find((s) => isDuplicate(owned, s)) }))
    .filter((pair) => Boolean(pair.shipped));
}

/** Patterns sharing this one's rhythm but differing in Sound Mode or Pitch. */
export function currentFamily() {
  return findFamily(state.pattern, [...seedStore.loadAll(), ...patternStore.loadAll()]);
}

/** Possible duplicates of the current Pattern — the standing view (AC-11.1.4). */
export function currentDuplicates() {
  return findDuplicates(state.pattern, [...seedStore.loadAll(), ...patternStore.loadAll()]);
}

async function promptLibraryDuplicates() {
  for (const { owned, shipped } of unresolvedLibraryDuplicates()) {
    const keep = await ask({
      message:
        `"${owned.name}" is now identical to "${shipped.name}", which ships with the app. ` +
        'Remove your copy, or keep it?',
      options: [
        { label: 'Remove mine', value: 'remove' },
        { label: 'Keep both', value: 'keep', primary: true },
      ],
    });
    if (keep === 'remove') {
      patternStore.remove(owned.id);
      localMetaStore.forget(owned.id);
    } else {
      // Remembering the answer is what stops this asking again every load.
      localMetaStore.update(owned.id, { duplicateResolved: true });
    }
  }
  render();
}

export function init(root = document.getElementById('app')) {
  state.settings = settingsStore.load();

  // Open with music in it rather than an empty grid (US-16.1).
  const owned = patternStore.loadAll();
  const shipped = seedStore.loadAll();
  if (owned.length > 0) loadPattern(owned[0], { owned: true });
  else if (shipped.length > 0) loadPattern(structuredClone(shipped[0]), { owned: false });

  mount(root);
  render();
  promptLibraryDuplicates();
}

/** Test seam: lets e2e drive state directly rather than through the DOM. */
if (typeof window !== 'undefined') {
  window.__rm = {
    getState,
    loadPattern,
    handlers,
    seedStore,
    patternStore,
    overlayStore,
    localMetaStore,
    transport,
    currentDuplicates,
    currentFamily,
    unresolvedLibraryDuplicates,
    piano,
    /** A blank owned Pattern at a chosen meter, for tests that need a known shape. */
    loadBlank(timeSignature = '4/4', name = 'Test Pattern') {
      let p = create(name);
      if (timeSignature !== '4/4') p = setTimeSignature(p, 0, timeSignature);
      loadPattern({ ...p, id: 'p_test' }, { owned: true });
      return getState().pattern;
    },
  };
}

/** Test seam: the MIDI note the first sounding Slot resolves to. */
if (typeof window !== 'undefined') {
  window.__rmMidi = () => {
    const events = buildTimeline(state.pattern);
    return events[0]?.pitch?.midiNote ?? null;
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => init());
}
