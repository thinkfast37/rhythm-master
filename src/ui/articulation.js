/**
 * The note-length choice that sits beside every MIDI export (AC-12.5.1/1):
 * Staccato or Legato, one setting for all of them. Shared so the four exports
 * — a Pattern's, a Chain's, a Section's, an Arrangement's — offer the same
 * control and cannot drift apart.
 *
 * A two-way switch, as the Sound Mode and the voice are, and not a picker:
 * the Compose group holds no picker (AC-18.1.1/2).
 */
import { ARTICULATIONS, normaliseArticulation } from '../core/articulation.js';

const TITLES = {
  staccato: 'Short notes, a thirty-second note each, as MIDI export has always written them',
  legato: 'Each note lasts to the next and then rings on as its instrument does in the app',
};

/**
 * @param {object} state     the app state; `settings.midiArticulation` is read
 * @param {object} handlers  `onMidiArticulation(id)`
 * @returns {HTMLElement}
 */
export function renderArticulation(state, handlers) {
  const chosen = normaliseArticulation(state.settings?.midiArticulation);
  const wrap = document.createElement('span');
  wrap.className = 'midi-articulation';
  const caption = document.createElement('span');
  caption.className = 'midi-articulation-label';
  caption.textContent = 'Notes';
  const group = document.createElement('span');
  group.className = 'midi-articulation-switch';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Length of exported MIDI notes');
  group.dataset.articulation = chosen;
  for (const { id, label } of ARTICULATIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'midi-articulation-option';
    b.textContent = label;
    b.title = TITLES[id];
    b.dataset.action = 'midi-articulation';
    b.dataset.articulation = id;
    b.setAttribute('aria-pressed', String(chosen === id));
    b.addEventListener('click', () => {
      if (chosen !== id) handlers.onMidiArticulation?.(id);
    });
    group.appendChild(b);
  }
  wrap.append(caption, group);
  return wrap;
}
