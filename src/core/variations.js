/**
 * Vary a loop (US-10.4, research.md D-025).
 *
 * The original is the Pattern's first N Measures. A candidate is a copy of the
 * original with a stack of techniques applied, in the order they were added,
 * each with the choice it was made with. Accepting appends the candidate as
 * Measures, so a one-Measure Pattern becomes two, then three — every variation
 * built from the same original, never from the latest copy (AC-10.4.1/3).
 *
 * Every technique is one exact rule (AC-10.4.5): `reason` says why it cannot
 * apply, `fields` offers the choices its rule allows — never guessed in silence
 * (AC-10.4.3) — and `apply` is a pure transform. Nothing here draws a random
 * number: `rollStack` takes them from the caller (AC-10.4.6/6, D-021).
 *
 * A candidate is Pattern-shaped — the Pattern's own fields over the copied
 * Measures, its harmony with overrides keyed by the copy's own Measure index —
 * so every helper that reads a Pattern reads a candidate, and `append` is all
 * Accept needs. A chord technique writes an override for the chosen chord into
 * every Measure of the candidate (AC-10.4.5/16).
 */
import { MAX_MEASURES, setRecipe, append } from './pattern.js';
import { beatNoteValue } from './meter.js';
import { WEAK, STRONG, defaultAccent, effectiveAccent } from './accents.js';
import { octaveNumber, MIN_OCTAVE, MAX_OCTAVE } from './pitch.js';
import { measureLabels } from './counting.js';
import {
  ARPEGGIOS,
  QUALITIES,
  hasHarmony,
  chordInMeasure,
  chordName,
  chordStack,
  memberCount,
  memberLabel,
  inversionOf,
  omitOf,
  omitOptions,
  fillOf,
  setChordOverride,
  mapOverrides,
  withOverrides,
  MIN_MEMBERS,
  roleOfInterval,
} from './harmony.js';

const clone = (v) => structuredClone(v);

/** The headings the dialog files the techniques under (AC-10.4.8/2), in order. */
export const GROUPS = ['Rhythm', 'Dynamics', 'Chord', 'Pitch'];

/* --- the original and the candidate --------------------------------------- */

/**
 * The original's length: the remembered one, or the whole Pattern when none
 * is remembered or the remembered one is longer than the Pattern (AC-10.4.2/1).
 */
export function phraseLengthOf(pattern, remembered = null) {
  const n = pattern.measures.length;
  if (!Number.isInteger(remembered) || remembered < 1 || remembered > n) return n;
  return remembered;
}

/** Whether another variation of this length fits under the cap (AC-10.4.1/6). */
export function canAddVariation(pattern, phraseLength) {
  return pattern.measures.length + phraseLength <= MAX_MEASURES;
}

/** The copy of the original a candidate starts from: the Pattern's first N Measures, overrides on them included. */
export function freshCandidate(pattern, phraseLength) {
  const n = phraseLengthOf(pattern, phraseLength);
  const measures = clone(pattern.measures.slice(0, n));
  const own = mapOverrides(pattern.harmony?.overrides, (m, c) => (m < n ? [m, c] : null));
  return withOverrides({ ...clone(pattern), measures }, own);
}

/**
 * The candidate appended as Measures after the Pattern's last (AC-10.4.1/1,
 * /2): the Pattern's own Measures and overrides untouched, the candidate's
 * overrides re-keyed to the Measures they now sit on.
 */
export function appendVariation(pattern, candidate) {
  const offset = pattern.measures.length;
  const joined = append(pattern, candidate);
  const moved = mapOverrides(candidate.harmony?.overrides, (m, c) => [m + offset, c]);
  if (!moved) return joined;
  return withOverrides(joined, { ...(joined.harmony?.overrides ?? {}), ...moved });
}

/* --- positions ------------------------------------------------------------ */

const slotToken = (m, b, s) => `${m}.${b}.${s}`;
const beatToken = (m, b) => `${m}.${b}`;
const parse = (token) => token.split('.').map(Number);

/** Every Slot of the candidate in phrase order — Measure, Beat, Slot — with its label. */
function slotsOf(candidate, system = 'takadimi') {
  const out = [];
  candidate.measures.forEach((measure, m) => {
    const labels = measureLabels(measure, system);
    measure.beats.forEach((beat, b) => {
      beat.slots.forEach((slot, s) => {
        out.push({
          m,
          b,
          s,
          slot,
          token: slotToken(m, b, s),
          label: `M${m + 1} B${b + 1} · ${labels[b]?.[s] ?? s + 1}`,
          first: b === 0 && s === 0,
        });
      });
    });
  });
  return out;
}

