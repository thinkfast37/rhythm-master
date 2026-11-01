/**
 * The Add variation dialog (US-10.4, AC-10.4.8).
 *
 * It names the original, lists the candidate's stack — each technique with
 * its choices as selects and a remove control — then Roll the dice with its
 * No dice toggles, then the techniques by group, each available one a button
 * with one line saying what it does and each unavailable one disabled with
 * its reason. Accept, Accept and vary again, and Close.
 *
 * The dialog owns no state: `main.js` holds the stack and the candidate,
 * rebuilds the candidate through `core/variations`, and calls `update` with a
 * model each time anything changes. It lives in a host of its own, under the
 * ordinary dialog host, so a naming prompt can stand over it.
 */
import { GROUPS } from '../core/variations.js';

let host = null;
let opener = null;
let onKey = null;

function ensureHost() {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'variation-host';
  document.body.appendChild(host);
  return host;
}

/**
 * @param {object} model   see `update`
 * @param {object} handlers  onPhrase(n), onTechnique(id), onChoice(index, key, value), onRemove(index),
 *   onRoll(), onNoDice(group), onAccept(again), onClose()
 * @param {Element|null} returnTo  the control that opened it, focused again on close (AC-10.4.8/5)
 */
export function openVariationDialog(model, handlers, returnTo = null) {
  const root = ensureHost();
  opener = returnTo;
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop variation-backdrop';
  const box = document.createElement('div');
  box.className = 'dialog variation-dialog';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Add variation');
  box.tabIndex = -1;
  backdrop.appendChild(box);
  root.appendChild(backdrop);
  onKey = (e) => {
    // Another dialog over this one — a naming prompt — owns Escape while it stands.
    if (e.key === 'Escape' && !document.querySelector('.dialog-host .dialog')) handlers.onClose();
  };
  document.addEventListener('keydown', onKey);
  updateVariationDialog(model, handlers);
  (box.querySelector('.variation-phrase') ?? box).focus();
}

/** Close, and hand back the control that opened the dialog so focus can return to it. */
export function closeVariationDialog() {
  if (onKey) document.removeEventListener('keydown', onKey);
  onKey = null;
  if (host) host.innerHTML = '';
  const was = opener;
  if (opener?.isConnected) opener.focus();
  opener = null;
  return was;
}

/**
 * @param {object} model
 *   phraseLength, patternLength, cap (the reason the cap refuses, or null),
 *   changeNote (what the copy falls over under every-Measure changes, or null),
 *   stack: [{id, label, fields: [{key, label, options, value}]}], dropped: [{id, label, reason}],
 *   availability: [{id, label, group, describe, reason}], groupReasons: {group: reason|null},
 *   noDice: Set<string>, canRoll: boolean
 */
