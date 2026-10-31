/** Church onboarding authority evidence is never a self-attestation. */
export type ChurchAuthorityMethod = "signed_authority" | "denominational_confirmation" | "independent_church_confirmation";
export const CHURCH_AUTHORITY_METHODS: readonly ChurchAuthorityMethod[] = [
  "signed_authority", "denominational_confirmation", "independent_church_confirmation",
];
export const CHURCH_EVIDENCE_VALID_DAYS = 90;

export function validateChurchEvidenceReference(reference: string, method: string): string {
  const trimmed = reference.trim();
  if (!CHURCH_AUTHORITY_METHODS.includes(method as ChurchAuthorityMethod) ||
      trimmed.length < 8 || trimmed.length > 500 ||
      /[\u0000-\u001f\u007f]/.test(trimmed) ||
      /^(?:javascript|data|file|blob):/i.test(trimmed)) {
    throw new Error("A valid independent authority evidence reference and method are required");
  }
  // A URL is a pointer, not proof of authority. Never allow untrusted schemes.
  if (/^vault:[a-z0-9][a-z0-9/_-]{6,}$/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    let parsed: URL;
    try { parsed = new URL(trimmed); }
    catch { throw new Error("Invalid evidence URL"); }
    if (parsed.protocol !== "https:" || !parsed.hostname.includes(".") ||
        parsed.username || parsed.password)
      throw new Error("Evidence URLs must use HTTPS without embedded credentials");
  }
  return trimmed;
}

export function evidenceExpiresAt(verifiedAt: Date): Date {
  return new Date(verifiedAt.getTime() + CHURCH_EVIDENCE_VALID_DAYS * 86400000);
}

export function currentChurchAuthorityEvidence(
  evidence: {
    category: string;
    verifiedAt: Date | null;
    verifiedByPersonId: string | null;
    expiresAt: Date | null;
    metadata: Record<string, unknown>;
  } | null | undefined,
  request: {
    id: string;
    churchSlug: string;
    contactEmail: string;
    verifiedByPersonId: string | null;
  },
  approverPersonId: string | null,
  now = new Date(),
): boolean {
  return Boolean(evidence &&
    evidence.category === "church_onboarding_authority" &&
    evidence.verifiedAt && evidence.verifiedAt <= now &&
    evidence.verifiedByPersonId && evidence.verifiedByPersonId === request.verifiedByPersonId &&
    evidence.verifiedByPersonId !== approverPersonId &&
    evidence.expiresAt && evidence.expiresAt > now &&
    evidence.metadata.churchRequestId === request.id &&
    evidence.metadata.churchSlug === request.churchSlug &&
    evidence.metadata.authorizedEmailNormalized === request.contactEmail);
}
