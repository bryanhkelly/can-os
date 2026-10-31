/** Independent document requirements for a noncredit extended-learning season.
 * These are distinct from operational Actions, which only request evidence.
 */
export const extendedSeasonApprovalCategories = [
  "extended_learning_safeguarding",
  "extended_learning_staffing",
  "extended_learning_emergency",
  "extended_learning_child_release",
] as const;

export type ExtendedSeasonApprovalCategory = typeof extendedSeasonApprovalCategories[number];
export const extendedSeasonApprovalLabels: Record<ExtendedSeasonApprovalCategory, string> = {
  extended_learning_safeguarding: "Safeguarding response and mandated reporting",
  extended_learning_staffing: "Screened and qualified onsite supervision",
  extended_learning_emergency: "Site emergency response procedures",
  extended_learning_child_release: "Authorized pickup and child release",
};

export type ExtendedSeasonDocument = {
  subjectType: string;
  subjectId: string;
  category: string;
  uploadedByPersonId: string;
  verifiedByPersonId: string | null;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  storageProvider: string;
  storageKey: string;
  sensitivityTier: string;
  metadata: Record<string, unknown>;
};

export type ExtendedSeasonApprovalScope = {
  seasonId: string;
  programId: string;
  siteId: string;
  organizationId: string;
  academicProviderOrganizationId: string;
};

/** Never infer safety clearance from season metadata, operator testimony or
 * an Action marked complete. A current, private, independently reviewed document
 * must be bound to this exact Season and the institution's active reviewer.
 */
export function isCurrentExtendedSeasonApproval(
  doc: ExtendedSeasonDocument | undefined,
  scope: ExtendedSeasonApprovalScope,
  eligibleReviewerIds: ReadonlySet<string>,
  now: Date,
  currentStaffingSignature: string,
): boolean {
  if (!doc || !extendedSeasonApprovalCategories.includes(doc.category as ExtendedSeasonApprovalCategory) ||
      doc.subjectType !== "activity_season" || doc.subjectId !== scope.seasonId ||
      doc.storageProvider !== "cloudflare_r2" || doc.sensitivityTier !== "restricted" ||
      !new RegExp(`^extended-learning/${scope.seasonId}/[0-9a-f-]{36}$`, "i").test(doc.storageKey) ||
      !doc.verifiedAt || doc.verifiedAt > now || !doc.expiresAt || doc.expiresAt <= now ||
      !doc.verifiedByPersonId || doc.verifiedByPersonId === doc.uploadedByPersonId ||
      !eligibleReviewerIds.has(doc.verifiedByPersonId) ||
      doc.metadata.reviewStatus !== "approved" || doc.metadata.storageVerified !== true ||
      doc.metadata.isCurrent !== true ||
      doc.metadata.seasonId !== scope.seasonId ||
      doc.metadata.programId !== scope.programId ||
      doc.metadata.siteId !== scope.siteId ||
      doc.metadata.organizationId !== scope.organizationId ||
      doc.metadata.academicProviderOrganizationId !== scope.academicProviderOrganizationId) return false;
  return doc.category !== "extended_learning_staffing" ||
    doc.metadata.staffingSignature === currentStaffingSignature;
}
