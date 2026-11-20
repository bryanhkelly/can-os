/** Published Blueprint components are CAN-owned, version-pinned recipes.
 * Site clients may receive only a narrow public-facing planning projection.
 * Never expose the raw componentSpec or internal authoring metadata. */
export interface PublicSolutionComponentDescription {
  description: string | null;
  requiresIndependentReview: boolean;
}

export function publicSolutionComponentDescription(spec: unknown): PublicSolutionComponentDescription {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { description: null, requiresIndependentReview: false };
  }
  const fields = spec as Record<string, unknown>;
  const raw = fields.description;
  return {
    description: typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 500) : null,
    // False does not grant Site, publication, or enrollment authorization.
    requiresIndependentReview: fields.requiresIndependentReview === true,
  };
}
