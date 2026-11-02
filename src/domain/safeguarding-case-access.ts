import type { AccessContext } from "@/domain/access-context";
import {
  assertCapability,
  assertOrganizationScope,
  assertProgramScope,
  assertSiteScope,
  AuthorizationError,
} from "@/domain/command-context";
import { assertOnsiteSafeguardingSubmissionScope } from "@/domain/site-safeguarding-access";

export const safeguardingResponderRoles = ["safeguarding_responder", "safeguarding_lead"] as const;

export type SafeguardingCaseResource = {
  id: string;
  type: string;
  classification: string;
  reporterPersonId: string;
  organizationId: string | null;
  siteId: string;
  programId: string | null;
};

export type SafeguardingAssignmentRelationship = {
  personId: string;
  responsibility: string;
  revokedAt: Date | null;
};

export function isSafeguardingResponderRole(role: string): boolean {
  return (safeguardingResponderRoles as readonly string[]).includes(role);
}

function assertRestrictedSafeguardingIncident(resource: SafeguardingCaseResource): void {
  if (resource.type !== "safeguarding_concern" ||
      resource.classification !== "safeguarding_restricted") {
    throw new AuthorizationError("safeguarding restricted incident resource");
  }
}

/** Full case access requires every layer: capability, resource, scope and active assignment. */
export function assertSafeguardingCaseAccess(
  actor: AccessContext,
  resource: SafeguardingCaseResource,
  assignment: SafeguardingAssignmentRelationship | null | undefined,
  capability = "safeguarding.case.read",
): void {
  assertCapability(actor, capability);
  if (!isSafeguardingResponderRole(actor.role) || !actor.actorPersonId ||
      !assignment || assignment.personId !== actor.actorPersonId || assignment.revokedAt) {
    throw new AuthorizationError("active named safeguarding case assignment");
  }
  assertRestrictedSafeguardingIncident(resource);
  if (!resource.organizationId) throw new AuthorizationError("safeguarding organization scope");
  assertOrganizationScope(actor, resource.organizationId);
  assertSiteScope(actor, resource.siteId);
  assertProgramScope(actor, resource.programId);
}

/** Reporters receive only their own receipt projection, never the full case. */
export function assertSafeguardingReporterRelationship(
  actor: AccessContext,
  resource: SafeguardingCaseResource,
): void {
  assertOnsiteSafeguardingSubmissionScope(actor, resource.siteId);
  assertRestrictedSafeguardingIncident(resource);
  if (resource.reporterPersonId !== actor.actorPersonId) {
    throw new AuthorizationError("own safeguarding report");
  }
  if (!resource.organizationId) throw new AuthorizationError("safeguarding organization scope");
  assertOrganizationScope(actor, resource.organizationId);
  assertProgramScope(actor, resource.programId);
}

export function assertSafeguardingConfigurationScope(
  actor: AccessContext,
  organizationId: string,
  siteId: string,
): void {
  assertCapability(actor, "safeguarding.policy.manage");
  if (!actor.actorPersonId || !["registrar", "safeguarding_lead"].includes(actor.role)) {
    throw new AuthorizationError("safeguarding operational policy manager");
  }
  assertOrganizationScope(actor, organizationId);
  assertSiteScope(actor, siteId);
}
