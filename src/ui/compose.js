/**
 * The Compose group (US-18.1): the fills the Composer kept, sequenced into a
 * Section over the Pattern's progression. Present only on a Melodic Pattern
 * with a progression (AC-18.1.1/1); absent, not empty, otherwise.
 *
 * Nothing here is Pattern data. The Section lives in `state.compose`, the
 * shortlist in the Composer's overlay, and saved Songs in their own store.
 */
import { ARPEGGIOS, hasHarmony, chordNumeral } from '../core/harmony.js';
import { entryPasses, totalPasses } from '../core/song.js';
import { el, rebuild } from './controls.js';
import { renderHelp } from './help.js';

export function composeApplies(pattern) {
  return pattern.soundMode === 'melodic' && hasHarmony(pattern);
}

const fillLabel = (id) => ARPEGGIOS.find((a) => a.id === id)?.label ?? id;

function button(className, text, action, props = {}) {
  const b = el('button', className, { type: 'button', textContent: text, ...props });
  b.dataset.action = action;
  return b;
}

export function renderComposeGroup(root, pattern, state, handlers) {
  root.className = 'controls workbench-group compose-group';
  root.hidden = !composeApplies(pattern);
  return rebuild(root, (fresh) => {
    if (root.hidden) return;
    const help = renderHelp('compose', state);
    if (help) fresh.appendChild(help);
    // The progression, as the chord strip names it — set in Melody, one place
    // to change it (AC-18.1.1/2).
    const over = el('p', 'compose-progression');
    over.appendChild(el('span', 'compose-label', { textContent: 'Over ' }));
    over.appendChild(
      el('strong', null, { textContent: pattern.harmony.chords.map((c) => chordNumeral(c)).join(' – ') })
    );
    over.appendChild(el('span', 'compose-hint', { textContent: ' — set in Melody' }));
    fresh.appendChild(over);

    fresh.appendChild(renderSongs(state, handlers));
    fresh.appendChild(renderPalette(state, handlers));
    fresh.appendChild(renderSection(pattern, state, handlers));
  });
}

