/*
 * US-10.4 — Vary a loop. The pure half: the technique catalogue (AC-10.4.5),
 * the stack and its choices (AC-10.4.3), the original and what Accept appends
 * (AC-10.4.1, AC-10.4.2/1), and the roll's rules (AC-10.4.6/1, /2, /6). The
 * dialog, the audition and the Pattern content it writes are proved in
 * tests/e2e/variations.spec.js and tests/unit/core/chord-override.test.js.
 */
import { describe, it, expect } from 'vitest';
import { create, cycleAccent, addMeasure, setRecipe, setPitch, setTimeSignatureAll } from '../../../src/core/pattern.js';
import {
  setProgression as chooseProgression,
  setVoicing,
  setArpeggio,
  setChordOmit,
  setChordBass,
  chordInMeasure,
  chordName,
  overrideFor,
  arpeggioDeal,
  soundingPitch,
} from '../../../src/core/harmony.js';
import { effectiveAccent, WEAK, MEDIUM, STRONG } from '../../../src/core/accents.js';
import { QUALITIES } from '../../../src/core/harmony.js';
import {
  TECHNIQUES,
  GROUPS,
  techniqueById,
  freshCandidate,
  appendVariation,
  phraseLengthOf,
  canAddVariation,
  fieldsFor,
  defaultChoice,
  buildCandidate,
  availability,
  groupReason,
  rollStack,
  canRoll,
} from '../../../src/core/variations.js';

const setProgression = (p, id) => setVoicing(chooseProgression(p, id), 'root');

/** A Melodic Pattern in C Ionian, one Measure of 4/4 at Straight 16ths, Beat 1–4 downbeats sounding. */
function melodic() {
  let p = { ...create(), soundMode: 'melodic', key: 'C', scale: 'ionian', tempo: 120 };
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
  return p;
}
/** The same with a note on every sounding Slot: 1, 3, 5, 1 in the base octave. */
function stamped() {
  let p = melodic();
  ['1', '3', '5', '1'].forEach((degree, b) => {
    p = setPitch(p, 0, b, 0, { degree, octaveOffset: 0 });
  });
  return p;
}
/** Em–C–G–D changing every pass, Ascending, over a one-Measure melody. */
function chords({ arpeggio = 'up' } = {}) {
  let p = setProgression({ ...melodic(), key: 'G' }, 'vi-IV-I-V');
  if (arpeggio) p = setArpeggio(p, arpeggio);
  return p;
}
/** A Percussive one-Measure Pattern, downbeats sounding. */
function percussive() {
  let p = create();
  for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
  return p;
}
/** Beat `b` of Measure 0 on Straight 8ths with the given Slots on. */
function eighths(p, b, on = [0]) {
  let next = setRecipe(p, 0, b, 'straight-8ths');
  for (const s of on) next = cycleAccent(next, 0, b, s);
  return next;
}

const on = (c, m = 0) => c.measures[m].beats.map((b) => b.slots.map((s) => (s.on ? 1 : 0)).join('')).join(' ');
const apply = (p, id, choice, n = 1) => {
  const c = freshCandidate(p, n);
  return { c, out: techniqueById(id).apply(c, choice ?? defaultChoice(id, c), { system: 'takadimi' }) };
};
const reason = (p, id) => techniqueById(id).reason(freshCandidate(p, 1), { system: 'takadimi' });
const dealt = (p, pass = 0) => {
  const deal = arpeggioDeal(p, pass);
  const out = [];
  p.measures.forEach((m, mi) =>
    m.beats.forEach((b, bi) =>
      b.slots.forEach((s, si) => {
        if (s.on) out.push(soundingPitch(s, deal, mi, bi, si).step.tone);
      })
    )
  );
  return out;
};

