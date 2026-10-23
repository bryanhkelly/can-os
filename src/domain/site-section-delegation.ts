import { AuthorizationError } from "./command-context";

/** Stable, non-global key on the existing program_responsibility_assignments ledger. */
export function sectionFacilitatorKey(sectionId: string, personId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sectionId) || !/^[0-9a-f-]{36}$/i.test(personId))
    throw new AuthorizationError("canonical Section and Person IDs");
  return `room_facilitator:${sectionId.toLowerCase()}:${personId.toLowerCase()}`;
}

export function isEffectiveSectionFacilitator(input: {
  sectionId: string; personId: string; roleKey: string;
  responsiblePersonId: string | null; grantPersonId: string;
  grantSiteId: string | null; siteId: string;
  grantOrganizationId: string | null; organizationId: string;
  accountVerified: boolean; accountActive: boolean; personActive: boolean;
  effectiveFrom: Date | null; effectiveThrough: Date | null;
}, now: Date = new Date()): boolean {
  return input.roleKey === "room_facilitator" &&
    input.personId === input.responsiblePersonId &&
    input.grantPersonId === input.personId &&
    input.grantSiteId === input.siteId &&
    input.grantOrganizationId === input.organizationId &&
    input.accountVerified && input.accountActive && input.personActive &&
    !!input.effectiveFrom && input.effectiveFrom <= now &&
    !!input.effectiveThrough && input.effectiveThrough > now;
}
