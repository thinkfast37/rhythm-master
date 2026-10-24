/**
 * The Composer mode (US-19.1–US-19.9): a rhythm from the library under a
 * fretboard or a keyboard, recorded onto one syllable at a time.
 *
 * Layout, top to bottom: the record bar (instrument switch, Record, Delete,
 * Save and what is missing), the instrument view, the composing grid — notes
 * in the large box above, counting syllables in the small box below — and the
 * Composer's controls. Everything here is a pure function of `state.composer`,
 * the settings and the transport position; it holds no state of its own.
 */
import { el, rebuild, labelled, labelledRow, valueEntry, SWING_FEEL_LABELS } from './controls.js';
import { renderFretboard } from './fretboard.js';
import { renderPiano } from './piano.js';
import { KEYS, resolve } from '../core/pitch.js';
import { SCALES, DEFAULT_SCALE } from '../core/scales.js';
import { COUNTING_SYSTEMS, COUNTING_LABELS, measureLabels, effectiveSystem, isForcedNumbered } from '../core/counting.js';
import { MIN_TEMPO, MAX_TEMPO, MAX_MEASURES } from '../core/pattern.js';
import { MIN_SWING, MAX_SWING, DEFAULT_SWING_FEEL } from '../core/swing.js';
import { beatNoteValue } from '../core/meter.js';
import { subdivisionGroups } from '../core/recipes.js';
import { effectiveAccent, defaultAccent } from '../core/accents.js';
import { LABEL_MODES, LABEL_MODE_LABELS, MAX_CAPO, FRET_COUNT } from '../core/fretboard.js';
import { KEY_COUNTS, rangeFor, keyName } from '../core/piano.js';
import {
  describeNote,
  recordTarget,
  previousSounding,
  missingCount,
  isComplete,
  canDuplicate,
  sameSlot,
} from '../core/composer.js';
import { ATTRIBUTION } from '../audio/guitar.js';

const ACCENT_CLASS = { 0: 'off', 1: 'weak', 2: 'medium', 3: 'strong' };

/** Whether the composition holds work the library does not (AC-19.1.4). */
export function composerUnsaved(composer) {
  const draft = composer?.draft;
  if (!draft) return false;
  if (!composer.savedId) return true;
  return !isComplete(draft);
}

function button(className, text, action, props = {}) {
  const b = el('button', className, { type: 'button', textContent: text, ...props });
  b.dataset.action = action;
  return b;
}

/**
 * Render the whole mode into `root`. Empty and hidden in Practice, so none of
 * its controls are in the document to be found there.
 */
export function renderComposer(root, state, handlers) {
  const composer = state.composer;
  const active = composer.mode === 'composer';
  root.className = 'composer-panel';
  root.hidden = !active;
  if (!active) {
    root.replaceChildren();
    return root;
  }
  const draft = composer.draft;
  const key = draft?.key ?? 'C';
  const scale = draft?.scale ?? DEFAULT_SCALE;
  const instrument = state.settings.composerInstrument === 'piano' ? 'piano' : 'guitar';
  root.dataset.instrument = instrument;
  root.dataset.recording = String(Boolean(composer.recording));
  root.dataset.loaded = String(Boolean(draft));

  return rebuild(root, (fresh) => {
    fresh.appendChild(renderBar(composer, draft, instrument, state, handlers));
    fresh.appendChild(renderInstrument(instrument, key, scale, state, handlers));
    if (draft) fresh.appendChild(renderComposingGrid(draft, composer, state));
    else {
      const empty = el('p', 'composer-empty', {
        textContent: 'Choose a rhythm from the library to compose on. Its syllables will appear here; Record fills them from the instrument above.',
      });
      empty.dataset.empty = 'true';
      fresh.appendChild(empty);
    }
    fresh.appendChild(renderControls(draft, instrument, key, scale, state, handlers));
    const credit = el('p', 'composer-attribution');
    credit.dataset.attribution = 'guitar-samples';
    credit.append(
      'Guitar samples: FluidR3_GM SoundFont by Frank Wen, served via ',
      el('a', null, { href: ATTRIBUTION.sourceUrl, target: '_blank', rel: 'noopener noreferrer', textContent: 'gleitz/midi-js-soundfonts' }),
      ', licensed ',
      el('a', null, { href: ATTRIBUTION.licenseUrl, target: '_blank', rel: 'noopener noreferrer', textContent: 'CC BY 3.0' }),
      '.'
    );
    fresh.appendChild(credit);
  });
}

