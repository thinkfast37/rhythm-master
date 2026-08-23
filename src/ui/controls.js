/**
 * Editing and transport controls.
 *
 * Every control here dispatches a mutation and lets the one grid re-render
 * (Principle II). None of them computes musical values — Slot counts, accents,
 * and Recipe menus all come from core/.
 */
import { TIME_SIGNATURES, beatNoteValue } from '../core/meter.js';
import { recipesFor, isOffered } from '../core/recipes.js';
import {
  KEYS,
  degreeLabel,
  octaveNumber,
  octaveOffsetFor,
  clampOctave,
  noteName,
} from '../core/pitch.js';
import { SCALES, DEFAULT_SCALE, chromaticStrip } from '../core/scales.js';
import { COUNTING_SYSTEMS, COUNTING_LABELS, isForcedNumbered } from '../core/counting.js';
import { MIN_TEMPO, MAX_TEMPO, MAX_MEASURES } from '../core/pattern.js';
import { subdivisionGroups } from '../core/recipes.js';
import { MIN_SWING, MAX_SWING, DEFAULT_SWING_FEEL } from '../core/swing.js';
import { renderStars } from './library.js';

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

/*
 * Focus-preserving panel rebuild (AC-15.1.16/1).
 *
 * Every panel here is a pure function of state, rebuilt on every change — which
 * means the control that CAUSED the change is destroyed mid-use: the swing
 * slider under a drag, the Sound select under the open picker. Focus falls to
 * the body and the next adjustment has to re-find the control.
 *
 * So a rebuild goes through `rebuild(root, build)`:
 *
 *  - When the focused element is an input/select/textarea inside `root`, the
 *    live node is kept in the document and everything around it is swapped for
 *    the fresh content, walking the old and new trees in step. Keeping the node
 *    itself alive is the only way a pointer drag survives — a removed element
 *    loses both focus and pointer capture, and re-focusing a replacement cannot
 *    restore either. Its listeners stay valid because these controls close over
 *    `handlers` alone, never over a render-time snapshot.
 *
 *  - Any other focused control (a button) is rebuilt normally and focus is
 *    handed to its replacement, found by the data-* identity it carries.
 *    Buttons need no live continuity, and some close over render-time state, so
 *    swapping the node is the safer path.
 */
const KEEP_ALIVE_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const IDENTITY_KEYS = ['action', 'degree', 'bpm', 'recipe', 'tag', 'patternId'];

function rebuild(root, build) {
  const active = document.activeElement;
  const inside = active && active !== root && root.contains(active);
  const keepAlive = inside && KEEP_ALIVE_TAGS.has(active.tagName);
  const identity = inside && !keepAlive && active.dataset?.action ? focusIdentity(active) : null;

  const fresh = document.createElement('div');
  build(fresh);

  if (keepAlive) {
    patchChildren(root, fresh, active);
  } else {
    root.replaceChildren(...fresh.childNodes);
    // preventScroll: restoring focus must not itself move the view (AC-15.1.16).
    if (identity) root.querySelector(identity)?.focus({ preventScroll: true });
  }
  return root;
}

function focusIdentity(control) {
  return IDENTITY_KEYS.filter((key) => control.dataset[key] !== undefined)
    .map((key) => `[data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${control.dataset[key]}"]`)
    .join('');
}

/**
 * Swap `oldParent`'s children for `newParent`'s, preserving the subtree that
 * holds the focused control: ancestors on the path are patched in place, and
 * the control itself keeps its node, taking the fresh render's attributes and
 * value. If the fresh render no longer has a matching node where the control
 * sits — the control genuinely went away — it is replaced like anything else.
 */
function patchChildren(oldParent, newParent, active) {
  const oldKids = [...oldParent.childNodes];
  const newKids = [...newParent.childNodes];
  for (let i = 0; i < Math.max(oldKids.length, newKids.length); i++) {
    const o = oldKids[i];
    const n = newKids[i];
    if (!o) {
      oldParent.appendChild(n);
      continue;
    }
    if (!n) {
      o.remove();
      continue;
    }
    const onPath = o.nodeType === Node.ELEMENT_NODE && (o === active || o.contains(active));
    if (!onPath || n.nodeType !== Node.ELEMENT_NODE || n.tagName !== o.tagName) {
      oldParent.replaceChild(n, o);
      continue;
    }
    syncAttributes(o, n);
    if (o === active) {
      // A select's options still come wholly from the fresh render; only the
      // element itself is preserved. Read the value before the move empties
      // the fresh select, and set it after the options are in place.
      const value = 'value' in n ? n.value : undefined;
      if (o.tagName === 'SELECT') o.replaceChildren(...n.childNodes);
      if (value !== undefined) o.value = value;
      if ('checked' in o) o.checked = n.checked;
      o.disabled = n.disabled ?? false;
    } else {
      patchChildren(o, n, active);
    }
  }
}