/** Every Beat of the candidate in phrase order. */
function beatsOf(candidate) {
  const out = [];
  candidate.measures.forEach((measure, m) => {
    const noteValue = beatNoteValue(measure.timeSignature);
    measure.beats.forEach((beat, b) => {
      out.push({ m, b, beat, noteValue, token: beatToken(m, b), label: `Measure ${m + 1}, Beat ${b + 1}` });
    });
  });
  return out;
}

const sounding = (candidate, system) => slotsOf(candidate, system).filter((x) => x.slot.on);
const silent = (candidate, system) => slotsOf(candidate, system).filter((x) => !x.slot.on);
const last = (list) => list[list.length - 1];
const options = (list) => list.map((x) => ({ value: x.token, label: x.label }));

/**
 * The Pitch a Slot a technique turns on takes, in a Melodic Pattern: the
 * nearest earlier sounding Slot's, else the first note's, else the tonic in
 * the base octave (AC-10.4.5's rule; AC-2.2.8). Percussive Slots carry none.
 */
function pitchFor(candidate, m, b, s) {
  if (candidate.soundMode !== 'melodic') return null;
  const all = slotsOf(candidate);
  const at = all.findIndex((x) => x.m === m && x.b === b && x.s === s);
  for (let i = at - 1; i >= 0; i--) if (all[i].slot.on && all[i].slot.pitch) return clone(all[i].slot.pitch);
  const first = all.find((x) => x.slot.on && x.slot.pitch);
  if (first) return clone(first.slot.pitch);
  return { degree: '1', octaveOffset: 0 };
}

/** A Slot turned on at its computed default accent, with a Pitch by the rule above. */
function turnOn(candidate, m, b, s) {
  const slot = candidate.measures[m].beats[b].slots[s];
  const pitch = pitchFor(candidate, m, b, s);
  slot.on = true;
  delete slot.accent;
  if (pitch) slot.pitch = pitch;
  else delete slot.pitch;
}

/** A Slot turned off, its override and Pitch discarded. */
function turnOff(slot) {
  slot.on = false;
  delete slot.accent;
  delete slot.pitch;
}

/** The Slot's accent override, kept only where it differs from the computed default. */
function setLevel(measure, b, s, level) {
  const slot = measure.beats[b].slots[s];
  if (level === defaultAccent(measure, b, s)) delete slot.accent;
  else slot.accent = level;
}

/** A Beat's Recipe replaced and its Slots remade, as the editor does (AC-1.3.6). */
function reRecipe(candidate, m, b, recipeId) {
  return setRecipe(candidate, m, b, recipeId);
}

/* --- harmony helpers ----------------------------------------------------- */

const underFill = (p) => p.soundMode === 'melodic' && hasHarmony(p) && Boolean(p.harmony.arpeggio);
const melodic = (p) => p.soundMode === 'melodic';
const hasNote = (p) => p.measures.some((m) => m.beats.some((b) => b.slots.some((s) => s.on && s.pitch)));

const NO_PROGRESSION = 'Needs a progression';
const NO_MELODY = 'Needs a melody';

/** The chord as the candidate's first Measure plays it — what a chord technique acts on. */
const chordNow = (candidate, index) => chordInMeasure(candidate, 0, index);

function chordOptions(candidate) {
  return candidate.harmony.chords.map((chord, i) => ({
    value: String(i),
    label: `${i + 1}. ${safeName(chordNow(candidate, i), candidate.key)}`,
  }));
}

function safeName(chord, key) {
  try {
    return chordName(chord, key);
  } catch {
    return `${chord.degree} ${chord.quality}`;
  }
}

/** The chosen chord's override written into every Measure of the candidate (AC-10.4.5/16). */
function overrideAll(candidate, chordIndex, fields) {
  let next = candidate;
  for (let m = 0; m < candidate.measures.length; m++) next = setChordOverride(next, m, chordIndex, fields);
  return next;
}

const qualityOf = (id) => QUALITIES.find((q) => q.id === id);

