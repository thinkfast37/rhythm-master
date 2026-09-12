/**
 * The sheet music view. US-12.2, research.md D-012.
 *
 * Draws `core/notation.buildScore`'s model as inline SVG, one line per row of
 * Measures: staves, clefs, key signatures, meters, noteheads, stems, flags,
 * beams, tuplet numerals, ties, rests, ledger lines, accidentals, accent marks,
 * chord names, pass labels and the counting labels under every Slot position.
 * Every glyph is drawn in staff spaces, so the score scales with its staff and
 * prints as vectors.
 *
 * Rendering is a pure function of (score, width, transportPosition): the model
 * carries every musical fact, and this module only decides where on the page
 * each one goes (FR-013). Nothing here computes a pitch, a value or an accent.
 */
import { beamSegments, stemDirection, itemAt } from '../core/notation.js';

/** Staff space in px on a wide viewport, and on a phone. */
const SP_WIDE = 8;
const SP_NARROW = 7;

/** Pixels per tick of a quarter note — the proportional grid (AC-12.2.4/8). */
const PX_PER_TICK = 0.62; // × SP
/** The narrowest a Slot may be, so its counting label still fits. */
const MIN_SLOT = 2.7; // × SP

const STAFF_TOP = 6; // × SP, the top line (single line sits 2 SP lower)
const HEIGHT = 18; // × SP, one line's total height
const PAD_X = 0.8; // × SP, inside the svg on either side

const CLEF_WIDTH = 3.9;
const METER_WIDTH = 2.6;
const ACCIDENTAL_WIDTH = 1.0;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmt = (n) => (Math.round(n * 100) / 100).toString();

/* --- glyphs, all in staff spaces around (0, 0) ------------------------------ */

