import { describe, it, expect, beforeEach } from 'vitest';
import { buildMidi, midiFilename, VELOCITY, TICKS_PER_QUARTER } from '../../../src/export/midi.js';
import {
  toSubmissionShape,
  buildSubmission,
  buildIssueBody,
  buildIssueTitle,
  readSubmissionBody,
  readSubmittedPatterns,
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
  it("AC-13.1.1/1 — The submission URL carries the title, the `new-pattern` label and the Pattern's full definition as query parameters", async () => {
    const { url } = await buildSubmission([withNote(create('Samba Break'))]);
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

  it("AC-13.1.1/3 — No GitHub credential is held and GitHub's API is never called", async () => {
    const { url } = await buildSubmission([withNote(create('Groove'))]);
    // The web form on github.com, never api.github.com — the app is not a client.
    expect(url.startsWith('https://github.com/')).toBe(true);
    expect(url).not.toContain('api.github.com');
    expect(url).not.toMatch(/token|api_key|authorization/i);
  });

  it('AC-13.1.2 — Bulk submission batches multiple Patterns into one issue', async () => {
    const three = ['Samba Break', 'My Fill', 'Bossa Take 2'].map((n) => withNote(create(n)));
    const { url } = await buildSubmission(three);
    const body = buildIssueBody(three);

    expect(buildIssueTitle(three)).toBe('Bulk Pattern Submission (3 patterns)');
    expect(url).toContain('labels=new-pattern');
    expect(body.match(/```json/g)).toHaveLength(3);
    for (const name of ['Samba Break', 'My Fill', 'Bossa Take 2']) {
      expect(body).toContain(`### Pattern: ${name}`);
    }
  });

  it('AC-13.1.3/1 — A submission too large to prefill readably prefills the same content compressed', async () => {
    // Enough Patterns to blow past the URL limit as readable JSON.
    const many = Array.from({ length: 40 }, (_, i) => withNote(create(`Pattern ${i}`)));
    const readable = buildIssueBody(many);
    expect(encodeURIComponent(readable).length).toBeGreaterThan(MAX_URL_LENGTH);

    const { url, body, truncated, compressed } = await buildSubmission(many);

    expect(compressed).toBe(true);
    expect(truncated).toBe(false);
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    // Still prefilled — nobody is asked to paste anything.
    expect(url).toContain('body=');
    expect(url).toContain('labels=new-pattern');

    // And it is the SAME content: the compressed block decodes to the readable body,
    // byte for byte, so nothing was dropped to make it fit.
    const sent = new URL(url).searchParams.get('body');
    expect(await readSubmissionBody(sent)).toBe(readable);
    expect(await readSubmittedPatterns(sent)).toHaveLength(40);
    // `body` stays readable whichever tier was used — it is what the clipboard gets.
    expect(body).toBe(readable);
  });

  it('AC-13.1.3/3 — A submission too large even compressed falls back to title and label with the paste-it-yourself note', async () => {
    // Real entropy in the music is the one thing gzip cannot fold away, so this is
    // what it takes to defeat the compressed tier rather than merely the readable one.
    let seed = 1;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const noisy = (i) => {
      let p = create(`Take ${i}`);
      for (let m = 1; m < 4; m++) p = addMeasure(p);
      for (let m = 0; m < 4; m++) {
        for (let b = 0; b < 4; b++) {
          for (let s = 0; s < p.measures[m].beats[b].slots.length; s++) {
            for (let t = 0, times = Math.floor(rand() * 4); t < times; t++) p = cycleAccent(p, m, b, s);
          }
        }
      }
      return p;
    };
    const many = Array.from({ length: 80 }, (_, i) => noisy(i));
    const { url, body, truncated, compressed } = await buildSubmission(many);

    expect(truncated).toBe(true);
    expect(compressed).toBe(false);
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(url).not.toContain('body=');
    expect(url).toContain('labels=new-pattern');
    // The full readable content is still there for the clipboard — nothing is lost.
    expect(body.match(/```json/g)).toHaveLength(80);
  });

  it('AC-13.1.3/2 — A submission within the limit prefills title, label and body in full', async () => {
    const { url, truncated } = await buildSubmission([withNote(create('Small'))]);
    expect(truncated).toBe(false);
    expect(url).toContain('body=');
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
  });

  it('AC-13.1.3/2 — A submission within the limit prefills title, label and body in full: the threshold is 8,000 characters', () => {
    expect(MAX_URL_LENGTH).toBe(8000);
  });

  it('AC-13.1.3/2 — A submission within the limit prefills title, label and body in full: an ordinary multi-Measure Pattern is within it', async () => {
    // The reported case: a four-Measure line fell into the oversized-BULK fallback,
    // because the body was pretty-printed and every newline costs three characters
    // once percent-encoded. 1,657 characters of music became 14,281 of URL.
    let p = create('Four Bar Line');
    for (let i = 1; i < 4; i++) p = addMeasure(p);
    for (let m = 0; m < 4; m++) {
      for (let b = 0; b < p.measures[m].beats.length; b++) p = cycleAccent(p, m, b, 0);
    }

    const { url, truncated } = await buildSubmission([p]);
    expect(truncated).toBe(false);
    expect(url).toContain('body=');
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
  });

  it('AC-13.1.3/2 — A submission within the limit prefills title, label and body in full: the body carries no indentation to pay for', () => {
    const body = buildIssueBody([withNote(create('Compact'))]);
    const json = body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1);

    expect(JSON.parse(json)).toMatchObject({ name: 'Compact' });
    // Indentation is nearly free in a file and ruinous in a URL.
    expect(json).not.toContain('\n');
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

  it('AC-13.1.5 — Submission-tracking is Local Metadata, never part of the export payload', async () => {
    const pattern = { ...withNote(create('Groove')), id: 'p_1' };
    localMeta.update('p_1', { submittedAt: '2026-08-14T10:22:00Z', duplicateResolved: true });

    const submission = JSON.stringify(await buildSubmission([pattern]));
    const midi = String.fromCharCode(...buildMidi(pattern));

    for (const field of localMeta.LOCAL_META_FIELDS) {
      expect(submission, `submission/${field}`).not.toContain(field);
      expect(midi, `midi/${field}`).not.toContain(field);
    }
    expect(submission).not.toContain('p_1');
  });
});
