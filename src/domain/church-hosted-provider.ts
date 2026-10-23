import type { ProgramCreditMode, ProgramType } from "./program-offerings";

/**
 * Validates the stated church/CAN institutional split at program creation.
 * This is NOT evidence of an agreement, accreditation, school-of-record authority
 * or cross-organization access. Those require separately verified records/grants.
 */
export function assertChurchHostedProviderIntent(input: {
  programType: ProgramType;
  hostOrganizationId: string;
  hostOrganizationType: string;
  academicProviderOrganizationId: string;
  academicProviderOrganizationType: string;
  creditIssuingOrganizationId: string | null;
  creditMode: ProgramCreditMode;
}): void {
  if (input.programType !== "church_hosted_academy" || input.hostOrganizationType !== "church") return;
  // Preserve a same-organization school operation: no independent CAN claim.
  if (input.academicProviderOrganizationId === input.hostOrganizationId) return;
  if (input.academicProviderOrganizationType !== "can_network") {
    throw new Error("A separate provider for a church-hosted CAN academy must be a CAN network organization");
  }
  if (input.creditMode !== "credit_bearing" ||
      input.creditIssuingOrganizationId !== input.academicProviderOrganizationId) {
    throw new Error("Church-hosted CAN instruction must designate the same CAN institution as credit issuer");
  }
}

/**
 * Selecting a CAN provider is launch intent, not authority to operate.
 * The caller must load and independently verify the Program-Site authorization
 * against its approved agreement and expiry before supplying an identifier.
 */
export function assertChurchHostedActivationAuthorization(input: {
  programType: ProgramType;
  hostOrganizationId: string;
  academicProviderOrganizationId: string;
  verifiedProgramSiteAuthorizationId: string | null;
}): void {
  if (input.programType === "church_hosted_academy" &&
      input.academicProviderOrganizationId !== input.hostOrganizationId &&
      !input.verifiedProgramSiteAuthorizationId) {
    throw new Error("Church-hosted CAN Academy activation requires independently verified Program-Site institutional authorization");
  }
}
