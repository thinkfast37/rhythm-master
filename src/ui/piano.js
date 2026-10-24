/**
 * The keyboard (US-19.3): one or two rows of keys as SVG, coloured by the
 * degree-role palette the fretboard uses and labelled by the same label mode.
 * Geometry from `core/piano.js`; names, degrees and roles from
 * `core/composer.js`'s `describeNote`.
 */
import { rangeFor, keysIn, splitRows, whiteKeyCount, keyName, MIDDLE_C, DEFAULT_KEY_COUNT, isValidKeyCount } from '../core/piano.js';
import { describeNote, labelFor } from '../core/composer.js';

const SVG = 'http://www.w3.org/2000/svg';
/** Drawn units: a white key's width, and the bounds of its height. The keys are
 * drawn tall so the keyboard stands near the fretboard's height and a key is a
 * target, not a sliver. On a panel wide enough that the tall proportion would
 * hit the on-screen height cap and letterbox between dead side margins, the
 * drawn height shrinks — never past a real keyboard's width-to-length
 * proportion — so half of that dead margin goes to wider keys at the same
 * height. The two-row split (AC-19.3.2) is decided by rendered width alone and
 * is untouched. */
const WHITE_W = 24;
const WHITE_H_MAX = 220;
/** ~6.3 times the width — a real piano's white key is ~6.4. */
const WHITE_H_MIN = 150;
const BLACK_W = 14;
/** A real piano's black key is ~0.64 of the white key's length. */
const BLACK_RATIO = 0.64;
/** The row's on-screen height cap — tokens.css `.piano-row { max-height }` mirrors it. */
const ROW_CAP_PX = 420;

/** The drawn white-key height for the widest row at the panel's width: halfway
 * from the tall proportion toward the one that would fill the panel at the
 * height cap, so a wide panel's letterboxed dead margin is cut in half at the
 * same height (the maintainer's choice, 2026-10-24: wider, not taller, and not
 * the full stretch), floored at a real keyboard's proportion. */
function whiteHeightFor(maxRowUnits, widthPx) {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return WHITE_H_MAX;
  const fillsWidthAtCap = (ROW_CAP_PX * maxRowUnits) / widthPx;
  if (fillsWidthAtCap >= WHITE_H_MAX) return WHITE_H_MAX;
  return Math.max(WHITE_H_MIN, Math.round((WHITE_H_MAX + fillsWidthAtCap) / 2));
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * @param {HTMLElement} root
 * @param {{key: string, scale: string, labelMode: string, count: number, widthPx: number}} model
 * @param {{onNote?: (midi: number) => void}} handlers
 */
export function renderPiano(root, model, handlers = {}) {
  const count = isValidKeyCount(model.count) ? Number(model.count) : DEFAULT_KEY_COUNT;
  const range = rangeFor(count);
  const rows = splitRows(range, model.widthPx);

  const wrap = document.createElement('div');
  wrap.className = 'piano';
  wrap.dataset.keys = String(count);
  wrap.dataset.low = keyName(range.low);
  wrap.dataset.high = keyName(range.high);
  wrap.dataset.rows = String(rows.length);
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', `Piano keyboard, ${count} keys, ${keyName(range.low)} to ${keyName(range.high)}`);

  const WHITE_H = whiteHeightFor(Math.max(...rows.map((r) => whiteKeyCount(r))) * WHITE_W, model.widthPx);
  const BLACK_H = Math.round(WHITE_H * BLACK_RATIO);

  rows.forEach((row, rowIndex) => {
    const keys = keysIn(row);
    const whites = whiteKeyCount(row);
    const svg = svgEl('svg', {
      class: 'piano-row',
      viewBox: `0 0 ${whites * WHITE_W} ${WHITE_H}`,
      'data-row': rowIndex,
      'data-low': keyName(row.low),
      'data-high': keyName(row.high),
    });
    // Whites first, blacks after, so the blacks paint over the whites they sit between.
    for (const black of [false, true]) {
      for (const k of keys) {
        if (k.black !== black) continue;
        const note = describeNote(k.midi, model.key, model.scale);
        const label = note.inScale ? labelFor(note, model.labelMode) : k.isC ? keyName(k.midi) : '';
        const classes = ['key', k.black ? 'black' : 'white'];
        if (note.isRoot) classes.push('is-root');
        if (note.inScale) classes.push('is-diatonic', `role-${note.roleId}`);
        if (k.midi === MIDDLE_C) classes.push('middle-c');
        const g = svgEl('g', {
          class: classes.join(' '),
          'data-midi': k.midi,
          'data-name': keyName(k.midi),
          'data-label': label,
          role: 'button',
          tabindex: '0',
          'aria-label': `${label || keyName(k.midi)}${note.isRoot ? ', root' : note.inScale ? ', in scale' : ''}${k.midi === MIDDLE_C ? ', middle C' : ''}`,
        });
        const x = k.black ? (k.whiteIndex + 1) * WHITE_W - BLACK_W / 2 : k.whiteIndex * WHITE_W;
        const w = k.black ? BLACK_W : WHITE_W;
        const h = k.black ? BLACK_H : WHITE_H;
        g.appendChild(svgEl('rect', { class: 'key-face', x, y: 0, width: w, height: h, rx: 2 }));
        if (note.inScale) {
          // The colour sits in a band at the key's foot, so the key still reads as a key.
          g.appendChild(
            svgEl('rect', { class: 'key-role', x: x + 2, y: h - (k.black ? 22 : 30), width: w - 4, height: k.black ? 18 : 24, rx: 3 })
          );
        }
        if (label) {
          const t = svgEl('text', { class: 'key-label', x: x + w / 2, y: h - (k.black ? 13 : 18) });
          t.textContent = label;
          g.appendChild(t);
        }
        if (k.midi === MIDDLE_C) {
          g.appendChild(svgEl('circle', { class: 'middle-c-mark', cx: x + w / 2, cy: h - 40, r: 3 }));
        }
        const activate = () => handlers.onNote?.(k.midi, { key: k.midi });
        g.addEventListener('click', activate);
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        });
        svg.appendChild(g);
      }
    }
    wrap.appendChild(svg);
  });

  root.replaceChildren(wrap);
  return wrap;
}
