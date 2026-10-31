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
import { setProgression as chooseProgression, setVoicing, setChange, addChord, setChordDegree, cyclePasses, setArpeggio, setChordFill, withArpeggio } from '../../../src/core/harmony.js';

/*
 * A progression chosen is voiced Closest (AC-2.11.3/7). The criteria proved
 * here are written for chords over their roots, so each test puts the voicing
 * at Root position first; the default itself is proved under US-2.11.
 */
const setProgression = (p, id) => setVoicing(chooseProgression(p, id), 'root');
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
  it('the exported file is a valid format-0 SMF with the documented division', () => {
    const bytes = buildMidi(withNote(create('Groove')));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    const header = findChunk(bytes, 'MThd');
    expect(header.slice(0, 4)).toEqual(new Uint8Array([0, 0, 0, 1])); // format 0, 1 track
    expect((header[4] << 8) | header[5]).toBe(TICKS_PER_QUARTER);
    expect(findChunk(bytes, 'MTrk')).not.toBeNull();
  });

  it('AC-12.1.3 — Accent Level maps to a fixed MIDI velocity table: each Accent Level reaches the file as its VELOCITY entry', () => {
    let p = create('Dynamics');
    p = withNote(p, 0, 0); // Beat 1 Slot 1 -> Strong
    p = withNote(p, 1, 0); // Beat 2 Slot 1 -> Weak
    p = withNote(p, 2, 0); // Beat 3 Slot 1 -> Medium

    const track = findChunk(buildMidi(p), 'MTrk');
    const velocities = [];
    // A Percussive Pattern's notes are on the drum channel, 10 — status 0x99, not
    // 0x90 (AC-12.1.2). This scan read 0x90 while the exporter wrongly put
    // Percussive notes on channel 1; only the status byte it looks for changed.
    for (let i = 0; i < track.length - 2; i++) {
      if (track[i] === 0x99) velocities.push(track[i + 2]);
    }
    expect(velocities).toContain(VELOCITY[3]);
    expect(velocities).toContain(VELOCITY[2]);
    expect(velocities).toContain(VELOCITY[1]);
  });

  it('AC-12.1.4 — Mixed-meter Pattern exports each Measure by its own Time Signature: every Measure emits its own Time Signature meta event', () => {
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

  it('AC-12.1.2 — Percussive exports to a drum channel; Melodic exports pitched notes: melodic notes export at the pitch playback resolves, not a re-derivation', () => {
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

  it('AC-2.9.2/5 — The MIDI export of a Pattern carries its notes at the Register, since it consumes the one timeline playback does (SC-003)', () => {
    let p = { ...create('Tune'), soundMode: 'melodic', key: 'C' };
    p = withNote(p, 0, 0);
    p = setPitch(p, 0, 0, 0, { degree: '1', octaveOffset: 0 });
    const bass = { ...p, register: -2 };

    expect(noteOns(buildMidi(p)).map((e) => e.data[0])).toEqual([60]);
    expect(noteOns(buildMidi(bass)).map((e) => e.data[0])).toEqual([36]);
    expect(noteOns(buildMidi(bass)).map((e) => e.data[0])).toEqual(
      buildTimeline(bass).map((e) => e.pitch.midiNote)
    );
  });

  it('the MIDI filename is derived from the Pattern name, safely', () => {
    expect(midiFilename({ name: 'Bossa Groove' })).toBe('bossa-groove.mid');
    expect(midiFilename({ name: '  Odd/Name?  ' })).toBe('oddname.mid');
    expect(midiFilename({ name: '///' })).toBe('pattern.mid');
  });

  it('a Pattern with no notes still produces a valid MIDI file', () => {
    const bytes = buildMidi(create('Silent'));
    expect(findChunk(bytes, 'MTrk')).not.toBeNull();
  });
});

describe('export/midi at written lengths (AC-4.2.7)', () => {
  it('AC-4.2.7/3 — A 3/8 Measure and a 5/8 Measure together last exactly as long as one 4/4 Measure at the same tempo, in playback and in the exported MIDI file: in the MIDI file', () => {
    let p = create('Split');
    p = addMeasure(addMeasure(p));
    p = setTimeSignature(p, 0, '3/8');
    p = setTimeSignature(p, 1, '5/8');
    p = setTimeSignature(p, 2, '4/4');
    p = { ...withNote(p, 0, 0), tempoUnit: 'quarter' };
    const meterTicks = trackEvents(buildMidi(p)).filter((e) => e.status === 0xff && e.type === 0x58).map((e) => e.tick);
    // 3/8 starts at 0, 5/8 three eighths later, and the 4/4 after eight eighths: one 4/4 bar.
    expect(meterTicks).toEqual([0, 1.5 * TICKS_PER_QUARTER, 4 * TICKS_PER_QUARTER]);
  });

  it('AC-4.2.7/2 — At ♩ = 120 a quarter-note Beat lasts 0.5 s and an eighth-note Beat 0.25 s; at ♪ = 120 an eighth-note Beat lasts 0.5 s and a quarter-note Beat 1 s: the MIDI tempo', () => {
    const tempoOf = (p) => {
      const { data } = trackEvents(buildMidi(p)).find((e) => e.status === 0xff && e.type === 0x51);
      return (data[0] << 16) | (data[1] << 8) | data[2];
    };
    const p = { ...withNote(create('Tempo')), tempo: 120 };
    expect(tempoOf({ ...p, tempoUnit: 'quarter' })).toBe(500000);
    expect(tempoOf({ ...p, tempoUnit: 'eighth' })).toBe(1000000);
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
    const fourBars = (name) => {
      let p = create(name);
      for (let m = 1; m < 4; m++) p = addMeasure(p);
      return p;
    };
    // A Slot tapped k times lands in the same state whatever its neighbours hold, so
    // each Slot's states are tapped out once, on one Pattern, and every noisy Pattern
    // is assembled from them: the same Patterns as tapping each one out directly,
    // without 7,500 whole-Pattern clones that timed out on a busy machine (T415).
    const tapped = [fourBars('Taps')];
    for (let k = 1; k < 4; k++) {
      let p = tapped[k - 1];
      for (let m = 0; m < 4; m++) {
        for (let b = 0; b < 4; b++) {
          for (let s = 0; s < p.measures[m].beats[b].slots.length; s++) p = cycleAccent(p, m, b, s);
        }
      }
      tapped.push(p);
    }
    const noisy = (i) => {
      const p = fourBars(`Take ${i}`);
      const measures = structuredClone(p.measures);
      for (let m = 0; m < 4; m++) {
        for (let b = 0; b < 4; b++) {
          for (let s = 0; s < measures[m].beats[b].slots.length; s++) {
            const times = Math.floor(rand() * 4);
            measures[m].beats[b].slots[s] = structuredClone(tapped[times].measures[m].beats[b].slots[s]);
          }
        }
      }
      return { ...p, measures };
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

/** Every event in a format-0 track: `{ tick, status, data }`, meta events included. */
function trackEvents(bytes) {
  const track = findChunk(bytes, 'MTrk');
  const events = [];
  let i = 0;
  let tick = 0;
  while (i < track.length) {
    let delta = 0;
    for (;;) {
      const b = track[i++];
      delta = (delta << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    tick += delta;
    const status = track[i++];
    if (status === 0xff) {
      const type = track[i++];
      const len = track[i++];
      events.push({ tick, status, type, data: [...track.slice(i, i + len)] });
      i += len;
    } else {
      events.push({ tick, status, data: [track[i], track[i + 1]] });
      i += 2;
    }
  }
  return events;
}

const noteOns = (bytes) => trackEvents(bytes).filter((e) => e.status === 0x90);

/** One Root-Slot Melodic Pattern under a progression, `measures` Measures of 4/4. */
function harmonicPattern(progressionId, { measures = 1, change = 'pass' } = {}) {
  let p = { ...create('Harmonic'), soundMode: 'melodic', key: 'C', tempo: 120 };
  for (let i = 1; i < measures; i++) p = addMeasure(p);
  p = setProgression(p, progressionId);
  p = setChange(p, change);
  for (let m = 0; m < measures; m++) {
    p = cycleAccent(p, m, 0, 0);
    p = setPitch(p, m, 0, 0, { tone: 1, octaveOffset: 0 });
  }
  return p;
}

describe('export/midi under a progression (US-2.6)', () => {
  it('AC-2.6.10/1 — The file holds as many passes as the progression needs to return to its first chord at Measure 1: four passes for I–IV–V–I changing every pass, and three for the twelve-bar blues over eight Measures changing every Measure', () => {
    let four = harmonicPattern('I-IV-V');
    four = setChordDegree(addChord(four), 3, '1');
    expect(cyclePasses(four)).toBe(4);
    const ons = noteOns(buildMidi(four));
    expect(ons).toHaveLength(4);
    expect(ons.map((e) => e.data[0])).toEqual([60, 65, 67, 60]);
    // Each pass is one 4/4 Measure at 120: 4 quarters, 1920 ticks apart.
    expect(ons.map((e) => e.tick)).toEqual([0, 1920, 3840, 5760]);

    const blues = harmonicPattern('twelve-bar-blues', { measures: 8, change: 'measure' });
    expect(cyclePasses(blues)).toBe(3);
    expect(noteOns(buildMidi(blues))).toHaveLength(24);
    // The end-of-track sits three passes after the start.
    const end = trackEvents(buildMidi(blues)).find((e) => e.status === 0xff && e.type === 0x2f);
    expect(end.tick).toBe(3 * 8 * 4 * TICKS_PER_QUARTER);
  });

  it("AC-2.6.10/2 — Each pass's notes are the notes playback sounds in that pass, from the one timeline", () => {
    const blues = harmonicPattern('twelve-bar-blues', { measures: 8, change: 'measure' });
    const ons = noteOns(buildMidi(blues));
    for (let pass = 0; pass < 3; pass++) {
      const expected = buildTimeline(blues, pass).map((e) => e.pitch.midiNote);
      expect(ons.slice(pass * 8, pass * 8 + 8).map((e) => e.data[0])).toEqual(expected);
    }
    // Twelve chords of I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7, dealt across 24 Measures.
    expect(ons.slice(0, 12).map((e) => e.data[0])).toEqual([60, 60, 60, 60, 65, 65, 60, 60, 67, 65, 60, 67]);
  });

  it('AC-2.6.10/3 — A Pattern with no progression exports one pass, as before', () => {
    let p = { ...create('Plain'), soundMode: 'melodic', key: 'C', tempo: 120 };
    p = cycleAccent(p, 0, 0, 0);
    p = setPitch(p, 0, 0, 0, { degree: '1', octaveOffset: 0 });
    expect(cyclePasses(p)).toBe(1);
    expect(noteOns(buildMidi(p))).toHaveLength(1);
    const end = trackEvents(buildMidi(p)).find((e) => e.status === 0xff && e.type === 0x2f);
    expect(end.tick).toBe(4 * TICKS_PER_QUARTER);
  });

  it('AC-2.6.4/6 — Playback and MIDI export resolve a chord tone through the one timeline, so the two cannot disagree', () => {
    const p = harmonicPattern('ii-V-I');
    // What the scheduler would sound in pass 1 is buildTimeline(p, 1); the file's
    // second pass is the same call, so the two carry the same note number.
    const played = buildTimeline(p, 1)[0].pitch.midiNote;
    expect(played).toBe(67);
    expect(noteOns(buildMidi(p))[1].data[0]).toBe(played);
  });

  it('AC-2.6.8/5 — A submission carries the progression, so the maintainer receives the melody as authored', () => {
    const p = harmonicPattern('ii-V-I');
    const shape = toSubmissionShape(p);
    expect(shape.harmony).toEqual(p.harmony);
    expect(JSON.parse(JSON.stringify(shape)).harmony).toEqual(p.harmony);
    expect(shape.measures[0].beats[0].slots[0].pitch).toEqual({ tone: 1, octaveOffset: 0 });
    // A Pattern without one submits without one.
    expect('harmony' in toSubmissionShape(create('Plain'))).toBe(false);
  });
});

describe('export/midi under cycle mode (US-2.7)', () => {
  it("AC-2.7.3/2 — MIDI export carries the Pattern's own arpeggio, never the fill in force: the file is the Pattern's data, and cycling is practice", () => {
    let p = harmonicPattern('I-IV-V');
    p = cycleAccent(p, 0, 1, 0);
    p = setPitch(p, 0, 1, 0, { tone: 1, octaveOffset: 0 });
    p = setArpeggio(p, 'up');
    const own = buildMidi(p);
    // Cycle mode hands the views and the transport an overlay; the file is
    // built from the Pattern, which the overlay leaves exactly as it was.
    const inForce = withArpeggio(p, 'down');
    expect(noteOns(buildMidi(inForce)).map((e) => e.data[0])).not.toEqual(noteOns(own).map((e) => e.data[0]));
    expect(p.harmony.arpeggio).toBe('up');
    expect(buildMidi(p)).toEqual(own);
    expect(noteOns(own).slice(0, 2).map((e) => e.data[0])).toEqual([60, 64]); // Ascending: Root, 3rd
  });
});

describe('US-2.1 — a Percussive Pattern goes out as it plays', () => {
  /** A Percussive Pattern still holding a whole melody from before it was switched. */
  function dormant() {
    let p = { ...create('Was Melodic'), tempo: 120 };
    for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
    for (const m of p.measures) for (const b of m.beats) for (const s of b.slots) if (s.on) s.pitch = { degree: '5', octaveOffset: 0 };
    return {
      ...p,
      soundMode: 'percussive',
      key: 'G',
      scale: 'dorian',
      register: 1,
      harmony: { change: 'pass', chords: [{ degree: '1', quality: 'maj' }, { degree: '4', quality: 'maj' }, { degree: '5', quality: 'maj' }] },
    };
  }

  it('AC-2.1.8/1 — A Percussive Pattern’s submission and MIDI file carry no Pitch, Key, scale, Register or progression', () => {
    const p = dormant();
    const sent = toSubmissionShape(p);
    expect(sent).not.toHaveProperty('key');
    expect(sent).not.toHaveProperty('scale');
    expect(sent).not.toHaveProperty('register');
    expect(sent).not.toHaveProperty('harmony');
    expect(JSON.stringify(sent.measures)).not.toContain('pitch');
    // The Pattern it came from is untouched.
    expect(p.measures[0].beats[0].slots[0].pitch).toEqual({ degree: '5', octaveOffset: 0 });

    // The MIDI file is the Pattern as it plays: one pass, not the progression's three,
    // every note on the drum channel at the one fixed drum note, none pitched.
    const plain = { ...create('Plain'), tempo: 120, measures: structuredClone(p.measures) };
    for (const m of plain.measures) for (const b of m.beats) for (const s of b.slots) delete s.pitch;
    expect(Array.from(buildMidi(p))).toEqual(Array.from(buildMidi({ ...plain, name: p.name })));
  });

  it("AC-2.15.1/5 — A chord's fill is Pattern content: it is saved with the Pattern and survives a reload, auto-saves into an owned Pattern, is one Undo step, is carried by the Pattern's JSON export and its submission, and on a shipped Pattern goes through the naming prompt, cancelling it leaving the Pattern as it was: the submission and the MIDI file", () => {
    let p = { ...create('Varied'), soundMode: 'melodic', key: 'C', scale: 'ionian', tempo: 120 };
    for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
    p = setArpeggio(setVoicing(chooseProgression(p, 'I-V-vi-IV'), 'root'), 'up');
    p = setChordFill(p, 3, 'down');
    // The submission is the Pattern as it plays, the chord's fill included.
    expect(toSubmissionShape(p).harmony.chords[3].fill).toBe('down');
    // The MIDI file is the four passes playback sounds: the fourth from the IV's 5th down.
    const fourth = buildTimeline(p, 3).map((e) => e.pitch.midiNote);
    expect(fourth).toEqual([72, 69, 65, 72]);
    expect(Array.from(buildMidi(p))).not.toEqual(Array.from(buildMidi(setChordFill(p, 3, null))));
  });
});