/** The record bar: instrument, Record, Delete, Save, and the composition's standing. */
function renderBar(composer, draft, instrument, state, handlers) {
  const bar = el('div', 'composer-bar');

  const sw = el('div', 'instrument-switch', { role: 'group' });
  sw.setAttribute('aria-label', 'Instrument');
  sw.dataset.instrument = instrument;
  for (const [id, label] of [
    ['guitar', 'Guitar'],
    ['piano', 'Piano'],
  ]) {
    const b = button('mode-option', label, 'set-instrument');
    b.dataset.instrument = id;
    b.setAttribute('aria-pressed', String(instrument === id));
    b.addEventListener('click', () => {
      if (instrument !== id) handlers.onComposerInstrument?.(id);
    });
    sw.appendChild(b);
  }
  bar.appendChild(sw);

  const name = el('span', 'composer-name', { textContent: draft ? draft.name : 'No rhythm chosen' });
  name.dataset.name = draft?.name ?? '';
  bar.appendChild(name);

  const recording = Boolean(composer.recording);
  const canRecord = Boolean(draft) && (recording || recordTarget(draft) !== null);
  const record = button(`record${recording ? ' on' : ''}`, recording ? 'Recording…' : 'Record', 'record', {
    disabled: !canRecord,
  });
  record.setAttribute('aria-pressed', String(recording));
  record.setAttribute(
    'title',
    !draft
      ? 'Choose a rhythm from the library first'
      : canRecord
        ? recording
          ? 'Stop recording, keeping what is recorded'
          : 'Record: fill each syllable without a note from the instrument'
        : 'Every syllable has a note — tap a syllable to change it'
  );
  record.addEventListener('click', () => handlers.onRecord?.());
  bar.appendChild(record);
  if (draft && !recording && recordTarget(draft) === null) {
    const hint = el('span', 'record-hint', { textContent: 'Every syllable has a note' });
    hint.dataset.hint = 'complete';
    bar.appendChild(hint);
  }

  const deletable = draft
    ? recording
      ? composer.target && previousSounding(draft, composer.target) !== null
      : Boolean(composer.selected)
    : false;
  const del = button('composer-delete', 'Delete', 'composer-delete', { disabled: !deletable });
  del.setAttribute(
    'title',
    recording ? 'Clear the note before the highlighted syllable and step back to it' : 'Clear the selected syllable’s note'
  );
  del.addEventListener('click', () => handlers.onComposerDelete?.());
  bar.appendChild(del);

  const missing = draft ? missingCount(draft) : 0;
  const complete = Boolean(draft) && missing === 0;
  const saved = Boolean(composer.savedId);
  const save = button('composer-save', saved ? (complete ? 'Saved' : 'Save') : 'Save', 'composer-save', {
    disabled: !draft || !complete || saved,
  });
  save.dataset.saved = String(saved);
  save.setAttribute(
    'title',
    !draft
      ? 'Choose a rhythm from the library first'
      : !complete
        ? `${missing} ${missing === 1 ? 'syllable has' : 'syllables have'} no note yet`
        : saved
          ? 'Saved — every change saves on its own'
          : 'Add this composition to the library'
  );
  save.addEventListener('click', () => handlers.onComposerSave?.());
  bar.appendChild(save);

  if (draft && missing > 0) {
    const m = el('span', 'composer-missing', { textContent: `${missing} ${missing === 1 ? 'note' : 'notes'} missing` });
    m.dataset.missing = String(missing);
    bar.appendChild(m);
  }
  if (draft && composerUnsaved(composer)) {
    const u = el('span', 'composer-unsaved', { textContent: saved ? 'Unsaved changes' : 'Not yet saved' });
    u.dataset.unsaved = saved ? 'changes' : 'new';
    bar.appendChild(u);
  }

  // The guitar's samples: on their way, or not coming (AC-19.7.2).
  if (instrument === 'guitar') {
    const status = composer.guitar?.status ?? 'idle';
    if (status === 'loading' || status === 'error') {
      const s = el('span', `guitar-status ${status}`);
      s.dataset.status = status;
      s.setAttribute('role', 'status');
      s.append(
        status === 'loading'
          ? 'Loading guitar samples… the synth voice sounds meanwhile.'
          : 'Guitar samples didn’t load — the synth voice is sounding instead. '
      );
      if (status === 'error') {
        const retry = button('guitar-retry', 'Retry', 'guitar-retry');
        retry.addEventListener('click', () => handlers.onGuitarRetry?.());
        s.appendChild(retry);
      }
      bar.appendChild(s);
    }
  }

  if (composer.notice) {
    const n = el('p', 'composer-notice', { textContent: composer.notice });
    n.dataset.notice = 'true';
    bar.appendChild(n);
  }
  return bar;
}

