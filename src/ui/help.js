/**
 * Lab's Help (AC-14.1.3/3): a ? beside each control in the group on screen
 * and in the pinned bar, shown while the Help toggle is on. Tapping a ? pops
 * up that control's one-line description over the page; nothing takes room
 * while it is closed.
 *
 * Copy lives here, keyed by the group it describes, each line with the
 * control it sits beside, so a control renderer places its group's ?s and
 * never carries prose of its own. Present in Lab alone: under a goal the
 * surface is already the explanation.
 */
import { LAB } from '../core/goals.js';
import { el } from './controls.js';

/** Whether the ?s are on: Lab, with its Help toggle set. */
export function helpOn(state) {
  return state?.settings?.goal === LAB && Boolean(state?.settings?.labHelp);
}

/**
 * [name, description, the control the ? follows]. A line whose control is not
 * on screen — the octave stepper under an arpeggio, say — has no ?, since
 * there is nothing for it to describe.
 */
export const HELP = Object.freeze({
  bar: [
    ['Library', 'Opens the list of every Pattern, shipped and your own, with search and Tag filters.', '.library-toggle'],
    ['Play / Stop', 'Loops the Pattern from the top until you stop it. Under a cycle, a second Stop starts the cycle over from the Pattern’s own fill.', '.transport'],
    ['BPM', 'The exact tempo in beats per minute; type a number, or use the slider and presets in Practice.', '.tempo-unit'],
    ['Prev / Next', 'Steps to the neighbouring Pattern in the library list as it is filtered now.', '[data-action="next-pattern"]'],
    ['Goals', 'Back to the goals screen, to work a different way or leave Lab.', '.goals-button'],
  ],
  melody: [
    ['Pitch strip', 'Arm a scale degree, then tap a note’s upper band in the grid to give it that pitch.', '.pitch-strip > .pitch-strip-label:first-child'],
    ['Octave', 'Moves what the strip stamps up or down an octave.', '.octave-stepper'],
    ['Key', 'The key everything sounds in; the degrees on the strip follow it.', '.key-picker'],
    ['Scale', 'Which notes the strip and the fills draw from.', '.scale-picker'],
    ['Progression', 'Lays chords over the rhythm; chord tones on the strip follow it.', '.progression-picker'],
    ['Change', 'Whether the chord moves on every Measure or once a pass.', '.chord-change-group > :last-child'],
    ['Arpeggio', 'The shape the chord tones are dealt in — a fill — and None to stamp by hand.', '.arpeggio-picker'],
    ['Register', 'Moves every note the Pattern sounds by whole octaves: a bass line, or a fill up high.', '.register-picker'],
    ['Fills / Repeats', 'Plays each fill for that many harmonic cycles, then moves on to the next.', '.fill-cycle-unit'],
    ['Keep', 'Shortlists the fill in force for the Compose group.', '.keep-fill'],
  ],
  rhythm: [
    ['Subdivision', 'Arm a Recipe, then tap a Beat in the grid to split it that way.', '.recipe-strip .control-label'],
    ['− Measure / + Measure', 'Removes the last Measure, or adds one at the end; a Pattern always keeps one.', '[data-action="add-measure"]'],
    ['Time signature', 'Tap a Measure’s signature in the grid to change it; every Measure can differ.', '.control:has(> .structure-row) > .control-label'],
    ['Double Length', 'Repeats the whole Pattern after itself, to vary the second half.', '[data-action="duplicate-pattern"]'],
    ['Condense', 'Rewrites the Pattern at the simplest subdivision that still sounds the same.', '[data-action="condense-pattern"]'],
    ['Append…', 'Adds another Pattern from the library after this one.', '[data-action="append-pattern"]'],
  ],
  practice: [
    ['Click / Count-in', 'A metronome under the Pattern, and a bar of clicks before it starts.', '[data-action="toggle-count-in"]'],
    ['Tempo', 'The slider and presets set the same tempo as the pinned entry.', '.control:has(> .slider-row > .tempo-slider) > .control-label'],
    ['Swing', 'Delays every second note of the chosen feel by the amount; 0 is straight.', '.control:has(> .slider-row > .swing-slider) > .control-label'],
    ['Counting', 'The syllables under each note: takadimi, 1 e & a, or numbers.', '.counting-picker'],
  ],
  compose: [
    ['Progression', 'Set in Melody; shown here so you know what the Section plays over.', '.compose-hint'],
    ['Kept fills', 'The fills you shortlisted with Keep; tap one to add it to the Section.', '.compose-palette > .compose-label'],
    ['Section', 'The fills in order, each for a number of cycles; move, remove or change repeats in place.', '.compose-section-head > .compose-label'],
    ['Play song / Save / Export Song MIDI', 'Plays the Section end to end, stores it under a name, or writes it as one MIDI file.', '.song-export'],
  ],
});