export function updateVariationDialog(model, handlers) {
  const box = host?.querySelector('.variation-dialog');
  if (!box) return;
  const active = document.activeElement;
  const keepFocus = box.contains(active) ? describeFocus(active) : null;
  box.innerHTML = '';

  const h2 = document.createElement('h2');
  h2.className = 'dialog-title';
  h2.textContent = 'Add variation';
  box.appendChild(h2);

  // The original (AC-10.4.2, AC-10.4.8/2).
  const original = document.createElement('div');
  original.className = 'variation-original';
  const label = document.createElement('label');
  label.className = 'variation-original-label';
  label.textContent = model.phraseLength === 1 ? 'Original: Measure 1' : `Original: Measures 1–${model.phraseLength}`;
  const phrase = document.createElement('select');
  phrase.className = 'variation-phrase';
  phrase.setAttribute('aria-label', 'Length of the original, in Measures');
  for (let n = 1; n <= model.patternLength; n++) {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = n === 1 ? '1 Measure' : `${n} Measures`;
    phrase.appendChild(o);
  }
  phrase.value = String(model.phraseLength);
  phrase.addEventListener('change', (e) => handlers.onPhrase(Number(e.target.value)));
  label.appendChild(phrase);
  original.appendChild(label);
  if (model.changeNote) {
    const note = document.createElement('p');
    note.className = 'variation-note';
    note.textContent = model.changeNote;
    original.appendChild(note);
  }
  if (model.cap) {
    const cap = document.createElement('p');
    cap.className = 'variation-cap dialog-error';
    cap.textContent = model.cap;
    original.appendChild(cap);
  }
  box.appendChild(original);

  // The candidate's stack (AC-10.4.3, AC-10.4.8/2).
  const stackEl = document.createElement('section');
  stackEl.className = 'variation-stack';
  stackEl.setAttribute('aria-label', 'The candidate');
  const h3 = document.createElement('h3');
  h3.className = 'variation-heading';
  h3.textContent = model.stack.length ? `Candidate · ${model.stack.length} technique${model.stack.length === 1 ? '' : 's'}` : 'Candidate';
  stackEl.appendChild(h3);
  if (!model.stack.length) {
    const empty = document.createElement('p');
    empty.className = 'variation-empty';
    empty.textContent = model.cap ? 'The cap leaves no room for a variation.' : 'No techniques yet — tap one below, or roll the dice. The loop plays what you build.';
    stackEl.appendChild(empty);
  } else {
    const list = document.createElement('ol');
    list.className = 'variation-entries';
    model.stack.forEach((entry, index) => {
      const li = document.createElement('li');
      li.className = 'variation-entry';
      li.dataset.technique = entry.id;
      li.dataset.index = String(index);
      const name = document.createElement('span');
      name.className = 'variation-entry-label';
      name.textContent = entry.label;
      li.appendChild(name);
      for (const field of entry.fields) {
        const select = document.createElement('select');
        select.className = 'variation-field';
        select.dataset.key = field.key;
        select.setAttribute('aria-label', `${entry.label}: ${field.label}`);
        for (const option of field.options) {
          const o = document.createElement('option');
          o.value = option.value;
          o.textContent = option.label;
          select.appendChild(o);
        }
        select.value = field.value;
        select.addEventListener('change', (e) => handlers.onChoice(index, field.key, e.target.value));
        li.appendChild(select);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'variation-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${entry.label}`);
      remove.addEventListener('click', () => handlers.onRemove(index));
      li.appendChild(remove);
      list.appendChild(li);
    });
    stackEl.appendChild(list);
  }
  for (const d of model.dropped) {
    const p = document.createElement('p');
    p.className = 'variation-dropped';
    p.setAttribute('role', 'status');
    p.textContent = `${d.label} was dropped: ${d.reason.toLowerCase()}.`;
    stackEl.appendChild(p);
  }
  box.appendChild(stackEl);

  // Roll the dice, with No dice per group (AC-10.4.6).
  const dice = document.createElement('div');
  dice.className = 'variation-dice dice-row';
  const roll = document.createElement('button');
  roll.type = 'button';
  roll.className = 'roll-dice variation-roll';
  roll.textContent = 'Roll the dice';
  roll.disabled = !model.canRoll || Boolean(model.cap);
  roll.title = roll.disabled ? 'Nothing left to roll outside the groups marked No dice' : 'One to three techniques at random, each with its choice';
  roll.addEventListener('click', () => handlers.onRoll());
  dice.appendChild(roll);
  for (const group of GROUPS) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nodice variation-nodice';
    toggle.dataset.group = group;
    const on = model.noDice.has(group);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = `${group}: ${on ? 'No dice' : 'dice'}`;
    toggle.title = on ? `${group} is kept out of the roll` : `Keep ${group} out of the roll`;
    toggle.addEventListener('click', () => handlers.onNoDice(group));
    dice.appendChild(toggle);
  }
  box.appendChild(dice);

  // The techniques, by group (AC-10.4.5, AC-10.4.8/2, /3).
  const groups = document.createElement('div');
  groups.className = 'variation-groups';
  for (const group of GROUPS) {
    const section = document.createElement('section');
    section.className = 'variation-group';
    section.dataset.group = group;
    const head = document.createElement('h3');
    head.className = 'variation-heading';
    head.textContent = group;
    const reason = model.groupReasons[group];
    if (reason) {
      const why = document.createElement('span');
      why.className = 'variation-group-reason';
      why.textContent = reason;
      head.appendChild(why);
    }
    section.appendChild(head);
    const list = document.createElement('div');
    list.className = 'variation-techniques';
    for (const t of model.availability.filter((a) => a.group === group)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'variation-technique';
      button.dataset.technique = t.id;
      const unavailable = Boolean(t.reason) || Boolean(model.cap);
      button.disabled = unavailable;
      button.setAttribute('aria-describedby', `variation-describe-${t.id}`);
      const name = document.createElement('span');
      name.className = 'variation-technique-name';
      name.textContent = t.label;
      const describe = document.createElement('small');
      describe.className = 'variation-technique-describe';
      describe.id = `variation-describe-${t.id}`;
      describe.textContent = t.reason ?? t.describe;
      if (t.reason) describe.classList.add('variation-technique-reason');
      button.title = t.reason ?? t.describe;
      button.append(name, describe);
      button.addEventListener('click', () => handlers.onTechnique(t.id));
      list.appendChild(button);
    }
    section.appendChild(list);
    groups.appendChild(section);
  }
  box.appendChild(groups);

  // Accept, Accept and vary again, Close (AC-10.4.4/5, AC-10.4.8/4).
  const actions = document.createElement('div');
  actions.className = 'dialog-actions variation-actions';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'dialog-button primary variation-accept';
  accept.textContent = 'Accept';
  accept.disabled = !model.stack.length;
  accept.addEventListener('click', () => handlers.onAccept(false));
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'dialog-button variation-accept-again';
  again.textContent = 'Accept and vary again';
  again.disabled = !model.stack.length || !model.nextFits;
  again.title = model.nextFits ? 'Append this one and start the next from the same original' : 'The cap leaves no room for another after this one';
  again.addEventListener('click', () => handlers.onAccept(true));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dialog-button variation-close';
  close.textContent = 'Close';
  close.addEventListener('click', () => handlers.onClose());
  actions.append(accept, again, close);
  box.appendChild(actions);

  if (keepFocus) restoreFocus(box, keepFocus);
}

