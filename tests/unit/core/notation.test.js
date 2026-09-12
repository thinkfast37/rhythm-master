import { describe, it, expect } from 'vitest';
import {
  buildScore,
  beatItems,
  beamSegments,
  keySignature,
  staffStep,
  writtenTicks,
  slotTick,
  itemAt,
  stemDirection,
  QUARTER,
} from '../../../src/core/notation.js';
import {
  create,
  addMeasure,
  setTimeSignature,
  setRecipe,
  cycleAccent,
  setPitch,
  setSwingAmount,
} from '../../../src/core/pattern.js';
import { setProgression, setChange, setArpeggio, cyclePasses, arpeggioDeal, soundingPitch, stepName, chordIn } from '../../../src/core/harmony.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import { labelsFor } from '../../../src/core/counting.js';
import { STRONG, MEDIUM, WEAK } from '../../../src/core/accents.js';

/** A Beat with a Recipe and a list of on/off flags. */
const beat = (recipe, on) => ({ recipe, slots: on.map((x) => ({ on: Boolean(x) })) });

/** Items as a compact string: kind, value, dot, tuplet, tie, tick. */
const brief = (items) =>
  items.map((i) => `${i.kind === 'note' ? 'n' : 'r'}:${i.value}${i.dots ? '.' : ''}${i.tuplet ? '/3' : ''}${i.tie ? '~' : ''}@${i.tick}`);

/** A 4/4 Pattern with the given Slots turned on: [measure, beat, slot]. */
function pattern(ons, { measures = 1, melodic = false } = {}) {
  let p = create('Test');
  for (let i = 1; i < measures; i++) p = addMeasure(p);
  if (melodic) p = { ...p, soundMode: 'melodic', key: 'C' };
  for (const [m, b, s] of ons) {
    p = cycleAccent(p, m, b, s);
    if (melodic) p = setPitch(p, m, b, s, { degree: '1', octaveOffset: 0 });
  }
  return p;
}

const beatOf = (score, b, m = 0) => score.passes[0].measures[m].beats[b];
const notesOf = (score) => score.passes.flatMap((p) => p.measures.flatMap((m) => m.beats.flatMap((b) => b.items.filter((i) => i.kind === 'note'))));

describe('core/notation — the head (AC-12.2.2)', () => {
  it('AC-12.2.2/2 — The tempo mark is ♩ = tempo when the first Measure has a quarter-note Beat and ♪ = tempo when it has an eighth-note Beat, since tempo is Beats per minute and the Beat is what the denominator names', () => {
    const quarter = { ...pattern([[0, 0, 0]]), tempo: 96 };
    expect(buildScore(quarter).tempo).toEqual({ bpm: 96, beatValue: 'quarter' });
    const eighth = { ...setTimeSignature(quarter, 0, '6/8'), tempo: 132 };
    expect(buildScore(eighth).tempo).toEqual({ bpm: 132, beatValue: 'eighth' });
  });

  it('AC-12.2.2/3 — The Time Signature is written at the start of the first Measure and again at the start of any Measure whose meter differs from the one before, never on a Measure that repeats it', () => {
    let p = pattern([], { measures: 5 });
    p = setTimeSignature(p, 2, '3/4');
    p = setTimeSignature(p, 3, '3/4');
    p = setTimeSignature(p, 4, '6/8');
    const shown = buildScore(p).passes[0].measures.map((m) => m.showMeter);
    expect(shown).toEqual([true, false, true, false, true]);
  });

  it("AC-12.2.2/4 — A Melodic Pattern's head says its Key and scale by name, E♭ Aeolian (Natural Minor); a Percussive Pattern's head says neither", () => {
    const melodic = { ...pattern([[0, 0, 0]], { melodic: true }), key: 'Eb', scale: 'aeolian' };
    expect(buildScore(melodic).keyLabel).toBe('E♭ Aeolian (Natural Minor)');
    expect(buildScore({ ...melodic, scale: undefined }).keyLabel).toBe('E♭ Ionian (Major)');
    expect(buildScore(pattern([[0, 0, 0]])).keyLabel).toBeNull();
  });

  it('AC-12.2.2/5 — When any swing amount is above zero the head says "Swing" beneath the tempo mark, and the notes are still written straight, as swing is a feel and not a rhythm', () => {
    const straight = pattern([[0, 0, 0], [0, 0, 1]]);
    const swung = setSwingAmount(straight, 40);
    expect(buildScore(straight).swing).toBe(false);
    expect(buildScore(swung).swing).toBe(true);
    // The same written values at the same ticks, swing or not.
    expect(brief(beatOf(buildScore(swung), 0).items)).toEqual(brief(beatOf(buildScore(straight), 0).items));
  });
});

