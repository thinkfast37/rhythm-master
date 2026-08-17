/**
 * Duplicate and Pattern Family detection. US-11.1, US-11.2.
 *
 * A *duplicate* is identical in every musical aspect. A *Family* shares an
 * identical rhythm but differs in Sound Mode or Pitch — a discovery
 * relationship, not a warning.
 *
 * The fingerprint deliberately ignores name, tags, rating, and tempo: two
 * Patterns with the same notes are the same rhythm whatever they are called or
 * how fast you happen to be practising them.
 */
import { effectiveAccent } from './accents.js';

/**
 * A stable string over meter, Recipes, Slot on/off and effective accents.
 * Effective rather than stored accents, so a Pattern that spells out its
 * defaults explicitly fingerprints the same as one that leaves them computed.
 */
export function rhythmFingerprint(pattern) {
  return pattern.measures
    .map((measure) =>
      [
        measure.timeSignature,
        measure.beats
          .map((beat, beatIndex) => {
            const swing = Object.entries(beat.swing ?? {})
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${k}:${v}`)
              .join(',');
            const slots = beat.slots
              .map((_, slotIndex) => effectiveAccent(measure, beatIndex, slotIndex))
              .join('');
            return `${beat.recipe}[${slots}]${swing ? `{${swing}}` : ''}`;
          })
          .join('|'),
      ].join(' ')
    )
    .join(' // ');
}

/** Pitch content, or null for a Percussive Pattern. */
export function pitchFingerprint(pattern) {
  if (pattern.soundMode !== 'melodic') return null;
  return [
    pattern.key,
    ...pattern.measures.flatMap((m) =>
      m.beats.flatMap((b) =>
        b.slots.map((s) => (s.on && s.pitch ? `${s.pitch.degree}@${s.pitch.octaveOffset ?? 0}` : '-'))
      )
    ),
  ].join(' ');
}

/** Identical in every musical aspect. AC-11.1.x */
export function isDuplicate(a, b) {
  return (
    a.soundMode === b.soundMode &&
    a.tempo === b.tempo &&
    rhythmFingerprint(a) === rhythmFingerprint(b) &&
    pitchFingerprint(a) === pitchFingerprint(b)
  );
}

/** Same rhythm, different Sound Mode or Pitch. AC-11.2.x */
export function isSameFamily(a, b) {
  if (rhythmFingerprint(a) !== rhythmFingerprint(b)) return false;
  return !isDuplicate(a, b);
}

/** Every duplicate of `pattern` in `candidates`, excluding itself by id. */
export function findDuplicates(pattern, candidates) {
  return candidates.filter((c) => c.id !== pattern.id && isDuplicate(pattern, c));
}

/** Every Family member of `pattern` in `candidates`, excluding itself by id. */
export function findFamily(pattern, candidates) {
  return candidates.filter((c) => c.id !== pattern.id && isSameFamily(pattern, c));
}

/**
 * Group a library into sets of true duplicates, two or more each. AC-11.1.4.
 *
 * Library-wide rather than relative to one Pattern: a duplicate that emerged through
 * ongoing auto-saved edits may be between two Patterns neither of which is open, and
 * this view is the only place such a pair ever surfaces.
 *
 * Grouping is by rhythm first because that is the cheap discriminator, then by full
 * duplicate equality within each bucket — same rhythm is necessary for duplication but
 * not sufficient, since Sound Mode, Pitch, swing and tempo all still have to agree.
 */
export function duplicateGroups(patterns) {
  const byRhythm = new Map();
  for (const p of patterns) {
    const key = rhythmFingerprint(p);
    if (!byRhythm.has(key)) byRhythm.set(key, []);
    byRhythm.get(key).push(p);
  }

  const groups = [];
  for (const bucket of byRhythm.values()) {
    const unplaced = [...bucket];
    while (unplaced.length > 0) {
      const head = unplaced.shift();
      const matches = [];
      // Walk forwards and collect, so a group lists its members in library order. The
      // view puts a Remove control on each row, and a list whose order does not follow
      // the library is one where it is easy to delete the wrong Pattern.
      for (let i = 0; i < unplaced.length; ) {
        if (isDuplicate(head, unplaced[i])) matches.push(...unplaced.splice(i, 1));
        else i++;
      }
      if (matches.length > 0) groups.push([head, ...matches]);
    }
  }
  return groups;
}

/** Group a library into Families of two or more. */
export function familyGroups(patterns) {
  const byRhythm = new Map();
  for (const p of patterns) {
    const key = rhythmFingerprint(p);
    if (!byRhythm.has(key)) byRhythm.set(key, []);
    byRhythm.get(key).push(p);
  }
  return [...byRhythm.values()].filter((group) => group.length > 1);
}
