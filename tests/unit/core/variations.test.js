/**
 * US-10.3 — Add a variation to a loop: the device catalogue, one test per
 * Case of AC-10.3.3, and the pure parts of AC-10.3.1 and AC-10.3.2.
 */
import { describe, it, expect } from 'vitest';
import {
  addVariation,
  devicesFor,
  canAddVariation,
  defaultPhraseLength,
  hasBaseChoice,
  rollable,
  pick,
  GROUPS,
} from '../../../src/core/variations.js';
import { create, cycleAccent, setPitch, setRecipe, addMeasure, setTimeSignature, validate } from '../../../src/core/pattern.js';
import { setProgression, setArpeggio, setVoicing, setChange, arpeggioDeal, soundingPitch, stepAsDegree, chordIn, ARPEGGIOS } from '../../../src/core/harmony.js';
import { effectiveAccent } from '../../../src/core/accents.js';

/* --- fixtures ------------------------------------------------------------------ */

/** A one-Measure 4/4 percussive Pattern with the given (beat, slot) positions on. */
function perc(...on) {
  let p = create('Perc');
  for (const [b, s] of on) p = cycleAccent(p, 0, b, s);
  return p;
}

/**
 * A one-Measure 4/4 melody in C Ionian: one entry per Beat, a degree token to
 * sound it on Slot 1 of that Beat, `null` to leave the Beat silent. A token
 * may carry an octave: '1@1' is the tonic an octave up.
 */
function mel(tokens, { key = 'C', scale = 'ionian' } = {}) {
  let p = { ...create('Mel'), soundMode: 'melodic', key, scale };
  tokens.forEach((t, b) => {
    if (t === null) return;
    p = cycleAccent(p, 0, b, 0);
    const [degree, octave] = String(t).split('@');
    p = setPitch(p, 0, b, 0, { degree, octaveOffset: Number(octave ?? 0) });
  });
  return p;
}

const reason = (p, id, length = p.measures.length, base = 'original', context = {}) =>
  devicesFor(p, length, base, context).find((d) => d.id === id).reason;
const vary = (p, id, length = p.measures.length, base = 'original', context = {}) => addVariation(p, id, length, base, context);
const copy = (p, id, ...rest) => {
  const next = vary(p, id, ...rest);
  return next.measures.slice(p.measures.length);
};
const slot = (measures, b, s = 0, m = 0) => measures[m].beats[b].slots[s];
const pitches = (measures) => measures.flatMap((m) => m.beats.flatMap((b) => b.slots.filter((s) => s.on).map((s) => s.pitch)));
const withChords = (p, id = 'I-IV-V') => setVoicing(setProgression(p, id), 'root');

/* --- AC-10.3.1 ------------------------------------------------------------------- */

describe('core/variations — AC-10.3.1 Add variation appends a varied copy of the base phrase', () => {
  it('AC-10.3.1/1 — The appended Measures are as many as the base phrase, and every Time Signature, Recipe, Accent Level and Pitch in them is the base phrase’s except where the device’s rule says otherwise', () => {
    let p = addMeasure(perc([0, 0], [2, 0]));
    p = cycleAccent(p, 1, 1, 0);
    p = cycleAccent(p, 1, 3, 1);
    const next = vary(p, 'breathe', 2);
    expect(next.measures).toHaveLength(4);
    expect(next.measures[2]).toEqual(p.measures[0]);
    // Measure 4 is Measure 2 with its last Beat silenced and nothing else touched.
    const expected = structuredClone(p.measures[1]);
    expected.beats[3].slots = expected.beats[3].slots.map(() => ({ on: false }));
    expect(next.measures[3]).toEqual(expected);
    expect(validate(next).ok ?? true).toBeTruthy();
  });

  it('AC-10.3.1/2 — The Measures the Pattern already held are unchanged, whichever base was varied', () => {
    let p = addMeasure(perc([0, 0]));
    p = cycleAccent(p, 1, 2, 0);
    for (const base of ['original', 'latest']) {
      const next = vary(p, 'add-note', 1, base);
      expect(next.measures.slice(0, 2)).toEqual(p.measures);
    }
  });

  it('AC-10.3.1/5 — Add variation is enabled only while the Pattern’s length plus the phrase length is within the 32-Measure cap, and says so when it is not', () => {
    let p = perc([0, 0]);
    while (p.measures.length < 16) p = addMeasure(p);
    expect(canAddVariation(p, 16)).toBe(true);
    expect(canAddVariation(p, 1)).toBe(true);
    p = addMeasure(p);
    expect(canAddVariation(p, 16)).toBe(false);
    expect(canAddVariation(p, 15)).toBe(true);
    while (p.measures.length < 32) p = addMeasure(p);
    expect(canAddVariation(p, 1)).toBe(false);
    expect(reason(p, 'breathe', 1)).toMatch(/32 Measures/);
    expect(() => vary(p, 'breathe', 1)).toThrow(/32 Measures/);
  });
});

