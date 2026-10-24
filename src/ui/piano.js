/**
 * The keyboard (US-19.3): one or two rows of keys as SVG, coloured by the
 * degree-role palette the fretboard uses and labelled by the same label mode.
 * Geometry from `core/piano.js`; names, degrees and roles from
 * `core/composer.js`'s `describeNote`.
 */
import { rangeFor, keysIn, splitRows, whiteKeyCount, keyName, MIDDLE_C, DEFAULT_KEY_COUNT, isValidKeyCount } from '../core/piano.js';
import { describeNote, labelFor } from '../core/composer.js';

const SVG = 'http://www.w3.org/2000/svg';
/** Drawn units: a white key's width and the two heights. The keys are drawn
 * tall — close to a real keyboard's width-to-length proportion — so the
 * keyboard stands as high as the fretboard does and a key is a target, not a
 * sliver; the two-row split (AC-19.3.2) is decided by rendered width alone and
 * is untouched by the height. */
const WHITE_W = 24;
const WHITE_H = 220;
const BLACK_W = 14;
const BLACK_H = 140;

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