function renderInstrument(instrument, key, scale, state, handlers) {
  const wrap = el('div', 'composer-instrument');
  wrap.dataset.instrument = instrument;
  const model = { key, scale, labelMode: state.settings.composerLabelMode ?? 'notes' };
  const onNote = (midi) => handlers.onInstrumentNote?.(midi);
  if (instrument === 'guitar') {
    renderFretboard(wrap, { ...model, capo: state.settings.composerCapo ?? 0, range: state.settings.composerFretRange ?? [0, FRET_COUNT] }, { onNote });
  } else {
    renderPiano(wrap, { ...model, count: state.settings.composerKeys ?? 49, widthPx: state.composer.widthPx ?? 0 }, { onNote });
  }
  return wrap;
}

/**
 * The composing grid: the note first, the syllable under it (AC-19.5.1).
 * Measures stack as the grid's do; a Slot's two boxes are two buttons, so each
 * has its own hit area and accessible name.
 */
function renderComposingGrid(draft, composer, state) {
  const grid = el('div', 'composer-grid');
  grid.dataset.measures = String(draft.measures.length);
  const system = effectiveSystem(draft, state.settings.countingSystem ?? 'takadimi');
  const position = state.isPlaying ? state.transportPosition : null;

  draft.measures.forEach((measure, measureIndex) => {
    const row = el('section', 'measure');
    row.dataset.measure = String(measureIndex);
    row.dataset.timeSignature = measure.timeSignature;
    row.appendChild(el('span', 'measure-meter prominent', { textContent: measure.timeSignature }));
    const beats = el('div', 'beats');
    beats.style.setProperty('--beat-count', String(measure.beats.length));
    const noteValue = beatNoteValue(measure.timeSignature);
    const labels = measureLabels(measure, system);
    measure.beats.forEach((beat, beatIndex) => {
      const beatEl = el('div', 'beat');
      beatEl.dataset.beat = String(beatIndex);
      beatEl.dataset.recipe = beat.recipe;
      subdivisionGroups(beat.recipe, noteValue).forEach((group, groupIndex) => {
        const groupEl = el('div', `group feel-${group.feel}`);
        groupEl.dataset.group = String(groupIndex);
        for (const slotIndex of group.slotIndices) {
          groupEl.appendChild(
            renderComposingSlot(draft, measure, measureIndex, beatIndex, slotIndex, labels[beatIndex][slotIndex], composer, position)
          );
        }
        beatEl.appendChild(groupEl);
      });
      beats.appendChild(beatEl);
    });
    row.appendChild(beats);
    grid.appendChild(row);
  });
  return grid;
}

