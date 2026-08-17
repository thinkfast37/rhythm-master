/**
 * Editing and transport controls.
 *
 * Every control here dispatches a mutation and lets the one grid re-render
 * (Principle II). None of them computes musical values — Slot counts, accents,
 * and Recipe menus all come from core/.
 */
import { TIME_SIGNATURES, beatNoteValue } from '../core/meter.js';
import { recipesFor } from '../core/recipes.js';
import {
  KEYS,
  DEFAULT_DEGREES,
  EXTENDED_DEGREES,
  splitDegree,
  degreeToken,
  octaveNumber,
  octaveOffsetFor,
  clampOctave,
} from '../core/pitch.js';
import { COUNTING_SYSTEMS, COUNTING_LABELS, isForcedNumbered } from '../core/counting.js';
import { MIN_TEMPO, MAX_TEMPO, MAX_MEASURES } from '../core/pattern.js';
import { subdivisionGroups } from '../core/recipes.js';
import { MIN_SWING, MAX_SWING } from '../core/swing.js';

/** Preset tempos, carried over from the predecessor. */
export const TEMPO_PRESETS = [57, 67, 80, 90, 104, 120, 150, 180, 200, 220];

function el(tag, className, props = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.assign(node, props);
  return node;
}

function labelled(labelText, control) {
  const wrap = el('label', 'control');
  wrap.appendChild(el('span', 'control-label', { textContent: labelText }));
  wrap.appendChild(control);
  return wrap;
}

/**
 * Render the control bar.
 *
 * @param {HTMLElement} root
 * @param {object} pattern
 * @param {object} state    { settings, isOwned, isPlaying }
 * @param {object} handlers callbacks; each receives already-parsed values
 */
export function renderControls(root, pattern, state, handlers) {
  root.innerHTML = '';
  root.className = 'controls';

  root.appendChild(renderTransport(state, handlers));
  root.appendChild(renderTempo(pattern, handlers));
  root.appendChild(renderStructure(pattern, handlers));
  root.appendChild(renderSound(pattern, handlers));
  root.appendChild(renderSwing(pattern, handlers));
  root.appendChild(renderCounting(pattern, state, handlers));
  root.appendChild(renderActions(pattern, state, handlers));

  return root;
}

/** The Pattern header: name, provenance, and Measure count. */
export function renderHeader(root, pattern, state, handlers = {}) {
  root.innerHTML = '';
  root.className = 'pattern-header';
  root.dataset.owned = String(state.isOwned);

  // The name is editable in place rather than behind a rename dialog: it is the
  // first thing a Composer wants to change about a new Pattern (AC-7.1.1).
  const name = el('input', 'pattern-title', { type: 'text', value: pattern.name });
  name.dataset.action = 'rename';
  name.addEventListener('change', (e) => handlers.onRename?.(e.target.value));
  name.addEventListener('blur', (e) => handlers.onRename?.(e.target.value));
  root.appendChild(name);

  // Provenance reads as a Tag below, not as a sentence here.
  root.appendChild(
    el('p', 'pattern-meta', {
      textContent:
        `${pattern.measures.length} measure${pattern.measures.length === 1 ? '' : 's'} · ` +
        `${pattern.measures.map((m) => m.timeSignature).join(', ')}`,
    })
  );

  root.appendChild(renderHeaderTags(pattern, state, handlers));

  if (handlers.onUndo) {
    const undoButton = el('button', 'undo', { type: 'button', textContent: 'Undo' });
    undoButton.dataset.action = 'undo';
    undoButton.disabled = !state.canUndo;
    undoButton.addEventListener('click', () => handlers.onUndo());
    root.appendChild(undoButton);
  }

  return root;
}

/**
 * The current Pattern's Tags, shown and edited here rather than in the library
 * list. Tagging is something you do while looking at a Pattern, so on a phone it
 * should not require opening the drawer and finding its row.
 *
 * Three kinds, distinguished by whether they carry a removal control:
 * automatic (derived), built-in (the Pattern's own, if it ships with the app),
 * and the musician's own.
 */
