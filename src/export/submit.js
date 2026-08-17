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

/**
 * Build the submission.
 *
 * When the prefilled URL would exceed the length limit, fall back to a
 * title-and-label-only link plus the body for the clipboard, rather than
 * emitting a truncated link that silently loses Patterns (AC-13.1.3).
 *
 * @returns {{url: string, body: string, truncated: boolean}}
 */
export function buildSubmission(patterns, { repo = REPO } = {}) {
  const title = buildIssueTitle(patterns);
  const body = buildIssueBody(patterns);
  const base = `https://github.com/${repo}/issues/new`;

  const full = `${base}?title=${encodeURIComponent(title)}&labels=new-pattern&body=${encodeURIComponent(body)}`;
  if (full.length <= MAX_URL_LENGTH) return { url: full, body, truncated: false };

  return {
    url: `${base}?title=${encodeURIComponent(title)}&labels=new-pattern`,
    body,
    truncated: true,
  };
}
