/**
 * Composition root and app state container.
 *
 * FR-013: rendering is a pure function of (pattern, transportPosition). This
 * module owns the only mutable references in the app — the current Pattern and
 * the transport position — and every change goes through `apply`, which routes
 * mutations through core/pattern.js and then re-renders. No view holds
 * authoritative state of its own.
 */
import { create } from './core/pattern.js';
import * as patternStore from './storage/patterns.js';
import * as settingsStore from './storage/settings.js';

/** The single source of truth. Never mutated in place — always replaced. */
const state = {
  pattern: create(),
  /** null when stopped; otherwise { measureIndex, beatIndex, slotIndex, loop }. */
  transportPosition: null,
  /** Whether the current Pattern came from the user's own store (data-model §5). */
  isOwned: false,
  settings: settingsStore.DEFAULTS,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function render() {
  for (const fn of listeners) fn(state.pattern, state.transportPosition, state);
}

/**
 * Apply a core mutation and re-render.
 *
 * @param {(pattern: object, ...args: any[]) => object} mutator  a core/pattern.js function
 */
export function apply(mutator, ...args) {
  state.pattern = mutator(state.pattern, ...args);
  if (state.isOwned) patternStore.upsert(state.pattern); // auto-save (US-7.2)
  render();
  return state.pattern;
}

/** Load a Pattern, recording where it came from — provenance is by origin store. */
export function loadPattern(pattern, { owned }) {
  state.pattern = pattern;
  state.isOwned = owned;
  state.transportPosition = null;
  render();
}

/** Driven from the scheduler's event queue, never a separate animation loop (FR-009). */
export function setTransportPosition(position) {
  state.transportPosition = position;
  render();
}

export function init() {
  state.settings = settingsStore.load();
  render();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