function renderHeaderTags(pattern, state, handlers) {
  const wrap = el('div', 'header-tags');
  const tags = state.currentTags ?? { autoTags: [], lockedTags: [], userTags: [] };

  for (const t of tags.autoTags) {
    const chip = el('span', 'tag-chip automatic', { textContent: t });
    chip.dataset.automatic = 'true';
    wrap.appendChild(chip);
  }
  for (const t of tags.lockedTags) {
    const chip = el('span', 'tag-chip automatic locked', { textContent: t });
    chip.dataset.automatic = 'true';
    chip.dataset.locked = 'true';
    wrap.appendChild(chip);
  }
  for (const t of tags.userTags) {
    const chip = el('span', 'tag-chip user', { textContent: t });
    chip.dataset.automatic = 'false';
    const remove = el('button', 'tag-remove', { type: 'button', textContent: '×' });
    remove.dataset.action = 'remove-tag';
    remove.dataset.tag = t;
    remove.setAttribute('title', `Remove tag "${t}"`);
    remove.addEventListener('click', () => handlers.onRemoveTag?.(pattern.id, t));
    chip.appendChild(remove);
    wrap.appendChild(chip);
  }

  const add = el('button', 'tag-add', { type: 'button', textContent: '+ tag' });
  add.dataset.action = 'add-tag';
  add.setAttribute('title', 'Add a tag');
  add.addEventListener('click', () => handlers.onAddTagPrompt?.(pattern.id));
  wrap.appendChild(add);

  return wrap;
}

/** Play controls only — the primary transport, never collapsible. */
export function renderPlayControls(root, pattern, state, handlers) {
  root.innerHTML = '';
  root.className = 'controls play-controls';
  root.appendChild(renderTransport(state, handlers));
  return root;
}

/** Playback settings: tempo, swing, counting system. */
export function renderPlaybackSettings(root, pattern, state, handlers) {
  root.innerHTML = '';
  root.className = 'controls playback-settings';
  root.appendChild(renderTempo(pattern, handlers));
  root.appendChild(renderSwing(pattern, handlers));
  root.appendChild(renderCounting(pattern, state, handlers));
  return root;
}

/**
 * Edit controls: structure, subdivision, sound mode.
 *
 * Pitch is deliberately not here. It moved to the pitch strip beside the grid,
 * because a palette you have to expand a collapsed section to reach cannot be
 * aimed at while stamping (AC-2.2.13).
 */
export function renderEditControls(root, pattern, state, handlers) {
  root.innerHTML = '';
  root.className = 'controls edit-controls';
  root.appendChild(renderStructure(pattern, handlers));
  root.appendChild(renderSound(pattern, handlers));
  return root;
}

/** MIDI export and other whole-Pattern actions. */
export function renderActionControls(root, pattern, state, handlers) {
  root.innerHTML = '';
  root.className = 'controls action-controls';
  root.appendChild(renderActions(pattern, state, handlers));
  return root;
}

/** Whole-Pattern operations: copy, delete, append, duplicate, export, submit. */
function renderActions(pattern, state, handlers) {
  const group = el('div', 'control-group actions');

  const button = (action, label, onClick, { disabled = false } = {}) => {
    const b = el('button', 'action', { type: 'button', textContent: label, disabled });
    b.dataset.action = action;
    b.addEventListener('click', onClick);
    group.appendChild(b);
    return b;
  };

  // Make Copy and Delete apply only to a Pattern you own. A shipped Pattern has
  // neither control rather than disabled ones: editing it goes through the
  // forced-naming flow, which is a different action (AC-7.4.6, US-7.5).
  if (state.isOwned) {
    button('make-copy', 'Make Copy', () => handlers.onMakeCopy());
    button('delete-pattern', 'Delete', () => handlers.onDelete());
  }

  button('append-pattern', 'Append…', () => handlers.onAppendPrompt(), {
    disabled: pattern.measures.length >= MAX_MEASURES,
  });
  button('duplicate-pattern', 'Double Length', () => handlers.onDuplicate(), {
    disabled: pattern.measures.length * 2 > MAX_MEASURES,
  });
  button('export-midi', 'Export MIDI', () => handlers.onExportMidi());
  // The standing possible-duplicates view (AC-11.1.4). It is library-wide, not about the
  // current Pattern, but it lives here because this is where whole-Pattern operations
  // are — and AC-15.1.8 already accounts for the actions area holding them.
  button('show-duplicates', 'Duplicates…', () => handlers.onShowDuplicates());
  button('submit-pattern', 'Submit', () => handlers.onSubmit());

  return group;
}

