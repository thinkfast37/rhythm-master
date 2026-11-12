/**
 * A ZIP archive of files already in memory (US-19.11, AC-19.11.5): the way
 * one click hands over several MIDI files, since a browser blocks a click
 * that starts several downloads. Stored entries only — a MIDI file is a few
 * hundred bytes and compression would buy nothing — with the CRC-32 every
 * reader checks. Pure: the timestamps are a fixed DOS date, since `core/`
 * reads no clock and a file's date carries no music.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of the bytes, as every ZIP reader computes it. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00, the earliest date the format can hold. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const utf8 = (s) => [...new TextEncoder().encode(s)];

/**
 * @param {Array<{name: string, bytes: Uint8Array}>} entries  in the order they are listed
 * @returns {Uint8Array}
 */
export function buildZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const nameBytes = utf8(name);
    const crc = crc32(bytes);
    const header = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0x0800), // flags: names are UTF-8
      ...u16(0), // stored
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(bytes.length),
      ...u32(bytes.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
    ];
    local.push(...header, ...bytes);
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(bytes.length),
      ...u32(bytes.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...nameBytes
    );
    offset += header.length + bytes.length;
  }
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0),
  ];
  return new Uint8Array([...local, ...central, ...end]);
}
