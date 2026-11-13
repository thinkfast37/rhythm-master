/**
 * A tiny Standard MIDI File writer for tests of the importer (US-12.4): the
 * events a DAW writes, at absolute ticks, assembled into format 0 or 1 bytes.
 * Independent of `src/export/midi.js`, so the two cannot agree by accident.
 */

function variableLength(value) {
  const bytes = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

const text = (s) => [...s].map((c) => c.charCodeAt(0) & 0xff);

function chunk(id, data) {
  const len = data.length;
  return [...text(id), (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...data];
}

/**
 * One event's bytes. Kinds: on {note, velocity, channel}, off {note, channel},
 * tempo {bpm}, timeSignature {numerator, denominator}, keySignature {sharps, minor},
 * name {text}, raw {bytes}.
 */
function encode(e) {
  const channel = e.channel ?? 0;
  switch (e.kind) {
    case 'on':
      return [0x90 | channel, e.note, e.velocity];
    case 'off':
      return [0x80 | channel, e.note, 0];
    case 'tempo': {
      const us = Math.round(60e6 / e.bpm);
      return [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
    }
    case 'timeSignature':
      return [0xff, 0x58, 0x04, e.numerator, Math.log2(e.denominator), 24, 8];
    case 'keySignature':
      return [0xff, 0x59, 0x02, e.sharps & 0xff, e.minor ? 1 : 0];
    case 'name':
      return [0xff, 0x03, ...variableLength(e.text.length), ...text(e.text)];
    case 'raw':
      return e.bytes;
    default:
      throw new Error(`Unknown event kind ${e.kind}`);
  }
}

/**
 * @param {Array<Array<{tick: number, kind: string}>>} tracks events per track, at absolute ticks
 * @param {{division?: number, format?: number}} [options]
 * @returns {Uint8Array}
 */
export function smf(tracks, { division = 480, format = tracks.length > 1 ? 1 : 0 } = {}) {
  const header = [(format >> 8) & 0xff, format & 0xff, (tracks.length >> 8) & 0xff, tracks.length & 0xff, (division >> 8) & 0xff, division & 0xff];
  const out = chunk('MThd', header);
  for (const events of tracks) {
    const sorted = [...events].sort((a, b) => a.tick - b.tick);
    const data = [];
    let last = 0;
    for (const e of sorted) {
      data.push(...variableLength(e.tick - last), ...encode(e));
      last = e.tick;
    }
    data.push(0x00, 0xff, 0x2f, 0x00);
    out.push(...chunk('MTrk', data));
  }
  return Uint8Array.from(out);
}

/** A note-on at `tick` with a note-off `length` ticks later. */
export function note(tick, midi, velocity = 80, { length = 60, channel = 0 } = {}) {
  return [
    { tick, kind: 'on', note: midi, velocity, channel },
    { tick: tick + length, kind: 'off', note: midi, channel },
  ];
}
