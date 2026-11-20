/**
 * Preserve the existing canonical Site mutation boundaries while offering one Save action.
 * Each operation must receive the exact revision returned by its predecessor.
 * A failure is never retried: the caller must reload and reconcile partial writes.
 */
export class SiteProfileSaveError extends Error {
  constructor(readonly completed: number, readonly originalError: unknown) {
    super(originalError instanceof Error ? originalError.message : "Site Profile save failed.");
    this.name = "SiteProfileSaveError";
  }
}

export async function saveSiteProfileSequentially(
  initialRevision: string,
  operations: ReadonlyArray<(expectedRevision: string) => Promise<{ revision: string }>>,
): Promise<string> {
  let revision = initialRevision;
  let completed = 0;
  for (const operation of operations) {
    try {
      const result = await operation(revision);
      if (typeof result.revision !== "string" || !result.revision) {
        throw new Error("Site update returned no revision. Reload before retrying.");
      }
      revision = result.revision;
      completed += 1;
    } catch (cause) {
      throw new SiteProfileSaveError(completed, cause);
    }
  }
  return revision;
}
