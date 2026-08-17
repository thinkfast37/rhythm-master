/**
 * Editing and transport controls.
 *
 * Every control here dispatches a mutation and lets the one grid re-render
 * (Principle II). None of them computes musical values — Slot counts, accents,
 * and Recipe menus all come from core/.
 */
import { TIME_SIGNATURES, beatNoteValue } from '../core/meter.js';
import { recipesFor } from '../core/recipes.js';
import { KEYS } from '../core/pitch.js';
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
  if (pattern.soundMode === 'melodic') root.appendChild(renderPitch(pattern, state, handlers));
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

  if (handlers.onUndo) {
    const undoButton = el('button', 'undo', { type: 'button', textContent: 'Undo' });
    undoButton.dataset.action = 'undo';
    undoButton.disabled = !state.canUndo;
    undoButton.addEventListener('click', () => handlers.onUndo());
    root.appendChild(undoButton);
  }
  root.appendChild(
    el('p', 'pattern-meta', {
      textContent:
        `${state.isOwned ? 'Yours' : 'Ships with the app'} · ` +
        `${pattern.measures.length} measure${pattern.measures.length === 1 ? '' : 's'} · ` +
        `${pattern.measures.map((m) => m.timeSignature).join(', ')}`,
    })
  );
  return root;
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

/** Edit controls: structure, subdivision, sound mode, pitch. */
export function renderEditControls(root, pattern, state, handlers) {
  root.innerHTML = '';
  root.className = 'controls edit-controls';
  root.appendChild(renderStructure(pattern, handlers));
  root.appendChild(renderSound(pattern, handlers));
  if (pattern.soundMode === 'melodic') root.appendChild(renderPitch(pattern, state, handlers));
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
  button('submit-pattern', 'Submit', () => handlers.onSubmit());

  return group;
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
 * Per-Slot pitch entry. Applies to whichever Slot is selected in the grid;
 * degree and octave are separate controls because they are separate musical
 * decisions (US-2.2).
 */
function renderPitch(pattern, state, handlers) {
  const group = el('div', 'control-group pitch-group');
  const target = state.selectedSlot;

  if (!target) {
    group.appendChild(el('p', 'pitch-hint', { textContent: 'Select a note to set its pitch.' }));
    return group;
  }

  const slot = pattern.measures[target.measureIndex].beats[target.beatIndex].slots[target.slotIndex];
  const pitch = slot.pitch ?? { degree: '1', octaveOffset: 0 };

  const degree = el('select', 'degree-picker');
  degree.dataset.action = 'set-degree';
  for (const d of ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7', '9', '11', '13']) {
    degree.appendChild(el('option', null, { value: d, textContent: d }));
  }
  degree.value = pitch.degree;
  degree.addEventListener('change', (e) =>
    handlers.onPitch({ ...pitch, degree: e.target.value })
  );
  group.appendChild(labelled('Degree', degree));

  const octave = el('select', 'octave-picker');
  octave.dataset.action = 'set-octave';
  for (const o of [-2, -1, 0, 1, 2]) {
    octave.appendChild(el('option', null, { value: String(o), textContent: o > 0 ? `+${o}` : String(o) }));
  }
  octave.value = String(pitch.octaveOffset ?? 0);
  octave.addEventListener('change', (e) =>
    handlers.onPitch({ ...pitch, octaveOffset: Number(e.target.value) })
  );
  group.appendChild(labelled('Octave', octave));

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