/* --- AC-10.3.2 ------------------------------------------------------------------- */

describe('core/variations — AC-10.3.2 The base phrase', () => {
  it('AC-10.3.2/1 — The phrase length can be set to any number of Measures from 1 to the Pattern’s length; its default is the length remembered for this Pattern, and the whole Pattern when none is remembered or the remembered length is longer than the Pattern', () => {
    let p = perc([0, 0]);
    while (p.measures.length < 4) p = addMeasure(p);
    expect(defaultPhraseLength(p, 2)).toBe(2);
    expect(defaultPhraseLength(p, undefined)).toBe(4);
    expect(defaultPhraseLength(p, 8)).toBe(4);
    expect(defaultPhraseLength(p, 0)).toBe(4);
    for (const n of [1, 2, 3, 4]) expect(vary(p, 'add-note', n).measures).toHaveLength(4 + n);
    expect(() => vary(p, 'add-note', 5)).toThrow();
  });

  it('AC-10.3.2/2 — The original phrase is the Pattern’s first Measures up to the phrase length; the latest copy is its last Measures of that length; while the Pattern is no longer than the phrase there is one base and no choice is shown', () => {
    let p = addMeasure(perc([0, 0]));
    p = cycleAccent(p, 1, 0, 0);
    p = cycleAccent(p, 1, 1, 0);
    p = cycleAccent(p, 0, 2, 0);
    // Delay moves the first note after the downbeat: Beat 3's in Measure 1, Beat 2's in Measure 2.
    const fromOriginal = copy(p, 'delay', 1, 'original');
    const fromLatest = copy(p, 'delay', 1, 'latest');
    expect(fromOriginal[0].beats.map((b) => b.slots.findIndex((x) => x.on))).toEqual([0, -1, 1, -1]);
    expect(fromLatest[0].beats.map((b) => b.slots.findIndex((x) => x.on))).toEqual([0, 1, -1, -1]);
    expect(hasBaseChoice(p, 1)).toBe(true);
    expect(hasBaseChoice(p, 2)).toBe(false);
  });
});

/* --- AC-10.3.3 the device catalogue --------------------------------------------- */

