/**
 * Pattern submission as a prefilled GitHub issue. US-13.1,
 * contracts/file-formats.md §3.
 *
 * The app never authenticates to GitHub. It builds a URL and hands it to the
 * user on GitHub's own domain — the pattern Principle V mandates for
 * third-party writes, and the reason no token exists anywhere in this codebase
 * (FR-008).
 */

export const REPO = 'thinkfast37/rhythm-master';

/**
 * A safe margin under GitHub's ~8,192-character request-URI limit (AC-13.1.3).
 * Beyond it the prefilled body is dropped rather than truncated.
 */
export const MAX_URL_LENGTH = 8000;

/**
 * A Pattern in seed-file shape — exactly what a maintainer pastes into
 * data/seed-patterns.json. No id, no provenance, no Local Metadata, no rating
 * (FR-006).
 */
export function toSubmissionShape(pattern) {
  const out = {
    name: pattern.name,
    soundMode: pattern.soundMode,
    tempo: pattern.tempo,
    tags: pattern.tags ?? [],
    rating: 0,
    measures: structuredClone(pattern.measures),
  };
  if (pattern.soundMode === 'melodic') out.key = pattern.key;
  return out;
}

/**
 * The submitted JSON is COMPACT, and that is what keeps a real Pattern submittable.
 *
 * Indentation is nearly free in a file and ruinous in a URL: every newline and space
 * costs three characters once percent-encoded, and each Slot is its own object. A
 * four-Measure Pattern is 1,657 characters of music, 5,353 pretty-printed, and 14,281
 * encoded — so it fell into AC-13.1.3's fallback, which describes an oversized *bulk*
 * submission, while AC-13.1.1 puts no size caveat on submitting one Pattern at all.
 *
 * Compact, the densest Pattern the app can represent (8 Measures of 12/8 at Straight
 * 16ths) encodes to well under the limit, so the fallback is now reachable only by a
 * batch of many Patterns — which is the only case the criterion describes.
 */
export function buildIssueBody(patterns) {
  const blocks = patterns.map(
    (p) => `### Pattern: ${p.name}\n\n\`\`\`json\n${JSON.stringify(toSubmissionShape(p))}\n\`\`\``
  );
  return [
    patterns.length === 1
      ? 'Submitting one Pattern for the shared library.'
      : `Submitting ${patterns.length} Patterns for the shared library.`,
    '',
    ...blocks,
  ].join('\n');
}

export function buildIssueTitle(patterns) {
  return patterns.length === 1
    ? `New Pattern: ${patterns[0].name}`
    : `Bulk Pattern Submission (${patterns.length} patterns)`;
}

/**
 * A stable fingerprint of exactly what would be submitted for a Pattern.
 *
 * This is how "edited since it was submitted" is answered (AC-13.1.4). A Pattern
 * carries no modified timestamp, and adding one would change the stored Pattern
 * shape to answer a bookkeeping question — so the payload is compared against the
 * payload that was last sent, which is also strictly more truthful: an edit that
 * is undone before the next bulk run is correctly not an edit.
 *
 * FNV-1a, because this only has to detect change, never resist forgery.
 */
