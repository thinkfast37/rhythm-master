/**
 * Which issues are submissions — and why that cannot be the label alone.
 *
 * The app asks for the `new-pattern` label in the issue URL (AC-13.1.1/1), and
 * GitHub applies it only if the label already exists in the repo. If it does not,
 * GitHub does not create it and does not complain: it drops the parameter and the
 * issue lands bare. That is exactly what happened to #32 — a correct submission,
 * invisible to a label-only query, with nothing anywhere reporting a problem.
 *
 * So selection is belt and braces: the label finds submissions, and the title
 * shape catches the ones GitHub stripped. The title is a weaker signal, so an
 * issue reached that way is reported as unlabelled rather than quietly folded in
 * — a maintainer should see that the repo is misconfigured, not just the Pattern.
 */

export const SUBMISSION_LABEL = 'new-pattern';

/**
 * The title shapes `buildIssueTitle` produces, as matchers.
 *
 * These are a second expression of a format `src/export/submit.js` owns, which is
 * the one thing this skill otherwise refuses to do (SKILL.md). It is unavoidable:
 * a title cannot be un-built, since a Pattern name is arbitrary text. The drift is
 * guarded by a test asserting these match real `buildIssueTitle` output for both
 * the single and bulk forms, so a change to the titles fails here rather than
 * silently narrowing what intake can see.
 */
const TITLE_SHAPES = [/^New Pattern: .+/, /^Bulk Pattern Submission \(\d+ patterns?\)$/];

export const looksLikeSubmission = (title) => TITLE_SHAPES.some((re) => re.test(title ?? ''));

/** Does this issue actually carry the label, per the issue itself? */
export const isLabelled = (issue) =>
  (issue.labels ?? []).some((l) => (typeof l === 'string' ? l : l.name) === SUBMISSION_LABEL);

/**
 * Merge the two queries into one list, in issue order. Deduplicated by number,
 * because an issue carrying the label AND the title shape is returned by both.
 *
 * `unlabelled` is read off the issue's own labels, NOT off which query returned it.
 * `gh issue list --label` is served by GitHub's search index, which lags behind the
 * issue: strip a label and the query keeps returning that issue for a while. Trusting
 * the query would report a bare issue as labelled and hide the misconfiguration this
 * whole fallback exists to surface.
 */
export function mergeSubmissions(labelled, candidates) {
  const byNumber = new Map();
  for (const issue of [...labelled, ...candidates]) {
    if (byNumber.has(issue.number)) continue;
    if (!isLabelled(issue) && !looksLikeSubmission(issue.title)) continue;
    byNumber.set(issue.number, { ...issue, unlabelled: !isLabelled(issue) });
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}
