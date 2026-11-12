/**
 * Reads back an archive `core/zip.js` wrote: `{ name, bytes }` per entry, in
 * order, each CRC checked. A test helper, not a reader of arbitrary archives.
 */
import { crc32 } from '../src/core/zip.js';

/**
 * The entries a ZIP built here lists, read back from its central directory:
 * `{ name, bytes }` in order. For tests and for anything that opens its own
 * archive; a reader of arbitrary archives it is not.
 */
export function readZip(archive) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let end = archive.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('Not a ZIP archive');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Damaged central directory');
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(archive.slice(at + 46, at + 46 + nameLength));
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + localExtra;
    const bytes = archive.slice(start, start + size);
    if (crc32(bytes) !== view.getUint32(at + 16, true)) throw new Error(`CRC mismatch in ${name}`);
    entries.push({ name, bytes });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
