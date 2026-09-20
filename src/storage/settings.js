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
  /** The view the main panel shows the Pattern in: the grid, or the sheet music (AC-12.2.1/1). */
  patternView: 'grid',
  /** Harmonic cycles each fill plays for in cycle mode (AC-2.7.1/2). Cycle mode itself is not stored. */
  fillCycleRepeats: 4,
  /**
   * The chosen goal's id, or 'lab' (US-14.1). null until one is chosen, and
   * anything but 'lab' opens the goals screen on launch (AC-14.1.1/4). A
   * preference about the interface, never about a Pattern (AC-14.1.2/5).
   */
  goal: null,
  /** The level Tag Give me one draws from under a practice goal (AC-14.1.4/1). */
  level: 'Beginner',
  /** Whether Lab's Help toggle is on (AC-14.1.3/3). */
  labHelp: false,
};

export function load() {
  return { ...DEFAULTS, ...readStore(KEY, DEFAULTS) };
}

export function save(partial) {
  const next = { ...load(), ...partial };
  writeStore(KEY, next);
  return next;
}