export function submissionDigest(pattern) {
  const text = JSON.stringify(toSubmissionShape(pattern));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The Patterns a bulk submission should carry: the Contributor's own, minus any
 * already submitted and untouched since (AC-13.1.4).
 *
 * Pure, and given the Local Metadata rather than reading it, so `export/` stays
 * unaware of storage.
 *
 * @param {Array<object>} patterns  the Contributor's own Patterns
 * @param {(id: string) => {submittedAt?: string, submittedDigest?: string}} metaFor
 */
export function selectForBulk(patterns, metaFor) {
  return patterns.filter((p) => {
    const meta = metaFor(p.id) ?? {};
    if (!meta.submittedAt) return true;
    return meta.submittedDigest !== submissionDigest(p);
  });
}

/** The info string of the compressed block, and the format line inside it. */
export const COMPRESSED_FENCE = 'rhythm-master';
export const COMPRESSED_FORMAT = 'v1 gzip base64url';

const toBase64Url = (bytes) => {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

async function through(stream, bytes) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/**
 * Compress the readable body to a URL-safe string, and back.
 *
 * `CompressionStream` is a platform API, so this costs no dependency (Principle V).
 * gzip because the payload is enormously repetitive — a Recipe id repeats once per
 * Beat and most Slots are the same four bytes — so the densest Pattern the app can
 * represent comes out under 500 characters.
 *
 * base64url, not plain base64: `+` and `/` and `=` each cost three characters once
 * percent-encoded, which would give back a fifth of what the compression won.
 */
export async function compressBody(body) {
  return toBase64Url(await through(new CompressionStream('gzip'), new TextEncoder().encode(body)));
}

export async function decompressBody(payload) {
  const bytes = await through(new DecompressionStream('gzip'), fromBase64Url(payload));
  return new TextDecoder().decode(bytes);
}

/**
 * The compressed body: one fenced block, self-describing, and nothing else.
 *
 * It decodes to EXACTLY the readable body, so anything reading a submission has one
 * shape to understand rather than two — decompress if the marker is there, then parse
 * the same Markdown either way. That is what keeps the `pattern-intake` skill a single
 * parser instead of a fork.
 */
export function buildCompressedBody(payload, patternCount) {
  const noun = patternCount === 1 ? 'one Pattern' : `${patternCount} Patterns`;
  return [
    `Submitting ${noun} for the shared library, compressed because the readable form did not fit in a URL.`,
    '',
    '```' + COMPRESSED_FENCE,
    COMPRESSED_FORMAT,
    payload,
    '```',
    '',
    '<sub>Decode with the maintainer’s `pattern-intake` skill, which accepts either form.</sub>',
  ].join('\n');
}

/**
 * Read a submission body back, whichever tier produced it.
 *
 * ONE function, exported, because the maintainer's `pattern-intake` skill decodes
 * what this module encodes: two implementations of the same format is two chances
 * to drift, and the failure would be a Contributor's Pattern that cannot be read
 * back at all.
 *
 * @returns {Promise<string>} the readable body
 */
export async function readSubmissionBody(body) {
  const fence = new RegExp('```' + COMPRESSED_FENCE + '\\s*\\n([\\s\\S]*?)```');
  const block = body.match(fence);
  if (!block) return body;

  const [format, ...rest] = block[1].trim().split('\n');
  if (format.trim() !== COMPRESSED_FORMAT) {
    throw new Error(`Unknown submission format "${format.trim()}" — expected "${COMPRESSED_FORMAT}".`);
  }
  return decompressBody(rest.join('').trim());
}

/** Every Pattern in a submission body, in seed-file shape. Accepts either tier. */
export async function readSubmittedPatterns(body) {
  const readable = await readSubmissionBody(body);
  const blocks = [...readable.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  return blocks.map((m) => JSON.parse(m[1]));
}

/**
 * Build the submission, in three tiers (AC-13.1.3).
 *
 * Readable JSON whenever it fits, because a submission a maintainer can read on the
 * issue itself needs no tooling at all. Compressed when it does not, because the only
 * alternative — asking the Contributor to paste it themselves — is the one step in the
 * flow they can silently get wrong. Title-and-label-only last, when even compressed
 * will not fit, rather than emitting a truncated link that loses Patterns.
 *
 * `body` is always the READABLE text, whichever tier was used: it is what goes to the
 * clipboard, and a Contributor who has to paste must have something legible to paste.
 *
 * @returns {Promise<{url: string, body: string, truncated: boolean, compressed: boolean}>}
 */
export async function buildSubmission(patterns, { repo = REPO } = {}) {
  const title = buildIssueTitle(patterns);
  const body = buildIssueBody(patterns);
  const base = `https://github.com/${repo}/issues/new`;
  const link = (b) =>
    `${base}?title=${encodeURIComponent(title)}&labels=new-pattern` +
    (b === null ? '' : `&body=${encodeURIComponent(b)}`);

  const readable = link(body);
  if (readable.length <= MAX_URL_LENGTH) {
    return { url: readable, body, truncated: false, compressed: false };
  }

  const packed = link(buildCompressedBody(await compressBody(body), patterns.length));
  if (packed.length <= MAX_URL_LENGTH) {
    return { url: packed, body, truncated: false, compressed: true };
  }

  return { url: link(null), body, truncated: true, compressed: false };
}
