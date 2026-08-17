/**
 * Showing a submitted Pattern as something a musician can judge.
 *
 * The point of the review step is deciding whether this is a Pattern worth
 * shipping, and a wall of JSON does not answer that — least of all when the
 * submission arrived compressed and there is no readable form at all until
 * something decodes it.
 *
 * Accent Levels are read through `core/accents.js` rather than re-derived, so
 * what is shown here is what will actually sound (Principle I: musical
 * arithmetic lives in core/ and is never recomputed elsewhere). A stored accent
 * is an override; everything else is the computed default, and both display the
 * same because both play the same.
 */
import { defaultAccent, OFF, WEAK, MEDIUM, STRONG } from '../../../../src/core/accents.js';

/** Strong / medium / weak / silent, as one character each. */
const GLYPH = { [STRONG]: 'X', [MEDIUM]: 'o', [WEAK]: 'x', [OFF]: '·' };

function accentOf(measure, beatIndex, slotIndex) {
  const slot = measure.beats[beatIndex].slots[slotIndex];
  if (!slot.on) return OFF;
  return slot.accent ?? defaultAccent(measure, beatIndex, slotIndex);
}

/** One Measure as `|X · · ·|x · o ·|` — Beats separated, Slots spaced. */
export function renderMeasure(measure) {
  const beats = measure.beats.map((beat, b) =>
    beat.slots.map((_, s) => GLYPH[accentOf(measure, b, s)]).join(' ')
  );
  return `|${beats.join('|')}|`;
}

/** How many Slots actually sound, which is the quickest read on whether it is music. */
export function countNotes(pattern) {
  let n = 0;
  for (const m of pattern.measures) for (const b of m.beats) for (const s of b.slots) if (s.on) n++;
  return n;
}

/**
 * The whole Pattern, for a terminal.
 *
 * @param {object} pattern     in seed-file shape
 * @param {{issue?: number, author?: string, id?: string}} [provenance]
 */
export function renderPattern(pattern, provenance = {}) {
  const meters = [...new Set(pattern.measures.map((m) => m.timeSignature))];
  const recipes = [...new Set(pattern.measures.flatMap((m) => m.beats.map((b) => b.recipe)))];

  const head = [
    `${pattern.name}${provenance.id ? `  [${provenance.id}]` : ''}`,
    [
      `${pattern.measures.length} Measure${pattern.measures.length === 1 ? '' : 's'}`,
      meters.join(' → '),
      `${pattern.tempo} BPM`,
      pattern.soundMode,
      pattern.soundMode === 'melodic' ? `Key of ${pattern.key}` : null,
      `${countNotes(pattern)} notes`,
    ]
      .filter(Boolean)
      .join(' · '),
    `Recipes: ${recipes.join(', ')}`,
    pattern.tags?.length ? `Tags: ${pattern.tags.join(', ')}` : 'Tags: none',
    provenance.issue ? `From issue #${provenance.issue} by ${provenance.author ?? 'unknown'}` : null,
  ].filter(Boolean);

  const width = String(pattern.measures.length).length;
  const body = pattern.measures.map(
    (m, i) => `  M${String(i + 1).padStart(width)} ${renderMeasure(m)}`
  );

  // Swing is per Subdivision Group and easy to miss in a grid of glyphs, so it is
  // called out rather than left to be inferred.
  const swung = [];
  pattern.measures.forEach((m, mi) =>
    m.beats.forEach((b, bi) => {
      if (b.swing) swung.push(`M${mi + 1}B${bi + 1}=${b.swing}`);
    })
  );

  return [
    ...head,
    '',
    ...body,
    '',
    `  X strong · o medium · x weak · · silent${swung.length ? `\n  Swing: ${swung.join(' ')}` : ''}`,
  ].join('\n');
}
