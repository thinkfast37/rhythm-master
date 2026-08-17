import { describe, it, expect, beforeEach } from 'vitest';
import { buildMidi, midiFilename, VELOCITY, TICKS_PER_QUARTER } from '../../../src/export/midi.js';
import {
  toSubmissionShape,
  buildSubmission,
  buildIssueBody,
  buildIssueTitle,
  selectForBulk,
  submissionDigest,
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
  it("AC-13.1.1/1 — The submission URL carries the title, the `new-pattern` label and the Pattern's full definition as query parameters", () => {
    const { url } = buildSubmission([withNote(create('Samba Break'))]);
    const params = new URL(url).searchParams;

    expect(url.startsWith('https://github.com/')).toBe(true);
    expect(url).toContain('/issues/new');
    expect(params.get('title')).toBe('New Pattern: Samba Break');
    expect(params.get('labels')).toBe('new-pattern');
    expect(params.get('body')).toContain('```json');
    expect(params.get('body')).toContain('### Pattern: Samba Break');
  });

  it("AC-13.1.1/1 — The submission URL carries the title, the `new-pattern` label and the Pattern's full definition as query parameters: the payload is seed-file shape, with no id, rating or provenance", () => {
    const pattern = { ...withNote(create('Shared Groove')), id: 'p_1', rating: 5 };
    const shape = toSubmissionShape(pattern);

    expect(shape).not.toHaveProperty('id');
    expect(shape.rating).toBe(0);
    expect(Object.keys(shape).sort()).toEqual(
      ['measures', 'name', 'rating', 'soundMode', 'tags', 'tempo'].sort()
    );
  });

  it("AC-13.1.1/1 — The submission URL carries the title, the `new-pattern` label and the Pattern's full definition as query parameters: a melodic Pattern carries its Key, a percussive one does not", () => {
    const melodic = { ...create('Tune'), soundMode: 'melodic', key: 'Bb' };
    expect(toSubmissionShape(melodic).key).toBe('Bb');
    expect(toSubmissionShape(create('Beat'))).not.toHaveProperty('key');
  });

  it("AC-13.1.1/3 — No GitHub credential is held and GitHub's API is never called", () => {
    const { url } = buildSubmission([withNote(create('Groove'))]);
    // The web form on github.com, never api.github.com — the app is not a client.
    expect(url.startsWith('https://github.com/')).toBe(true);
    expect(url).not.toContain('api.github.com');
    expect(url).not.toMatch(/token|api_key|authorization/i);
  });

  it('AC-13.1.2 — Bulk submission batches multiple Patterns into one issue', () => {
    const three = ['Samba Break', 'My Fill', 'Bossa Take 2'].map((n) => withNote(create(n)));
    const { url } = buildSubmission(three);
    const body = buildIssueBody(three);

    expect(buildIssueTitle(three)).toBe('Bulk Pattern Submission (3 patterns)');
    expect(url).toContain('labels=new-pattern');
    expect(body.match(/```json/g)).toHaveLength(3);
    for (const name of ['Samba Break', 'My Fill', 'Bossa Take 2']) {
      expect(body).toContain(`### Pattern: ${name}`);
    }
  });

  it('AC-13.1.3/1 — An oversized submission links to a title-and-label-only issue and shows the paste-it-yourself note', () => {
    // Enough Patterns to blow past the URL limit.
    const many = Array.from({ length: 40 }, (_, i) => withNote(create(`Pattern ${i}`)));
    const { url, body, truncated } = buildSubmission(many);

    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(url).not.toContain('body=');
    expect(url).toContain('labels=new-pattern');
    // The full content is still available for the clipboard — nothing is lost.
    expect(body.match(/```json/g)).toHaveLength(40);
  });

  it('AC-13.1.3/2 — A submission within the limit prefills title, label and body in full', () => {
    const { url, truncated } = buildSubmission([withNote(create('Small'))]);
    expect(truncated).toBe(false);
    expect(url).toContain('body=');
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
  });

  it('AC-13.1.3/2 — A submission within the limit prefills title, label and body in full: the threshold is 8,000 characters', () => {
    expect(MAX_URL_LENGTH).toBe(8000);
  });

  it('AC-13.1.4/1 — A Pattern submitted and unedited since is excluded from a later bulk submission', () => {
    const samba = { ...withNote(create('Samba Break')), id: 'p_1' };
    const meta = { p_1: { submittedAt: '2026-08-16T09:00:00Z', submittedDigest: submissionDigest(samba) } };

    expect(selectForBulk([samba], (id) => meta[id])).toEqual([]);
  });

  it('AC-13.1.4/2 — A Pattern edited since it was submitted is included again', () => {
    const before = { ...withNote(create('My Fill')), id: 'p_2' };
    const meta = { p_2: { submittedAt: '2026-08-16T09:00:00Z', submittedDigest: submissionDigest(before) } };
    const after = { ...withNote(before, 0, 1), id: 'p_2' };

    expect(selectForBulk([after], (id) => meta[id]).map((p) => p.name)).toEqual(['My Fill']);
  });

  it('AC-13.1.4/1 — A Pattern submitted and unedited since is excluded from a later bulk submission: an edit that was undone is not an edit', () => {
    const original = { ...withNote(create('My Fill')), id: 'p_2' };
    const meta = { p_2: { submittedAt: '2026-08-16T09:00:00Z', submittedDigest: submissionDigest(original) } };

    // Toggled on, then cycled back round to off: a different object holding the
    // same music, which is what "edited since" has to mean to be worth anything.
    let touched = { ...withNote(original, 0, 1), id: 'p_2' };
    while (touched.measures[0].beats[0].slots[1].on) {
      touched = { ...withNote(touched, 0, 1), id: 'p_2' };
    }

    expect(submissionDigest(touched)).toBe(submissionDigest(original));
    expect(selectForBulk([touched], (id) => meta[id])).toEqual([]);
  });

  it('AC-13.1.4/3 — A Pattern never submitted is included', () => {
    const fresh = { ...withNote(create('Bossa Take 2')), id: 'p_3' };
    expect(selectForBulk([fresh], () => ({})).map((p) => p.name)).toEqual(['Bossa Take 2']);
  });

  it('AC-13.1.5 — Submission-tracking is Local Metadata, never part of the export payload', () => {
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
