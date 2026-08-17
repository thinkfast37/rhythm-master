/**
 * Reading a submitted Pattern back out of a GitHub issue.
 *
 * This deliberately imports the app's own `export/submit.js` rather than
 * reimplementing the format. Two implementations of one wire format is two
 * chances to drift, and the failure mode is the worst kind available here — a
 * Contributor's Pattern that arrives and cannot be read back at all.
 *
 * (spec-trace is dependency-free because it is meant to be copied into other
 * projects. This skill is the opposite: it exists to serve THIS app's format,
 * so coupling to it is the point.)
 */
import { readSubmittedPatterns, readSubmissionBody } from '../../../../src/export/submit.js';

export { readSubmittedPatterns, readSubmissionBody };

/**
 * Every Pattern in an issue, with the issue's own identifying details attached.
 *
 * @param {{number: number, title: string, body: string, author?: {login: string}, url?: string}} issue
 */
export async function patternsFromIssue(issue) {
  let patterns;
  try {
    patterns = await readSubmittedPatterns(issue.body ?? '');
  } catch (err) {
    throw new Error(`Issue #${issue.number}: could not decode the submission — ${err.message}`);
  }
  if (patterns.length === 0) {
    throw new Error(
      `Issue #${issue.number}: no Pattern found. Expected a \`\`\`json block, or a compressed ` +
        '```rhythm-master block. It may have been typed by hand rather than submitted by the app.'
    );
  }
  return patterns.map((pattern) => ({
    pattern,
    issue: issue.number,
    author: issue.author?.login ?? 'unknown',
    url: issue.url ?? null,
  }));
}
