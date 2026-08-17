#!/usr/bin/env node
/**
 * Colour-vision-deficiency check for the Accent Level palette.
 *
 * Constitution Principle II requires the three Accent Levels — and an off Slot —
 * to stay reliably distinguishable under common colour vision deficiencies. This
 * tool enforces that: it reads the palette from src/styles/tokens.css, simulates
 * deuteranopia, protanopia and tritanopia, and asserts a minimum perceptual
 * distance between every pair of states in every simulation.
 *
 * Accent Level is musical content, not decoration (FR-012, research.md D-005) —
 * a palette whose levels collapse under simulation is showing a colourblind
 * musician the wrong pattern, so this exits non-zero and blocks the deploy.
 *
 * Simulation: Viénot, Brettel & Mollon (1999) dichromat model.
 * Distance:   CIE76 (Euclidean in CIE L*a*b*). Coarser than CIEDE2000, but the
 *             threshold here is far above the range where the two disagree.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = join(ROOT, 'src/styles/tokens.css');

/** Minimum acceptable CIE76 distance between any two accent states. */
const MIN_DISTANCE = 20;

const STATES = ['off', 'weak', 'medium', 'strong'];

// --- colour plumbing --------------------------------------------------------

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function parseHex(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

function toLinear(rgb) {
  return rgb.map(srgbToLinear);
}

function toLab([r, g, b]) {
  // linear sRGB -> XYZ (D65)
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const ref = [0.95047, 1.0, 1.08883];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [X / ref[0], Y / ref[1], Z / ref[2]].map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Viénot/Brettel/Mollon dichromat simulation, applied in linear LMS.
 */
function simulate(linearRgb, type) {
  const [r, g, b] = linearRgb;
  // linear sRGB -> LMS
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;

  let l = L, m = M, s = S;
  if (type === 'protanopia') {
    l = 2.02344 * M - 2.52581 * S;
  } else if (type === 'deuteranopia') {
    m = 0.494207 * L + 1.24827 * S;
  } else if (type === 'tritanopia') {
    s = -0.395913 * L + 0.801109 * M;
  }

  // LMS -> linear sRGB
  const rr = 0.080944 * l - 0.130504 * m + 0.116721 * s;
  const gg = -0.0102485 * l + 0.0540194 * m - 0.113615 * s;
  const bb = -0.000365294 * l - 0.00412163 * m + 0.693513 * s;
  return [rr, gg, bb].map(clamp01);
}

// --- palette ----------------------------------------------------------------

function readPalette() {
  const css = readFileSync(TOKENS, 'utf8');
  const palette = {};
  for (const state of STATES) {
    const m = css.match(new RegExp(`--accent-${state}\\s*:\\s*(#[0-9a-fA-F]{3,6})`));
    if (!m) {
      console.error(
        `check-cvd: --accent-${state} not found in src/styles/tokens.css.\n` +
          'The accent palette must define --accent-off, --accent-weak, --accent-medium and --accent-strong.'
      );
      process.exit(2);
    }
    palette[state] = m[1];
  }
  return palette;
}

// --- check ------------------------------------------------------------------

const palette = readPalette();
const failures = [];

console.log('Accent palette:');
for (const s of STATES) console.log(`  ${s.padEnd(7)} ${palette[s]}`);

for (const vision of ['normal', 'deuteranopia', 'protanopia', 'tritanopia']) {
  const labs = {};
  for (const state of STATES) {
    const linear = toLinear(parseHex(palette[state]));
    labs[state] = toLab(vision === 'normal' ? linear : simulate(linear, vision));
  }

  const pairs = [];
  for (let i = 0; i < STATES.length; i++) {
    for (let j = i + 1; j < STATES.length; j++) {
      const [a, b] = [STATES[i], STATES[j]];
      const d = distance(labs[a], labs[b]);
      pairs.push({ a, b, d });
      if (d < MIN_DISTANCE) failures.push({ vision, a, b, d });
    }
  }

  const worst = pairs.reduce((w, p) => (p.d < w.d ? p : w));
  console.log(
    `\n${vision.padEnd(13)} closest pair: ${worst.a} vs ${worst.b} = ${worst.d.toFixed(1)}` +
      ` (min ${MIN_DISTANCE})`
  );
}

if (failures.length) {
  console.error(`\n${failures.length} pair(s) below the minimum distance:`);
  for (const f of failures) {
    console.error(`  ! ${f.vision}: ${f.a} vs ${f.b} = ${f.d.toFixed(1)} < ${MIN_DISTANCE}`);
  }
  console.error(
    '\nAccent Level is musical content (Constitution Principle II). Adjust the palette so every\n' +
      'pair stays separable under simulation.'
  );
  process.exit(1);
}

console.log('\nAll accent states stay distinguishable under every simulated deficiency.');
