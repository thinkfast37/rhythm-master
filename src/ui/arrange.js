/**
 * The Arrangement panel (US-20.1): what stands in for the rhythm band and the
 * work surface in Arrange mode — the Arrangement's name and its Save, Rename,
 * Delete and New; the palette, filled from the library; and the sequence laid
 * out from it.
 *
 * A pure function of what `handlers.arrangeView()` reports. Nothing here reads
 * a store: the view names every palette and sequence entry already.
 */
import { MIN_REPEATS, MAX_REPEATS } from '../core/arrangement.js';
import { renderArticulation } from './articulation.js';

function el(tag, className, props = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.assign(node, props);
  return node;
}

function button(className, text, action, props = {}) {
  const b = el('button', className, { type: 'button', textContent: text, ...props });
  b.dataset.action = action;
  return b;
}

/** The head: which Arrangement this is, whether it is saved, and what can be done with it (AC-20.1.4). */
function renderHead(view, state, handlers) {
  const head = el('div', 'arrange-head');
  const title = el('h2', 'arrange-title', { textContent: view.name ? `Arrangement — ${view.name}` : 'New Arrangement' });
  head.appendChild(title);

  const saved = el('span', 'arrange-state', {
    textContent: view.saved ? 'Saved — every change saves' : view.empty ? '' : 'Not saved',
  });
  saved.dataset.saved = String(view.saved);
  head.appendChild(saved);

  const actions = el('div', 'arrange-actions');
  if (!view.saved) {
    const noSequence = view.entries.length === 0;
    const save = button('arrange-save', 'Save as Arrangement…', 'arrange-save', {
      disabled: noSequence,
      title: noSequence ? 'Lay at least one entry in the sequence first' : 'Save this Arrangement under a name',
    });
    save.addEventListener('click', () => handlers.onArrangeSave?.());
    actions.appendChild(save);
  } else {
    const rename = button('arrange-rename', 'Rename', 'arrange-rename');
    rename.addEventListener('click', () => handlers.onArrangeRename?.());
    const del = button('arrange-delete', 'Delete', 'arrange-delete');
    del.addEventListener('click', () => handlers.onArrangeDelete?.());
    actions.append(rename, del);
  }
  const fresh = button('arrange-new', 'New Arrangement', 'arrange-new');
  fresh.addEventListener('click', () => handlers.onArrangeNew?.());
  actions.appendChild(fresh);
  // One multi-track MIDI file of the sequence once through (AC-20.3.1/1), with
  // the note-length choice every MIDI export has beside it (AC-12.5.1/1).
  const exportBtn = button('arrange-export', 'Export MIDI', 'arrange-export', {
    disabled: !view.canPlay,
    title: view.canPlay ? 'Download one MIDI file with a track for each part' : 'Lay an entry in the sequence first',
  });
  exportBtn.addEventListener('click', () => handlers.onArrangeExport?.());
  actions.appendChild(exportBtn);
  actions.appendChild(renderArticulation(state, handlers));
  head.appendChild(actions);
  return head;
}