describe('US-10.4 — Vary a loop: the original and what Accept appends', () => {
  it('AC-10.4.1/1 — The appended Measures are as many as the original, and every Time Signature, Recipe, Accent Level, Pitch and chord in them is the original’s except where a technique’s rule says otherwise', () => {
    let p = addMeasure(setTimeSignatureAll(stamped(), '3/4'));
    p = cycleAccent(p, 1, 1, 2);
    const { c, out } = apply(p, 'add-syllable', { slot: '1.2.3' }, 2);
    const joined = appendVariation(p, out);
    expect(joined.measures).toHaveLength(4);
    expect(joined.measures[2]).toEqual(p.measures[0]);
    const copy = structuredClone(p.measures[1]);
    expect(joined.measures[3].beats[2].slots[3].on).toBe(true);
    copy.beats[2].slots[3] = joined.measures[3].beats[2].slots[3];
    expect(joined.measures[3]).toEqual(copy);
    expect(c.measures).toEqual(p.measures);
  });

  it('AC-10.4.1/2 — The Measures the Pattern already held are unchanged, however many variations it already has', () => {
    let p = chords();
    for (const id of ['breathe', 'invert-chord', 'lift']) {
      const before = structuredClone(p);
      p = appendVariation(p, apply(p, id).out);
      expect(p.measures.slice(0, before.measures.length)).toEqual(before.measures);
      expect(Object.keys(p.harmony.overrides ?? {}).map(Number).every((m) => m >= before.measures.length || before.harmony.overrides?.[m])).toBe(true);
    }
    expect(p.measures).toHaveLength(4);
  });

  it('AC-10.4.1/3 — Every variation is built from the original, never from the latest copy: three accepted candidates on a one-Measure Pattern give four Measures, each of Measures 2, 3 and 4 differing from Measure 1 only by its own techniques', () => {
    let p = melodic();
    p = appendVariation(p, apply(p, 'remove-syllable', { slot: '0.3.0' }).out);
    p = appendVariation(p, apply(p, 'add-syllable', { slot: '0.1.2' }).out);
    p = appendVariation(p, apply(p, 'breathe', { beat: '0.2' }).out);
    expect(p.measures).toHaveLength(4);
    expect(on(p, 0)).toBe('1000 1000 1000 1000');
    expect(on(p, 1)).toBe('1000 1000 1000 0000');
    // Built from Measure 1, so Beat 4 still sounds here — not from Measure 2.
    expect(on(p, 2)).toBe('1000 1010 1000 1000');
    expect(on(p, 3)).toBe('1000 1000 0000 1000');
  });

  it('AC-10.4.1/6 — Add variation is enabled only while the Pattern’s length plus the original’s length is within the 32-Measure cap, and says so when it is not: the pure rule', () => {
    let p = melodic();
    for (let i = 1; i < 31; i++) p = addMeasure(p);
    expect(canAddVariation(p, 1)).toBe(true);
    expect(canAddVariation(p, 2)).toBe(false);
    expect(canAddVariation(addMeasure(p), 1)).toBe(false);
    expect(canAddVariation(melodic(), 1)).toBe(true);
  });

  it('AC-10.4.2/1 — The original’s length is the length remembered for this Pattern, and the whole Pattern when none is remembered or the remembered length exceeds the Pattern’s; it can be set to any number of Measures from 1 to the Pattern’s length before a candidate is built, and changing it discards the candidate: the pure rule', () => {
    const p = addMeasure(addMeasure(melodic()));
    expect(phraseLengthOf(p, null)).toBe(3);
    expect(phraseLengthOf(p, 2)).toBe(2);
    expect(phraseLengthOf(p, 5)).toBe(3);
    expect(phraseLengthOf(p, 0)).toBe(3);
    expect(freshCandidate(p, 2).measures).toEqual(p.measures.slice(0, 2));
  });

  it('AC-10.4.2/4 — Removing Measures from the end past the original’s length shortens the original to the Pattern’s length, so the next candidate is built from what is left: the pure rule', () => {
    const p = addMeasure(melodic());
    expect(phraseLengthOf(p, 2)).toBe(2);
    expect(phraseLengthOf(melodic(), 2)).toBe(1);
  });
});