function syncAttributes(o, n) {
  for (const { name } of [...o.attributes]) {
    if (!n.hasAttribute(name)) o.removeAttribute(name);
  }
  for (const { name, value } of [...n.attributes]) {
    if (o.getAttribute(name) !== value) o.setAttribute(name, value);
  }
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
  root.appendChild(renderSwing(pattern, handlers));
  root.appendChild(renderCounting(pattern, state, handlers));
  root.appendChild(renderActions(pattern, state, handlers));

  return root;
}

/** The Pattern header: name, provenance, and Measure count. */
export function renderHeader(root, pattern, state, handlers = {}) {
  root.className = 'pattern-header';
  root.dataset.owned = String(state.isOwned);
  return rebuild(root, (fresh) => renderHeaderInto(fresh, pattern, state, handlers));
}

function renderHeaderInto(root, pattern, state, handlers) {
  // The name is editable in place rather than behind a rename dialog: it is the
  // first thing a Composer wants to change about a new Pattern (AC-7.1.1).
  const name = el('input', 'pattern-title', { type: 'text', value: pattern.name });
  name.dataset.action = 'rename';
  name.addEventListener('change', (e) => handlers.onRename?.(e.target.value));
  name.addEventListener('blur', (e) => handlers.onRename?.(e.target.value));
  root.appendChild(name);

  // The Rating lives here as well as on the library row (AC-6.1.7): rating is
  // something you do while looking at — and playing — the Pattern, and on a
  // phone it should not require opening the drawer. Same control, same
  // `onRate`, so there is one Rating however it is reached.
  if (handlers.onRate) root.appendChild(renderStars(pattern, handlers));

  // Provenance reads as a Tag below, not as a sentence here.
  root.appendChild(
    el('p', 'pattern-meta', {
      textContent:
        `${pattern.measures.length} measure${pattern.measures.length === 1 ? '' : 's'} · ` +
        `${pattern.measures.map((m) => m.timeSignature).join(', ')}`,
    })
  );

  root.appendChild(renderHeaderTags(pattern, state, handlers));

  if (handlers.onUndo) {
    const undoButton = el('button', 'undo', { type: 'button', textContent: 'Undo' });
    undoButton.dataset.action = 'undo';
    undoButton.disabled = !state.canUndo;
    undoButton.addEventListener('click', () => handlers.onUndo());
    root.appendChild(undoButton);
  }

  // Store build only (US-17.1): where the Musician stands, and the way to buy
  // outright once they have decided to keep it. The web build is free and has
  // no such control (AC-17.1.9/1).
  if (state.store?.hasStore) {
    const purchases = el('button', 'purchases', { type: 'button', textContent: 'Purchases' });
    purchases.dataset.action = 'purchases';
    purchases.dataset.entitlement = state.store.entitlement?.level ?? 'none';
    purchases.addEventListener('click', () => handlers.onPurchases?.());
    root.appendChild(purchases);
  }

  return root;
}

/**
 * The current Pattern's Tags, shown and edited here rather than in the library
 * list. Tagging is something you do while looking at a Pattern, so on a phone it
 * should not require opening the drawer and finding its row.
 *
 * Three kinds, distinguished by whether they carry a removal control:
 * automatic (derived), built-in (the Pattern's own, if it ships with the app),
 * and the musician's own.
 */
