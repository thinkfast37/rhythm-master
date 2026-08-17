/**
 * The Pattern grid — the single on-screen source of truth.
 *
 * Constitution Principle II: there is exactly one grid instance, and its render
 * is a pure function of (pattern, transportPosition). Every control mutates the
 * Pattern and re-renders through here; nothing holds display state that can
 * drift from the Pattern object.
 *
 * Layout is one Measure per row, stacked vertically, on every viewport
 * (research.md D-006). At the densest supported Pattern — 6 Measures of 12/8 at
 * Straight 16ths, 144 Slots — a single-line layout would put Slots under 3 mm on
 * a phone, so the Pattern is read down the page instead and nothing ever scrolls
 * sideways (AC-15.1.10).
 */
import { beatNoteValue } from '../core/meter.js';
import { slotCount, subdivisionGroups } from '../core/recipes.js';
import { effectiveAccent } from '../core/accents.js';
import { labelsFor, effectiveSystem } from '../core/counting.js';
import { noteName } from '../core/pitch.js';

const ACCENT_CLASS = { 0: 'off', 1: 'weak', 2: 'medium', 3: 'strong' };

/**
 * Render the whole grid.
 *
 * @param {HTMLElement} root
 * @param {object} pattern
 * @param {{measureIndex:number,beatIndex:number,slotIndex:number}|null} transportPosition
 * @param {{countingSystem?: string}} [options]
 */
export function renderGrid(root, pattern, transportPosition = null, options = {}) {
  const system = effectiveSystem(pattern, options.countingSystem ?? 'takadimi');
  const readOnly = options.readOnly === true;

  root.innerHTML = '';
  root.className = readOnly ? 'grid read-only' : 'grid';

  pattern.measures.forEach((measure, measureIndex) => {
    root.appendChild(
      renderMeasure(measure, measureIndex, pattern, transportPosition, system, readOnly, pattern.key)
    );
  });

  return root;
}

/**
 * A Measure's meter label is prominent when it differs from the Measure before
 * it, dimmed when it repeats — so a mixed-meter Pattern's changes stand out and
 * a uniform one does not shout its meter six times (AC-1.4.4, AC-1.4.5).
 * Measure 1 is always prominent: it is the Pattern's opening meter.
 */
export function meterProminence(measures, index) {
  if (index === 0) return 'prominent';
  return measures[index].timeSignature === measures[index - 1].timeSignature
    ? 'dimmed'
    : 'prominent';
}

function renderMeasure(measure, measureIndex, pattern, position, system, readOnly, key) {
  const row = document.createElement('section');
  row.className = 'measure';
  row.dataset.measure = String(measureIndex);
  row.dataset.timeSignature = measure.timeSignature;

  // Per-Measure Time Signature, shown in the grid rather than in a global
  // control, because in this app it is per-Measure (US-1.4). Every Measure
  // shows its label; prominence says whether it changed.
  const prominence = meterProminence(pattern.measures, measureIndex);

  // A read-only context shows the same labels with the same treatment but
  // opens no picker, so it is a span rather than a disabled button (AC-1.4.8).
  const meter = document.createElement(readOnly ? 'span' : 'button');
  if (!readOnly) {
    meter.type = 'button';
    meter.dataset.action = 'change-time-signature';
  }
  meter.className = `measure-meter ${prominence}`;
  meter.textContent = measure.timeSignature;
  meter.dataset.measure = String(measureIndex);
  meter.dataset.prominence = prominence;
  meter.setAttribute('title', `Measure ${measureIndex + 1} — ${measure.timeSignature}`);
  row.appendChild(meter);

  const beats = document.createElement('div');
  beats.className = 'beats';
  const noteValue = beatNoteValue(measure.timeSignature);

  measure.beats.forEach((beat, beatIndex) => {
    beats.appendChild(
      renderBeat(beat, beatIndex, measure, measureIndex, noteValue, pattern, position, system, readOnly, key)
    );
  });

  row.appendChild(beats);
  return row;
}

function renderBeat(beat, beatIndex, measure, measureIndex, noteValue, pattern, position, system, readOnly, key) {
  const melodic = pattern.soundMode === 'melodic';
  const el = document.createElement('div');
  el.className = 'beat';
  el.dataset.beat = String(beatIndex);
  el.dataset.recipe = beat.recipe;

  const labels = labelsFor(beat.recipe, noteValue, system);
  const groups = subdivisionGroups(beat.recipe, noteValue);

  // A mixed Recipe's two halves are separate group elements, so the
  // straight/triplet boundary is structural rather than a drawn line.
  groups.forEach((group, groupIndex) => {
    const groupEl = document.createElement('div');
    groupEl.className = `group feel-${group.feel}`;
    groupEl.dataset.group = String(groupIndex);
    groupEl.dataset.feel = group.feel;
    // Swing is inapplicable to triplet feel, so a triplet group carries no
    // swing data at all rather than a disabled zero (AC-4.4.3).
    if (group.feel === 'straight') {
      groupEl.dataset.swing = String(beat.swing?.[groupIndex] ?? 0);
    }

    group.slotIndices.forEach((slotIndex) => {
      groupEl.appendChild(
        renderSlot(
          measure, measureIndex, beatIndex, slotIndex, labels[slotIndex], position, melodic, readOnly, key
        )
      );
    });

    el.appendChild(groupEl);
  });

  if (beat.slots.length !== slotCount(beat.recipe, noteValue)) {
    throw new Error(
      `Measure ${measureIndex + 1} Beat ${beatIndex + 1}: Slot array disagrees with its Recipe`
    );
  }

  return el;
}