/**
 * The current Pattern's Family members. AC-11.2.5, AC-15.1.8.
 *
 * Last in the main panel, because these are a way *out* of the current Pattern rather
 * than a control on it — putting them higher would separate the transport from the
 * controls it drives.
 *
 * Hidden below 768px by CSS keyed on the shell's `data-viewport`, not by checking the
 * width here: `applyViewport` updates that attribute on resize but nothing re-renders,
 * so a JS width check would be right on load and wrong the moment the window changed.
 *
 * Absent entirely when there are no members — an empty "no related Patterns" row is a
 * permanent piece of furniture reporting nothing.
 */
export function renderFamilyMembers(root, family, handlers) {
  root.innerHTML = '';
  root.className = 'family-members';
  root.hidden = family.length === 0;
  if (family.length === 0) return;

  root.appendChild(
    el('h2', 'family-title', {
      textContent: family.length === 1 ? 'Same rhythm, 1 other version' : `Same rhythm, ${family.length} other versions`,
    })
  );

  const list = el('ul', 'family-list');
  for (const member of family) {
    const item = el('li', 'family-item');
    const link = el('button', 'family-link', { type: 'button', textContent: member.name });
    link.dataset.action = 'load-family-member';
    link.dataset.patternId = member.id;
    // What differs is the whole point of the relationship, so name it rather than
    // leaving the musician to open each one to find out.
    link.appendChild(
      el('span', 'family-kind', { textContent: member.soundMode === 'melodic' ? 'Melodic' : 'Percussive' })
    );
    link.addEventListener('click', () => handlers.onOpen(member.id, member.owned));
    item.appendChild(link);
    list.appendChild(item);
  }
  root.appendChild(list);
}

/**
 * Swing, per straight-feel Subdivision Group of Beat 1.
 *
 * Triplet groups get no control at all — swing is inapplicable to triplet feel,
 * not merely unavailable, so showing a disabled slider would misdescribe it
 * (AC-4.4.3).
 */
function renderSwing(pattern, handlers) {
  const group = el('div', 'control-group');
  const measure = pattern.measures[0];
  const beat = measure.beats[0];
  const noteValue = beatNoteValue(measure.timeSignature);

  subdivisionGroups(beat.recipe, noteValue).forEach((g, groupIndex) => {
    if (g.feel !== 'straight') return;
    if (g.slotIndices.length % 2 !== 0) return; // odd groups have no midpoint to swing

    const value = beat.swing?.[groupIndex] ?? 0;
    const slider = el('input', 'swing-slider', {
      type: 'range',
      min: String(MIN_SWING),
      max: String(MAX_SWING),
      step: '1',
      value: String(value),
    });
    slider.dataset.action = 'set-swing';
    slider.dataset.group = String(groupIndex);
    slider.addEventListener('input', (e) => handlers.onSwing(groupIndex, Number(e.target.value)));
    group.appendChild(labelled(`Swing ${value}`, slider));
  });

  return group;
}

/**
 * The pitch strip: the palette a Melodic grid is stamped from (US-2.2).
 *
 * It holds one armed pitch — a degree, an accidental and an octave — and does
 * not itself touch the Pattern. Tapping a Slot's note band stamps whatever is
 * armed here onto that Slot (AC-2.2.6); changing what is armed alters nothing
 * already stamped (AC-2.2.9).
 *
 * It renders in its own section beside the grid rather than inside the Edit
 * accordion, because you cannot aim at a palette you have to open first
 * (AC-2.2.13). In Percussive mode it renders nothing at all.
 */