function renderHeaderTags(pattern, state, handlers) {
  const wrap = el('div', 'header-tags');
  const tags = state.currentTags ?? { autoTags: [], lockedTags: [], userTags: [] };

  for (const t of tags.autoTags) {
    const chip = el('span', 'tag-chip automatic', { textContent: t });
    chip.dataset.automatic = 'true';
    wrap.appendChild(chip);
  }
  for (const t of tags.lockedTags) {
    const chip = el('span', 'tag-chip automatic locked', { textContent: t });
    chip.dataset.automatic = 'true';
    chip.dataset.locked = 'true';
    wrap.appendChild(chip);
  }
  for (const t of tags.userTags) {
    const chip = el('span', 'tag-chip user', { textContent: t });
    chip.dataset.automatic = 'false';
    const remove = el('button', 'tag-remove', { type: 'button', textContent: '×' });
    remove.dataset.action = 'remove-tag';
    remove.dataset.tag = t;
    remove.setAttribute('title', `Remove tag "${t}"`);
    remove.addEventListener('click', () => handlers.onRemoveTag?.(pattern.id, t));
    chip.appendChild(remove);
    wrap.appendChild(chip);
  }

  const add = el('button', 'tag-add', { type: 'button', textContent: '+ tag' });
  add.dataset.action = 'add-tag';
  add.setAttribute('title', 'Add a tag');
  add.addEventListener('click', () => handlers.onAddTagPrompt?.(pattern.id));
  wrap.appendChild(add);

  return wrap;
}

/** Play controls only — the primary transport, never collapsible. */
export function renderPlayControls(root, pattern, state, handlers) {
  root.className = 'controls play-controls';
  return rebuild(root, (fresh) => fresh.appendChild(renderTransport(state, handlers)));
}

/** Playback settings: tempo, swing, counting system. */
export function renderPlaybackSettings(root, pattern, state, handlers) {
  root.className = 'controls playback-settings';
  return rebuild(root, (fresh) => {
    fresh.appendChild(renderTempo(pattern, handlers));
    fresh.appendChild(renderSwing(pattern, handlers));
    fresh.appendChild(renderCounting(pattern, state, handlers));
  });
}

/**
 * Edit controls: structure, subdivision, sound mode.
 *
 * Pitch is deliberately not here. It moved to the pitch strip beside the grid,
 * because a palette you have to expand a collapsed section to reach cannot be
 * aimed at while stamping (AC-2.2.13).
 */
export function renderEditControls(root, pattern, state, handlers) {
  root.className = 'controls edit-controls';
  return rebuild(root, (fresh) => {
    fresh.appendChild(renderStructure(pattern, handlers));
    fresh.appendChild(renderSound(pattern, handlers));
  });
}

/** MIDI export and other whole-Pattern actions. */
export function renderActionControls(root, pattern, state, handlers) {
  root.className = 'controls action-controls';
  return rebuild(root, (fresh) => fresh.appendChild(renderActions(pattern, state, handlers)));
}

/** Whole-Pattern operations: copy, delete, append, duplicate, export, submit. */
function renderActions(pattern, state, handlers) {
  const group = el('div', 'control-group actions');

  const button = (action, label, onClick, { disabled = false } = {}) => {
    const b = el('button', 'action', { type: 'button', textContent: label, disabled });
    b.dataset.action = action;
    b.addEventListener('click', onClick);
    group.appendChild(b);
    return b;
  };

  // Make Copy and Delete apply only to a Pattern you own. A shipped Pattern has
  // neither control rather than disabled ones: editing it goes through the
  // forced-naming flow, which is a different action (AC-7.4.6, US-7.5).
  if (state.isOwned) {
    button('make-copy', 'Make Copy', () => handlers.onMakeCopy());
    button('delete-pattern', 'Delete', () => handlers.onDelete());
  }

  button('append-pattern', 'Append…', () => handlers.onAppendPrompt(), {
    disabled: pattern.measures.length >= MAX_MEASURES,
  });
  button('duplicate-pattern', 'Double Length', () => handlers.onDuplicate(), {
    disabled: pattern.measures.length * 2 > MAX_MEASURES,
  });
  button('export-midi', 'Export MIDI', () => handlers.onExportMidi());
  // The standing possible-duplicates view (AC-11.1.4). It is library-wide, not about the
  // current Pattern, but it lives here because this is where whole-Pattern operations
  // are — and AC-15.1.8 already accounts for the actions area holding them.
  button('show-duplicates', 'Duplicates…', () => handlers.onShowDuplicates());
  button('submit-pattern', 'Submit', () => handlers.onSubmit());
  // Bulk submission is library-wide rather than about this Pattern (AC-13.1.2), and sits
  // beside Submit for the same reason Duplicates… does: this is where whole-Pattern
  // operations live, and separating the two Submits would only make the batch harder to find.
  button('submit-all', 'Submit All…', () => handlers.onSubmitAll());

  return group;
}

