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
import { renameProgressions } from './progressionRenames.js';

export const KEY = 'rm.settings.v1';

/**
 * `lastTempo` is the tempo in effect on the Pattern most recently loaded — what
 * the next Pattern carries when it has none of its own (AC-4.2.3). It is
 * written on every load as well as on every change, since what carries is the
 * tempo being heard, not only the one set by hand. Swing never carries
 * (AC-4.4.17, reversed 2026-09-20): `lastSwingAmount` and `lastSwingFeel`, which
 * were written here until then, are no longer defaulted, written or read, and
 * a stored value is ignored.
 */
export const DEFAULTS = {
  countingSystem: 'takadimi',
  lastTempo: NO_CARRY.tempo,
  metronomeEnabled: false,
  countInEnabled: false,
  /** The view the main panel shows the Pattern in: the grid, or the sheet music (AC-12.2.1/1). */
  patternView: 'grid',
  /** Harmonic cycles each fill plays for in cycle mode (AC-2.7.1/2). Cycle mode itself is not stored. */
  fillCycleRepeats: 4,
  /**
   * What each cycle steps through (US-2.12): 'all' of its catalogue, or 'list',
   * the ids on its list alone, in catalogue order. One list each, the same on
   * every Pattern, never Pattern content (AC-2.12.1/3).
   */
  fillCycleFrom: 'all',
  fillCycleList: [],
  progressionCycleFrom: 'all',
  progressionCycleList: [],
  /**
   * The identities of the shipped Patterns seen at the last load (AC-11.3.1), so the
   * "your copy is now in the library" check runs against newly shipped Patterns
   * only. null until the first load records it. App bookkeeping, never Pattern data.
   */
  shippedSeen: null,
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
  /** Whether the melodic score writes note names and degree colours (AC-12.3.1/2). Off on a first load. */
  sheetAids: false,
  /**
   * The Composer's instrument view (US-19.1–US-19.3): which instrument is shown,
   * how in-scale notes are labelled, the fretboard's capo and visible frets, and
   * the keyboard's key count. Preferences about the view, never about a
   * Pattern — a composition saved from the Composer records none of them
   * (AC-19.8.4, data-model §6).
   */
  composerInstrument: 'guitar',
  composerLabelMode: 'notes',
  composerCapo: 0,
  composerFretRange: [0, 24],
  composerKeys: 49,
  /**
   * The voice melodic notes sound with (US-2.13): 'piano', 'synth' or
   * 'guitar'. An app preference, never Pattern content (AC-2.13.1/2); the
   * Composer reads it in the Piano view alone (AC-2.13.3). Read through
   * `core/voice.normaliseVoice`, so a stored value it does not know is Piano.
   */
  melodicVoice: 'piano',
  /**
   * The MIDI device the Composer takes notes from, by name, or 'all' (US-19.10,
   * AC-19.10.4/3). A preference about the computer's hardware, never about a
   * Pattern; a name no connected device has takes every device's notes.
   */
  composerMidiInput: 'all',
};

export function load() {
  const stored = { ...DEFAULTS, ...readStore(KEY, DEFAULTS) };
  // A ticked song progression follows its song when the catalogue renames it (AC-2.12.1/4).
  return { ...stored, progressionCycleList: renameProgressions(stored.progressionCycleList) };
}

export function save(partial) {
  const next = { ...load(), ...partial };
  writeStore(KEY, next);
  return next;
}