const glyph = {
  /** A filled notehead: an ellipse leaning up to the right. */
  notehead: (x, y, sp, attrs = '') =>
    `<ellipse class="notehead" cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(0.62 * sp)}" ry="${fmt(0.44 * sp)}" transform="rotate(-22 ${fmt(x)} ${fmt(y)})" ${attrs}/>`,

  /** A treble clef, drawn as a stroked curve; `y` is the G line. */
  treble: (x, y, sp) => {
    const d = [
      `M ${0.55} ${3.2}`,
      `c 0.1 0.9 -1.35 1.1 -1.35 0.25 c 0 -0.55 0.8 -0.55 0.8 -0.05`,
      `M ${0.55} ${3.2} L ${0.02} ${-5.2}`,
      `c -0.1 -1.2 0.35 -2.1 0.7 -2.2 c 0.8 -0.2 1.05 1.9 0.15 3.05`,
      `c -1.0 1.25 -2.5 2.2 -2.55 3.65 c -0.05 1.55 1.45 2.3 2.55 2.15`,
      `c 1.5 -0.2 1.9 -1.85 1.15 -2.6 c -0.9 -0.9 -2.35 -0.35 -2.2 0.75 c 0.1 0.65 0.7 0.9 1.1 0.85`,
    ].join(' ');
    return `<path class="clef" d="${d}" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})" fill="none" stroke-width="0.42" stroke-linecap="round"/>`;
  },

  /** A percussion clef: two thick bars centred on the line. */
  percussion: (x, y, sp) =>
    `<g class="clef" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})"><rect x="-0.6" y="-1" width="0.3" height="2"/><rect x="0.15" y="-1" width="0.3" height="2"/></g>`,

  sharp: (x, y, sp) =>
    `<g class="accidental" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})"><path d="M -0.22 -1.25 V 1.15 M 0.22 -1.15 V 1.25" stroke-width="0.11" fill="none"/><path d="M -0.5 -0.15 L 0.5 -0.45 M -0.5 0.55 L 0.5 0.25" stroke-width="0.3" fill="none"/></g>`,
  flat: (x, y, sp) =>
    `<g class="accidental" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})"><path d="M -0.3 -1.9 V 0.6" stroke-width="0.12" fill="none"/><path d="M -0.3 0.6 c 0.9 -0.5 1.15 -1.3 0.6 -1.45 c -0.3 -0.1 -0.6 0.2 -0.6 0.55 z"/></g>`,
  natural: (x, y, sp) =>
    `<g class="accidental" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})"><path d="M -0.28 -1.3 V 0.7 M 0.28 -0.7 V 1.3" stroke-width="0.11" fill="none"/><path d="M -0.28 -0.45 L 0.28 -0.65 M -0.28 0.55 L 0.28 0.35" stroke-width="0.28" fill="none"/></g>`,
  'double-sharp': (x, y, sp) =>
    `<g class="accidental" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})"><path d="M -0.45 -0.45 L 0.45 0.45 M -0.45 0.45 L 0.45 -0.45" stroke-width="0.26" fill="none"/></g>`,
  'double-flat': (x, y, sp) => glyph.flat(x - 0.55 * sp, y, sp) + glyph.flat(x + 0.1 * sp, y, sp),

  /** A quarter rest, centred on the middle line. */
  quarterRest: (x, y, sp) =>
    `<path class="rest" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})" d="M -0.25 -1.55 l 0.75 0.95 l -0.5 0.7 l 0.6 0.75 c -0.55 -0.25 -0.95 0.05 -0.55 0.75 c -0.65 -0.35 -0.95 -1.05 -0.2 -1.25 l -0.55 -0.75 l 0.5 -0.65 z"/>`,
  eighthRest: (x, y, sp) =>
    `<g class="rest" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})"><circle cx="-0.3" cy="-0.55" r="0.28"/><path d="M -0.02 -0.55 c -0.1 0.35 -0.45 0.5 -0.75 0.3 M 0.4 -1.0 L -0.25 1.2" stroke-width="0.14" fill="none"/></g>`,
  sixteenthRest: (x, y, sp) =>
    `<g class="rest" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(sp)})"><circle cx="-0.3" cy="-0.55" r="0.28"/><circle cx="-0.5" cy="0.45" r="0.28"/><path d="M -0.02 -0.55 c -0.1 0.35 -0.45 0.5 -0.75 0.3 M -0.22 0.45 c -0.1 0.35 -0.45 0.5 -0.75 0.3 M 0.5 -1.0 L -0.45 1.8" stroke-width="0.14" fill="none"/></g>`,
  /** A whole-measure rest hangs from the line above it. */
  wholeRest: (x, y, sp) => `<rect class="rest" x="${fmt(x - 0.7 * sp)}" y="${fmt(y)}" width="${fmt(1.4 * sp)}" height="${fmt(0.5 * sp)}"/>`,

  /** A flag hanging from a stem end at (x, y); `dir` says which way the stem went. */
  flag: (x, y, sp, dir, second = false) => {
    const s = dir === 'up' ? 1 : -1;
    const off = second ? 0.85 * sp * s : 0;
    const d = `M ${fmt(x)} ${fmt(y + off)} c ${fmt(0.1 * sp)} ${fmt(1.2 * sp * s)} ${fmt(2.0 * sp)} ${fmt(1.5 * sp * s)} ${fmt(1.1 * sp)} ${fmt(3.4 * sp * s)} c ${fmt(0.7 * sp)} ${fmt(-1.5 * sp * s)} ${fmt(0.1 * sp)} ${fmt(-2.3 * sp * s)} ${fmt(-1.1 * sp)} ${fmt(-2.6 * sp * s)} z`;
    return `<path class="flag" d="${d}"/>`;
  },

  accent: (x, y, sp) =>
    `<path class="accent" d="M ${fmt(x - 0.65 * sp)} ${fmt(y - 0.45 * sp)} L ${fmt(x + 0.65 * sp)} ${fmt(y)} L ${fmt(x - 0.65 * sp)} ${fmt(y + 0.45 * sp)}" fill="none" stroke-width="${fmt(0.16 * sp)}" stroke-linejoin="round"/>`,
};

/* --- layout ------------------------------------------------------------------ */

/** The staff space for a viewport width. */
function staffSpace(width) {
  return width < 480 ? SP_NARROW : SP_WIDE;
}

/** The natural width of a Measure's musical content, in staff spaces. */
function contentWidth(measure) {
  const slots = measure.beats.reduce((n, b) => n + b.labels.length, 0);
  return Math.max(measure.ticks * PX_PER_TICK, slots * MIN_SLOT);
}

