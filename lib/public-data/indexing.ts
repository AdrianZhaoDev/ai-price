/**
 * Search-indexing gate for the two public directories.
 *
 * Development and test builds may render deterministic fixtures, but a
 * production deployment must opt in only after the public snapshot migration
 * and first healthy generation have been verified.  Keeping this gate in one
 * place prevents an empty/degraded directory from entering the sitemap or
 * advertising itself as indexable.
 */
export function isPublicDirectoryIndexingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicit = env.PUBLIC_DATA_INDEXING_ENABLED?.trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return env.NODE_ENV !== "production";
}