describe('core/variations — AC-10.3.3 The device catalogue', () => {
  it('lists every device in the order of the criterion, under its group', () => {
    const ids = devicesFor(perc([0, 0]), 1).map((d) => d.id);
    expect(ids).toEqual([
      'fill-ending', 'anticipate', 'delay', 'add-note', 'drop-note', 'breathe', 'double-ending', 'halve-ending',
      'lift', 'soften', 'shift-accent',
      'resolve-ending', 'open-ending', 'sequence-up', 'sequence-down', 'octave-up', 'octave-down', 'fill-gaps', 'neighbour', 'chord-tone-swap', 'invert', 'retrograde',
      'change-fill',
    ]);
    expect(GROUPS).toEqual(['Rhythm', 'Dynamics', 'Pitch', 'Fill']);
  });

  it('AC-10.3.3/1 — Fill the ending: the last Beat of the phrase — the last two Beats when the phrase has two or more Measures — takes the Straight 16ths Recipe, every Slot sounding; unavailable when each of those Beats already has four or more Slots all sounding', () => {
    const one = copy(perc([0, 0]), 'fill-ending');
    expect(one[0].beats[3].recipe).toBe('straight-16ths');
    expect(one[0].beats[3].slots.every((s) => s.on && s.accent === undefined)).toBe(true);
    expect(one[0].beats[2].slots.some((s) => s.on)).toBe(false);

    const two = copy(addMeasure(perc([0, 0])), 'fill-ending', 2);
    expect(two[1].beats[2].recipe).toBe('straight-16ths');
    expect(two[1].beats[3].recipe).toBe('straight-16ths');
    expect(two[1].beats[1].slots.some((s) => s.on)).toBe(false);
    expect(two[0].beats.every((b) => b.slots.every((s) => !s.on) || b === two[0].beats[0])).toBe(true);

    // In a melody each new Slot borrows the nearest earlier note.
    const m = copy(mel(['1', null, '5', null]), 'fill-ending');
    expect(m[0].beats[3].slots.map((s) => s.pitch.degree)).toEqual(['5', '5', '5', '5']);

    let full = setRecipe(perc(), 0, 3, 'straight-16ths');
    for (let s = 0; s < 4; s++) full = cycleAccent(full, 0, 3, s);
    expect(reason(full, 'fill-ending')).toMatch(/already full/);
  });

  it('AC-10.3.3/2 — Anticipate: the phrase’s last sounding Slot moves one Slot earlier, taking its accent override and Pitch with it and falling silent where it was; unavailable when the Slot before it sounds or it is the phrase’s first Slot', () => {
    let p = mel(['1', null, '5', null]);
    p = cycleAccent(p, 0, 2, 0); // Beat 3's Medium → a Strong override
    const c = copy(p, 'anticipate');
    expect(slot(c, 2, 0).on).toBe(false);
    expect(slot(c, 1, 3)).toEqual({ on: true, accent: 3, pitch: { degree: '5', octaveOffset: 0 } });
    expect(reason(perc([0, 0]), 'anticipate')).toMatch(/first Slot/);
    expect(reason(perc([1, 3], [2, 0]), 'anticipate')).toMatch(/before the last note already sounds/);
  });

  it('AC-10.3.3/3 — Delay: in the phrase’s last Measure, the first sounding Slot after the downbeat Slot moves one Slot later the same way; unavailable when there is none, when the Slot after it sounds, or when it is the phrase’s last Slot', () => {
    const c = copy(perc([0, 0], [1, 0], [3, 0]), 'delay');
    expect(slot(c, 1, 0).on).toBe(false);
    expect(slot(c, 1, 1).on).toBe(true);
    expect(slot(c, 3, 0).on).toBe(true);
    expect(reason(perc([0, 0]), 'delay')).toMatch(/No note after the downbeat/);
    expect(reason(perc([1, 0], [1, 1]), 'delay')).toMatch(/after it already sounds/);
    expect(reason(perc([3, 3]), 'delay')).toMatch(/already the last Slot/);
  });

  it('AC-10.3.3/4 — Add a note: the first silent Slot whose computed default accent is Medium turns on; unavailable when there is none', () => {
    const c = copy(mel(['1', '3', null, null]), 'add-note');
    expect(slot(c, 0, 2)).toEqual({ on: true, pitch: { degree: '1', octaveOffset: 0 } });
    expect(effectiveAccent(c[0], 0, 2)).toBe(2);
    let all = perc();
    for (let b = 0; b < 4; b++) all = cycleAccent(all, 0, b, 2);
    all = cycleAccent(all, 0, 2, 0); // Beat 3's own level is Medium too
    expect(reason(all, 'add-note')).toMatch(/No silent/);
  });

  it('AC-10.3.3/5 — Drop a note: the last sounding Slot at Accent Level Weak that is not the first Slot of a Measure turns off; unavailable when there is none', () => {
    const c = copy(perc([0, 0], [1, 0], [3, 0]), 'drop-note');
    expect(slot(c, 3, 0).on).toBe(false);
    expect(slot(c, 1, 0).on).toBe(true);
    expect(reason(perc([0, 0], [2, 0]), 'drop-note')).toMatch(/No weak note/);
  });

  it('AC-10.3.3/6 — Breathe: every Slot of the phrase’s last Beat turns off; unavailable when that Beat is already silent', () => {
    const c = copy(perc([3, 0], [3, 1]), 'breathe');
    expect(c[0].beats[3].slots.every((s) => !s.on)).toBe(true);
    expect(reason(perc([0, 0]), 'breathe')).toMatch(/already silent/);
  });

  it('AC-10.3.3/7 — Double the last Beat: the phrase’s last Beat takes the Recipe with twice its Slot count — Straight 8ths to Straight 16ths on a quarter-note Beat, Undivided to Straight 16ths on an eighth-note Beat — each sounding Slot landing on the Slot at twice its position with its override and Pitch, the Slots between them off; unavailable on any other Recipe', () => {
    let p = setRecipe(mel(['1', null, null, null]), 0, 3, 'straight-8ths');
    for (const [s, degree] of [[0, '5'], [1, '6']]) p = setPitch(cycleAccent(p, 0, 3, s), 0, 3, s, { degree, octaveOffset: 0 });
    const c = copy(p, 'double-ending');
    expect(c[0].beats[3].recipe).toBe('straight-16ths');
    expect(c[0].beats[3].slots.map((s) => s.pitch?.degree ?? null)).toEqual(['5', null, '6', null]);

    const eighth = cycleAccent(setRecipe(setTimeSignature(create(), 0, '6/8'), 0, 5, 'undivided'), 0, 5, 0);
    const e = copy(eighth, 'double-ending');
    expect(e[0].beats[5].recipe).toBe('straight-16ths');
    expect(e[0].beats[5].slots.map((s) => s.on)).toEqual([true, false]);

    expect(reason(setRecipe(perc(), 0, 3, 'triplet-8ths'), 'double-ending')).toMatch(/no Recipe twice as fine/);
  });

  it('AC-10.3.3/8 — Halve the last Beat: the reverse — Straight 16ths to Straight 8ths on a quarter-note Beat, to Undivided on an eighth-note Beat — the Slots at even positions kept and the others dropped; unavailable on any other Recipe', () => {
    let p = setRecipe(perc(), 0, 3, 'straight-16ths');
    for (const s of [0, 1, 2]) p = cycleAccent(p, 0, 3, s);
    const c = copy(p, 'halve-ending');
    expect(c[0].beats[3].recipe).toBe('straight-8ths');
    expect(c[0].beats[3].slots.map((s) => s.on)).toEqual([true, true]);

    let eighth = setRecipe(setTimeSignature(create(), 0, '6/8'), 0, 5, 'straight-16ths');
    eighth = cycleAccent(eighth, 0, 5, 1);
    const e = copy(eighth, 'halve-ending');
    expect(e[0].beats[5].recipe).toBe('undivided');
    expect(e[0].beats[5].slots.map((s) => s.on)).toEqual([false]);

    expect(reason(setRecipe(perc(), 0, 3, 'straight-8ths'), 'halve-ending')).toMatch(/no Recipe half as fine/);
  });

  it('AC-10.3.3/9 — Lift: every sounding Slot one Accent Level louder, Strong staying Strong; unavailable when every sounding Slot is Strong', () => {
    const c = copy(perc([0, 0], [1, 0], [2, 0]), 'lift');
    expect([0, 1, 2].map((b) => effectiveAccent(c[0], b, 0))).toEqual([3, 2, 3]);
    expect(slot(c, 0, 0).accent).toBeUndefined();
    expect(reason(perc([0, 0]), 'lift')).toMatch(/already Strong/);
  });

  it('AC-10.3.3/10 — Soften: every sounding Slot one Accent Level quieter, Weak staying Weak and nothing turned off; unavailable when every sounding Slot is Weak', () => {
    const c = copy(perc([0, 0], [1, 0], [2, 0]), 'soften');
    expect([0, 1, 2].map((b) => effectiveAccent(c[0], b, 0))).toEqual([2, 1, 1]);
    expect(c[0].beats.map((b) => b.slots[0].on)).toEqual([true, true, true, false]);
    expect(reason(perc([1, 0]), 'soften')).toMatch(/already Weak/);
  });

  it('AC-10.3.3/11 — Shift the accent: in each Measure of the phrase, the first Slot of Beat 1 takes Weak and the first Slot of Beat 2 takes Strong, each where it sounds; unavailable when no Measure has a sounding first Slot on Beat 1 or Beat 2, or every Measure has one Beat', () => {
    const c = copy(perc([0, 0], [1, 0], [2, 0]), 'shift-accent');
    expect([0, 1, 2].map((b) => effectiveAccent(c[0], b, 0))).toEqual([1, 3, 2]);
    expect(reason(perc([2, 0]), 'shift-accent')).toMatch(/No Measure/);
    expect(reason(cycleAccent(setTimeSignature(create(), 0, '1/4'), 0, 0, 0), 'shift-accent')).toMatch(/No Measure/);
  });

  it('AC-10.3.3/12 — Resolve the ending (Melodic): the phrase’s last sounding note becomes the tonic — degree 1 — nearest to it, the lower of two equally near; unavailable without a note or when it already is the tonic', () => {
    expect(pitches(copy(mel(['1', '2']), 'resolve-ending'))).toEqual([{ degree: '1', octaveOffset: 0 }, { degree: '1', octaveOffset: 0 }]);
    expect(pitches(copy(mel(['1', '7']), 'resolve-ending'))[1]).toEqual({ degree: '1', octaveOffset: 1 });
    // The tritone is equally near both tonics: the lower wins.
    expect(pitches(copy(mel(['1', '#4']), 'resolve-ending'))[1]).toEqual({ degree: '1', octaveOffset: 0 });
    expect(reason(mel(['3', '1']), 'resolve-ending')).toMatch(/already the tonic/);
    expect(reason(mel([null, null]), 'resolve-ending')).toMatch(/Needs a note/);
    expect(reason(perc([0, 0]), 'resolve-ending')).toMatch(/percussive/);
  });

  it('AC-10.3.3/13 — Open the ending (Melodic): the same with the fifth — degree 5; unavailable without a note or when it already is the fifth', () => {
    expect(pitches(copy(mel(['1', '4']), 'open-ending'))[1]).toEqual({ degree: '5', octaveOffset: 0 });
    expect(pitches(copy(mel(['1', '2']), 'open-ending'))[1]).toEqual({ degree: '5', octaveOffset: 0 });
    expect(pitches(copy(mel(['3', '1']), 'open-ending'))[1]).toEqual({ degree: '5', octaveOffset: -1 });
    expect(reason(mel(['1', '5']), 'open-ending')).toMatch(/already the fifth/);
    expect(reason(mel([null]), 'open-ending')).toMatch(/Needs a note/);
  });

  it('AC-10.3.3/14 — Sequence up (Melodic): every note one scale step up; unavailable without a note', () => {
    expect(pitches(copy(mel(['1', '3', '7', 'b3']), 'sequence-up'))).toEqual([
      { degree: '2', octaveOffset: 0 },
      { degree: '4', octaveOffset: 0 },
      { degree: '1', octaveOffset: 1 },
      { degree: '3', octaveOffset: 0 },
    ]);
    // Dorian steps to the degrees Dorian has.
    expect(pitches(copy(mel(['2'], { scale: 'dorian' }), 'sequence-up'))).toEqual([{ degree: 'b3', octaveOffset: 0 }]);
    expect(reason(mel(['1@3']), 'sequence-up')).toBeNull();
    expect(reason(mel(['7@3']), 'sequence-up')).toMatch(/octaves/);
    expect(reason(mel([null]), 'sequence-up')).toMatch(/Needs a note/);
  });

  it('AC-10.3.3/15 — Sequence down (Melodic): every note one scale step down; unavailable without a note', () => {
    expect(pitches(copy(mel(['1', '4']), 'sequence-down'))).toEqual([
      { degree: '7', octaveOffset: -1 },
      { degree: '3', octaveOffset: 0 },
    ]);
    expect(reason(mel(['1@-3']), 'sequence-down')).toMatch(/octaves/);
    expect(reason(perc([0, 0]), 'sequence-down')).toMatch(/percussive/);
  });

  it('AC-10.3.3/16 — Octave up (Melodic): every note’s octave raised by one, chord-tone Pitches keeping their roles; unavailable without a note or when any note is already in octave 7', () => {
    expect(pitches(copy(mel(['1', '5@-1']), 'octave-up'))).toEqual([{ degree: '1', octaveOffset: 1 }, { degree: '5', octaveOffset: 0 }]);
    let p = withChords(mel(['1', null]));
    p = setPitch(p, 0, 0, 0, { tone: 3, octaveOffset: 0 });
    expect(pitches(copy(p, 'octave-up'))).toEqual([{ tone: 3, octaveOffset: 1 }]);
    expect(reason(mel(['1', '3@3']), 'octave-up')).toMatch(/highest octave/);
    expect(reason(mel([null]), 'octave-up')).toMatch(/Needs a note/);
  });

  it('AC-10.3.3/17 — Octave down (Melodic): every note’s octave lowered by one, likewise; unavailable without a note or when any note is already in octave 1', () => {
    expect(pitches(copy(mel(['1']), 'octave-down'))).toEqual([{ degree: '1', octaveOffset: -1 }]);
    expect(reason(mel(['1', '3@-3']), 'octave-down')).toMatch(/lowest octave/);
  });

  it('AC-10.3.3/18 — Fill the gaps (Melodic): for each pair of consecutive notes two scale steps apart with a silent Slot between them, the silent Slot nearest the second note sounds the scale degree between them; unavailable when there is no such pair', () => {
    const c = copy(mel(['1', '3', null, '1']), 'fill-gaps');
    // 1 → 3 has Beat 1's three later Slots free: the passing 2 lands on the one nearest the 3. 3 → 1 is a third down: the free Slot nearest the 1.
    expect(slot(c, 0, 3).pitch).toEqual({ degree: '2', octaveOffset: 0 });
    expect(slot(c, 2, 3).pitch).toEqual({ degree: '2', octaveOffset: 0 });
    expect([slot(c, 0, 1).on, slot(c, 0, 2).on, slot(c, 1, 1).on, slot(c, 2, 2).on]).toEqual([false, false, false, false]);
    let adjacent = mel(['1', null, null, null]);
    adjacent = setPitch(cycleAccent(adjacent, 0, 0, 1), 0, 0, 1, { degree: '3', octaveOffset: 0 });
    expect(reason(adjacent, 'fill-gaps')).toMatch(/No two notes/);
    expect(reason(mel(['1', '2']), 'fill-gaps')).toMatch(/No two notes/);
  });

  it('AC-10.3.3/19 — Neighbour (Melodic): the note followed by the longest run of silent Slots before the next note — the earlier of two equal runs — gets its upper scale neighbour on the last silent Slot of that run; unavailable when no note is followed by a silent Slot', () => {
    const c = copy(mel(['1', null, '5', null]), 'neighbour');
    // Both notes are followed by seven silent Slots; the earlier wins, and its neighbour lands just before the 5.
    expect(slot(c, 1, 3).pitch).toEqual({ degree: '2', octaveOffset: 0 });
    expect(slot(c, 3, 3).on).toBe(false);
    const d = copy(mel(['5', '1', null, null]), 'neighbour');
    expect(slot(d, 3, 3).pitch).toEqual({ degree: '2', octaveOffset: 0 });
    let dense = mel(['1', '2', '3', '4']);
    for (let b = 0; b < 4; b++) for (const s of [1, 2, 3]) dense = setPitch(cycleAccent(dense, 0, b, s), 0, b, s, { degree: '5', octaveOffset: 0 });
    expect(reason(dense, 'neighbour')).toMatch(/No note is followed/);
  });

  it('AC-10.3.3/20 — Chord-tone swap (Melodic, with a progression): each note that is the 3rd of the chord in force for its Measure in the first pass becomes that chord’s 5th and each 5th its 3rd, a chord-tone Pitch of role 3 becoming role 5 and the reverse; unavailable without a progression or when no note is a 3rd or a 5th', () => {
    let p = withChords(mel(['3', '5', '2', null]));
    p = setPitch(cycleAccent(p, 0, 3, 0), 0, 3, 0, { tone: 5, octaveOffset: 0 });
    const c = copy(p, 'chord-tone-swap');
    expect(pitches(c)).toEqual([
      { degree: '5', octaveOffset: 0 },
      { degree: '3', octaveOffset: 0 },
      { degree: '2', octaveOffset: 0 },
      { tone: 3, octaveOffset: 0 },
    ]);
    // Under a per-Measure change the second Measure of the phrase reads the IV: its 3rd is the scale's 6.
    let two = setChange(withChords(mel(['3', null, null, null])), 'measure');
    two = addMeasure(two);
    two = setPitch(cycleAccent(two, 1, 0, 0), 1, 0, 0, { degree: '6', octaveOffset: 0 });
    const t = copy(two, 'chord-tone-swap', 2);
    expect(t[1].beats[0].slots[0].pitch).toEqual({ degree: '1', octaveOffset: 1 });
    expect(reason(mel(['3']), 'chord-tone-swap')).toMatch(/Needs a progression/);
    expect(reason(withChords(mel(['2', '4'])), 'chord-tone-swap')).toMatch(/No note is the 3rd or 5th/);
  });

  it('AC-10.3.3/21 — Invert (Melodic): each note’s distance in scale steps from the phrase’s first note is reversed, so a line that rose falls by the same steps; unavailable when every note is the first note’s degree and octave', () => {
    expect(pitches(copy(mel(['1', '3', '5', '2']), 'invert'))).toEqual([
      { degree: '1', octaveOffset: 0 },
      { degree: '6', octaveOffset: -1 },
      { degree: '4', octaveOffset: -1 },
      { degree: '7', octaveOffset: -1 },
    ]);
    expect(reason(mel(['3', '3', '3']), 'invert')).toMatch(/Every note is the first note/);
    expect(reason(mel(['1@-3', '3']), 'invert')).toMatch(/octaves/);
  });

  it('AC-10.3.3/22 — Retrograde (Melodic): the notes are reversed over the same sounding Slots, the first sounding Slot taking the last note’s Pitch and so on; unavailable when fewer than two distinct Pitches sound', () => {
    const c = copy(mel(['1', null, '3', '5']), 'retrograde');
    expect(pitches(c).map((p) => p.degree)).toEqual(['5', '3', '1']);
    expect(c[0].beats.map((b) => b.slots[0].on)).toEqual([true, false, true, true]);
    expect(reason(mel(['2', '2']), 'retrograde')).toMatch(/Fewer than two/);
  });

  it('AC-10.3.3/23 — Under a fill, every Pitch device other than Octave up and Octave down is unavailable, saying the fill deals the notes; the Rhythm, Dynamics and Fill devices apply and are heard under it', () => {
    const p = setArpeggio(withChords(mel(['1', '3', null, '5'])), 'up');
    const list = devicesFor(p, 1);
    for (const d of list.filter((d) => d.group === 'Pitch' && !/^octave-/.test(d.id))) {
      expect(d.reason, d.id).toMatch(/fill, Ascending, deals the notes/);
    }
    expect(list.find((d) => d.id === 'octave-up').reason).toBeNull();
    expect(list.find((d) => d.id === 'octave-down').reason).toBeNull();
    expect(list.find((d) => d.id === 'breathe').reason).toBeNull();
    expect(list.find((d) => d.id === 'lift').reason).toBeNull();
    expect(list.find((d) => d.id === 'change-fill').reason).toBeNull();
    // Breathe under the fill: the copy's dealt notes are heard, one fewer of them.
    const next = vary(p, 'breathe');
    expect(next.harmony.arpeggio).toBe('up');
    expect(arpeggioDeal(next, 0).size).toBe(5);
  });

  it('AC-10.3.3/24 — Change the fill (Melodic, with a progression and a fill set): the Measures already there take the notes the current fill deals them in the first pass, written as fixed Pitches at each Slot’s own octave; the copy takes the notes the next fill deals it in the first pass of the lengthened Pattern, written the same way; and the Pattern’s fill becomes None, the progression unchanged. The next fill is the next on My list after the current one when the Fills cycle is set to My list, and the next in the catalogue otherwise, wrapping round and never None. Unavailable without a progression, without a fill, or when the next fill is the current one', () => {
    const p = setArpeggio(withChords(mel(['1', '3', '5', '1@1'])), 'up');
    const expectedFirst = bakedDegrees(p);
    const next = vary(p, 'change-fill');
    expect(next.measures).toHaveLength(2);
    expect(next.harmony.arpeggio).toBeUndefined();
    expect(next.harmony.chords).toEqual(p.harmony.chords);
    expect(pitches([next.measures[0]])).toEqual(expectedFirst);
    // The copy holds what Descending — the next in the catalogue — deals the lengthened Pattern.
    const under = { ...next, harmony: { ...next.harmony, arpeggio: 'down' } };
    expect(pitches([next.measures[1]])).toEqual(bakedDegrees(under).slice(4));
    // Dealt continuously through the pass, as the fill would play it: Measure 1 took 5 3 1 5, so the copy opens on the 3.
    expect(pitches([next.measures[1]]).map((x) => x.degree)).toEqual(['3', '1', '5', '3']);
    // Fixed Pitches now: a later Pitch device applies.
    expect(reason(next, 'sequence-up', 1)).toBeNull();

    // My list: the next listed after the current, wrapping; the last of the catalogue wraps to its first.
    const alberti = ARPEGGIOS.findIndex((a) => a.id === 'alberti');
    const travis = ARPEGGIOS.findIndex((a) => a.id === 'travis');
    const listed = vary(p, 'change-fill', 1, 'original', { fillOrder: [alberti, travis] });
    const underTravis = { ...listed, harmony: { ...listed.harmony, arpeggio: 'alberti' } };
    expect(pitches([listed.measures[1]])).toEqual(bakedDegrees(underTravis).slice(4));
    const last = setArpeggio(p, ARPEGGIOS[ARPEGGIOS.length - 1].id);
    const wrapped = vary(last, 'change-fill');
    const underFirst = { ...wrapped, harmony: { ...wrapped.harmony, arpeggio: ARPEGGIOS[0].id } };
    expect(pitches([wrapped.measures[1]])).toEqual(bakedDegrees(underFirst).slice(4));

    expect(reason(mel(['1']), 'change-fill')).toMatch(/Needs a progression and a fill/);
    expect(reason(withChords(mel(['1'])), 'change-fill')).toMatch(/Needs a fill/);
    const up = ARPEGGIOS.findIndex((a) => a.id === 'up');
    expect(reason(p, 'change-fill', 1, 'original', { fillOrder: [up] })).toMatch(/No other fill/);
    expect(reason(perc([0, 0]), 'change-fill')).toMatch(/Needs a progression and a fill/);
  });
});