/** The qualities whose members include every member of `current` — its extensions — in catalogue order. */
function extensionsOf(currentId) {
  const base = qualityOf(currentId).intervals;
  return QUALITIES.filter((q) => q.id !== currentId && base.every((i) => q.intervals.includes(i)));
}

/** The seventh of the chord's family on a triad: the first extension that adds a 7th and nothing else. */
function defaultExtension(currentId) {
  const ext = extensionsOf(currentId);
  const base = qualityOf(currentId).intervals;
  const seventh = ext.find((q) => q.intervals.length === base.length + 1 && q.intervals.some((i) => i === 10 || i === 11));
  return seventh ?? ext[0] ?? QUALITIES.find((q) => q.id !== currentId);
}

/* --- the catalogue (AC-10.4.5) -------------------------------------------- */

/**
 * @typedef {object} Technique
 * @property {string} id
 * @property {string} label
 * @property {string} group        one of GROUPS
 * @property {string} describe     one line, what it does to the candidate
 * @property {(c: object, ctx: object) => string|null} reason   why it cannot apply, or null
 * @property {(c: object, ctx: object, choice: object) => Array<{key: string, label: string, options: Array<{value: string, label: string}>, default: string}>} fields
 *   the choices, in order; a later field may depend on an earlier one's value in `choice`
 * @property {(c: object, choice: object, ctx: object) => object} apply
 */