describe('US-10.4 — Vary a loop: a candidate stacks techniques, each with its choice offered', () => {
  it('AC-10.4.3/1 — Adding a technique applies it to the candidate as the earlier techniques left it, so a syllable added on Beat 4 after Sixteenth fill on Beat 4 chooses among that Beat’s 16th Slots', () => {
    const p = eighths(melodic(), 3, [0]);
    const first = buildCandidate(p, 1, [{ id: 'sixteenth-fill', choice: { beat: '0.3' } }]);
    expect(first.candidate.measures[0].beats[3].recipe).toBe('straight-16ths');
    // After the fill every Slot of Beat 4 sounds, so a syllable goes among the other Beats' 16ths.
    const slots = fieldsFor('add-syllable', first.candidate)[0].options.map((o) => o.value);
    expect(slots.every((t) => !t.startsWith('0.3.'))).toBe(true);
    const before = fieldsFor('add-syllable', freshCandidate(p, 1))[0].options.map((o) => o.value);
    expect(before).toContain('0.3.1');
  });

  it('AC-10.4.3/2 — Every technique carries a choice with a default, listed with the technique in the stack; changing the choice rebuilds the candidate from the original with the whole stack and is heard at once: the pure rule', () => {
    const p = chords();
    for (const t of TECHNIQUES) {
      const c = freshCandidate(p, 1);
      if (t.reason(c, { system: 'takadimi' })) continue;
      const choice = defaultChoice(t, c);
      for (const f of fieldsFor(t, c, choice)) expect(f.options.map((o) => o.value), `${t.id}.${f.key}`).toContain(choice[f.key]);
    }
    const a = buildCandidate(p, 1, [{ id: 'breathe', choice: { beat: '0.3' } }, { id: 'remove-syllable', choice: { slot: '0.0.0' } }]);
    const b = buildCandidate(p, 1, [{ id: 'breathe', choice: { beat: '0.2' } }, { id: 'remove-syllable', choice: { slot: '0.0.0' } }]);
    expect(on(a.candidate)).toBe('0000 1000 1000 0000');
    expect(on(b.candidate)).toBe('0000 1000 0000 1000');
  });

  it('AC-10.4.3/3 — A technique can be removed from the stack, and the candidate is rebuilt from the remaining ones; a later technique whose rule no longer applies after the change is dropped from the stack, saying so', () => {
    const p = eighths(melodic(), 3, [0, 1]);
    const stack = [
      { id: 'sixteenth-fill', choice: { beat: '0.3' } },
      { id: 'triplet', choice: { beat: '0.3' } },
    ];
    // With the fill first, Beat 4 is no longer on Straight 8ths: the triplet is dropped.
    const both = buildCandidate(p, 1, stack);
    expect(both.stack.map((e) => e.id)).toEqual(['sixteenth-fill']);
    expect(both.dropped).toEqual([{ index: 1, id: 'triplet', reason: 'No quarter-note Beat is on Straight 8ths' }]);
    // The fill removed, the triplet applies again.
    const one = buildCandidate(p, 1, stack.slice(1));
    expect(one.dropped).toEqual([]);
    expect(one.candidate.measures[0].beats[3].recipe).toBe('triplet-8ths');
    // A choice no longer offered is dropped too, saying so.
    const gone = buildCandidate(p, 1, [{ id: 'breathe', choice: { beat: '0.3' } }, { id: 'remove-syllable', choice: { slot: '0.3.0' } }]);
    expect(gone.dropped).toEqual([{ index: 1, id: 'remove-syllable', reason: 'Its choice is no longer offered' }]);
  });

  it('AC-10.4.3/4 — The same technique can be in the stack more than once with different choices — two syllables added, two chords inverted', () => {
    const p = chords();
    const { candidate, dropped } = buildCandidate(p, 1, [
      { id: 'add-syllable', choice: { slot: '0.0.2' } },
      { id: 'add-syllable', choice: { slot: '0.2.2' } },
      { id: 'invert-chord', choice: { chord: '0', bass: '1' } },
      { id: 'invert-chord', choice: { chord: '2', bass: '2' } },
    ]);
    expect(dropped).toEqual([]);
    expect(on(candidate)).toBe('1010 1000 1010 1000');
    expect(overrideFor(candidate, 0, 0)).toEqual({ inversion: 1 });
    expect(overrideFor(candidate, 0, 2)).toEqual({ inversion: 2 });
  });

  it('AC-10.4.3/5 — Applying the same stack with the same choices to the same original gives the same Measures every time: nothing about a technique is random', () => {
    const p = chords();
    const stack = [
      { id: 'rotate', choice: { k: '3' } },
      { id: 'change-quality', choice: { chord: '0', quality: 'm7' } },
      { id: 'lift', choice: {} },
      { id: 'move-syllable', choice: { from: '0.0.3', to: '0.1.1' } },
    ];
    const a = buildCandidate(p, 1, stack);
    const b = buildCandidate(p, 1, structuredClone(stack));
    expect(a.candidate).toEqual(b.candidate);
    expect(a.dropped).toEqual([]);
  });

  it('AC-10.4.3/6 — A technique whose rule would change nothing on the candidate as it stands, or that needs what the candidate lacks, is unavailable with its reason, and the Chord group says it needs a progression, the Pitch group that it needs a melody', () => {
    const drums = freshCandidate(percussive(), 1);
    const byId = Object.fromEntries(availability(drums).map((a) => [a.id, a.reason]));
    expect(byId['invert-chord']).toBe('Needs a progression');
    expect(byId['octave-up']).toBe('Needs a melody');
    expect(byId['add-syllable']).toBeNull();
    expect(groupReason('Chord', drums)).toBe('Needs a progression');
    expect(groupReason('Pitch', drums)).toBe('Needs a melody');
    expect(groupReason('Rhythm', drums)).toBeNull();
    // A rule that would change nothing: Lift when every sounding Slot is Strong.
    let loud = percussive();
    for (let b = 0; b < 4; b++) loud = { ...loud, measures: [{ ...loud.measures[0], beats: loud.measures[0].beats.map((beat) => ({ ...beat, slots: beat.slots.map((s) => (s.on ? { ...s, accent: STRONG } : s)) })) }] };
    expect(reason(loud, 'lift')).toBe('Every sounding Slot is Strong');
    expect(GROUPS).toEqual(['Rhythm', 'Dynamics', 'Chord', 'Pitch']);
  });
});