/** This Pattern's saved Songs: load, rename, delete (AC-18.1.4). */
function renderSongs(state, handlers) {
  const wrap = el('div', 'compose-songs');
  const songs = state.songs ?? [];
  const current = state.compose?.song;
  if (songs.length === 0) return wrap;
  wrap.appendChild(el('span', 'compose-label', { textContent: 'Songs on this Pattern' }));
  const list = el('ul', 'compose-song-list');
  for (const song of songs) {
    const item = el('li', `song-item${current?.id === song.id ? ' current' : ''}`);
    item.dataset.songId = song.id;
    const load = button('song-load', song.name, 'song-load', { title: 'Load this Song into the Section' });
    load.dataset.songId = song.id;
    load.addEventListener('click', () => handlers.onSongLoad(song.id));
    item.appendChild(load);
    const rename = button('song-rename', 'Rename', 'song-rename');
    rename.dataset.songId = song.id;
    rename.addEventListener('click', () => handlers.onSongRename(song.id));
    item.appendChild(rename);
    const del = button('song-delete', 'Delete', 'song-delete');
    del.dataset.songId = song.id;
    del.addEventListener('click', () => handlers.onSongDelete(song.id));
    item.appendChild(del);
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

/** The kept fills, in catalogue order (AC-18.1.1/3); a tap appends (AC-18.1.2/1). */
function renderPalette(state, handlers) {
  const wrap = el('div', 'compose-palette');
  wrap.appendChild(el('span', 'compose-label', { textContent: 'Kept fills' }));
  const kept = new Set(state.keptFills ?? []);
  const fills = ARPEGGIOS.filter((a) => kept.has(a.id));
  if (fills.length === 0) {
    wrap.appendChild(
      el('p', 'compose-empty-palette', {
        textContent: 'Nothing kept yet. Audition fills in Melody and press Keep on the ones worth composing with.',
      })
    );
    return wrap;
  }
  const row = el('div', 'palette-row');
  for (const fill of fills) {
    const b = button('palette-fill', `+ ${fill.label}`, 'compose-add', {
      title: 'Add this fill to the end of the Section',
    });
    b.dataset.fill = fill.id;
    b.addEventListener('click', () => handlers.onComposeAdd(fill.id));
    row.appendChild(b);
  }
  wrap.appendChild(row);
  return wrap;
}

/** The Section: entries in order, each with its repeats; play, save, export (AC-18.1.2–AC-18.1.5). */
function renderSection(pattern, state, handlers) {
  const wrap = el('div', 'compose-section');
  const song = state.compose?.song;
  const entries = song?.sections[0]?.entries ?? [];
  const inForce = state.songEntryInForce;
  const head = el('div', 'compose-section-head');
  head.appendChild(el('span', 'compose-label', { textContent: song?.name ? `Section — ${song.name}` : 'Section' }));
  if (unsaved(state)) head.appendChild(el('span', 'compose-unsaved', { textContent: 'unsaved changes' }));
  wrap.appendChild(head);

  if (entries.length === 0) {
    wrap.appendChild(el('p', 'compose-empty', { textContent: 'The Section is empty. Tap a kept fill to add it.' }));
  } else {
    const list = el('ol', 'compose-entries');
    entries.forEach((entry, index) => {
      const playing = inForce?.entryIndex === index;
      const item = el('li', `compose-entry${playing ? ' playing' : ''}`);
      item.dataset.index = String(index);
      item.appendChild(el('span', 'entry-fill', { textContent: fillLabel(entry.fill) }));
      const repeats = el('input', 'entry-repeats', {
        type: 'number',
        min: '1',
        max: '16',
        step: '1',
        value: String(entry.repeats),
      });
      repeats.dataset.action = 'entry-repeats';
      repeats.dataset.index = String(index);
      repeats.setAttribute('aria-label', `Harmonic cycles for entry ${index + 1}`);
      repeats.addEventListener('change', (e) => handlers.onComposeRepeats(index, Number(e.target.value)));
      item.appendChild(repeats);
      item.appendChild(
        el('span', 'entry-passes', {
          textContent: `× ${entry.repeats} = ${entryPasses(pattern, entry)} passes`,
        })
      );
      const up = button('entry-up', '↑', 'entry-up', { title: 'Move up', disabled: index === 0 });
      up.dataset.index = String(index);
      up.addEventListener('click', () => handlers.onComposeMove(index, -1));
      const down = button('entry-down', '↓', 'entry-down', {
        title: 'Move down',
        disabled: index === entries.length - 1,
      });
      down.dataset.index = String(index);
      down.addEventListener('click', () => handlers.onComposeMove(index, 1));
      const remove = button('entry-remove', '×', 'entry-remove', { title: 'Remove' });
      remove.dataset.index = String(index);
      remove.addEventListener('click', () => handlers.onComposeRemove(index));
      item.append(up, down, remove);
      list.appendChild(item);
    });
    wrap.appendChild(list);
    const total = totalPasses(song, (id) => (id === pattern.id ? pattern : null));
    wrap.appendChild(el('p', 'compose-total', { textContent: `${total} passes in all, then it loops` }));
  }

  const actions = el('div', 'compose-actions');
  const empty = entries.length === 0;
  const playingSong = Boolean(state.compose?.on && state.isPlaying);
  const play = button(`play-song${playingSong ? ' on' : ''}`, playingSong ? 'Playing song' : 'Play song', 'play-song', {
    disabled: empty,
    title: empty ? 'Add an entry first' : 'Play the Section in order, looping',
  });
  play.setAttribute('aria-pressed', String(playingSong));
  play.addEventListener('click', () => handlers.onPlaySong());
  actions.appendChild(play);
  const save = button('song-save', song?.id ? 'Save' : 'Save as Song…', 'song-save', { disabled: empty });
  save.addEventListener('click', () => handlers.onSongSave());
  actions.appendChild(save);
  if (song?.id || !empty) {
    const fresh = button('song-new', 'New Section', 'song-new');
    fresh.addEventListener('click', () => handlers.onSongNew());
    actions.appendChild(fresh);
  }
  const exportBtn = button('song-export', 'Export Song MIDI', 'song-export', { disabled: empty });
  exportBtn.addEventListener('click', () => handlers.onSongExport());
  actions.appendChild(exportBtn);
  wrap.appendChild(actions);
  return wrap;
}

/** Whether the Section differs from the Song it was loaded from, or is new with entries (AC-18.1.4/4). */
function unsaved(state) {
  const song = state.compose?.song;
  if (!song) return false;
  const entries = song.sections[0]?.entries ?? [];
  if (!state.compose.saved) return entries.length > 0;
  return JSON.stringify(song.sections) !== JSON.stringify(state.compose.saved.sections);
}
