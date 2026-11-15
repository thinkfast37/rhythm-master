/**
 * The Layers section of the Composer (US-19.11): the composition first, then
 * each library Pattern layered under it with its kind, its repeats in the
 * combined loop, Mute and Remove; the loop readout; Add layer; and the saved
 * Arrangements with Save, New, Load, Rename and Delete. A pure function of
 * `state.composer`, the stores' lists and the Patterns the handlers resolve.
 */
import { el, valueEntry } from './controls.js';
import { INSTRUMENTS, MIN_VOLUME, MAX_VOLUME, DEFAULT_VOLUME, normaliseVolume, volumeDb } from '../core/voice.js';
import { layered, layerKind, MAX_LAYERS } from '../core/arrangement.js';
import { isComplete } from '../core/composer.js';

const KIND_LABELS = { rhythm: 'rhythm', melody: 'melody', chords: 'chords' };

function button(className, text, action, props = {}) {
  const b = el('button', className, { type: 'button', textContent: text, ...props });
  b.dataset.action = action;
  return b;
}

/** Whether the parts differ from the Arrangement they were loaded from, or are new (AC-19.11.4/4). */
export function arrangementUnsaved(composer) {
  const layers = composer?.layers ?? [];
  const arrangement = composer?.arrangement;
  if (!arrangement?.id) return layers.length > 0;
  const own = { patternId: composer.savedId ?? null, muted: false, instrument: composer.instrument, volume: composer.volume };
  const at = Math.min(Math.max(0, composer.activeIndex ?? 0), layers.length);
  const now = {
    // Each part's instrument and volume are part of what is saved (AC-19.12.4/2).
    parts: [...layers.slice(0, at), own, ...layers.slice(at)].map((l) => ({
      patternId: l.patternId ?? null,
      muted: Boolean(l.muted),
      instrument: l.instrument ?? null,
      volume: l.volume ?? null,
    })),
    active: at,
  };
  return JSON.stringify(now) !== JSON.stringify(arrangement.saved ?? null);
}

/**
 * A part's instrument and volume (US-19.12): a picker on every part that can
 * sound a pitched note — the part on screen, a melody, a chord layer — and
 * none on a percussive layer (AC-19.12.2/1); a volume slider and number box on
 * every part, showing one value (AC-19.12.3/1). The listeners read the part's
 * place from the element, which the keep-alive rebuild may carry across renders.
 */
function renderSound(item, part, index, handlers) {
  const pitched = part.active || layerKind(part.pattern) !== 'rhythm';
  item.dataset.instrument = pitched ? part.sounds : '';
  if (pitched) {
    const picker = el('select', 'layer-instrument');
    picker.dataset.action = 'layer-instrument';
    picker.dataset.layer = String(index);
    picker.setAttribute('aria-label', `Instrument for ${part.pattern.name}`);
    for (const i of INSTRUMENTS) picker.appendChild(el('option', null, { value: i.id, textContent: i.label }));
    picker.value = part.sounds;
    picker.addEventListener('change', (e) => handlers.onPartInstrument?.(Number(e.target.dataset.layer), e.target.value));
    item.appendChild(picker);
  }

  const level = normaliseVolume(part.level ?? DEFAULT_VOLUME);
  item.dataset.volume = String(level);
  const volume = el('span', 'layer-volume');
  volume.title = `Volume ${level} of ${MAX_VOLUME}: ${level === MAX_VOLUME ? 'full level' : `${Math.abs(volumeDb(level)).toFixed(1)} dB under full`}`;
  const slider = el('input', 'layer-volume-slider', { type: 'range', min: String(MIN_VOLUME), max: String(MAX_VOLUME), step: '1', value: String(level) });
  slider.dataset.action = 'layer-volume';
  slider.dataset.layer = String(index);
  slider.setAttribute('aria-label', `Volume for ${part.pattern.name}`);
  slider.addEventListener('input', (e) => handlers.onPartVolume?.(Number(e.target.dataset.layer), Number(e.target.value)));
  volume.appendChild(slider);
  const entry = valueEntry('layer-volume-entry', {
    min: MIN_VOLUME,
    max: MAX_VOLUME,
    value: level,
    label: `Volume for ${part.pattern.name}, ${MIN_VOLUME} to ${MAX_VOLUME}`,
    action: 'layer-volume-entry',
    onCommit: (v) => handlers.onPartVolume?.(index, v),
  });
  entry.dataset.layer = String(index);
  volume.appendChild(entry);
  item.appendChild(volume);
}

/**
 * @param {object} state
 * @param {object} handlers  `patternById(id)` resolves a layer; the rest act
 */
