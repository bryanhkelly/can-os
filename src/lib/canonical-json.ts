/**
 * Deterministic JSON for revision comparisons and content fingerprints.
 * Object keys are sorted recursively; array order stays meaningful.
 * Preserve JSON.stringify semantics for unsupported values.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry);
}
