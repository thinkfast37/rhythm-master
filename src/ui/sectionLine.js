/**
 * The Section line (AC-19.11.10): directly under the record bar, which saved
 * Section is in hand or that it is a new one, with Save section, Rename, New
 * section and Add to section. A pure function of `state.composer` and the
 * saved Sections; the handlers act.
 */
import { el } from './controls.js';
import { usesPattern } from '../core/section.js';
import { isComplete } from '../core/composer.js';

function button(className, text, action, props = {}) {
  const b = el('button', className, { type: 'button', textContent: text, ...props });
  b.dataset.action = action;
  return b;
}

/**
 * Why the part on screen cannot be added to a saved Section now, or null when
 * it can (AC-19.11.10/5). Which Section refuses it is the handler's to say.
 */
export function addToSectionRefusal(composer, sections) {
  const section = composer.section;
  const draft = composer.draft;
  if (section?.id || section?.name) return `This part is already in "${section.name}". Start a New section to add it to another.`;
  if ((composer.layers?.length ?? 0) > 0) return 'This Section has layers of its own. Save it, or start a New section first.';
  if (!composer.savedId || !isComplete(draft)) return `Save "${draft.name}" to the library first — a Section names its parts by id.`;
  if ((sections ?? []).length === 0) return 'No Section is saved yet. Save section makes this the first.';
  return null;
}

/**
 * @param {object} state
 * @param {object} handlers  `parts()` lists every part; the rest act
 */
export function renderSectionLine(state, handlers) {
  const composer = state.composer;
  const draft = composer.draft;
  const section = composer.section ?? { id: null, name: '' };
  const sections = state.sections ?? [];
  const hasLayers = (composer.layers?.length ?? 0) > 0;
  // Named and stored, named and waiting on a part, or new (AC-19.11.4/1).
  const stateOf = section.id ? 'saved' : section.name ? 'waiting' : 'new';

  const wrap = el('div', 'section-line');
  wrap.dataset.sectionState = stateOf;
  wrap.dataset.sectionId = section.id ?? '';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Section');

  wrap.appendChild(el('span', 'section-line-label', { textContent: 'Section' }));

  if (stateOf === 'new') {
    wrap.appendChild(el('span', 'section-line-new', { textContent: 'New section —' }));
    const u = el('span', 'layers-unsaved', { textContent: 'not saved' });
    u.dataset.unsaved = 'new';
    wrap.appendChild(u);
  } else {
    const name = el('span', 'layers-section-name', { textContent: section.name });
    name.dataset.sectionName = section.name;
    wrap.appendChild(name);
    // A named Section saves on its own (AC-19.11.4/4): it is saved, or it
    // waits on a part that is not yet in the library, named here.
    const waitingOn = (handlers.parts?.() ?? []).filter((p) => !p.id && p.pattern);
    if (waitingOn.length > 0) {
      const u = el('span', 'layers-unsaved', {
        textContent: `saves once ${waitingOn.map((p) => `"${p.pattern.name}"`).join(', ')} ${waitingOn.length === 1 ? 'is' : 'are'} saved`,
      });
      u.dataset.unsaved = 'waiting';
      wrap.appendChild(u);
    } else if (section.id) {
      const ok = el('span', 'layers-saved', { textContent: 'saved' });
      ok.dataset.saved = 'true';
      wrap.appendChild(ok);
    }
  }

  const actions = el('span', 'section-line-actions');
  if (stateOf === 'new') {
    // The first save names it; after that every change saves on its own.
    const save = button('section-save', 'Save section…', 'section-save', {
      title: hasLayers ? 'Name this Section: the part on screen and its layers' : 'Name this Section; layers can be added to it afterwards',
    });
    save.addEventListener('click', () => handlers.onSectionSave?.());
    actions.appendChild(save);
  } else {
    const rename = button('section-line-rename', 'Rename', 'section-line-rename', { title: 'Change this Section’s name' });
    rename.addEventListener('click', () => (section.id ? handlers.onSectionRename?.(section.id) : handlers.onSectionSave?.()));
    actions.appendChild(rename);
  }
  if (stateOf !== 'new' || hasLayers) {
    const fresh = button('section-new', 'New section', 'section-new', {
      title: section.id
        ? `Leave "${section.name}" as it is saved, and start a new Section on the part on screen`
        : 'Take every layer out and start a new Section on the part on screen',
    });
    fresh.addEventListener('click', () => handlers.onSectionNew?.());
    actions.appendChild(fresh);
  }
  const refusal = addToSectionRefusal(composer, sections);
  const addTo = button('section-add-to', 'Add to section…', 'section-add-to', {
    disabled: Boolean(refusal),
    title: refusal ?? 'Add the part on screen to a saved Section, as its last layer',
  });
  addTo.dataset.refusal = refusal ?? '';
  addTo.addEventListener('click', () => handlers.onSectionAddTo?.());
  actions.appendChild(addTo);
  wrap.appendChild(actions);

  // A Pattern is shared by id, never copied (AC-19.11.9/4): a new idea written
  // on a part of other Sections changes them too, and this says so (/6).
  if (stateOf === 'new' && composer.savedId) {
    const others = sections.filter((s) => usesPattern(s, composer.savedId));
    if (others.length > 0) {
      const shared = el('span', 'section-line-shared', {
        textContent: `"${draft.name}" is also a part of ${others.map((s) => `"${s.name}"`).join(', ')} — an edit here is heard there too.`,
      });
      shared.dataset.shared = others.map((s) => s.id).join(' ');
      wrap.appendChild(shared);
    }
  }
  return wrap;
}
