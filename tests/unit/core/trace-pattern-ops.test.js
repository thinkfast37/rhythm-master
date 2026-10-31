import { describe, it, expect } from 'vitest';
import { buildMidi, TICKS_PER_QUARTER } from '../../../src/export/midi.js';
import { create, cycleAccent, setTimeSignature, addMeasure, setPitch } from '../../../src/core/pattern.js';

/** Every event in the file's one track, with its absolute tick. */
function trackEvents(bytes) {
  let start = -1;
  for (let i = 0; i < bytes.length - 4; i++) {
    if (String.fromCharCode(...bytes.slice(i, i + 4)) === 'MTrk') {
      start = i;
      break;
    }
  }
  const len = (bytes[start + 4] << 24) | (bytes[start + 5] << 16) | (bytes[start + 6] << 8) | bytes[start + 7];
  const track = bytes.slice(start + 8, start + 8 + len);
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
      const n = track[i++];
      events.push({ tick, status, type, data: [...track.slice(i, i + n)] });
      i += n;
    } else {
      events.push({ tick, status, data: [track[i], track[i + 1]] });
      i += 2;
    }
  }
  return events;
}

/** Note-ons on any channel: the high nibble 0x9 with a non-zero velocity. */
const noteOns = (bytes) => trackEvents(bytes).filter((e) => (e.status & 0xf0) === 0x90 && e.data[1] > 0);
const channelOf = (e) => (e.status & 0x0f) + 1; // 1-based, as a DAW numbers them

describe('US-12.1 — MIDI export', () => {
  it('AC-12.1.2 — Percussive exports to a drum channel; Melodic exports pitched notes', () => {
    // "Samba Break": Percussive, a handful of sounding Slots across the Measure.
    let samba = { ...create('Samba Break'), tempo: 120 };
    for (const [b, s] of [[0, 0], [0, 2], [1, 1], [2, 0], [3, 3]]) samba = cycleAccent(samba, 0, b, s);
    const drums = noteOns(buildMidi(samba));
    expect(drums).toHaveLength(5);
    // The General MIDI drum channel is channel 10, for every note.
    expect(drums.every((e) => channelOf(e) === 10)).toBe(true);
    // A fixed mapping: every percussive Slot is the same drum key, inside the GM
    // percussion key range 35–81.
    const keys = new Set(drums.map((e) => e.data[0]));
    expect(keys.size).toBe(1);
    const [key] = keys;
    expect(key).toBeGreaterThanOrEqual(35);
    expect(key).toBeLessThanOrEqual(81);

    // "Samba Break (Melodic)": the same rhythm, Melodic in Key C, each Slot
    // carrying its own authored degree and octave.
    let melodic = { ...samba, name: 'Samba Break (Melodic)', soundMode: 'melodic', key: 'C', scale: 'ionian' };
    const authored = [
      [0, 0, { degree: '1', octaveOffset: 0 }, 60], // C4
      [0, 2, { degree: '5', octaveOffset: 0 }, 67], // G4
      [1, 1, { degree: 'b3', octaveOffset: -1 }, 51], // E♭3
      [2, 0, { degree: '2', octaveOffset: 1 }, 74], // D5
      [3, 3, { degree: '7', octaveOffset: 0 }, 71], // B4
    ];
    for (const [b, s, pitch] of authored) melodic = setPitch(melodic, 0, b, s, pitch);
    const pitched = noteOns(buildMidi(melodic));
    expect(pitched.map((e) => e.data[0])).toEqual(authored.map((a) => a[3]));
    // On a melodic channel — not the drum channel.
    expect(pitched.every((e) => channelOf(e) !== 10)).toBe(true);
  });

  it('AC-12.1.3 — Accent Level maps to a fixed MIDI velocity table', () => {
    // One Beat of four Slots: Weak, Medium, Strong, and an off Slot last.
    const p = {
      ...create('Velocities'),
      measures: [
        {
          timeSignature: '1/4',
          beats: [
            {
              recipe: 'straight-16ths',
              slots: [
                { on: true, accent: 1 },
                { on: true, accent: 2 },
                { on: true, accent: 3 },
                { on: false },
              ],
            },
          ],
        },
      ],
    };
    const ons = noteOns(buildMidi(p));
    // Exactly the table the spec gives: 50, 80 and 110 — and no note at all for the off Slot.
    expect(ons.map((e) => e.data[1])).toEqual([50, 80, 110]);
    // The off Slot sat at the fourth sixteenth; nothing sounds there.
    expect(ons.map((e) => e.tick)).toEqual([0, TICKS_PER_QUARTER / 4, TICKS_PER_QUARTER / 2]);
  });

  it('AC-12.1.4 — Mixed-meter Pattern exports each Measure by its own Time Signature', () => {
    // "Shifting Meter": Measure 1 in 4/4, Measure 2 in 6/8, a note on every Beat.
    let p = { ...create('Shifting Meter'), tempo: 120, tempoUnit: 'quarter' };
    p = addMeasure(p);
    p = setTimeSignature(p, 1, '6/8');
    for (let b = 0; b < 4; b++) p = cycleAccent(p, 0, b, 0);
    for (let b = 0; b < 6; b++) p = cycleAccent(p, 1, b, 0);

    const events = trackEvents(buildMidi(p));
    const q = TICKS_PER_QUARTER;
    const e = q / 2;

    // Each Measure declares its own meter, at its own boundary.
    const meters = events.filter((ev) => ev.status === 0xff && ev.type === 0x58);
    expect(meters.map((m) => [m.tick, m.data[0], 2 ** m.data[1]])).toEqual([
      [0, 4, 4],
      [4 * q, 6, 8],
    ]);

    // Measure 1 against four quarter-note Beats; Measure 2 against six eighth-note
    // Beats — not one Pattern-wide meter applied throughout.
    const ticks = noteOns(buildMidi(p)).map((ev) => ev.tick);
    expect(ticks).toEqual([
      0, q, 2 * q, 3 * q,
      4 * q, 4 * q + e, 4 * q + 2 * e, 4 * q + 3 * e, 4 * q + 4 * e, 4 * q + 5 * e,
    ]);
  });
});