describe('US-10.4 — Vary a loop: the technique catalogue', () => {
  it('AC-10.4.5/1 — Add a syllable (Rhythm): the chosen silent Slot turns on; offered are the candidate’s silent Slots, the default the last silent Slot of the last Beat that has one; unavailable when every Slot sounds', () => {
    const p = stamped();
    const c = freshCandidate(p, 1);
    const [field] = fieldsFor('add-syllable', c);
    expect(field.options).toHaveLength(12);
    expect(field.default).toBe('0.3.3');
    const { out } = apply(p, 'add-syllable', { slot: '0.1.2' });
    expect(on(out)).toBe('1000 1010 1000 1000');
    // At its computed default accent, with the nearest earlier note (AC-2.2.8).
    expect(out.measures[0].beats[1].slots[2].accent).toBeUndefined();
    expect(effectiveAccent(out.measures[0], 1, 2)).toBe(MEDIUM);
    expect(out.measures[0].beats[1].slots[2].pitch).toEqual({ degree: '3', octaveOffset: 0 });
    let full = percussive();
    full.measures[0].beats.forEach((_, b) => [1, 2, 3].forEach((s) => (full = cycleAccent(full, 0, b, s))));
    expect(reason(full, 'add-syllable')).toBe('Every Slot already sounds');
    // A Percussive Slot takes no Pitch; a melody with no note takes the tonic.
    expect(apply(percussive(), 'add-syllable').out.measures[0].beats[3].slots[3].pitch).toBeUndefined();
    expect(apply(melodic(), 'add-syllable').out.measures[0].beats[3].slots[3].pitch).toEqual({ degree: '1', octaveOffset: 0 });
  });

  it('AC-10.4.5/2 — Remove a syllable (Rhythm): the chosen sounding Slot turns off, its override and Pitch discarded; offered are the candidate’s sounding Slots, the default the last sounding Slot that is not the first Slot of a Measure, or the last sounding Slot when every one is; unavailable when nothing sounds', () => {
    const p = stamped();
    p.measures[0].beats[3].slots[0].accent = STRONG;
    const [field] = fieldsFor('remove-syllable', freshCandidate(p, 1));
    expect(field.options.map((o) => o.value)).toEqual(['0.0.0', '0.1.0', '0.2.0', '0.3.0']);
    expect(field.default).toBe('0.3.0');
    const { out } = apply(p, 'remove-syllable', { slot: '0.3.0' });
    expect(on(out)).toBe('1000 1000 1000 0000');
    expect(out.measures[0].beats[3].slots[0]).toEqual({ on: false });
    const only = cycleAccent(create(), 0, 0, 0);
    expect(fieldsFor('remove-syllable', freshCandidate(only, 1))[0].default).toBe('0.0.0');
    expect(reason(create(), 'remove-syllable')).toBe('Nothing sounds');
  });

  it('AC-10.4.5/3 — Move a syllable (Rhythm): the chosen sounding Slot falls silent and the chosen silent Slot sounds in its place with its override and Pitch; offered are every sounding Slot and, for it, every silent Slot; the default moves the last sounding Slot one Slot earlier when that Slot is silent, else one Slot later; unavailable when nothing sounds or nothing is silent', () => {
    const p = stamped();
    p.measures[0].beats[3].slots[0].accent = WEAK;
    const c = freshCandidate(p, 1);
    const fields = fieldsFor('move-syllable', c);
    expect(fields.map((f) => f.key)).toEqual(['from', 'to']);
    expect(fields[0].options).toHaveLength(4);
    expect(fields[1].options).toHaveLength(12);
    expect(fields[0].default).toBe('0.3.0');
    expect(fields[1].default).toBe('0.2.3');
    const { out } = apply(p, 'move-syllable', { from: '0.3.0', to: '0.2.3' });
    expect(on(out)).toBe('1000 1000 1001 0000');
    expect(out.measures[0].beats[2].slots[3]).toEqual({ on: true, accent: WEAK, pitch: { degree: '1', octaveOffset: 0 } });
    expect(out.measures[0].beats[3].slots[0]).toEqual({ on: false });
    // The Slot before it sounding, the default goes one later.
    const packed = cycleAccent(cycleAccent(create(), 0, 0, 0), 0, 0, 1);
    expect(fieldsFor('move-syllable', freshCandidate(packed, 1))[1].default).toBe('0.0.2');
    expect(reason(create(), 'move-syllable')).toBe('Nothing sounds');
    let full = percussive();
    full.measures[0].beats.forEach((_, b) => [1, 2, 3].forEach((s) => (full = cycleAccent(full, 0, b, s))));
    expect(reason(full, 'move-syllable')).toBe('Nothing is silent');
  });

  it('AC-10.4.5/4 — Two 8ths to a triplet (Rhythm): the chosen quarter-note Beat on Straight 8ths takes the Triplet 8ths Recipe, its first Slot’s state, override and Pitch landing on the triplet’s first Slot and its second on the triplet’s third, the middle Slot silent; offered are the quarter-note Beats on Straight 8ths, the default the last; unavailable when there is none', () => {
    let p = eighths(eighths(stamped(), 1, [0, 1]), 3, [1]);
    p = setPitch(p, 0, 1, 0, { degree: '3', octaveOffset: 0 });
    p = setPitch(p, 0, 1, 1, { degree: '4', octaveOffset: 1 });
    p.measures[0].beats[1].slots[1].accent = STRONG;
    const [field] = fieldsFor('triplet', freshCandidate(p, 1));
    expect(field.options.map((o) => o.value)).toEqual(['0.1', '0.3']);
    expect(field.default).toBe('0.3');
    const { out } = apply(p, 'triplet', { beat: '0.1' });
    expect(out.measures[0].beats[1].recipe).toBe('triplet-8ths');
    expect(out.measures[0].beats[1].slots).toEqual([
      { on: true, pitch: { degree: '3', octaveOffset: 0 } },
      { on: false },
      { on: true, accent: STRONG, pitch: { degree: '4', octaveOffset: 1 } },
    ]);
    expect(reason(stamped(), 'triplet')).toBe('No quarter-note Beat is on Straight 8ths');
    expect(reason(cycleAccent(setTimeSignatureAll(create(), '6/8'), 0, 0, 0), 'triplet')).toBe('No quarter-note Beat is on Straight 8ths');
  });

  it('AC-10.4.5/5 — Sixteenth fill (Rhythm): the chosen Beat takes the Straight 16ths Recipe with every Slot sounding at its default accent, Pitches by the rule above; offered are the Beats not already on Straight 16ths with every Slot sounding, the default the last; unavailable when there is none', () => {
    const p = eighths(stamped(), 3, [0]);
    const c = freshCandidate(p, 1);
    const [field] = fieldsFor('sixteenth-fill', c);
    expect(field.options.map((o) => o.value)).toEqual(['0.0', '0.1', '0.2', '0.3']);
    expect(field.default).toBe('0.3');
    const { out } = apply(p, 'sixteenth-fill', { beat: '0.3' });
    const beat = out.measures[0].beats[3];
    expect(beat.recipe).toBe('straight-16ths');
    expect(beat.slots.map((s) => s.on)).toEqual([true, true, true, true]);
    expect(beat.slots.map((s) => s.accent)).toEqual([undefined, undefined, undefined, undefined]);
    expect(beat.slots.map((s) => s.pitch.degree)).toEqual(['5', '5', '5', '5']);
    expect(beat.slots.map((s) => effectiveAccent(out.measures[0], 3, s === beat.slots[0] ? 0 : beat.slots.indexOf(s)))).toEqual([WEAK, WEAK, MEDIUM, WEAK]);
    let full = percussive();
    full.measures[0].beats.forEach((_, b) => [1, 2, 3].forEach((s) => (full = cycleAccent(full, 0, b, s))));
    expect(reason(full, 'sixteenth-fill')).toBe('Every Beat is already a full 16th fill');
    expect(fieldsFor('sixteenth-fill', freshCandidate(out, 1))[0].options.map((o) => o.value)).toEqual(['0.0', '0.1', '0.2']);
  });

  it('AC-10.4.5/6 — Breathe (Rhythm): every Slot of the chosen Beat turns off; offered are the Beats with a sounding Slot, the default the last; unavailable when no Beat sounds', () => {
    const p = cycleAccent(stamped(), 0, 2, 2);
    const [field] = fieldsFor('breathe', freshCandidate(p, 1));
    expect(field.options.map((o) => o.value)).toEqual(['0.0', '0.1', '0.2', '0.3']);
    expect(field.default).toBe('0.3');
    const { out } = apply(p, 'breathe', { beat: '0.2' });
    expect(on(out)).toBe('1000 1000 0000 1000');
    expect(out.measures[0].beats[2].slots.every((s) => s.pitch === undefined && s.accent === undefined)).toBe(true);
    expect(reason(create(), 'breathe')).toBe('No Beat sounds');
  });

  it('AC-10.4.5/7 — Halve the Beat (Rhythm): the chosen Beat on Straight 16ths takes Straight 8ths on a quarter-note Beat, or Undivided on an eighth-note Beat, the Slots at even positions kept with their state, override and Pitch and the others dropped; offered are the Beats on Straight 16ths, the default the last; unavailable when there is none', () => {
    let p = cycleAccent(cycleAccent(stamped(), 0, 3, 1), 0, 3, 2);
    p.measures[0].beats[3].slots[2].accent = STRONG;
    p = eighths(p, 0, [0]);
    const [field] = fieldsFor('halve-beat', freshCandidate(p, 1));
    expect(field.options.map((o) => o.value)).toEqual(['0.1', '0.2', '0.3']);
    expect(field.default).toBe('0.3');
    const { out } = apply(p, 'halve-beat', { beat: '0.3' });
    expect(out.measures[0].beats[3].recipe).toBe('straight-8ths');
    expect(out.measures[0].beats[3].slots).toEqual([
      { on: true, pitch: { degree: '1', octaveOffset: 0 } },
      { on: true, accent: STRONG },
    ]);
    // An eighth-note Beat of 16ths goes Undivided.
    let six = setTimeSignatureAll(create(), '6/8');
    six = cycleAccent(setRecipe(six, 0, 5, 'straight-16ths'), 0, 5, 1);
    const halved = apply(six, 'halve-beat', { beat: '0.5' }).out;
    expect(halved.measures[0].beats[5].recipe).toBe('undivided');
    expect(halved.measures[0].beats[5].slots).toEqual([{ on: false }]);
    expect(reason(eighths(eighths(eighths(eighths(create(), 0), 1), 2), 3), 'halve-beat')).toBe('No Beat is on Straight 16ths');
  });

  it('AC-10.4.5/8 — Rotate (Rhythm): in each Measure of the candidate, every Slot’s state, override and Pitch move k Slots later in Measure order, the last Slots wrapping to the first; k is chosen from 1 to one less than the Measure’s Slot count, the default 1; unavailable when no Measure has both a sounding and a silent Slot', () => {
    const p = stamped();
    p.measures[0].beats[0].slots[0].accent = WEAK;
    const [field] = fieldsFor('rotate', freshCandidate(p, 1));
    expect(field.options).toHaveLength(15);
    expect(field.default).toBe('1');
    const one = apply(p, 'rotate', { k: '1' }).out;
    expect(on(one)).toBe('0100 0100 0100 0100');
    expect(one.measures[0].beats[0].slots[1]).toEqual({ on: true, accent: WEAK, pitch: { degree: '1', octaveOffset: 0 } });
    const wrap = apply(p, 'rotate', { k: '15' }).out;
    expect(on(wrap)).toBe('0001 0001 0001 0001');
    // The last Slot wraps to the first: Beat 4's note lands on Beat 1.
    expect(wrap.measures[0].beats[0].slots[3].pitch).toEqual({ degree: '3', octaveOffset: 0 });
    expect(reason(create(), 'rotate')).toBe('No Measure has both a sounding and a silent Slot');
  });

  it('AC-10.4.5/9 — Lift (Dynamics): every sounding Slot one Accent Level louder, Strong staying Strong; unavailable when every sounding Slot is Strong', () => {
    const p = cycleAccent(stamped(), 0, 1, 2);
    const before = [0, 1, 2, 3].map((b) => effectiveAccent(p.measures[0], b, 0));
    expect(before).toEqual([STRONG, WEAK, MEDIUM, WEAK]);
    const { out } = apply(p, 'lift');
    expect([0, 1, 2, 3].map((b) => effectiveAccent(out.measures[0], b, 0))).toEqual([STRONG, MEDIUM, STRONG, MEDIUM]);
    expect(effectiveAccent(out.measures[0], 1, 2)).toBe(STRONG);
    expect(on(out)).toBe(on(p));
    const twice = apply(out, 'lift').out;
    expect([0, 1, 2, 3].map((b) => effectiveAccent(twice.measures[0], b, 0))).toEqual([STRONG, STRONG, STRONG, STRONG]);
    expect(reason(twice, 'lift')).toBe('Every sounding Slot is Strong');
  });

  it('AC-10.4.5/10 — Soften (Dynamics): every sounding Slot one Accent Level quieter, Weak staying Weak and nothing turned off; unavailable when every sounding Slot is Weak', () => {
    const p = cycleAccent(stamped(), 0, 1, 1);
    const { out } = apply(p, 'soften');
    expect([0, 1, 2, 3].map((b) => effectiveAccent(out.measures[0], b, 0))).toEqual([MEDIUM, WEAK, WEAK, WEAK]);
    expect(effectiveAccent(out.measures[0], 1, 1)).toBe(WEAK);
    expect(on(out)).toBe(on(p));
    const again = apply(out, 'soften').out;
    expect([0, 1, 2, 3].map((b) => effectiveAccent(again.measures[0], b, 0))).toEqual([WEAK, WEAK, WEAK, WEAK]);
    expect(reason(again, 'soften')).toBe('Every sounding Slot is Weak');
  });

  it('AC-10.4.5/11 — Shift the accent (Dynamics): in each Measure, the first Slot of the chosen Beat takes Strong and the first Slot of Beat 1 takes Weak, each where it sounds; offered are the Beats after Beat 1, the default Beat 2; unavailable when every Measure has one Beat or no Measure has a sounding first Slot on Beat 1 or the chosen Beat', () => {
    const p = addMeasure(stamped());
    const [field] = fieldsFor('shift-accent', freshCandidate(p, 2));
    expect(field.options.map((o) => o.label)).toEqual(['Beat 2', 'Beat 3', 'Beat 4']);
    expect(field.default).toBe('1');
    const { out } = apply(p, 'shift-accent', { beat: '2' }, 2);
    expect([0, 1, 2, 3].map((b) => effectiveAccent(out.measures[0], b, 0))).toEqual([WEAK, WEAK, STRONG, WEAK]);
    // Measure 2 has nothing sounding on those Slots: nothing is written there.
    expect(out.measures[1]).toEqual(p.measures[1]);
    expect(reason(setTimeSignatureAll(cycleAccent(create(), 0, 0, 1), '1/4'), 'shift-accent')).toBe('Every Measure has one Beat');
    let off = create();
    off = cycleAccent(off, 0, 1, 2);
    expect(reason(off, 'shift-accent')).toBe('No Measure has a sounding first Slot on Beat 1 or the chosen Beat');
  });

  it('AC-10.4.5/12 — Invert a chord (Chord): the chosen chord takes the chosen member as its bass in the candidate’s Measures; offered are the progression’s chords and, for the chosen one, its members other than its current bass, the default the next member above the current bass; unavailable without a progression', () => {
    const p = setChordBass(chords(), 1, 1);
    const c = freshCandidate(p, 1);
    const fields = fieldsFor('invert-chord', c, { chord: '1' });
    expect(fields[0].options.map((o) => o.label)).toEqual(['1. Em', '2. C/E', '3. G', '4. D']);
    expect(fields[0].default).toBe('3');
    expect(fields[1].options.map((o) => o.value)).toEqual(['0', '2']);
    expect(fields[1].default).toBe('2');
    expect(fieldsFor('invert-chord', c)[1].default).toBe('1');
    const { out } = apply(p, 'invert-chord', { chord: '0', bass: '2' });
    expect(chordName(chordInMeasure(out, 0, 0), 'G')).toBe('Em/B');
    expect(out.harmony.chords[0].inversion).toBeUndefined();
    expect(reason(melodic(), 'invert-chord')).toBe('Needs a progression');
  });

  it('AC-10.4.5/13 — Change a chord’s quality (Chord): the chosen chord takes the chosen quality in the candidate’s Measures, its bass member and still-valid omitted members kept; offered first are the qualities whose members include every member of the current quality — the extensions — then the rest of the catalogue; the default is the first extension, the seventh of the chord’s family on a triad; unavailable without a progression', () => {
    const p = chords();
    const c = freshCandidate(p, 1);
    const fields = fieldsFor('change-quality', c, { chord: '0' });
    const ids = fields[1].options.map((o) => o.value);
    const minor = [0, 3, 7];
    const extensions = ids.filter((id) => minor.every((i) => QUALITIES.find((q) => q.id === id).intervals.includes(i)));
    expect(ids.slice(0, extensions.length)).toEqual(extensions);
    expect(extensions).toEqual(expect.arrayContaining(['m6', 'm7', 'm9', 'm11']));
    expect(ids).not.toContain('min');
    expect(fields[1].default).toBe('m7');
    expect(fieldsFor('change-quality', c, { chord: '2' })[1].default).toBe('maj7');
    const { out } = apply(p, 'change-quality', { chord: '0', quality: 'm7' });
    expect(chordName(chordInMeasure(out, 0, 0), 'G')).toBe('Em7');
    expect(out.harmony.chords[0].quality).toBe('min');
    // The bass member is kept where the new quality has it; so are the omissions it still has.
    const inverted = setChordOmit(setChordBass(chords(), 2, 2), 2, 3, true);
    const kept = apply(inverted, 'change-quality', { chord: '2', quality: 'maj7' }).out;
    const as = chordInMeasure(kept, 0, 2);
    expect(as.quality).toBe('maj7');
    expect(as.omit).toEqual([3]);
    expect(chordName(as, 'G')).toBe('Gmaj7(no3)/D');
    expect(reason(melodic(), 'change-quality')).toBe('Needs a progression');
  });

  it('AC-10.4.5/14 — Change a chord’s fill (Chord): the chosen chord deals the chosen fill in the candidate’s Measures; offered are the catalogue’s fills other than the one the chord deals now, the default the next in the catalogue after it; unavailable without a progression or while the Arpeggio is None', () => {
    const p = chords();
    const fields = fieldsFor('change-fill', freshCandidate(p, 1), { chord: '3' });
    expect(fields[1].options.map((o) => o.value)).not.toContain('up');
    expect(fields[1].default).toBe('down');
    const { out } = apply(p, 'change-fill', { chord: '3', fill: 'down' });
    const joined = appendVariation(p, out);
    expect(dealt(joined, 3)).toEqual([1, 3, 5, 1, 5, 3, 1, 5]);
    // Under one chord the deal runs on across the Measure boundary, as it always has (AC-2.6.6/2).
    expect(dealt(joined, 0)).toEqual([1, 3, 5, 1, 3, 5, 1, 3]);
    expect(reason(chords({ arpeggio: null }), 'change-fill')).toBe('Needs an Arpeggio; the notes are as stamped');
    expect(reason(melodic(), 'change-fill')).toBe('Needs a progression');
  });

  it('AC-10.4.5/15 — Leave out a member (Chord): the chosen chord sounds without the chosen member in the candidate’s Measures; offered are the chord’s members that can be struck, the default the 5th where it can be; unavailable when no chord has a member that can be struck', () => {
    const p = chords();
    const fields = fieldsFor('omit-member', freshCandidate(p, 1), { chord: '0' });
    expect(fields[1].options.map((o) => o.value)).toEqual(['3', '5']);
    expect(fields[1].default).toBe('5');
    const { out } = apply(p, 'omit-member', { chord: '0', member: '5' });
    expect(chordInMeasure(out, 0, 0).omit).toEqual([5]);
    expect(chordName(chordInMeasure(out, 0, 0), 'G')).toBe('Em(no5)');
    const joined = appendVariation(p, out);
    expect(dealt(joined, 0)).toEqual([1, 3, 5, 1, 1, 3, 1, 3]);
    // A chord already down to two members offers nothing.
    const bare = chords();
    bare.harmony.chords = bare.harmony.chords.map((c) => ({ ...c, quality: '5' }));
    expect(reason(bare, 'omit-member')).toBe('No chord has a member that can be struck');
  });

  it('AC-10.4.5/16 — A chord override is in force for the candidate’s Measures alone: when one of them plays the chosen chord, that chord’s stack, deal, name and members follow the override, and when any other Measure plays it, the chord is as the progression holds it', () => {
    const p = chords();
    const joined = appendVariation(p, apply(p, 'change-quality', { chord: '0', quality: 'm7' }).out);
    expect(chordName(chordInMeasure(joined, 0, 0), 'G')).toBe('Em');
    expect(chordName(chordInMeasure(joined, 1, 0), 'G')).toBe('Em7');
    expect(dealt(joined, 0)).toEqual([1, 3, 5, 1, 1, 3, 5, 7]);
    expect(dealt(joined, 1)).toEqual([1, 3, 5, 1, 3, 5, 1, 3]);
    expect(chordInMeasure(joined, 1, 0).quality).toBe('m7');
    expect(joined.harmony.chords[0].quality).toBe('min');
  });

  it('AC-10.4.5/17 — Octave up (Pitch): every note’s octave raised by one, chord-tone Pitches keeping their roles; unavailable without a note or when any note is already in octave 7', () => {
    let p = setPitch(chords({ arpeggio: null }), 0, 1, 0, { tone: 3, octaveOffset: -1 });
    p = setPitch(p, 0, 0, 0, { degree: '1', octaveOffset: 0 });
    const { out } = apply(p, 'octave-up');
    expect(out.measures[0].beats[0].slots[0].pitch).toEqual({ degree: '1', octaveOffset: 1 });
    expect(out.measures[0].beats[1].slots[0].pitch).toEqual({ tone: 3, octaveOffset: 0 });
    expect(reason(melodic(), 'octave-up')).toBe('Needs a melody');
    expect(reason(setPitch(melodic(), 0, 0, 0, { degree: '1', octaveOffset: 3 }), 'octave-up')).toBe('A note is already in octave 7');
  });

  it('AC-10.4.5/18 — Octave down (Pitch): every note’s octave lowered by one, likewise; unavailable without a note or when any note is already in octave 1', () => {
    const { out } = apply(stamped(), 'octave-down');
    expect(out.measures[0].beats.map((b) => b.slots[0].pitch.octaveOffset)).toEqual([-1, -1, -1, -1]);
    expect(reason(percussive(), 'octave-down')).toBe('Needs a melody');
    expect(reason(setPitch(melodic(), 0, 0, 0, { degree: '1', octaveOffset: -3 }), 'octave-down')).toBe('A note is already in octave 1');
  });

  it('AC-10.4.5/19 — Under a fill, Octave up and Octave down are unavailable, saying the fill deals the notes; every Rhythm, Dynamics and Chord technique applies and is heard under it', () => {
    const p = chords();
    expect(reason(p, 'octave-up')).toBe('The Ascending fill deals the notes');
    expect(reason(p, 'octave-down')).toBe('The Ascending fill deals the notes');
    const open = availability(freshCandidate(p, 1)).filter((a) => a.group !== 'Pitch');
    const out = open.filter((a) => a.reason).map((a) => a.id);
    // Only the triplet has nothing to act on here: no Beat is on Straight 8ths.
    expect(out).toEqual(['triplet']);
    const joined = appendVariation(p, apply(p, 'breathe', { beat: '0.3' }).out);
    expect(dealt(joined, 0)).toEqual([1, 3, 5, 1, 3, 5, 1]);
  });
});