export function renderLayers(state, handlers) {
  const composer = state.composer;
  const draft = composer.draft;
  const wrap = el('section', 'composer-layers');
  wrap.dataset.layers = String(composer.layers?.length ?? 0);
  wrap.dataset.composition = String(Boolean(draft));
  wrap.setAttribute('aria-label', 'Layers');
  // No composition: nothing to layer under, only saved Arrangements to open (AC-19.11.1/5).
  if (!draft) {
    const head = el('div', 'layers-head');
    head.appendChild(el('h3', 'layers-title', { textContent: 'Layers' }));
    wrap.appendChild(head);
    wrap.appendChild(renderSaved(state, handlers));
    return wrap;
  }

  const head = el('div', 'layers-head');
  head.appendChild(el('h3', 'layers-title', { textContent: 'Layers' }));
  const arrangement = composer.arrangement;
  if (arrangement?.id) {
    const name = el('span', 'layers-arrangement-name', { textContent: arrangement.name });
    name.dataset.arrangementName = arrangement.name;
    head.appendChild(name);
  }
  if (arrangementUnsaved(composer)) {
    const u = el('span', 'layers-unsaved', { textContent: arrangement?.id ? 'unsaved changes' : 'not yet saved' });
    u.dataset.unsaved = arrangement?.id ? 'changes' : 'new';
    head.appendChild(u);
  }
  wrap.appendChild(head);

  // Every part in order, the one on screen among them (AC-19.11.6/5); a part
  // whose Pattern no longer resolves is shown as missing.
  const all = handlers.parts?.() ?? [];
  const active = all.find((p) => p.active) ?? { pattern: draft, active: true, muted: false };
  const others = all.filter((p) => !p.active);
  const playable = others.filter((p) => p.pattern);
  const set = layered(active.pattern, playable);
  const repeatsOf = new Map(playable.map((p, i) => [p, set.layers[i + 1].repeats]));
  repeatsOf.set(active, set.layers[0].repeats);

  const list = el('ol', 'layer-list');
  all.forEach((part, index) => {
    const item = el('li', `layer-item${part.active ? ' composition active' : ''}${part.muted ? ' muted' : ''}${part.pattern ? '' : ' missing'}`);
    item.dataset.layer = String(index);
    item.dataset.patternId = part.id ?? '';
    item.dataset.active = String(Boolean(part.active));
    item.dataset.muted = String(Boolean(part.muted));
    // The name is the way onto the screen (AC-19.11.6/1); the part there is marked.
    const name = button('layer-name layer-pick', part.pattern ? part.pattern.name : 'Missing Pattern', 'layer-pick', {
      disabled: Boolean(part.active) || !part.pattern,
      title: part.active ? 'On screen now' : 'Put this part in the composing grid, to see and record its notes',
    });
    name.dataset.layer = String(index);
    name.setAttribute('aria-pressed', String(Boolean(part.active)));
    name.addEventListener('click', () => handlers.onLayerActivate?.(index));
    item.appendChild(name);
    if (part.pattern) {
      const kind = part.active ? 'composition' : layerKind(part.pattern);
      const k = el('span', 'layer-kind', { textContent: part.active ? 'on screen' : KIND_LABELS[kind] });
      k.dataset.kind = kind;
      item.appendChild(k);
      if (!part.id) {
        const u = el('span', 'layer-part-unsaved', { textContent: 'not saved' });
        u.dataset.partUnsaved = 'true';
        item.appendChild(u);
      }
      const r = el('span', 'layer-repeats', { textContent: `×${repeatsOf.get(part)}` });
      r.dataset.repeats = String(repeatsOf.get(part));
      item.appendChild(r);
    }
    if (part.pattern) renderSound(item, part, index, handlers);
    if (!part.active) {
      const mute = button(`layer-mute${part.muted ? ' on' : ''}`, part.muted ? 'Unmute' : 'Mute', 'layer-mute', {
        title: part.muted ? 'Hear this part again' : 'Silence this part; it still counts in the loop',
      });
      mute.dataset.layer = String(index);
      mute.setAttribute('aria-pressed', String(Boolean(part.muted)));
      mute.addEventListener('click', () => handlers.onLayerMute?.(index, !part.muted));
      item.appendChild(mute);
      const remove = button('layer-remove', 'Remove', 'layer-remove', { title: 'Take this part out' });
      remove.dataset.layer = String(index);
      remove.addEventListener('click', () => handlers.onLayerRemove?.(index));
      item.appendChild(remove);
    }
    list.appendChild(item);
  });
  wrap.appendChild(list);

  const resolved = others;
  if (resolved.length === 0) {
    const empty = el('p', 'layers-empty', { textContent: 'No layers yet. Add layer puts a library Pattern under the composition, repeating to fill the loop.' });
    empty.dataset.empty = 'true';
    wrap.appendChild(empty);
  } else {
    const passes = set.layers[0].repeats;
    const loop = el('p', 'layers-loop', {
      textContent: `Loop: ${passes} ${passes === 1 ? 'pass' : 'passes'} of the part on screen — ${all
        .filter((p) => p.pattern)
        .map((p) => `${p.pattern.name} ×${repeatsOf.get(p)}`)
        .join(', ')}`,
    });
    loop.dataset.passes = String(passes);
    wrap.appendChild(loop);
  }

  const actions = el('div', 'layers-actions');
  const atCap = (composer.layers?.length ?? 0) >= MAX_LAYERS;
  const picking = Boolean(composer.pickingLayer);
  const add = button(`layer-add${picking ? ' on' : ''}`, picking ? 'Choosing from the library…' : 'Add layer…', 'layer-add', {
    disabled: atCap || picking,
    title: atCap ? `At most ${MAX_LAYERS} layers` : 'Open the library and choose a Pattern to sound under the composition',
  });
  add.setAttribute('aria-pressed', String(picking));
  add.addEventListener('click', () => handlers.onLayerAdd?.());
  actions.appendChild(add);
  const fresh = button('layer-new', 'New layer…', 'layer-new', {
    disabled: atCap || picking,
    title: atCap ? `At most ${MAX_LAYERS} layers` : 'A blank Pattern, saved under a name and put on screen to compose',
  });
  fresh.addEventListener('click', () => handlers.onLayerNew?.());
  actions.appendChild(fresh);
  if (picking) {
    // The library is open and waiting (AC-19.11.1/2).
    const hint = el('span', 'layers-picking', { textContent: 'Choose a Pattern in the library to add it as a layer.' });
    hint.dataset.picking = 'true';
    hint.setAttribute('role', 'status');
    actions.appendChild(hint);
    const cancel = button('layer-pick-cancel', 'Cancel', 'layer-pick-cancel');
    cancel.addEventListener('click', () => handlers.onLayerPickCancel?.());
    actions.appendChild(cancel);
  }

  const unsavedParts = all.filter((p) => !p.id || (p.draft && (!p.savedId || !isComplete(p.draft))));
  const saved = unsavedParts.length === 0;
  const hasLayers = (composer.layers?.length ?? 0) > 0;
  const save = button('arrangement-save', arrangement?.id ? 'Save arrangement' : 'Save arrangement…', 'arrangement-save', {
    disabled: !saved || !hasLayers,
    title: !saved
      ? `Save every part to the library first — an Arrangement names them by id. Not saved: ${unsavedParts.map((p) => p.pattern?.name ?? '?').join(', ')}`
      : !hasLayers
        ? 'Add a layer first'
        : arrangement?.id
          ? 'Update this Arrangement'
          : 'Save the composition and its layers under a name',
  });
  save.addEventListener('click', () => handlers.onArrangementSave?.());
  actions.appendChild(save);
  if (arrangement?.id || hasLayers) {
    const clear = button('arrangement-new', 'Clear layers', 'arrangement-new', { title: 'Take every layer out and start a new Arrangement' });
    clear.addEventListener('click', () => handlers.onArrangementNew?.());
    actions.appendChild(clear);
  }
  // One ZIP, one MIDI file per layer, each one combined loop long (AC-19.11.5).
  const exportBtn = button('arrangement-export', 'Export arrangement MIDI', 'arrangement-export', {
    disabled: !hasLayers,
    title: hasLayers ? 'Download a ZIP with one MIDI file per layer, each one loop long' : 'Add a layer first',
  });
  exportBtn.addEventListener('click', () => handlers.onArrangementExport?.());
  actions.appendChild(exportBtn);
  wrap.appendChild(actions);

  wrap.appendChild(renderSaved(state, handlers));
  return wrap;
}

