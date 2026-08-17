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

/** Conservative: browsers and servers both cap URLs well above this. */
export const MAX_URL_LENGTH = 6000;

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

export function buildIssueBody(patterns) {
  const blocks = patterns.map(
    (p) => `### Pattern: ${p.name}\n\n\`\`\`json\n${JSON.stringify(toSubmissionShape(p), null, 2)}\n\`\`\``
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
    : `New Patterns: ${patterns.length} submissions`;
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