/**
 * Put a group's ?s beside its controls under `root`, or take them away while
 * Help is off. The renderers call this at the end of their own build, so the
 * ?s are part of the group rather than something patched in around it.
 * `names` limits it to some of the group's lines, for the parts of the pinned
 * bar that are built once rather than rebuilt.
 */
export function placeHelp(root, group, state, names = null) {
  const lines = (HELP[group] ?? []).filter(([name]) => !names || names.includes(name));
  const on = helpOn(state);
  for (const [name, text, selector] of lines) {
    const existing = [...root.querySelectorAll('.help-tip')].find(
      (t) => t.dataset.help === group && t.dataset.helpFor === name
    );
    if (!on) {
      existing?.remove();
      continue;
    }
    if (existing) continue;
    const anchor = root.querySelector(selector);
    if (anchor) anchor.after(helpTip(group, name, text));
  }
  if (!on) hideHelp();
}

function helpTip(group, name, text) {
  const tip = el('button', 'help-tip', { type: 'button', textContent: '?' });
  tip.dataset.help = group;
  tip.dataset.helpFor = name;
  tip.setAttribute('aria-label', `About ${name}`);
  tip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pop = popup();
    if (!pop.hidden && pop.dataset.help === group && pop.dataset.helpFor === name) hideHelp();
    else showHelp(tip, group, name, text);
  });
  return tip;
}

/*
 * One pop-up for the whole app, on the body, outside every rebuilt panel: a
 * render during playback that replaces a group cannot close it, and no
 * panel's overflow can clip it.
 */
let pop = null;

function popup() {
  if (pop?.isConnected) return pop;
  pop = el('div', 'help-pop', { hidden: true });
  pop.setAttribute('role', 'note');
  pop.setAttribute('aria-live', 'polite');
  document.body.appendChild(pop);
  // Dismissed by a tap anywhere else, Escape, or the page moving under it.
  document.addEventListener('pointerdown', (e) => {
    if (pop.hidden || pop.contains(e.target) || e.target.closest?.('.help-tip')) return;
    hideHelp();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideHelp();
  });
  window.addEventListener('resize', hideHelp);
  document.addEventListener('scroll', hideHelp, true);
  return pop;
}

function showHelp(tip, group, name, text) {
  const p = popup();
  p.dataset.help = group;
  p.dataset.helpFor = name;
  p.replaceChildren(el('strong', 'help-pop-name', { textContent: name }), el('span', 'help-pop-text', { textContent: text }));
  p.hidden = false;
  // Below the ?, or above it when there is no room; never off either side.
  const gap = 6;
  const margin = 8;
  const at = tip.getBoundingClientRect();
  const box = p.getBoundingClientRect();
  const left = Math.max(margin, Math.min(at.left + at.width / 2 - box.width / 2, window.innerWidth - box.width - margin));
  const below = at.bottom + gap;
  const top = below + box.height > window.innerHeight - margin ? Math.max(margin, at.top - gap - box.height) : below;
  p.style.left = `${left}px`;
  p.style.top = `${top}px`;
}

function hideHelp() {
  if (pop) pop.hidden = true;
}