/**
 * The Slot's Pitch, as shown in the grid: its scale degree, and under it the
 * note that degree actually sounds in this Key (AC-2.2.15).
 *
 * Two lines rather than one, and that is a fitting constraint rather than a
 * style. Measured at the densest supported Pattern on a 390px phone — 8
 * Measures of 12/8 at Straight 16ths, 192 Slots — the band is 29.2px wide. The
 * widest name any Key can produce is a double accidental (`Abb4`, b2 in G♭),
 * which needs 24.1px stacked and fits; side by side that same Pitch needs
 * 36.1px and does not (AC-2.2.15/3).
 *
 * Absent on a Slot that does not sound, because such a Slot holds no Pitch to
 * show (AC-2.2.8).
 */
function renderPitchBadge(slot, key) {
  if (!slot.on || !slot.pitch) return null;

  const pitch = document.createElement('span');
  pitch.className = 'slot-pitch';
  pitch.dataset.degree = slot.pitch.degree;
  pitch.dataset.octave = String(slot.pitch.octaveOffset ?? 0);

  const degree = document.createElement('span');
  degree.className = 'slot-degree';
  degree.textContent = slot.pitch.degree;
  pitch.appendChild(degree);

  // A Pattern mid-conversion to Melodic can hold a Pitch before a Key is set,
  // and an unspellable degree throws rather than guessing. Neither is a reason
  // to lose the degree the Composer authored, so the name is what goes missing.
  const named = key ? tryNoteName(slot.pitch, key) : null;
  if (named) {
    const name = document.createElement('span');
    name.className = 'slot-note-name';
    name.textContent = named.text;
    name.dataset.noteName = named.text;
    pitch.appendChild(name);
    pitch.dataset.noteName = named.text;
  }

  return pitch;
}

/** The name, or nothing — a Pitch the Key cannot spell must not blank the grid. */
function tryNoteName(pitch, key) {
  try {
    return noteName(pitch, key);
  } catch {
    return null;
  }
}

/**
 * A Slot.
 *
 * In editable Melodic mode it is split into two controls (AC-2.2.10): an accent
 * zone on top that cycles Accent Level, and a note band beneath it that stamps
 * the armed pitch. They are separate elements rather than one button reading
 * its click coordinates, so each carries its own hit area, focus ring and
 * accessible name, and neither can be triggered by aiming at the other.
 *
 * The band is underneath, and separated by a gap, because the count and the
 * accent are what a musician tracks while working on rhythm — pitch above them
 * put the melody between the eye and the accent fill it belongs to (AC-2.2.14).
 *
 * Everywhere else — Percussive, and any read-only grid — the Slot stays the
 * single accent control it has always been. The outer `.slot` keeps its dataset
 * and its `playing` class in both shapes, so nothing downstream has to know
 * which one it is looking at.
 */
function renderSlot(measure, measureIndex, beatIndex, slotIndex, label, position, melodic, readOnly, key) {
  const accent = effectiveAccent(measure, beatIndex, slotIndex);
  const slot = measure.beats[beatIndex].slots[slotIndex];
  const split = melodic && !readOnly;

  const el = document.createElement(split ? 'div' : 'button');
  if (!split) {
    el.type = 'button';
    if (!readOnly) el.dataset.action = 'cycle-accent';
  }
  el.className = `slot accent-${ACCENT_CLASS[accent]}${split ? ' has-note' : ''}`;
  el.dataset.measure = String(measureIndex);
  el.dataset.beat = String(beatIndex);
  el.dataset.slot = String(slotIndex);
  el.dataset.accent = String(accent);

  const active =
    position &&
    position.measureIndex === measureIndex &&
    position.beatIndex === beatIndex &&
    position.slotIndex === slotIndex;
  if (active) el.classList.add('playing');

  // Fill height is the second channel alongside colour: at 144 Slots a height
  // difference scans faster than a hue difference for any user (D-005).
  const fill = document.createElement('span');
  fill.className = 'slot-fill';
  fill.style.height = `${[0, 34, 67, 100][accent]}%`;

  const text = document.createElement('span');
  text.className = 'slot-label';
  text.textContent = label;

  if (!split) {
    el.append(fill, text);
    // In Melodic mode the Slot shows its scale degree and the note it names,
    // since that is the musical content there.
    if (melodic) {
      const badge = renderPitchBadge(slot, key);
      if (badge) el.appendChild(badge);
    }
    return el;
  }

  const accentZone = document.createElement('button');
  accentZone.type = 'button';
  accentZone.className = 'slot-accent';
  accentZone.dataset.action = 'cycle-accent';
  accentZone.dataset.measure = String(measureIndex);
  accentZone.dataset.beat = String(beatIndex);
  accentZone.dataset.slot = String(slotIndex);
  accentZone.append(fill, text);

  // A Slot that does not sound has no note to pitch, so its band is inert
  // rather than tappable-and-refusing (AC-2.2.5). `disabled` is what says that
  // to a pointer, a keyboard and a screen reader at once.
  const note = document.createElement('button');
  note.type = 'button';
  note.className = 'slot-note';
  note.dataset.action = 'stamp-pitch';
  note.dataset.measure = String(measureIndex);
  note.dataset.beat = String(beatIndex);
  note.dataset.slot = String(slotIndex);
  note.disabled = !slot.on;
  const badge = renderPitchBadge(slot, key);
  if (badge) note.appendChild(badge);
  note.setAttribute(
    'title',
    slot.on
      ? `Set this note's pitch to the armed pitch (currently ${badge?.dataset.noteName ?? slot.pitch?.degree ?? '—'})`
      : 'Turn this Slot on above before giving it a pitch'
  );

  // Accent first in DOM order, because it is first on screen (AC-2.2.14/1) and
  // that is also the order a keyboard should reach them in.
  el.append(accentZone, note);
  return el;
}
