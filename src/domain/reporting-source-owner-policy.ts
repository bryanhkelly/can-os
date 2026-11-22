/** Canonical record ownership, independent of which Program requested a change. */
export type CanonicalReportingOwner = {
  siteId: string;
  organizationId?: string | null;
  programId?: string | null;
};
export type RequestedReportingScope = {
  organizationId: string;
  siteId: string;
  programId: string | null;
};
export function assertReportingSourceOwnerMatches(
  owner: CanonicalReportingOwner | null,
  requested: RequestedReportingScope,
): void {
  if (!owner || owner.siteId !== requested.siteId ||
      (owner.organizationId != null && owner.organizationId !== requested.organizationId) ||
      (owner.programId != null && owner.programId !== requested.programId)) {
    throw new Error("Reporting source ownership does not match canonical operating scope");
  }
}