/**
 * The current Pattern's Family members. AC-11.2.5, AC-15.1.8.
 *
 * Last in the main panel, because these are a way *out* of the current Pattern rather
 * than a control on it — putting them higher would separate the transport from the
 * controls it drives.
 *
 * Hidden below 768px by CSS keyed on the shell's `data-viewport`, not by checking the
 * width here: `applyViewport` updates that attribute on resize but nothing re-renders,
 * so a JS width check would be right on load and wrong the moment the window changed.
 *
 * Absent entirely when there are no members — an empty "no related Patterns" row is a
 * permanent piece of furniture reporting nothing.
 */
export function renderFamilyMembers(root, family, handlers) {
  root.innerHTML = '';
  root.className = 'family-members';
  root.hidden = family.length === 0;
  if (family.length === 0) return;

  root.appendChild(
    el('h2', 'family-title', {
      textContent: family.length === 1 ? 'Same rhythm, 1 other version' : `Same rhythm, ${family.length} other versions`,
    })
  );

  const list = el('ul', 'family-list');
  for (const member of family) {
    const item = el('li', 'family-item');
    const link = el('button', 'family-link', { type: 'button', textContent: member.name });
    link.dataset.action = 'load-family-member';
    link.dataset.patternId = member.id;
    // What differs is the whole point of the relationship, so name it rather than
    // leaving the musician to open each one to find out.
    link.appendChild(
      el('span', 'family-kind', { textContent: member.soundMode === 'melodic' ? 'Melodic' : 'Percussive' })
    );
    link.addEventListener('click', () => handlers.onOpen(member.id, member.owned));
    item.appendChild(link);
    list.appendChild(item);
  }
  root.appendChild(list);
}

/**
 * The pulse level the amount pairs at: Quarters, 8ths, or 16ths (AC-4.4.7).
 * One value for the whole Pattern — the Quarters feel pairs whole Beats, which
 * no single Subdivision Group could own.
 */
const SWING_FEEL_LABELS = [
  ['quarter', 'Quarters'],
  ['eighth', '8ths'],
  ['sixteenth', '16ths'],
];

/**
 * Swing: one Pattern-wide slider (AC-4.4.12) beside the feel picker.
 *
 * The amount lands on the Pattern itself and every straight group inherits it
 * (AC-4.4.13) — the earlier per-Beat sliders only ever reached Measure 1
 * Beat 1, so every other Measure played straight.
 *
 * Both controls are absent — replaced by one explanatory note — when the
 * Pattern has no straight-feel group at all: swing is inapplicable to triplet
 * feel, not merely unavailable, so a disabled control would misdescribe it
 * (AC-4.4.3, AC-4.4.14). Any straight group is enough, odd-slot ones included:
 * an all-Undivided Pattern swings at the Quarters feel (AC-4.4.9).
 */
function renderSwing(pattern, handlers) {
  const group = el('div', 'control-group');

  let swingable = false;
  let firstOverride;
  for (const measure of pattern.measures) {
    const noteValue = beatNoteValue(measure.timeSignature);
    for (const beat of measure.beats) {
      subdivisionGroups(beat.recipe, noteValue).forEach((g, groupIndex) => {
        if (g.feel !== 'straight') return;
        swingable = true;
        firstOverride ??= beat.swing?.[groupIndex];
      });
    }
  }

  if (!swingable) {
    group.appendChild(
      el('p', 'swing-note', {
        textContent: "Swing doesn't apply — this Pattern is all triplet feel.",
      })
    );
    return group;
  }

  const feel = el('select', 'swing-feel');
  feel.dataset.action = 'set-swing-feel';
  for (const [value, label] of SWING_FEEL_LABELS) {
    feel.appendChild(el('option', null, { value, textContent: label }));
  }
  feel.value = pattern.swingFeel ?? DEFAULT_SWING_FEEL;
  feel.addEventListener('change', (e) => handlers.onSwingFeel(e.target.value));
  group.appendChild(labelled('Swing feel', feel));

  // A Pattern authored with per-group overrides and no Pattern-wide amount
  // still shows what it plays; moving the slider replaces the overrides.
  const value = pattern.swingAmount ?? firstOverride ?? 0;
  const slider = el('input', 'swing-slider', {
    type: 'range',
    min: String(MIN_SWING),
    max: String(MAX_SWING),
    step: '1',
    value: String(value),
  });
  slider.dataset.action = 'set-swing';
  slider.addEventListener('input', (e) => handlers.onSwing(Number(e.target.value)));
  group.appendChild(labelled(`Swing ${value}`, slider));

  return group;
}

