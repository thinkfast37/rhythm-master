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
import { NO_CARRY } from '../core/playback-defaults.js';

export const KEY = 'rm.settings.v1';

/**
 * `lastTempo`, `lastSwingAmount` and `lastSwingFeel` are the playback settings
 * in effect on the Pattern most recently loaded — what the next Pattern carries
 * when it has none of its own (AC-4.2.3, AC-4.4.17). They are written on every
 * load as well as on every change, since what carries is the tempo and swing
 * being heard, not only the ones set by hand.
 */
export const DEFAULTS = {
  countingSystem: 'takadimi',
  lastTempo: NO_CARRY.tempo,
  lastSwingAmount: NO_CARRY.swingAmount,
  lastSwingFeel: NO_CARRY.swingFeel,
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
