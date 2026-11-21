/**
 * How long an exported note lasts (US-12.5, research.md D-030).
 *
 * Staccato is the length every export has always written. Legato lengthens a
 * pitched note to the next note of its part and then by its instrument's
 * ring. Pure: this module works in ticks on plain notes and knows nothing of
 * MIDI bytes; `export/midi.js` hands it the notes of one part and writes what
 * it returns.
 */

/** The two note lengths, in the order the choice shows them (AC-12.5.1/1). */
export const ARTICULATIONS = Object.freeze([
  Object.freeze({ id: 'staccato', label: 'Staccato' }),
  Object.freeze({ id: 'legato', label: 'Legato' }),
]);

export const DEFAULT_ARTICULATION = 'staccato';

/** A stored choice as one of the two, Staccato for anything else. */
export function normaliseArticulation(articulation) {
  return articulation === 'legato' ? 'legato' : DEFAULT_ARTICULATION;
}

/**
 * The length of each note of ONE part on Legato (AC-12.5.2/1, /2):
 *
 *   to the next note of the part, then the note's ring;
 *   ending one tick before the same pitch is struck again;
 *   never past `endTick`, and never shorter than one tick.
 *
 * Notes that begin together — a chord — share the next onset after them.
 * The last note of the part counts `endTick` as its next onset.
 *
 * @param {Array<{tick: number, pitch: number, ringTicks: number}>} notes  in any order
 * @param {number} endTick  where the file ends
 * @returns {number[]} a length in ticks for each note, in the order given
 */
export function legatoTicks(notes, endTick) {
  const onsets = [...new Set(notes.map((n) => n.tick))].sort((a, b) => a - b);
  const nextOnset = (tick) => onsets.find((t) => t > tick) ?? endTick;
  return notes.map((note) => {
    let end = Math.max(nextOnset(note.tick), note.tick) + Math.max(0, Math.round(note.ringTicks ?? 0));
    // The same pitch struck again: this one must be off first.
    const again = notes.reduce((soonest, other) => (other.pitch === note.pitch && other.tick > note.tick && other.tick < soonest ? other.tick : soonest), Infinity);
    if (again !== Infinity) end = Math.min(end, again - 1);
    end = Math.min(end, endTick);
    return Math.max(1, end - note.tick);
  });
}
