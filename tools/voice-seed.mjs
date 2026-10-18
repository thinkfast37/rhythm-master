#!/usr/bin/env node
/**
 * Re-voice the shipped library (US-2.11, AC-2.11.4/4): every chord of every
 * Pattern with a progression takes its Closest inversion, computed by the same
 * `voiceChords` the Voicing picker uses, so the file and the app cannot
 * disagree about what Closest means. Nothing else is touched — order, and so
 * ids, stay as they are — and the file is written back in its own format, so
 * the diff is the inversions and nothing more.
 *
 * Usage:
 *   node tools/voice-seed.mjs             # rewrite data/seed-patterns.json
 *   node tools/voice-seed.mjs --check     # exit 1 if any progression is not voiced Closest
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceChords, DEFAULT_VOICING } from '../src/core/harmony.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'seed-patterns.json');
const check = process.argv.includes('--check');

const seed = JSON.parse(readFileSync(FILE, 'utf8'));
let changed = 0;
for (const pattern of seed.patterns) {
  if (!pattern.harmony?.chords?.length) continue;
  const voiced = voiceChords(pattern.harmony.chords, DEFAULT_VOICING);
  if (JSON.stringify(voiced) !== JSON.stringify(pattern.harmony.chords)) {
    changed += 1;
    pattern.harmony.chords = voiced;
  }
}

if (check) {
  console.log(changed === 0 ? 'voice-seed: every shipped progression is voiced Closest' : `voice-seed: ${changed} Pattern(s) not voiced Closest`);
  process.exit(changed === 0 ? 0 : 1);
}
writeFileSync(FILE, JSON.stringify(seed, null, 2) + '\n');
console.log(`voice-seed: re-voiced ${changed} Pattern(s)`);
