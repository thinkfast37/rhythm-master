#!/usr/bin/env node
/**
 * Download the piano soundfont into `public/soundfonts/` so the app serves it
 * from its own origin. research.md D-003.
 *
 * Run once, then commit what it writes:
 *
 *   npm run fetch:soundfont
 *   git add public/soundfonts && git commit -m "Vendor the piano soundfont"
 *
 * Why vendor it rather than fetch at runtime: a CDN is someone else's uptime.
 * Melodic playback is a core feature, and it should not break because a
 * third-party host moved a file. Serving from our own origin also means one
 * fewer connection for a browser to make on a bad practice-room connection.
 *
 * The files are MIT-licensed, from
 * https://github.com/gleitz/midi-js-soundfonts (MusyngKite).
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/soundfonts/MusyngKite');

const BASE = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/';
const FILES = ['acoustic_grand_piano-mp3.js'];

function download(url, dest, redirects = 0) {
  return new Promise((resolvePromise, reject) => {
    if (redirects > 5) return reject(new Error(`Too many redirects for ${url}`));

    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolvePromise(download(new URL(res.headers.location, url).href, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${url} returned HTTP ${res.statusCode}`));
      }

      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolvePromise(dest)));
      file.on('error', reject);
    }).on('error', reject);
  });
}

mkdirSync(OUT_DIR, { recursive: true });

let failed = false;
for (const name of FILES) {
  const dest = join(OUT_DIR, name);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`already present: ${name} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`);
    continue;
  }
  try {
    process.stdout.write(`downloading ${name} … `);
    await download(BASE + name, dest);
    console.log(`${(statSync(dest).size / 1e6).toFixed(1)} MB`);
  } catch (err) {
    failed = true;
    console.error(`\nfailed: ${err.message}`);
  }
}

if (failed) {
  console.error(
    '\nCould not fetch the soundfont. Run this on a machine with open internet access.\n' +
      'Until it is present the app falls back to a synthesised voice — correct pitch and\n' +
      'octave, but not a piano. Nothing else is affected.'
  );
  process.exit(1);
}

console.log(`\nSoundfont in ${OUT_DIR.slice(ROOT.length + 1)} — commit it.`);
