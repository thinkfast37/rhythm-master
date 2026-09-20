/**
 * Lab's Help (AC-14.1.3/3): a one-line description of each control in the
 * group on screen and in the pinned bar, shown while the Help toggle is on.
 *
 * Copy lives here, keyed by the group it describes, so a control renderer
 * asks for its group's lines and never carries prose of its own. Present in
 * Lab alone: under a goal the surface is already the explanation.
 */
import { LAB } from '../core/goals.js';
import { el } from './controls.js';

/** Whether the descriptions are on: Lab, with its Help toggle set. */
export function helpOn(state) {
  return state?.settings?.goal === LAB && Boolean(state?.settings?.labHelp);
}

export const HELP = Object.freeze({
  bar: [
    ['Library', 'Opens the list of every Pattern, shipped and your own, with search and Tag filters.'],
    ['Play / Stop', 'Loops the Pattern from the top until you stop it. Under a cycle, a second Stop starts the cycle over from the Pattern’s own fill.'],
    ['BPM', 'The exact tempo in beats per minute; type a number, or use the slider and presets in Practice.'],
    ['Prev / Next', 'Steps to the neighbouring Pattern in the library list as it is filtered now.'],
    ['Goals', 'Back to the goals screen, to work a different way or leave Lab.'],
  ],
  melody: [
    ['Pitch strip', 'Arm a scale degree, then tap a note’s upper band in the grid to give it that pitch.'],
    ['Octave', 'Moves what the strip stamps up or down an octave.'],
    ['Key', 'The key everything sounds in; the degrees on the strip follow it.'],
    ['Scale', 'Which notes the strip and the fills draw from.'],
    ['Progression', 'Lays chords over the rhythm; chord tones on the strip follow it.'],
    ['Change', 'Whether the chord moves on every Measure or once a pass.'],
    ['Arpeggio', 'The shape the chord tones are dealt in — a fill — and None to stamp by hand.'],
    ['Register', 'Moves every note the Pattern sounds by whole octaves: a bass line, or a fill up high.'],
    ['Fills / Repeats', 'Plays each fill for that many harmonic cycles, then moves on to the next.'],
    ['Keep', 'Shortlists the fill in force for the Compose group.'],
  ],
  rhythm: [
    ['Subdivision', 'Arm a Recipe, then tap a Beat in the grid to split it that way.'],
    ['− Measure / + Measure', 'Removes the last Measure, or adds one at the end; a Pattern always keeps one.'],
    ['Time signature', 'Tap a Measure’s signature in the grid to change it; every Measure can differ.'],
    ['Double Length', 'Repeats the whole Pattern after itself, to vary the second half.'],
    ['Condense', 'Rewrites the Pattern at the simplest subdivision that still sounds the same.'],
    ['Append…', 'Adds another Pattern from the library after this one.'],
  ],
  practice: [
    ['Click / Count-in', 'A metronome under the Pattern, and a bar of clicks before it starts.'],
    ['Tempo', 'The slider and presets set the same tempo as the pinned entry.'],
    ['Swing', 'Delays every second note of the chosen feel by the amount; 0 is straight.'],
    ['Counting', 'The syllables under each note: takadimi, 1 e & a, or numbers.'],
  ],
  compose: [
    ['Progression', 'Set in Melody; shown here so you know what the Section plays over.'],
    ['Kept fills', 'The fills you shortlisted with Keep; tap one to add it to the Section.'],
    ['Section', 'The fills in order, each for a number of cycles; move, remove or change repeats in place.'],
    ['Play song / Save / Export Song MIDI', 'Plays the Section end to end, stores it under a name, or writes it as one MIDI file.'],
  ],
});

/**
 * The descriptions for a group, as a list, or nothing while Help is off. The
 * renderers call this inside their own build, so the block is part of the
 * group rather than something appended around it.
 */
export function renderHelp(group, state) {
  if (!helpOn(state)) return null;
  const lines = HELP[group] ?? [];
  const list = el('dl', 'control-help');
  list.dataset.help = group;
  for (const [name, text] of lines) {
    list.appendChild(el('dt', 'control-help-name', { textContent: name }));
    list.appendChild(el('dd', 'control-help-text', { textContent: text }));
  }
  return list;
}
