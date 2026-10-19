import { describe, it, expect } from 'vitest';
import { renderScore } from '../../../src/ui/score.js';
import { buildScore } from '../../../src/core/notation.js';
import { create, addMeasure, setTimeSignature, setRecipe, cycleAccent, setPitch, setSwingAmount } from '../../../src/core/pattern.js';
import { setProgression as chooseProgression, setVoicing, setChange, setArpeggio, withArpeggio } from '../../../src/core/harmony.js';

/*
 * A progression chosen is voiced Closest (AC-2.11.3/7). The criteria proved
 * here are written for chords over their roots, so each test puts the voicing
 * at Root position first; the default itself is proved under US-2.11.
 */
const setProgression = (p, id) => setVoicing(chooseProgression(p, id), 'root');
import { measureLabels } from '../../../src/core/counting.js';
import { STRONG, MEDIUM } from '../../../src/core/accents.js';

/**
 * US-12.2 — what the score view draws, read back from its markup. `renderScore`
 * writes the score as SVG into its root, so a root that only remembers its
 * innerHTML is enough to see every notehead, rest, beam, dot, tie, tuplet
 * numeral, accidental, accent mark, label and chord name the musician sees.
 */

/** A 4/4 Pattern with the given Slots on: [measure, beat, slot]. */
function pattern(ons, { measures = 1, melodic = false } = {}) {
  let p = create('Drawn');
  for (let i = 1; i < measures; i++) p = addMeasure(p);
  if (melodic) p = { ...p, soundMode: 'melodic', key: 'C' };
  for (const [m, b, s] of ons) {
    p = cycleAccent(p, m, b, s);
    if (melodic) p = setPitch(p, m, b, s, { degree: '1', octaveOffset: 0 });
  }
  return p;
}

/** Draw a Pattern at a wide width, so a short Pattern sits on one line. */
function draw(p, options = {}, width = 3000) {
  const root = { innerHTML: '' };
  renderScore(root, buildScore(p, options), { width });
  return root.innerHTML;
}

/** Every opening tag whose class holds `cls`, as its attributes. */
function tags(markup, cls) {
  const out = [];
  const re = /<(\w+)([^>]*)>/g;
  let m;
  while ((m = re.exec(markup))) {
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    if ((attrs.class ?? '').split(' ').includes(cls)) out.push({ tag: m[1], ...attrs, at: m.index });
  }
  return out;
}

/** The text of every <text> whose class holds `cls`, in order. */
function texts(markup, cls) {
  const re = /<text class="([^"]*)"[^>]*>([^<]*)<\/text>/g;
  const out = [];
  let m;
  const unescape = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  while ((m = re.exec(markup))) if (m[1].split(' ').includes(cls)) out.push(unescape(m[2]));
  return out;
}

/** Every item group with its own inner markup (its accidental, dot, tie, stem, flag, ledger lines, accent). */
function items(markup) {
  const out = [];
  const re = /<g class="item ([^"]*)"([^>]*)>/g;
  let m;
  while ((m = re.exec(markup))) {
    // Walk to the matching </g>, counting nested groups.
    let depth = 1;
    let i = m.index + m[0].length;
    while (depth > 0) {
      const open = markup.indexOf('<g', i);
      const close = markup.indexOf('</g>', i);
      if (open !== -1 && open < close) {
        depth += 1;
        i = open + 2;
      } else {
        depth -= 1;
        i = close + 4;
      }
    }
    const inner = markup.slice(m.index + m[0].length, i - 4);
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    out.push({ kind: m[1].includes('note-item') ? 'note' : 'rest', classes: m[1], ...attrs, inner, at: m.index });
  }
  return out;
}

const head = (markup, cls) => {
  const m = new RegExp(`<[^>]*class="${cls}"[^>]*>([^<]*)<`).exec(markup);
  return m ? m[1] : null;
};

