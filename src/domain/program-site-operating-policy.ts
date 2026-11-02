import { AuthorizationError } from "./command-context";

/** Explicitly contracted services; never accept arbitrary client capability strings. */
export const operatingServices = [
  "academic_instruction", "curriculum", "school_of_record", "credit_issuance",
  "admissions", "academic_records", "onsite_supervision",
] as const;
export type OperatingService = (typeof operatingServices)[number];

/** The normal church-to-CAN classroom pathway uses more than the four
 * launch-opening services: admissions requires its own entitlement and
 * grading/transcript workflows need academic records. Do not silently
 * contract credit issuance for a noncredit Program.
 * Local staff permissions and safeguarding reviews remain separate.
 */
export function recommendedChurchOperatingServices(hasCreditIssuer:boolean): OperatingService[] {
  const essentials: OperatingService[] = [
    "academic_instruction", "curriculum", "school_of_record",
    "admissions", "academic_records", "onsite_supervision",
  ];
  if(hasCreditIssuer) essentials.push("credit_issuance");
  return essentials;
}

export type OperatingProgramIdentity = {
  programId: string;
  programOrganizationId: string;
  siteId: string | null;
  siteOrganizationId: string | null;
  hostOrganizationId: string;
  hostOrganizationType: string;
  institutionOrganizationId: string;
  institutionOrganizationType: string;
  creditIssuingOrganizationId: string | null;
};
export function assertChurchCANOperatingIdentity(value: OperatingProgramIdentity): void {
  if (!value.siteId || value.siteOrganizationId !== value.hostOrganizationId ||
      value.programOrganizationId !== value.hostOrganizationId ||
      value.hostOrganizationType !== "church" ||
      value.institutionOrganizationType !== "can_network" ||
      value.institutionOrganizationId === value.hostOrganizationId ||
      (value.creditIssuingOrganizationId !== null &&
       value.creditIssuingOrganizationId !== value.institutionOrganizationId))
    throw new AuthorizationError("independently hosted CAN Program and church-owned Site");
}
export function normalizeOperatingServices(values: readonly string[]): OperatingService[] {
  if (!values.length || values.length > operatingServices.length ||
      new Set(values).size !== values.length ||
      values.some(value => !operatingServices.includes(value as OperatingService)))
    throw new AuthorizationError("recognized and nonduplicate contracted services");
  return [...values].sort() as OperatingService[];
}
export type OperatingAgreementEvidence = {
  subjectType: string;
  subjectId: string;
  category: string;
  verifiedAt: Date | null;
  verifiedByPersonId: string | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
};

/** The externally reviewed document must identify BOTH independently signing parties,
 * the exact site and the authorized services. Its verification is not an access grant.
 */
export function assertOperatingAgreementEvidence(
  doc: OperatingAgreementEvidence | null | undefined,
  identity: OperatingProgramIdentity,
  services: readonly OperatingService[],
  requesterId: string,
  reviewerId: string,
  effectiveThrough: Date,
  at = new Date(),
): void {
  const meta: Record<string, unknown> = doc?.metadata ?? {};
  if (!doc || doc.subjectType !== "program" || doc.subjectId !== identity.programId ||
      doc.category !== "program_site_operating_agreement" ||
      !doc.verifiedAt || doc.verifiedAt > at ||
      !doc.verifiedByPersonId ||
      doc.verifiedByPersonId === requesterId ||
      doc.verifiedByPersonId === reviewerId ||
      (doc.expiresAt !== null && doc.expiresAt < effectiveThrough) ||
      meta.hostOrganizationId !== identity.hostOrganizationId ||
      meta.institutionOrganizationId !== identity.institutionOrganizationId ||
      meta.siteId !== identity.siteId ||
      (identity.creditIssuingOrganizationId !== null &&
        meta.creditIssuingOrganizationId !== identity.creditIssuingOrganizationId) ||
      meta.hostSignatureVerified !== true || meta.institutionSignatureVerified !== true ||
      !Array.isArray(meta.authorizedServices) ||
      !services.every(service => (meta.authorizedServices as string[]).includes(service)))
    throw new AuthorizationError("independently verified two-party operating agreement evidence");
}
export type ApprovedOperatingAuthorization = {
  status: string;
  programId: string;
  siteId: string;
  hostOrganizationId: string;
  institutionOrganizationId: string;
  services: OperatingService[];
  effectiveFrom: Date | null;
  effectiveThrough: Date | null;
  reviewedAt: Date | null;
  reviewedByPersonId: string | null;
  requestedByPersonId: string;
  revokedAt: Date | null;
};

export function assertCurrentOperatingAuthorization(
  row: ApprovedOperatingAuthorization,
  identity: OperatingProgramIdentity,
  required: readonly OperatingService[],
  at = new Date(),
): void {
  assertChurchCANOperatingIdentity(identity);
  // A helper called without an explicit service must never become a generic
  // cross-organization authorization token for an unrelated operation.
  normalizeOperatingServices(required);
  const contracted = normalizeOperatingServices(row.services);
  if (row.status !== "approved" || row.revokedAt !== null ||
      row.programId !== identity.programId || row.siteId !== identity.siteId ||
      row.hostOrganizationId !== identity.hostOrganizationId ||
      row.institutionOrganizationId !== identity.institutionOrganizationId ||
      !row.reviewedByPersonId || row.reviewedByPersonId === row.requestedByPersonId ||
      !row.reviewedAt || row.reviewedAt > at ||
      !row.effectiveFrom || row.effectiveFrom > at ||
      !row.effectiveThrough || row.effectiveThrough <= at ||
      required.some(service => !contracted.includes(service)))
    throw new AuthorizationError("current independently approved Program-Site service entitlement");
}