/**
 * The pitch strip: the palette a Melodic grid is stamped from (US-2.2).
 *
 * It holds one armed pitch — a chromatic degree and an octave — and does
 * not itself touch the Pattern. Tapping a Slot's note band stamps whatever is
 * armed here onto that Slot (AC-2.2.6); changing what is armed alters nothing
 * already stamped (AC-2.2.9).
 *
 * It renders in its own section beside the grid rather than inside the Edit
 * accordion, because you cannot aim at a palette you have to open first
 * (AC-2.2.13). In Percussive mode it renders nothing at all.
 */
export function renderPitchStrip(root, pattern, state, handlers) {
  root.className = 'pitch-strip';
  root.hidden = pattern.soundMode !== 'melodic';
  return rebuild(root, (fresh) => {
    if (!root.hidden) renderPitchStripInto(fresh, pattern, state, handlers);
  });
}

function renderPitchStripInto(root, pattern, state, handlers) {
  const armed = state.armedPitch ?? { degree: '1', octaveOffset: 0 };
  const key = pattern.key ?? 'C';
  const scaleId = pattern.scale ?? DEFAULT_SCALE;

  root.appendChild(
    el('span', 'pitch-strip-label', {
      textContent: 'Note',
      title: 'Tap a note’s upper band in the grid to give it this pitch',
    })
  );

  // The scale drives the strip's in-scale marking and spelling, nothing else —
  // resolution to a sounding note never sees it (AC-2.5.5).
  const scale = el('select', 'scale-picker');
  scale.dataset.action = 'set-scale';
  scale.setAttribute('aria-label', 'Scale');
  let group = null;
  for (const s of SCALES) {
    if (group?.label !== s.category) {
      group = el('optgroup', null, { label: s.category });
      scale.appendChild(group);
    }
    group.appendChild(el('option', null, { value: s.id, textContent: s.label }));
  }
  scale.value = scaleId;
  scale.addEventListener('change', (e) => handlers.onScale(e.target.value));
  root.appendChild(scale);

  // One chip per chromatic degree, each the token it stamps (AC-2.2.4). The
  // scale's own degrees are marked in-scale — by class for colour and by a
  // visible marker for everyone else (AC-2.5.2) — and its spelling decides
  // whether the tritone chip reads b5 or #4 (AC-2.5.3).
  const degrees = el('div', 'degree-group', { role: 'group' });
  degrees.setAttribute('aria-label', 'Scale degree');
  for (const { token, inScale } of chromaticStrip(scaleId)) {
    const b = el('button', `degree${inScale ? ' in-scale' : ''}`);
    b.type = 'button';
    b.dataset.action = 'set-degree';
    b.dataset.degree = token;
    b.dataset.inScale = String(inScale);
    b.setAttribute('aria-pressed', String(token === armed.degree));

    b.appendChild(el('span', 'degree-number', { textContent: degreeLabel(token) }));

    // What this chip will actually stamp, at the octave armed right now — so
    // the palette reads the same way the grid does (AC-2.2.16). It describes
    // the chip's effect, so it moves when the Key or the octave moves.
    const named = spell({ degree: token, octaveOffset: armed.octaveOffset ?? 0 }, key);
    if (named) {
      const name = el('span', 'degree-name', { textContent: named });
      b.appendChild(name);
      b.dataset.noteName = named;
    }
    const nameBit = named ? ` — ${named}` : '';
    b.setAttribute('aria-label', `Degree ${token}${nameBit}${inScale ? ' (in scale)' : ''}`);

    b.addEventListener('click', () => handlers.onArmDegree(token));
    degrees.appendChild(b);
  }
  root.appendChild(degrees);

  root.appendChild(renderOctaveStepper(armed, handlers));
}

/**
 * A Pitch's note name, or nothing if this Key cannot spell it.
 *
 * An extended degree carrying an accidental can need a triple flat, which
 * `noteName` refuses rather than inventing a glyph for. A degree button with no
 * name under it is a smaller problem than a strip that fails to render.
 */
