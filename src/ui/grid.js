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

  root.innerHTML = '';
  root.className = 'grid';

  pattern.measures.forEach((measure, measureIndex) => {
    root.appendChild(renderMeasure(measure, measureIndex, pattern, transportPosition, system));
  });

  return root;
}

function renderMeasure(measure, measureIndex, pattern, position, system) {
  const row = document.createElement('section');
  row.className = 'measure';
  row.dataset.measure = String(measureIndex);
  row.dataset.timeSignature = measure.timeSignature;

  // Per-Measure Time Signature, shown in the grid rather than in a global
  // control, because in this app it is per-Measure (US-1.4).
  const meter = document.createElement('button');
  meter.type = 'button';
  meter.className = 'measure-meter';
  meter.textContent = measure.timeSignature;
  meter.dataset.action = 'change-time-signature';
  meter.dataset.measure = String(measureIndex);
  meter.setAttribute('title', `Measure ${measureIndex + 1} — ${measure.timeSignature}`);
  row.appendChild(meter);

  const beats = document.createElement('div');
  beats.className = 'beats';
  const noteValue = beatNoteValue(measure.timeSignature);

  measure.beats.forEach((beat, beatIndex) => {
    beats.appendChild(
      renderBeat(beat, beatIndex, measure, measureIndex, noteValue, pattern, position, system)
    );
  });

  row.appendChild(beats);
  return row;
}

function renderBeat(beat, beatIndex, measure, measureIndex, noteValue, pattern, position, system) {
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
          measure, measureIndex, beatIndex, slotIndex, labels[slotIndex], position, melodic
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

function renderSlot(measure, measureIndex, beatIndex, slotIndex, label, position, melodic) {
  const accent = effectiveAccent(measure, beatIndex, slotIndex);
  const slot = measure.beats[beatIndex].slots[slotIndex];

  const el = document.createElement('button');
  el.type = 'button';
  el.className = `slot accent-${ACCENT_CLASS[accent]}`;
  el.dataset.action = 'cycle-accent';
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
  el.appendChild(fill);

  const text = document.createElement('span');
  text.className = 'slot-label';
  text.textContent = label;
  el.appendChild(text);

  // In Melodic mode the Slot shows its scale degree and octave, since that is
  // the musical content there — the counting syllable is secondary.
  if (melodic && slot.on && slot.pitch) {
    const pitch = document.createElement('span');
    pitch.className = 'slot-pitch';
    pitch.dataset.degree = slot.pitch.degree;
    pitch.dataset.octave = String(slot.pitch.octaveOffset ?? 0);
    const marks = slot.pitch.octaveOffset > 0 ? "'".repeat(slot.pitch.octaveOffset)
      : slot.pitch.octaveOffset < 0 ? ','.repeat(-slot.pitch.octaveOffset) : '';
    pitch.textContent = `${slot.pitch.degree}${marks}`;
    el.appendChild(pitch);
  }

  return el;
}