/** Where focus was, in terms that survive a rebuild. */
function describeFocus(el) {
  if (el.classList.contains('variation-field')) return { field: el.dataset.key, index: el.closest('.variation-entry')?.dataset.index };
  if (el.classList.contains('variation-technique')) return { technique: el.dataset.technique };
  if (el.classList.contains('variation-nodice')) return { nodice: el.dataset.group };
  if (el.classList.contains('variation-remove')) return { remove: el.closest('.variation-entry')?.dataset.index };
  for (const cls of ['variation-roll', 'variation-accept', 'variation-accept-again', 'variation-close', 'variation-phrase']) {
    if (el.classList.contains(cls)) return { cls };
  }
  return null;
}

function restoreFocus(box, where) {
  let el = null;
  if (where.field) el = box.querySelector(`.variation-entry[data-index="${where.index}"] .variation-field[data-key="${where.field}"]`);
  else if (where.technique) el = box.querySelector(`.variation-technique[data-technique="${where.technique}"]`);
  else if (where.nodice) el = box.querySelector(`.variation-nodice[data-group="${where.nodice}"]`);
  else if (where.remove) el = box.querySelector(`.variation-entry[data-index="${where.remove}"] .variation-remove`) ?? box.querySelector('.variation-roll');
  else if (where.cls) el = box.querySelector(`.${where.cls}`);
  (el ?? box).focus();
}

