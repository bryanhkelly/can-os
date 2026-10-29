import { AuthorizationError } from "./command-context";

/** Applications may carry an intended year, but offers may never move them to
 * another year. Legacy applications without this metadata retain the existing
 * registrar-selected offer behavior. */
export function familyApplicationSchoolYearId(metadata: Record<string, unknown>): string | undefined {
  const value = metadata.schoolYearId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function assertFamilyApplicationOfferYear(
  metadata: Record<string, unknown>, schoolYearId: string,
): void {
  const intended = familyApplicationSchoolYearId(metadata);
  if (intended && intended !== schoolYearId) {
    throw new Error("Offer school year must match the family's application");
  }
}

export function schoolYearMatchesFamilyProgram(
  year: {
    id: string;
    organizationId: string;
    siteId: string;
    programId: string | null;
    status: string;
  } | null | undefined,
  program: { id: string; organizationId: string; siteId: string | null },
): boolean {
  return !!year && !!program.siteId && year.status === "active" &&
    year.organizationId === program.organizationId && year.siteId === program.siteId &&
    (year.programId === null || year.programId === program.id);
}

/** Verified email/account resolution is not enough to reuse a child identity.
 * The exact managing relationship and a Household shared by adult and child
 * are both required. No name/email match can substitute for these checks. */
export function assertVerifiedFamilyStudentReuse(input: {
  relationship: { verification: unknown; canManageEnrollment: boolean } | null | undefined;
  adultHouseholdMember: boolean;
  studentHouseholdMember: boolean;
}): void {
  if (input.relationship?.verification !== "verified" ||
      !input.relationship.canManageEnrollment) {
    throw new AuthorizationError("verified managing guardian relationship required to reuse student");
  }
  if (!input.adultHouseholdMember || !input.studentHouseholdMember) {
    throw new AuthorizationError("student and guardian must share the selected household");
  }
}

export function assertFamilyApplicationRetry(input: {
  application: {
    studentProfileId: string;
    metadata: Record<string, unknown>;
  };
  studentProfileId?: string;
  schoolYearId?: string;
  familyStartRequestId?: string;
}): void {
  const { application } = input;
  if (input.studentProfileId && application.studentProfileId !== input.studentProfileId) {
    throw new Error("Application request key was reused for another student");
  }
  if ((familyApplicationSchoolYearId(application.metadata) ?? null) !== (input.schoolYearId ?? null)) {
    throw new Error("Application request key was reused for another school year");
  }
  if ((application.metadata.publicFamilyStartRequestId ?? null) !== (input.familyStartRequestId ?? null)) {
    throw new Error("Application request key was reused for another family start");
  }
}
