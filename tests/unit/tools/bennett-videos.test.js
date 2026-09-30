/**
 * The David Bennett video lister (tools/research/bennett-videos.mjs). Only the
 * pure parts are tested; the yt-dlp calls need a network the suite does not have.
 */
import { describe, it, expect } from 'vitest';
import { isHarmonyTitle, parseFlatList, entry } from '../../../tools/research/bennett-videos.mjs';

describe('bennett-videos', () => {
  it('keeps titles about harmony', () => {
    for (const t of [
      'Songs that use the Creep chord progression',
      'Songs that use the Minor 4 chord',
      'Borrowed Harmony: Turning the IV chord minor',
      'Songs that use the Mixolydian mode',
      'How Radiohead use Key Changes',
      'The pedal point in pop music',
    ]) {
      expect(isHarmonyTitle(t), t).toBe(true);
    }
  });

  it('drops titles that are not about harmony', () => {
    for (const t of ['Songs in 7/4 time', 'The Rhodes piano explained', 'Q&A livestream']) {
      expect(isHarmonyTitle(t), t).toBe(false);
    }
  });

  it('does not read "keyboard" as a key', () => {
    expect(isHarmonyTitle('My keyboard setup')).toBe(false);
  });

  it('parses yt-dlp flat-list output, keeping tabs inside a title', () => {
    const text = 'abc123\tSongs that use the Dorian mode\n\nxyz789\tOdd\ttitle\nbroken-line\n';
    expect(parseFlatList(text)).toEqual([
      { id: 'abc123', title: 'Songs that use the Dorian mode' },
      { id: 'xyz789', title: 'Odd\ttitle' },
    ]);
  });

  it('writes an entry with title, link and description', () => {
    expect(entry({ id: 'abc123', title: 'T' }, '  Songs: A, B  \n')).toBe('## T\nhttps://youtu.be/abc123\n\nSongs: A, B\n');
  });
});