function spell(pitch, key) {
  try {
    return noteName(pitch, key).text;
  } catch {
    return null;
  }
}

/**
 * Absolute octave, stepped one at a time and clamped at 1 and 7 (AC-2.2.3).
 * The Pattern stores an offset from the base octave; only this readout converts.
 */
function renderOctaveStepper(armed, handlers) {
  const group = el('div', 'octave-stepper', { role: 'group' });
  group.setAttribute('aria-label', 'Octave');

  const current = octaveNumber(armed.octaveOffset ?? 0);
  const step = (delta, label, name) => {
    const b = el('button', 'octave-step', { type: 'button', textContent: label });
    b.dataset.action = name;
    b.disabled = clampOctave(current + delta) === current;
    b.setAttribute('aria-label', `${name === 'octave-up' ? 'Raise' : 'Lower'} octave`);
    b.addEventListener('click', () =>
      handlers.onArmOctave(octaveOffsetFor(clampOctave(current + delta)))
    );
    return b;
  };

  group.appendChild(step(-1, '−', 'octave-down'));
  const readout = el('output', 'octave-readout', { textContent: `Oct ${current}` });
  readout.dataset.octave = String(current);
  group.appendChild(readout);
  group.appendChild(step(1, '+', 'octave-up'));

  return group;
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

  return group;
}

/**
 * The Recipe strip: the palette a Beat's subdivision is painted from (AC-1.3.11).
 *
 * It holds one armed Recipe and does not itself touch the Pattern. Tapping
 * anywhere within a Beat gives that Beat the armed Recipe, which is what makes
 * mixed subdivision reachable on every Beat rather than only the first — this
 * replaced a single dropdown hardwired to Measure 1, Beat 1.
 *
 * Arming rather than a control on each Beat, because the grid has no horizontal
 * room to spend: AC-15.1.14/1 requires every Beat in a Measure to be the same
 * width, and AC-15.1.10 forbids sideways scroll at the densest supported Pattern.
 * A strip costs the grid nothing.
 *
 * The strip shows every Recipe the Pattern's Measures can take between them, so a
 * Pattern mixing 4/4 and 6/8 shows both sets. A Recipe no Measure can take is
 * disabled rather than hidden, so the palette does not rearrange itself as the
 * Pattern's meters change (AC-1.3.4, AC-1.3.5).
 */
export function renderRecipeStrip(root, pattern, state, handlers) {
  return rebuild(root, (fresh) => renderRecipeStripInto(fresh, pattern, state, handlers));
}

function renderRecipeStripInto(root, pattern, state, handlers) {
  const group = el('div', 'control-group recipe-strip');

  const noteValues = [...new Set(pattern.measures.map((m) => beatNoteValue(m.timeSignature)))];
  // Union across the meters present, in catalogue order, without duplicates.
  const seen = new Set();
  const offered = [];
  for (const nv of ['quarter', 'eighth']) {
    for (const r of recipesFor(nv)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      offered.push({ ...r, applies: noteValues.some((v) => isOffered(r.id, v)) });
    }
  }

  const chips = el('div', 'recipe-chips');
  for (const r of offered) {
    const armed = state.armedRecipe === r.id;
    const chip = el('button', `recipe-chip${armed ? ' armed' : ''}`, {
      type: 'button',
      textContent: r.label,
    });
    chip.dataset.action = 'arm-recipe';
    chip.dataset.recipe = r.id;
    chip.disabled = !r.applies;
    chip.setAttribute('aria-pressed', String(armed));
    chip.addEventListener('click', () => handlers.onArmRecipe(r.id));
    chips.appendChild(chip);
  }
  group.appendChild(labelled('Subdivision', chips));

  // Says what a tap will do now, because arming changes what the grid does with
  // one — the only mode in the app, so it states itself rather than being learned.
  const hint = el('p', 'recipe-hint', {
    textContent: state.armedRecipe
      ? 'Tap any Beat to give it this subdivision. Tap the chip again to stop.'
      : 'Pick a subdivision, then tap the Beats to apply it to.',
  });
  hint.dataset.armed = String(Boolean(state.armedRecipe));
  group.appendChild(hint);

  root.appendChild(group);
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
