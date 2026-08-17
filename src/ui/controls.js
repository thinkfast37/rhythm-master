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
  root.appendChild(renderCounting(pattern, state, handlers));

  return root;
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
