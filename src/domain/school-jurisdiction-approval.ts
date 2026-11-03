/** No generic Action resolution is a legal approval. Only the independently
 * authorized C command writes this exact attestation for a canonical scope. */
export type SchoolJurisdictionReviewAction = {
  status: string;
  metadata: Record<string, unknown>;
};

export type SchoolJurisdictionReviewStamp = {
  scopeFingerprint: string;
  profileVersionId: string;
};

export function hasCurrentIndependentJurisdictionReview(
  action: SchoolJurisdictionReviewAction | null,
  scope: SchoolJurisdictionReviewStamp,
  now = new Date(),
): boolean {
  if (!action || action.status !== "resolved") return false;
  const m = action.metadata;
  const reviewedAt = typeof m.reviewedAt === "string" ? Date.parse(m.reviewedAt) : NaN;
  return m.reviewState === "independently_verified" &&
    m.scopeFingerprint === scope.scopeFingerprint &&
    m.profileVersionId === scope.profileVersionId &&
    typeof m.reviewedByPersonId === "string" && m.reviewedByPersonId.length > 0 &&
    typeof m.requesterPersonId === "string" &&
    m.requesterPersonId !== m.reviewedByPersonId &&
    typeof m.reviewNote === "string" && m.reviewNote.trim().length >= 25 &&
    Array.isArray(m.reviewedSourceUrls) && m.reviewedSourceUrls.length > 0 &&
    m.reviewedSourceUrls.every(url => typeof url === "string" && url.startsWith("https://")) &&
    Number.isFinite(reviewedAt) && reviewedAt <= now.getTime();
}

/** A pending Site address change remains a hard legal-review blocker, regardless
 * of whether another screen has marked an Action complete. */
export function isSiteLocationChangePending(
  action: SchoolJurisdictionReviewAction | null,
  scope: SchoolJurisdictionReviewStamp,
  now = new Date(),
): boolean {
  if (!action) return false;
  return !hasCurrentIndependentJurisdictionReview(action,scope,now);
}

/** Opening evidence is specific to the configured premises. Even after
 * independent legal re-review, a previous opening approval cannot be reused
 * if it predates the Site's recorded physical-address amendment. */
export function openingApprovalPredatesLocationChange(
  approvedAt: Date | string | null,
  locationChangeRevision: Date | string | null,
): boolean {
  if (!locationChangeRevision) return false;
  const approved = approvedAt ? new Date(approvedAt).getTime() : NaN;
  const changed = new Date(locationChangeRevision).getTime();
  return !Number.isFinite(approved) || !Number.isFinite(changed) || approved < changed;
}

/** A source-reviewed renewal date is a legal review deadline, not an
 * automatic grant of authority. Evidence predating an elapsed renewal date
 * must be independently reviewed again. Dates are compared as days because
 * the underlying policy records supply dates, not authoritative hours. */
export function isJurisdictionRequirementRenewalCurrent(
  metadata:Record<string,unknown>,now=new Date(),
):boolean {
  const deadline=metadata.renewalDeadline;
  if(deadline===null||deadline===undefined)return true;
  if(typeof deadline!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(deadline))
    return false;
  const parsed=new Date(deadline+"T00:00:00Z");
  if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==deadline)
    return false;
  if(now.toISOString().slice(0,10)<=deadline)return true;
  const reviewed=metadata.reviewedAt;
  return typeof reviewed==="string" &&
    Number.isFinite(Date.parse(reviewed)) &&
    new Date(reviewed).toISOString().slice(0,10)>deadline;
}

/** A normal Action resolution is never legal evidence. Require the current
 * verified document and independently recorded C-domain attestation. */
export function hasCurrentJurisdictionRequirementEvidence(
  action: SchoolJurisdictionReviewAction | null,
  scope:SchoolJurisdictionReviewStamp & {requirementId:string},
  now=new Date(),
):boolean {
  if(!action || action.status!=="resolved")return false;
  const m=action.metadata;
  const reviewedAt=typeof m.reviewedAt==="string"?Date.parse(m.reviewedAt):NaN;
  return m.reviewState==="independently_verified_documentation" &&
    m.requirementId===scope.requirementId &&
    m.profileVersionId===scope.profileVersionId &&
    m.scopeFingerprint===scope.scopeFingerprint &&
    typeof m.evidenceDocumentId==="string" && m.evidenceDocumentId.length>0 &&
    typeof m.reviewedByPersonId==="string" && m.reviewedByPersonId.length>0 &&
    typeof m.submittedByPersonId==="string" &&
    m.submittedByPersonId!==m.reviewedByPersonId &&
    isJurisdictionRequirementRenewalCurrent(m,now) &&
    Number.isFinite(reviewedAt) && reviewedAt<=now.getTime();
}
