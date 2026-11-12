/**
 * The Layers section of the Composer (US-19.11): the composition first, then
 * each library Pattern layered under it with its kind, its repeats in the
 * combined loop, Mute and Remove; the loop readout; Add layer; and the saved
 * Arrangements with Save, New, Load, Rename and Delete. A pure function of
 * `state.composer`, the stores' lists and the Patterns the handlers resolve.
 */
import { el } from './controls.js';
import { layered, layerKind, MAX_LAYERS } from '../core/arrangement.js';

const KIND_LABELS = { rhythm: 'rhythm', melody: 'melody', chords: 'chords' };

function button(className, text, action, props = {}) {
  const b = el('button', className, { type: 'button', textContent: text, ...props });
  b.dataset.action = action;
  return b;
}

/** Whether the layers differ from the Arrangement they were loaded from, or are new (AC-19.11.4/4). */
export function arrangementUnsaved(composer) {
  const layers = composer?.layers ?? [];
  const arrangement = composer?.arrangement;
  if (!arrangement?.id) return layers.length > 0;
  return JSON.stringify(layers) !== JSON.stringify(arrangement.saved ?? []);
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

  // Resolve every layer; one that no longer exists in the library is shown as missing.
  const resolved = (composer.layers ?? []).map((l) => ({ ...l, pattern: handlers.patternById?.(l.patternId) ?? null }));
  const playable = resolved.filter((l) => l.pattern);
  const set = layered(draft, playable);
  const repeatsOf = new Map(playable.map((l, i) => [l.patternId, set.layers[i + 1].repeats]));

  const list = el('ol', 'layer-list');
  const own = el('li', 'layer-item composition');
  own.dataset.layer = 'composition';
  own.appendChild(el('span', 'layer-name', { textContent: draft.name }));
  own.appendChild(el('span', 'layer-kind', { textContent: 'composition' }));
  const ownRepeats = el('span', 'layer-repeats', { textContent: `×${set.layers[0].repeats}` });
  ownRepeats.dataset.repeats = String(set.layers[0].repeats);
  own.appendChild(ownRepeats);
  list.appendChild(own);

  resolved.forEach((layer, index) => {
    const item = el('li', `layer-item${layer.muted ? ' muted' : ''}${layer.pattern ? '' : ' missing'}`);
    item.dataset.layer = String(index);
    item.dataset.patternId = layer.patternId;
    item.dataset.muted = String(Boolean(layer.muted));
    const name = el('span', 'layer-name', { textContent: layer.pattern ? layer.pattern.name : 'Missing Pattern' });
    item.appendChild(name);
    if (layer.pattern) {
      const kind = layerKind(layer.pattern);
      const k = el('span', 'layer-kind', { textContent: KIND_LABELS[kind] });
      k.dataset.kind = kind;
      item.appendChild(k);
      const r = el('span', 'layer-repeats', { textContent: `×${repeatsOf.get(layer.patternId)}` });
      r.dataset.repeats = String(repeatsOf.get(layer.patternId));
      item.appendChild(r);
    }
    const mute = button(`layer-mute${layer.muted ? ' on' : ''}`, layer.muted ? 'Unmute' : 'Mute', 'layer-mute', {
      title: layer.muted ? 'Hear this layer again' : 'Silence this layer; it still counts in the loop',
    });
    mute.dataset.layer = String(index);
    mute.setAttribute('aria-pressed', String(Boolean(layer.muted)));
    mute.addEventListener('click', () => handlers.onLayerMute?.(index, !layer.muted));
    item.appendChild(mute);
    const remove = button('layer-remove', 'Remove', 'layer-remove', { title: 'Take this layer out' });
    remove.dataset.layer = String(index);
    remove.addEventListener('click', () => handlers.onLayerRemove?.(index));
    item.appendChild(remove);
    list.appendChild(item);
  });
  wrap.appendChild(list);

  if (resolved.length === 0) {
    const empty = el('p', 'layers-empty', { textContent: 'No layers yet. Add layer puts a library Pattern under the composition, repeating to fill the loop.' });
    empty.dataset.empty = 'true';
    wrap.appendChild(empty);
  } else {
    const passes = set.layers[0].repeats;
    const names = [draft.name, ...playable.map((l) => l.pattern.name)];
    const loop = el('p', 'layers-loop', {
      textContent: `Loop: ${passes} ${passes === 1 ? 'pass' : 'passes'} of the composition — ${set.layers
        .map((l, i) => `${names[i]} ×${l.repeats}`)
        .join(', ')}`,
    });
    loop.dataset.passes = String(passes);
    wrap.appendChild(loop);
  }

  const actions = el('div', 'layers-actions');
  const atCap = (composer.layers?.length ?? 0) >= MAX_LAYERS;
  const add = button('layer-add', 'Add layer…', 'layer-add', {
    disabled: atCap,
    title: atCap ? `At most ${MAX_LAYERS} layers` : 'Choose library Patterns to sound under the composition',
  });
  add.addEventListener('click', () => handlers.onLayerAdd?.());
  actions.appendChild(add);

  const saved = Boolean(composer.savedId);
  const hasLayers = (composer.layers?.length ?? 0) > 0;
  const save = button('arrangement-save', arrangement?.id ? 'Save arrangement' : 'Save arrangement…', 'arrangement-save', {
    disabled: !saved || !hasLayers,
    title: !saved
      ? 'Save the composition to the library first — an Arrangement names it by id'
      : !hasLayers
        ? 'Add a layer first'
        : arrangement?.id
          ? 'Update this Arrangement'
          : 'Save the composition and its layers under a name',
  });
  save.addEventListener('click', () => handlers.onArrangementSave?.());
  actions.appendChild(save);
  if (arrangement?.id || hasLayers) {
    const fresh = button('arrangement-new', 'New', 'arrangement-new', { title: 'Clear the layers and start a new Arrangement' });
    fresh.addEventListener('click', () => handlers.onArrangementNew?.());
    actions.appendChild(fresh);
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