describe('core/notation — every Slot at its exact time and value (AC-12.2.4)', () => {
  it('AC-12.2.4/1 — A Beat occupies a quarter note in a /4 Measure and an eighth note in a /8 Measure, and its Recipe divides it as written: Straight 8ths into two eighths, Straight 16ths into four sixteenths, Triplet 8ths into three eighths under a 3, Undivided into one eighth, and Straight 16ths on an eighth-note Beat into two sixteenths', () => {
    expect(brief(beatItems(beat('straight-8ths', [1, 1]), 'quarter'))).toEqual(['n:eighth@0', 'n:eighth@6']);
    expect(brief(beatItems(beat('straight-16ths', [1, 1, 1, 1]), 'quarter'))).toEqual(['n:sixteenth@0', 'n:sixteenth@3', 'n:sixteenth@6', 'n:sixteenth@9']);
    expect(brief(beatItems(beat('triplet-8ths', [1, 1, 1]), 'quarter'))).toEqual(['n:eighth/3@0', 'n:eighth/3@4', 'n:eighth/3@8']);
    expect(brief(beatItems(beat('undivided', [1]), 'eighth'))).toEqual(['n:eighth@0']);
    expect(brief(beatItems(beat('straight-16ths', [1, 1]), 'eighth'))).toEqual(['n:sixteenth@0', 'n:sixteenth@3']);
    // Each Beat's items sum to its value.
    for (const [b, v] of [[beat('straight-8ths', [1, 1]), 'quarter'], [beat('undivided', [1]), 'eighth']]) {
      const total = beatItems(b, v).reduce((t, i) => t + writtenTicks(i), 0);
      expect(total).toBe(v === 'quarter' ? QUARTER : QUARTER / 2);
    }
  });

  it('AC-12.2.4/2 — A mixed Recipe is written as its two halves: two sixteenths and three sixteenths under a 3, in the order the Recipe names', () => {
    expect(brief(beatItems(beat('straight-triplet-split', [1, 1, 1, 1, 1]), 'quarter'))).toEqual([
      'n:sixteenth@0', 'n:sixteenth@3', 'n:sixteenth/3@6', 'n:sixteenth/3@8', 'n:sixteenth/3@10',
    ]);
    expect(brief(beatItems(beat('triplet-straight-split', [1, 1, 1, 1, 1]), 'quarter'))).toEqual([
      'n:sixteenth/3@0', 'n:sixteenth/3@2', 'n:sixteenth/3@4', 'n:sixteenth@6', 'n:sixteenth@9',
    ]);
  });

  it("AC-12.2.4/3 — A sounding Slot's value runs to the next sounding Slot in the Beat or the Beat's end: the first Slot alone of Straight 8ths is a quarter note; Straight 16ths on–off–off–on is a dotted eighth then a sixteenth; Triplet 8ths on–off–on is a quarter then an eighth under the 3", () => {
    expect(brief(beatItems(beat('straight-8ths', [1, 0]), 'quarter'))).toEqual(['n:quarter@0']);
    expect(brief(beatItems(beat('straight-16ths', [1, 0, 0, 1]), 'quarter'))).toEqual(['n:eighth.@0', 'n:sixteenth@9']);
    expect(brief(beatItems(beat('triplet-8ths', [1, 0, 1]), 'quarter'))).toEqual(['n:quarter/3@0', 'n:eighth/3@8']);
    // On–on–off–off: an eighth after a sixteenth... no: a sixteenth then a dotted eighth.
    expect(brief(beatItems(beat('straight-16ths', [1, 1, 0, 0]), 'quarter'))).toEqual(['n:sixteenth@0', 'n:eighth.@3']);
    expect(brief(beatItems(beat('straight-16ths', [1, 0, 1, 0]), 'quarter'))).toEqual(['n:eighth@0', 'n:eighth@6']);
  });

  it("AC-12.2.4/4 — A value that would cross the boundary between a mixed Recipe's two halves is written as two notes tied together, one in each half, never as one note spanning a tuplet boundary", () => {
    // A lone first Slot: an eighth tied to an eighth, the second half whole.
    expect(brief(beatItems(beat('straight-triplet-split', [1, 0, 0, 0, 0]), 'quarter'))).toEqual(['n:eighth~@0', 'n:eighth@6']);
    // Held into the triplet half up to its second Slot: tied to a triplet sixteenth.
    expect(brief(beatItems(beat('straight-triplet-split', [1, 0, 0, 1, 0]), 'quarter'))).toEqual(['n:eighth~@0', 'n:sixteenth/3@6', 'n:eighth/3@8']);
    const items = beatItems(beat('straight-triplet-split', [1, 0, 0, 1, 0]), 'quarter');
    expect(items[1].continuation).toBe(true);
    // From the triplet half into the straight half.
    expect(brief(beatItems(beat('triplet-straight-split', [0, 1, 0, 0, 0]), 'quarter'))).toEqual(['r:sixteenth/3@0', 'n:eighth/3~@2', 'n:eighth@6']);
    // No item ever spans the half-Beat boundary at tick 6.
    for (const it of items) expect(it.tick < 6 ? it.tick + it.ticks <= 6 : true).toBe(true);
  });

  it('AC-12.2.4/5 — Off Slots before the first sounding Slot are rests written largest first and never dotted: three leading sixteenths are an eighth rest then a sixteenth rest; a leading triplet eighth is an eighth rest under the 3', () => {
    expect(brief(beatItems(beat('straight-16ths', [0, 0, 0, 1]), 'quarter'))).toEqual(['r:eighth@0', 'r:sixteenth@6', 'n:sixteenth@9']);
    expect(brief(beatItems(beat('triplet-8ths', [0, 1, 1]), 'quarter'))).toEqual(['r:eighth/3@0', 'n:eighth/3@4', 'n:eighth/3@8']);
    expect(brief(beatItems(beat('triplet-8ths', [0, 0, 1]), 'quarter'))).toEqual(['r:quarter/3@0', 'n:eighth/3@8']);
    expect(brief(beatItems(beat('straight-8ths', [0, 1]), 'quarter'))).toEqual(['r:eighth@0', 'n:eighth@6']);
    expect(brief(beatItems(beat('straight-16ths', [0, 1]), 'eighth'))).toEqual(['r:sixteenth@0', 'n:sixteenth@3']);
    for (const it of beatItems(beat('straight-16ths', [0, 0, 0, 1]), 'quarter')) if (it.kind === 'rest') expect(it.dots).toBe(0);
  });

  it("AC-12.2.4/6 — A Beat with no sounding Slot is one rest of the Beat's value, and a Measure with no sounding Slot is a single whole-measure rest", () => {
    expect(brief(beatItems(beat('straight-16ths', [0, 0, 0, 0]), 'quarter'))).toEqual(['r:quarter@0']);
    expect(brief(beatItems(beat('straight-triplet-split', [0, 0, 0, 0, 0]), 'quarter'))).toEqual(['r:quarter@0']);
    expect(brief(beatItems(beat('undivided', [0]), 'eighth'))).toEqual(['r:eighth@0']);
    const score = buildScore(pattern([[1, 0, 0]], { measures: 2 }));
    expect(score.passes[0].measures[0].wholeRest).toBe(true);
    expect(score.passes[0].measures[0].beats.every((b) => b.items.length === 0)).toBe(true);
    expect(score.passes[0].measures[1].wholeRest).toBe(false);
  });

  it('AC-12.2.4/7 — The notes of one Beat shorter than a quarter are beamed together, a rest breaks the beam, and a tuplet carries its 3 above or below the group', () => {
    const all = beatItems(beat('straight-16ths', [1, 1, 1, 1]), 'quarter');
    expect(beamSegments(all)).toEqual([[0, 1, 2, 3]]);
    // A leading rest, then three beamed.
    expect(beamSegments(beatItems(beat('straight-16ths', [0, 1, 1, 1]), 'quarter'))).toEqual([[1, 2, 3]]);
    // A quarter is never beamed.
    expect(beamSegments(beatItems(beat('straight-8ths', [1, 0]), 'quarter'))).toEqual([]);
    // Dotted eighth and sixteenth beam together.
    expect(beamSegments(beatItems(beat('straight-16ths', [1, 0, 0, 1]), 'quarter'))).toEqual([[0, 1]]);
    // Every item of a triplet group carries its 3.
    for (const it of beatItems(beat('triplet-8ths', [1, 1, 1]), 'quarter')) expect(it.tuplet).toBe(3);
    // A whole triplet group written as one value carries none.
    expect(beatItems(beat('triplet-8ths', [1, 0, 0]), 'quarter')[0].tuplet).toBeNull();
  });

  it("AC-12.2.4/8 — Within a Measure, horizontal position is proportional to time: the three notes of a triplet are equally spaced, a sixteenth sits a quarter of the way through its Beat, and the two halves of a mixed Beat are the same width", () => {
    const triplet = beatItems(beat('triplet-8ths', [1, 1, 1]), 'quarter').map((i) => i.tick);
    expect(triplet[1] - triplet[0]).toBe(triplet[2] - triplet[1]);
    expect(slotTick(beat('straight-16ths', [1, 1, 1, 1]), 'quarter', 1)).toBe(QUARTER / 4);
    const mixed = beat('straight-triplet-split', [1, 1, 1, 1, 1]);
    expect(slotTick(mixed, 'quarter', 2)).toBe(QUARTER / 2);
    // Measure-level ticks: Beat 2 starts a quarter in.
    const score = buildScore(pattern([[0, 1, 0]]));
    expect(beatOf(score, 1).items[0].tick).toBe(QUARTER);
    expect(beatOf(score, 1).labels[0].tick).toBe(QUARTER);
  });

  it("AC-12.2.4/9 — Measures are written in order with a bar line between each and a final bar line after the last, and a Measure's notes and rests always total its meter exactly", () => {
    let p = pattern([[0, 0, 0], [1, 2, 1], [2, 0, 1]], { measures: 3 });
    p = setTimeSignature(p, 1, '7/8');
    p = setRecipe(p, 1, 2, 'straight-16ths');
    p = cycleAccent(p, 1, 2, 1);
    p = setRecipe(p, 2, 0, 'triplet-straight-split');
    p = cycleAccent(p, 2, 0, 1);
    const score = buildScore(p);
    expect(score.passes[0].measures.map((m) => m.measureIndex)).toEqual([0, 1, 2]);
    for (const m of score.passes[0].measures) {
      const total = m.beats.reduce((t, b) => t + b.items.reduce((u, i) => u + writtenTicks(i), 0), 0);
      expect(m.wholeRest ? m.ticks : total).toBe(m.ticks);
      // Every item also starts exactly where the one before ended.
      let at = 0;
      for (const b of m.beats) for (const i of b.items) {
        expect(i.tick).toBe(at);
        at += writtenTicks(i);
      }
    }
    // Exhaustively: every on/off combination of every Recipe totals its Beat.
    for (const [recipe, noteValue, n] of [
      ['straight-8ths', 'quarter', 2], ['straight-16ths', 'quarter', 4], ['triplet-8ths', 'quarter', 3],
      ['straight-triplet-split', 'quarter', 5], ['triplet-straight-split', 'quarter', 5],
      ['undivided', 'eighth', 1], ['straight-16ths', 'eighth', 2],
    ]) {
      for (let mask = 0; mask < 1 << n; mask++) {
        const on = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
        const items = beatItems(beat(recipe, on), noteValue);
        const total = items.reduce((t, i) => t + writtenTicks(i), 0);
        expect(total, `${recipe} ${on.join('')}`).toBe(noteValue === 'quarter' ? QUARTER : QUARTER / 2);
        expect(items.filter((i) => i.kind === 'note' && !i.continuation).length, `${recipe} ${on.join('')}`).toBe(on.filter(Boolean).length);
      }
    }
  });
});

