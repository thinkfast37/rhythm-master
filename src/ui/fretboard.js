/**
 * The fretboard (US-19.2): fret-navigator's board as an SVG, redrawn from the
 * Composer's state on every render. Geometry from `core/fretboard.js`; every
 * name, degree and colour role from `core/composer.js`'s `describeNote`, so the
 * board can never spell a note differently from the composing grid.
 *
 * Fixed here, and so without controls: standard tuning, absolute fret numbers.
 */
import {
  STRING_COUNT,
  FRET_COUNT,
  BOARD_HEIGHT,
  MARGIN,
  MARGIN_X,
  OPEN_COL_WIDTH,
  NOTE_RADIUS,
  ROW_HEIGHT,
  SINGLE_DOT_FRETS,
  DOUBLE_DOT_FRETS,
  noteAt,
  isPlayable,
  isMarkerFret,
  layoutFor,
  boardWidthFor,
  clampCapo,
} from '../core/fretboard.js';
import { describeNote, labelFor } from '../core/composer.js';

const SVG = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * @param {HTMLElement} root
 * @param {{key: string, scale: string, labelMode: string, capo: number, range: number[]}} model
 * @param {{onNote?: (midi: number) => void}} handlers
 */
export function renderFretboard(root, model, handlers = {}) {
  const capo = clampCapo(model.capo ?? 0);
  // Stretched to the panel's width at the height cap (core/fretboard
  // `boardWidthFor`), so a wide panel widens the fret columns rather than
  // letterboxing the board.
  const boardWidth = boardWidthFor(model.widthPx ?? 0);
  const layout = layoutFor(model.range ?? [0, FRET_COUNT], boardWidth);
  const { showOpenColumn, firstFret, lastFret, wireX, noteX, stringY } = layout;

  const svg = svgEl('svg', {
    class: 'fretboard',
    viewBox: `0 0 ${boardWidth} ${BOARD_HEIGHT}`,
    role: 'group',
    'aria-label': 'Fretboard, standard tuning',
  });
  svg.dataset.capo = String(capo);
  svg.dataset.lower = String(layout.lowerBound);
  svg.dataset.upper = String(layout.upperBound);
  svg.dataset.tuning = 'standard';

  // --- background: strings, wires, dots ---------------------------------
  const background = svgEl('g', { class: 'fretboard-background' });
  for (let s = 0; s < STRING_COUNT; s++) {
    background.appendChild(
      svgEl('line', {
        class: 'string-line',
        'data-string': s,
        x1: MARGIN_X + (showOpenColumn ? OPEN_COL_WIDTH : 0),
        y1: stringY(s),
        x2: boardWidth - MARGIN_X,
        y2: stringY(s),
      })
    );
  }
  // The capo bar sits at the END of the capo fret's cell — where the physical
  // capo clamps, against the wire — never where the nut is (AC-19.2.2/3).
  for (let f = firstFret - 1; f <= lastFret; f++) {
    const isNut = showOpenColumn && f === 0;
    const isCapoLine = !isNut && capo > 0 && f === capo;
    background.appendChild(
      svgEl('line', {
        class: isNut ? 'nut-line' : isCapoLine ? 'capo-line' : 'fret-line',
        'data-fret-wire': f,
        x1: wireX(f),
        y1: MARGIN,
        x2: wireX(f),
        y2: BOARD_HEIGHT - MARGIN,
      })
    );
  }
  const midY = MARGIN + (STRING_COUNT * ROW_HEIGHT) / 2;
  const thirdY1 = MARGIN + (STRING_COUNT * ROW_HEIGHT) / 3;
  const thirdY2 = MARGIN + (2 * STRING_COUNT * ROW_HEIGHT) / 3;
  for (let f = firstFret; f <= lastFret; f++) {
    if (!isMarkerFret(f)) continue;
    const cx = noteX(f);
    if (DOUBLE_DOT_FRETS.includes(f)) {
      background.appendChild(svgEl('circle', { class: 'inlay-dot', 'data-fret': f, cx, cy: thirdY1, r: 5 }));
      background.appendChild(svgEl('circle', { class: 'inlay-dot', 'data-fret': f, cx, cy: thirdY2, r: 5 }));
    } else if (SINGLE_DOT_FRETS.includes(f)) {
      background.appendChild(svgEl('circle', { class: 'inlay-dot', 'data-fret': f, cx, cy: midY, r: 5 }));
    }
  }
  svg.appendChild(background);

  // --- fret numbers, absolute, at the marker frets (AC-19.2.1/3) ---------
  const numbers = svgEl('g', { class: 'fret-numbers' });
  for (let f = firstFret; f <= lastFret; f++) {
    if (!isMarkerFret(f)) continue;
    for (const y of [MARGIN - 10, BOARD_HEIGHT - MARGIN + 12]) {
      const t = svgEl('text', { class: 'fret-number', 'data-fret': f, x: noteX(f), y });
      t.textContent = String(f);
      numbers.appendChild(t);
    }
  }
  svg.appendChild(numbers);

  // --- notes --------------------------------------------------------------
  const notes = svgEl('g', { class: 'notes-layer' });
  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= FRET_COUNT; f++) {
      const midi = noteAt(s, f);
      const note = describeNote(midi, model.key, model.scale);
      const playable = isPlayable(f, capo);
      const visible = layout.isVisible(f);
      const label = labelFor(note, model.labelMode);

      const classes = ['note'];
      if (f === 0) classes.push('open-string');
      if (note.isRoot) classes.push('is-root');
      if (note.inScale) classes.push('is-diatonic', `role-${note.roleId}`);
      if (!playable) classes.push('is-muted');
      if (!visible) classes.push('fret-hidden');

      const g = svgEl('g', {
        class: classes.join(' '),
        'data-string': s,
        'data-fret': f,
        'data-midi': midi,
        'data-playable': playable,
        'data-label': label,
        role: 'button',
        tabindex: visible && playable ? '0' : '-1',
        'aria-label': `${label}${note.isRoot ? ', root' : note.inScale ? ', in scale' : ''}${playable ? '' : ', muted'}, fret ${f === 0 ? 'open' : f}, string ${s + 1}`,
      });
      const cx = noteX(f);
      const cy = stringY(s);
      g.appendChild(svgEl('circle', { class: 'note-marker', cx, cy, r: NOTE_RADIUS }));
      const text = svgEl('text', { class: 'note-label', x: cx, y: cy });
      text.textContent = label;
      g.appendChild(text);

      const activate = () => {
        if (!playable || !visible) return;
        handlers.onNote?.(midi, { string: s, fret: f });
      };
      g.addEventListener('click', activate);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
      notes.appendChild(g);
    }
  }
  svg.appendChild(notes);

  root.replaceChildren(svg);
  return svg;
}
