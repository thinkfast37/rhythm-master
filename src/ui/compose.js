/**
 * The Compose group (US-18.1): the fills the Composer kept, sequenced into a
 * Chain over the Pattern's progression. Present only on a Melodic Pattern
 * with a progression (AC-18.1.1/1); absent, not empty, otherwise.
 *
 * Nothing here is Pattern data. The Chain lives in `state.compose`, the
 * shortlist in the Composer's overlay, and saved Chains in their own store.
 */
import { ARPEGGIOS, hasHarmony, chordNumeral } from '../core/harmony.js';
import { entryPasses, totalPasses } from '../core/chain.js';
import { el, rebuild } from './controls.js';
import { placeHelp } from './help.js';

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
    // The progression, as the chord strip names it — set in Melody, one place
    // to change it (AC-18.1.1/2).
    const over = el('p', 'compose-progression');
    over.appendChild(el('span', 'compose-label', { textContent: 'Over ' }));
    over.appendChild(
      el('strong', null, { textContent: pattern.harmony.chords.map((c) => chordNumeral(c)).join(' – ') })
    );
    over.appendChild(el('span', 'compose-hint', { textContent: ' — set in Melody' }));
    fresh.appendChild(over);

    fresh.appendChild(renderChains(state, handlers));
    fresh.appendChild(renderPalette(state, handlers));
    fresh.appendChild(renderSection(pattern, state, handlers));
    // Lab's Help, part of the group it describes (AC-14.1.3/3).
    placeHelp(fresh, 'compose', state);
  });
}

/** This Pattern's saved Chains: load, rename, delete (AC-18.1.4). */
function renderChains(state, handlers) {
  const wrap = el('div', 'compose-chains');
  const chains = state.chains ?? [];
  const current = state.compose?.chain;
  if (chains.length === 0) return wrap;
  wrap.appendChild(el('span', 'compose-label', { textContent: 'Chains on this Pattern' }));
  const list = el('ul', 'compose-chain-list');
  for (const chain of chains) {
    const item = el('li', `chain-item${current?.id === chain.id ? ' current' : ''}`);
    item.dataset.chainId = chain.id;
    const load = button('chain-load', chain.name, 'chain-load', { title: 'Load this Chain' });
    load.dataset.chainId = chain.id;
    load.addEventListener('click', () => handlers.onChainLoad(chain.id));
    item.appendChild(load);
    const rename = button('chain-rename', 'Rename', 'chain-rename');
    rename.dataset.chainId = chain.id;
    rename.addEventListener('click', () => handlers.onChainRename(chain.id));
    item.appendChild(rename);
    const del = button('chain-delete', 'Delete', 'chain-delete');
    del.dataset.chainId = chain.id;
    del.addEventListener('click', () => handlers.onChainDelete(chain.id));
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
      title: 'Add this fill to the end of the Chain',
    });
    b.dataset.fill = fill.id;
    b.addEventListener('click', () => handlers.onComposeAdd(fill.id));
    row.appendChild(b);
  }
  wrap.appendChild(row);
  return wrap;
}

/** The Chain: entries in order, each with its repeats; play, save, export (AC-18.1.2–AC-18.1.5). */
function renderSection(pattern, state, handlers) {
  const wrap = el('div', 'compose-section');
  const chain = state.compose?.chain;
  const entries = chain?.sections[0]?.entries ?? [];
  const inForce = state.chainEntryInForce;
  const head = el('div', 'compose-section-head');
  head.appendChild(el('span', 'compose-label', { textContent: chain?.name ? `Chain — ${chain.name}` : 'Chain' }));
  if (unsaved(state)) head.appendChild(el('span', 'compose-unsaved', { textContent: 'unsaved changes' }));
  wrap.appendChild(head);

  if (entries.length === 0) {
    wrap.appendChild(el('p', 'compose-empty', { textContent: 'The Chain is empty. Tap a kept fill to add it.' }));
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
    const total = totalPasses(chain, (id) => (id === pattern.id ? pattern : null));
    wrap.appendChild(el('p', 'compose-total', { textContent: `${total} passes in all, then it loops` }));
  }

  const actions = el('div', 'compose-actions');
  const empty = entries.length === 0;
  const playingChain = Boolean(state.compose?.on && state.isPlaying);
  const play = button(`play-chain${playingChain ? ' on' : ''}`, playingChain ? 'Playing chain' : 'Play chain', 'play-chain', {
    disabled: empty,
    title: empty ? 'Add an entry first' : 'Play the Chain in order, looping',
  });
  play.setAttribute('aria-pressed', String(playingChain));
  play.addEventListener('click', () => handlers.onPlayChain());
  actions.appendChild(play);
  const save = button('chain-save', chain?.id ? 'Save' : 'Save as Chain…', 'chain-save', { disabled: empty });
  save.addEventListener('click', () => handlers.onChainSave());
  actions.appendChild(save);
  if (chain?.id || !empty) {
    const fresh = button('chain-new', 'New Chain', 'chain-new');
    fresh.addEventListener('click', () => handlers.onChainNew());
    actions.appendChild(fresh);
  }
  const exportBtn = button('chain-export', 'Export Chain MIDI', 'chain-export', { disabled: empty });
  exportBtn.addEventListener('click', () => handlers.onChainExport());
  actions.appendChild(exportBtn);
  // The Chain as a Pattern of its own, to be changed in the Composer (AC-18.1.6).
  const writeOut = button('chain-write-out', 'Write out as Pattern', 'chain-write-out', {
    disabled: empty,
    title: empty ? 'Add an entry first' : "Save the Chain's notes as a new Pattern and open it in the Composer",
  });
  writeOut.addEventListener('click', () => handlers.onChainWriteOut());
  actions.appendChild(writeOut);
  wrap.appendChild(actions);
  return wrap;
}

/** Whether the Chain differs from the Chain it was loaded from, or is new with entries (AC-18.1.4/4). */
function unsaved(state) {
  const chain = state.compose?.chain;
  if (!chain) return false;
  const entries = chain.sections[0]?.entries ?? [];
  if (!state.compose.saved) return entries.length > 0;
  return JSON.stringify(chain.sections) !== JSON.stringify(state.compose.saved.sections);
}
