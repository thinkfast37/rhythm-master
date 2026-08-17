/**
 * Pattern → an ordered, absolute-time list of scheduled events.
 *
 * This is where meter, Recipe, accent, swing and pitch compose, and it is the
 * single boundary between "what the Pattern is" and "when things sound". The
 * scheduler, the playback cursor, and the MIDI exporter all consume this one
 * list, which is what makes SC-003 hold: the .mid file and what you hear cannot
 * disagree, because neither re-derives anything.
 *
 * Times are relative to the start of a loop pass. The scheduler adds its own
 * absolute audio-clock origin (FR-009).
 */
import { beatCount, beatDurationSeconds, beatNoteValue } from './meter.js';
import { slotCount, subdivisionGroups } from './recipes.js';
import { effectiveAccent } from './accents.js';
import { resolve } from './pitch.js';
import { swungOffsets } from './swing.js';

/**
 * @typedef {object} TimelineEvent
 * @property {number} timeSeconds   onset, relative to loop start
 * @property {number} measureIndex
 * @property {number} beatIndex
 * @property {number} slotIndex
 * @property {1|2|3} accent
 * @property {{midiNote: number, frequency: number}|null} pitch
 */

/**
 * Every sounding Slot in one loop pass, in time order.
 *
 * Off Slots produce no event at all — silence is the absence of an event, not
 * an event with zero amplitude.
 */
export function buildTimeline(pattern) {
  const events = [];
  let measureStart = 0;

  pattern.measures.forEach((measure, measureIndex) => {
    const { timeSignature } = measure;
    const beatDuration = beatDurationSeconds(timeSignature, pattern.tempo);
    const noteValue = beatNoteValue(timeSignature);

    measure.beats.forEach((beat, beatIndex) => {
      const beatStart = measureStart + beatIndex * beatDuration;
      const n = slotCount(beat.recipe, noteValue);
      const groups = subdivisionGroups(beat.recipe, noteValue);

      /*
       * Slot duration is uniform across the Beat: a 5-Slot mixed Recipe divides
       * the Beat into two half-Beats, each subdivided evenly, so the two
       * straight Slots and the three triplet Slots occupy a half-Beat apiece.
       * Computing per group rather than per Beat is what makes mixed feel come
       * out right instead of five equal fifths.
       */
      const halfBeat = beatDuration / groups.length;

      groups.forEach((group, groupIndex) => {
        const groupStart = beatStart + groupIndex * halfBeat;
        const slotDuration = halfBeat / group.slotIndices.length;

        const swing = group.feel === 'straight' ? (beat.swing?.[groupIndex] ?? 0) : 0;
        const offsets = swungOffsets(group.slotIndices.length, swing, slotDuration);

        group.slotIndices.forEach((slotIndex, withinGroup) => {
          const slot = beat.slots[slotIndex];
          if (!slot?.on) return;

          const accent = effectiveAccent(measure, beatIndex, slotIndex);
          const pitch =
            pattern.soundMode === 'melodic' && slot.pitch
              ? resolve(slot.pitch, pattern.key)
              : null;

          events.push({
            timeSeconds: groupStart + withinGroup * slotDuration + offsets[withinGroup],
            measureIndex,
            beatIndex,
            slotIndex,
            accent,
            pitch,
          });
        });
      });

      // Guard against a Beat whose Slot array and Recipe have drifted apart.
      if (beat.slots.length !== n) {
        throw new Error(
          `Measure ${measureIndex + 1} Beat ${beatIndex + 1}: ${beat.slots.length} Slots for ` +
            `${beat.recipe}, expected ${n}`
        );
      }
    });

    measureStart += beatCount(timeSignature) * beatDuration;
  });

  // Swing can push a Slot past a later group's first Slot, so sort rather than
  // assume construction order is play order.
  events.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return events;
}

/** Seconds for one full pass through every Measure. */
export function loopDurationSeconds(pattern) {
  return pattern.measures.reduce(
    (total, m) => total + beatCount(m.timeSignature) * beatDurationSeconds(m.timeSignature, pattern.tempo),
    0
  );
}

/** Beat onsets in one loop pass — what the metronome clicks on. US-4.3 */
export function buildBeatGrid(pattern) {
  const beats = [];
  let measureStart = 0;
  pattern.measures.forEach((measure, measureIndex) => {
    const beatDuration = beatDurationSeconds(measure.timeSignature, pattern.tempo);
    for (let beatIndex = 0; beatIndex < measure.beats.length; beatIndex++) {
      beats.push({
        timeSeconds: measureStart + beatIndex * beatDuration,
        measureIndex,
        beatIndex,
        isDownbeat: beatIndex === 0,
      });
    }
    measureStart += measure.beats.length * beatDuration;
  });
  return beats;
}
