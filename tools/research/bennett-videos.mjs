#!/usr/bin/env node
/**
 * David Bennett's harmony videos, as a list to curate the catalogue against.
 *
 *   npm run research:bennett [-- --out research-out]
 *
 * Lists every video on the channel through yt-dlp, keeps the ones whose titles
 * are about harmony (chords, progressions, modes, borrowed chords…), and writes
 * each one's title, link and description — the descriptions usually name the
 * songs he uses as examples — to <out>/bennett-harmony.md.
 *
 * Run on your own machine: the cloud session's proxy does not reach YouTube.
 * Needs yt-dlp on the PATH (`brew install yt-dlp`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CHANNEL = 'https://www.youtube.com/@DavidBennettPiano/videos';

const HARMONY =
  /chord|progression|cadence|harmon|\bkeys?\b|key change|modul|mode|ionian|dorian|phrygian|lydian|mixolydian|aeolian|locrian|borrowed|interchange|\bminor\b|\bmajor\b|pedal|drone|arpeggi|riff|radiohead/i;

/** True when a video title is about harmony. */
export function isHarmonyTitle(title) {
  return HARMONY.test(title);
}

/** `yt-dlp --flat-playlist --print "%(id)s\t%(title)s"` output → [{ id, title }]. */
export function parseFlatList(text) {
  return text
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([id, title]) => id && title)
    .map(([id, ...rest]) => ({ id: id.trim(), title: rest.join('\t').trim() }));
}

/** One video's entry in the report. */
export function entry({ id, title }, description) {
  return `## ${title}\nhttps://youtu.be/${id}\n\n${(description ?? '').trim()}\n`;
}

function ytdlp(args) {
  return execFileSync('yt-dlp', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function main(argv) {
  const at = argv.indexOf('--out');
  const out = at >= 0 ? argv[at + 1] : 'research-out';
  mkdirSync(out, { recursive: true });

  const videos = parseFlatList(ytdlp(['--flat-playlist', '--print', '%(id)s\t%(title)s', CHANNEL]));
  const harmony = videos.filter((v) => isHarmonyTitle(v.title));
  console.log(`${videos.length} videos, ${harmony.length} about harmony. Reading descriptions…`);

  const entries = harmony.map((v, i) => {
    process.stdout.write(`\r${i + 1}/${harmony.length}`);
    let description = '';
    try {
      description = ytdlp(['--skip-download', '--print', '%(description)s', `https://youtu.be/${v.id}`]);
    } catch {
      description = '(description unavailable)';
    }
    return entry(v, description);
  });

  const file = join(out, 'bennett-harmony.md');
  writeFileSync(file, `# David Bennett — harmony videos (${harmony.length} of ${videos.length})\n\n${entries.join('\n')}`);
  console.log(`\nWrote ${file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