/** What precedes the notes of a Measure that opens a line, in staff spaces. */
function headerWidth(score, measure, first) {
  let w = 0;
  if (first) {
    w += CLEF_WIDTH;
    if (score.keySignature) w += score.keySignature.count === 0 ? 0 : Math.abs(score.keySignature.count) * ACCIDENTAL_WIDTH + 0.4;
  }
  // A line repeats the clef and key signature, never a meter that has not changed (AC-12.2.10/3).
  if (measure.showMeter) w += METER_WIDTH;
  return w + 1.0;
}

/**
 * Break a pass's Measures into lines that fit `available` staff spaces: as many
 * whole Measures per line as fit, never a break inside one (AC-12.2.10/1); a
 * lone Measure wider than the line is scaled to fit (AC-12.2.10/2).
 */
export function breakLines(score, measures, available) {
  const lines = [];
  let line = [];
  let used = 0;
  for (const measure of measures) {
    const w = headerWidth(score, measure, line.length === 0) + contentWidth(measure) + 0.6;
    if (line.length > 0 && used + w > available) {
      lines.push(line);
      line = [];
      used = 0;
    }
    line.push(measure);
    used += w;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/* --- drawing ----------------------------------------------------------------- */

/**
 * Draw one line of Measures. Returns the svg markup and its natural width.
 *
 * `y(step)` maps a staff step to a pixel row: the bottom line is step 0 and
 * every step is half a space (AC-12.2.5/2). On the single-line staff every note
 * sits on the line (AC-12.2.3).
 */
function drawLine(score, measures, { sp, width, current, finalBar }) {
  const single = score.staff === 'single';
  const lineY = single ? (STAFF_TOP + 2) * sp : null; // the one line
  const bottomY = (STAFF_TOP + 4) * sp;
  const y = (step) => (single ? lineY : bottomY - (step * sp) / 2);
  const middleY = single ? lineY : y(4);
  const labelY = bottomY + 6.2 * sp;
  const chordY = 2.2 * sp;

  const out = [];
  const notes = []; // for the current-position mark and tests

  // How much the natural widths stretch to fill the line: only when the line
  // is nearly full anyway, so a short last line stays at its natural width.
  const natural = measures.reduce((w, m, i) => w + headerWidth(score, m, i === 0) + contentWidth(m) + 0.6, 0) + 2 * PAD_X;
  const totalContent = measures.reduce((w, m) => w + contentWidth(m), 0);
  const available = width / sp;
  const stretch = natural > available ? 1 : natural >= 0.6 * available ? 1 + (available - natural) / totalContent : 1;
  const lineWidth = Math.max(natural, Math.min(available, natural + (stretch - 1) * totalContent)) * sp;

  let x = PAD_X * sp;
  const staffStart = x;

  measures.forEach((measure, mi) => {
    const first = mi === 0;
    const beats = measure.beats;

    // --- header: clef, key signature, meter
    if (first) {
      if (single) out.push(glyph.percussion(x + 1.2 * sp, lineY, sp));
      else out.push(glyph.treble(x + 1.5 * sp, y(2), sp));
      x += CLEF_WIDTH * sp;
      if (score.keySignature && score.keySignature.count !== 0) {
        const draw = score.keySignature.accidental === '#' ? glyph.sharp : glyph.flat;
        const marks = score.keySignature.steps.map((step, i) => draw(x + (i + 0.5) * ACCIDENTAL_WIDTH * sp, y(step), sp));
        out.push(`<g class="key-signature" data-count="${score.keySignature.count}" data-accidental="${score.keySignature.accidental}">${marks.join('')}</g>`);
        x += (Math.abs(score.keySignature.count) * ACCIDENTAL_WIDTH + 0.4) * sp;
      }
    }
    if (measure.showMeter) {
      const [num, den] = measure.timeSignature.split('/');
      const cx = x + 1.2 * sp;
      const top = single ? lineY - 0.25 * sp : y(4);
      const bottom = single ? lineY + 2.0 * sp : y(0);
      out.push(
        `<text class="meter" x="${fmt(cx)}" y="${fmt(top)}" font-size="${fmt(2.05 * sp)}" text-anchor="middle">${num}</text>`,
        `<text class="meter" x="${fmt(cx)}" y="${fmt(bottom)}" font-size="${fmt(2.05 * sp)}" text-anchor="middle">${den}</text>`
      );
      x += METER_WIDTH * sp;
    }
    x += 1.0 * sp;

    // --- the Measure's content
    const width = contentWidth(measure) * stretch * sp;
    const pxPerTick = width / measure.ticks;
    const tx = (tick) => x + tick * pxPerTick;
    const measureStart = x;

    if (measure.chordLabel) {
      out.push(`<text class="chord-name" x="${fmt(tx(0))}" y="${fmt(chordY)}" font-size="${fmt(1.6 * sp)}">${esc(measure.chordLabel)}</text>`);
    }

    if (measure.wholeRest) {
      const cx = tx(measure.ticks / 2);
      out.push(glyph.wholeRest(cx, single ? lineY - 0.5 * sp : y(6), sp));
      notes.push({ attrs: `data-measure="${measure.measureIndex}" data-beat="0" data-slot="0" data-pass="${measure.pass}"`, kind: 'rest', x: cx, current: current && current.measureIndex === measure.measureIndex && current.pass === measure.pass, cy: middleY });
    }

    beats.forEach((beat) => {
      const items = beat.items;
      const segments = beamSegments(items);
      const inBeam = new Map();
      segments.forEach((seg, si) => seg.forEach((i) => inBeam.set(i, si)));

      // Stem directions: per beamed group, else per note.
      const dirs = items.map((it, i) => {
        if (it.kind !== 'note') return null;
        const si = inBeam.get(i);
        const steps = si === undefined ? [it.step] : segments[si].map((j) => items[j].step);
        return stemDirection(steps, score.staff);
      });

      const stemLen = 3.4 * sp;
      const stemEnd = (it, dir) => (dir === 'up' ? y(it.step) - stemLen : y(it.step) + stemLen);
      // A beam sits at the farthest stem end of its group.
      const beamY = segments.map((seg) => {
        const dir = dirs[seg[0]];
        const ends = seg.map((i) => stemEnd(items[i], dir));
        return dir === 'up' ? Math.min(...ends) : Math.max(...ends);
      });

      items.forEach((it, i) => {
        const cx = tx(it.tick);
        const isCurrent = Boolean(
          current && current.pass === measure.pass && current.measureIndex === measure.measureIndex && current.beatIndex === beat.beatIndex && current.slotIndex === it.slotIndex
        );
        const attrs = `data-measure="${measure.measureIndex}" data-beat="${beat.beatIndex}" data-slot="${it.slotIndex}" data-pass="${measure.pass}" data-step="${it.step}" data-value="${it.value}${it.dots ? '.' : ''}"${it.tuplet ? ` data-tuplet="${it.tuplet}"` : ''}${it.accidental ? ` data-accidental="${it.accidental}"` : ''}${it.tie ? ' data-tie="true"' : ''}`;

        if (it.kind === 'rest') {
          const ry = single ? lineY : middleY;
          const draw = it.value === 'quarter' ? glyph.quarterRest : it.value === 'eighth' ? glyph.eighthRest : glyph.sixteenthRest;
          out.push(`<g class="item rest-item${isCurrent ? ' playing' : ''}" ${attrs}>${draw(cx, ry, sp)}</g>`);
          notes.push({ kind: 'rest', x: cx, cy: ry, current: isCurrent });
          return;
        }

        const cy = y(it.step);
        const dir = dirs[i];
        const parts = [];

        // Ledger lines, for every position outside the staff (AC-12.2.5/2).
        if (!single) {
          for (let s = -2; s >= it.step; s -= 2) parts.push(`<line class="ledger" x1="${fmt(cx - 1.0 * sp)}" x2="${fmt(cx + 1.0 * sp)}" y1="${fmt(y(s))}" y2="${fmt(y(s))}" data-ledger="${s}"/>`);
          for (let s = 10; s <= it.step; s += 2) parts.push(`<line class="ledger" x1="${fmt(cx - 1.0 * sp)}" x2="${fmt(cx + 1.0 * sp)}" y1="${fmt(y(s))}" y2="${fmt(y(s))}" data-ledger="${s}"/>`);
        }

        if (it.accidental) parts.push(glyph[it.accidental](cx - 1.35 * sp, cy, sp));

        parts.push(glyph.notehead(cx, cy, sp));

        if (it.dots) {
          // In the space above a line note, beside a space note.
          const dy = single || it.step % 2 === 0 ? -0.5 * sp : 0;
          parts.push(`<circle class="dot" cx="${fmt(cx + 1.05 * sp)}" cy="${fmt(cy + dy)}" r="${fmt(0.2 * sp)}"/>`);
        }

        // Stem, to its own end or to the beam.
        const stemX = dir === 'up' ? cx + 0.56 * sp : cx - 0.56 * sp;
        const si = inBeam.get(i);
        const end = si === undefined ? stemEnd(it, dir) : beamY[si];
        parts.push(`<line class="stem" x1="${fmt(stemX)}" x2="${fmt(stemX)}" y1="${fmt(cy)}" y2="${fmt(end)}" stroke-width="${fmt(0.13 * sp)}"/>`);

        if (si === undefined && it.value !== 'quarter') {
          parts.push(glyph.flag(stemX, end, sp, dir));
          if (it.value === 'sixteenth') parts.push(glyph.flag(stemX, end, sp, dir, true));
        }

        if (it.accent) {
          const top = dir === 'up' ? end : cy - 0.6 * sp;
          parts.push(glyph.accent(cx, top - 1.1 * sp, sp));
        }

        // A tie to the next item, on the side away from the stem.
        if (it.tie && items[i + 1]) {
          const nx = tx(items[i + 1].tick);
          const s = dir === 'up' ? 1 : -1;
          const y0 = cy + 0.85 * sp * s;
          parts.push(`<path class="tie" d="M ${fmt(cx + 0.35 * sp)} ${fmt(y0)} Q ${fmt((cx + nx) / 2)} ${fmt(y0 + 1.2 * sp * s)} ${fmt(nx - 0.35 * sp)} ${fmt(y0)}" fill="none" stroke-width="${fmt(0.16 * sp)}"/>`);
        }

        out.push(`<g class="item note-item${isCurrent ? ' playing' : ''}" ${attrs}>${parts.join('')}</g>`);
        notes.push({ kind: 'note', x: cx, cy, current: isCurrent });
      });

      // Beams: a primary across the group, a secondary between sixteenths, a
      // stub for a sixteenth beside a longer note (AC-12.2.4/7).
      segments.forEach((seg, si) => {
        const dir = dirs[seg[0]];
        const by = beamY[si];
        const thick = 0.5 * sp * (dir === 'up' ? 1 : -1);
        const sx = (i) => (dir === 'up' ? tx(items[i].tick) + 0.56 * sp : tx(items[i].tick) - 0.56 * sp);
        const x1 = sx(seg[0]);
        const x2 = sx(seg[seg.length - 1]);
        out.push(`<rect class="beam" x="${fmt(Math.min(x1, x2) - 0.065 * sp)}" y="${fmt(Math.min(by, by + thick))}" width="${fmt(Math.abs(x2 - x1) + 0.13 * sp)}" height="${fmt(Math.abs(thick))}"/>`);
        const secondY = by + thick * 1.5;
        seg.forEach((i, k) => {
          if (items[i].value !== 'sixteenth') return;
          const next = seg[k + 1];
          const prev = seg[k - 1];
          if (next !== undefined && items[next].value === 'sixteenth') {
            out.push(`<rect class="beam" x="${fmt(sx(i) - 0.065 * sp)}" y="${fmt(Math.min(secondY, secondY + thick))}" width="${fmt(sx(next) - sx(i) + 0.13 * sp)}" height="${fmt(Math.abs(thick))}"/>`);
          } else if (prev === undefined || items[prev].value !== 'sixteenth') {
            // A lone sixteenth: a stub toward its neighbour.
            const toward = prev !== undefined ? -1 : 1;
            const bx = toward > 0 ? sx(i) - 0.065 * sp : sx(i) - 1.0 * sp;
            out.push(`<rect class="beam" x="${fmt(bx)}" y="${fmt(Math.min(secondY, secondY + thick))}" width="${fmt(1.0 * sp + 0.065 * sp)}" height="${fmt(Math.abs(thick))}"/>`);
          }
        });
      });

      // Tuplet numerals: one per triplet group that is written as a tuplet.
      const beatStart = beat.beatIndex * beat.ticks;
      beat.groups.forEach((g) => {
        const from = beatStart + g.tick;
        const members = items.filter((it) => it.tuplet && it.tick >= from && it.tick < from + g.ticks);
        if (members.length === 0) return;
        const gx1 = tx(from) - 0.4 * sp;
        const gx2 = tx(members[members.length - 1].tick) + 1.4 * sp;
        const cx = (gx1 + gx2) / 2;
        // Above when the stems go up or it is a rest, else below.
        const noteIdx = items.map((it, i) => i).filter((i) => members.includes(items[i]) && items[i].kind === 'note');
        const dir = noteIdx.length ? dirs[noteIdx[0]] : 'up';
        const ends = members.map((it) => {
          if (it.kind !== 'note') return middleY;
          const idx = items.indexOf(it);
          const end = inBeam.has(idx) ? beamY[inBeam.get(idx)] : stemEnd(it, dirs[idx]);
          // Room for an accent mark between the stem and the numeral.
          return it.accent && dirs[idx] === 'up' ? end - 1.7 * sp : end;
        });
        const ty = dir === 'up' ? Math.min(...ends) - 0.6 * sp : Math.max(...ends) + 1.7 * sp;
        // A bracket when the tuplet is not one beamed group.
        const bracket = !(noteIdx.length === members.length && noteIdx.every((i) => inBeam.get(i) === inBeam.get(noteIdx[0]) && inBeam.get(i) !== undefined));
        if (bracket) {
          const by = dir === 'up' ? ty + 0.35 * sp : ty - 1.35 * sp;
          const s = dir === 'up' ? 1 : -1;
          out.push(`<path class="tuplet-bracket" d="M ${fmt(gx1 + 0.2 * sp)} ${fmt(by + 0.6 * sp * s)} V ${fmt(by)} H ${fmt(cx - 0.9 * sp)} M ${fmt(cx + 0.9 * sp)} ${fmt(by)} H ${fmt(gx2 - 0.2 * sp)} V ${fmt(by + 0.6 * sp * s)}" fill="none" stroke-width="${fmt(0.12 * sp)}"/>`);
        }
        out.push(`<text class="tuplet" x="${fmt(cx)}" y="${fmt(ty)}" font-size="${fmt(1.45 * sp)}" text-anchor="middle" font-style="italic">3</text>`);
      });

      // Counting labels under every Slot position (AC-12.2.7).
      beat.labels.forEach((label) => {
        const text = label.sounding ? label.text : `(${label.text})`;
        out.push(
          `<text class="count${label.sounding ? '' : ' muted'}" x="${fmt(tx(label.tick))}" y="${fmt(labelY)}" font-size="${fmt(1.35 * sp)}" text-anchor="middle" data-measure="${measure.measureIndex}" data-beat="${beat.beatIndex}" data-slot="${label.slotIndex}">${esc(text)}</text>`
        );
      });
    });

    x = measureStart + width + 0.6 * sp;

    // Bar line: the last Measure of the score gets a final one (AC-12.2.4/9).
    const top = single ? lineY - 2 * sp : y(8);
    const bottom = single ? lineY + 2 * sp : y(0);
    const last = mi === measures.length - 1;
    if (last && finalBar) {
      out.push(`<line class="barline" x1="${fmt(x)}" x2="${fmt(x)}" y1="${fmt(top)}" y2="${fmt(bottom)}" stroke-width="${fmt(0.12 * sp)}"/>`);
      out.push(`<rect class="barline final" x="${fmt(x + 0.35 * sp)}" y="${fmt(top)}" width="${fmt(0.45 * sp)}" height="${fmt(bottom - top)}"/>`);
      x += 0.8 * sp;
    } else {
      out.push(`<line class="barline" x1="${fmt(x)}" x2="${fmt(x)}" y1="${fmt(top)}" y2="${fmt(bottom)}" stroke-width="${fmt(0.12 * sp)}"/>`);
    }
  });

  const staffEnd = x;

  // The staff lines themselves, drawn under everything else.
  const lines = [];
  if (single) {
    lines.push(`<line class="staff-line" data-line="0" x1="${fmt(staffStart)}" x2="${fmt(staffEnd)}" y1="${fmt(lineY)}" y2="${fmt(lineY)}"/>`);
  } else {
    for (let i = 0; i < 5; i++) {
      const ly = y(i * 2);
      lines.push(`<line class="staff-line" data-line="${i}" x1="${fmt(staffStart)}" x2="${fmt(staffEnd)}" y1="${fmt(ly)}" y2="${fmt(ly)}"/>`);
    }
  }

  const naturalWidth = Math.max(staffEnd + PAD_X * sp, lineWidth);
  const height = HEIGHT * sp;
  // A line wider than the width it was given is scaled down to fit it, never
  // cut or scrolled (AC-12.2.10/2).
  const fits = naturalWidth <= width + 0.5;
  const svg = `<svg class="score-line" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(naturalWidth)} ${fmt(height)}" width="${fmt(fits ? naturalWidth : width)}" height="${fmt(fits ? height : (height * width) / naturalWidth)}" data-scaled="${fits ? 'false' : 'true'}" data-sp="${sp}">${lines.join('')}${out.join('')}</svg>`;
  return { svg, naturalWidth, notes };
}

/**
 * Render a score into `root` at `width` px, marking the item at
 * `transportPosition` (AC-12.2.9).
 *
 * @param {HTMLElement} root
 * @param {object} score  from `core/notation.buildScore`
 * @param {{width: number, transportPosition?: object|null, print?: boolean}} options
 */
export function renderScore(root, score, { width, transportPosition = null, print = false } = {}) {
  const sp = print ? SP_WIDE : staffSpace(width);
  const current = itemAt(score, transportPosition);
  const currentKey = current
    ? { pass: current.pass, measureIndex: current.measureIndex, beatIndex: current.beatIndex, slotIndex: current.slotIndex }
    : null;

  const head = [];
  head.push(`<h2 class="score-title">${esc(score.title)}</h2>`);
  const tempoGlyph = score.tempo.beatValue === 'quarter' ? '♩' : '♪';
  const meta = [`<span class="score-tempo">${tempoGlyph} = ${score.tempo.bpm}</span>`];
  if (score.keyLabel) meta.push(`<span class="score-key">${esc(score.keyLabel)}</span>`);
  head.push(`<div class="score-meta">${meta.join('<span class="score-sep">·</span>')}</div>`);
  if (score.swing) head.push(`<div class="score-swing">Swing</div>`);

  const body = [];
  const available = (width - 2 * PAD_X * sp) / sp;
  score.passes.forEach((pass, pi) => {
    const lines = breakLines(score, pass.measures, available);
    const lastPass = pi === score.passes.length - 1;
    lines.forEach((measures, li) => {
      const { svg } = drawLine(score, measures, {
        sp,
        width,
        current: currentKey,
        finalBar: lastPass && li === lines.length - 1,
      });
      if (li === 0 && pass.label) body.push(`<div class="score-pass-label" data-pass="${pass.index}">${esc(pass.label)}</div>`);
      body.push(`<div class="score-row" data-pass="${pass.index}" data-line="${li}">${svg}</div>`);
    });
  });

  root.innerHTML = `<div class="score-head">${head.join('')}</div><div class="score-body">${body.join('')}</div>`;
  return root;
}

/* --- printing ------------------------------------------------------------------ */

/** The width a printed line is laid out to: a portrait page inside its margins. */
export const PRINT_WIDTH = 680;

/**
 * Print the score, or save it as a PDF, through the browser's own dialog
 * (AC-12.2.11). The score is laid out again to the page's width into a
 * container the print stylesheet alone shows; the document's title is the
 * Pattern's for the dialog's default filename, and both are put back once the
 * dialog closes.
 */
export function printScore(score) {
  const existing = document.querySelector('.score-print');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'score-print';
  renderScore(el, score, { width: PRINT_WIDTH, print: true });
  document.body.appendChild(el);

  const title = document.title;
  document.title = score.title;
  const restore = () => {
    document.title = title;
    el.remove();
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
  return el;
}