export function renderPitchStrip(root, pattern, state, handlers) {
  root.innerHTML = '';
  root.className = 'pitch-strip';
  root.hidden = pattern.soundMode !== 'melodic';
  if (root.hidden) return root;

  const armed = state.armedPitch ?? { degree: '1', octaveOffset: 0 };
  const [accidental, number] = splitDegree(armed.degree);

  root.appendChild(
    el('span', 'pitch-strip-label', {
      textContent: 'Note',
      title: 'Tap a note’s upper band in the grid to give it this pitch',
    })
  );

  // Accidental first, because it modifies the degree chosen next to it. Without
  // it the strip could not reach b3, #4 or b7, which the Degree dropdown it
  // replaces could — the strip's vocabulary must not be narrower (AC-2.2.4).
  const accidentals = el('div', 'accidental-group', { role: 'group' });
  accidentals.setAttribute('aria-label', 'Accidental');
  for (const [value, glyph, name] of [['b', '♭', 'Flat'], ['', '♮', 'Natural'], ['#', '♯', 'Sharp']]) {
    const b = el('button', 'accidental', { type: 'button', textContent: glyph });
    b.dataset.action = 'set-accidental';
    b.dataset.accidental = value;
    b.setAttribute('aria-label', name);
    b.setAttribute('aria-pressed', String(value === accidental));
    b.addEventListener('click', () => handlers.onArmDegree(degreeToken(number, value)));
    accidentals.appendChild(b);
  }
  root.appendChild(accidentals);

  // Degrees 1-8 always; 9-15 behind the extend control, so the common octave is
  // not buried in a fifteen-wide row on a phone (AC-2.2.4).
  const degrees = el('div', 'degree-group', { role: 'group' });
  degrees.setAttribute('aria-label', 'Scale degree');
  const shown = state.degreesExtended
    ? [...DEFAULT_DEGREES, ...EXTENDED_DEGREES]
    : DEFAULT_DEGREES;
  for (const d of shown) {
    const b = el('button', 'degree', { type: 'button', textContent: d });
    b.dataset.action = 'set-degree';
    b.dataset.degree = d;
    b.setAttribute('aria-pressed', String(d === number));
    b.addEventListener('click', () => handlers.onArmDegree(degreeToken(d, accidental)));
    degrees.appendChild(b);
  }
  root.appendChild(degrees);

  const extend = el('button', 'degree-extend', {
    type: 'button',
    textContent: state.degreesExtended ? '– 9–15' : '+ 9–15',
  });
  extend.dataset.action = 'toggle-extended-degrees';
  extend.setAttribute('aria-expanded', String(Boolean(state.degreesExtended)));
  extend.setAttribute('title', 'Show degrees 9 to 15');
  extend.addEventListener('click', () => handlers.onExtendDegrees());
  root.appendChild(extend);

  root.appendChild(renderOctaveStepper(armed, handlers));
  return root;
}

/**
 * Absolute octave, stepped one at a time and clamped at 1 and 7 (AC-2.2.3).
 * The Pattern stores an offset from the base octave; only this readout converts.
 */
function renderOctaveStepper(armed, handlers) {
  const group = el('div', 'octave-stepper', { role: 'group' });
  group.setAttribute('aria-label', 'Octave');

  const current = octaveNumber(armed.octaveOffset ?? 0);
  const step = (delta, label, name) => {
    const b = el('button', 'octave-step', { type: 'button', textContent: label });
    b.dataset.action = name;
    b.disabled = clampOctave(current + delta) === current;
    b.setAttribute('aria-label', `${name === 'octave-up' ? 'Raise' : 'Lower'} octave`);
    b.addEventListener('click', () =>
      handlers.onArmOctave(octaveOffsetFor(clampOctave(current + delta)))
    );
    return b;
  };

  group.appendChild(step(-1, '−', 'octave-down'));
  const readout = el('output', 'octave-readout', { textContent: `Oct ${current}` });
  readout.dataset.octave = String(current);
  group.appendChild(readout);
  group.appendChild(step(1, '+', 'octave-up'));

  return group;
}

function renderTransport(state, handlers) {
  const group = el('div', 'control-group');

  const play = el('button', 'transport primary', {
    type: 'button',
    textContent: state.isPlaying ? 'Stop' : 'Play',
  });
  play.dataset.action = state.isPlaying ? 'stop' : 'play';
  // Audio starts ONLY from this handler — a user gesture (FR-010, FR-011).
  play.addEventListener('click', () => (state.isPlaying ? handlers.onStop() : handlers.onPlay()));
  group.appendChild(play);

  const metronome = el('button', `toggle${state.settings.metronomeEnabled ? ' on' : ''}`, {
    type: 'button',
    textContent: 'Click',
  });
  metronome.dataset.action = 'toggle-metronome';
  metronome.addEventListener('click', () =>
    handlers.onSetting({ metronomeEnabled: !state.settings.metronomeEnabled })
  );
  group.appendChild(metronome);

  const countIn = el('button', `toggle${state.settings.countInEnabled ? ' on' : ''}`, {
    type: 'button',
    textContent: 'Count-in',
  });
  countIn.dataset.action = 'toggle-count-in';
  countIn.addEventListener('click', () =>
    handlers.onSetting({ countInEnabled: !state.settings.countInEnabled })
  );
  group.appendChild(countIn);

  return group;
}