function renderComposingSlot(draft, measure, measureIndex, beatIndex, slotIndex, label, composer, position) {
  const at = { measureIndex, beatIndex, slotIndex };
  const slot = measure.beats[beatIndex].slots[slotIndex];
  const accent = effectiveAccent(measure, beatIndex, slotIndex);
  const hasNote = Boolean(slot.on && slot.pitch);
  const isTarget = Boolean(composer.recording) && sameSlot(composer.target, at);
  const isSelected = !composer.recording && sameSlot(composer.selected, at);
  const isPlaying =
    position && position.measureIndex === measureIndex && position.beatIndex === beatIndex && position.slotIndex === slotIndex;

  const classes = ['slot', 'cslot', `accent-${ACCENT_CLASS[accent]}`];
  if (hasNote) classes.push('has-note');
  if (slot.on && !hasNote) classes.push('unpitched');
  if (isTarget) classes.push('target');
  if (isSelected) classes.push('selected');
  if (isPlaying) classes.push('playing');
  const cell = el('div', classes.join(' '));
  cell.dataset.measure = String(measureIndex);
  cell.dataset.beat = String(beatIndex);
  cell.dataset.slot = String(slotIndex);
  cell.dataset.accent = String(accent);
  cell.dataset.metric = String(defaultAccent(measure, beatIndex, slotIndex));
  cell.dataset.target = String(isTarget);
  cell.dataset.selected = String(isSelected);

  // The note box: large, first, and what a tap selects (AC-19.5.1/1, AC-19.5.2/1).
  // Not `disabled` on a silent Slot: a tap there clears the selection
  // (AC-19.5.2/4), so it must still be a tap; aria says it holds nothing.
  const note = el('button', `cslot-note${slot.on ? '' : ' silent'}`, { type: 'button' });
  if (!slot.on) note.setAttribute('aria-disabled', 'true');
  note.dataset.action = 'select-note';
  note.dataset.measure = String(measureIndex);
  note.dataset.beat = String(beatIndex);
  note.dataset.slot = String(slotIndex);
  if (hasNote) {
    const described = describeNote(resolveMidi(slot.pitch, draft.key), draft.key, draft.scale ?? DEFAULT_SCALE);
    note.dataset.noteName = described.fullName;
    note.dataset.degree = slot.pitch.degree;
    note.appendChild(el('span', 'cslot-name', { textContent: described.fullName }));
    note.appendChild(el('span', 'cslot-degree', { textContent: slot.pitch.degree }));
    note.setAttribute('aria-label', `${described.fullName}, degree ${slot.pitch.degree}; tap to select`);
  } else if (slot.on) {
    note.dataset.noteName = '';
    note.appendChild(el('span', 'cslot-empty', { textContent: '—' }));
    note.setAttribute('aria-label', 'No note yet; tap to select');
  } else {
    note.setAttribute('aria-label', 'Silent');
  }
  if (isTarget) note.setAttribute('aria-current', 'true');
  cell.appendChild(note);

  // The syllable box: the grid's own accent cycle (AC-19.5.3/1).
  const syl = el('button', 'cslot-syllable', { type: 'button' });
  syl.dataset.action = 'cycle-syllable';
  syl.dataset.measure = String(measureIndex);
  syl.dataset.beat = String(beatIndex);
  syl.dataset.slot = String(slotIndex);
  const fill = el('span', 'slot-fill');
  fill.style.width = `${[0, 33, 67, 100][accent]}%`;
  const text = el('span', 'slot-label', { textContent: slot.on ? label : '·' });
  text.dataset.syllable = label;
  if (!slot.on) text.dataset.rest = 'true';
  syl.append(fill, text);
  syl.setAttribute('aria-label', `${label}: ${slot.on ? 'sounding' : 'silent'}; tap to change`);
  cell.appendChild(syl);
  return cell;
}

/** `describeNote` wants the MIDI note the stored Pitch sounds. */
function resolveMidi(pitch, key) {
  return resolve(pitch, key).midiNote;
}