describe('US-10.4 — Vary a loop: Roll the dice builds a candidate', () => {
  /** A deterministic source: the numbers it hands out, in order. */
  const feed = (values) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  it('AC-10.4.6/1 — The roll draws how many techniques — one, two or three — then each technique from those available on the candidate as the earlier draws left it, in a group not marked No dice, and each technique’s choice from the options its rule offers; a drawn technique that is unavailable at its turn is passed over', () => {
    const p = chords();
    // 0 → one technique; then the first available technique; then its first option.
    expect(rollStack(p, 1, { random: feed([0]) })).toEqual([{ id: 'add-syllable', choice: { slot: '0.0.1' } }]);
    // 0.99 → three techniques, each the last available; the last option each time.
    const three = rollStack(p, 1, { random: feed([0.99]) });
    expect(three).toHaveLength(3);
    for (const e of three) expect(e.id).toBe('omit-member');
    // With Chord and Pitch marked No dice, only Rhythm and Dynamics are drawn.
    const noDice = new Set(['Chord', 'Pitch']);
    const rolled = rollStack(p, 1, { noDice, random: feed([0.99, 0.5, 0.2, 0.7, 0.1, 0.3]) });
    for (const e of rolled) expect(['Rhythm', 'Dynamics']).toContain(techniqueById(e.id).group);
    // A technique unavailable at its turn is not drawn: after Breathe on every Beat, nothing in Rhythm that needs a sound comes up.
    const quiet = buildCandidate(p, 1, rolled);
    expect(quiet.dropped).toEqual([]);
  });

  it('AC-10.4.6/2 — The rolled candidate always differs from the original: every technique in it changed something, by its rule', () => {
    const p = chords();
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 50; i++) {
      const stack = rollStack(p, 1, { random });
      expect(stack.length).toBeGreaterThan(0);
      const { candidate, dropped } = buildCandidate(p, 1, stack);
      expect(dropped).toEqual([]);
      expect(candidate).not.toEqual(freshCandidate(p, 1));
    }
  });

  it('AC-10.4.6/4 — Rolling again replaces the whole candidate; the dice are disabled, saying so, when no technique is available outside the groups marked No dice: the pure rule', () => {
    expect(canRoll(chords(), 1)).toBe(true);
    expect(canRoll(chords(), 1, new Set(GROUPS))).toBe(false);
    expect(canRoll(percussive(), 1, new Set(['Rhythm', 'Dynamics']))).toBe(false);
    expect(canRoll(percussive(), 1, new Set(['Chord', 'Pitch']))).toBe(true);
  });

  it('AC-10.4.6/6 — The roll draws no random number of its own inside the musical rules: given the same draws it builds the same candidate', () => {
    const p = chords();
    const values = [0.6, 0.3, 0.8, 0.1, 0.9, 0.4, 0.2];
    const a = rollStack(p, 1, { random: feed(values) });
    const b = rollStack(p, 1, { random: feed(values) });
    expect(a).toEqual(b);
    expect(buildCandidate(p, 1, a).candidate).toEqual(buildCandidate(p, 1, b).candidate);
    expect(() => rollStack(p, 1, {})).toThrow(/random/);
  });
});