/** The degrees a Pattern's fill deals in its first pass, as Change the fill writes them. */
function bakedDegrees(p) {
  const deal = arpeggioDeal(p, 0);
  const out = [];
  p.measures.forEach((m, mi) => {
    const chord = chordIn(p, 0, mi);
    m.beats.forEach((b, bi) =>
      b.slots.forEach((s, si) => {
        if (!s.on) return;
        const sound = soundingPitch(s, deal, mi, bi, si);
        out.push(stepAsDegree(sound.step, chord, p, sound.octaveOffset));
      })
    );
  });
  return out;
}

/* --- the dice -------------------------------------------------------------------- */

describe('core/variations — the roll (AC-10.3.4/7, /8)', () => {
  it('AC-10.3.4/7 — Roll the dice, at the head of the picker, applies one device chosen at random from those available and not in a group marked No dice, exactly as tapping it would, and is disabled saying so when no such device remains: the pure part', () => {
    const list = devicesFor(mel(['1', '3', null, '5']), 1);
    const open = rollable(list);
    expect(open.every((d) => !d.reason)).toBe(true);
    expect(open.some((d) => d.group === 'Pitch')).toBe(true);
    expect(pick(open, 0)).toBe(open[0]);
    expect(pick(open, 0.999)).toBe(open[open.length - 1]);
    expect(pick([], 0.5)).toBeNull();
  });

  it('AC-10.3.4/8 — Each group heading carries a No dice toggle that keeps the whole group out of the roll and changes nothing else; the toggles hold for the session and are not Pattern content: the pure part', () => {
    const list = devicesFor(mel(['1', '3', null, '5']), 1);
    const noPitch = rollable(list, ['Pitch']);
    expect(noPitch.some((d) => d.group === 'Pitch')).toBe(false);
    expect(noPitch.length).toBeGreaterThan(0);
    expect(rollable(list, ['Rhythm', 'Dynamics', 'Pitch', 'Fill'])).toEqual([]);
  });
});