/** The Composer's controls: the instrument's, then the composition's. */
function renderControls(draft, instrument, key, scale, state, handlers) {
  const wrap = el('div', 'controls composer-controls');

  const keyPicker = el('select', 'composer-key', { disabled: !draft });
  keyPicker.dataset.action = 'composer-key';
  keyPicker.setAttribute('aria-label', 'Scale root');
  for (const k of KEYS) keyPicker.appendChild(el('option', null, { value: k, textContent: k }));
  keyPicker.value = key;
  keyPicker.addEventListener('change', (e) => handlers.onComposerKey?.(e.target.value));
  wrap.appendChild(labelled('Scale root', keyPicker));

  const scalePicker = el('select', 'composer-scale', { disabled: !draft });
  scalePicker.dataset.action = 'composer-scale';
  scalePicker.setAttribute('aria-label', 'Scale');
  let group = null;
  for (const s of SCALES) {
    if (group?.label !== s.category) {
      group = el('optgroup', null, { label: s.category });
      scalePicker.appendChild(group);
    }
    group.appendChild(el('option', null, { value: s.id, textContent: s.label }));
  }
  scalePicker.value = scale;
  scalePicker.addEventListener('change', (e) => handlers.onComposerScale?.(e.target.value));
  wrap.appendChild(labelled('Scale', scalePicker));

  const labelMode = el('select', 'label-mode-picker');
  labelMode.dataset.action = 'composer-label-mode';
  labelMode.setAttribute('aria-label', 'Label mode');
  for (const m of LABEL_MODES) labelMode.appendChild(el('option', null, { value: m, textContent: LABEL_MODE_LABELS[m] }));
  labelMode.value = state.settings.composerLabelMode ?? 'notes';
  labelMode.addEventListener('change', (e) => handlers.onComposerSetting?.({ composerLabelMode: e.target.value }));
  wrap.appendChild(labelled('Labels', labelMode));

  if (instrument === 'guitar') {
    const capo = el('select', 'capo-picker');
    capo.dataset.action = 'composer-capo';
    capo.setAttribute('aria-label', 'Capo');
    for (let f = 0; f <= MAX_CAPO; f++) capo.appendChild(el('option', null, { value: String(f), textContent: f === 0 ? 'None' : `Fret ${f}` }));
    capo.value = String(state.settings.composerCapo ?? 0);
    capo.addEventListener('change', (e) => handlers.onComposerCapo?.(Number(e.target.value)));
    wrap.appendChild(labelled('Capo', capo));

    const [lower, upper] = state.settings.composerFretRange ?? [0, FRET_COUNT];
    const lo = valueEntry('fret-lower', {
      min: 0,
      max: FRET_COUNT,
      value: lower,
      label: 'Lowest visible fret',
      action: 'composer-fret-lower',
      onCommit: (n) => handlers.onComposerFretRange?.([n, upper]),
    });
    const hi = valueEntry('fret-upper', {
      min: 0,
      max: FRET_COUNT,
      value: upper,
      label: 'Highest visible fret',
      action: 'composer-fret-upper',
      onCommit: (n) => handlers.onComposerFretRange?.([lower, n]),
    });
    const range = labelledRow(`Visible frets ${lower}–${upper}`, lo, el('span', 'range-dash', { textContent: 'to' }), hi);
    range.classList.add('fret-range');
    wrap.appendChild(range);
  } else {
    const keys = el('select', 'keys-picker');
    keys.dataset.action = 'composer-keys';
    keys.setAttribute('aria-label', 'Keys');
    for (const n of KEY_COUNTS) {
      const r = rangeFor(n);
      keys.appendChild(el('option', null, { value: String(n), textContent: `${n} keys (${keyName(r.low)}–${keyName(r.high)})` }));
    }
    keys.value = String(state.settings.composerKeys ?? 49);
    keys.addEventListener('change', (e) => handlers.onComposerSetting?.({ composerKeys: Number(e.target.value) }));
    wrap.appendChild(labelled('Keys', keys));
  }

  const counting = el('select', 'composer-counting');
  counting.dataset.action = 'composer-counting';
  counting.setAttribute('aria-label', 'Counting');
  for (const s of COUNTING_SYSTEMS) counting.appendChild(el('option', null, { value: s, textContent: COUNTING_LABELS[s] }));
  counting.value = state.settings.countingSystem;
  counting.addEventListener('change', (e) => handlers.onCountingSystem?.(e.target.value));
  wrap.appendChild(labelled('Counting', counting));
  if (draft && isForcedNumbered(draft)) {
    wrap.appendChild(el('p', 'counting-note', { textContent: 'This rhythm mixes straight and triplet feel within a Beat, so it counts by pulse.' }));
  }

  if (draft) {
    const tempoEntry = valueEntry('composer-tempo-entry', {
      min: MIN_TEMPO,
      max: MAX_TEMPO,
      value: draft.tempo,
      label: 'Tempo in BPM',
      action: 'composer-tempo-exact',
      onCommit: (bpm) => handlers.onComposerTempo?.(bpm),
    });
    const tempo = el('input', 'composer-tempo', {
      type: 'range',
      min: String(MIN_TEMPO),
      max: String(MAX_TEMPO),
      step: '1',
      value: String(draft.tempo),
    });
    tempo.dataset.action = 'composer-tempo';
    tempo.setAttribute('aria-label', 'Tempo');
    tempo.addEventListener('input', (e) => handlers.onComposerTempo?.(Number(e.target.value)));
    wrap.appendChild(labelledRow(`Tempo ${draft.tempo}`, tempoEntry, tempo));

    const feel = el('select', 'composer-swing-feel');
    feel.dataset.action = 'composer-swing-feel';
    feel.setAttribute('aria-label', 'Swing feel');
    for (const [value, label] of SWING_FEEL_LABELS) feel.appendChild(el('option', null, { value, textContent: label }));
    feel.value = draft.swingFeel ?? DEFAULT_SWING_FEEL;
    feel.addEventListener('change', (e) => handlers.onComposerSwingFeel?.(e.target.value));
    wrap.appendChild(labelled('Swing feel', feel));

    const amount = draft.swingAmount ?? 0;
    const swingEntry = valueEntry('composer-swing-entry', {
      min: MIN_SWING,
      max: MAX_SWING,
      value: amount,
      label: 'Swing amount',
      action: 'composer-swing-exact',
      onCommit: (n) => handlers.onComposerSwing?.(n),
    });
    const swing = el('input', 'composer-swing', {
      type: 'range',
      min: String(MIN_SWING),
      max: String(MAX_SWING),
      step: '1',
      value: String(amount),
    });
    swing.dataset.action = 'composer-swing';
    swing.setAttribute('aria-label', 'Swing');
    swing.addEventListener('input', (e) => handlers.onComposerSwing?.(Number(e.target.value)));
    wrap.appendChild(labelledRow(`Swing ${amount}`, swingEntry, swing));

    const dup = button('action composer-duplicate', 'Double Length', 'composer-duplicate', { disabled: !canDuplicate(draft) });
    dup.setAttribute('title', canDuplicate(draft) ? 'Repeat the rhythm after itself; the copy has no notes yet' : `A Pattern may hold at most ${MAX_MEASURES} Measures`);
    dup.addEventListener('click', () => handlers.onComposerDuplicate?.());
    wrap.appendChild(labelled('Measures', dup));
  }
  return wrap;
}

/** Move the playback cursor in the composing grid without rebuilding it. */
export function moveComposerCursor(root, position) {
  const grid = root.querySelector('.composer-grid');
  if (!grid) return root;
  const previous = grid.querySelector('.slot.playing');
  const next = position
    ? grid.querySelector(
        `.slot[data-measure="${position.measureIndex}"][data-beat="${position.beatIndex}"][data-slot="${position.slotIndex}"]`
      )
    : null;
  if (previous === next) return root;
  previous?.classList.remove('playing');
  next?.classList.add('playing');
  return root;
}
