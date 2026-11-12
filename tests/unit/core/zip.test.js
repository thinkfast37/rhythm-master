import { describe, it, expect } from 'vitest';
import { buildZip, crc32 } from '../../../src/core/zip.js';
import { readZip } from '../../zip-reader.js';

describe('core/zip', () => {
  it("AC-19.11.5/1 — Export arrangement MIDI downloads one ZIP holding one `.mid` per layer, the composition first and the rest in their order, each named with its position and the Pattern's name; muted layers are included: the archive round-trips with its CRCs holding", () => {
    // The check value every CRC-32 implementation agrees on.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const entries = [
      { name: '01-my-line.mid', bytes: new Uint8Array([77, 84, 104, 100, 0, 1, 2, 3]) },
      { name: '02-bossa-nova.mid', bytes: new Uint8Array(0) },
      { name: '03-séance.mid', bytes: new Uint8Array(300).map((_, i) => i % 251) },
    ];
    const archive = buildZip(entries);
    // Signatures where a reader expects them: local header first, end record last.
    expect([...archive.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect([...archive.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
    const back = readZip(archive);
    expect(back.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    back.forEach((e, i) => expect([...e.bytes]).toEqual([...entries[i].bytes]));
    // A damaged byte is caught by the CRC.
    const damaged = new Uint8Array(archive);
    damaged[30 + '01-my-line.mid'.length + 5] ^= 0xff;
    expect(() => readZip(damaged)).toThrow(/CRC/);
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(/Not a ZIP/);
  });
});
