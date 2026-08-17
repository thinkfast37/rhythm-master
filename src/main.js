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
} from './core/pattern.js';
import { TIME_SIGNATURES } from './core/meter.js';
import * as patternStore from './storage/patterns.js';
import * as settingsStore from './storage/settings.js';
import * as seedStore from './storage/seed.js';
import { renderGrid } from './ui/grid.js';
import { renderControls } from './ui/controls.js';
import { ask, confirmRecipeChange, askApplyToAllMeasures, askNewPatternName } from './ui/dialogs.js';

const state = {
  pattern: create(),
  transportPosition: null,
  /** Provenance: true when the Pattern came from the user's own store (data-model §5). */
  isOwned: false,
  isPlaying: false,
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
  render();
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
    apply(cycleAccent, measureIndex, beatIndex, slotIndex);
  },

  onTempo(bpm) {
    state.pattern = { ...state.pattern, tempo: bpm };
    if (state.isOwned) patternStore.upsert(state.pattern);
    state.settings = settingsStore.save({ lastTempo: bpm });
    // Tempo change restarts playback at the new tempo (AC-4.2.2); the scheduler
    // wires that in T057-T058.
    render();
  },

  async onSoundMode(mode) {
    if (!(await guardShipped())) return;
    const next = { ...state.pattern, soundMode: mode };
    if (mode === 'melodic') next.key = next.key ?? 'C';
    else delete next.key;
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
    render();
  },

  onPlay() {
    state.isPlaying = true;
    render();
  },

  onStop() {
    state.isPlaying = false;
    state.transportPosition = null;
    render();
  },
};

export { handlers };

// --- mounting ---------------------------------------------------------------

export function mount(root) {
  const controlsEl = document.createElement('div');
  const gridEl = document.createElement('div');
  root.append(controlsEl, gridEl);

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
  });

  return { controlsEl, gridEl };
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
}

/** Test seam: lets e2e drive state directly rather than through the DOM. */
if (typeof window !== 'undefined') {
  window.__rm = {
    getState,
    loadPattern,
    handlers,
    seedStore,
    patternStore,
    /** A blank owned Pattern at a chosen meter, for tests that need a known shape. */
    loadBlank(timeSignature = '4/4', name = 'Test Pattern') {
      let p = create(name);
      if (timeSignature !== '4/4') p = setTimeSignature(p, 0, timeSignature);
      loadPattern({ ...p, id: 'p_test' }, { owned: true });
      return getState().pattern;
    },
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => init());
}
