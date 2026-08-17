/**
 * Schema migration. FR-005.
 *
 * Every store carries a `schemaVersion`. Reading a store at version n applies
 * every migration from n to current before the data reaches any other module,
 * so no consumer ever sees an old shape.
 *
 * Migrations UPGRADE; they never discard. A store whose version is newer than
 * this build understands is left untouched and surfaced as an error rather than
 * being downgraded and corrupted — losing authored work is a P0 defect, and a
 * user who opened the app on a newer device must not lose their library by
 * opening it on an older one.
 */

/**
 * Ordered upgrades, keyed by the version they migrate FROM.
 * Add `1: (data) => ...` here when the v1 shape first changes.
 */
const MIGRATIONS = {};

export const CURRENT_VERSION = 1;

export class FutureSchemaError extends Error {
  constructor(found, current) {
    super(
      `Stored data is at schema version ${found}, but this build understands ${current}. ` +
        'Refusing to downgrade — update the app rather than losing data.'
    );
    this.name = 'FutureSchemaError';
    this.found = found;
  }
}

export function migrate(data, current = CURRENT_VERSION) {
  if (data === null || data === undefined) return null;

  let version = data.schemaVersion;
  if (!Number.isInteger(version)) {
    throw new Error('Stored data has no schemaVersion; refusing to guess its shape.');
  }
  if (version > current) throw new FutureSchemaError(version, current);

  let out = data;
  while (version < current) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from schema version ${version} to ${version + 1}`);
    out = step(out);
    version += 1;
    out = { ...out, schemaVersion: version };
  }
  return out;
}
