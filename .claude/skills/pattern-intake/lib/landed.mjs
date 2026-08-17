/**
 * Has this submission actually shipped? — and only then, saying so on the issue.
 *
 * Closing an issue is the one thing here that reaches a Contributor, so the claim
 * it makes has to be true when it is made. "Accepted" is not "shipped": `accept`
 * leaves an uncommitted seed file, and between that and the deploy going green sit
 * a PR and eight gates, any of which can send the change back. An issue closed
 * against a change that then failed a gate is a Contributor told their Pattern is
 * in the library when it is not, and nothing would ever correct it.
 *
 * So the evidence is the shipped library on the default branch, never the working
 * tree — and the ids reported are read out of that file rather than predicted.
 */

const normalise = (name) => name.trim().toLowerCase();

/** The id a Pattern at this position in the seed file has. Mirrors storage/seed.js. */
const idAt = (index) => `s_${index + 1}`;

/**
 * Where each submitted Pattern ended up in the shipped library, by name.
 *
 * Case-insensitive and space-trimmed, the same rule `findNameClash` applies —
 * a maintainer who tidied the name at accept time has still shipped the Pattern,
 * and a rename is safe precisely because ids, not names, are what
 * `rm.overlays.v1` keys by.
 *
 * @param {Array<{name: string}>} submitted  the Patterns the issue carries
 * @param {Array<{name: string}>} shipped    the seed file's Patterns, in order
 * @returns {{found: Array<{name: string, id: string}>, missing: string[]}}
 */
export function locateInLibrary(submitted, shipped) {
  const byName = new Map();
  shipped.forEach((p, i) => {
    const key = normalise(p.name);
    if (!byName.has(key)) byName.set(key, idAt(i));
  });

  const found = [];
  const missing = [];
  for (const p of submitted) {
    const id = byName.get(normalise(p.name));
    if (id) found.push({ name: p.name, id });
    else missing.push(p.name);
  }
  return { found, missing };
}

/**
 * What gets posted on the issue. Names the id, because that is the durable handle
 * on the Pattern — the name can be tidied later, the id cannot change without
 * orphaning every rating and added Tag that keys off it.
 */
export function closingComment(found) {
  const lines =
    found.length === 1
      ? [`Merged — "${found[0].name}" now ships with the app as \`${found[0].id}\`.`]
      : [
          `Merged — ${found.length} Patterns now ship with the app:`,
          '',
          ...found.map((f) => `- "${f.name}" as \`${f.id}\``),
        ];
  return [...lines, '', 'Thank you for the submission.'].join('\n');
}