const values = (markup) => items(markup).map((i) => `${i.kind[0]}:${i['data-value']}${i['data-tuplet'] ? '/3' : ''}`);
const cx = (item) => Number(/<ellipse class="notehead" cx="([\d.]+)"/.exec(item.inner)[1]);
/** Where a note or rest is drawn: a notehead's centre, or a rest glyph's origin. */
const ix = (item) => (item.kind === 'note' ? cx(item) : Number(/translate\(([\d.]+) /.exec(item.inner)[1]));

describe('ui/score — the head as drawn (AC-12.2.2)', () => {
  it("AC-12.2.2/2 — The tempo mark is ♩ = tempo when the Pattern's tempo unit is a quarter note and ♪ = tempo when it is an eighth note, since the unit is what the tempo counts (AC-4.2.7): as drawn", () => {
    const quarter = { ...pattern([[0, 0, 0]]), tempo: 96 };
    expect(head(draw(quarter), 'score-tempo')).toBe('♩ = 96');
    const eighth = { ...setTimeSignature(quarter, 0, '6/8'), tempo: 132 };
    expect(head(draw(eighth), 'score-tempo')).toBe('♪ = 132');
    expect(head(draw({ ...quarter, tempoUnit: 'eighth' }), 'score-tempo')).toBe('♪ = 96');
    expect(head(draw({ ...eighth, tempoUnit: 'quarter' }), 'score-tempo')).toBe('♩ = 132');
  });

  it('AC-12.2.2/3 — The Time Signature is written at the start of the first Measure and again at the start of any Measure whose meter differs from the one before, never on a Measure that repeats it: as drawn', () => {
    let p = pattern([], { measures: 5 });
    p = setTimeSignature(p, 2, '3/4');
    p = setTimeSignature(p, 3, '3/4');
    p = setTimeSignature(p, 4, '6/8');
    // Measures 1, 3 and 5 carry a meter: 4/4, 3/4, 6/8. Measures 2 and 4 none.
    expect(texts(draw(p), 'meter')).toEqual(['4', '4', '3', '4', '6', '8']);
  });

  it("AC-12.2.2/4 — A Melodic Pattern's head says its Key and scale by name, E♭ Aeolian (Natural Minor); a Percussive Pattern's head says neither: as drawn", () => {
    const melodic = { ...pattern([[0, 0, 0]], { melodic: true }), key: 'Eb', scale: 'aeolian' };
    expect(head(draw(melodic), 'score-key')).toBe('E♭ Aeolian (Natural Minor)');
    expect(draw(pattern([[0, 0, 0]]))).not.toContain('score-key');
  });

  it('AC-12.2.2/5 — When any swing amount is above zero the head says "Swing" beneath the tempo mark, and the notes are still written straight, as swing is a feel and not a rhythm: as drawn', () => {
    const straight = pattern([[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 2]]);
    const swung = setSwingAmount(straight, 40);
    expect(head(draw(straight), 'score-swing')).toBeNull();
    expect(head(draw(swung), 'score-swing')).toBe('Swing');
    // The same notes at the same places.
    const drawn = (p) => items(draw(p)).map((i) => [i['data-value'], i.inner.match(/cx="[\d.]+"/)?.[0]]);
    expect(drawn(swung)).toEqual(drawn(straight));
  });
});

describe('ui/score — every Slot at its exact time and value, as drawn (AC-12.2.4)', () => {
  const beatPattern = (recipe, on, timeSignature = '4/4') => {
    let p = create('Beat');
    if (timeSignature !== '4/4') p = setTimeSignature(p, 0, timeSignature);
    p = setRecipe(p, 0, 0, recipe);
    on.forEach((x, s) => {
      if (x) p = cycleAccent(p, 0, 0, s);
    });
    return p;
  };
  const beat1 = (markup) => items(markup).filter((i) => i['data-beat'] === '0');

  it('AC-12.2.4/1 — A Beat occupies a quarter note in a /4 Measure and an eighth note in a /8 Measure, and its Recipe divides it as written: Straight 8ths into two eighths, Straight 16ths into four sixteenths, Triplet 8ths into three eighths under a 3, Undivided into one eighth, and Straight 16ths on an eighth-note Beat into two sixteenths: as drawn', () => {
    const v = (recipe, on, ts) => beat1(draw(beatPattern(recipe, on, ts))).map((i) => `${i['data-value']}${i['data-tuplet'] ? '/3' : ''}`);
    expect(v('straight-8ths', [1, 1])).toEqual(['eighth', 'eighth']);
    expect(v('straight-16ths', [1, 1, 1, 1])).toEqual(['sixteenth', 'sixteenth', 'sixteenth', 'sixteenth']);
    expect(v('triplet-8ths', [1, 1, 1])).toEqual(['eighth/3', 'eighth/3', 'eighth/3']);
    expect(texts(draw(beatPattern('triplet-8ths', [1, 1, 1])), 'tuplet')).toEqual(['3']);
    expect(v('undivided', [1], '6/8')).toEqual(['eighth']);
    expect(v('straight-16ths', [1, 1], '6/8')).toEqual(['sixteenth', 'sixteenth']);
    // A quarter-note Beat's four sixteenths span the same width as a full eighth-note Beat's two — twice an eighth Beat.
    const q = beat1(draw(beatPattern('straight-16ths', [1, 1, 1, 1])));
    const e = beat1(draw(beatPattern('straight-16ths', [1, 1], '6/8')));
    expect(cx(q[1]) - cx(q[0])).toBeCloseTo(cx(e[1]) - cx(e[0]), 5);
  });

  it('AC-12.2.4/2 — A mixed Recipe is written as its two halves: two sixteenths and three sixteenths under a 3, in the order the Recipe names: as drawn', () => {
    expect(values(draw(beatPattern('straight-triplet-split', [1, 1, 1, 1, 1]))).slice(0, 5)).toEqual([
      'n:sixteenth', 'n:sixteenth', 'n:sixteenth/3', 'n:sixteenth/3', 'n:sixteenth/3',
    ]);
    expect(values(draw(beatPattern('triplet-straight-split', [1, 1, 1, 1, 1]))).slice(0, 5)).toEqual([
      'n:sixteenth/3', 'n:sixteenth/3', 'n:sixteenth/3', 'n:sixteenth', 'n:sixteenth',
    ]);
  });

  it("AC-12.2.4/3 — A sounding Slot's value runs to the next sounding Slot in the Beat or the Beat's end: the first Slot alone of Straight 8ths is a quarter note; Straight 16ths on–off–off–on is a dotted eighth then a sixteenth; Triplet 8ths on–off–on is a quarter then an eighth under the 3: as drawn", () => {
    const lone = beat1(draw(beatPattern('straight-8ths', [1, 0])));
    expect(lone.map((i) => i['data-value'])).toEqual(['quarter']);
    expect(lone[0].inner).not.toContain('class="flag"');
    expect(lone[0].inner).not.toContain('class="dot"');

    const dotted = beat1(draw(beatPattern('straight-16ths', [1, 0, 0, 1])));
    expect(dotted.map((i) => i['data-value'])).toEqual(['eighth.', 'sixteenth']);
    expect(dotted[0].inner).toContain('class="dot"');
    expect(dotted[1].inner).not.toContain('class="dot"');

    const trip = draw(beatPattern('triplet-8ths', [1, 0, 1]));
    expect(beat1(trip).map((i) => `${i['data-value']}/${i['data-tuplet']}`)).toEqual(['quarter/3', 'eighth/3']);
    expect(texts(trip, 'tuplet')).toEqual(['3']);
    expect(tags(trip, 'tuplet-bracket')).toHaveLength(1); // not one beamed group, so bracketed
  });

  it("AC-12.2.4/4 — A value that would cross the boundary between a mixed Recipe's two halves is written as two notes tied together, one in each half, never as one note spanning a tuplet boundary: as drawn", () => {
    const tied = beat1(draw(beatPattern('straight-triplet-split', [1, 0, 0, 0, 0])));
    expect(tied.map((i) => i['data-value'])).toEqual(['eighth', 'eighth']);
    expect(tied[0]['data-tie']).toBe('true');
    expect(tied[0].inner).toContain('class="tie"');
    expect(tied[1].inner).not.toContain('class="tie"');
    // The tie reaches from the first notehead to the second.
    const tie = /class="tie" d="M ([\d.]+) [\d.]+ Q [\d.]+ [\d.]+ ([\d.]+)/.exec(tied[0].inner);
    expect(Number(tie[1])).toBeGreaterThan(cx(tied[0]));
    expect(Number(tie[2])).toBeLessThan(cx(tied[1]));
  });

  it('AC-12.2.4/5 — Off Slots before the first sounding Slot are rests written largest first and never dotted: three leading sixteenths are an eighth rest then a sixteenth rest; a leading triplet eighth is an eighth rest under the 3: as drawn', () => {
    const rests = beat1(draw(beatPattern('straight-16ths', [0, 0, 0, 1])));
    expect(rests.map((i) => `${i.kind}:${i['data-value']}`)).toEqual(['rest:eighth', 'rest:sixteenth', 'note:sixteenth']);
    // An eighth rest has one hook, a sixteenth rest two.
    expect((rests[0].inner.match(/<circle/g) ?? []).length).toBe(1);
    expect((rests[1].inner.match(/<circle/g) ?? []).length).toBe(2);
    for (const r of rests) expect(r.inner).not.toContain('class="dot"');

    const trip = beat1(draw(beatPattern('triplet-8ths', [0, 1, 1])));
    expect(trip.map((i) => `${i.kind}:${i['data-value']}/${i['data-tuplet']}`)).toEqual(['rest:eighth/3', 'note:eighth/3', 'note:eighth/3']);
  });

  it("AC-12.2.4/6 — A Beat with no sounding Slot is one rest of the Beat's value, and a Measure with no sounding Slot is a single whole-measure rest: as drawn", () => {
    // Beat 1 silent, Beat 2 sounding, so the Measure itself is not empty.
    const one = beat1(draw(cycleAccent(beatPattern('straight-16ths', [0, 0, 0, 0]), 0, 1, 0)));
    expect(one.map((i) => `${i.kind}:${i['data-value']}`)).toEqual(['rest:quarter']);
    expect(one[0].inner).toContain('class="rest"');

    const empty = draw(pattern([[1, 0, 0]], { measures: 2 }));
    // Measure 1: no items, one whole rest; Measure 2: its note.
    expect(items(empty).filter((i) => i['data-measure'] === '0')).toHaveLength(0);
    expect(tags(empty, 'rest').filter((t) => t.tag === 'rect')).toHaveLength(1);
    expect(items(empty).filter((i) => i['data-measure'] === '1' && i.kind === 'note')).toHaveLength(1);
  });

  it('AC-12.2.4/7 — The notes of one Beat shorter than a quarter are beamed together, a rest breaks the beam, and a tuplet carries its 3 above or below the group: as drawn', () => {
    // Four sixteenths: one primary beam and a secondary between each neighbouring pair.
    const four = draw(beatPattern('straight-16ths', [1, 1, 1, 1]));
    expect(tags(four, 'beam')).toHaveLength(4);
    expect(items(four).every((i) => !i.inner.includes('class="flag"'))).toBe(true);
    // A leading rest is outside the beam: an eighth rest, then two sixteenths beamed from the first note on.
    const broken = draw(beatPattern('straight-16ths', [0, 0, 1, 1]));
    const beams = tags(broken, 'beam');
    expect(beams).toHaveLength(2);
    const firstNote = cx(items(broken).find((i) => i.kind === 'note'));
    for (const b of beams) expect(Number(b.x)).toBeGreaterThan(firstNote - 10);
    // A note on its own after a rest is flagged, not beamed: a sixteenth carries two flags.
    const alone = draw(beatPattern('straight-16ths', [0, 0, 0, 1]));
    expect(tags(alone, 'beam')).toHaveLength(0);
    const lone = items(alone).find((i) => i.kind === 'note');
    expect((lone.inner.match(/class="flag"/g) ?? []).length).toBe(2);
    // The tuplet numeral sits with its group.
    const trip = draw(beatPattern('triplet-8ths', [1, 1, 1]));
    expect(texts(trip, 'tuplet')).toEqual(['3']);
    const numeral = tags(trip, 'tuplet')[0];
    const heads = beat1(trip).map(cx);
    expect(Number(numeral.x)).toBeGreaterThan(heads[0]);
    expect(Number(numeral.x)).toBeLessThan(heads[2] + 20);
  });

  it('AC-12.2.4/8 — Within a Measure, horizontal position is proportional to time: the three notes of a triplet are equally spaced, a sixteenth sits a quarter of the way through its Beat, and the two halves of a mixed Beat are the same width: as drawn', () => {
    const trip = beat1(draw(beatPattern('triplet-8ths', [1, 1, 1]))).map(cx);
    expect(trip[1] - trip[0]).toBeCloseTo(trip[2] - trip[1], 3);

    // Beat 1 all sixteenths, Beat 2 starts with a note: the second sixteenth is a quarter of the Beat in.
    const p = pattern([[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3], [0, 1, 0]]);
    const all = items(draw(p));
    const b1 = all.filter((i) => i['data-beat'] === '0').map(cx);
    const b2 = all.find((i) => i['data-beat'] === '1');
    expect(b1[1] - b1[0]).toBeCloseTo((cx(b2) - b1[0]) / 4, 3);

    // A mixed Beat: the triplet half starts exactly halfway.
    let q = setRecipe(pattern([]), 0, 0, 'straight-triplet-split');
    for (const s of [0, 2]) q = cycleAccent(q, 0, 0, s);
    q = cycleAccent(q, 0, 1, 0);
    const mixed = items(draw(q));
    const first = cx(mixed.find((i) => i['data-slot'] === '0' && i['data-beat'] === '0'));
    const half = cx(mixed.find((i) => i['data-slot'] === '2' && i['data-beat'] === '0'));
    const next = cx(mixed.find((i) => i['data-beat'] === '1'));
    expect(half - first).toBeCloseTo(next - half, 3);
  });

  it("AC-12.2.4/9 — Measures are written in order with a bar line between each and a final bar line after the last, and a Measure's notes and rests always total its meter exactly: as drawn", () => {
    let p = pattern([[0, 0, 0], [1, 1, 0], [2, 3, 0]], { measures: 3 });
    p = setTimeSignature(p, 1, '3/4');
    p = cycleAccent(p, 1, 1, 0);
    const markup = draw(p);
    const bars = tags(markup, 'barline');
    // Three bar lines, the last of them the final one (a thin line and a thick rect).
    expect(bars.filter((b) => b.tag === 'line')).toHaveLength(3);
    expect(bars.filter((b) => b.tag === 'rect')).toHaveLength(1);
    // Measures left to right, each entirely before its bar line.
    const lineXs = bars.filter((b) => b.tag === 'line').map((b) => Number(b.x1));
    const perMeasure = [0, 1, 2].map((m) => items(markup).filter((i) => i['data-measure'] === String(m)).map(ix));
    expect(Math.max(...perMeasure[0])).toBeLessThan(lineXs[0]);
    expect(Math.min(...perMeasure[1])).toBeGreaterThan(lineXs[0]);
    expect(Math.max(...perMeasure[1])).toBeLessThan(lineXs[1]);
    expect(Math.min(...perMeasure[2])).toBeGreaterThan(lineXs[1]);
    // Every Measure's items are drawn: 4 + 3 + 4 Beats' worth, nothing missing or extra.
    expect(perMeasure.map((m) => m.length)).toEqual([4, 3, 4]);
  });
});

describe('ui/score — the treble staff, as drawn (AC-12.2.5, AC-12.2.6)', () => {
  it("AC-12.2.5/1 — The key signature is the one whose notes are the scale's: C Ionian none, C Aeolian three flats, D Dorian none, E♭ Ionian three flats, D Lydian three sharps; a pentatonic, blues or minor scale takes the parallel Ionian's, or Aeolian's when the scale has ♭3 and no 3, as the chords are spelled; a mode whose signature would need more than seven accidentals takes the Key's Ionian signature instead: as drawn", () => {
    const sig = (key, scale) => {
      const g = tags(draw({ ...pattern([[0, 0, 0]], { melodic: true }), key, scale }), 'key-signature')[0];
      return g ? `${g['data-count']}${g['data-accidental']}` : 'none';
    };
    expect(sig('C', 'ionian')).toBe('none');
    expect(sig('C', 'aeolian')).toBe('-3b');
    expect(sig('D', 'dorian')).toBe('none');
    expect(sig('Eb', 'ionian')).toBe('-3b');
    expect(sig('D', 'lydian')).toBe('3#');
    expect(sig('C', 'minor-pentatonic')).toBe('-3b');
    expect(sig('C', 'major-blues')).toBe('none');
    expect(sig('Db', 'locrian')).toBe('-5b');
    // Three flats drawn, at three different heights.
    const markup = draw({ ...pattern([[0, 0, 0]], { melodic: true }), key: 'Eb' });
    const ks = tags(markup, 'key-signature')[0];
    const rest = markup.slice(ks.at, markup.indexOf('<text class="meter"', ks.at));
    const ys = [...rest.matchAll(/translate\([\d.]+ ([\d.]+)\)/g)].map((m) => m[1]);
    expect(new Set(ys).size).toBe(3);
  });

  it("AC-12.2.5/3 — A note's spelling is the pitch strip's: ♭3 in C is E♭, never D♯; 3 in D♭ is F and ♭3 in D♭ is F♭, so every degree keeps its own letter: as drawn", () => {
    let p = pattern([[0, 0, 0]], { melodic: true });
    p = setPitch(p, 0, 0, 0, { degree: 'b3', octaveOffset: 0 });
    let note = items(draw(p))[0];
    expect(note['data-step']).toBe('0'); // E4's line, flattened — not D's space
    expect(note['data-accidental']).toBe('flat');
    expect(note.inner).toContain('class="accidental"');

    p = { ...p, key: 'Db' };
    p = setPitch(p, 0, 0, 0, { degree: '3', octaveOffset: 0 });
    note = items(draw(p))[0];
    expect(note['data-step']).toBe('1'); // F4
    expect(note['data-accidental']).toBeUndefined();
    p = setPitch(p, 0, 0, 0, { degree: 'b3', octaveOffset: 0 });
    note = items(draw(p))[0];
    expect(note['data-step']).toBe('1'); // still F's space
    expect(note['data-accidental']).toBe('flat');
  });

  it('AC-12.2.5/4 — An accidental is written before a note when its letter is not already at that alteration — by the key signature or by an earlier accidental in the same Measure on the same letter and octave — and a natural is written when the note undoes one; an accidental holds to the end of its Measure and no further: as drawn', () => {
    let p = pattern([[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [1, 0, 0]], { measures: 2, melodic: true });
    p = setPitch(p, 0, 0, 0, { degree: 'b3', octaveOffset: 0 });
    p = setPitch(p, 0, 1, 0, { degree: 'b3', octaveOffset: 0 });
    p = setPitch(p, 0, 2, 0, { degree: '3', octaveOffset: 0 });
    p = setPitch(p, 0, 3, 0, { degree: '3', octaveOffset: 0 });
    p = setPitch(p, 1, 0, 0, { degree: 'b3', octaveOffset: 0 });
    const notes = items(draw(p)).filter((i) => i.kind === 'note');
    expect(notes.map((n) => n['data-accidental'] ?? '-')).toEqual(['flat', '-', 'natural', '-', 'flat']);
    // The accidental is drawn to the left of its notehead.
    for (const n of notes.filter((x) => x['data-accidental'])) {
      const ax = Number(/class="accidental" transform="translate\(([\d.]+)/.exec(n.inner)[1]);
      expect(ax).toBeLessThan(cx(n));
    }
  });

  it('AC-12.2.5/4 — An accidental is written before a note when its letter is not already at that alteration — by the key signature or by an earlier accidental in the same Measure on the same letter and octave — and a natural is written when the note undoes one; an accidental holds to the end of its Measure and no further: a flat\'s bowl is drawn hollow, as written by hand, inline and in the key signature', () => {
    // A filled shape with no hole inside it is a solid bowl. Each flat's bowl must be
    // a stroked outline, or a filled crescent with its inside cut out (evenodd, two contours).
    const hollow = (glyph) => {
      const filled = [...glyph.matchAll(/<path([^>]*)\/>/g)].map((m) => m[1]).filter((a) => !/fill="none"/.test(a));
      return filled.every((a) => /fill-rule="evenodd"/.test(a) && (/d="([^"]*)"/.exec(a)[1].match(/[Mm]/g) ?? []).length >= 2);
    };
    const flats = (markup) => markup.match(/<g class="accidental"[^>]*>(?:(?!<\/g>).)*<\/g>/g).filter((g) => !/stroke-width="0.3"|stroke-width="0.28"|stroke-width="0.26"/.test(g));
    let p = pattern([[0, 0, 0]], { melodic: true });
    p = setPitch(p, 0, 0, 0, { degree: 'b3', octaveOffset: 0 });
    const inline = items(draw(p))[0].inner;
    expect(flats(inline)).toHaveLength(1);
    expect(hollow(flats(inline)[0])).toBe(true);
    const ks = draw({ ...pattern([[0, 0, 0]], { melodic: true }), key: 'Eb' });
    const sig = ks.slice(tags(ks, 'key-signature')[0].at, ks.indexOf('<text class="meter"'));
    expect(flats(sig)).toHaveLength(3);
    for (const g of flats(sig)) expect(hollow(g)).toBe(true);
  });

  it('AC-12.2.5/5 — A chord-tone Pitch is written at the note it sounds in that pass through the chord in force: the Root under I–IV–V in C is C in pass 1, F in pass 2 and G in pass 3: as drawn', () => {
    let p = pattern([[0, 0, 0]], { melodic: true });
    p = setProgression(p, 'I-IV-V');
    // Stamped directly — see the note in notation.test.js (AC-2.6.1/7).
    p = setPitch(p, 0, 0, 0, { tone: 1, octaveOffset: 0 });
    const markup = draw(p);
    const roots = items(markup).filter((i) => i.kind === 'note');
    expect(roots.map((n) => n['data-pass'])).toEqual(['0', '1', '2']);
    expect(roots.map((n) => n['data-step'])).toEqual(['-2', '1', '2']); // C4, F4, G4
    expect(texts(markup, 'chord-name')).toEqual(['C', 'F', 'G']);
  });

  it('AC-12.2.5/6 — Under an arpeggio, every sounding Slot is written at the step it is dealt in that pass, so the score is the melody the Pattern plays: as drawn', () => {
    let p = pattern([[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]], { melodic: true });
    p = setProgression(p, 'I-IV-V');
    p = setArpeggio(p, 'up');
    const notes = items(draw(p)).filter((i) => i.kind === 'note' && i['data-pass'] === '0');
    // C E G C ascending through the C triad.
    expect(notes.map((n) => n['data-step'])).toEqual(['-2', '0', '2', '-2']);
    const pass2 = items(draw(p)).filter((i) => i.kind === 'note' && i['data-pass'] === '1');
    // F A C F under the IV.
    expect(pass2.map((n) => n['data-step'])).toEqual(['1', '3', '5', '1']);
  });

  it('AC-12.2.6 — A Strong accent is written as an accent mark: as drawn', () => {
    let p = pattern([[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [1, 0, 0], [1, 1, 0]], { measures: 2 });
    const marks = (q) => items(draw(q)).filter((i) => i.kind === 'note').map((i) => i.inner.includes('class="accent"'));
    expect(marks(p)).toEqual([true, false, false, false, true, false]);
    p = structuredClone(p);
    p.measures[0].beats[2].slots[0] = { on: true, accent: STRONG };
    p.measures[0].beats[1].slots[0] = { on: true, accent: MEDIUM };
    expect(marks(p)).toEqual([true, false, true, false, true, false]);
    // The mark sits above its note.
    const strong = items(draw(p))[0];
    const markY = Number(/class="accent" d="M [\d.]+ ([\d.]+)/.exec(strong.inner)[1]);
    const headY = Number(/cy="([\d.]+)"/.exec(strong.inner)[1]);
    expect(markY).toBeLessThan(headY);
  });
});

describe('ui/score — the count and the progression, as drawn (AC-12.2.7, AC-12.2.8)', () => {
  it("AC-12.2.7/1 — Every Slot position is labelled, in the active counting system's vocabulary for that Recipe, exactly as the grid labels it: as drawn", () => {
    let p = pattern([[0, 0, 0]]);
    p = setRecipe(p, 0, 1, 'triplet-8ths');
    p = setRecipe(p, 0, 2, 'straight-8ths');
    for (const system of ['takadimi', 'one-e-and-a', 'numbered']) {
      const drawn = texts(draw(p, { countingSystem: system }), 'count').map((t) => t.replace(/[()]/g, ''));
      const expected = measureLabels(p.measures[0], system).flat();
      expect(drawn).toEqual(expected);
    }
  });

  it("AC-12.2.7/2 — A sounding Slot's label is written plainly; the label of an off Slot, or of one absorbed into a held note, is written in parentheses, so the count is complete and the attacks stand out: as drawn", () => {
    const markup = draw(pattern([[0, 0, 0], [0, 0, 3]]));
    expect(texts(markup, 'count').slice(0, 4)).toEqual(['ta', '(ka)', '(di)', 'mi']);
    const labels = tags(markup, 'count').slice(0, 4);
    expect(labels.map((l) => l.class.includes('muted'))).toEqual([false, true, true, false]);
    // Under the Slot's own time: the held note's absorbed labels sit between the two notes.
    const notes = items(markup).filter((i) => i['data-beat'] === '0').map(cx);
    const xs = labels.map((l) => Number(l.x));
    expect(xs[0]).toBeCloseTo(notes[0], 1);
    expect(xs[3]).toBeCloseTo(notes[1], 1);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBeLessThan(xs[3]);
  });

  it('AC-12.2.7/3 — A Pattern containing a mixed Recipe is labelled Numbered whatever the preference, as the grid is, and the preference is not changed by it: as drawn', () => {
    const p = setRecipe(pattern([[0, 0, 0]]), 0, 3, 'straight-triplet-split');
    const options = { countingSystem: 'takadimi' };
    expect(texts(draw(p, options), 'count').slice(0, 4)).toEqual(['1', '(2)', '(3)', '(4)']);
    expect(texts(draw(p, options), 'count').slice(-5)).toEqual(['(4)', '(2)', '(5)', '(2)', '(3)']);
    expect(options.countingSystem).toBe('takadimi');
  });

  it('AC-12.2.8/1 — The score holds as many passes as the MIDI file does, each beginning a new line, labelled "Pass 1", "Pass 2", … at its left when there is more than one: as drawn', () => {
    let p = pattern([[0, 0, 0], [1, 0, 0]], { measures: 2, melodic: true });
    p = setProgression(p, 'I-IV-V');
    const markup = draw(p);
    // Three passes, each on its own row under its own label, in order.
    const labels = [...markup.matchAll(/class="score-pass-label" data-pass="(\d)">([^<]*)</g)].map((m) => [m[1], m[2]]);
    expect(labels).toEqual([['0', 'Pass 1'], ['1', 'Pass 2'], ['2', 'Pass 3']]);
    const rows = [...markup.matchAll(/class="score-row" data-pass="(\d)" data-line="(\d)"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(rows).toEqual(['0:0', '1:0', '2:0']);
    // Each label precedes its pass's row, and every note of a pass sits in that pass's row.
    for (const pass of ['0', '1', '2']) {
      const label = markup.indexOf(`class="score-pass-label" data-pass="${pass}"`);
      const row = markup.indexOf(`class="score-row" data-pass="${pass}"`);
      const nextRow = markup.indexOf('class="score-row"', row + 1);
      expect(label).toBeLessThan(row);
      for (const it of items(markup).filter((i) => i['data-pass'] === pass)) {
        expect(it.at).toBeGreaterThan(row);
        if (nextRow !== -1) expect(it.at).toBeLessThan(nextRow);
      }
    }
  });

  it('AC-12.2.8/2 — The chord in force is named above the first note of Measure 1 of every pass and above the first note of every Measure where it changes, by the name the chord strip gives it; under a progression changing every Measure that is every Measure, and under one changing every pass it is Measure 1 alone: as drawn', () => {
    let p = pattern([[0, 0, 0], [1, 0, 0]], { measures: 2, melodic: true });
    p = setProgression(p, 'I-IV-V');
    expect(texts(draw(p), 'chord-name')).toEqual(['C', 'F', 'G']);
    const byMeasure = draw(setChange(p, 'measure'));
    expect(texts(byMeasure, 'chord-name')).toEqual(['C', 'F', 'G', 'C', 'F', 'G']);
    // Above the first note of its Measure: the name's x is at that note's notehead.
    const names = tags(byMeasure, 'chord-name');
    const firsts = items(byMeasure).filter((i) => i.kind === 'note');
    names.forEach((n, i) => expect(Number(n.x)).toBeCloseTo(cx(firsts[i]), 1));
    const staffTop = Number(tags(byMeasure, 'staff-line').find((l) => l['data-line'] === '4').y1);
    for (const n of names) expect(Number(n.y)).toBeLessThan(staffTop);
  });

  it('AC-12.2.8/3 — A Pattern without a progression is one pass, with no pass label and no chord names: as drawn', () => {
    const markup = draw(pattern([[0, 0, 0]], { melodic: true }));
    expect(texts(markup, 'chord-name')).toEqual([]);
    expect(markup).not.toContain('score-pass-label');
    expect((markup.match(/class="score-row"/g) ?? []).length).toBe(1);
    expect(items(markup).every((i) => i['data-pass'] === '0')).toBe(true);
  });
});

describe('ui/score — cycle mode, as drawn (AC-2.7.3)', () => {
  it("AC-2.7.3/1 — While cycle mode is on the score's head carries a Fill line naming the fill in force, and the notes are that fill's; Print / PDF prints the same score: as drawn", () => {
    let p = pattern([[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]], { melodic: true });
    p = setProgression(p, 'I-IV-V');
    // Off: no Fill line.
    expect(head(draw(p), 'score-fill')).toBeNull();
    // On, with Alberti in force: the head names it and the notes are Alberti's — Root, 5th, 3rd, 5th.
    const inForce = withArpeggio(p, 'alberti');
    const markup = draw(inForce, { fill: 'Alberti' });
    expect(head(markup, 'score-fill')).toBe('Fill: Alberti');
    const steps = items(markup).filter((i) => i.kind === 'note' && i['data-pass'] === '0').map((i) => i['data-step']);
    expect(steps).toEqual(['-2', '2', '0', '2']); // C4 G4 E4 G4
    // Ascending in force reads differently, so the score is the fill's, not the Pattern's.
    const up = draw(withArpeggio(p, 'up'), { fill: 'Ascending' });
    expect(head(up, 'score-fill')).toBe('Fill: Ascending');
    expect(items(up).filter((i) => i.kind === 'note' && i['data-pass'] === '0').map((i) => i['data-step'])).toEqual(['-2', '0', '2', '-2']);
  });
});

describe('ui/score — Note aids: names and degree colours (US-12.3)', () => {
  /** Draw with Note aids on. */
  const aided = (p, options = {}) => {
    const root = { innerHTML: '' };
    renderScore(root, buildScore(p, options), { width: 3000, aids: true });
    return root.innerHTML;
  };
  /** A melodic 4/4 Pattern in `key` with `stamps` as [measure, beat, slot, degree, octaveOffset]. */
  const melody = (stamps, { key = 'C', scale = null, measures = 1 } = {}) => {
    let p = pattern([], { measures, melodic: true });
    p = { ...p, key, ...(scale ? { scale } : {}) };
    for (const [m, b, s, degree, octaveOffset = 0] of stamps) {
      p = cycleAccent(p, m, b, s);
      p = setPitch(p, m, b, s, { degree, octaveOffset });
    }
    return p;
  };
  const names = (markup) => texts(markup, 'note-name');
  const nameY = (item) => Number(/<text class="note-name" x="[\d.]+" y="([\d.-]+)"/.exec(item.inner)[1]);
  const stemY2 = (item) => Number(/<line class="stem" x1="[\d.]+" x2="[\d.]+" y1="[\d.-]+" y2="([\d.-]+)"/.exec(item.inner)[1]);
  const accentY = (item) => Number(/<path class="accent" d="M [\d.]+ ([\d.-]+)/.exec(item.inner)[1]);
  const roleClass = (item) => item.classes.split(' ').find((c) => c.startsWith('role-')) ?? null;
  const outOfScale = (item) => item.classes.split(' ').includes('out-of-scale');
  const notes = (markup) => items(markup).filter((i) => i.kind === 'note');
  const cy = (item) => Number(/<ellipse class="notehead" cx="[\d.]+" cy="([\d.-]+)"/.exec(item.inner)[1]);

  it('AC-12.3.1/1 — A Note aids toggle sits with the Grid | Sheet toggle and Print / PDF, shown only while Sheet is showing a Melodic Pattern; it is hidden while Grid is showing and hidden for a Percussive Pattern: as drawn, a Percussive score takes no aids', () => {
    const markup = aided(pattern([[0, 0, 0], [0, 1, 0]]));
    expect(markup).not.toContain('note-name');
    expect(items(markup).every((i) => i['data-role'] === undefined && !roleClass(i))).toBe(true);
  });

  it("AC-12.3.1/3 — With Note aids off the score is written as it was before this story: every notehead in the staff's black and no note names", () => {
    const p = melody([[0, 0, 0, '1'], [0, 1, 0, 'b2'], [0, 2, 0, '5']]);
    const markup = draw(p);
    expect(markup).not.toContain('note-name');
    expect(markup).not.toContain('data-role');
    expect(items(markup).every((i) => !roleClass(i) && !outOfScale(i))).toBe(true);
    // The noteheads carry no fill of their own: the stylesheet's black is all there is.
    expect(markup).not.toMatch(/<ellipse class="notehead"[^>]*fill=/);
  });

  it('AC-12.3.2/1 — Every note carries its name above it, spelled as the pitch strip spells it: ♭3 in C reads E♭, 3 in D♭ reads F, ♯4 in C reads F♯', () => {
    expect(names(aided(melody([[0, 0, 0, 'b3'], [0, 1, 0, '#4'], [0, 2, 0, '1'], [0, 3, 0, '7']])))).toEqual(['E♭', 'F♯', 'C', 'B']);
    expect(names(aided(melody([[0, 0, 0, '3'], [0, 1, 0, 'b3'], [0, 2, 0, '1']], { key: 'Db' })))).toEqual(['F', 'F♭', 'D♭']);
    // Every note is named: four notes, four names, each inside its own note.
    const all = items(aided(melody([[0, 0, 0, '1'], [0, 1, 0, '2'], [0, 2, 0, '3'], [0, 3, 0, '4']])));
    expect(all.map((i) => i['data-name'])).toEqual(['C', 'D', 'E', 'F']);
    expect(all.every((i) => i.inner.includes('class="note-name"'))).toBe(true);
  });

  it("AC-12.3.2/2 — The name sits above the note's stem end, beam or accent mark, whichever is highest, and above its tuplet numeral; the staff, counting labels and chord names are where they were without it", () => {
    // A low note, stem up: the name is above the stem's end (a smaller y is higher).
    let p = melody([[0, 0, 0, '1']]);
    let note = items(aided(p))[0];
    expect(nameY(note)).toBeLessThan(stemY2(note));
    // A high note, stem down: the name is above the head.
    p = melody([[0, 0, 0, '1', 1]]);
    note = items(aided(p))[0];
    expect(nameY(note)).toBeLessThan(cy(note));
    // Accented, stem up: above the accent mark too.
    p = melody([[0, 0, 0, '1']]);
    p.measures[0].beats[0].slots[0] = { ...p.measures[0].beats[0].slots[0], accent: STRONG };
    note = items(aided(p))[0];
    expect(note.inner).toContain('class="accent"');
    expect(nameY(note)).toBeLessThan(accentY(note) - 0.4);
    // Beamed eighths: every name above the beam.
    p = melody([]);
    p = setRecipe(p, 0, 0, 'straight-8ths');
    for (const [s, d] of [[0, '1'], [1, '2']]) {
      p = cycleAccent(p, 0, 0, s);
      p = setPitch(p, 0, 0, s, { degree: d, octaveOffset: 0 });
    }
    let markup = aided(p);
    const beam = tags(markup, 'beam')[0];
    for (const n of notes(markup)) expect(nameY(n)).toBeLessThan(Number(beam.y));
    // A triplet: the numeral sits above the names.
    p = melody([]);
    p = setRecipe(p, 0, 0, 'triplet-8ths');
    for (const s of [0, 1, 2]) {
      p = cycleAccent(p, 0, 0, s);
      p = setPitch(p, 0, 0, s, { degree: '1', octaveOffset: 0 });
    }
    markup = aided(p);
    const numeral = tags(markup, 'tuplet')[0];
    for (const n of notes(markup)) expect(Number(numeral.y)).toBeLessThan(nameY(n) - 1);
    // Nothing else moved: the counting labels, chord names and staff lines are byte for byte the same.
    p = setProgression(melody([[0, 0, 0, '1'], [0, 2, 0, '5']]), 'I-IV-V');
    const plain = draw(p);
    const withAids = aided(p);
    const pick = (m, cls) => m.match(new RegExp(`<[^>]*class="${cls}[^"]*"[^>]*>`, 'g'));
    expect(pick(withAids, 'count')).toEqual(pick(plain, 'count'));
    expect(pick(withAids, 'chord-name')).toEqual(pick(plain, 'chord-name'));
    expect(pick(withAids, 'staff-line')).toEqual(pick(plain, 'staff-line'));
  });

  it('AC-12.3.2/3 — The second note of a tie carries no name, as it is the same note held; a rest carries no name', () => {
    let p = melody([]);
    p = setRecipe(p, 0, 0, 'straight-triplet-split');
    p = cycleAccent(p, 0, 0, 0);
    p = setPitch(p, 0, 0, 0, { degree: '3', octaveOffset: 0 });
    // Beat 2 sounds nothing: a rest.
    const all = items(aided(p));
    const tied = all.filter((i) => i['data-beat'] === '0');
    expect(tied.map((i) => i['data-value'])).toEqual(['eighth', 'eighth']);
    expect(tied[0]['data-tie']).toBe('true');
    expect(tied[0].inner).toContain('class="note-name"');
    expect(tied[1].inner).not.toContain('class="note-name"');
    expect(tied[1]['data-name']).toBeUndefined();
    const rests = all.filter((i) => i.kind === 'rest');
    expect(rests.length).toBeGreaterThan(0);
    expect(rests.every((r) => !r.inner.includes('note-name') && r['data-role'] === undefined)).toBe(true);
  });

  it("AC-12.3.2/4 — A note's name is written in the same colour as its notehead: as drawn, the name is inside the note's own coloured group", () => {
    const note = items(aided(melody([[0, 0, 0, '5']])))[0];
    expect(roleClass(note)).toBe('role-5');
    expect(note.inner).toContain('class="notehead"');
    expect(note.inner).toContain('class="note-name"');
  });

  it("AC-12.3.3/1 — A note's notehead and name take the colour of its degree above the Key, so every 1 in a Pattern is one colour and every 5 another whatever the octave; the colour follows the degree, not the letter, so 1 in C and 1 in E♭ are one colour", () => {
    const inC = items(aided(melody([[0, 0, 0, '1'], [0, 1, 0, '1', 1], [0, 2, 0, '5'], [0, 3, 0, '5', -1]])));
    expect(inC.map(roleClass)).toEqual(['role-1', 'role-1', 'role-5', 'role-5']);
    expect(inC.map((i) => i['data-role'])).toEqual(['1', '1', '5', '5']);
    // The degree, not the letter: G is 5 in C and 3 in E♭.
    const inEb = notes(aided(melody([[0, 0, 0, '1'], [0, 1, 0, '3']], { key: 'Eb' })));
    expect(inEb.map(roleClass)).toEqual(['role-1', 'role-3']);
    expect(inEb[1]['data-name']).toBe('G');
    expect(inC[2]['data-name']).toBe('G');
    expect(roleClass(inC[2])).not.toBe(roleClass(inEb[1]));
  });

  it("AC-12.3.3/2 — A degree in the Pattern's scale takes its colour from the twelve-colour degree scheme of the maintainer's fret-navigator: 1 `#c62828`, ♭2 `#b3541e`, 2 `#8a6d00`, ♭3 `#66790a`, 3 `#2e7d32`, 4 `#00795c`, ♯4/♭5 `#00707e`, 5 `#0b69b7`, ♭6 `#3f51b5`, 6 `#673ab7`, ♭7 `#8e24aa`, 7 `#c2185b`: as drawn, each degree names its role", () => {
    // Twelve chromatic degrees over three Measures; the role ids are fret-navigator's.
    const degrees = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
    const stamps = degrees.map((d, i) => [Math.floor(i / 4), i % 4, 0, d]);
    const all = items(aided(melody(stamps, { measures: 3 })));
    expect(all.map((i) => i['data-role'])).toEqual(['1', 'b2', '2', 'b3', '3', '4', '4s5b', '5', 'b6', '6', 'b7', '7']);
    // ♭5 is the same role as ♯4.
    expect(items(aided(melody([[0, 0, 0, 'b5']], { scale: 'locrian' })))[0]['data-role']).toBe('4s5b');
    // In C Ionian the scale's seven are in scale and carry no second-set marking.
    const inScale = all.filter((i) => i['data-in-scale'] === 'true');
    expect(inScale.map((i) => i['data-role'])).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(inScale.every((i) => !outOfScale(i) && !i.inner.includes('note-name-ground'))).toBe(true);
  });

  it("AC-12.3.3/3 — A degree outside the Pattern's scale takes its colour from a second set of twelve, none of which is in the scheme — 1 `#ff8a80`, ♭2 `#ffab40`, 2 `#ffe57f`, ♭3 `#ccff90`, 3 `#a5d6a7`, 4 `#80cbc4`, ♯4/♭5 `#84ffff`, 5 `#82b1ff`, ♭6 `#9fa8da`, 6 `#b39ddb`, ♭7 `#ea80fc`, 7 `#f48fb1` — with its notehead ringed in the staff's black and its name on a ground of the same tint; so ♭2 in C Ionian is coloured from the second set and ♭3 in C Aeolian from the scheme: as drawn", () => {
    const ionian = notes(aided(melody([[0, 0, 0, 'b2'], [0, 1, 0, 'b3'], [0, 2, 0, '2']])));
    expect(ionian.map((i) => i['data-in-scale'])).toEqual(['false', 'false', 'true']);
    expect(ionian.map(outOfScale)).toEqual([true, true, false]);
    expect(ionian.map((i) => i.inner.includes('class="note-name-ground"'))).toEqual([true, true, false]);
    // The ground sits behind the name: drawn first, and about it.
    const ground = /<rect class="note-name-ground" x="([\d.]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/.exec(ionian[0].inner);
    const nx = Number(/<text class="note-name" x="([\d.]+)"/.exec(ionian[0].inner)[1]);
    expect(ionian[0].inner.indexOf('note-name-ground')).toBeLessThan(ionian[0].inner.indexOf('class="note-name"'));
    expect(Number(ground[1])).toBeLessThan(nx);
    expect(Number(ground[1]) + Number(ground[3])).toBeGreaterThan(nx);
    expect(Number(ground[2])).toBeLessThan(nameY(ionian[0]));
    expect(Number(ground[2]) + Number(ground[4])).toBeGreaterThan(nameY(ionian[0]));
    // The same ♭3 is in C Aeolian's scale.
    const aeolian = notes(aided(melody([[0, 0, 0, 'b3'], [0, 1, 0, 'b2']], { scale: 'aeolian' })));
    expect(aeolian.map((i) => i['data-in-scale'])).toEqual(['true', 'false']);
    expect(aeolian.map(roleClass)).toEqual(['role-b3', 'role-b2']);
    // A pentatonic leaves seven degrees outside.
    const penta = notes(aided(melody([[0, 0, 0, '4'], [0, 1, 0, '7'], [0, 2, 0, '5']], { scale: 'major-pentatonic' })));
    expect(penta.map((i) => i['data-in-scale'])).toEqual(['false', 'false', 'true']);
  });

  it('AC-12.3.3/4 — The second note of a tie takes the colour of the note it holds', () => {
    let p = melody([]);
    p = setRecipe(p, 0, 0, 'straight-triplet-split');
    p = cycleAccent(p, 0, 0, 0);
    p = setPitch(p, 0, 0, 0, { degree: 'b6', octaveOffset: 0 });
    const tied = items(aided(p)).filter((i) => i['data-beat'] === '0');
    expect(tied).toHaveLength(2);
    expect(tied.map(roleClass)).toEqual(['role-b6', 'role-b6']);
    expect(tied.map((i) => i['data-role'])).toEqual(['b6', 'b6']);
    expect(tied.map(outOfScale)).toEqual([true, true]);
  });
});