function renderTempo(pattern, handlers) {
  const group = el('div', 'control-group');

  const slider = el('input', 'tempo-slider', {
    type: 'range',
    min: String(MIN_TEMPO),
    max: String(MAX_TEMPO),
    step: '1',
    value: String(pattern.tempo),
  });
  slider.dataset.action = 'set-tempo';
  // Changing tempo restarts playback at the new tempo (AC-4.2.2); the handler
  // owns that, not this control.
  slider.addEventListener('input', (e) => handlers.onTempo(Number(e.target.value)));
  group.appendChild(labelled(`Tempo ${pattern.tempo}`, slider));

  const presets = el('div', 'presets');
  for (const bpm of TEMPO_PRESETS) {
    const b = el('button', `preset${bpm === pattern.tempo ? ' on' : ''}`, {
      type: 'button',
      textContent: String(bpm),
    });
    b.dataset.action = 'preset-tempo';
    b.dataset.bpm = String(bpm);
    b.addEventListener('click', () => handlers.onTempo(bpm));
    presets.appendChild(b);
  }
  group.appendChild(presets);

  return group;
}

function renderStructure(pattern, handlers) {
  const group = el('div', 'control-group');

  const add = el('button', 'action', { type: 'button', textContent: '+ Measure' });
  add.dataset.action = 'add-measure';
  add.disabled = pattern.measures.length >= MAX_MEASURES;
  add.addEventListener('click', () => handlers.onAddMeasure());
  group.appendChild(add);

  // Recipe picker for a chosen Beat. The menu is whatever core/ offers for this
  // Beat's note value — five on a quarter-note Beat, two on an eighth.
  const measureIndex = 0;
  const noteValue = beatNoteValue(pattern.measures[measureIndex].timeSignature);
  const recipe = el('select', 'recipe-picker');
  recipe.dataset.action = 'set-recipe';
  for (const r of recipesFor(noteValue)) {
    recipe.appendChild(el('option', null, { value: r.id, textContent: r.label }));
  }
  recipe.value = pattern.measures[measureIndex].beats[0].recipe;
  recipe.addEventListener('change', (e) => handlers.onRecipe(e.target.value));
  group.appendChild(labelled('Subdivision', recipe));

  return group;
}

function renderSound(pattern, handlers) {
  const group = el('div', 'control-group');

  const mode = el('select', 'sound-mode');
  mode.dataset.action = 'set-sound-mode';
  for (const m of ['percussive', 'melodic']) {
    mode.appendChild(el('option', null, { value: m, textContent: m[0].toUpperCase() + m.slice(1) }));
  }
  mode.value = pattern.soundMode;
  mode.addEventListener('change', (e) => handlers.onSoundMode(e.target.value));
  group.appendChild(labelled('Sound', mode));

  // Key is meaningless in Percussive mode, so it is absent rather than
  // present-but-disabled (AC-2.1.x).
  if (pattern.soundMode === 'melodic') {
    const key = el('select', 'key-picker');
    key.dataset.action = 'set-key';
    for (const k of KEYS) key.appendChild(el('option', null, { value: k, textContent: k }));
    key.value = pattern.key ?? 'C';
    key.addEventListener('change', (e) => handlers.onKey(e.target.value));
    group.appendChild(labelled('Key', key));
  }

  return group;
}

function renderCounting(pattern, state, handlers) {
  const group = el('div', 'control-group');

  const select = el('select', 'counting-picker');
  select.dataset.action = 'set-counting';
  for (const s of COUNTING_SYSTEMS) {
    select.appendChild(el('option', null, { value: s, textContent: COUNTING_LABELS[s] }));
  }
  select.value = state.settings.countingSystem;
  select.addEventListener('change', (e) => handlers.onCountingSystem(e.target.value));
  group.appendChild(labelled('Counting', select));

  // Explain the override rather than silently ignoring the setting (AC-5.6.2).
  if (isForcedNumbered(pattern)) {
    const note = el('p', 'counting-note', {
      textContent: 'This Pattern mixes straight and triplet feel within a Beat, so it counts by number.',
    });
    note.dataset.forcedNumbered = 'true';
    group.appendChild(note);
  }

  return group;
}

export { TIME_SIGNATURES };