/** The saved Arrangements: Load, Rename, Delete (AC-19.11.4/2, /3). Empty when there are none. */
function renderSaved(state, handlers) {
  const arrangement = state.composer.arrangement;
  const all = state.arrangements ?? [];
  const savedWrap = el('div', 'arrangements');
  if (all.length > 0) {
    savedWrap.appendChild(el('span', 'layers-label', { textContent: 'Saved Arrangements' }));
    const ul = el('ul', 'arrangement-list');
    for (const a of all) {
      const item = el('li', `arrangement-item${arrangement?.id === a.id ? ' current' : ''}`);
      item.dataset.arrangementId = a.id;
      const load = button('arrangement-load', a.name, 'arrangement-load', { title: 'Open this Arrangement: its composition and its layers' });
      load.dataset.arrangementId = a.id;
      load.addEventListener('click', () => handlers.onArrangementLoad?.(a.id));
      item.appendChild(load);
      const rename = button('arrangement-rename', 'Rename', 'arrangement-rename');
      rename.dataset.arrangementId = a.id;
      rename.addEventListener('click', () => handlers.onArrangementRename?.(a.id));
      item.appendChild(rename);
      const del = button('arrangement-delete', 'Delete', 'arrangement-delete');
      del.dataset.arrangementId = a.id;
      del.addEventListener('click', () => handlers.onArrangementDelete?.(a.id));
      item.appendChild(del);
      ul.appendChild(item);
    }
    savedWrap.appendChild(ul);
  }
  return savedWrap;
}
