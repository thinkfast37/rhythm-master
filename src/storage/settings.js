/**
 * App preferences, in `rm.settings.v1`. data-model §6.
 *
 * Preferences are global, not per-Pattern. The one deliberate exception is
 * counting system: a Pattern containing a mixed-feel Recipe renders in Numbered
 * regardless of what is stored here, and does NOT overwrite this value
 * (AC-5.6.3) — the preference is what the musician chose, not what a particular
 * Pattern forced.
 */
import { readStore, writeStore } from './keyValue.js';

export const KEY = 'rm.settings.v1';

export const DEFAULTS = {
  countingSystem: 'takadimi',
  lastTempo: 80,
  metronomeEnabled: false,
  countInEnabled: false,
};

export function load() {
  return { ...DEFAULTS, ...readStore(KEY, DEFAULTS) };
}

export function save(partial) {
  const next = { ...load(), ...partial };
  writeStore(KEY, next);
  return next;
}
