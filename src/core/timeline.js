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
import { chordAt, resolveChordTone, resolveStep, arpeggioDeal, soundingPitch } from './harmony.js';
import { swungOffsets, swungDelay, DEFAULT_SWING_FEEL } from './swing.js';

/**
 * @typedef {object} TimelineEvent
 * @property {number} timeSeconds   onset, relative to loop start
 * @property {number} measureIndex
 * @property {number} beatIndex
 * @property {number} slotIndex
 * @property {1|2|3} accent
 * @property {{midiNote: number, frequency: number}|null} pitch
 * @property {number} pass          which pass this timeline is for (US-2.6)
 * @property {number|null} chordIndex  the chord in force, or null without a progression
 */

/**
 * Every sounding Slot in one loop pass, in time order.
 *
 * Off Slots produce no event at all — silence is the absence of an event, not
 * an event with zero amplitude.
 *
 * `pass` matters only under a progression (US-2.6): a chord-tone Pitch resolves
 * through the chord in force for that pass and Measure, so pass 1 of I–IV–V
 * sounds the IV. Everything else is pass-independent, which is why the timeline
 * stays per pass rather than per harmonic cycle — an edit still lands at the
 * next pass (AC-4.1.9), and MIDI export concatenates passes from this one
 * function (AC-2.6.4/6, research.md D-011).
 */
export function buildTimeline(pattern, pass = 0) {
  const events = [];
  let measureStart = 0;
  const feel = pattern.swingFeel ?? DEFAULT_SWING_FEEL;

  // A per-group amount is a data override (AC-4.4.2); everything else inherits
  // the Pattern-wide amount (AC-4.4.13) — which is why a Measure added after
  // the amount was set swings without any copying step.
  const groupSwing = (beat, groupIndex) => beat.swing?.[groupIndex] ?? pattern.swingAmount ?? 0;
  // Under an arpeggio the steps are dealt across the sounding Slots, and the
  // deal restarts on each chord change, so it belongs to this pass (AC-2.6.6).
  const deal = arpeggioDeal(pattern, pass);

  pattern.measures.forEach((measure, measureIndex) => {
    const { timeSignature } = measure;
    const beatDuration = beatDurationSeconds(timeSignature, pattern.tempo);
    const noteValue = beatNoteValue(timeSignature);
    const chordIndex = chordAt(pattern, pass, measureIndex);
    const chord = chordIndex === null ? null : pattern.harmony.chords[chordIndex];

    measure.beats.forEach((beat, beatIndex) => {
      const beatStart = measureStart + beatIndex * beatDuration;
      const n = slotCount(beat.recipe, noteValue);
      const groups = subdivisionGroups(beat.recipe, noteValue);

      /*
       * The Quarters feel pairs Beats within the Measure — (1,2), (3,4), … —
       * and delays the whole second Beat of each pair, its internal spacing
       * intact, by the swing of the pair's first Beat's first straight group
       * (AC-4.4.9). An unpaired final Beat in an odd meter stays put, the same
       * rule that leaves an odd Slot group unswung.
       */
      let beatDelay = 0;
      if (feel === 'quarter' && beatIndex % 2 === 1) {
        const leader = measure.beats[beatIndex - 1];
        const leaderGroups = subdivisionGroups(leader.recipe, noteValue);
        const straight = leaderGroups.findIndex((g) => g.feel === 'straight');
        const amount = straight >= 0 ? groupSwing(leader, straight) : 0;
        beatDelay = swungDelay(amount, beatDuration);
      }

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

        // Group-level offsets are zero at Quarters — that feel delays whole
        // Beats above, never Slots within a group.
        const swing = group.feel === 'straight' && feel !== 'quarter' ? groupSwing(beat, groupIndex) : 0;
        const offsets = swungOffsets(group.slotIndices.length, swing, slotDuration, feel);

        group.slotIndices.forEach((slotIndex, withinGroup) => {
          const slot = beat.slots[slotIndex];
          if (!slot?.on) return;

          const accent = effectiveAccent(measure, beatIndex, slotIndex);
          let pitch = null;
          const sounding = pattern.soundMode === 'melodic' ? soundingPitch(slot, deal, measureIndex, beatIndex, slotIndex) : null;
          if (sounding) {
            pitch =
              sounding.step !== undefined
                ? resolveStep(sounding.step, chord, pattern.key, pattern, sounding.octaveOffset)
                : sounding.tone !== undefined
                  ? resolveChordTone(sounding, chord, pattern.key)
                  : resolve(sounding, pattern.key);
          }

          events.push({
            timeSeconds: groupStart + withinGroup * slotDuration + offsets[withinGroup] + beatDelay,
            measureIndex,
            beatIndex,
            slotIndex,
            accent,
            pitch,
            pass,
            chordIndex,
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