/** The palette: what the piece is made of, each entry tapped to lay it in the sequence (AC-20.1.2, AC-20.1.3/1). */
function renderPalette(view, handlers) {
  const wrap = el('section', 'arrange-palette');
  const head = el('div', 'arrange-section-head');
  head.appendChild(el('h3', 'arrange-label', { textContent: 'Palette' }));
  const add = button('arrange-add', view.picking ? 'Choosing from the library…' : '+ Add from library', 'arrange-add', {
    title: 'Choose a Pattern, a Section or a Chain in the library to put it in the palette',
  });
  add.setAttribute('aria-pressed', String(Boolean(view.picking)));
  add.addEventListener('click', () => handlers.onArrangeAdd?.());
  head.appendChild(add);
  wrap.appendChild(head);

  if (view.palette.length === 0) {
    wrap.appendChild(el('p', 'arrange-empty arrange-palette-empty', { textContent: 'The palette is empty. Add the Sections, Patterns and Chains this piece is made of.' }));
    return wrap;
  }

  const list = el('ul', 'arrange-palette-list');
  view.palette.forEach((item, index) => {
    const row = el('li', 'arrange-palette-item');
    row.dataset.kind = item.kind;
    row.dataset.id = item.id;
    const lay = button('arrange-palette-add', item.name, 'arrange-lay', {
      disabled: item.missing,
      title: item.missing ? 'This is no longer in the library' : 'Lay this at the end of the sequence',
    });
    lay.addEventListener('click', () => handlers.onArrangeLay?.(index));
    row.appendChild(lay);
    row.appendChild(el('span', 'arrange-palette-type', { textContent: item.typeLabel }));
    if (item.kind === 'chain') {
      // A Chain is fills over a progression: it is changed in the Composer once written out (AC-20.1.2/4).
      row.appendChild(el('span', 'arrange-palette-note', { textContent: 'Write it out as a Pattern to edit it' }));
    } else if (!item.missing) {
      const edit = button('arrange-edit', 'Edit', 'arrange-edit', { title: 'Open this in the Composer' });
      edit.setAttribute('aria-label', `Edit ${item.name} in the Composer`);
      edit.addEventListener('click', () => handlers.onArrangeEdit?.(index));
      row.appendChild(edit);
    }
    const remove = button('arrange-palette-remove', 'Remove', 'arrange-palette-remove', { title: 'Take this out of the palette' });
    remove.setAttribute('aria-label', `Remove ${item.name} from the palette`);
    remove.addEventListener('click', () => handlers.onArrangePaletteRemove?.(index));
    row.appendChild(remove);
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

/** The sequence: the entries in playing order, each renamed, repeated, moved and removed in place (AC-20.1.3). */
function renderSequence(view, handlers) {
  const wrap = el('section', 'arrange-sequence');
  const head = el('div', 'arrange-section-head');
  head.appendChild(el('h3', 'arrange-label', { textContent: 'Sequence' }));
  const n = view.entries.length;
  head.appendChild(el('span', 'arrange-count', { textContent: n === 0 ? '' : `${n} ${n === 1 ? 'entry' : 'entries'}` }));
  wrap.appendChild(head);

  if (n === 0) {
    wrap.appendChild(el('p', 'arrange-empty arrange-sequence-empty', { textContent: 'The sequence is empty. Tap a palette entry to lay it here.' }));
    return wrap;
  }

  const list = el('ol', 'arrange-entries');
  view.entries.forEach((entry, index) => {
    const row = el('li', 'arrange-entry');
    row.dataset.index = String(index);
    // The entry sounding, while the sequence plays (AC-20.2.1/4).
    if (view.playingIndex === index) {
      row.classList.add('playing');
      row.setAttribute('aria-current', 'true');
    }
    row.dataset.kind = entry.kind;
    row.dataset.id = entry.id;
    row.appendChild(el('span', 'arrange-entry-number', { textContent: `${index + 1}.` }));

    const name = el('input', 'arrange-entry-name', { type: 'text', value: entry.name, maxLength: 60 });
    name.dataset.action = 'arrange-entry-name';
    name.setAttribute('aria-label', `Name of entry ${index + 1}`);
    name.addEventListener('change', (e) => handlers.onArrangeEntryName?.(index, e.target.value));
    row.appendChild(name);

    const source = el('span', 'arrange-entry-source', { textContent: `← ${entry.sourceName}` });
    source.title = entry.missing ? 'This is no longer in the library' : entry.typeLabel;
    if (entry.missing) source.classList.add('missing');
    row.appendChild(source);

    // The × and its number stay together when the row wraps on a phone.
    const times = el('span', 'arrange-entry-repeat');
    times.appendChild(el('span', 'arrange-entry-times', { textContent: '×' }));
    const repeats = el('input', 'arrange-entry-repeats', { type: 'number', min: String(MIN_REPEATS), max: String(MAX_REPEATS), step: '1', value: String(entry.repeats) });
    repeats.dataset.action = 'arrange-entry-repeats';
    repeats.setAttribute('aria-label', `Repeats of entry ${index + 1}`);
    repeats.addEventListener('change', (e) => handlers.onArrangeEntryRepeats?.(index, e.target.value));
    times.appendChild(repeats);
    row.appendChild(times);

    const up = button('arrange-entry-up', '▲', 'arrange-entry-up', { disabled: index === 0, title: 'Move up' });
    up.setAttribute('aria-label', `Move entry ${index + 1} up`);
    up.addEventListener('click', () => handlers.onArrangeEntryMove?.(index, -1));
    const down = button('arrange-entry-down', '▼', 'arrange-entry-down', { disabled: index === n - 1, title: 'Move down' });
    down.setAttribute('aria-label', `Move entry ${index + 1} down`);
    down.addEventListener('click', () => handlers.onArrangeEntryMove?.(index, 1));
    const remove = button('arrange-entry-remove', '✕', 'arrange-entry-remove', { title: 'Remove from the sequence' });
    remove.setAttribute('aria-label', `Remove entry ${index + 1}`);
    remove.addEventListener('click', () => handlers.onArrangeEntryRemove?.(index));
    row.append(up, down, remove);
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

/**
 * Draw the panel, or hide it outside Arrange mode (AC-20.1.1/1).
 *
 * @param {HTMLElement} root
 * @param {object} state      the app state; only `composer.mode` is read from it
 * @param {object} handlers   `arrangeView()` and the `onArrange…` handlers
 */
export function renderArrange(root, state, handlers) {
  const on = state.composer?.mode === 'arrange';
  root.hidden = !on;
  if (!on) {
    root.innerHTML = '';
    return root;
  }
  const view = handlers.arrangeView();
  // A name being typed survives a re-render that did not touch its entry.
  const focused = document.activeElement;
  const typing = focused && root.contains(focused) && focused.classList.contains('arrange-entry-name') ? { index: focused.closest('.arrange-entry')?.dataset.index, value: focused.value, at: focused.selectionStart } : null;

  root.innerHTML = '';
  root.appendChild(renderHead(view, state, handlers));
  root.appendChild(renderPalette(view, handlers));
  root.appendChild(renderSequence(view, handlers));

  if (typing?.index !== undefined) {
    const again = root.querySelector(`.arrange-entry[data-index="${typing.index}"] .arrange-entry-name`);
    if (again) {
      again.value = typing.value;
      again.focus();
      if (typing.at !== null) again.setSelectionRange(typing.at, typing.at);
    }
  }
  return root;
}
