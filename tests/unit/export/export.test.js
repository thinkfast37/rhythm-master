import { describe, it, expect, beforeEach } from 'vitest';
import { buildMidi, midiFilename, VELOCITY, TICKS_PER_QUARTER } from '../../../src/export/midi.js';
import {
  toSubmissionShape,
  buildSubmission,
  buildIssueBody,
  MAX_URL_LENGTH,
} from '../../../src/export/submit.js';
import { create, cycleAccent, setTimeSignature, addMeasure, setPitch } from '../../../src/core/pattern.js';
import { buildTimeline } from '../../../src/core/timeline.js';
import { useBackingStore } from '../../../src/storage/keyValue.js';
import * as localMeta from '../../../src/storage/localMeta.js';

beforeEach(() => useBackingStore(new Map()));

const withNote = (p, b = 0, s = 0) => cycleAccent(p, 0, b, s);

/** Read a big-endian chunk length and the bytes of the named chunk. */
function findChunk(bytes, id) {
  for (let i = 0; i < bytes.length - 8; i++) {
    const tag = String.fromCharCode(...bytes.slice(i, i + 4));
    if (tag !== id) continue;
    const len = (bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7];
    return bytes.slice(i + 8, i + 8 + len);
  }
  return null;
}

describe('export/midi', () => {
  it('AC-12.1.1 — the file is a valid format-0 SMF with the documented division', () => {
    const bytes = buildMidi(withNote(create('Groove')));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    const header = findChunk(bytes, 'MThd');
    expect(header.slice(0, 4)).toEqual(new Uint8Array([0, 0, 0, 1])); // format 0, 1 track
    expect((header[4] << 8) | header[5]).toBe(TICKS_PER_QUARTER);
    expect(findChunk(bytes, 'MTrk')).not.toBeNull();
  });

  it('AC-12.1.2 — Accent Level maps to note-on velocity', () => {
    let p = create('Dynamics');
    p = withNote(p, 0, 0); // Beat 1 Slot 1 -> Strong
    p = withNote(p, 1, 0); // Beat 2 Slot 1 -> Weak
    p = withNote(p, 2, 0); // Beat 3 Slot 1 -> Medium

    const track = findChunk(buildMidi(p), 'MTrk');
    const velocities = [];
    for (let i = 0; i < track.length - 2; i++) {
      if (track[i] === 0x90) velocities.push(track[i + 2]);
    }
    expect(velocities).toContain(VELOCITY[3]);
    expect(velocities).toContain(VELOCITY[2]);
    expect(velocities).toContain(VELOCITY[1]);
  });

  it('AC-12.1.3 — every Measure emits its own Time Signature meta event', () => {
    let p = create('Mixed');
    p = addMeasure(p);
    p = setTimeSignature(p, 1, '6/8');
    p = withNote(p, 0, 0);

    const track = findChunk(buildMidi(p), 'MTrk');
    const signatures = [];
    for (let i = 0; i < track.length - 6; i++) {
      if (track[i] === 0xff && track[i + 1] === 0x58) {
        signatures.push([track[i + 3], 2 ** track[i + 4]]);
      }
    }
    expect(signatures).toEqual([
      [4, 4],
      [6, 8],
    ]);
  });

  it('AC-12.1.4 — melodic notes export at the pitch playback resolves, not a re-derivation', () => {
    let p = { ...create('Tune'), soundMode: 'melodic', key: 'Eb' };
    p = withNote(p, 0, 0);
    p = setPitch(p, 0, 0, 0, { degree: '5', octaveOffset: -1 });

    const expected = buildTimeline(p)[0].pitch.midiNote;
    const track = findChunk(buildMidi(p), 'MTrk');
    const notes = [];
    for (let i = 0; i < track.length - 2; i++) {
      if (track[i] === 0x90) notes.push(track[i + 1]);
    }
    expect(notes).toContain(expected);
  });

  it('AC-12.1.1 — the filename is derived from the Pattern name, safely', () => {
    expect(midiFilename({ name: 'Bossa Groove' })).toBe('bossa-groove.mid');
    expect(midiFilename({ name: '  Odd/Name?  ' })).toBe('oddname.mid');
    expect(midiFilename({ name: '///' })).toBe('pattern.mid');
  });

  it('AC-12.1.2 — a Pattern with no notes still produces a valid file', () => {
    const bytes = buildMidi(create('Silent'));
    expect(findChunk(bytes, 'MTrk')).not.toBeNull();
  });
});

describe('export/submit', () => {
  it('AC-13.1.1 — the payload is seed-file shape, with no id, rating or provenance', () => {
    const pattern = { ...withNote(create('Shared Groove')), id: 'p_1', rating: 5 };
    const shape = toSubmissionShape(pattern);

    expect(shape).not.toHaveProperty('id');
    expect(shape.rating).toBe(0);
    expect(Object.keys(shape).sort()).toEqual(
      ['measures', 'name', 'rating', 'soundMode', 'tags', 'tempo'].sort()
    );
  });

  it('AC-13.1.2 — a melodic Pattern carries its Key; a percussive one does not', () => {
    const melodic = { ...create('Tune'), soundMode: 'melodic', key: 'Bb' };
    expect(toSubmissionShape(melodic).key).toBe('Bb');
    expect(toSubmissionShape(create('Beat'))).not.toHaveProperty('key');
  });

  it('AC-13.1.1 — the URL targets GitHub’s own new-issue form and carries no token', () => {
    const { url } = buildSubmission([withNote(create('Groove'))]);
    expect(url.startsWith('https://github.com/')).toBe(true);
    expect(url).toContain('/issues/new');
    expect(url).toContain('labels=new-pattern');
    expect(url).not.toMatch(/token|api_key|authorization/i);
  });

  it('AC-13.1.2 — a batch submission emits one JSON block per Pattern', () => {
    const body = buildIssueBody([withNote(create('One')), withNote(create('Two'))]);
    expect(body.match(/```json/g)).toHaveLength(2);
    expect(body).toContain('### Pattern: One');
    expect(body).toContain('### Pattern: Two');
  });

  it('AC-13.1.3 — an oversize payload falls back rather than emitting a truncated link', () => {
    // Enough Patterns to blow past the URL limit.
    const many = Array.from({ length: 40 }, (_, i) => withNote(create(`Pattern ${i}`)));
    const { url, body, truncated } = buildSubmission(many);

    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(url).not.toContain('body=');
    // The full content is still available for the clipboard — nothing is lost.
    expect(body.match(/```json/g)).toHaveLength(40);
  });

  it('AC-13.1.4 — a small payload goes in the URL directly', () => {
    const { url, truncated } = buildSubmission([withNote(create('Small'))]);
    expect(truncated).toBe(false);
    expect(url).toContain('body=');
  });

  it('AC-13.1.5 — no Local Metadata field reaches a submission or a MIDI file (FR-006)', () => {
    const pattern = { ...withNote(create('Groove')), id: 'p_1' };
    localMeta.update('p_1', { submittedAt: '2026-08-14T10:22:00Z', duplicateResolved: true });

    const submission = JSON.stringify(buildSubmission([pattern]));
    const midi = String.fromCharCode(...buildMidi(pattern));

    for (const field of localMeta.LOCAL_META_FIELDS) {
      expect(submission, `submission/${field}`).not.toContain(field);
      expect(midi, `midi/${field}`).not.toContain(field);
    }
    expect(submission).not.toContain('p_1');
  });
});