/** @type {Technique[]} */
export const TECHNIQUES = [
  // ---- Rhythm ----
  {
    id: 'add-syllable',
    label: 'Add a syllable',
    group: 'Rhythm',
    describe: 'A silent Slot sounds — by default the last silent one of the last Beat that has one.',
    reason: (c) => (silent(c).length ? null : 'Every Slot already sounds'),
    fields: (c, ctx) => {
      const list = silent(c, ctx.system);
      // The last Beat that has a silent Slot, its last silent Slot (AC-10.4.5/1).
      return [{ key: 'slot', label: 'Slot', options: options(list), default: last(list).token }];
    },
    apply: (c, choice) => {
      const next = clone(c);
      const [m, b, s] = parse(choice.slot);
      turnOn(next, m, b, s);
      return next;
    },
  },
  {
    id: 'remove-syllable',
    label: 'Remove a syllable',
    group: 'Rhythm',
    describe: 'A sounding Slot falls silent — by default the last one that is not a downbeat.',
    reason: (c) => (sounding(c).length ? null : 'Nothing sounds'),
    fields: (c, ctx) => {
      const list = sounding(c, ctx.system);
      const notFirst = list.filter((x) => !x.first);
      return [{ key: 'slot', label: 'Slot', options: options(list), default: (last(notFirst) ?? last(list)).token }];
    },
    apply: (c, choice) => {
      const next = clone(c);
      const [m, b, s] = parse(choice.slot);
      turnOff(next.measures[m].beats[b].slots[s]);
      return next;
    },
  },
  {
    id: 'move-syllable',
    label: 'Move a syllable',
    group: 'Rhythm',
    describe: 'A sounding Slot moves to a silent one, its accent and note with it — by default the last one, one Slot earlier.',
    reason: (c) => (!sounding(c).length ? 'Nothing sounds' : !silent(c).length ? 'Nothing is silent' : null),
    fields: (c, ctx, choice) => {
      const all = slotsOf(c, ctx.system);
      const from = all.filter((x) => x.slot.on);
      const to = all.filter((x) => !x.slot.on);
      const chosen = choice?.from ? all.find((x) => x.token === choice.from) : last(from);
      const at = all.indexOf(chosen);
      // One Slot earlier when silent, else one later when silent, else the nearest silent Slot (AC-10.4.5/3).
      let target = at > 0 && !all[at - 1].slot.on ? all[at - 1] : at < all.length - 1 && !all[at + 1].slot.on ? all[at + 1] : null;
      if (!target) target = to.reduce((best, x) => (best === null || Math.abs(all.indexOf(x) - at) < Math.abs(all.indexOf(best) - at) ? x : best), null);
      return [
        { key: 'from', label: 'Move', options: options(from), default: last(from).token },
        { key: 'to', label: 'To', options: options(to), default: target.token },
      ];
    },
    apply: (c, choice) => {
      const next = clone(c);
      const [fm, fb, fs] = parse(choice.from);
      const [tm, tb, ts] = parse(choice.to);
      const from = next.measures[fm].beats[fb].slots[fs];
      const to = next.measures[tm].beats[tb].slots[ts];
      to.on = true;
      if (from.accent !== undefined) to.accent = from.accent;
      else delete to.accent;
      if (from.pitch) to.pitch = clone(from.pitch);
      else delete to.pitch;
      turnOff(from);
      return next;
    },
  },
  {
    id: 'triplet',
    label: 'Two 8ths to a triplet',
    group: 'Rhythm',
    describe: 'A Beat of straight 8ths becomes a triplet, its two notes on the first and third — by default the last such Beat.',
    reason: (c) => (beatsOf(c).some(tripletable) ? null : 'No quarter-note Beat is on Straight 8ths'),
    fields: (c) => {
      const list = beatsOf(c).filter(tripletable);
      return [{ key: 'beat', label: 'Beat', options: options(list), default: last(list).token }];
    },
    apply: (c, choice) => {
      const [m, b] = parse(choice.beat);
      const was = c.measures[m].beats[b].slots;
      const next = reRecipe(c, m, b, 'triplet-8ths');
      const slots = next.measures[m].beats[b].slots;
      slots[0] = clone(was[0]);
      slots[2] = clone(was[1]);
      return next;
    },
  },
  {
    id: 'sixteenth-fill',
    label: 'Sixteenth fill',
    group: 'Rhythm',
    describe: 'A Beat fills with 16ths, every Slot sounding — by default the last Beat.',
    reason: (c) => (beatsOf(c).some(fillable) ? null : 'Every Beat is already a full 16th fill'),
    fields: (c) => {
      const list = beatsOf(c).filter(fillable);
      return [{ key: 'beat', label: 'Beat', options: options(list), default: last(list).token }];
    },
    apply: (c, choice) => {
      const [m, b] = parse(choice.beat);
      const next = reRecipe(c, m, b, 'straight-16ths');
      const n = next.measures[m].beats[b].slots.length;
      for (let s = 0; s < n; s++) turnOn(next, m, b, s);
      return next;
    },
  },
  {
    id: 'breathe',
    label: 'Breathe',
    group: 'Rhythm',
    describe: 'A Beat falls silent — by default the last.',
    reason: (c) => (beatsOf(c).some((x) => x.beat.slots.some((s) => s.on)) ? null : 'No Beat sounds'),
    fields: (c) => {
      const list = beatsOf(c).filter((x) => x.beat.slots.some((s) => s.on));
      return [{ key: 'beat', label: 'Beat', options: options(list), default: last(list).token }];
    },
    apply: (c, choice) => {
      const next = clone(c);
      const [m, b] = parse(choice.beat);
      for (const slot of next.measures[m].beats[b].slots) turnOff(slot);
      return next;
    },
  },
  {
    id: 'halve-beat',
    label: 'Halve the Beat',
    group: 'Rhythm',
    describe: 'A Beat of 16ths thins to 8ths, keeping every other Slot — by default the last such Beat.',
    reason: (c) => (beatsOf(c).some(halvable) ? null : 'No Beat is on Straight 16ths'),
    fields: (c) => {
      const list = beatsOf(c).filter(halvable);
      return [{ key: 'beat', label: 'Beat', options: options(list), default: last(list).token }];
    },
    apply: (c, choice) => {
      const [m, b] = parse(choice.beat);
      const { noteValue } = beatsOf(c).find((x) => x.m === m && x.b === b);
      const was = c.measures[m].beats[b].slots;
      const next = reRecipe(c, m, b, noteValue === 'quarter' ? 'straight-8ths' : 'undivided');
      const slots = next.measures[m].beats[b].slots;
      for (let s = 0; s < slots.length; s++) slots[s] = clone(was[2 * s]);
      return next;
    },
  },
  {
    id: 'rotate',
    label: 'Rotate',
    group: 'Rhythm',
    describe: 'Every Slot moves k Slots later in its Measure, the last wrapping to the first — the downbeat moves.',
    reason: (c) =>
      c.measures.some((m) => {
        const flat = m.beats.flatMap((b) => b.slots);
        return flat.some((s) => s.on) && flat.some((s) => !s.on);
      })
        ? null
        : 'No Measure has both a sounding and a silent Slot',
    fields: (c) => {
      const most = Math.max(...c.measures.map((m) => m.beats.reduce((n, b) => n + b.slots.length, 0)));
      const list = Array.from({ length: most - 1 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} Slot${i ? 's' : ''} later` }));
      return [{ key: 'k', label: 'By', options: list, default: '1' }];
    },
    apply: (c, choice) => {
      const next = clone(c);
      const k = Number(choice.k);
      for (const measure of next.measures) {
        const places = measure.beats.flatMap((beat, b) => beat.slots.map((_, s) => [b, s]));
        const n = places.length;
        const was = places.map(([b, s]) => clone(measure.beats[b].slots[s]));
        places.forEach(([b, s], i) => {
          measure.beats[b].slots[s] = was[(((i - k) % n) + n) % n];
        });
      }
      return next;
    },
  },
  // ---- Dynamics ----
  {
    id: 'lift',
    label: 'Lift',
    group: 'Dynamics',
    describe: 'Every sounding Slot one Accent Level louder; Strong stays Strong.',
    reason: (c) => (levels(c).some((x) => x.level < STRONG) ? null : 'Every sounding Slot is Strong'),
    fields: () => [],
    apply: (c) => {
      const next = clone(c);
      for (const x of levels(next)) if (x.level < STRONG) setLevel(next.measures[x.m], x.b, x.s, x.level + 1);
      return next;
    },
  },
  {
    id: 'soften',
    label: 'Soften',
    group: 'Dynamics',
    describe: 'Every sounding Slot one Accent Level quieter; Weak stays Weak and nothing turns off.',
    reason: (c) => (levels(c).some((x) => x.level > WEAK) ? null : 'Every sounding Slot is Weak'),
    fields: () => [],
    apply: (c) => {
      const next = clone(c);
      for (const x of levels(next)) if (x.level > WEAK) setLevel(next.measures[x.m], x.b, x.s, x.level - 1);
      return next;
    },
  },
  {
    id: 'shift-accent',
    label: 'Shift the accent',
    group: 'Dynamics',
    describe: 'The chosen Beat takes the Strong accent and Beat 1 goes Weak, in every Measure — by default Beat 2.',
    reason: (c) => {
      if (c.measures.every((m) => m.beats.length === 1)) return 'Every Measure has one Beat';
      const any = c.measures.some((m) => m.beats.some((beat) => beat.slots[0]?.on));
      return any ? null : 'No Measure has a sounding first Slot on Beat 1 or the chosen Beat';
    },
    fields: (c) => {
      const most = Math.max(...c.measures.map((m) => m.beats.length));
      const list = Array.from({ length: most - 1 }, (_, i) => ({ value: String(i + 1), label: `Beat ${i + 2}` }));
      return [{ key: 'beat', label: 'Beat', options: list, default: '1' }];
    },
    apply: (c, choice) => {
      const next = clone(c);
      const b = Number(choice.beat);
      for (const measure of next.measures) {
        if (measure.beats[0]?.slots[0]?.on) setLevel(measure, 0, 0, WEAK);
        if (measure.beats[b]?.slots[0]?.on) setLevel(measure, b, 0, STRONG);
      }
      return next;
    },
  },
  // ---- Chord ----
  {
    id: 'invert-chord',
    label: 'Invert a chord',
    group: 'Chord',
    describe: 'One chord takes another member as its bass in the variation — by default the next member up.',
    reason: (c) => (hasHarmony(c) ? null : NO_PROGRESSION),
    fields: (c, ctx, choice) => {
      const chords = chordOptions(c);
      const index = Number(choice?.chord ?? chords.length - 1);
      const chord = chordNow(c, index);
      const current = inversionOf(chord);
      const stack = chordStack({ ...chord, inversion: 0 });
      const members = stack
        .map((member, k) => ({ value: String(k), label: `${memberLabel(member.interval)} in the bass` }))
        .filter((o) => Number(o.value) !== current);
      return [
        { key: 'chord', label: 'Chord', options: chords, default: last(chords).value },
        { key: 'bass', label: 'Bass', options: members, default: String((current + 1) % memberCount(chord)) },
      ];
    },
    apply: (c, choice) => overrideAll(c, Number(choice.chord), { inversion: Number(choice.bass) }),
  },
  {
    id: 'change-quality',
    label: "Change a chord's quality",
    group: 'Chord',
    describe: 'One chord takes another quality in the variation — Em to Em7 — its bass and struck members kept.',
    reason: (c) => (hasHarmony(c) ? null : NO_PROGRESSION),
    fields: (c, ctx, choice) => {
      const chords = chordOptions(c);
      const index = Number(choice?.chord ?? chords.length - 1);
      const chord = chordNow(c, index);
      const ext = extensionsOf(chord.quality);
      const rest = QUALITIES.filter((q) => q.id !== chord.quality && !ext.includes(q));
      const label = (q) => `${q.label}${ext.includes(q) ? '' : ' ·'}`;
      return [
        { key: 'chord', label: 'Chord', options: chords, default: last(chords).value },
        {
          key: 'quality',
          label: 'Quality',
          options: [...ext, ...rest].map((q) => ({ value: q.id, label: label(q) })),
          default: defaultExtension(chord.quality).id,
        },
      ];
    },
    apply: (c, choice) => {
      const index = Number(choice.chord);
      const chord = chordNow(c, index);
      // The bass member and the still-valid struck members are kept (AC-10.4.5/13).
      const bass = chordStack(chord)[0].tone;
      const roles = qualityOf(choice.quality).intervals.map(roleOfInterval);
      const kept = omitOf(chord).filter((t) => roles.includes(t));
      const omit = kept.length && roles.length - kept.length >= MIN_MEMBERS ? kept : [];
      const remaining = roles.filter((t) => !omit.includes(t));
      const k = Math.max(0, remaining.indexOf(bass));
      return overrideAll(c, index, { quality: choice.quality, inversion: k, omit });
    },
  },
  {
    id: 'change-fill',
    label: "Change a chord's fill",
    group: 'Chord',
    describe: 'One chord deals another fill in the variation — by default the next in the catalogue.',
    reason: (c) => (!hasHarmony(c) ? NO_PROGRESSION : !c.harmony.arpeggio ? 'Needs an Arpeggio; the notes are as stamped' : null),
    fields: (c, ctx, choice) => {
      const chords = chordOptions(c);
      const index = Number(choice?.chord ?? chords.length - 1);
      const current = fillOf(c, index, 0);
      const at = ARPEGGIOS.findIndex((a) => a.id === current);
      const fills = ARPEGGIOS.filter((a) => a.id !== current).map((a) => ({ value: a.id, label: `${a.label} (${a.group})` }));
      return [
        { key: 'chord', label: 'Chord', options: chords, default: last(chords).value },
        { key: 'fill', label: 'Fill', options: fills, default: ARPEGGIOS[(at + 1) % ARPEGGIOS.length].id },
      ];
    },
    apply: (c, choice) => overrideAll(c, Number(choice.chord), { fill: choice.fill }),
  },
  {
    id: 'omit-member',
    label: 'Leave out a member',
    group: 'Chord',
    describe: 'One chord sounds without a member in the variation — by default its 5th.',
    reason: (c) => {
      if (!hasHarmony(c)) return NO_PROGRESSION;
      const any = c.harmony.chords.some((_, i) => omitOptions(chordNow(c, i)).some((o) => !o.omitted && !o.disabled));
      return any ? null : 'No chord has a member that can be struck';
    },
    fields: (c, ctx, choice) => {
      const chords = chordOptions(c).filter((o) => omitOptions(chordNow(c, Number(o.value))).some((x) => !x.omitted && !x.disabled));
      const index = Number(choice?.chord ?? last(chords).value);
      const members = omitOptions(chordNow(c, index))
        .filter((o) => !o.omitted && !o.disabled)
        .map((o) => ({ value: String(o.tone), label: `Without the ${o.label}` }));
      return [
        { key: 'chord', label: 'Chord', options: chords, default: last(chords).value },
        { key: 'member', label: 'Member', options: members, default: members.find((o) => o.value === '5')?.value ?? members[0].value },
      ];
    },
    apply: (c, choice) => {
      const index = Number(choice.chord);
      const chord = chordNow(c, index);
      const tone = Number(choice.member);
      const omit = [...new Set([...omitOf(chord), tone])].sort((a, b) => a - b);
      // The bass stays on its member while the member remains (AC-2.16.1/5).
      const bass = chordStack(chord)[0].tone;
      const roles = qualityOf(chord.quality).intervals.map(roleOfInterval).filter((t) => !omit.includes(t));
      const k = Math.max(0, roles.indexOf(bass));
      return overrideAll(c, index, { omit, inversion: k });
    },
  },
  // ---- Pitch ----
  {
    id: 'octave-up',
    label: 'Octave up',
    group: 'Pitch',
    describe: 'Every note an octave higher; chord tones keep their roles.',
    reason: (c) => pitchReason(c, (o) => octaveNumber(o) >= MAX_OCTAVE, 'A note is already in octave 7'),
    fields: () => [],
    apply: (c) => shiftOctaves(c, 1),
  },
  {
    id: 'octave-down',
    label: 'Octave down',
    group: 'Pitch',
    describe: 'Every note an octave lower; chord tones keep their roles.',
    reason: (c) => pitchReason(c, (o) => octaveNumber(o) <= MIN_OCTAVE, 'A note is already in octave 1'),
    fields: () => [],
    apply: (c) => shiftOctaves(c, -1),
  },
];

const tripletable = (x) => x.noteValue === 'quarter' && x.beat.recipe === 'straight-8ths';
const fillable = (x) => !(x.beat.recipe === 'straight-16ths' && x.beat.slots.every((s) => s.on));
const halvable = (x) => x.beat.recipe === 'straight-16ths';

/** Every sounding Slot with the Accent Level it sounds at. */
function levels(c) {
  const out = [];
  c.measures.forEach((measure, m) =>
    measure.beats.forEach((beat, b) =>
      beat.slots.forEach((slot, s) => {
        if (slot.on) out.push({ m, b, s, level: effectiveAccent(measure, b, s) });
      })
    )
  );
  return out;
}

function pitchReason(c, atBound, bound) {
  if (!melodic(c)) return NO_MELODY;
  if (underFill(c)) return `The ${ARPEGGIOS.find((a) => a.id === c.harmony.arpeggio)?.label ?? 'fill'} fill deals the notes`;
  if (!hasNote(c)) return NO_MELODY;
  const notes = c.measures.flatMap((m) => m.beats.flatMap((b) => b.slots.filter((s) => s.on && s.pitch)));
  return notes.some((s) => atBound(s.pitch.octaveOffset ?? 0)) ? bound : null;
}

function shiftOctaves(c, by) {
  const next = clone(c);
  for (const measure of next.measures)
    for (const beat of measure.beats)
      for (const slot of beat.slots) {
        if (slot.on && slot.pitch) slot.pitch.octaveOffset = (slot.pitch.octaveOffset ?? 0) + by;
      }
  return next;
}

/* --- choices, stacks and candidates --------------------------------------- */

export function techniqueById(id) {
  const t = TECHNIQUES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown technique: ${id}`);
  return t;
}

/** The context every rule reads: the counting system the labels use. */
const withDefaults = (ctx) => ({ system: 'takadimi', ...(ctx ?? {}) });

/**
 * The technique's fields on this candidate given the choice so far — each with
 * its options and default — resolved in order, so a later field sees the
 * earlier values (AC-10.4.3/2).
 */
export function fieldsFor(technique, candidate, choice = {}, ctx = {}) {
  const t = typeof technique === 'string' ? techniqueById(technique) : technique;
  return t.fields(candidate, withDefaults(ctx), choice);
}

/** The technique's default choice on this candidate: each field's default, in order (AC-10.4.3/2). */
export function defaultChoice(technique, candidate, ctx = {}) {
  const t = typeof technique === 'string' ? techniqueById(technique) : technique;
  const choice = {};
  for (;;) {
    const fields = t.fields(candidate, withDefaults(ctx), choice);
    const open = fields.find((f) => choice[f.key] === undefined);
    if (!open) return choice;
    choice[open.key] = open.default ?? open.options[0]?.value;
  }
}

/**
 * The choice, every field settled: a value no longer offered falls back to the
 * field's default, and a field the choice lacks takes its default. Null when a
 * field has nothing to offer.
 */
export function settleChoice(technique, candidate, choice = {}, ctx = {}) {
  const t = typeof technique === 'string' ? techniqueById(technique) : technique;
  const settled = {};
  for (;;) {
    const fields = t.fields(candidate, withDefaults(ctx), settled);
    const open = fields.find((f) => settled[f.key] === undefined);
    if (!open) return settled;
    if (!open.options.length) return null;
    const wanted = choice[open.key];
    settled[open.key] = open.options.some((o) => o.value === wanted) ? wanted : (open.default ?? open.options[0].value);
  }
}

/** Whether `choice` names, for every field, a value the technique offers on this candidate. */
export function choiceOffered(technique, candidate, choice, ctx = {}) {
  const t = typeof technique === 'string' ? techniqueById(technique) : technique;
  const partial = {};
  for (;;) {
    const fields = t.fields(candidate, withDefaults(ctx), partial);
    const open = fields.find((f) => partial[f.key] === undefined);
    if (!open) return true;
    if (!open.options.some((o) => o.value === choice?.[open.key])) return false;
    partial[open.key] = choice[open.key];
  }
}

/**
 * The candidate the stack builds from the original (AC-10.4.3/1): each entry
 * applied to the candidate as the earlier ones left it. An entry whose rule no
 * longer applies, or whose choice is no longer offered, is dropped and
 * reported (AC-10.4.3/3). The same stack on the same original gives the same
 * Measures (AC-10.4.3/5).
 *
 * @param {object} pattern
 * @param {number} phraseLength
 * @param {Array<{id: string, choice: object}>} stack
 * @returns {{candidate: object, stack: Array<{id: string, choice: object}>, dropped: Array<{index: number, id: string, reason: string}>, stages: object[]}}
 *   `stages[i]` is the candidate each kept entry was applied to — what its choices are offered on
 */
export function buildCandidate(pattern, phraseLength, stack, ctx = {}) {
  const context = withDefaults(ctx);
  let candidate = freshCandidate(pattern, phraseLength);
  const kept = [];
  const dropped = [];
  const stages = [];
  stack.forEach((entry, index) => {
    const t = techniqueById(entry.id);
    const reason = t.reason(candidate, context);
    if (reason) {
      dropped.push({ index, id: entry.id, reason });
      return;
    }
    if (!choiceOffered(t, candidate, entry.choice, context)) {
      dropped.push({ index, id: entry.id, reason: 'Its choice is no longer offered' });
      return;
    }
    stages.push(candidate);
    candidate = t.apply(candidate, entry.choice, context);
    kept.push({ id: entry.id, choice: { ...entry.choice } });
  });
  return { candidate, stack: kept, dropped, stages };
}

/** Every technique with whether it applies to this candidate, and why not (AC-10.4.3/6). */
export function availability(candidate, ctx = {}) {
  const context = withDefaults(ctx);
  return TECHNIQUES.map((t) => ({ id: t.id, label: t.label, group: t.group, describe: t.describe, reason: t.reason(candidate, context) }));
}

/** The one-line reason a whole group gives when every technique in it is out (AC-10.4.3/6). */
export function groupReason(group, candidate) {
  if (group === 'Chord' && !hasHarmony(candidate)) return NO_PROGRESSION;
  if (group === 'Pitch' && !melodic(candidate)) return NO_MELODY;
  return null;
}

/**
 * Roll the dice (AC-10.4.6): one to three techniques drawn from the groups not
 * marked No dice, each available on the candidate as the earlier draws left
 * it, each choice drawn from the options its rule offers. `random()` is the
 * caller's, in [0, 1) — never drawn here (AC-10.4.6/6).
 *
 * @returns {Array<{id: string, choice: object}>} the stack, possibly shorter than drawn when nothing more is available
 */
export function rollStack(pattern, phraseLength, { noDice = new Set(), random, ctx = {} } = {}) {
  if (typeof random !== 'function') throw new Error('rollStack needs a random() source');
  const context = withDefaults(ctx);
  const count = 1 + Math.floor(random() * 3);
  let candidate = freshCandidate(pattern, phraseLength);
  const stack = [];
  for (let i = 0; i < count; i++) {
    const open = TECHNIQUES.filter((t) => !noDice.has(t.group) && !t.reason(candidate, context));
    if (!open.length) break;
    const t = open[Math.floor(random() * open.length)];
    const choice = {};
    for (;;) {
      const fields = t.fields(candidate, context, choice);
      const field = fields.find((f) => choice[f.key] === undefined);
      if (!field) break;
      if (!field.options.length) break;
      choice[field.key] = field.options[Math.floor(random() * field.options.length)].value;
    }
    candidate = t.apply(candidate, choice, context);
    stack.push({ id: t.id, choice });
  }
  return stack;
}

/** Whether any technique outside the No dice groups applies (AC-10.4.6/4). */
export function canRoll(pattern, phraseLength, noDice = new Set(), ctx = {}) {
  const candidate = freshCandidate(pattern, phraseLength);
  const context = withDefaults(ctx);
  return TECHNIQUES.some((t) => !noDice.has(t.group) && !t.reason(candidate, context));
}