describe('core/notation — the treble staff (AC-12.2.5)', () => {
  it("AC-12.2.5/1 — The key signature is the one whose notes are the scale's: C Ionian none, C Aeolian three flats, D Dorian none, E♭ Ionian three flats, D Lydian three sharps; a pentatonic, blues or minor scale takes the parallel Ionian's, or Aeolian's when the scale has ♭3 and no 3, as the chords are spelled; a mode whose signature would need more than seven accidentals takes the Key's Ionian signature instead", () => {
    expect(keySignature('C', 'ionian').count).toBe(0);
    expect(keySignature('C', 'aeolian')).toMatchObject({ count: -3, accidental: 'b', letters: ['B', 'E', 'A'] });
    expect(keySignature('D', 'dorian').count).toBe(0);
    expect(keySignature('Eb', 'ionian')).toMatchObject({ count: -3, letters: ['B', 'E', 'A'] });
    expect(keySignature('D', 'lydian')).toMatchObject({ count: 3, accidental: '#', letters: ['F', 'C', 'G'] });
    // Not modes: the parallel Ionian, or Aeolian with ♭3 and no 3.
    expect(keySignature('C', 'major-pentatonic').count).toBe(0);
    expect(keySignature('C', 'minor-pentatonic').count).toBe(-3);
    expect(keySignature('C', 'harmonic-minor').count).toBe(-3);
    expect(keySignature('C', 'minor-blues').count).toBe(-3);
    expect(keySignature('C', 'major-blues').count).toBe(0); // has ♭3 and 3
    // More than seven accidentals falls back to the Key's Ionian.
    expect(keySignature('Db', 'locrian').count).toBe(-5);
    expect(keySignature('Gb', 'phrygian').count).toBe(-6);
    // Where the accidentals sit on a treble staff.
    expect(keySignature('D', 'ionian').steps).toEqual([8, 5]);
    expect(keySignature('Bb', 'ionian').steps).toEqual([4, 7]);
  });

  it('AC-12.2.5/2 — Every notehead sits at the staff position of its letter and octave, as the pitch strip names it: middle C — degree 1, Key C, octave 4 — on the first ledger line below the staff; E4 on the bottom line; B4 on the middle line; F5 on the top line; A5 on the first ledger line above; ledger lines drawn for every position outside the staff: the staff step arithmetic', () => {
    expect(staffStep('C', 4)).toBe(-2);
    expect(staffStep('E', 4)).toBe(0);
    expect(staffStep('B', 4)).toBe(4);
    expect(staffStep('F', 5)).toBe(8);
    expect(staffStep('A', 5)).toBe(10);
    expect(staffStep('C', 5)).toBe(5);
    expect(staffStep('C', 6)).toBe(12);
    let p = pattern([[0, 0, 0]], { melodic: true });
    expect(notesOf(buildScore(p))[0].step).toBe(-2);
    p = setPitch(p, 0, 0, 0, { degree: '3', octaveOffset: 0 });
    expect(notesOf(buildScore(p))[0].step).toBe(0);
    p = setPitch(p, 0, 0, 0, { degree: '7', octaveOffset: 0 });
    expect(notesOf(buildScore(p))[0].step).toBe(4);
  });

  it("AC-12.2.5/3 — A note's spelling is the pitch strip's: ♭3 in C is E♭, never D♯; 3 in D♭ is F and ♭3 in D♭ is F♭, so every degree keeps its own letter", () => {
    let p = pattern([[0, 0, 0]], { melodic: true });
    p = setPitch(p, 0, 0, 0, { degree: 'b3', octaveOffset: 0 });
    let note = notesOf(buildScore(p))[0];
    expect(note.name).toMatchObject({ letter: 'E', accidental: 'b', octave: 4 });
    expect(note.step).toBe(staffStep('E', 4));
    expect(note.accidental).toBe('flat');

    p = { ...p, key: 'Db' };
    p = setPitch(p, 0, 0, 0, { degree: '3', octaveOffset: 0 });
    note = notesOf(buildScore(p))[0];
    expect(note.name).toMatchObject({ letter: 'F', accidental: '' });
    expect(note.accidental).toBeNull(); // F is natural in D♭ major
    p = setPitch(p, 0, 0, 0, { degree: 'b3', octaveOffset: 0 });
    note = notesOf(buildScore(p))[0];
    expect(note.name).toMatchObject({ letter: 'F', accidental: 'b' });
    expect(note.step).toBe(staffStep('F', 4));
    expect(note.accidental).toBe('flat');
  });

  it('AC-12.2.5/4 — An accidental is written before a note when its letter is not already at that alteration — by the key signature or by an earlier accidental in the same Measure on the same letter and octave — and a natural is written when the note undoes one; an accidental holds to the end of its Measure and no further', () => {
    // C major, Measure 1: E♭ E♭ E E | E♭ — the second E♭ needs nothing, the E
    // needs a natural, and the next Measure's E♭ needs its flat again.
    let p = pattern([[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [1, 0, 0]], { measures: 2, melodic: true });
    p = setPitch(p, 0, 0, 0, { degree: 'b3', octaveOffset: 0 });
    p = setPitch(p, 0, 1, 0, { degree: 'b3', octaveOffset: 0 });
    p = setPitch(p, 0, 2, 0, { degree: '3', octaveOffset: 0 });
    p = setPitch(p, 0, 3, 0, { degree: '3', octaveOffset: 0 });
    p = setPitch(p, 1, 0, 0, { degree: 'b3', octaveOffset: 0 });
    expect(notesOf(buildScore(p)).map((n) => n.accidental)).toEqual(['flat', null, 'natural', null, 'flat']);

    // Against a signature: in E♭ major, E♭ needs nothing and E needs a natural.
    let q = pattern([[0, 0, 0], [0, 1, 0]], { melodic: true });
    q = { ...q, key: 'Eb' };
    q = setPitch(q, 0, 0, 0, { degree: '1', octaveOffset: 0 });
    q = setPitch(q, 0, 1, 0, { degree: '#1', octaveOffset: 0 });
    expect(notesOf(buildScore(q)).map((n) => [n.name.text, n.accidental])).toEqual([['Eb4', null], ['E4', 'natural']]);

    // The same letter an octave apart is a different position: both need theirs.
    let r = pattern([[0, 0, 0], [0, 1, 0]], { melodic: true });
    r = setPitch(r, 0, 0, 0, { degree: 'b3', octaveOffset: 0 });
    r = setPitch(r, 0, 1, 0, { degree: 'b3', octaveOffset: 1 });
    expect(notesOf(buildScore(r)).map((n) => n.accidental)).toEqual(['flat', 'flat']);
  });

  it('AC-12.2.5/5 — A chord-tone Pitch is written at the note it sounds in that pass through the chord in force: the Root under I–IV–V in C is C in pass 1, F in pass 2 and G in pass 3', () => {
    let p = pattern([[0, 0, 0]], { melodic: true });
    p = setProgression(p, 'I-IV-V');
    const score = buildScore(p);
    expect(score.passes).toHaveLength(3);
    const roots = score.passes.map((pass) => pass.measures[0].beats[0].items[0]);
    expect(roots.map((n) => n.name.text)).toEqual(['C4', 'F4', 'G4']);
    expect(roots.map((n) => n.step)).toEqual([staffStep('C', 4), staffStep('F', 4), staffStep('G', 4)]);
  });

  it('AC-12.2.5/6 — Under an arpeggio, every sounding Slot is written at the step it is dealt in that pass, so the score is the melody the Pattern plays', () => {
    let p = pattern([[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]], { melodic: true });
    p = setProgression(p, 'I-IV-V');
    p = setArpeggio(p, 'up');
    const score = buildScore(p);
    for (const pass of score.passes) {
      const deal = arpeggioDeal(p, pass.index);
      const chord = chordIn(p, pass.index, 0);
      pass.measures[0].beats.forEach((b, bi) => {
        const slot = p.measures[0].beats[bi].slots[0];
        const sounding = soundingPitch(slot, deal, 0, bi, 0);
        const expected = stepName(sounding.step, chord, p.key, p, sounding.octaveOffset);
        expect(b.items[0].name.text).toBe(expected.text);
        expect(b.items[0].step).toBe(staffStep(expected.letter, expected.octave));
      });
    }
    // Pass 1 under C ascending through the triad's three roles, then round again.
    expect(score.passes[0].measures[0].beats.map((b) => b.items[0].name.text)).toEqual(['C4', 'E4', 'G4', 'C4']);
  });

  it('AC-12.2.5/7 — A note below the middle line has its stem up and a note on or above it has its stem down; a beamed group takes the direction of its note farthest from the middle line: the direction rule', () => {
    expect(stemDirection([0])).toBe('up');
    expect(stemDirection([3])).toBe('up');
    expect(stemDirection([4])).toBe('down');
    expect(stemDirection([8])).toBe('down');
    expect(stemDirection([2, 7])).toBe('down'); // 7 is farther from 4 than 2 is
    expect(stemDirection([0, 6])).toBe('up');
    expect(stemDirection([10], 'single')).toBe('up');
  });

  it("every written note's sounding pitch is the timeline's for the same Slot and pass", () => {
    let p = pattern([[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [1, 0, 0], [1, 2, 0]], { measures: 2, melodic: true });
    p = { ...p, key: 'Db' };
    p = setPitch(p, 0, 1, 0, { degree: 'b7', octaveOffset: -1 });
    p = setPitch(p, 0, 2, 0, { degree: '#4', octaveOffset: 0 });
    p = setProgression(p, 'ii-V-I');
    p = setChange(p, 'measure');
    p = setArpeggio(p, 'up');
    const score = buildScore(p);
    expect(score.passes).toHaveLength(cyclePasses(p));
    for (const pass of score.passes) {
      const events = new Map(buildTimeline(p, pass.index).map((e) => [`${e.measureIndex}:${e.beatIndex}:${e.slotIndex}`, e]));
      for (const m of pass.measures) for (const b of m.beats) for (const it of b.items) {
        if (it.kind !== 'note' || it.continuation) continue;
        const event = events.get(`${m.measureIndex}:${b.beatIndex}:${it.slotIndex}`);
        expect(event.pitch.midiNote).toBe(it.midiNote);
        // The spelled name is that MIDI note: letter + accidental + octave.
        const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[it.name.letter] + { '': 0, '#': 1, b: -1, '##': 2, bb: -2 }[it.name.accidental];
        expect((it.name.octave + 1) * 12 + semis).toBe(event.pitch.midiNote);
      }
    }
  });
});

describe('core/notation — accents and the count (AC-12.2.6, AC-12.2.7)', () => {
  it('AC-12.2.6 — A Strong accent is written as an accent mark', () => {
    // Default accents in 4/4 with every Beat's first Slot on: only Beat 1 is Strong.
    let p = pattern([[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [1, 0, 0], [1, 1, 0]], { measures: 2 });
    let marks = notesOf(buildScore(p)).map((n) => n.accent);
    expect(marks).toEqual([true, false, false, false, true, false]);
    // An override to Strong on Beat 3 shows exactly there; Medium and Weak show nothing.
    p = { ...p };
    p.measures[0].beats[2].slots[0] = { on: true, accent: STRONG };
    p.measures[0].beats[1].slots[0] = { on: true, accent: MEDIUM };
    p.measures[1].beats[0].slots[0] = { on: true, accent: WEAK };
    marks = notesOf(buildScore(p)).map((n) => n.accent);
    expect(marks).toEqual([true, false, true, false, false, false]);
  });

  it("AC-12.2.7/1 — Every Slot position is labelled, in the active counting system's vocabulary for that Recipe, exactly as the grid labels it", () => {
    let p = pattern([[0, 0, 0]]);
    p = setRecipe(p, 0, 1, 'triplet-8ths');
    p = setRecipe(p, 0, 2, 'straight-8ths');
    for (const system of ['takadimi', 'one-e-and-a', 'numbered']) {
      const score = buildScore(p, { countingSystem: system });
      expect(score.system).toBe(system);
      p.measures[0].beats.forEach((beat, b) => {
        expect(beatOf(score, b).labels.map((l) => l.text)).toEqual(labelsFor(beat.recipe, 'quarter', system, b));
        expect(beatOf(score, b).labels.map((l) => l.slotIndex)).toEqual(beat.slots.map((_, i) => i));
      });
    }
    expect(beatOf(buildScore(p, { countingSystem: 'one-e-and-a' }), 1).labels.map((l) => l.text)).toEqual(['2', 'trip', 'let']);
  });

  it("AC-12.2.7/2 — A sounding Slot's label is written plainly; the label of an off Slot, or of one absorbed into a held note, is written in parentheses, so the count is complete and the attacks stand out", () => {
    // on–off–off–on: the held note absorbs Slots 2 and 3, which read as not sounding.
    const p = pattern([[0, 0, 0], [0, 0, 3]]);
    const labels = beatOf(buildScore(p), 0).labels;
    expect(labels.map((l) => l.sounding)).toEqual([true, false, false, true]);
    expect(labels.map((l) => l.text)).toEqual(['ta', 'ka', 'di', 'mi']);
  });

  it('AC-12.2.7/3 — A Pattern containing a mixed Recipe is labelled Numbered whatever the preference, as the grid is, and the preference is not changed by it', () => {
    const p = setRecipe(pattern([[0, 0, 0]]), 0, 3, 'straight-triplet-split');
    const options = { countingSystem: 'takadimi' };
    const score = buildScore(p, options);
    expect(score.system).toBe('numbered');
    expect(beatOf(score, 0).labels.map((l) => l.text)).toEqual(['1', '2', '3', '4']);
    expect(beatOf(score, 3).labels.map((l) => l.text)).toEqual(['1', '2', '3', '4', '5']);
    expect(options.countingSystem).toBe('takadimi');
  });
});

describe('core/notation — a progression written out (AC-12.2.8)', () => {
  it('AC-12.2.8/1 — The score holds as many passes as the MIDI file does, each beginning a new line, labelled "Pass 1", "Pass 2", … at its left when there is more than one', () => {
    let p = pattern([[0, 0, 0]], { melodic: true });
    p = setProgression(p, 'I-IV-V');
    const score = buildScore(p);
    expect(score.passCount).toBe(cyclePasses(p));
    expect(score.passes.map((x) => x.label)).toEqual(['Pass 1', 'Pass 2', 'Pass 3']);
    expect(score.passes.map((x) => x.index)).toEqual([0, 1, 2]);

    let blues = pattern([[0, 0, 0]], { measures: 8, melodic: true });
    blues = setProgression(blues, 'twelve-bar-blues');
    blues = setChange(blues, 'measure');
    expect(buildScore(blues).passes).toHaveLength(cyclePasses(blues));
    expect(cyclePasses(blues)).toBe(3);
  });

  it('AC-12.2.8/2 — The chord in force is named above the first note of Measure 1 of every pass and above the first note of every Measure where it changes, by the name the chord strip gives it; under a progression changing every Measure that is every Measure, and under one changing every pass it is Measure 1 alone', () => {
    let p = pattern([[0, 0, 0], [1, 0, 0]], { measures: 2, melodic: true });
    p = setProgression(p, 'I-IV-V');
    const byPass = buildScore(p);
    expect(byPass.passes.map((x) => x.measures.map((m) => m.chordLabel))).toEqual([
      ['C', null], ['F', null], ['G', null],
    ]);
    const byMeasure = buildScore(setChange(p, 'measure'));
    expect(byMeasure.passes.map((x) => x.measures.map((m) => m.chordLabel))).toEqual([
      ['C', 'F'], ['G', 'C'], ['F', 'G'],
    ]);
    // A chord that stays in force across a bar line is not named again.
    let same = pattern([[0, 0, 0], [1, 0, 0]], { measures: 2, melodic: true });
    same = setProgression(same, 'I-IV');
    same = { ...same, harmony: { ...same.harmony, chords: [same.harmony.chords[0], same.harmony.chords[0], same.harmony.chords[1]] } };
    same = setChange(same, 'measure');
    expect(buildScore(same).passes[0].measures.map((m) => m.chordLabel)).toEqual(['C', null]);
    // Names as the chord strip writes them, with a proper flat.
    let flat = pattern([[0, 0, 0]], { melodic: true });
    flat = { ...flat, key: 'Eb' };
    flat = setProgression(flat, 'ii-V-I');
    expect(buildScore(flat).passes.map((x) => x.measures[0].chordLabel)).toEqual(['Fm7', 'B♭7', 'E♭maj7']);
  });

  it('AC-12.2.8/3 — A Pattern without a progression is one pass, with no pass label and no chord names', () => {
    const score = buildScore(pattern([[0, 0, 0]], { melodic: true }));
    expect(score.passes).toHaveLength(1);
    expect(score.passes[0].label).toBeNull();
    expect(score.passes[0].measures.map((m) => m.chordLabel)).toEqual([null]);
    expect(buildScore(pattern([[0, 0, 0]])).passes[0].label).toBeNull();
  });
});

describe('core/notation — the item at the transport position (AC-12.2.9)', () => {
  it('finds the note whose span holds the Slot, in the pass being played', () => {
    let p = pattern([[0, 0, 0], [0, 1, 0]], { melodic: true });
    p = setProgression(p, 'I-IV-V');
    const score = buildScore(p);
    expect(itemAt(score, { loop: 0, measureIndex: 0, beatIndex: 0, slotIndex: 0 })).toMatchObject({ pass: 0, slotIndex: 0, span: 4 });
    // Pass 4 of a three-pass cycle is pass 1 again.
    expect(itemAt(score, { loop: 4, measureIndex: 0, beatIndex: 1, slotIndex: 0 })).toMatchObject({ pass: 1, beatIndex: 1 });
    expect(itemAt(score, null)).toBeNull();
  });
});
